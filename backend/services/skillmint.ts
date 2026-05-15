// ─────────────────────────────────────────────────────────────────────────────
// backend/services/skillmint.ts
//
// 4th AI provider adapter for Sentinel Finance, alongside groq.ts / gemini.ts /
// claude.ts. Routes every memo through SkillMint — a verified-execution layer
// on the 0G network — instead of a raw LLM API.
//
// WHY THIS EXISTS
// ───────────────
// Today when NarrativeAgent or ShieldAgent calls `ai.generateNarrativeMemo`, the
// reasoning string is whatever the configured LLM returned. There is no proof:
//   - Of what model actually ran
//   - Of what prompt it saw
//   - Of when, or whether the response was tampered with
//
// For an institutional / regulated trading product, that is a hard blocker.
// "Did your AI really say BUY at 03:42 UTC last Thursday?" — today, no provable
// answer. With SkillMint, every memo returns with:
//   - A receipt rootHash anchored permanently on 0G Storage
//   - The 0G chain settlement tx for the payment
//   - A hardware-signed TEE attestation that the exact input produced the exact
//     output, signed by Intel TDX / AMD SEV silicon
//
// The agents do NOT need to change their function signatures — this adapter
// returns the same `Promise<string>` as groq/gemini/claude. The receipt
// metadata is exposed via a side-channel API (`getLastReceipt`) so agents that
// want provable provenance can fetch it and store it in Supabase. Agents that
// don't care just keep working as before.
//
// HOW IT FLOWS
// ───────────
//   NarrativeAgent
//      → ai.generateNarrativeMemo({ sector, headlines, ... })
//          → ai === skillmint (because AI_SERVICE=skillmint in env)
//             → builds the same prompt groq.ts would have built
//             → calls SkillMintClient.executeX402(skillId, prompt)
//             → SkillMint server processes the call inside a 0G Compute TEE
//             → x402 facilitator settles payment in USDC.E on 0G mainnet
//             → returns { output, receiptRootHash, settlement }
//          → adapter caches the receipt under a key (e.g. "narrative:DeFi")
//          → returns just `output` (string) to caller
//      → optionally calls ai.getLastReceipt("narrative:DeFi") to grab receipt
//      → stores receipt rootHash in Supabase next to the memo
//
// WHEN SKILLMINT FAILS
// ───────────────────
// We follow the exact same pattern as groq/gemini/claude: if the SkillMint call
// throws (network down, no USDC.E balance, skill not found, etc.) we fall back
// to a local plaintext memo so the agent cycle never crashes. The fallback
// memos are byte-for-byte identical to the ones in groq.ts so the user-facing
// behavior is unchanged on failure.
//
// CONFIG (read from .env)
// ──────────────────────
//   AI_SERVICE=skillmint                  ← flips the global router to use us
//   SKILLMINT_AGENT_KEY=0x...             ← server wallet that holds 0G/USDC.E
//   SKILLMINT_NETWORK=mainnet|testnet     ← default "mainnet"
//   SKILLMINT_NARRATIVE_SKILL_ID=2        ← which on-chain skill runs narrative
//   SKILLMINT_RISK_SKILL_ID=3             ← which on-chain skill runs risk
//   SKILLMINT_SUMMARY_SKILL_ID=4          ← daily summary (optional, falls back
//                                          to NARRATIVE_SKILL_ID if unset)
//   SKILLMINT_X402_URL=...                ← override the x402 endpoint base
//                                          (default = SDK's mainnet alias)
//
// SETUP CHECKLIST (one-time)
// ─────────────────────────
//   1. `npm install @skillmint/sdk ethers`
//   2. Set `AI_SERVICE=skillmint` in .env
//   3. Provision SKILLMINT_AGENT_KEY (any wallet — bridge USDC.E to it via
//      XSwap. ~$1-5 of USDC.E lasts ~weeks at current cycle frequency.)
//   4. Pick a SkillMint skill ID to route narrative memos to. Skill #2
//      ("0G Expert" on mainnet) is a sensible default — it's a general-purpose
//      analyst skill. For better signal quality, publish your own skill on
//      SkillMint with the Sentinel prompt template encrypted on 0G Storage —
//      then the proprietary prompt never leaves the TEE.
//   5. Restart the backend. Watch logs — the AI service banner should now
//      print "Using Skillmint".
//
// LATENCY + COST NOTE
// ──────────────────
//   - SkillMint adds ~5-10s per call (vs groq's ~2-3s). Fine for the 30-min
//     orchestrator cycle, not fine for sub-second hot paths.
//   - ~$0.01 USDC.E per call. With 3 narrative memos × 48 cycles/day +
//     occasional risk memos, expect ~$1-2/day in stablecoin spend.
//   - On failure, the agent falls back to plaintext local memos — zero risk
//     of breaking the cycle, but in those moments the receipt provenance
//     story is bypassed. Monitor [Skillmint] WARN logs to detect this.
// ─────────────────────────────────────────────────────────────────────────────

import type { Headline, MacroEvent } from '../types/domain';
import errorUtils = require('../utils/error');

const { getErrorMessage } = errorUtils;

// ── Method input contracts — IDENTICAL to groq.ts / gemini.ts / claude.ts ────
// Keeping these in lockstep with the other adapters is mandatory. If the
// agents change their input shape, copy that change into all four adapters.

interface NarrativeMemoInput {
  sector: string;
  headlines: Headline[];
  etfFlow: number;
  macroEvents: MacroEvent[];
  scores: { combined: number; signal: string };
}

interface RiskMemoInput {
  symbol: string;
  leverage: number;
  distancePct: number;
  macroEvents: Array<{ name: string; hoursUntil: number }>;
  riskScore: number;
  riskLevel: string;
}

interface DailySummaryInput {
  narrativeScores: Array<{ sector: string; combined_score?: number; combined?: number; signal: string }>;
  alerts: unknown[];
  positions: unknown[];
}

// ── Receipt metadata captured per call (the verifiability payload) ──────────
// Stored in `lastReceipts` keyed by a caller-provided string. NarrativeAgent
// calls `getLastReceipt('narrative:DeFi')` right after `generateNarrativeMemo`
// to retrieve this and stash it in Supabase next to the memo content.

export interface SkillMintReceiptMeta {
  /** Permanent rootHash anchored on 0G Storage. The audit primary key. */
  receiptRootHash: string;
  /** 0G mainnet tx hash from the x402 settlement (the payment proof). */
  settlementTx?: string;
  /** 0G skill NFT id that produced this memo (deploy-time config). */
  skillId: number;
  /** Amount paid for this call, e.g. "0.01". */
  paidUSDC?: string;
  /** When the call completed (server time, not chain time). */
  capturedAt: number;
}

const lastReceipts = new Map<string, SkillMintReceiptMeta>();

// ── Configuration (env-driven, no hardcoded mainnet vs testnet) ─────────────

const NETWORK = (process.env.SKILLMINT_NETWORK || 'mainnet') as 'mainnet' | 'testnet';
const NARRATIVE_SKILL_ID = Number(process.env.SKILLMINT_NARRATIVE_SKILL_ID || 2);
const RISK_SKILL_ID = Number(process.env.SKILLMINT_RISK_SKILL_ID || 2);
const SUMMARY_SKILL_ID = Number(process.env.SKILLMINT_SUMMARY_SKILL_ID || NARRATIVE_SKILL_ID);
const X402_URL = process.env.SKILLMINT_X402_URL; // optional override

// ── Client construction (deferred and lazy) ─────────────────────────────────
// We initialise the SkillMint client lazily on first call. Two reasons:
//   1. If AI_SERVICE is set but SKILLMINT_AGENT_KEY isn't, we still want the
//      adapter to be requireable so `services/ai.ts` doesn't crash at boot.
//      Instead we'll fall through to local memos at call time.
//   2. The SDK pulls in ethers etc. — keeping the import lazy means projects
//      that don't use SkillMint don't pay the cold-start cost.

let client: any = null;
let clientInitTried = false;

function getClient(): any {
  if (clientInitTried) return client;
  clientInitTried = true;

  if (!process.env.SKILLMINT_AGENT_KEY) {
    console.warn('[Skillmint] SKILLMINT_AGENT_KEY not set — falling back to local memos.');
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SkillMintClient } = require('@skillmint/sdk');
    client = new SkillMintClient({
      privateKey: process.env.SKILLMINT_AGENT_KEY,
      network: NETWORK,
      ...(X402_URL ? { x402Url: X402_URL } : {}),
    });
    console.log(`[Skillmint] Client ready on ${NETWORK}. NARRATIVE_SKILL=${NARRATIVE_SKILL_ID} RISK_SKILL=${RISK_SKILL_ID} SUMMARY_SKILL=${SUMMARY_SKILL_ID}`);
    return client;
  } catch (error) {
    console.warn(`[Skillmint] SDK init failed (is @skillmint/sdk installed?): ${getErrorMessage(error)}`);
    return null;
  }
}

// ── Fallback memos — IDENTICAL to the ones in groq.ts ───────────────────────
// Copied verbatim so that on SkillMint failure the user-facing output matches
// what groq would have produced on its own failure. If you tune one, tune all.

function fallbackNarrativeMemo({
  sector, scores, etfFlow, macroEvents,
}: { sector: string; scores: { combined: number; signal: string }; etfFlow: number; macroEvents: MacroEvent[] }): string {
  const macro = macroEvents.length ? `Macro is not clear because ${macroEvents[0].name} is on deck.` : 'Macro is relatively calm in the next 48 hours.';
  const flow = etfFlow >= 0 ? 'Institutional flows are supportive.' : 'Institutional flows are defensive.';
  return `${sector} is showing ${scores.signal} because headline density is building and the combined score is ${scores.combined}/100. ${flow} ${macro}`;
}

function fallbackRiskMemo({
  symbol, riskLevel, distancePct,
}: { symbol: string; riskLevel: string; distancePct: number }): string {
  return `${symbol} is ${riskLevel} because liquidation is only ${distancePct.toFixed(2)}% away and the margin buffer is thin. Reduce leverage or add margin now.`;
}

function fallbackDailySummary({ narrativeScores, alerts, positions }: DailySummaryInput): string {
  const top = narrativeScores[0];
  const signalLine = top ? `Top narrative was ${top.sector} at ${top.combined_score ?? top.combined}/100.` : 'No strong narrative signal printed today.';
  return `Market tone was mixed across the latest cycle set. ${signalLine} ${alerts.length} alerts fired while ${positions.length} position snapshots were monitored. Watch the next macro window before adding new risk.`;
}

// ── Core execution helper ──────────────────────────────────────────────────
// Sends a prompt to a SkillMint skill via x402 and returns the output string +
// captured receipt metadata. Caller decides what to do with the receipt.

async function runSkill(
  skillId: number,
  prompt: string,
  receiptKey: string,
): Promise<string | null> {
  const sm = getClient();
  if (!sm) return null;

  try {
    // executeX402 returns:
    //   {
    //     output:            "Bearish — whale outflows +30%, wait.",
    //     receiptRootHash:   "0xabc...ef02",
    //     settlement:        { transaction: "0x...", network: "0g-mainnet", payer: "0x..." },
    //     paidW0G:           "0",
    //     paidUSDC:          "0.01",
    //   }
    const r = await sm.executeX402(skillId, prompt);

    // Stash the audit receipt under the caller-provided key so the agent can
    // pick it up immediately after this call returns.
    lastReceipts.set(receiptKey, {
      receiptRootHash: r.receiptRootHash,
      settlementTx: r.settlement?.transaction,
      skillId,
      paidUSDC: r.paidUSDC,
      capturedAt: Date.now(),
    });

    return (r.output || '').trim() || null;
  } catch (error) {
    console.warn(`[Skillmint] Skill ${skillId} call failed (${receiptKey}): ${getErrorMessage(error)}. Falling back to local memo.`);
    return null;
  }
}

// ── Prompt builders ────────────────────────────────────────────────────────
// We rebuild the SAME prompt the groq adapter sends, so SkillMint skills are
// drop-in compatible — they receive the same data shape and produce the same
// kind of output. If the customer later publishes a Sentinel-specific skill
// with the prompt template encrypted on 0G Storage, they can switch the skill
// ID and use a shorter `input` (just the JSON data). For now this keeps the
// integration zero-config beyond the env vars.

function buildNarrativePrompt({ sector, headlines, etfFlow, macroEvents, scores }: NarrativeMemoInput): string {
  return `You are Sentinel Finance's AI analyst. Write a 2-sentence trading memo.

Sector: ${sector}
Signal: ${scores.signal} (Score: ${scores.combined}/100)
ETF 7-day Net Flow: $${Number(etfFlow || 0).toLocaleString()}
Upcoming Macro Events: ${macroEvents.map(e => e.name).join(', ') || 'None in next 48h'}

Top Headlines:
${headlines.slice(0, 4).map(h => `- ${h.title}`).join('\n')}

Write exactly 2 sentences:
1. Why this sector is showing this signal right now using the actual data
2. What the trader should watch or do

Be direct. Sound like a hedge fund analyst. No fluff.`;
}

function buildRiskPrompt({ symbol, leverage, distancePct, macroEvents, riskScore, riskLevel }: RiskMemoInput): string {
  return `You are Sentinel Finance's risk officer. Write a 2-sentence risk warning.

Position: ${symbol} at ${leverage}x leverage
Distance to Liquidation: ${distancePct.toFixed(2)}%
Risk Score: ${riskScore}/100 - ${riskLevel}
Upcoming Events: ${macroEvents.map(e => `${e.name} in ${e.hoursUntil.toFixed(1)}h`).join(', ') || 'None imminent'}

Write exactly 2 sentences:
1. What specifically makes this position dangerous right now
2. The single most important action to take

Be blunt. This person could lose real money. No hedging.`;
}

function buildSummaryPrompt({ narrativeScores, alerts, positions }: DailySummaryInput): string {
  return `You are Sentinel Finance's AI. Write a 3-sentence daily market brief.

Top Signals Today: ${narrativeScores.slice(0, 3).map(s => `${s.sector}: ${s.combined_score ?? s.combined}/100 (${s.signal})`).join(', ') || 'No strong signals'}
Alerts Fired: ${alerts.length}
Positions Monitored: ${positions.length}

Write 3 sentences covering:
1. Overall market narrative today
2. Biggest risk or opportunity
3. What to watch tomorrow

Sound like a hedge fund morning note. Professional and direct.`;
}

// ── Public API — matches groq/gemini/claude exactly ────────────────────────

const skillmint = {
  async generateNarrativeMemo(input: NarrativeMemoInput): Promise<string> {
    const prompt = buildNarrativePrompt(input);
    const key = `narrative:${input.sector}`;
    const result = await runSkill(NARRATIVE_SKILL_ID, prompt, key);
    return result || fallbackNarrativeMemo(input);
  },

  async generateRiskMemo(input: RiskMemoInput): Promise<string> {
    const prompt = buildRiskPrompt(input);
    const key = `risk:${input.symbol}`;
    const result = await runSkill(RISK_SKILL_ID, prompt, key);
    return result || fallbackRiskMemo(input);
  },

  async generateDailySummary(input: DailySummaryInput): Promise<string> {
    const prompt = buildSummaryPrompt(input);
    const key = 'summary:daily';
    const result = await runSkill(SUMMARY_SKILL_ID, prompt, key);
    return result || fallbackDailySummary(input);
  },

  // ── Side-channel APIs ─────────────────────────────────────────────────────
  // These are SkillMint-specific. Agents that want verifiable provenance can
  // call them right after a generate* call. Other adapters (groq/gemini/
  // claude) don't expose these — agents should use optional chaining:
  //
  //     const receipt = (ai as any).getLastReceipt?.('narrative:DeFi');
  //
  // so that switching AI_SERVICE doesn't crash the agent.

  /** Get the receipt metadata for the most recent call with a given key. */
  getLastReceipt(key: string): SkillMintReceiptMeta | null {
    return lastReceipts.get(key) || null;
  },

  /** Clear the receipt cache. Useful in tests, not in production. */
  clearReceipts(): void {
    lastReceipts.clear();
  },

  /** Whether the SkillMint client successfully initialised (for /health). */
  isReady(): boolean {
    return getClient() !== null;
  },
};

export = skillmint;
