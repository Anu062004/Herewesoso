# SoDEX API and EIP-712 integration notes

Last reviewed against the repository and current upstream pages: **2026-07-20**

This document separates three things that were previously mixed together:

1. the current official SoDEX protocol contract;
2. the behavior implemented in Gold & Grith;
3. compatibility gaps that must remain visible to operators.

The upstream documentation is authoritative for SoDEX. The code is authoritative for what this repository currently does.

## Official sources reviewed

- [SoDEX Trading API overview](https://sodex.com/documentation/trading-api/trading-api)
- [SoDEX Go SDK signing guide](https://sodex.com/documentation/trading-api/go-sdk-signing-guide)
- [SoDEX Trading API rate limits](https://sodex.com/documentation/trading-api/api-rate-limits)
- [SoDEX REST API v1](https://sodex.com/documentation/trading-api/rest-v1)
- [SoDEX WebSocket API v1](https://sodex.com/documentation/trading-api/websocket-v1)
- [SoDEX Market Data API](https://sodex.com/documentation/market-data-api/market-data-api)
- [SoDEX Market Data authentication](https://sodex.com/documentation/market-data-api/authentication)
- [SoDEX Market Data query modes](https://sodex.com/documentation/market-data-api/query-modes)
- [SoDEX Market Data rate limit](https://sodex.com/documentation/market-data-api/rate-limit)
- [SoDEX Market Data error responses](https://sodex.com/documentation/market-data-api/error-responses)

An older Notion “Common APIs” URL previously referenced by this repository still did not expose reviewable content without access. It is not used as a source of truth.

## Trading endpoints

| Network | Spot REST | Perps REST | Spot WebSocket | Perps WebSocket |
|---|---|---|---|---|
| Testnet | `https://testnet-gw.sodex.dev/api/v1/spot` | `https://testnet-gw.sodex.dev/api/v1/perps` | `wss://testnet-gw.sodex.dev/ws/spot` | `wss://testnet-gw.sodex.dev/ws/perps` |
| Mainnet | `https://mainnet-gw.sodex.dev/api/v1/spot` | `https://mainnet-gw.sodex.dev/api/v1/perps` | `wss://mainnet-gw.sodex.dev/ws/spot` | `wss://mainnet-gw.sodex.dev/ws/perps` |

Gold & Grith uses perps endpoints for account risk and actions. Spot reads are used only by the smoke test and market helpers.

## Key and account model

The current SoDEX guide distinguishes:

- **Master wallet** — owns the account and signs account-level actions such as `addAPIKey`, `addPermissionedAPIKey`, `approveBuilderFee`, and `revokeAPIKey`.
- **Registered API key** — a named, revocable EVM signing credential for normal trading actions.
- **API key name** — a 1–36 character identifier sent in `X-API-Key`. It is not a public address and never a private key; `default` is not a valid registered name.
- **Account ID** — the numeric `aid` used for account queries and signed payloads. An API-key address is not an account lookup identifier.

The official overview explicitly assigns all normal trading actions to a registered API key. Its current common-pitfalls section says signing those actions with the master wallet is wrong. Gold & Grith therefore separates operator authentication from trade signing and blocks its former connected-wallet submission path.

Recommended custody model:

1. Keep the master wallet offline except for registering/revoking API keys and other account-level actions.
2. Create a separate API key per trading process or subaccount.
3. Store the registered key in a deployment secret manager.
4. Configure `SODEX_API_KEY_NAME` with its registered name and ensure the configured private key derives the registered public address.

## Nonces

SoDEX tracks the 100 highest nonces per signing address. A new nonce must not have been used and must be larger than the smallest retained nonce. It must also fall inside the documented chain-time window `(T - 2 days, T + 1 day)`.

For `EXECUTION_MODE=testnet` or `mainnet_canary`, Gold & Grith calls the atomic Supabase function `allocate_sodex_nonce`, keyed by lowercase signer address. The database returns `max(request time, previous + 1)` across replicas and restarts. Live signing fails closed when Supabase or the function is unavailable. Process-memory allocation remains only for dry-run development and tests.

## EIP-712 trading signature

For normal spot/perps trading actions, SoDEX signs:

```ts
const domain = {
  name: 'spot' /* spot */ || 'futures' /* perps */,
  version: '1',
  chainId: 138565 /* testnet */ || 286623 /* mainnet */,
  verifyingContract: '0x0000000000000000000000000000000000000000'
};

const types = {
  ExchangeAction: [
    { name: 'payloadHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint64' }
  ]
};

const message = { payloadHash, nonce };
```

The 65-byte ECDSA signature is normalized to `r || s || yParity`, where `yParity` is `00` or `01`. SoDEX's trading-action type byte `01` is prepended, yielding the `X-API-Sign` value. `backend/services/sodexSigner.ts` performs this transformation.

`SODEX_CHAIN_ID` must match the selected endpoint: `138565` for testnet and `286623` for mainnet. The signer rejects a configured value that conflicts with an endpoint it can identify, and production startup rejects execution-mode/network/chain mismatches.

Account-level API-key registration uses different universal typed structures and a different type prefix. Gold & Grith does not implement key registration; provision API keys outside this application using the current official guide or SDK.

## Payload hashing

The trading hash is:

```text
keccak256(JSON.stringify({ type, params }))
```

Correctness requirements from the official guide:

- compact JSON with no formatting whitespace;
- field order matching the official Go request structs;
- decimal fields such as price, quantity, funds, and stop price encoded as strings;
- unset `omitempty` fields omitted;
- required zero/false fields retained;
- only the endpoint-specific `params` object sent as the HTTP request body, even though the signed hash covers `{ type, params }`.

Gold & Grith builds action bodies as ordered object literals in `backend/services/sodexTrader.ts` and hashes the wrapper in `backend/services/sodexSigner.ts`. Signing tests cover domain separation, payload hashes, recovery-byte normalization, and signer recovery.

## Signed headers

Managed registered-API-key trading requests use:

```text
Content-Type: application/json
Accept: application/json
X-API-Key: <registered key name>
X-API-Sign: 0x01<r><s><00-or-01>
X-API-Nonce: <Unix-millisecond nonce>
X-API-Chain: <chain ID used by this client>
```

Never put an address or private key in `X-API-Key`. Never log the signing secret. Public reads normally need only `Accept: application/json`.

## Gold & Grith action mapping

| Product action | SoDEX action | Endpoint/body strategy |
|---|---|---|
| `CLOSE_POSITION` | `newOrder` | Reduce-only IOC limit order at a bounded executable price |
| `REDUCE_LEVERAGE` | `updateLeverage` | Perps leverage update for the resolved account/symbol ID |
| `CANCEL_ORDER` | `cancelOrder` | One or more order IDs/client-order IDs, maximum 100 |
| `QUEUE_ACTION` | none | Internal audit/queue state only |

Before a submission, the API hydrates account context, enforces policy, checks the action cooldown, claims a unique execution row, and records final SoDEX response metadata. Production submission fails closed if it cannot create the audit claim.

## Implementation compatibility

| Path | Implemented | Current upstream compatibility | Allowed use |
|---|---:|---|---|
| Public market reads | Yes | Matches current REST model | Normal operation |
| Account/position reads by account address | Yes | Matches current account lookup model | Authenticated dashboard and agents |
| Dry-run simulations and policy checks | Yes | No write is sent | Default and recommended |
| Managed registered-API-key signing | Yes | Matches the documented signer/header model; key lookup and signer matching fail closed | Controlled testnet, then approved mainnet canary |
| Direct connected-master-wallet trading | No; endpoint blocked | Correctly excluded because normal actions require a registered key | `/api/actions/confirm-wallet` returns `409` |
| Mainnet canary | Yes, guarded | Configuration, policy, signer, audit, and durable-nonce guards are implemented and tested locally | Not live-certified until deployed smoke/canary proof |

An authenticated operator initiates an action through `/api/actions/confirm`. The backend rehydrates the configured execution account, re-evaluates policy, creates a durable idempotent audit claim, verifies the registered key against SoDEX account metadata, allocates a durable nonce, and signs server-side. The master wallet key must not be present in the application environment.

## Trading rate limits

The current official rate-limit page documents:

- 1,200 request weight per minute per IP;
- default weight 20 for unlisted endpoints;
- order-book weight 5/10/20 depending on depth;
- kline base weight 20 with possible cache-miss extra weight;
- registered API keys: 600 orders/minute and 20 orders/second per account;
- web/no-key clients: 60 orders/minute per account;
- additional address-based action limits and a 10,000-request initial buffer;
- WebSocket caps for connections, subscriptions, users, messages, and inflight requests.

These are upstream limits, not promises made by Gold & Grith. Re-check the official page before capacity planning. Keep actions small and auditable, account for kline weight, and back off on rate-limit responses.

## WebSocket behavior

SoDEX can close a connection if no subscription is established or no data arrives for more than 60 seconds. Send `{"op":"ping"}` before the idle cutoff, expect `{"op":"pong"}`, and reconnect if it does not arrive.

The official WebSocket page says user-specific streams do not require subscription authorization. Treat those streams as observable market/account telemetry, never as proof of identity or authorization.

`backend/services/sodexMarketStream.ts` is a best-effort in-process mark/funding enhancement. REST remains the source for account/action hydration, and the code falls back when the stream is unavailable. A multi-replica deployment still needs durable or shared stream distribution.

## SoSoValue market-data contract

Base URL:

```text
https://openapi.sosovalue.com/openapi/v1
```

Every request includes:

```text
x-soso-api-key: <SOSOVALUE_API_KEY>
```

The current documentation confirms:

- success envelope `{ code: 0, message: "success", data: ... }`;
- paginated lists under `data.list` with 1-based `page` and `page_size` up to 100;
- UTC millisecond timestamps and snake_case fields;
- time-window pagination via the last timestamp plus one;
- 100,000 requests/month and 20 requests/minute per API key;
- `429` responses with reset/retry metadata;
- endpoint-specific history windows, including current restrictions listed on the query-modes page.

Gold & Grith centralizes these calls in `backend/services/sosovalue.ts`. The news routes add one- or five-minute in-process caches and can return a stale cached response after an upstream failure. The scheduled narrative cycle spaces its three primary upstream fetches by 500 ms. This reduces request bursts but is not a distributed cache; multi-instance deployments must budget the upstream key across replicas.

## Operational verification checklist

Before enabling `EXECUTION_MODE=testnet`:

- [ ] Apply `docs/production-hardening-schema.sql`, including `sodex_signing_nonces` and `allocate_sodex_nonce`.
- [ ] Register a dedicated SoDEX API key using the current official workflow.
- [ ] Confirm the configured private key derives the registered public address.
- [ ] Configure a separate `OPERATOR_WALLET_ADDRESSES` identity; do not use the master account as the dashboard login.
- [ ] Set the exact registered `SODEX_API_KEY_NAME`; do not use `default`.
- [ ] Verify `SODEX_ACCOUNT_ADDRESS` and `SODEX_ACCOUNT_ID` refer to the intended account.
- [ ] Verify endpoint, `SODEX_NETWORK`, and `SODEX_CHAIN_ID` all select testnet.
- [ ] Run the operator-only `/api/sodex/smoke` read test and confirm `trading.registeredApiKey` is `ok`, not `skipped`.
- [ ] Run signing and policy unit tests.
- [ ] Start with a low-notional allowlisted symbol and inspect the durable execution row.
- [ ] Confirm the live SoDEX account before retrying any request with an unknown/ambiguous outcome.
- [ ] Keep the master wallet key out of the application environment.

Before any mainnet canary, repeat the review against the newest official pages, provision a separate managed mainnet key, set `SODEX_NETWORK=mainnet` and `SODEX_CHAIN_ID=286623`, reduce policy caps, confirm the mainnet registered-key smoke check, verify monitoring, and obtain explicit operator approval. The repository tests wiring and rejection behavior but cannot certify a real account/key without deployment credentials.

## Maintenance triggers

Re-review this file whenever any of the following changes:

- SoDEX overview, signing guide, REST reference, or rate-limit pages;
- `sodexSigner.ts`, `sodexTrader.ts`, `sodexNonceManager.ts`, or action routes;
- signer/key environment variables;
- supported action types or payload ordering;
- network/chain IDs or gateway URLs;
- SoSoValue authentication, limits, or query modes.

Run `npm run docs:check` after edits. That check verifies the local route inventory, environment template, Markdown links, and documentation index; it does not replace upstream protocol review or live-network integration testing.
