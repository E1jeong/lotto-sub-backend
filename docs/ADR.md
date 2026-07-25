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
