# SkillMint Integration — Sentinel Finance

> **What this is:** A drop-in 4th AI provider for Sentinel Finance that routes every
> agent memo through TEE-attested skill execution on 0G mainnet. Every memo comes
> back with an on-chain receipt rootHash that anyone can verify forever.
>
> **Status:** Free integration courtesy of the SkillMint team. No paid contract,
> no support obligation. Bugs and questions: open a GitHub issue on
> [ayushsaklani-min/SkillMint](https://github.com/ayushsaklani-min/SkillMint).

---

## What changed in your repo

Six surgical edits — no agent logic touched, no schemas migrated, no breaking
changes for existing AI providers.

| File | Change |
|---|---|
| `backend/services/skillmint.ts` | **NEW** — 4th adapter implementing the same `{ generateNarrativeMemo, generateRiskMemo, generateDailySummary }` API as groq/gemini/claude. Calls `client.executeX402(...)` per memo, caches the receipt rootHash in a per-key Map, returns the memo string. |
| `backend/services/ai.ts` | One-line patch — adds `service === 'skillmint' ? skillmint : claude` to the dispatch chain. Default stays `groq`. |
| `.env.example` | Added the `SKILLMINT_*` config block with comments explaining each variable. |
| `backend/agents/narrativeAgent.ts` | Reads `(claude as any).getLastReceipt?.('narrative:<sector>')` after each `generateNarrativeMemo` call. Stores receipt in `trade_memos.data.skillmint_receipt`. **Zero behavior change when AI_SERVICE is anything other than `skillmint`** — the optional chaining returns undefined and the new field is just `null`. |
| `backend/agents/shieldAgent.ts` | Same pattern for `generateRiskMemo` — captures `risk:<symbol>` receipt, stores in the same `trade_memos.data.skillmint_receipt` field. |
| `backend/services/SKILLMINT_INTEGRATION.md` | This document. |

`package.json` needs one new dependency:

```bash
npm install @skillmint/sdk ethers
```

(`ethers` is already a top-level dependency in your repo; the SDK uses the same
version range so no conflict.)

---

## How to turn it on

1. **Install the SDK** (one-time):

   ```bash
   npm install @skillmint/sdk
   ```

2. **Generate a server wallet** for paying memo calls. Any ethers-compatible
   key works. Use a NEW wallet — don't reuse `USER_WALLET_ADDRESS`. The new
   wallet only needs USDC.E on 0G mainnet (and a tiny amount of 0G for gas,
   but x402 payments are gasless so even that's optional).

3. **Bridge ~$1-5 USDC to 0G mainnet** via [XSwap](https://app.xswap.link).
   Source chain: Ethereum mainnet. Destination: 0G. It arrives as USDC.E at
   `0x1f3aa82227281ca364bfb3d253b0f1af1da6473e`. Send to your new server wallet.

4. **Add to `.env`:**

   ```env
   AI_SERVICE=skillmint
   SKILLMINT_AGENT_KEY=0x<your-new-server-wallet-private-key>
   SKILLMINT_NETWORK=mainnet
   SKILLMINT_NARRATIVE_SKILL_ID=2
   SKILLMINT_RISK_SKILL_ID=2
   SKILLMINT_SUMMARY_SKILL_ID=2
   ```

5. **Restart the backend.** You should see:

   ```
   [AI] Using Skillmint
   [Skillmint] Client ready on mainnet. NARRATIVE_SKILL=2 RISK_SKILL=2 SUMMARY_SKILL=2
   ```

6. **Run one cycle** (`POST /api/trigger` or wait 30 min). Check `trade_memos`
   in Supabase — the most recent `ENTRY_SIGNAL` row should have a populated
   `data.skillmint_receipt` field with `receiptRootHash`, `settlementTx`,
   `skillId`, `paidUSDC`, and `capturedAt`.

7. **Verify the receipt manually** to confirm the chain-of-trust works:

   ```bash
   curl "https://indexer-storage-turbo.0g.ai/file?root=<receiptRootHash>"
   ```

   That returns the full TEE-signed receipt body. It will look something like:

   ```json
   {
     "skillId": 2,
     "input": "You are Sentinel Finance's AI analyst. ...",
     "inputHash": "0x...",
     "output": "AI sector is showing STRONG_BUY because ...",
     "outputHash": "0x...",
     "teeVerified": true,
     "providerAddress": "0x...",
     "model": "deepseek-chat-v3-0324",
     "paidUSDC": "0.01",
     "timestamp": 1747257600000
   }
   ```

   That's the audit primary key — the receipt is now permanent, anyone can fetch
   it, and the cryptographic chain (input → TEE → output) is verifiable.

---

## Operational notes

### Failure handling

The adapter is built for **graceful degradation**. If anything goes wrong
(no SDK installed, no agent key, no USDC.E balance, x402 endpoint down,
0G mainnet RPC stalled, skill paused, etc.), `runSkill()` returns `null` and
the adapter falls back to the same local plaintext memo that groq.ts would have
produced on its own failure. The agent cycle never crashes.

You'll see warnings in the logs:

```
[Skillmint] Skill 2 call failed (narrative:DeFi): <reason>. Falling back to local memo.
```

These are non-fatal. The memo still goes out to Telegram, gets stored in
Supabase, and the cycle completes. The only thing missing in that moment is the
on-chain receipt provenance.

### Cost monitoring

Each memo costs ~$0.01 USDC.E. Default cycle frequency (30 min) with 3 narrative
memos per cycle = ~144 calls/day = ~$1.44/day. ShieldAgent calls are
threshold-gated (`combinedRisk >= ALERT_THRESHOLD`) and typically much rarer.

Watch your server wallet balance with:

```bash
cast balance <wallet> --rpc-url https://evmrpc.0g.ai
```

Or check the ERC-20 USDC.E balance via Chainscan.

### Latency

SkillMint adds ~5-10 seconds per memo (vs Groq's ~2-3s). Negligible for the
30-minute orchestrator cycle. **Do not** put a SkillMint call in a sub-second
hot path.

### Quality

SkillMint skill #2 (the default) is a general-purpose analyst skill running on
0G's open-weight models (Qwen, DeepSeek, GLM-5-FP8). It's solid but not
GPT-5 / Claude 4.6 sharp. If you want production-grade reasoning quality,
publish your own SkillMint skill with a tuned Sentinel-specific system prompt
(encrypted on 0G Storage — buyers run it but never see the prompt) and put its
skillId in `SKILLMINT_NARRATIVE_SKILL_ID`.

We're happy to help publish that custom skill for you — DM
[@ayushsaklani976](https://x.com/ayushsaklani976) on X.

### Supabase schema

The integration stores receipts in the existing `trade_memos.data` JSON column
under key `skillmint_receipt`. No migration required. To query receipts:

```sql
SELECT
  id,
  memo_type,
  related_symbol,
  content,
  data->'skillmint_receipt'->>'receiptRootHash'  AS receipt_root,
  data->'skillmint_receipt'->>'settlementTx'    AS settlement_tx,
  data->'skillmint_receipt'->>'paidUSDC'        AS paid_usdc,
  created_at
FROM trade_memos
WHERE data ? 'skillmint_receipt'
  AND data->'skillmint_receipt' IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

If you'd rather have a dedicated column, run:

```sql
ALTER TABLE trade_memos
  ADD COLUMN skillmint_receipt_root TEXT;
```

Then update the adapter/agent to write to that column directly — but the JSON
approach above works fine with no migration.

---

## How to think about this integration (for your future self or AI assistant)

**Mental model:** Think of SkillMint as a **provider** that returns LLM text AND
a cryptographic receipt. The agents don't know or care which provider is
active — they just get a string. The receipt is captured as side-channel
metadata, picked up by the agent right after the await, and stored next to the
memo it explains.

**Why this design?** The alternative was changing the agent signatures to return
`{ output, receipt }` everywhere — but that would force a breaking change on
groq/gemini/claude adapters that don't have receipts. The side-channel pattern
keeps all four adapters interchangeable and lets the agents stay
provider-agnostic.

**When to remove SkillMint:** If you ever want to fall back permanently to
groq/claude, just set `AI_SERVICE=groq` and the SkillMint adapter is bypassed.
The `skillmint_receipt` field in existing `trade_memos` rows is left alone —
old receipts remain auditable forever via 0G Storage even if the adapter is no
longer running.

**Extending to other memo types:** If you add a new generate* method, add it to:
1. The shared input contracts at the top of `services/skillmint.ts`
2. A new `buildXPrompt` function in `services/skillmint.ts`
3. A new method on the `skillmint` object
4. Make sure groq/gemini/claude adapters get the matching method too
5. Update the agent call site to use `(claude as any).getLastReceipt?.(<key>)`

The receipt key convention is `<memoType>:<entityId>` — e.g. `narrative:DeFi`,
`risk:BTC-USD`, `summary:daily`. Stick to this so the lookups stay predictable.

---

## Questions?

Open an issue: [github.com/ayushsaklani-min/SkillMint/issues](https://github.com/ayushsaklani-min/SkillMint/issues)
Or DM: [@ayushsaklani976 on X](https://x.com/ayushsaklani976)

Public co-marketing welcomed but not required. If you do want to mention this
publicly, the team appreciates being tagged — it helps validate that
production teams ship on SkillMint.
