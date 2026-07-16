# API and EIP-712 Integration Notes

Last reviewed: 2026-07-15

This file summarizes the important implementation details from the SoDEX Trading API, SoDEX/SoSoValue Market Data API, SoSoValue GitBook API docs, and the provided Notion Common APIs link.

## Sources

- SoDEX Trading API overview: https://sodex.com/documentation/trading-api/trading-api
- SoDEX Go SDK signing guide: https://sodex.com/documentation/trading-api/go-sdk-signing-guide
- SoDEX Trading API rate limits: https://sodex.com/documentation/trading-api/api-rate-limits
- SoDEX REST API v1: https://sodex.com/documentation/trading-api/rest-v1
- SoDEX WebSocket API v1: https://sodex.com/documentation/trading-api/websocket-v1
- SoSoValue / SoDEX Market Data API introduction: https://sodex.com/documentation/market-data-api/market-data-api
- SoSoValue API docs: https://sosovalue-1.gitbook.io/sosovalue-api-doc
- Common APIs Notion link: https://www.notion.so/Common-APIs-167b57bd102a4c03b8f2421108fc66eb?source=copy_link

Note: the Notion link returned the Notion app shell but did not expose readable page content without page permissions. It appears to require access or public sharing. Re-check once the page is shared publicly or exported.

## EIP-712 In Plain English

EIP-712 is an Ethereum standard for signing structured data instead of signing an opaque string or raw bytes.

Normal message signing can show a wallet user a hard-to-read blob. EIP-712 lets an app define:

- a `domain`, such as protocol name, version, chain ID, and verifying contract
- typed structs, such as `ExchangeAction(bytes32 payloadHash,uint64 nonce)`
- a message object, such as `{ payloadHash, nonce }`

The signer signs the typed message hash. The server or contract can recover the signer address from the signature and verify that the correct key approved that exact action.

For this project, EIP-712 matters because SoDEX trading writes are not just ordinary REST calls. Actions like creating an order, canceling an order, updating leverage, updating margin, or transferring assets need a typed signature. For interactive dashboard actions, the backend builds and hashes the exact payload, the connected browser wallet signs the EIP-712 `ExchangeAction`, and the backend verifies and submits it. Optional automation uses a deployment-managed registered API key.

## SoDEX Trading API

### Base Endpoints

Use perps endpoints for this project because Liquidation Shield is position/risk focused.

Mainnet:

- Spot REST: `https://mainnet-gw.sodex.dev/api/v1/spot`
- Perps REST: `https://mainnet-gw.sodex.dev/api/v1/perps`
- Spot WebSocket: `wss://mainnet-gw.sodex.dev/ws/spot`
- Perps WebSocket: `wss://mainnet-gw.sodex.dev/ws/perps`

Testnet:

- Spot REST: `https://testnet-gw.sodex.dev/api/v1/spot`
- Perps REST: `https://testnet-gw.sodex.dev/api/v1/perps`
- Spot WebSocket: `wss://testnet-gw.sodex.dev/ws/spot`
- Perps WebSocket: `wss://testnet-gw.sodex.dev/ws/perps`

### Key Model

SoDEX has two important signing identities:

- Master wallet: owns the SoDEX account. Use this for account-level actions like adding or revoking API keys.
- API key: revocable EVM signing credential registered to the account. Use this for day-to-day trading actions.

Recommended rule:

- Master wallet signs `addAPIKey` and `revokeAPIKey`.
- Registered API key signs normal trading actions such as `newOrder`, `cancelOrder`, `updateLeverage`, `updateMargin`, `transferAsset`, and `scheduleCancel`.

The current REST reference and official Go SDK also allow direct master-wallet signing for normal writes by omitting `X-API-Key`. Gold & Grith uses that mode for explicit connected-wallet approvals; registered API keys remain the preferred mode for unattended automation.

The `X-API-Key` header carries the API key name, not the API key public address and never the private key.

Gold & Grith deployment note: close-position, reduce-leverage, and cancel-order actions support two signing modes. Registered API-key signing sends `X-API-Key` with the key name, such as `webkey`, and signs with that key's private key. Master-wallet signing omits `X-API-Key` entirely and signs with the master wallet private key. Do not send `X-API-Key: default`; SoDEX treats the default/master signer as the no-header case. If SoDEX returns `API key error: API key not found`, first check that the deployed backend is not sending an old key name like `api-key-01` or `default`.

### Nonce Rules

SoDEX nonces are tracked per signing address:

- trading actions: API key public address
- API key management: master wallet address

Implementation requirements:

- use a unique nonce per signed action
- nonce should be a Unix millisecond timestamp
- nonce must be within the accepted time window around current chain/server time
- store nonces atomically per signing address to avoid duplicate nonce races
- avoid sharing one API key across concurrent bots unless you have a nonce queue

Practical backend recommendation:

- add a `NonceManager` service
- key it by `{environment, marketType, signerAddress}`
- persist last nonce in Supabase or Redis
- return `max(Date.now(), lastNonce + 1)`
- serialize signed writes per signing key

### EIP-712 Domain

For SoDEX trading actions:

- domain name: `spot` for spot actions
- domain name: `futures` for perps actions
- domain version: `1`
- mainnet chain ID: `286623`
- testnet chain ID: `138565`
- verifying contract: `0x0000000000000000000000000000000000000000`

SoDEX typed message:

```ts
types: {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' }
  ],
  ExchangeAction: [
    { name: 'payloadHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint64' }
  ]
}
primaryType: 'ExchangeAction'
message: {
  payloadHash,
  nonce
}
```

After generating the normal 65-byte ECDSA signature, normalize the final recovery byte to `0` or `1`, then prepend byte `0x01`. The final value goes into `X-API-Sign`.

### Payload Hash Rules

SoDEX computes:

```text
payloadHash = keccak256(compact_json({ type, params }))
```

Important pitfalls:

- use compact JSON with no extra whitespace
- preserve the field order expected by the SoDEX Go structs
- decimal fields such as `price`, `quantity`, `funds`, and `stopPrice` must be strings, not numbers
- omit unset `omitempty` fields
- include non-optional fields even if they are zero values
- hash the wrapper `{ type, params }`
- send only the endpoint request body shape expected by the specific HTTP endpoint

Recommended implementation approach:

- define TypeScript builders for each action instead of hand-building arbitrary objects
- keep field order deterministic by constructing object literals in exact order
- add tests that snapshot the compact JSON string before hashing
- compare generated signatures against known SDK examples when available

### Signed REST Headers

Signed write endpoints generally need:

- `Content-Type: application/json`
- `Accept: application/json`
- `X-API-Key: <api-key-name>` when a registered API key signs; omit it for direct master-wallet signing
- `X-API-Sign: 0x01<r><s><recovery-id-0-or-1>`
- `X-API-Nonce: <uint64 nonce>`

Public read endpoints usually only need:

- `Accept: application/json`

### Important Trading Actions For This Project

Liquidation Shield Wave 2 should prioritize:

- `updateLeverage`: reduce leverage when fragility rises
- `newOrder` with `reduceOnly: true`: close or partially close a position
- `cancelOrder`: cancel stale protective orders
- `updateMargin`: add or reduce isolated margin where supported
- `scheduleCancel`: safety cleanup for stale orders

Recommended UI/backend flow:

1. Backend calculates risk and proposes an action.
2. User sees exact action preview in dashboard.
3. Backend builds SoDEX payload.
4. Backend computes payload hash.
5. Connected wallet approves the EIP-712 signature.
6. Backend verifies that the recovered signer matches the authenticated wallet and the short-lived action intent.
7. Backend submits the signed request to SoDEX.
8. Backend stores request, non-sensitive signature metadata, response, and result status.
9. Dashboard shows execution timeline.

Never expose private keys to the frontend. Signing should happen server-side or through a secure wallet flow.

### Rate Limits

REST trading API:

- total request weight budget: `1200` per minute per IP
- endpoints not listed in the docs default to weight `20`
- public market endpoints are usually low weight
- orderbook depth has variable weight
- batch order/cancel/replace weight scales with batch size
- API-key order placement limit: `600` orders per minute and `20` orders per second per account
- WebSocket limits include connection and subscription caps

Implementation requirement:

- add request weight accounting for SoDEX clients
- back off on rate-limit responses
- batch where useful, but keep risk actions small and auditable

### WebSocket Notes

WebSocket endpoints exist for both spot and perps.

Important operational behavior:

- connection may close if no subscription/data activity for more than 60 seconds
- send `{"op":"ping"}` before the idle cutoff
- expect `{"op":"pong"}`
- reconnect if no pong arrives
- user-specific streams do not require subscription authorization according to the docs, so do not treat WebSocket visibility as private access control

For this project:

- use REST first for Wave 2 execution reliability
- use WebSocket later for lower-latency position/order updates
- keep the polling fallback because WebSocket availability can vary

## SoSoValue / Market Data API

### Base URL And Authentication

Base URL:

```text
https://openapi.sosovalue.com/openapi/v1
```

Every request requires:

```text
x-soso-api-key: <YOUR_API_KEY>
```

API key setup flow:

1. create/log in to a SoSoValue account
2. apply for an API key in the developer dashboard
3. wait for approval
4. use the key in request headers

### Response Format

Successful responses use:

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

Paginated responses put `list`, `page`, `page_size`, and `total` inside `data`.

Time-series endpoints usually return `data` as an array.

Empty successful responses may use `data: null`.

### Query Modes

Mode 1: pagination

- used for entity lists like trading pairs, institution lists, and news feeds
- `page` defaults to `1`
- `page_size` defaults to `20`
- `page_size` max is `100`

Mode 2: time window

- used for klines, ETF historical data, and other time-series data
- `start_time` and `end_time` are Unix millisecond timestamps
- `limit` controls the max records returned
- time-series data is returned in ascending chronological order
- paginate by using `last_timestamp + 1` as the next `start_time`

General conventions:

- timestamps are UTC Unix milliseconds
- monetary fields default to USD
- fields are snake_case

### Rate Limits

SoSoValue Market Data API limits:

- monthly quota: `100,000` requests per API key
- frequency: `20` requests per minute

Rate-limit headers:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

If rate limited, expect HTTP `429` with a retry hint in the body.

Implementation requirement:

- cache SoSoValue responses aggressively
- do not poll every panel independently
- use shared backend fetchers and Supabase persistence
- schedule high-value data like ETF flows, macro events, and news feeds in one orchestrator cycle

### Error Format

Errors use a common format:

```json
{
  "code": 400001,
  "message": "Invalid parameter",
  "details": {}
}
```

Important error classes:

- `400001`: invalid parameter format
- `400002`: missing required parameter
- `400003`: invalid parameter value
- `400101`: invalid API key
- `400102`: API key expired
- `400301`: insufficient permissions
- `400401`: resource not found
- `400402`: endpoint not found
- `402901`: too many requests
- `500001`: internal server error
- `500301`: service temporarily unavailable

Backend behavior:

- map these into typed internal errors
- show user-readable failure states in dashboard
- retry only transient `429`, `500`, and `503` classes
- do not retry invalid parameter or auth errors blindly

### Important Market Data Modules

Useful modules for this project:

- Currency and pairs: listed assets, market snapshots, klines, supply, pairs, sector spotlight
- ETF: summary history, ETF list, market snapshots, historical data
- SoSoValue Index: index list, constituents, market snapshots, klines
- Crypto Stocks: stock lists, market snapshots, market cap, klines, sector data
- BTC Treasuries: company list and purchase history
- Feeds: news, hot news, featured news, search
- Fundraising: project list and project details
- Macro: macroeconomic events and historical event data
- Analysis: chart list and chart data

Most relevant to existing Sentinel/Gold & Grit modules:

- Narrative Alpha Scanner:
  - `/news`
  - `/news/hot`
  - `/news/featured`
  - `/news/search`
  - `/currencies/sector-spotlight`
  - `/etfs/summary-history`
  - `/crypto-stocks/sector`
  - `/indices`

- Liquidation Shield / Fragility Index:
  - `/etfs/summary-history`
  - `/macro/events`
  - `/macro/events/{event}/history`
  - currency market snapshots
  - SoDEX perps positions and mark prices

- Public proof / demo:
  - persist every orchestrator run
  - publish selected alerts from SoSoValue data + SoDEX position state
  - include source timestamps and API module names in alert explanations

## Recommended Wave 2 Technical Improvements

### 1. Add SoDEX EIP-712 Execution

Build:

- `sodexSigner.ts`
- `sodexNonceManager.ts`
- `sodexPayloadBuilders.ts`
- `sodexExecutionService.ts`
- execution table in Supabase
- execution audit timeline in frontend

Support first:

- reduce leverage
- close position with reduce-only order
- cancel stale orders

### 2. Add Deterministic Signing Tests

Tests should cover:

- compact JSON generation
- field order
- decimal string handling
- omitted optional fields
- nonce monotonicity
- EIP-712 domain for testnet vs mainnet
- signature prefix `0x01` and compact recovery ID `0/1`

### 3. Add Explainable Risk Actions

For every automated recommendation, store:

- liquidation distance contribution
- macro timing contribution
- ETF flow contribution
- final fragility score
- threshold crossed
- recommended SoDEX action
- signed payload hash if execution was attempted

### 4. Add Rate-Limit Safe Data Pipeline

Because SoSoValue has a tight per-minute API limit, centralize data fetching:

- one backend fetch per module per cycle
- cache results
- persist snapshots
- frontend reads from backend/Supabase, not directly from SoSoValue
- expose stale-data warnings when cache age is high

### 5. Add Public Proof Of Automation

Judges specifically asked for public proof. Add one of:

- public alert archive page
- public Telegram channel
- read-only run log page
- signed execution/demo transcript

For each alert, include:

- timestamp
- risk score
- source modules used
- recommendation
- whether action was simulated or executed

## Implementation Risks

- Key custody: interactive wallets sign locally; private keys must never be requested or transmitted. Automation API-key private keys stay in the deployment secret manager.
- Nonce races: concurrent execution jobs can invalidate each other if they reuse a signing key without serialization.
- Payload mismatch: JSON field order and decimal string formatting can break SoDEX signature verification.
- Rate limits: SoSoValue requests must be cached or the dashboard/orchestrator can quickly hit 20 requests per minute.
- Replay protection: EIP-712 itself does not provide replay protection; SoDEX relies on domain separation and nonces. The backend must manage nonces correctly.
- Execution safety: start with testnet and dry-run mode before enabling real signing.

## Practical Next Step Checklist

- [ ] Choose one product name and update UI/repo/submission consistently.
- [ ] Add `SODEX_API_KEY_NAME`, `SODEX_API_PRIVATE_KEY`, `SODEX_ACCOUNT_ID`, `SODEX_ENV`; for API-key signing, verify the private key derives the registered API key public address; for master signing, leave `SODEX_API_KEY_NAME` unset.
- [x] Implement SoDEX EIP-712 preparation and connected-wallet signing for perps.
- [x] Implement per-signer nonce manager.
- [x] Add reduce-leverage execution.
- [x] Add reduce-only close-position execution.
- [x] Store execution attempts and responses.
- [x] Show execution history in dashboard.
- [ ] Document scoring weights.
- [ ] Publish one public alert or run log.
