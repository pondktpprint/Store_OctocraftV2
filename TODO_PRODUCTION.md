# Production Rebuild TODO

Use `MOCK_AUDIT.md` as the source of truth for legacy risks and removed systems.

## Backend

- Rebuild `auth` with real identity verification, server-issued sessions, permission checks, and logout/session expiry.
- Rebuild `products` with persistent category and product storage, validation, pricing, visibility, and admin management.
- Rebuild `wallet` with authoritative server-side balances, ledger entries, transaction safety, and reconciliation.
- Rebuild `orders` with cart checkout, order records, item delivery state, rollback handling, and purchase history.
- Rebuild `topup` with verified payment provider integration, duplicate-slip protection, amount checks, and audit records.
- Rebuild `admin` with role-based access, secure configuration management, dashboards, and operational logs.
- Rebuild `rcon` with authenticated command dispatch, connection lifecycle, retry handling, and delivery tracking.

## Frontend

- Rebuild the customer UI against backend APIs only.
- Rebuild login/session UI without trusting browser-stored profile, balance, or role data.
- Rebuild product, cart, wallet, topup, order history, support, and admin screens after backend contracts are defined.

## Data and operations

- Choose the production database schema and migrations.
- Define environment configuration and secret management.
- Add validation, error handling, logging, and monitoring.
- Add automated tests for auth, products, wallet, orders, topup, admin, and rcon.
- Add deployment documentation after real runtime dependencies and environments are chosen.
