# PRD: Lotto Subscription Backend

## Goal
Provide a reliable backend for the fisherlotto Android app that manages users, lotto API access, FCM notifications, and Google Play subscription entitlement.

The highest-priority product outcome is that paid access is granted, maintained, and removed according to verified Google Play subscription state.

## Users
- Android app users who register, log in, and use lotto-related features.
- Premium subscribers who expect paid features to remain available while their subscription is valid.
- Operators who need push notification and payment flows to work without exposing internal system details.

## Problems To Solve
- Client-side payment callbacks can be manipulated or replayed.
- Google Play subscription events can arrive late, duplicate, or out of order.
- DB state, Android entitlement, and Google Play provider state can drift if updates are not transactional and verified.
- Push notification side effects should not make payment or user flows unreliable.

## Core Product Requirements
1. User API compatibility
   - Preserve existing Android request and response contracts.
   - Keep Lotto Protocol status codes stable unless the Android client is updated intentionally.

2. Subscription correctness
   - Verify Google Play receipt/subscription state server-side before granting premium access.
   - Persist purchase/subscription records in MySQL.
   - Update user premium entitlement only after provider verification succeeds.
   - Handle duplicate receipt submissions safely.

3. RTDN/Pub/Sub handling
   - Receive Google Play subscription notifications.
   - Authenticate webhook requests.
   - Decode and process subscription lifecycle events.
   - Verify provider state when notification data is insufficient.

4. FCM notification support
   - Register and remove user FCM tokens.
   - Send authorized push notifications.
   - Keep notification failures from corrupting payment or user state.

5. Lotto feature support
   - Serve winning number data.
   - Gate premium lotto expectation behavior according to user entitlement.
   - On Free-to-Premium conversion via `/api/billing/receipt`, request the legacy main-server (loopback-only) to reissue the current week's already-issued expect-number set from 10 to 30, and report the outcome to the client via a `reissued` flag. A failed or unreachable reissue call must never affect the already-committed tier update (see ADR-008).

6. Operational safety
   - Keep server internals out of API responses.
   - Use KST consistently for app-level date behavior.
   - Avoid destructive DB operations.

## Success Criteria
- A user can register, log in, and be looked up through the existing Android-compatible API.
- A valid Google Play subscription can grant premium access only after server-side verification.
- Invalid, expired, duplicate, or delayed payment data does not incorrectly grant access.
- Subscription lifecycle events update entitlement without requiring a client app restart or manual DB edits.
- Provider and DB failures return safe responses and do not leak internals.
- `npm run lint` and `npm run build` pass after code changes.

## Out Of Scope Unless Explicitly Requested
- Replacing Next.js with a separate backend framework.
- Replacing MySQL or introducing an ORM.
- Introducing a new queue provider.
- Changing Android Lotto Protocol response codes.
- Reworking the DB schema without a migration plan.
- Building a web dashboard or admin UI.

## Product Policies
- Source of truth for paid access: MySQL entitlement fields derived from verified Google Play state.
- Source of truth for subscription validity: Google Play provider state, verified server-side.
- Default timezone for app interpretation: KST (`+09:00`).
- Public API language and shape: preserve the current Android-compatible contract.
