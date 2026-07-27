# Architecture

## Overview
Lotto Subscription Backend is a Next.js App Router API backend for the fisherlotto Android app.
The app is not a public web product; the operational surface is API routes used by the Android client, Google Play billing flows, FCM push delivery, and deployment on a Node.js runtime.

The architecture should stay small and explicit. Route handlers expose the API contract, `lib/` owns provider and infrastructure integration, and MySQL remains the source of truth for users, purchases, lotto records, and subscription entitlement fields.

## Current Stack
- Runtime: Node.js + Next.js App Router
- Language: TypeScript
- Database: MySQL through `mysql2/promise`
- Billing provider: Google Play Developer API
- Push provider: Firebase Admin SDK / FCM
- Deployment shape: PM2-managed Next.js server, with GitHub Actions deployment support

## Directory Map
```text
.
├── app/
│   ├── api/
│   │   ├── billing/
│   │   │   ├── receipt/route.ts        # Google Play receipt persistence and entitlement update
│   │   │   ├── subscription/route.ts   # Subscription status lookup/verification
│   │   │   └── pubsub/route.ts         # Google Play RTDN Pub/Sub webhook receiver
│   │   ├── fcm/
│   │   │   ├── send/route.ts           # Server-authorized push send endpoint
│   │   │   ├── token/route.ts          # User FCM token registration
│   │   │   └── user/route.ts           # User FCM token removal
│   │   ├── lotto/
│   │   │   ├── expect/route.ts         # Premium lotto expectation endpoint
│   │   │   ├── stats/route.ts          # Per-round grade/combination count stats endpoint
│   │   │   └── winning/route.ts        # Lotto winning number endpoint
│   │   └── users/
│   │       ├── route.ts                # User lookup
│   │       ├── login/route.ts
│   │       ├── register/route.ts
│   │       └── withdraw/route.ts
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── db.ts                           # MySQL pool and timezone behavior
│   ├── firebaseAdmin.ts                # Firebase Admin initialization
│   ├── googlePlayApi.ts                # Google Play API integration
│   └── mainServer.ts                   # Loopback call to legacy main-server (expect-number reissue)
└── docs/
    ├── PRD.md
    ├── ARCHITECTURE.md
    ├── ADR.md
    └── MIGRATION.md
```

## Core Boundaries

### API routes
API routes are the only public entry points. They should:
- parse and validate request input;
- call `lib/` integration code or focused local helpers;
- map known failures to safe Lotto Protocol responses;
- avoid leaking provider, DB, stack, or environment details.

### `lib/` integrations
Provider and infrastructure code belongs in `lib/`.
- `lib/db.ts` owns MySQL connection behavior.
- `lib/googlePlayApi.ts` owns Google Play API calls.
- `lib/firebaseAdmin.ts` owns Firebase Admin setup.

Do not call Google Play or Firebase directly from multiple route handlers if the behavior can live in one shared integration function.

### MySQL
MySQL is the durable state store. Schema-affecting work must be documented in `docs/MIGRATION.md` and, for long-lived architectural choices, `docs/ADR.md`.

KST is the project default for app-level date interpretation. When Google Play returns epoch milliseconds or UTC timestamps, keep provider values precise and convert only at the app boundary where needed.

## Payment And Subscription Flow

### Client receipt flow
```text
Android client completes Google Play purchase
  -> POST /api/billing/receipt
  -> backend verifies purchase/subscription with Google Play API
  -> backend starts DB transaction
     -> persist purchase record
     -> update user entitlement fields
  -> backend commits transaction
  -> if Premium tier was just committed, backend calls legacy main-server (loopback only, `lib/mainServer.ts`) to reissue this week's expect-number set (10 -> 30)
  -> backend returns safe Lotto Protocol response, including `reissued`
  -> non-critical push/event work runs outside the transaction when possible
```

Rules:
- Receipt data from Android is a hint, not proof.
- Duplicate purchase requests must be idempotent where the DB schema allows it.
- Multi-table payment mutations must roll back together on failure.
- The main-server reissue call happens only after the DB transaction commits, so its failure never affects entitlement state; a failed or unreachable call must resolve to `reissued: false`, never throw past the route handler.

### Google Play RTDN / Pub/Sub flow
```text
Google Play RTDN message
  -> POST /api/billing/pubsub
  -> backend authenticates webhook token
  -> backend decodes notification
  -> backend verifies current subscription state with Google Play when needed
  -> backend updates MySQL subscription entitlement
  -> backend schedules or sends client notification
```

Rules:
- Treat RTDN as a signal to verify provider state, not as the full source of truth.
- The endpoint must tolerate duplicate or delayed notifications.
- Unknown notification types should be logged safely and ignored or mapped conservatively.

## Subscription State Model
`T_USER_INFO.tier` and `valid_date` are written only by the two provider-verified paths above — `/api/billing/receipt` and `/api/billing/pubsub`. No endpoint accepts a tier value from the client (ADR-009).

The current product exposes premium entitlement through user tier and validity fields. When expanding subscription behavior, prefer explicit states instead of overloading booleans.

Recommended long-term states:
- `ACTIVE`: user currently has paid access.
- `CANCELLED`: user cancelled renewal but access remains until expiry.
- `EXPIRED`: access period has ended.
- `ON_HOLD`: payment issue or grace-period state from Google Play.
- `REFUNDED` or `REVOKED`: access should be removed due to refund/revocation.

Do not introduce new states without documenting the migration and Android response behavior.

## API Compatibility
The Android app expects the Lotto Protocol status codes documented in `README.md`.
Preserve these codes for existing endpoints unless the user approves a client-breaking change.

Known code meanings:
- `8200`: success
- `8404`: data not found
- `8611`: duplicate email
- `8633`: duplicate phone
- `8655`: server or DB error
- `8677`: invalid request field
- `8699`: user not found

## Error Handling
Use safe, stable error responses. Never return:
- `sqlMessage`
- raw Google/Firebase error objects
- stack traces
- service account values
- API keys or environment values

For payment flows, catch errors at the route boundary, roll back open transactions, log server-side details safely, and return a sanitized response.

## Verification Strategy
Current available commands:
```bash
npm run lint
npm run build
```

There is no test runner configured yet. When adding risky billing, DB, or provider logic, prefer adding a focused test setup first rather than relying only on manual smoke checks.

Manual smoke checks should be documented in the task or PR when they touch:
- user registration/login/withdrawal;
- FCM token registration/removal/send;
- lotto winning/expect endpoints;
- billing receipt verification;
- billing subscription lookup;
- Pub/Sub webhook handling.
