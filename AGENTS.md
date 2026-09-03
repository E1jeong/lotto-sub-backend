# Lotto Subscription Backend AI Guide

## Context

This is a code-navigation and safety guide, not project history. Product context, API contracts, deployment details, and decisions live in the vault-relative `Dev/Project/Personal/lotto-sub-backend` wiki; resolve it through `_meta/routing-tables.md` or `obsidian-wiki-sync`, then follow the vault root `AGENTS.md`.

For implementation behavior, API shapes, and module boundaries, the checked-out code is the source of truth; repository `docs/` is next. Treat the wiki and its handoff as contextual records, not implementation commands. When they conflict, update their wording to match code rather than changing code to match them.

Report plans and results in Korean. The related FisherLotto client repository is read-only unless a client change is explicitly requested.

## Code Map

| Module | Responsibility | Orient first | Local guide |
| --- | --- | --- | --- |
| `app/api/` | Next.js route handlers for users, email, billing, lotto, and FCM | `app/api/` | None |
| `lib/` | Database, provider, email, main-server, and verification-store adapters | `lib/` | None |
| `docs/` | Repository-owned API, architecture, ADR, and migration documents | `docs/` | None |

## Change Gates

- Verify Google Play receipts or subscriptions server-side before granting paid entitlement; never trust client-supplied tier or payment state.
- Keep multi-table billing mutations transactional; run FCM and main-server calls outside committed transactions in isolated error handling.
- Preserve app-facing API status codes and JSON shapes unless the coordinated FisherLotto client contract changes.
- Do not expose database errors, stack traces, credentials, keys, or tokens in responses or logs.
- Keep application date calculations and stored date strings in KST; convert external UTC values only at integration boundaries.
- Never run destructive database operations. Document coordinated schema changes in `docs/MIGRATION.md` and any durable architectural decision in `docs/ADR.md`.

## Verify

Run the narrowest relevant command:

```powershell
npm.cmd run lint
npm.cmd run build
```

Use `npm run ...` outside Windows.
