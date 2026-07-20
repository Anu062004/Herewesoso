import crypto from 'crypto';

import supabaseService = require('./supabase');

export type StrategyRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type StrategyStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface StrategyRow {
  id: string;
  owner_address: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  risk_level: StrategyRiskLevel;
  supported_exchanges: string[];
  configuration_schema: Record<string, unknown>;
  execution_template: Record<string, unknown>;
  status: StrategyStatus;
  current_version: number;
  install_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

interface StrategyVersionRow {
  id: string;
  strategy_id: string;
  version: number;
  content_hash: string;
  manifest: Record<string, unknown>;
  created_at: string;
}

interface InstallationRow {
  id: string;
  strategy_id: string;
  wallet_address: string;
  version: number;
  configuration: Record<string, unknown>;
  enabled: boolean;
  installed_at: string;
  updated_at: string;
}

interface ReviewRow {
  id: string;
  strategy_id: string;
  wallet_address: string;
  rating: number;
  review: string;
  created_at: string;
  updated_at: string;
}

interface ClaimRow {
  id: string;
  strategy_id: string;
  owner_address: string;
  period_start: string;
  period_end: string;
  sample_size: number;
  metrics: Record<string, unknown>;
  evidence_hash: string;
  verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  created_at: string;
}

const strategies: StrategyRow[] = [];
const versions: StrategyVersionRow[] = [];
const installations: InstallationRow[] = [];
const reviews: ReviewRow[] = [];
const claims: ClaimRow[] = [];
const { isSupabaseConfigured, strictInsert, strictSelect, strictUpdate, supabase } = supabaseService;

function now() { return new Date().toISOString(); }
function wallet(value: string) { return value.toLowerCase(); }

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, field: string, min: number, max: number): string {
  const parsed = typeof value === 'string' ? value.trim() : '';
  if (parsed.length < min || parsed.length > max) throw new Error(`${field} must contain ${min} to ${max} characters.`);
  return parsed;
}

function slug(value: unknown): string {
  const parsed = text(value, 'Slug', 3, 64).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parsed)) throw new Error('Slug may contain lowercase letters, numbers, and single hyphens.');
  return parsed;
}

function exchanges(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('At least one supported exchange is required.');
  const allowed = new Set(['sodex', 'binance', 'bybit', 'okx', 'onchain']);
  const result = [...new Set(value.map((entry) => String(entry).toLowerCase()).filter((entry) => allowed.has(entry)))];
  if (result.length === 0) throw new Error('At least one supported exchange is required.');
  return result;
}

function riskLevel(value: unknown): StrategyRiskLevel {
  const parsed = String(value || '').toUpperCase();
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(parsed)) throw new Error('Risk level must be LOW, MEDIUM, or HIGH.');
  return parsed as StrategyRiskLevel;
}

function manifest(row: StrategyRow) {
  return {
    name: row.name,
    summary: row.summary,
    description: row.description,
    category: row.category,
    riskLevel: row.risk_level,
    supportedExchanges: row.supported_exchanges,
    configurationSchema: row.configuration_schema,
    executionTemplate: row.execution_template
  };
}

function contentHash(value: Record<string, unknown>): string {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

async function allStrategies(): Promise<StrategyRow[]> {
  if (isSupabaseConfigured) return strictSelect<StrategyRow>('strategies');
  return strategies;
}

async function findStrategy(idOrSlug: string): Promise<StrategyRow | null> {
  const validIdentifier = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrSlug)
    || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(idOrSlug);
  if (!validIdentifier) return null;
  if (isSupabaseConfigured) {
    const rows = await strictSelect<StrategyRow>('strategies', (query: any) =>
      query.or(`id.eq.${idOrSlug},slug.eq.${idOrSlug}`).limit(1)
    );
    return rows[0] || null;
  }
  return strategies.find((row) => row.id === idOrSlug || row.slug === idOrSlug) || null;
}

async function updateStrategy(id: string, values: Partial<StrategyRow>): Promise<StrategyRow> {
  if (isSupabaseConfigured) {
    const rows = await strictUpdate('strategies', values, { id });
    if (!rows[0]) throw new Error('Strategy was not found.');
    return rows[0] as unknown as StrategyRow;
  }
  const row = strategies.find((entry) => entry.id === id);
  if (!row) throw new Error('Strategy was not found.');
  Object.assign(row, values);
  return row;
}

async function strategyReviews(strategyId: string): Promise<ReviewRow[]> {
  if (isSupabaseConfigured) return strictSelect<ReviewRow>('strategy_reviews', (query: any) => query.eq('strategy_id', strategyId));
  return reviews.filter((row) => row.strategy_id === strategyId);
}

async function strategyClaims(strategyId: string, ownerAddress?: string): Promise<ClaimRow[]> {
  if (isSupabaseConfigured) return strictSelect<ClaimRow>('strategy_performance_claims', (query: any) => {
    let next = query.eq('strategy_id', strategyId);
    if (!ownerAddress) next = next.eq('verification_status', 'VERIFIED');
    return next.order('created_at', { ascending: false });
  });
  return claims.filter((row) => row.strategy_id === strategyId && (ownerAddress || row.verification_status === 'VERIFIED'));
}

async function decorate(row: StrategyRow, viewer?: string | null) {
  const [reviewRows, claimRows] = await Promise.all([
    strategyReviews(row.id),
    strategyClaims(row.id, viewer && wallet(viewer) === row.owner_address ? viewer : undefined)
  ]);
  let installed = false;
  if (viewer) {
    if (isSupabaseConfigured) {
      const found = await strictSelect<InstallationRow>('strategy_installations', (query: any) =>
        query.eq('strategy_id', row.id).eq('wallet_address', wallet(viewer)).limit(1)
      );
      installed = Boolean(found[0]);
    } else {
      installed = installations.some((entry) => entry.strategy_id === row.id && entry.wallet_address === wallet(viewer));
    }
  }
  return {
    ...row,
    installed,
    rating: reviewRows.length ? Number((reviewRows.reduce((sum, review) => sum + review.rating, 0) / reviewRows.length).toFixed(1)) : null,
    reviewCount: reviewRows.length,
    verifiedPerformance: claimRows.filter((claim) => claim.verification_status === 'VERIFIED'),
    pendingPerformance: viewer && wallet(viewer) === row.owner_address
      ? claimRows.filter((claim) => claim.verification_status === 'PENDING')
      : []
  };
}

export async function listCatalog(input: { viewer?: string | null; category?: string; search?: string; mine?: boolean } = {}) {
  const category = input.category?.trim().toLowerCase();
  const search = input.search?.trim().toLowerCase();
  const viewer = input.viewer ? wallet(input.viewer) : null;
  const rows = (await allStrategies()).filter((row) => {
    if (input.mine) return Boolean(viewer && row.owner_address === viewer);
    if (row.status !== 'PUBLISHED') return false;
    if (category && row.category.toLowerCase() !== category) return false;
    if (search && !`${row.name} ${row.summary} ${row.description}`.toLowerCase().includes(search)) return false;
    return true;
  }).sort((left, right) => (right.published_at || right.created_at).localeCompare(left.published_at || left.created_at));
  return Promise.all(rows.map((row) => decorate(row, viewer)));
}

export async function getStrategy(idOrSlug: string, viewer?: string | null) {
  const row = await findStrategy(idOrSlug);
  if (!row) return null;
  if (row.status !== 'PUBLISHED' && (!viewer || row.owner_address !== wallet(viewer))) return null;
  const versionRows = isSupabaseConfigured
    ? await strictSelect<StrategyVersionRow>('strategy_versions', (query: any) => query.eq('strategy_id', row.id).order('version', { ascending: false }))
    : versions.filter((entry) => entry.strategy_id === row.id).sort((a, b) => b.version - a.version);
  return { ...(await decorate(row, viewer)), versions: versionRows };
}

export async function createStrategy(ownerAddress: string, input: Record<string, unknown>): Promise<StrategyRow> {
  const timestamp = now();
  const row: StrategyRow = {
    id: crypto.randomUUID(), owner_address: wallet(ownerAddress), slug: slug(input.slug),
    name: text(input.name, 'Name', 3, 80), summary: text(input.summary, 'Summary', 10, 240),
    description: text(input.description, 'Description', 20, 10_000), category: text(input.category, 'Category', 3, 40),
    risk_level: riskLevel(input.riskLevel), supported_exchanges: exchanges(input.supportedExchanges),
    configuration_schema: object(input.configurationSchema), execution_template: object(input.executionTemplate),
    status: 'DRAFT', current_version: 0, install_count: 0, created_at: timestamp, updated_at: timestamp, published_at: null
  };
  if ((await allStrategies()).some((entry) => entry.slug === row.slug)) throw new Error('That strategy slug is already in use.');
  if (isSupabaseConfigured) {
    const inserted = await strictInsert('strategies', row);
    return (inserted[0] as unknown as StrategyRow | undefined) || row;
  }
  strategies.unshift(row);
  return row;
}

export async function updateDraft(ownerAddress: string, id: string, input: Record<string, unknown>): Promise<StrategyRow> {
  const existing = await findStrategy(id);
  if (!existing || existing.owner_address !== wallet(ownerAddress)) throw new Error('Strategy was not found.');
  if (existing.status !== 'DRAFT') throw new Error('Published strategy versions are immutable. Create a new strategy for material changes.');
  return updateStrategy(id, {
    name: input.name === undefined ? existing.name : text(input.name, 'Name', 3, 80),
    summary: input.summary === undefined ? existing.summary : text(input.summary, 'Summary', 10, 240),
    description: input.description === undefined ? existing.description : text(input.description, 'Description', 20, 10_000),
    category: input.category === undefined ? existing.category : text(input.category, 'Category', 3, 40),
    risk_level: input.riskLevel === undefined ? existing.risk_level : riskLevel(input.riskLevel),
    supported_exchanges: input.supportedExchanges === undefined ? existing.supported_exchanges : exchanges(input.supportedExchanges),
    configuration_schema: input.configurationSchema === undefined ? existing.configuration_schema : object(input.configurationSchema),
    execution_template: input.executionTemplate === undefined ? existing.execution_template : object(input.executionTemplate),
    updated_at: now()
  });
}

export async function publishStrategy(ownerAddress: string, id: string) {
  const existing = await findStrategy(id);
  if (!existing || existing.owner_address !== wallet(ownerAddress)) throw new Error('Strategy was not found.');
  if (existing.status !== 'DRAFT') throw new Error('Only a draft strategy can be published.');
  const version = existing.current_version + 1;
  const snapshot = manifest(existing);
  const versionRow: StrategyVersionRow = {
    id: crypto.randomUUID(), strategy_id: id, version, content_hash: contentHash(snapshot), manifest: snapshot, created_at: now()
  };
  if (isSupabaseConfigured) await strictInsert('strategy_versions', versionRow);
  else versions.unshift(versionRow);
  const published = await updateStrategy(id, { status: 'PUBLISHED', current_version: version, published_at: now(), updated_at: now() });
  return { strategy: published, version: versionRow };
}

function validateConfiguration(schema: Record<string, unknown>, configuration: Record<string, unknown>) {
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  for (const field of required) {
    if (!(field in configuration)) throw new Error(`Strategy configuration is missing required field: ${field}.`);
  }
  const properties = object(schema.properties);
  for (const key of Object.keys(configuration)) {
    if (Object.keys(properties).length > 0 && !(key in properties)) throw new Error(`Unknown strategy configuration field: ${key}.`);
  }
}

export async function installStrategy(walletAddress: string, id: string, configurationValue: unknown) {
  const strategy = await findStrategy(id);
  if (!strategy || strategy.status !== 'PUBLISHED' || strategy.current_version < 1) throw new Error('Published strategy was not found.');
  const configuration = object(configurationValue);
  validateConfiguration(strategy.configuration_schema, configuration);
  const address = wallet(walletAddress);
  const timestamp = now();
  let installation: InstallationRow;
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('strategy_installations').upsert({
      strategy_id: id, wallet_address: address, version: strategy.current_version,
      configuration, enabled: true, updated_at: timestamp
    }, { onConflict: 'strategy_id,wallet_address' }).select().single();
    if (error) throw error;
    installation = data as InstallationRow;
    const count = await supabase.from('strategy_installations').select('*', { head: true, count: 'exact' }).eq('strategy_id', id);
    if (!count.error) await updateStrategy(id, { install_count: count.count || 0, updated_at: timestamp });
  } else {
    const existing = installations.find((entry) => entry.strategy_id === id && entry.wallet_address === address);
    if (existing) {
      Object.assign(existing, { version: strategy.current_version, configuration, enabled: true, updated_at: timestamp });
      installation = existing;
    } else {
      installation = { id: crypto.randomUUID(), strategy_id: id, wallet_address: address, version: strategy.current_version, configuration, enabled: true, installed_at: timestamp, updated_at: timestamp };
      installations.unshift(installation);
      strategy.install_count += 1;
    }
  }
  return installation;
}

export async function listInstallations(walletAddress: string) {
  const address = wallet(walletAddress);
  const rows = isSupabaseConfigured
    ? await strictSelect<InstallationRow>('strategy_installations', (query: any) => query.eq('wallet_address', address).order('installed_at', { ascending: false }))
    : installations.filter((row) => row.wallet_address === address);
  const result = await Promise.all(rows.map(async (installation) => ({ installation, strategy: await findStrategy(installation.strategy_id) })));
  return result.filter((entry) => entry.strategy);
}

export async function uninstallStrategy(walletAddress: string, strategyId: string): Promise<boolean> {
  const address = wallet(walletAddress);
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('strategy_installations').delete().eq('strategy_id', strategyId).eq('wallet_address', address).select('id');
    if (error) throw error;
    if (!data?.length) return false;
    const count = await supabase.from('strategy_installations').select('*', { head: true, count: 'exact' }).eq('strategy_id', strategyId);
    if (!count.error) await updateStrategy(strategyId, { install_count: count.count || 0, updated_at: now() });
    return true;
  }
  const index = installations.findIndex((entry) => entry.strategy_id === strategyId && entry.wallet_address === address);
  if (index < 0) return false;
  installations.splice(index, 1);
  const strategy = strategies.find((entry) => entry.id === strategyId);
  if (strategy) strategy.install_count = Math.max(0, strategy.install_count - 1);
  return true;
}

export async function reviewStrategy(walletAddress: string, strategyId: string, ratingValue: unknown, reviewValue: unknown) {
  const address = wallet(walletAddress);
  const rating = Number(ratingValue);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Rating must be an integer from 1 to 5.');
  const review = typeof reviewValue === 'string' ? reviewValue.trim() : '';
  if (review.length > 2_000) throw new Error('Review must not exceed 2000 characters.');
  const installed = isSupabaseConfigured
    ? Boolean((await strictSelect<InstallationRow>('strategy_installations', (query: any) => query.eq('strategy_id', strategyId).eq('wallet_address', address).limit(1)))[0])
    : installations.some((entry) => entry.strategy_id === strategyId && entry.wallet_address === address);
  if (!installed) throw new Error('Install the strategy before reviewing it.');
  const timestamp = now();
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('strategy_reviews').upsert({ strategy_id: strategyId, wallet_address: address, rating, review, updated_at: timestamp }, { onConflict: 'strategy_id,wallet_address' }).select().single();
    if (error) throw error;
    return data as ReviewRow;
  }
  const existing = reviews.find((entry) => entry.strategy_id === strategyId && entry.wallet_address === address);
  if (existing) { Object.assign(existing, { rating, review, updated_at: timestamp }); return existing; }
  const row: ReviewRow = { id: crypto.randomUUID(), strategy_id: strategyId, wallet_address: address, rating, review, created_at: timestamp, updated_at: timestamp };
  reviews.unshift(row);
  return row;
}

export async function submitPerformanceClaim(ownerAddress: string, strategyId: string, input: Record<string, unknown>) {
  const strategy = await findStrategy(strategyId);
  const address = wallet(ownerAddress);
  if (!strategy || strategy.owner_address !== address) throw new Error('Strategy was not found.');
  const periodStart = new Date(String(input.periodStart || ''));
  const periodEnd = new Date(String(input.periodEnd || ''));
  const sampleSize = Number(input.sampleSize);
  if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodStart >= periodEnd) throw new Error('A valid performance period is required.');
  if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 10_000_000) throw new Error('Sample size must be a positive integer.');
  const metrics = object(input.metrics);
  const evidenceHash = text(input.evidenceHash, 'Evidence hash', 16, 256);
  const row: ClaimRow = {
    id: crypto.randomUUID(), strategy_id: strategyId, owner_address: address,
    period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), sample_size: sampleSize,
    metrics, evidence_hash: evidenceHash, verification_status: 'PENDING', created_at: now()
  };
  if (isSupabaseConfigured) {
    const inserted = await strictInsert('strategy_performance_claims', row);
    return (inserted[0] as unknown as ClaimRow | undefined) || row;
  }
  claims.unshift(row);
  return row;
}

export const strategyMarketplace = {
  createStrategy,
  getStrategy,
  installStrategy,
  listCatalog,
  listInstallations,
  publishStrategy,
  reviewStrategy,
  submitPerformanceClaim,
  uninstallStrategy,
  updateDraft
};

export default strategyMarketplace;
