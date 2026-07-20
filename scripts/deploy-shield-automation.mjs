import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { ContractFactory, JsonRpcProvider, Wallet, formatEther, getAddress } from 'ethers';

const EXPECTED_CHAIN_ID = 138565n;
const DEFAULT_RPC_URL = 'https://testnet-v2.valuechain.xyz';
const sourceRoot = path.join(process.cwd(), 'contracts', 'src');

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

function compileExecutor() {
  const input = {
    language: 'Solidity',
    sources: collect(sourceRoot),
    settings: {
      evmVersion: 'prague',
      viaIR: true,
      optimizer: { enabled: true, runs: 500 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const diagnostics = output.errors || [];
  for (const diagnostic of diagnostics) {
    const stream = diagnostic.severity === 'error' ? process.stderr : process.stdout;
    stream.write(`${diagnostic.formattedMessage}\n`);
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error('ShieldAutomationExecutor compilation failed.');
  }
  return output.contracts['ShieldAutomationExecutor.sol'].ShieldAutomationExecutor;
}

const suppliedKey = process.env.SHIELD_AUTOMATION_DEPLOYER_PRIVATE_KEY?.trim();
if (!suppliedKey) {
  throw new Error('Set SHIELD_AUTOMATION_DEPLOYER_PRIVATE_KEY to a fresh testnet-only wallet key.');
}

const privateKey = suppliedKey.startsWith('0x') ? suppliedKey : `0x${suppliedKey}`;
const rpcUrl = process.env.SHIELD_AUTOMATION_TESTNET_RPC_URL?.trim() || DEFAULT_RPC_URL;
const provider = new JsonRpcProvider(rpcUrl, Number(EXPECTED_CHAIN_ID), { staticNetwork: true });
const network = await provider.getNetwork();
if (network.chainId !== EXPECTED_CHAIN_ID) {
  throw new Error(`Refusing deployment: expected ValueChain testnet ${EXPECTED_CHAIN_ID}, received ${network.chainId}.`);
}

const wallet = new Wallet(privateKey, provider);
const governor = process.env.SHIELD_AUTOMATION_GOVERNOR
  ? getAddress(process.env.SHIELD_AUTOMATION_GOVERNOR.trim())
  : wallet.address;
const balance = await provider.getBalance(wallet.address);
const artifact = compileExecutor();
const factory = new ContractFactory(artifact.abi, artifact.evm.bytecode.object, wallet);
const deploymentRequest = await factory.getDeployTransaction(governor);
const gasEstimate = await provider.estimateGas({ ...deploymentRequest, from: wallet.address });
const feeData = await provider.getFeeData();
const estimatedGasPrice = feeData.maxFeePerGas || feeData.gasPrice;
if (!estimatedGasPrice) throw new Error('RPC did not return a usable gas price.');
const estimatedCost = gasEstimate * estimatedGasPrice;

console.log(JSON.stringify({
  network: 'ValueChain Testnet',
  chainId: network.chainId.toString(),
  deployer: wallet.address,
  governor,
  balanceSOSO: formatEther(balance),
  estimatedGas: gasEstimate.toString(),
  estimatedMaxCostSOSO: formatEther(estimatedCost)
}, null, 2));

if (balance < estimatedCost) {
  throw new Error(`Insufficient SOSO for deployment: have ${formatEther(balance)}, need approximately ${formatEther(estimatedCost)}.`);
}

const contract = await factory.deploy(governor);
const deploymentTransaction = contract.deploymentTransaction();
console.log(`Deployment transaction: ${deploymentTransaction.hash}`);
await contract.waitForDeployment();
const receipt = await deploymentTransaction.wait();
console.log(JSON.stringify({
  contract: 'ShieldAutomationExecutor',
  address: await contract.getAddress(),
  transactionHash: deploymentTransaction.hash,
  blockNumber: receipt.blockNumber,
  explorer: `https://test-scan.valuechain.xyz/tx/${deploymentTransaction.hash}`
}, null, 2));
