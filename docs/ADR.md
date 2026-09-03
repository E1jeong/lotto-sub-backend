# Architecture Decision Records

This file records durable architectural decisions for Lotto Subscription Backend.

When a future change reverses or materially changes a decision, add a new ADR entry instead of silently rewriting history. Small wording clarifications are fine; changed direction should be explicit.

---

## ADR-001: Keep Next.js App Router As The API Backend

**Status**: Accepted

**Decision**: Use Next.js App Router route handlers as the backend API surface.

**Context**: The existing project already exposes Android-facing APIs under `app/api/**/route.ts` and runs as a Node.js service. The backend does not currently need a separate UI application or a separate Express/Fastify service.

**Consequences**:
- API and deployment remain simple.
- Provider calls can stay server-side in route handlers and `lib/`.
- Route handlers must stay thin so business logic does not become scattered.

---

## ADR-002: Use MySQL As The Durable State Store

**Status**: Accepted

**Decision**: Keep MySQL as the persistent database and access it through `mysql2/promise`.

**Context**: The project migrated user and purchase state from Firebase/Firestore-style storage to MySQL. Existing tables include user information, purchase records, and lotto data.

**Consequences**:
- DB schema changes require migration documentation in `docs/MIGRATION.md`.
- Multi-step billing updates must use transactions.
- Introducing an ORM or a second durable store requires a new ADR.

---

## ADR-003: Treat Google Play As The Subscription Verification Authority

**Status**: Accepted

**Decision**: Client receipt fields are never enough to grant premium access. The backend must verify subscription state with Google Play before entitlement changes.

**Context**: Android clients can send manipulated, stale, duplicated, or delayed receipt data. Google Play is the provider of record for purchase validity and subscription lifecycle state.

**Consequences**:
- Payment endpoints need provider verification and safe error mapping.
- Google Play outages should fail safely rather than granting uncertain access.
- Local DB state stores the app entitlement derived from verified provider state.

---

## ADR-004: Preserve Lotto Protocol Response Compatibility

**Status**: Accepted

**Decision**: Existing Android-compatible status codes remain the public API contract for current endpoints.

**Context**: The Android app already depends on codes such as `8200`, `8404`, `8611`, `8633`, `8655`, `8677`, and `8699`.

**Consequences**:
- New internal errors must be mapped to existing safe public codes unless the Android client is intentionally changed.
- Documentation should describe any new endpoint-specific code before implementation.
- Raw provider or DB errors must not be returned to the client.

---

## ADR-005: Use KST For App-Level Time Semantics

**Status**: Accepted

**Decision**: The backend interprets app-level dates and subscription validity in Korea Standard Time (KST, `+09:00`).

**Context**: The service is for a Korean lotto app and user-facing date boundaries should match Korean local time. External providers may still return epoch milliseconds or UTC values.

**Consequences**:
- DB connection and date calculation logic must be reviewed for KST behavior.
- Provider timestamps should be stored or converted deliberately, not accidentally by server locale.
- Date-related changes need extra care around expiry boundaries.

---

## ADR-006: Keep Push And Async Side Effects Outside Critical Payment Mutation Where Possible

**Status**: Accepted

**Decision**: Payment entitlement persistence is the critical path. FCM and retryable async side effects should not decide whether the core DB transaction succeeds.

**Context**: A successful subscription should not be rolled back because a push notification fails. Conversely, notifications should not be sent before durable state is correct.

**Consequences**:
- Commit DB state before non-critical notification work when the two are not part of the same consistency requirement.
- Pub/Sub or equivalent async handling is preferred for subscription lifecycle side effects.
- If a side effect must be transactional, document why before implementing.

---

## ADR-007: Use AGENTS.md As The Project-Level AI Rules File

**Status**: Accepted

**Decision**: Keep project-level AI coding rules in `AGENTS.md`. Do not keep a repo-root `GEMINI.md` unless this repository later needs Antigravity-only rules that should override `AGENTS.md`.

**Context**: The project is primarily edited in Antigravity, but the user already maintains a global `~/.gemini/GEMINI.md` for general working behavior. A repo-root `GEMINI.md` would have higher priority in Antigravity and would duplicate rules already expressed in `AGENTS.md`, increasing the chance of conflicting instructions.

**Consequences**:
- `AGENTS.md` should stay concise, stable, and project-specific.
- Antigravity will combine the user's global behavior rules with this repo's `AGENTS.md`.
- If a future Antigravity-only override is needed, add a minimal `GEMINI.md` and document why here.
- Product scope, architecture, and long-lived decisions belong in `docs/`, not in chat history or temporary agent artifacts.

---

## ADR-008: Notify Legacy Main-Server Over Loopback After Premium Tier Commit

**Status**: Accepted

**Decision**: After `/api/billing/receipt` commits a Premium tier update, the backend calls the legacy main-server's `POST /lotto/1077` over loopback (`http://127.0.0.1:10907`, same Gabia VM) to reissue the current week's expect-number set from 10 to 30. The call carries only `{ email, phone }`; the main-server re-derives tier and week from the shared DB. The call happens strictly after the DB transaction commits and never affects whether that transaction succeeds.

**Context**: Free users who already received this week's 10-number set need it upgraded to 30 immediately on converting to Premium, instead of waiting for next week's issuance. Number generation still lives in the legacy main-server, not this backend, so the backend cannot perform the reissue itself. This was scoped jointly with the main-server owner (see the FisherLotto wiki, `server/main-server.md`) and restricted to loopback-only access since no API key was introduced for this endpoint.

**Consequences**:
- `lib/mainServer.ts` owns this integration; route handlers must not call the legacy main-server directly.
- The call uses a short timeout and never throws past the route handler — a failed or unreachable main-server resolves to `reissued: false` and does not roll back or block the already-committed tier update.
- `/api/billing/receipt`'s response gained an additive `reissued: boolean` field; the Android client only acts on `reissued: true`.
- This is scoped to the receipt (payment) flow only. Pub/Sub-driven tier changes (renewal, hold recovery, revocation) do not call this endpoint.
- `MAIN_SERVER_REISSUE_URL` allows overriding the loopback URL for local development where the legacy main-server is not reachable at `127.0.0.1:10907`.

---

## ADR-009: Tier Is Written Only By Provider-Verified Server Paths

**Status**: Accepted

**Decision**: Remove `POST /api/users/tier`. `T_USER_INFO.tier` and `valid_date` are written only by `/api/billing/receipt` (Google Play Developer API verification) and `/api/billing/pubsub` (RTDN, re-verified against the provider). No endpoint accepts a client-supplied tier or entitlement value.

**Context**: `/api/users/tier` predates the server-side billing flow, from when the Android client owned entitlement state. After the receipt and RTDN paths moved that ownership to this backend, the endpoint stayed and became actively harmful rather than merely redundant:

- It set `valid_date = '9999-12-31'` on promotion. The Android client called it immediately after `/api/billing/receipt` succeeded, so every purchase overwrote the verified expiry the receipt flow had just committed.
- It set `tier = 0, valid_date = CURDATE()` on demotion, driven only by the client's local `queryPurchases()` result. An empty local purchase list — a switched Play account, a transient Play Store state — demoted a paying user with no provider verification.
- Both columns are shared with the legacy main-server, which derives expect-number issuance count from them, so the corruption propagated outside this repo.

**Consequences**:
- Deleting the route is safe for already-shipped clients. The Android call site wraps it in `try/catch` and only logs on failure, and the local tier cache is updated before the network call — a 404 degrades silently with no user-visible change.
- The Android client must drop its call to this endpoint (`UserRepositoryImpl.updateTier`, `UserService.updateTier`, `TierRequest`) and keep only the local cache write. Tracked in the FisherLotto wiki roadmap; not a blocker for this change.
- Tier changes now depend entirely on RTDN delivery for demotion. A dropped `EXPIRED`/`REVOKED` notification leaves a stale `tier = 1`, since `/api/billing/pubsub` acks business failures with HTTP 200 to avoid infinite Google retries. `valid_date` remains accurate as a secondary guard, but no reconciliation job exists yet — see the open item in the wiki.
- Any future need to set tier manually (support, testing) must go through a verified path or an authenticated internal tool, not a public unauthenticated endpoint.

---

## ADR-010: Store Base And Paid Expected Numbers Separately

**Status**: Accepted

**Decision**: `T_EXPECT_PICK.pick_expect` always stores the 10 base expected-number sets available to every user. `pay_expect` stores the literal `$$` marker for a Free-issued row, or uses the same JSON shape as `pick_expect` to store 20 additional sets when the user was Premium at the main-server's scheduled issuance time. The redundant `pick_count` column is removed.

`POST /api/lotto/expect` preserves the Android-compatible `{ status, count, lotto }` response. It returns only `pick_expect.lotto` when `pay_expect` is `$$`, and returns `pick_expect.lotto` followed by `pay_expect.lotto` when the paid JSON exists. `count` is derived from the combined list length.

The stored row records issuance-time entitlement. The lookup endpoint does not re-check the user's current tier, so cancellation, expiry, refund, or revocation during the week does not remove numbers already issued for that week. The main server applies the latest verified tier the next time it prepares a week's row.

**Context**: The earlier model in ADR-008 described replacing a 10-set with a single 30-set. The production schema now separates the universally available base set from the paid benefit. This avoids duplicating the issue count in a table column and lets the paid portion remain explicit without changing the Android response contract.

**Consequences**:
- Free rows store `pay_expect = '$$'` and return 10 sets.
- Rows issued while Premium return 30 sets even if the user's tier changes later that week.
- The main-server reissue operation for a mid-week Free-to-Premium conversion should populate the 20-set `pay_expect` portion instead of replacing `pick_expect`.
- The backend also treats SQL `NULL` as base-only during rollout compatibility, but `NULL` is not the current main-server storage contract.
- The schema transition and rollout requirements are recorded in `docs/MIGRATION.md`.

---

## ADR-011: Remove The Client-Facing Reissue Signal

**Status**: Accepted

**Decision**: Keep the post-commit loopback request to `POST /lotto/1077`, but remove the `reissued` field from both its required response contract and `/api/billing/receipt`'s response. The sub-backend treats an HTTP 2xx response containing `{ status: '8200' }` as a successful issuance-sync request; a failure remains isolated from the already-committed entitlement update.

**Context**: `reissued` existed solely to tell the Android app to delete its cached 10-set Room data after the main server added the paid 20-set allocation. The selected app direction is to handle a confirmed new purchase by deleting its local issued numbers, re-enabling the issue action, and guiding the user to fetch the server's current combined `{ count, lotto }` result. The provider-verified receipt result, not an additional main-server response field, is the relevant client trigger.

**Consequences**:

- The receipt API no longer exposes whether `/lotto/1077` changed a row.
- The main-server response field is optional and ignored if present, preserving compatibility while the external server is updated.
- Android must apply its local-cache reset only for a newly completed purchase, never a restore or duplicate receipt; the follow-up is tracked in the FisherLotto project wiki.

---

## ADR-012: Derive Entitlement From The Current Provider State

**Status**: Accepted

**Decision**: The receipt, subscription-status, and RTDN flows derive entitlement from the current Google Play subscription state, provider product ID, and future expiry. `ACTIVE`, `IN_GRACE_PERIOD`, and non-expired `CANCELED` subscriptions retain access. Pending, paused, on-hold, expired, and invalid-product subscriptions do not. Receipt idempotency uses the Google Play purchase token, protected by a unique SHA-256 generated-column index.

**Consequences**:

- Android must not estimate expiry or treat a failed provider check as Premium.
- A duplicate token belonging to the same stored account is revalidated and can repair that account's local tier; it never rebinds to another email.
- Account transfer remains out of scope until authenticated account ownership is available.

---

## ADR-013: Require A One-Time Email Proof Before Registration

**Status**: Accepted

**Decision**: Send five-minute, six-digit sign-up codes through Daum SMTP and require the successful verification result as a one-time `verificationToken` on `POST /api/users/register`. Keep code and proof lifecycle state in the current single PM2 Node.js process. Store only a SHA-256 hash of the random proof token, expire unused proofs after 30 minutes, and consume a proof only after user insertion succeeds.

**Context**: The Android sign-up flow needs to prove email ownership without introducing a password, JWT, or general login-session system. A process-global in-memory store is the smallest fit for the current single-process deployment and avoids a DB migration. A plain `email -> verified` flag would allow another request that knows the address to reuse the completed verification, so registration also carries an unguessable one-time proof.

**Consequences**:

- `POST /api/email/send-code` and `POST /api/email/verify-code` become the only paths that create sign-up verification state.
- The Android app keeps `verificationToken` only in sign-up ViewModel/UI memory and sends it once with the sub-backend registration request; it does not persist or treat it as a login credential.
- Server restart or future multi-process deployment invalidates or partitions pending state. Moving to multiple processes requires replacing the store with a shared DB or Redis implementation before rollout.
- Registration failures retain the claimed proof for correction and retry until expiry; a successful insert consumes it immediately.
- Successful registration triggers the legacy main-server `/lotto/1022` loopback request to initialize Free-tier expected numbers in an isolated `try/catch` block, without affecting the registration response.
- Passwords, JWTs, server login sessions, account recovery, and authorization hardening remain separate work.

---

## ADR-014: Bind Email Proofs To Registration Or Account Recovery

**Status**: Accepted

**Decision**: Require an explicit `purpose` (`registration` or `recovery`) on every email-code send and verification request. The server records that purpose on the resulting one-time proof. `POST /api/users/register` accepts only registration proofs, while `POST /api/users/recover` accepts only recovery proofs.

**Context**: Existing-account recovery restores a profile after reinstall or device change but is not a password or session mechanism. Without a purpose-bound proof, a token issued for registration could authorize recovery of an existing account. Requiring the field rather than defaulting it prevents an ambiguous client contract; the Android app has not been released with this API contract.

**Consequences**:

- Both Android email requests must explicitly send `purpose: "registration"` for sign-up and `purpose: "recovery"` for recovery.
- Recovery validates the normalized email and phone as one database predicate, returns only `name`, `email`, `birth`, `phone`, and tier as `FREE` or `PREMIUM`, and consumes its proof only after a matching row is found.
- Invalid, expired, reused, or wrong-purpose proofs return existing status `8703`; a non-matching email-and-phone pair returns existing status `8699` without revealing either field independently.
- Recovery cannot accept or set tier, purchase, subscription, FCM, or other entitlement data. Android refreshes entitlement through its existing Google Play flow after local-profile restoration.

---

## ADR-015: Retry Failed RTDN Sync and Reconcile Expired Tiers Daily

**Status**: Accepted

**Decision**: Return HTTP 500 when a handled RTDN cannot complete entitlement synchronization, allowing Google Pub/Sub to retry delivery. Add the internal `POST /api/billing/reconcile` endpoint, protected by `CRON_SECRET_TOKEN`, and call it daily at 00:10 KST from the Gabia host. It demotes only rows where `tier = 1` and `valid_date < CURDATE()`.

**Context**: The main server grants expected-number allocations from `tier` only. If an expiry RTDN is lost or its entitlement synchronization fails after the webhook acknowledges success, an expired user can retain Premium tier until a later event. `valid_date` is the backend's existing KST expiry record and provides a bounded daily recovery path.

**Consequences**:

- Normal RTDN delivery still updates entitlement immediately through Google Play provider revalidation.
- Transient synchronization failures are retried by Pub/Sub rather than acknowledged as complete.
- The daily reconciliation is idempotent and does not query or alter purchase records, expected-number rows, or FCM state.
- The endpoint is loopback-only in operation and must not expose `CRON_SECRET_TOKEN` in source, logs, or responses.
