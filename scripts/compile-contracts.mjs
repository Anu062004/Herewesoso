import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

const root = process.cwd();
const sourceRoot = path.join(root, 'contracts', 'src');

function collect(directory, prefix = '') {
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory()
      ? Object.entries(collect(absolute, relative))
      : entry.name.endsWith('.sol')
        ? [[relative, { content: fs.readFileSync(absolute, 'utf8') }]]
        : [];
  }));
}

const input = {
  language: 'Solidity',
  sources: collect(sourceRoot),
  settings: {
    evmVersion: 'prague',
    viaIR: true,
    optimizer: { enabled: true, runs: 500 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } }
  }
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const diagnostics = output.errors || [];
for (const diagnostic of diagnostics) {
  const stream = diagnostic.severity === 'error' ? process.stderr : process.stdout;
  stream.write(`${diagnostic.formattedMessage}\n`);
}
if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) process.exit(1);

const executor = output.contracts['ShieldAutomationExecutor.sol'].ShieldAutomationExecutor;
if (!executor?.evm?.bytecode?.object) throw new Error('ShieldAutomationExecutor bytecode was not generated.');
console.log(JSON.stringify({
  compiler: solc.version(),
  evmVersion: 'prague',
  contract: 'ShieldAutomationExecutor',
  abiEntries: executor.abi.length,
  bytecodeBytes: executor.evm.bytecode.object.length / 2
}, null, 2));
