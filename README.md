# Sentinel Finance

Sentinel Finance is a Wave 1 crypto trading intelligence platform with two coordinated loops:

- `Narrative Alpha Scanner` scores 8 crypto sectors from SoSoValue news, ETF flow, and macro data.
- `Liquidation Shield` monitors SoDEX testnet positions for liquidation distance, macro-event pressure, and alert risk.

Wave 1 rules implemented in this repo:

- Telegram is `alerts only`
- dashboard buttons only `queue confirmation flow`
- no real `EIP-712 signing` yet
- SoSoValue requests use `x-soso-api-key`
- SoDEX reads use `public testnet GET endpoints`
- Supabase writes are wrapped so agent failures do not crash the cycle

## Structure

```text
.
|-- backend/
|-- frontend/
|-- .env.example
|-- package.json
`-- README.md
```

## Local Setup

1. Install backend dependencies:

   ```bash
   npm install
   ```

2. Install frontend dependencies:

   ```bash
   npm --prefix frontend install
   ```

3. Copy `.env.example` to `.env` and fill in the required keys.

4. Start the backend:

   ```bash
   npm run dev
   ```

5. Start the frontend:

   ```bash
   npm run frontend:dev
   ```

The frontend expects the backend at `http://localhost:3001` unless `NEXT_PUBLIC_API_BASE_URL` overrides it.

## Supabase Schema

Run the SQL from the build spec for these tables:

- `narrative_scores`
- `position_risks`
- `alerts`
- `trade_memos`
- `agent_runs`

## Main Routes

- `GET /health`
- `GET /api/signals`
- `GET /api/positions`
- `GET /api/alerts`
- `GET /api/memos`
- `GET /api/macro`
- `GET /api/risks`
- `POST /api/trigger`
- `POST /api/test-telegram`
- `POST /api/actions`

## Frontend Behavior

- Positions poll every `30s`
- Signals poll every `60s`
- Alerts poll every `30s`
- Execution buttons open a confirmation modal and return a Wave 2 placeholder response

## Notes

- If SoDEX position fetch fails, the shield falls back to the known demo BTC-USD testnet position.
- Liquidation price is taken from SoDEX responses and only backfilled from account state when needed.
- Telegram alerts deep-link back to `/dashboard`.
