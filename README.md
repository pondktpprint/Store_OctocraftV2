# OctoCraft Store

Production-ready project structure for the OctoCraft web store.

## Structure

- `backend/` - Node.js API server, static frontend serving, bridge websocket, auth, topup, wallet, cart, products, user history, and admin endpoints.
- `frontend/` - Production frontend. It reads admin, topup, cart, user, wallet, and product state from backend APIs only.
- `legacy-mockup/` - Original static template files preserved for reference only.
- `MOCK_AUDIT.md` - Audit of all mock, demo, fake, sample, and hardcoded systems found before restructuring.

## Runtime

```bash
npm install
npm start
```

The default server listens on `PORT` or `4987`.

## Required configuration

Production data is intentionally not hardcoded. Configure these values through environment variables or the admin API before use:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_DATABASE`
- `MYSQL_TABLE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `EASYSLIP_API_KEY`
- `PROMPTPAY_NAME`
- `PROMPTPAY_TARGET`
- `POINT_RATE`
- `PUBLIC_MINECRAFT_HOST`
- `PUBLIC_MINECRAFT_PORT`
- `PUBLIC_DISCORD_INVITE`

Products, categories, item codes, payment config, users, wallet balances, topups, and purchase history are managed through backend state and APIs, not frontend constants.
