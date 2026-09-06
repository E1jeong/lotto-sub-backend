# Lotto Subscription Backend AI Guide

## Context

This is a code-navigation and safety guide, not project history. Product context, API contracts, deployment details, and decisions live in the vault-relative `Dev/Project/Personal/lotto-sub-backend` wiki; resolve it through `_meta/routing-tables.md` or `obsidian-wiki-sync`, then follow the vault root `AGENTS.md`.

Report plans and results in Korean; keep the owner-facing `README.md` in Korean, preserving code identifiers. The related FisherLotto client repository is read-only unless a client change is explicitly requested.

## Code Map

| Module | Responsibility | Orient first | Local guide |
| --- | --- | --- | --- |
| `app/api/` | Next.js route handlers for users, email, billing, lotto, and FCM | `app/api/` | None |
| `lib/` | Database, provider, email, main-server, and verification-store adapters | `lib/` | None |
| `docs/` | Version-bound database migration execution | `docs/MIGRATION.md` | None |

## Change Gates

- Verify Google Play receipts or subscriptions server-side before granting paid entitlement; never trust client-supplied tier or payment state.
- Keep multi-table billing mutations transactional; run FCM and main-server calls outside committed transactions in isolated error handling.
- Preserve app-facing API status codes and JSON shapes unless the coordinated FisherLotto client contract changes.
- Do not expose database errors, stack traces, credentials, keys, or tokens in responses or logs.
- Keep application date calculations and stored date strings in KST; convert external UTC values only at integration boundaries.
- Never run destructive database operations. Document coordinated schema execution in `docs/MIGRATION.md`; record decisions and rationale in the wiki's `technical/design-decisions.md`.

## Verify

Run the narrowest relevant command:

```powershell
npm.cmd run lint
npm.cmd run build
```

Use `npm run ...` outside Windows.
