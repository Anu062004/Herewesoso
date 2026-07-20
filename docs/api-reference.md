# Gold & Grith API reference

Last reviewed: **2026-07-19**

The Express backend serves JSON. It mounts most routes below `/api`; liveness is also available at `/health`. The Next.js frontend normally calls these routes through `/api/proxy/*`, which forwards cookies to the backend.

## Authentication classes

| Class | Meaning |
|---|---|
| Public | No wallet session required. Public routes are still subject to the global 300 requests/minute/IP limit. |
| Wallet | Requires the `gold_grith_wallet_session` HttpOnly cookie created by the SIWE flow. |
| Operator | Requires a wallet session whose address is explicitly listed in `OPERATOR_WALLET_ADDRESSES`. Live production execution requires this identity to differ from `SODEX_ACCOUNT_ADDRESS`. |
| Operator or cron | Accepts an operator wallet session or `Authorization: Bearer <CRON_SECRET>`. |

In production, login challenges and sessions require HTTPS, a stable `SODEX_SESSION_SECRET`, and the production schema. Cookies are `HttpOnly`, `SameSite=Strict`, and `Secure` on secure/production requests.

## Health and operations

| Method | Route | Auth | Notes |
|---|---|---|---|
| `GET` | `/health` | Public | Minimal liveness payload only. |
| `GET` | `/api/health` | Operator | Persistence, AI/Telegram state, key status, and SoDEX execution readiness; live modes degrade to `503` when static readiness fails. |
| `GET` | `/api/agent-runs` | Operator | Latest orchestrator run. |
| `POST` | `/api/trigger` | Operator or cron | Runs one full cycle; limited to 3/minute/IP. |
| `POST` | `/api/daily-summary` | Operator or cron | Forces the Telegram daily summary; limited to 3/minute/IP. |
| `POST` | `/api/test-telegram` | Operator | Sends a test message; limited to 3/minute/IP. |

## Intelligence and portfolio data

| Method | Route | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/signals` | Wallet | Latest 16 scores, enriched with connected-wallet portfolio relevance. |
| `GET` | `/api/positions` | Wallet; Operator in live modes | Connected-wallet view in `dry_run`; configured execution-account view in `testnet`/`mainnet_canary`. |
| `GET` | `/api/risks` | Wallet | Up to 100 stored risk snapshots for the connected wallet. |
| `GET` | `/api/risks/backtest` | Wallet | Calibration summary from up to 2,000 stored snapshots. |
| `GET` | `/api/alerts` | Operator | Latest 20 global or operator-wallet alerts. |
| `GET` | `/api/memos` | Operator | Latest 5 global or operator-wallet memos. |
| `GET` | `/api/macro` | Public | Upcoming macro events. |
| `POST` | `/api/analyze` | Operator | Runs on-demand narrative analysis; limited to 5/minute/IP. |
| `GET` | `/api/performance` | Operator | Wallet-scoped performance report. |
| `GET` | `/api/performance/signals` | Operator | Recent resolved signal outcomes. |
| `POST` | `/api/performance/resolve` | Operator or cron | Resolves pending outcomes; limited to 3/minute/IP. |
| `GET` | `/api/executions?limit=100` | Operator | Execution ledger; `limit` is 1–250. |

## Narrative v2

| Method | Route | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/narrative/preferences` | Wallet | Returns stage/confidence/crowding preferences. |
| `POST` | `/api/narrative/preferences` | Wallet | Saves preferences; scores are clamped to 0–100. |
| `POST` | `/api/narrative/feedback` | Wallet | Saves usefulness feedback for a signal UUID. |
| `POST` | `/api/narrative/ask` | Wallet | Deterministic grounded advisor; accepts `question`, `investableAmount`, and `riskMode`. |
| `GET` | `/api/narrative/ask/history` | Wallet | Latest 30 conversations. |
| `GET` | `/api/narrative/ask/recommendations` | Wallet | Latest 30 recommendations. |
| `POST` | `/api/narrative/ask/recommendations/:id/feedback` | Wallet | Sets `ACCEPTED`, `REJECTED`, or `SAVED`. |

## SoSoValue-backed reads

| Method | Route | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/news?limit=30` | Public | Normalized news; `limit` is 1–100; one-minute cache. |
| `GET` | `/api/news/hot` | Public | Normalized hot news; one-minute cache. |
| `GET` | `/api/news/etf` | Public | ETF data; five-minute cache. |
| `GET` | `/api/news/macro?date=YYYY-MM-DD` | Public | Macro feed; five-minute cache. |
| `GET` | `/api/indices` | Public | Normalized SoSoValue indices. |
| `GET` | `/api/indices/:identifier/history?days=90` | Public | History window clamped to 7–365 days. |

## SoDEX reads and wallet session

`network` query values other than `mainnet` resolve to `testnet`. Symbols must match an uppercase `BASE-QUOTE` form such as `BTC-USD`.

| Method | Route | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/sodex/markets?network=testnet&symbol=BTC-USD` | Public | Perps mark prices. |
| `GET` | `/api/sodex/orderbook/:symbol?limit=20&network=testnet` | Public | `limit` is 1–100. |
| `GET` | `/api/sodex/klines/:symbol?interval=1h&limit=100&network=testnet` | Public | Intervals: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`; limit 1–500. |
| `GET` | `/api/sodex/chart-analysis/:symbol?interval=1h&limit=240&network=testnet` | Public | Deterministic technical analysis; requests at least 50 and at most 500 candles. |
| `GET` | `/api/sodex/account` | Wallet | Account, balances, and enriched positions for the session wallet/network. |
| `GET` | `/api/sodex/orders?symbol=BTC-USD` | Wallet | Open orders for the session wallet/network. |
| `GET` | `/api/sodex/smoke?network=testnet&symbol=BTC-USD` | Operator | Read-only upstream smoke test. |
| `GET` | `/api/sodex/login-challenge?network=testnet&address=0x...` | Public | Creates a domain-bound EIP-4361 message with a 5-minute, single-use nonce; limited to 10/minute/IP. |
| `POST` | `/api/sodex/connect` | Public | Verifies the SIWE signature, persists the wallet identity/session, and sets the session cookie; limited to 10/minute/IP. |
| `GET` | `/api/sodex/session` | Wallet | Returns and refreshes connection metadata. |
| `GET` | `/api/sodex/session/verify` | Wallet | Returns the validated durable session identity and expiry. |
| `POST` | `/api/sodex/disconnect` | Public | Clears the session cookie. |

The login signature proves wallet identity only. It does not sign a trade. Every non-dry-run action is signed by the deployment-managed registered SoDEX API key after operator authorization and policy checks.

## Cross-exchange Shield

| Method | Route | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/shield/connections` | Wallet | Lists the session wallet's SoDEX and masked CEX connections; credentials are never returned. |
| `POST` | `/api/shield/connections` | Wallet | Verifies and encrypts a Binance, Bybit, or OKX read-only key. |
| `DELETE` | `/api/shield/connections/:id` | Wallet | Deletes only a connection owned by the session wallet. |
| `GET` / `POST` | `/api/shield/scan` | Wallet | Fetches every owned connection and returns a normalized cross-venue risk scan. |

CEX secrets use AES-256-GCM with a dedicated `EXCHANGE_CREDENTIALS_KEY`. Binance uses `/fapi/v2/positionRisk`; Bybit uses `/v5/position/list`; OKX uses `/api/v5/account/positions`. Each request uses the venue's documented HMAC authentication and a ten-second timeout. Keys should have trading and withdrawals disabled.

## Strategy Marketplace

| Method | Route | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/strategies` | Public | Published catalog; accepts `search` and `category`, or authenticated `mine=true`. |
| `GET` | `/api/strategies/:id` | Public/owner | Published details; owners may also read drafts. |
| `POST` | `/api/strategies` | Wallet | Creates a wallet-owned draft. |
| `PATCH` | `/api/strategies/:id` | Wallet owner | Edits a draft; published manifests are immutable. |
| `POST` | `/api/strategies/:id/publish` | Wallet owner | Stores a numbered manifest and SHA-256 content hash, then publishes it. |
| `POST` / `DELETE` | `/api/strategies/:id/install` | Wallet | Installs or removes the current version for the session wallet. |
| `GET` | `/api/strategies/installations/mine` | Wallet | Lists wallet-scoped installations. |
| `POST` | `/api/strategies/:id/reviews` | Wallet | Reviews an installed strategy. |
| `POST` | `/api/strategies/:id/performance-claims` | Wallet owner | Submits evidence as `PENDING`; only `VERIFIED` claims are public. |

## On-chain automation

| Method | Route | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/automation/config` | Wallet | Returns the current chain, configured executor address, and safeguards. |
| `GET` | `/api/automation/rules` | Wallet | Lists receipt-verified rules owned by the session wallet. |
| `POST` | `/api/automation/rules/prepare` | Wallet | Encodes an unsigned `createRule` transaction; the browser wallet submits it. |
| `POST` | `/api/automation/rules/register` | Wallet | Verifies the confirmed receipt and wallet-owned `RuleCreated` event before indexing. |
| `POST` | `/api/automation/rules/:ruleId/cancel/prepare` | Wallet | Encodes owner cancellation. |
| `POST` | `/api/automation/rules/:ruleId/cancel/confirm` | Wallet | Marks an already confirmed cancellation in the off-chain index. |
| `POST` | `/api/automation/executions/prepare` | Wallet | Encodes a permissionless keeper execution using the committed calldata. |

The contract is non-custodial and is not represented as deployed merely because source and bytecode compile. A deployment becomes available only after an audited address is configured for the selected network.

## Actions

Supported action names are `CLOSE_POSITION`, `REDUCE_LEVERAGE`, `CANCEL_ORDER`, and `QUEUE_ACTION`.

| Method | Route | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/actions/simulate` | Operator | Hydrates the configured execution account in live modes, evaluates policy, and records a simulation. |
| `POST` | `/api/actions/prepare` | Operator | Revalidates account context and policy, then reports `managed_registered_api_key` authorization for live execution. It never returns trade-signing material. |
| `POST` | `/api/actions/confirm-wallet` | Operator | Disabled compatibility endpoint; always returns `409` with `CONNECTED_WALLET_EXECUTION_UNSUPPORTED`. |
| `POST` | `/api/actions/confirm` | Operator | Claims the durable audit row and executes dry-run, queue-only, testnet, or guarded mainnet-canary actions through the managed registered key. |
| `POST` | `/api/actions` | Operator | Alias of `/api/actions/confirm`. |

Example simulation:

```json
{
  "action": "REDUCE_LEVERAGE",
  "symbol": "BTC-USD",
  "currentLeverage": 20,
  "targetLeverage": 10
}
```

Cancel requests accept `orderId`, `clOrdId`, or `cancels` (up to 100 items). Close-position requests derive the side and quantity from the live position and use a reduce-only IOC limit order.

### SoDEX execution model

Normal trading actions use a dedicated, non-default registered API key. The operator session authorizes the application workflow; it is not the SoDEX trade signer. Before every write, the backend requires the managed provider, exact execution mode/network/chain match, a master account address distinct from the signing key, durable Supabase persistence, and a verifiable `SODEX_API_KEY_NAME` → public-key match from the SoDEX account API. Key lookup errors fail closed. Every signed write carries `X-API-Key`.

Live nonces are allocated atomically by the `allocate_sodex_nonce` database function. Apply `docs/production-hardening-schema.sql` before setting `EXECUTION_MODE=testnet` or `mainnet_canary`.

## Errors and request tracing

Errors are JSON and generally include `error`; security and middleware errors also include a stable `code`. The backend accepts a valid 8–128 character `X-Request-Id` or creates one, returns it in the response, and logs it. Request bodies are limited to 64 KiB JSON. Production operational routes fail closed if durable persistence, distributed rate limiting, or execution auditing is unavailable.
