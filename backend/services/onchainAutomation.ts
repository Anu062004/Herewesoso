import crypto from 'crypto';
import { ethers } from 'ethers';

import supabaseService = require('./supabase');
import type { WalletNetwork } from './walletAuth';

interface AutomationRuleIndex {
  id: string;
  wallet_address: string;
  chain_id: number;
  contract_address: string;
  onchain_rule_id: string;
  creation_tx_hash: string;
  adapter_address: string;
  checker_address: string;
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED' | 'EXHAUSTED';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const EXECUTOR_ABI = [
  'event RuleCreated(uint256 indexed ruleId,address indexed owner,address indexed adapter,address checker,bytes32 executionDataHash,bytes32 checkDataHash)',
  'event RuleCancelled(uint256 indexed ruleId,address indexed owner)',
  'function createRule(address adapter,address checker,uint64 validAfter,uint64 validUntil,uint64 minInterval,uint32 maxExecutions,uint128 maxGasPrice,bytes executionData,bytes checkData) returns (uint256)',
  'function cancelRule(uint256 ruleId)',
  'function executeRule(uint256 ruleId,bytes executionData,bytes checkData) returns (bytes32)',
  'function canExecute(uint256 ruleId,bytes executionData,bytes checkData) view returns (bool eligible,bytes32 reason)',
  'function getRule(uint256 ruleId) view returns ((address owner,address adapter,address checker,uint64 validAfter,uint64 validUntil,uint64 minInterval,uint64 lastExecutedAt,uint32 maxExecutions,uint32 executionCount,uint128 maxGasPrice,bytes32 executionDataHash,bytes32 checkDataHash,bool active))'
];

const iface = new ethers.Interface(EXECUTOR_ABI);
const memoryRules: AutomationRuleIndex[] = [];
const { isSupabaseConfigured, strictInsert, strictSelect, strictUpdate } = supabaseService;

function now() { return new Date().toISOString(); }

function networkConfig(network: WalletNetwork) {
  const mainnet = network === 'mainnet';
  const chainId = mainnet ? 286623 : 138565;
  const contractAddress = String(
    mainnet
      ? process.env.SHIELD_AUTOMATION_MAINNET_CONTRACT_ADDRESS || process.env.SHIELD_AUTOMATION_CONTRACT_ADDRESS || ''
      : process.env.SHIELD_AUTOMATION_TESTNET_CONTRACT_ADDRESS || process.env.SHIELD_AUTOMATION_CONTRACT_ADDRESS || ''
  ).trim();
  const rpcUrl = String(
    mainnet
      ? process.env.SODEX_MAINNET_RPC_URL || 'https://mainnet.valuechain.xyz'
      : process.env.SODEX_TESTNET_RPC_URL || 'https://testnet-v2.valuechain.xyz'
  ).trim();
  return {
    network,
    chainId,
    contractAddress: ethers.isAddress(contractAddress) ? ethers.getAddress(contractAddress) : null,
    rpcUrl,
    configured: ethers.isAddress(contractAddress),
    model: 'permissionless-keeper',
    safeguards: ['allowlisted-adapter', 'checker-gated', 'calldata-commitment', 'cooldown', 'execution-cap', 'gas-price-cap', 'owner-cancellable']
  };
}

function address(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ethers.isAddress(value) || ethers.getAddress(value) === ethers.ZeroAddress) {
    throw new Error(`${label} must be a valid non-zero EVM address.`);
  }
  return ethers.getAddress(value);
}

function bytes(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ethers.isHexString(value)) throw new Error(`${label} must be 0x-prefixed bytes.`);
  if (ethers.dataLength(value) > 16_384) throw new Error(`${label} must not exceed 16 KiB.`);
  return value;
}

function integer(value: unknown, label: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  return parsed;
}

function configured(network: WalletNetwork) {
  const config = networkConfig(network);
  if (!config.contractAddress) throw new Error(`Shield automation is not deployed on ${network}.`);
  return config as ReturnType<typeof networkConfig> & { contractAddress: string };
}

export function prepareCreateRule(network: WalletNetwork, ownerAddress: string, input: Record<string, unknown>) {
  const config = configured(network);
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const validAfter = integer(input.validAfter ?? currentTimestamp, 'validAfter', 0, 4_294_967_295);
  const validUntil = integer(input.validUntil ?? 0, 'validUntil', 0, 4_294_967_295);
  if (validUntil !== 0 && (validUntil <= validAfter || validUntil <= currentTimestamp)) throw new Error('validUntil must be later than validAfter and in the future.');
  const minInterval = integer(input.minInterval ?? 300, 'minInterval', 0, 31_536_000);
  const maxExecutions = integer(input.maxExecutions ?? 1, 'maxExecutions', 1, 10_000);
  const maxGasPriceGwei = integer(input.maxGasPriceGwei ?? 0, 'maxGasPriceGwei', 0, 1_000_000);
  const adapter = address(input.adapter, 'adapter');
  const checker = address(input.checker, 'checker');
  const executionData = bytes(input.executionData, 'executionData');
  const checkData = bytes(input.checkData, 'checkData');
  const args = [adapter, checker, validAfter, validUntil, minInterval, maxExecutions, ethers.parseUnits(String(maxGasPriceGwei), 'gwei'), executionData, checkData] as const;
  return {
    chainId: config.chainId,
    contractAddress: config.contractAddress,
    transaction: {
      from: ethers.getAddress(ownerAddress),
      to: config.contractAddress,
      value: '0x0',
      data: iface.encodeFunctionData('createRule', args)
    },
    commitment: {
      executionDataHash: ethers.keccak256(executionData),
      checkDataHash: ethers.keccak256(checkData)
    },
    rule: { adapter, checker, validAfter, validUntil, minInterval, maxExecutions, maxGasPriceGwei }
  };
}

export function prepareCancelRule(network: WalletNetwork, ownerAddress: string, ruleIdValue: unknown) {
  const config = configured(network);
  const ruleId = BigInt(integer(ruleIdValue, 'ruleId', 1, Number.MAX_SAFE_INTEGER));
  return {
    chainId: config.chainId,
    transaction: {
      from: ethers.getAddress(ownerAddress), to: config.contractAddress, value: '0x0',
      data: iface.encodeFunctionData('cancelRule', [ruleId])
    }
  };
}

export function prepareExecuteRule(network: WalletNetwork, callerAddress: string, input: Record<string, unknown>) {
  const config = configured(network);
  const ruleId = BigInt(integer(input.ruleId, 'ruleId', 1, Number.MAX_SAFE_INTEGER));
  const executionData = bytes(input.executionData, 'executionData');
  const checkData = bytes(input.checkData, 'checkData');
  return {
    chainId: config.chainId,
    transaction: {
      from: ethers.getAddress(callerAddress), to: config.contractAddress, value: '0x0',
      data: iface.encodeFunctionData('executeRule', [ruleId, executionData, checkData])
    }
  };
}

async function onchainRule(network: WalletNetwork, ruleId: bigint) {
  const config = configured(network);
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });
  const contract = new ethers.Contract(config.contractAddress, EXECUTOR_ABI, provider);
  return contract.getRule(ruleId);
}

export async function registerRule(network: WalletNetwork, ownerAddress: string, input: Record<string, unknown>) {
  const config = configured(network);
  const txHash = typeof input.transactionHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(input.transactionHash)
    ? input.transactionHash.toLowerCase()
    : null;
  if (!txHash) throw new Error('transactionHash must be a 32-byte EVM transaction hash.');
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== config.contractAddress.toLowerCase()) {
    throw new Error('The rule-creation transaction is not confirmed on the configured executor.');
  }
  let ruleId: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.contractAddress.toLowerCase()) continue;
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === 'RuleCreated' && String(parsed.args.owner).toLowerCase() === ownerAddress.toLowerCase()) {
        ruleId = BigInt(parsed.args.ruleId);
        break;
      }
    } catch { /* Ignore unrelated executor events. */ }
  }
  if (ruleId === null) throw new Error('The transaction does not contain a RuleCreated event for this wallet.');
  const rule = await onchainRule(network, ruleId);
  if (String(rule.owner).toLowerCase() !== ownerAddress.toLowerCase()) throw new Error('The on-chain rule is owned by a different wallet.');
  const timestamp = now();
  const row: AutomationRuleIndex = {
    id: crypto.randomUUID(), wallet_address: ownerAddress.toLowerCase(), chain_id: config.chainId,
    contract_address: config.contractAddress.toLowerCase(), onchain_rule_id: ruleId.toString(), creation_tx_hash: txHash,
    adapter_address: String(rule.adapter).toLowerCase(), checker_address: String(rule.checker).toLowerCase(),
    status: rule.active ? 'ACTIVE' : 'EXHAUSTED', metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata as Record<string, unknown> : {},
    created_at: timestamp, updated_at: timestamp
  };
  if (isSupabaseConfigured) {
    const inserted = await strictInsert('automation_rules', row);
    return (inserted[0] as unknown as AutomationRuleIndex | undefined) || row;
  }
  const existing = memoryRules.find((entry) => entry.chain_id === row.chain_id && entry.contract_address === row.contract_address && entry.onchain_rule_id === row.onchain_rule_id);
  if (existing) { Object.assign(existing, row, { id: existing.id, created_at: existing.created_at }); return existing; }
  memoryRules.unshift(row);
  return row;
}

export async function listRules(network: WalletNetwork, ownerAddress: string) {
  const config = networkConfig(network);
  if (isSupabaseConfigured) {
    return strictSelect<AutomationRuleIndex>('automation_rules', (query: any) =>
      query.eq('wallet_address', ownerAddress.toLowerCase()).eq('chain_id', config.chainId).order('created_at', { ascending: false })
    );
  }
  return memoryRules.filter((row) => row.wallet_address === ownerAddress.toLowerCase() && row.chain_id === config.chainId);
}

export async function confirmRuleCancelled(network: WalletNetwork, ownerAddress: string, ruleIdValue: unknown, transactionHash: unknown) {
  const config = configured(network);
  const ruleId = String(integer(ruleIdValue, 'ruleId', 1, Number.MAX_SAFE_INTEGER));
  const txHash = typeof transactionHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(transactionHash)
    ? transactionHash.toLowerCase()
    : null;
  if (!txHash) throw new Error('transactionHash must be a 32-byte EVM transaction hash.');
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== config.contractAddress.toLowerCase()) {
    throw new Error('The cancellation transaction is not confirmed on the configured executor.');
  }
  const confirmed = receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== config.contractAddress.toLowerCase()) return false;
    try {
      const parsed = iface.parseLog(log);
      return parsed?.name === 'RuleCancelled'
        && String(parsed.args.ruleId) === ruleId
        && String(parsed.args.owner).toLowerCase() === ownerAddress.toLowerCase();
    } catch { return false; }
  });
  if (!confirmed) throw new Error('The transaction does not contain the expected wallet-owned RuleCancelled event.');
  const values = { status: 'CANCELLED' as const, updated_at: now() };
  if (isSupabaseConfigured) {
    const rows = await strictSelect<AutomationRuleIndex>('automation_rules', (query: any) => query
      .eq('wallet_address', ownerAddress.toLowerCase()).eq('chain_id', config.chainId)
      .eq('contract_address', config.contractAddress.toLowerCase()).eq('onchain_rule_id', ruleId).limit(1));
    if (!rows[0]) return false;
    await strictUpdate('automation_rules', values, { id: rows[0].id });
    return true;
  }
  const row = memoryRules.find((entry) => entry.wallet_address === ownerAddress.toLowerCase() && entry.chain_id === config.chainId && entry.onchain_rule_id === ruleId);
  if (!row) return false;
  Object.assign(row, values);
  return true;
}

export const onchainAutomation = {
  config: networkConfig,
  confirmRuleCancelled,
  listRules,
  prepareCancelRule,
  prepareCreateRule,
  prepareExecuteRule,
  registerRule
};

export default onchainAutomation;
