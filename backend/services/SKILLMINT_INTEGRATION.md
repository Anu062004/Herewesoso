# SkillMint integration

Last reviewed against `backend/services/skillmint.ts`, installed `@skillmint/sdk` **0.4.1**, and the upstream [SkillMint repository](https://github.com/ayushsaklani-min/SkillMint): **2026-07-19**

SkillMint is Gold & Grith's optional fifth AI adapter, alongside Groq, xAI Grok, Gemini, and Claude. It calls a SkillMint AI skill through `executeX402`, returns the text through the common AI interface, and exposes receipt metadata to the narrative and shield agents.

This integration is optional. The default `AI_SERVICE` is `groq`.

## Current support status

| Capability | Status |
|---|---|
| Narrative memo generation | Implemented |
| Risk memo generation | Implemented |
| Daily summary generation | Implemented |
| Receipt root validation | Implemented; a missing/malformed root fails the call |
| Narrative/risk receipt persistence | Implemented in `trade_memos.data.skillmint_receipt` |
| Daily-summary receipt persistence | Not implemented; the adapter caches it in memory only |
| W0G payment amount in persisted metadata | Not implemented; only `paidUSDC` is currently copied from the SDK response |
| Production fallback to unattested text | Disabled; production throws and fails the cycle |
| Development fallback | Deterministic local memo, clearly outside the attested path |

The current public SkillMint x402 endpoint is documented upstream as advertising W0G by default, although SDK 0.4.1 can accept W0G or USDC.E payment challenges. The old version of this guide incorrectly told operators to fund only USDC.E and assumed a fixed USDC price. Do not rely on that assumption: discover the selected skill and endpoint's current payment requirement before funding a wallet.

## Files and data flow

| File | Responsibility |
|---|---|
| `backend/services/skillmint.ts` | Builds prompts, lazily creates `SkillMintClient`, calls `executeX402`, validates `receiptRootHash`, and caches receipt metadata by key. |
| `backend/services/ai.ts` | Selects the adapter when `AI_SERVICE=skillmint`. |
| `backend/agents/narrativeAgent.ts` | Reads `narrative:<sector>` receipts and stores them beside narrative memos. |
| `backend/agents/shieldAgent.ts` | Reads `risk:<symbol>` receipts and stores them beside risk memos. |
| `backend/agents/orchestrator.ts` | Generates the daily summary but does not currently persist `summary:daily` receipt metadata. |
| `.env.example` | Canonical SkillMint configuration template. |

Receipt keys are:

- `narrative:<sector>`
- `risk:<symbol>`
- `summary:daily`

The adapter returns `Promise<string>` like every other provider. `getLastReceipt(key)` is a SkillMint-only side channel so agents can capture provenance without changing the shared text-returning interface.

## Configuration

The SDK is already declared in the root package and lockfile. A normal repository install is sufficient:

```bash
npm ci
```

Set:

```env
AI_SERVICE=skillmint
SKILLMINT_AGENT_KEY=0x<dedicated-32-byte-private-key>
SKILLMINT_NETWORK=mainnet
SKILLMINT_NARRATIVE_SKILL_ID=2
SKILLMINT_RISK_SKILL_ID=2
SKILLMINT_SUMMARY_SKILL_ID=2
SKILLMINT_X402_URL=
```

Rules:

- Use a dedicated server wallet; do not reuse the monitored SoDEX wallet or a master trading wallet.
- `SKILLMINT_AGENT_KEY` must be a non-zero 32-byte EVM private key in production.
- `SKILLMINT_NETWORK` must be `testnet` or `mainnet`.
- Skill IDs must be positive integers. The repository defaults to `2`, but availability, model, prompt, and pricing are upstream state; validate them before deployment.
- Leave `SKILLMINT_X402_URL` empty to use the SDK network default. If overridden in production, use an approved HTTPS endpoint.
- Fund only the asset requested by the selected x402 endpoint. SDK 0.4.1 supports W0G and USDC.E challenges; consult the current upstream SDK documentation for wrapping/bridging steps.

Restart the backend after configuration. Initialization is lazy, so the client-ready log appears on the first SkillMint generation call rather than necessarily at process startup:

```text
[AI] Using Skillmint
[Skillmint] Client ready on <network>. NARRATIVE_SKILL=<id> RISK_SKILL=<id> SUMMARY_SKILL=<id>
```

## Run and inspect

Trigger a cycle through an authenticated operator action or the cron-authorized endpoint described in the root README. Narrative and risk memos persist a receipt shaped like:

```json
{
  "receiptRootHash": "0x...",
  "settlementTx": "0x...",
  "skillId": 2,
  "paidUSDC": "0",
  "capturedAt": 1784428200000
}
```

`paidUSDC: "0"` does not mean execution was free; the current endpoint may have charged W0G, which this adapter does not yet persist. Use the settlement transaction and current SDK receipt/payment APIs for authoritative payment evidence.

Query stored receipts:

```sql
SELECT
  id,
  memo_type,
  related_symbol,
  data->'skillmint_receipt'->>'receiptRootHash' AS receipt_root,
  data->'skillmint_receipt'->>'settlementTx' AS settlement_tx,
  data->'skillmint_receipt'->>'skillId' AS skill_id,
  data->'skillmint_receipt'->>'paidUSDC' AS recorded_paid_usdc,
  created_at
FROM trade_memos
WHERE data->'skillmint_receipt' IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

No schema migration is required because receipt metadata lives in the existing `data` JSONB field.

## Verify a receipt

Use the installed SDK instead of depending on an undocumented storage URL shape:

```js
import { SkillMintClient } from '@skillmint/sdk';

const client = new SkillMintClient({
  privateKey: process.env.SKILLMINT_AGENT_KEY,
  network: process.env.SKILLMINT_NETWORK || 'mainnet'
});

const receipt = await client.fetchReceipt(process.env.RECEIPT_ROOT_HASH);
console.log(client.verifyReceipt(receipt));
```

Run verification in a controlled local script without printing the private key. A valid result checks the receipt's input/output hashes and TEE-verification flag according to the installed SDK. Verification proves what the receipt contains; it does not independently prove trading quality, model suitability, or future performance.

## Failure behavior

In production:

- missing key, SDK initialization failure, upstream failure, invalid receipt root, or empty output throws;
- the agent/orchestrator cycle fails;
- no deterministic fallback is stored or delivered as if it were attested.

In development, the same failures log a warning and return a deterministic local memo. That memo has no SkillMint receipt and must not be represented as verified output.

## Operational guidance

- Discover current skill metadata and payment requirements before choosing a skill ID.
- Monitor the dedicated payer wallet and settlement transactions; do not hard-code a cost estimate in operational budgets.
- Measure latency in your deployment rather than relying on historical numbers.
- Alert on repeated `[Skillmint]` failures and on missing receipts when `AI_SERVICE=skillmint`.
- Treat receipt retention as part of the audit trail. Narrative/risk rows retain receipt roots even after switching providers.
- If daily summaries require the same audit guarantee, persist `getLastReceipt('summary:daily')` before calling the integration complete for that memo type.
- If W0G cost reporting matters, extend `SkillMintReceiptMeta` and `runSkill` to store `paidW0G` from the SDK response.

## Maintenance triggers

Re-review this guide when any of these change:

- `@skillmint/sdk` version or `executeX402` response types;
- default x402 URL or advertised payment asset;
- selected skill IDs or network;
- `skillmint.ts`, AI dispatch, or memo persistence call sites;
- receipt verification semantics;
- production fallback behavior.

Upstream support and issues: [ayushsaklani-min/SkillMint](https://github.com/ayushsaklani-min/SkillMint).
