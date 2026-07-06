# Project: Lotto Subscription Backend

## Purpose
This repository is a Next.js App Router API-only backend for the fisherlotto Android app.
It handles user records, lotto data APIs, Firebase Cloud Messaging, and Google Play subscription receipt flows backed by MySQL.

The primary goal is payment and subscription correctness: never trust client payment data, keep Google Play and MySQL state consistent, and notify clients without blocking core API transactions.

## Related Client
- Android client project: `<dev-root>/6.project/fisherlotto`
- This backend project: `<dev-root>/7.server/lotto-sub-backend`
- `<dev-root>` means the local parent directory that contains the numbered project folders.
- Backend API changes must preserve Android request/response compatibility unless the user explicitly approves a coordinated client update.
- When changing API paths, request/response fields, Lotto Protocol status codes, billing receipt flow, or subscription entitlement behavior, consider the Android client impact first.

## Tech Stack
- Next.js App Router API routes
- TypeScript
- MySQL via `mysql2/promise`
- Google Play Developer API via `googleapis`
- Firebase Admin SDK for FCM
- Google Cloud Pub/Sub style RTDN webhook handling

## Required Reading Before Code Changes
Before changing code, read the project docs that match the task:
- Always read `docs/ARCHITECTURE.md`.
- Read `docs/ADR.md` when the task affects billing, subscription state, DB schema, deployment, API contracts, or external provider boundaries.
- Read `docs/PRD.md` when the task changes product behavior or API behavior visible to the Android client.
- If migration documentation exists, read it before touching MySQL table shape or migration-related logic.

If `docs/ADR.md` does not cover a significant new decision, propose or add an ADR before implementing the code.

## Critical Rules
- All date/time behavior must be interpreted in Korea Standard Time (KST, `+09:00`) unless an external provider explicitly requires UTC milliseconds or ISO timestamps.
- Client-supplied Google Play receipt fields are untrusted. Verify purchase/subscription state server-side with Google Play Developer API before granting premium access.
- Payment verification and subscription state updates must use `try/catch` and a DB transaction when multiple persistent changes must succeed or fail together.
- Do not expose DB errors, provider raw errors, stack traces, service account data, API keys, or SQL messages in API responses.
- Keep slow or retryable side effects outside the core transaction path where possible. Push notifications and async subscription events should not make the main payment mutation unreliable.
- Do not change existing payment logic or DB schema without first explaining the impact and tradeoffs to the user.
- Avoid destructive DB operations such as `DROP` and `TRUNCATE` unless the user explicitly approves them for a safe environment.

## Code Organization
- API routes live in `app/api/**/route.ts`.
- Shared provider and infrastructure code lives in `lib/`.
- Documentation lives in `docs/`.
- Keep route handlers thin: validate input, call the relevant library/service code, map errors to safe responses.
- Do not introduce a new framework, ORM, queue system, or validation library unless the user asks for it or an ADR is accepted.

## API And Error Contract
- Preserve the Android Lotto Protocol response codes documented in `README.md` unless the user approves a breaking change.
- Prefer small, explicit error mapping over returning raw exceptions.
- Maintain backward-compatible request/response fields for existing Android endpoints.

## Development Workflow
- Make surgical changes only. Do not refactor unrelated code while fixing a specific issue.
- For bug fixes, reproduce the failure first when practical, then fix it.
- For payment/subscription changes, list edge cases before editing: duplicate request, delayed receipt, Google API failure, DB failure, renewal, cancellation, refund, hold, and expiry.
- For user-facing API behavior changes, update the relevant docs in the same change.

## Commands
```bash
npm run dev
npm run build
npm run lint
```

There is currently no dedicated `npm test` script. If tests are added later, update this file and `docs/ARCHITECTURE.md`.

## Antigravity Notes
- `AGENTS.md` is the shared project rule file. Keep it concise and stable.
- Do not add a project-level `GEMINI.md` unless this repo needs Antigravity-only rules that cannot live in `AGENTS.md`.
- The user's global `~/.gemini/GEMINI.md` already covers general working behavior; keep this repo's project-specific rules in `AGENTS.md` and `docs/`.
- Record long-lived product scope in `docs/PRD.md`, architecture in `docs/ARCHITECTURE.md`, and decisions in `docs/ADR.md`.
- Do not store completed task logs or temporary plans in `AGENTS.md`; use short-lived chat/task artifacts instead.

## Wiki Sync

This project has a maintained Obsidian LLM wiki (`Project/Personal/Fisher Lotto`, shared with the `FisherLotto` app repo) tracking feature status, unimplemented plans, and a per-session `핸드오프.md` handoff. When the user asks to sync, check, or update the wiki, use the `obsidian-sync` skill (`.claude/skills/obsidian-sync/SKILL.md`) rather than guessing paths.
