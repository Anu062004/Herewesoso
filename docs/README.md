# Documentation index

Documentation status: **maintained**. Last full repository and upstream-protocol review: **2026-07-20**. Code baseline reviewed: current `main` plus the delivery-evidence implementation in this worktree.

This directory is the source of truth for Gold & Grith's operator and integration documentation. The root [README](../README.md) is the product overview and quick start; implementation details live here.

## Documents

| Document | Purpose | Review trigger |
|---|---|---|
| [API reference](api-reference.md) | Gold & Grith REST routes, authentication, query limits, and action flow | Any change under `backend/routes/`, `backend/app.ts`, or wallet auth middleware |
| [SoDEX and EIP-712 notes](api-and-eip712-integration-notes.md) | Verified upstream SoDEX rules and the repository's compatibility status | Any upstream SoDEX API update or signing change |
| [Base schema](base-schema.sql) | Initial Supabase tables | Any new required base persistence field |
| [Narrative v2 schema](narrative-v2-schema.sql) | Narrative evidence, preferences, feedback, and advisor tables | Narrative model or route changes |
| [Wave 3 schema](wave3-schema.sql) | Outcomes, multi-user sessions, SoDEX strategy marketplace, automation, performance, and execution tables | Any Wave 3 feature or execution-ledger change |
| [Production hardening schema](production-hardening-schema.sql) | Durable auth, leases, rate limits, constraints, indexes, and RLS | Security or multi-instance behavior changes |
| [SkillMint integration](../backend/services/SKILLMINT_INTEGRATION.md) | Optional verifiable-AI provider setup and failure behavior | SkillMint SDK or adapter changes |
| [Technical graph skill](../backend/skills/technical-graph-analysis/SKILL.md) | Runtime analysis contract and guardrails | Technical-analysis implementation changes |
| [Technical indicator rules](../backend/skills/technical-graph-analysis/references/indicator-rules.md) | Exact indicator, confidence, and output rules used by the technical graph skill | Indicator threshold or output-contract changes |

The public `/docs/evidence` page is the reviewer-facing delivery ledger. It reads `/api/evidence` at request time and treats unavailable runtime or chain proof as `REPOSITORY_ONLY` rather than inferring a deployment.

## Database migration order

Apply the SQL files once, in this order:

1. `docs/base-schema.sql`
2. `docs/narrative-v2-schema.sql`
3. `docs/wave3-schema.sql`
4. `docs/production-hardening-schema.sql`

The scripts use `IF NOT EXISTS` where PostgreSQL supports it. They are migrations, not a rollback mechanism: take a database backup and review the statements before applying them to an existing production project. The hardening migration updates and constrains existing rows before enabling RLS and revoking browser-role access.

## Maintenance rules

- The implementation is authoritative for Gold & Grith behavior. The current official SoDEX documentation is authoritative for upstream protocol rules.
- `.env.example` is the canonical list of supported, non-legacy configuration keys. Compatibility aliases may remain in code without being advertised.
- Never describe a deployment as live or active unless its health endpoint was verified during the same review.
- Never describe a signing path as production-compatible unless it matches the current SoDEX signer/key requirements and has an integration test against the selected network.
- Run `npm run docs:check` after changing routes, environment access, package scripts, Markdown links, or this documentation inventory.

## SoDEX execution compatibility

The official SoDEX Trading API says normal trading actions must be signed by a registered API key. Gold & Grith now enforces that model: connected-master-wallet submission is blocked, live writes require a managed non-default registered key, and production validates the account/network/chain split. Mainnet remains operationally uncertified until a deployed registered-key smoke check and explicit low-notional canary succeed.
