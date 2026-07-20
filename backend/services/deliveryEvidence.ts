import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';

import { isProduction } from '../config/env';
import onchainAutomation from './onchainAutomation';
import supabaseService = require('./supabase');
import type { WalletNetwork } from './walletAuth';

export type DeliveryStatus = 'LIVE' | 'TESTNET' | 'REPOSITORY_ONLY';

export interface EvidenceLink {
  label: string;
  href: string;
  kind: 'source' | 'test' | 'route' | 'contract' | 'transaction' | 'release';
  verified?: boolean;
}

export interface FeatureEvidence {
  id: 'siwe' | 'shield' | 'marketplace' | 'automation';
  name: string;
  status: DeliveryStatus;
  summary: string;
  boundary: string;
  links: EvidenceLink[];
  metrics: Record<string, string | number | boolean | null>;
}

const REPOSITORY_URL = 'https://github.com/Anu062004/Herewesoso';
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const COMMIT_SHA = /^[0-9a-fA-F]{7,40}$/;
const PROOF_ABI = [
  'event AdapterApprovalChanged(address indexed adapter,bool allowed)',
  'event RuleCreated(uint256 indexed ruleId,address indexed owner,address indexed adapter,address checker,bytes32 executionDataHash,bytes32 checkDataHash)',
  'event RuleExecuted(uint256 indexed ruleId,address indexed keeper,uint32 executionCount,bytes32 receipt)'
];
const proofInterface = new ethers.Interface(PROOF_ABI);

function firstValue(env: NodeJS.ProcessEnv, names: string[]): string | null {
  for (const name of names) {
    const value = String(env[name] || '').trim();
    if (value) return value;
  }
  return null;
}

function publicUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || (!isProduction() && parsed.protocol === 'http:') ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function repositoryCommitSha(): string | null {
  try {
    const repositoryRoot = path.resolve(__dirname, '../..');
    const dotGitPath = path.join(repositoryRoot, '.git');
    const dotGitStat = fs.statSync(dotGitPath);
    let gitDirectory = dotGitPath;
    if (dotGitStat.isFile()) {
      const pointer = fs.readFileSync(dotGitPath, 'utf8').trim().match(/^gitdir:\s+(.+)$/i)?.[1];
      if (!pointer) return null;
      gitDirectory = path.resolve(repositoryRoot, pointer);
    }
    const head = fs.readFileSync(path.join(gitDirectory, 'HEAD'), 'utf8').trim();
    if (COMMIT_SHA.test(head)) return head.toLowerCase();
    const ref = head.match(/^ref:\s+(refs\/[A-Za-z0-9._/-]+)$/)?.[1];
    if (!ref || ref.includes('..')) return null;
    const looseRef = path.join(gitDirectory, ref);
    if (fs.existsSync(looseRef)) {
      const value = fs.readFileSync(looseRef, 'utf8').trim();
      return COMMIT_SHA.test(value) ? value.toLowerCase() : null;
    }
    const packedRefs = path.join(gitDirectory, 'packed-refs');
    if (!fs.existsSync(packedRefs)) return null;
    const packed = fs.readFileSync(packedRefs, 'utf8').split('\n')
      .find((line) => line.endsWith(` ${ref}`));
    const value = packed?.split(' ')[0] || '';
    return COMMIT_SHA.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function releaseEvidence(env: NodeJS.ProcessEnv = process.env) {
  const rawCommit = firstValue(env, ['APP_COMMIT_SHA', 'VERCEL_GIT_COMMIT_SHA', 'RAILWAY_GIT_COMMIT_SHA', 'RENDER_GIT_COMMIT', 'GITHUB_SHA']);
  const commitSha = rawCommit && COMMIT_SHA.test(rawCommit)
    ? rawCommit.toLowerCase()
    : env === process.env ? repositoryCommitSha() : null;
  return {
    repositoryUrl: REPOSITORY_URL,
    commitSha,
    commitUrl: commitSha ? `${REPOSITORY_URL}/commit/${commitSha}` : null,
    demoUrl: publicUrl(firstValue(env, ['EVIDENCE_DEMO_URL', 'NEXT_PUBLIC_APP_URL'])),
    environment: isProduction() ? 'production' as const : 'development' as const
  };
}

export function runtimeStatus(production: boolean, persistenceReachable: boolean): DeliveryStatus {
  return production && persistenceReachable ? 'LIVE' : 'REPOSITORY_ONLY';
}

function explorerBase(network: WalletNetwork): string {
  const configured = firstValue(process.env, [network === 'mainnet' ? 'SODEX_MAINNET_EXPLORER_URL' : 'SODEX_TESTNET_EXPLORER_URL']);
  return (configured || (network === 'mainnet' ? 'https://main-scan.valuechain.xyz' : 'https://test-scan.valuechain.xyz')).replace(/\/$/, '');
}

function proofAddress(name: string): string | null {
  const value = String(process.env[name] || '').trim();
  return ethers.isAddress(value) && ethers.getAddress(value) !== ethers.ZeroAddress ? ethers.getAddress(value) : null;
}

function proofHash(name: string): string | null {
  const value = String(process.env[name] || '').trim();
  return TX_HASH.test(value) ? value.toLowerCase() : null;
}

async function withTimeout<T>(work: Promise<T>, timeoutMs = 4_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Evidence RPC timed out.')), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function eventFromReceipt(
  receipt: ethers.TransactionReceipt,
  contractAddress: string,
  eventName: string
): ethers.LogDescription | null {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
    try {
      const parsed = proofInterface.parseLog(log);
      if (parsed?.name === eventName) return parsed;
    } catch { /* Ignore unrelated contract logs. */ }
  }
  return null;
}

interface AutomationProof {
  status: DeliveryStatus;
  boundary: string;
  links: EvidenceLink[];
  metrics: Record<string, string | number | boolean | null>;
}

async function verifyAutomationProof(): Promise<AutomationProof> {
  const configuredNetwork = String(process.env.AUTOMATION_EVIDENCE_NETWORK || process.env.SODEX_NETWORK || 'testnet').toLowerCase();
  const network: WalletNetwork = configuredNetwork === 'mainnet' ? 'mainnet' : 'testnet';
  const config = onchainAutomation.config(network);
  const adapter = proofAddress('AUTOMATION_ADAPTER_ADDRESS');
  const checker = proofAddress('AUTOMATION_CHECKER_ADDRESS');
  const approvalHash = proofHash('AUTOMATION_ADAPTER_APPROVAL_TX_HASH');
  const creationHash = proofHash('AUTOMATION_RULE_CREATION_TX_HASH');
  const executionHash = proofHash('AUTOMATION_RULE_EXECUTION_TX_HASH');
  const explorer = explorerBase(network);
  const links: EvidenceLink[] = [
    { label: 'Contract source', href: `${REPOSITORY_URL}/blob/main/contracts/src/ShieldAutomationExecutor.sol`, kind: 'contract' },
    { label: 'Contract tests', href: `${REPOSITORY_URL}/blob/main/contracts/test/ShieldAutomationExecutor.test.mjs`, kind: 'test' }
  ];
  if (config.contractAddress) links.push({ label: 'Executor', href: `${explorer}/address/${config.contractAddress}`, kind: 'contract', verified: false });
  if (approvalHash) links.push({ label: 'Adapter approval', href: `${explorer}/tx/${approvalHash}`, kind: 'transaction', verified: false });
  if (creationHash) links.push({ label: 'Rule creation', href: `${explorer}/tx/${creationHash}`, kind: 'transaction', verified: false });
  if (executionHash) links.push({ label: 'Rule execution', href: `${explorer}/tx/${executionHash}`, kind: 'transaction', verified: false });

  const metrics: Record<string, string | number | boolean | null> = {
    network,
    chainId: config.chainId,
    executorAddress: config.contractAddress,
    executorBytecodeVerified: false,
    adapterAddress: adapter,
    adapterApproved: false,
    checkerAddress: checker,
    checkerBytecodeVerified: false,
    ruleId: null,
    executionVerified: false
  };

  if (!config.contractAddress) {
    return { status: 'REPOSITORY_ONLY', boundary: 'The executor compiles and is tested, but no deployed contract address is configured.', links, metrics };
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });
  try {
    const executorCode = await withTimeout(provider.getCode(config.contractAddress));
    metrics.executorBytecodeVerified = executorCode !== '0x';
    const executorLink = links.find((link) => link.label === 'Executor');
    if (executorLink) executorLink.verified = metrics.executorBytecodeVerified === true;
    if (metrics.executorBytecodeVerified !== true) {
      return { status: 'REPOSITORY_ONLY', boundary: 'A contract address is configured, but bytecode was not found at that address.', links, metrics };
    }

    if (adapter) metrics.adapterBytecodeVerified = (await withTimeout(provider.getCode(adapter))) !== '0x';
    if (checker) metrics.checkerBytecodeVerified = (await withTimeout(provider.getCode(checker))) !== '0x';
    if (!(adapter && checker && approvalHash && creationHash && executionHash)) {
      return {
        status: 'REPOSITORY_ONLY',
        boundary: 'Executor bytecode is verified; adapter approval, rule creation, and rule execution transaction evidence is still incomplete.',
        links,
        metrics
      };
    }

    const [approvalReceipt, creationReceipt, executionReceipt] = await Promise.all([
      withTimeout(provider.getTransactionReceipt(approvalHash)),
      withTimeout(provider.getTransactionReceipt(creationHash)),
      withTimeout(provider.getTransactionReceipt(executionHash))
    ]);
    const receipts = [approvalReceipt, creationReceipt, executionReceipt];
    if (receipts.some((receipt) => !receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== config.contractAddress?.toLowerCase())) {
      return { status: 'REPOSITORY_ONLY', boundary: 'One or more configured proof transactions are missing, reverted, or target a different executor.', links, metrics };
    }

    const approval = eventFromReceipt(approvalReceipt!, config.contractAddress, 'AdapterApprovalChanged');
    const created = eventFromReceipt(creationReceipt!, config.contractAddress, 'RuleCreated');
    const executed = eventFromReceipt(executionReceipt!, config.contractAddress, 'RuleExecuted');
    const createdRuleId = created ? String(created.args.ruleId) : null;
    const proofMatches = Boolean(
      approval && created && executed
      && String(approval.args.adapter).toLowerCase() === adapter.toLowerCase()
      && approval.args.allowed === true
      && String(created.args.adapter).toLowerCase() === adapter.toLowerCase()
      && String(created.args.checker).toLowerCase() === checker.toLowerCase()
      && createdRuleId === String(executed.args.ruleId)
      && metrics.adapterBytecodeVerified === true
      && metrics.checkerBytecodeVerified === true
    );
    metrics.adapterApproved = Boolean(approval && approval.args.allowed === true);
    metrics.ruleId = createdRuleId;
    metrics.executionVerified = proofMatches;
    for (const link of links) {
      if (link.kind === 'transaction') link.verified = proofMatches;
    }
    if (!proofMatches) {
      return { status: 'REPOSITORY_ONLY', boundary: 'Proof transactions exist, but their contract events do not form one valid adapter-to-rule execution path.', links, metrics };
    }
    return {
      status: network === 'mainnet' ? 'LIVE' : 'TESTNET',
      boundary: network === 'mainnet'
        ? 'A complete mainnet adapter approval, rule creation, and execution path is verified on-chain.'
        : 'A complete testnet path is verified. Mainnet execution is not claimed.',
      links,
      metrics
    };
  } catch {
    return { status: 'REPOSITORY_ONLY', boundary: 'The configured chain proof could not be independently verified by the backend RPC.', links, metrics };
  } finally {
    provider.destroy();
  }
}

function repositoryLinks(paths: Array<[string, string, EvidenceLink['kind']]>): EvidenceLink[] {
  return paths.map(([label, path, kind]) => ({ label, href: `${REPOSITORY_URL}/${path}`, kind }));
}

export async function getDeliveryEvidence() {
  const production = isProduction();
  const sessionSecret = String(process.env.SODEX_SESSION_SECRET || process.env.SESSION_SECRET || '');
  const [strategyCount, activeSessionCount, riskSnapshotCount, automation] = await Promise.all([
    supabaseService.safeCount('strategies', (query: any) => query.eq('status', 'PUBLISHED')),
    supabaseService.safeCount('wallet_sessions', (query: any) => query.is('revoked_at', null).gt('expires_at', new Date().toISOString())),
    supabaseService.safeCount('position_risks'),
    verifyAutomationProof()
  ]);
  const strategyPersistenceReachable = strategyCount !== null;
  const sessionPersistenceReachable = activeSessionCount !== null;
  const shieldPersistenceReachable = riskSnapshotCount !== null;
  const persistenceReachable = strategyPersistenceReachable && sessionPersistenceReachable && shieldPersistenceReachable;
  const secureSessionConfigured = sessionSecret.length >= 32;
  const siweStatus: DeliveryStatus = secureSessionConfigured
    ? runtimeStatus(production, sessionPersistenceReachable)
    : 'REPOSITORY_ONLY';
  const shieldStatus = runtimeStatus(production, shieldPersistenceReachable);
  const marketplaceStatus = runtimeStatus(production, strategyPersistenceReachable);

  const features: FeatureEvidence[] = [
    {
      id: 'siwe',
      name: 'SIWE multi-user sessions',
      status: siweStatus,
      summary: 'Domain-bound EIP-4361 challenges create independent, revocable HttpOnly wallet sessions.',
      boundary: siweStatus === 'LIVE'
        ? 'Persistence and production session configuration are reachable; protected account reads still require each wallet to authenticate.'
        : 'Implementation and tests are present, but this environment does not prove durable production sessions.',
      metrics: { persistenceReachable, secureSessionConfigured, activeSessions: activeSessionCount },
      links: repositoryLinks([
        ['Authentication route', 'blob/main/backend/routes/sodex.ts#L298-L430', 'source'],
        ['Session service', 'blob/main/backend/services/walletAuth.ts', 'source'],
        ['Acceptance tests', 'blob/main/backend/tests/sodexSigner.test.ts', 'test'],
        ['Connect screen', 'tree/main/frontend/app/dashboard/sodex/connect', 'route']
      ])
    },
    {
      id: 'shield',
      name: 'SoDEX Liquidation Shield',
      status: shieldStatus,
      summary: 'SoDEX positions are scored for liquidation distance, leverage, margin pressure, volatility, and liquidity risk.',
      boundary: shieldStatus === 'LIVE'
        ? 'Runtime persistence is reachable; the Shield is SoDEX-only and never claims coverage for another venue.'
        : 'The scoring and account integrations are testable in the repository; this environment does not prove the production data path.',
      metrics: { persistenceReachable: shieldPersistenceReachable, riskSnapshots: riskSnapshotCount, cadenceMinutes: 30, venue: 'SoDEX' },
      links: repositoryLinks([
        ['Risk engine', 'blob/main/backend/services/riskCalculator.ts', 'source'],
        ['SoDEX adapter', 'blob/main/backend/services/sodex.ts', 'source'],
        ['Risk tests', 'blob/main/backend/tests/riskCalculator.test.ts', 'test'],
        ['Shield screen', 'tree/main/frontend/app/dashboard/shield', 'route']
      ])
    },
    {
      id: 'marketplace',
      name: 'Strategy Marketplace',
      status: marketplaceStatus,
      summary: 'Wallet owners publish immutable SoDEX strategy versions, install per-wallet configuration, and submit reviews.',
      boundary: marketplaceStatus === 'LIVE'
        ? 'The published catalog is reachable in durable storage. Performance claims remain unverified until evidence is reviewed.'
        : 'Routes and acceptance tests are shipped, but a durable production catalog is not proven in this environment.',
      metrics: { persistenceReachable: strategyPersistenceReachable, publishedStrategies: strategyCount, venue: 'SoDEX' },
      links: repositoryLinks([
        ['Marketplace service', 'blob/main/backend/services/strategyMarketplace.ts', 'source'],
        ['Marketplace routes', 'blob/main/backend/routes/strategies.ts', 'source'],
        ['Marketplace tests', 'blob/main/backend/tests/wave3Features.test.ts', 'test'],
        ['Marketplace screen', 'tree/main/frontend/app/dashboard/strategies', 'route']
      ])
    },
    {
      id: 'automation',
      name: 'On-chain auto-execution',
      status: automation.status,
      summary: 'A non-custodial executor enforces adapter allowlisting, checker gates, calldata commitments, cooldowns, caps, and owner cancellation.',
      boundary: automation.boundary,
      metrics: automation.metrics,
      links: automation.links
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    release: releaseEvidence(),
    checks: {
      persistenceConfigured: supabaseService.isSupabaseConfigured,
      persistenceReachable,
      sessionPersistenceReachable,
      shieldPersistenceReachable,
      strategyPersistenceReachable,
      production,
      truthfulStatusModel: ['LIVE', 'TESTNET', 'REPOSITORY_ONLY'] as DeliveryStatus[]
    },
    summary: {
      live: features.filter((feature) => feature.status === 'LIVE').length,
      testnet: features.filter((feature) => feature.status === 'TESTNET').length,
      repositoryOnly: features.filter((feature) => feature.status === 'REPOSITORY_ONLY').length,
      total: features.length
    },
    features
  };
}

export default { getDeliveryEvidence, releaseEvidence, runtimeStatus };
