import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function walk(directory, predicate) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(relative, predicate));
    else if (predicate(relative)) result.push(relative);
  }
  return result;
}

const markdownFiles = [
  'README.md',
  ...walk('docs', (file) => file.endsWith('.md')),
  ...walk('backend', (file) => file.endsWith('.md'))
];

function headingAnchors(content) {
  const anchors = new Set();
  const seen = new Map();
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/)?.[1];
    if (!heading) continue;
    const base = heading.toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*_~]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

for (const file of markdownFiles) {
  const content = read(file);
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, '');
    if (!target || target.startsWith('#') || /^(https?:|mailto:)/.test(target)) continue;
    const [pathPart, fragment] = target.split('#');
    const localPath = decodeURIComponent(pathPart);
    if (!localPath) continue;
    const resolved = path.resolve(root, path.dirname(file), localPath);
    if (!fs.existsSync(resolved)) {
      failures.push(`${file}: broken local link ${target}`);
    } else if (fragment && resolved.endsWith('.md')) {
      const anchors = headingAnchors(fs.readFileSync(resolved, 'utf8'));
      if (!anchors.has(decodeURIComponent(fragment).toLowerCase())) failures.push(`${file}: broken heading link ${target}`);
    }
  }
}

const appSource = read('backend/app.ts');
const mounts = new Map();
for (const match of appSource.matchAll(/app\.use\('([^']+)',\s*([A-Za-z0-9_]+)\)/g)) {
  mounts.set(match[2], match[1]);
}
const importFiles = new Map();
for (const match of appSource.matchAll(/import\s+([A-Za-z0-9_]+)\s*=\s*require\('\.\/routes\/([^']+)'\)/g)) {
  importFiles.set(match[1], `backend/routes/${match[2]}.ts`);
}
const apiReference = read('docs/api-reference.md');
for (const [variable, mount] of mounts) {
  const routeFile = importFiles.get(variable);
  if (!routeFile || mount === '/health') continue;
  const source = read(routeFile);
  for (const match of source.matchAll(/router\.(?:get|post|put|patch|delete)\('([^']*)'/g)) {
    const suffix = match[1] === '/' ? '' : match[1];
    const endpoint = `${mount}${suffix}`;
    if (!apiReference.includes(endpoint)) failures.push(`docs/api-reference.md: undocumented route ${endpoint}`);
  }
}
if (!apiReference.includes('/health')) failures.push('docs/api-reference.md: undocumented route /health');

const sourceFiles = [
  ...walk('backend', (file) => file.endsWith('.ts')),
  ...walk('frontend', (file) => /\.(?:ts|tsx|mjs)$/.test(file))
];
const usedEnv = new Set();
for (const file of sourceFiles) {
  for (const match of read(file).matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])/g)) {
    usedEnv.add(match[1] || match[2]);
  }
}
const exampleEnv = new Set(
  read('.env.example').split(/\r?\n/).map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]).filter(Boolean)
);
const exampleEnvKeys = read('.env.example').split(/\r?\n/)
  .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]).filter(Boolean);
for (const key of new Set(exampleEnvKeys)) {
  if (exampleEnvKeys.filter((candidate) => candidate === key).length > 1) failures.push(`.env.example: duplicate key ${key}`);
}
const implicitOrLegacyEnv = new Set([
  'VERCEL', 'SESSION_SECRET', 'SODEX_KEY_NAME', 'SODEX_KEY_PROVIDER', 'SODEX_PRIVATE_KEY',
  'SODEX_WALLET_ADDRESS', 'SUPABASE_ANON_KEY'
]);
for (const key of usedEnv) {
  if (!exampleEnv.has(key) && !implicitOrLegacyEnv.has(key)) failures.push(`.env.example: missing active key ${key}`);
}

const packageJson = JSON.parse(read('package.json'));
for (const match of read('README.md').matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
  if (!packageJson.scripts?.[match[1]]) failures.push(`README.md: npm script does not exist: ${match[1]}`);
}

const requiredDocs = [
  'docs/api-reference.md', 'docs/api-and-eip712-integration-notes.md', 'docs/base-schema.sql',
  'docs/narrative-v2-schema.sql', 'docs/wave3-schema.sql', 'docs/production-hardening-schema.sql',
  'backend/services/SKILLMINT_INTEGRATION.md', 'backend/skills/technical-graph-analysis/SKILL.md',
  'backend/skills/technical-graph-analysis/references/indicator-rules.md'
];
const docsIndex = read('docs/README.md');
for (const file of requiredDocs) {
  const relative = path.relative('docs', file).replaceAll(path.sep, '/');
  if (!docsIndex.includes(relative)) failures.push(`docs/README.md: missing inventory entry for ${file}`);
}

const schemaFiles = [
  'docs/base-schema.sql', 'docs/narrative-v2-schema.sql',
  'docs/wave3-schema.sql', 'docs/production-hardening-schema.sql'
];
const schema = schemaFiles.map(read).join('\n');
const createdTables = new Set([...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi)].map((match) => match[1]));
const referencedTables = new Set();
for (const file of walk('backend', (candidate) => candidate.endsWith('.ts'))) {
  const source = read(file);
  for (const match of source.matchAll(/\.from\(['"]([a-z_]+)['"]\)/g)) referencedTables.add(match[1]);
  for (const match of source.matchAll(/(?:safeInsert|safeSelect|safeUpdate|safeCount)\s*(?:<[^;()]*?>)?\s*\(['"]([a-z_]+)['"]/g)) {
    referencedTables.add(match[1]);
  }
}
for (const table of referencedTables) {
  if (!createdTables.has(table)) failures.push(`docs schema: backend references table without CREATE TABLE: ${table}`);
}

if (failures.length) {
  console.error(`Documentation check failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Documentation check passed: ${markdownFiles.length} Markdown files, ${mounts.size} route mounts, ${usedEnv.size} environment keys, ${createdTables.size} schema tables.`);
