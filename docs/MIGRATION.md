# Database Migrations

## 2026-08-28: Enforce Purchase-Token Uniqueness

`T_PURCHASES.purchase_token` is stored as `TEXT`, so a direct full-text unique index is not available. The production schema adds a persisted SHA-256 generated column and a unique index on that hash:

```sql
ALTER TABLE T_PURCHASES
  ADD COLUMN purchase_token_sha256 BINARY(32)
    GENERATED ALWAYS AS (UNHEX(SHA2(purchase_token, 256))) PERSISTENT,
  ADD UNIQUE INDEX uq_t_purchases_purchase_token_sha256
    (purchase_token_sha256);
```

The original token remains stored unchanged. Before applying the migration, confirm that `purchase_token` has no null, empty, or duplicate values. Afterward, verify `SHOW INDEX FROM T_PURCHASES` reports `uq_t_purchases_purchase_token_sha256` with `Non_unique = 0`.

## 2026-08-12: Split Base And Paid Expected Numbers

The production `T_EXPECT_PICK` schema change was reported as already applied outside this repository. This repository contains no DDL for it; this entry records the contract the API now expects.

### Schema contract

- Remove the redundant `pick_count` column.
- Keep `pick_expect` in its existing JSON shape and store exactly 10 base number sets for every issued row.
- Add `pay_expect`. Store the literal `$$` marker for a Free-issued row, or use the same JSON shape as `pick_expect` to store exactly 20 additional sets for a row issued while the user is Premium.

### Application behavior

- `/api/lotto/expect` returns the 10 base sets when `pay_expect` is `$$`.
- When `pay_expect` contains the paid JSON, the endpoint appends its 20 sets and returns 30 through the unchanged Android `{ status, count, lotto }` contract.
- The endpoint also accepts SQL `NULL` as base-only during rollout compatibility, but the main server must write `$$` for new Free-issued rows.
- The row represents entitlement at issuance time. A tier change later in the week does not alter the response for that row.
- A mid-week Free-to-Premium issuance-sync operation should populate `pay_expect`; it must not replace the 10-set `pick_expect` base allocation.

### Rollout verification

1. Confirm a production Free row stores the literal `$$` marker.
2. Verify one `$$` Free row returns 10 sets and one Premium-issued JSON row returns 30 sets.
3. Verify a Premium-issued row still returns 30 after a mid-week tier downgrade.
4. Verify the Android client continues to consume the existing `count` and `lotto` response fields without an app update.
