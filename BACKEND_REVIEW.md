# Backend Production Safety Review

Scope: review only. No code changes were made.

## Findings

### P0 - Duplicate bridge results can overwrite final delivery state - Fixed

File: `backend/rcon/bridge.js:73-114`

`recordDeliveryResult()` accepts any repeated `delivery_result` for an existing `bridge_message_id`, regardless of the job's current status. A successful result can mark a job `succeeded`, then a later duplicate failure for the same message can change it to `failed` and mark the order `delivery_failed`. The inverse can also happen. Delivery result handling must be idempotent and must ignore or safely return if the job is already in a terminal state.

Fixed by adding terminal-state guards in `backend/rcon/delivery-state.js` and using them in `backend/rcon/bridge.js`. `succeeded` and `failed` are now terminal states; duplicate results for completed jobs are ignored, preventing `succeeded -> failed` and `failed -> succeeded`.

### P0 - Sent delivery jobs are not recoverable if the bridge disconnects before executing or confirming - Fixed

File: `backend/rcon/bridge.js:46-70`

`sendQueuedJobs()` changes jobs from `queued` to `sent` before the plugin confirms execution. There is no timeout, retry lease, stale `sent` recovery, or requeue path. If the WebSocket closes after the DB update but before the plugin receives or processes the command, the order remains stuck in `pending_delivery` forever. The delivery queue needs leased dispatch with retry/requeue semantics.

Fixed by replacing `sent` with `processing`, adding `retry_count`, `last_attempt_at`, and `lease_expires_at` to `delivery_jobs`, and requeuing expired `processing` jobs before dispatch. Orders become `delivered` only when all jobs are `succeeded`, and become `delivery_failed` only when a bridge result permanently fails a job.

### P1 - Product write APIs accept invalid product data and can create zero-price or unusable products - Fixed

File: `backend/products/routes.js:15-49`

Admin product create/update uses `String(...).trim()` and `Number(... || 0)` but does not validate required fields, positive integer price, SKU format, command presence, or `id` type. Bad values can reach the database or create products that later break checkout/delivery. SQL placeholders prevent injection, but production input validation is incomplete.

Fixed for requested P1 validation scope by adding product payload validation in `backend/products/validation.js`: product name is required, SKU is required and backed by the existing unique index, price must be a positive integer, and command/template is required. Duplicate SKU database errors are normalized to `sku_already_exists`.

### P1 - Checkout lacks maximum quantity/order limits - Fixed

File: `backend/orders/routes.js:42-108`

Checkout validates integer quantity and `quantity >= 1`, but has no upper bound for quantity, distinct line count, or total delivery jobs. A client can submit very large quantities and force huge loops/inserts inside one DB transaction, risking lock contention and resource exhaustion.

Fixed for requested P1 validation scope by adding a maximum of 50 order lines and requiring each checkout quantity to be between 1 and 100. Checkout continues to ignore client-submitted prices and calculate totals only from database product prices.

### P1 - Order failure policy does not account for partial delivery

File: `backend/rcon/bridge.js:94-99`

If one job fails after previous jobs for the same order succeeded, the order is marked `delivery_failed` with no explicit partial-delivery state or compensation workflow. This avoids incorrectly marking delivered, but it is not production-complete for real money/wallet orders.

### P2 - Wallet transaction type is not explicitly validated - Fixed

File: `backend/wallet/service.js:19-48`

Any `input.type` other than `"credit"` is treated as debit by the ternary at lines 26-28. Current callers use `"debit"`, but a future caller typo would debit by default. The service should explicitly allow only `"credit"` or `"debit"`.

Fixed by validating that wallet transaction type is exactly `credit` or `debit` before calculating the next balance. Invalid types now throw `invalid_wallet_transaction_type`. Existing negative-balance guard remains in place, and checkout debit still runs inside the same database transaction as order, order item, and delivery job creation.

### P2 - Bridge token is passed in URL query string

File: `backend/rcon/bridge.js:11-18`

The token is not exposed to frontend code, but query-string credentials are commonly captured by reverse proxy logs and request logs. Production should prefer an authorization header or WebSocket subprotocol credential and ensure logs redact it.

## Checklist Review

1. Wallet transaction must be atomic: Fixed for checkout flow. `orders/routes.js` calls `recordTransaction()` inside `transaction()`, and `wallet/service.js` locks the account row with `FOR UPDATE`.

2. Checkout must rollback if any step fails: Pass. Order insert, wallet debit, order item inserts, and delivery job inserts are inside one `transaction()` in `backend/orders/routes.js:46-112`.

3. Order total must be calculated from database product price only: Pass. Checkout loads `price_points` from `products` with `FOR UPDATE` and calculates total from that value in `backend/orders/routes.js:57-67`.

4. Frontend/client must not be able to submit price manually: Pass. Checkout reads only `product_id` and `quantity`; client-submitted price is ignored.

5. `delivery_jobs` must be idempotent: Fixed for terminal result handling. Duplicate completed results are ignored, and expired `processing` leases are requeued.

6. Duplicate `delivery_result` must not deliver twice: Fixed at backend state level. Terminal jobs ignore duplicate results and cannot flip status.

7. Bridge token must never be exposed to frontend: Pass with caution. No frontend code references `BRIDGE_TOKEN`, but the token is accepted in a URL query string.

8. JWT secret must be required from env: Pass. `backend/config.js` uses `required("JWT_SECRET")`.

9. All protected routes must require auth: Pass for current protected routes. Orders, wallet, auth `/me`, admin, and product writes require auth. Public product listing and login are intentionally unauthenticated.

10. SQL injection risk / input validation: SQL injection risk is mostly controlled by placeholders. Product write validation, order quantity bounds, and wallet transaction type validation have been added. Route param typing remains an operational hardening item.

## Summary

The core checkout and wallet transaction shape is on the right track: database pricing is authoritative, client price is ignored, and checkout rollback is transaction-scoped. The original P0 bridge delivery lifecycle issues have been addressed with processing leases, expired-lease requeue, terminal-state guards, and duplicate-result ignore behavior. Remaining findings are P1/P2 validation and operational hardening items.

## Verification Added

- `npm run verify:delivery`
- `backend/verify-delivery-reliability.js` checks the delivery state helper, schema state names and lease columns, requeue behavior markers, terminal-result guard, and guarded order status transitions.
- `npm run verify:p1`
- `backend/verify-p1-validation.js` checks product validation, SKU uniqueness support, checkout quantity/order-line limits, absence of client price reads in checkout, and database-price total calculation.
- `npm run verify:wallet`
- `backend/verify-wallet-safety.js` checks wallet transaction type validation, negative-balance guard, ledger insert, checkout debit inside the DB transaction, and rollback behavior shape.
