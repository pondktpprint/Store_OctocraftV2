# Mock Audit

This audit lists every fake, demo, mock, sample, and hardcoded system found before restructuring.

## Repository structure

- `public/` contains the original static mockup UI. It mixes page markup, inline JavaScript, placeholder user state, and direct API calls in HTML files.
- `server.js` combines static file serving, API logic, local JSON persistence, bridge logic, payment verification, admin auth, and mock fallback behavior in one production entrypoint.

## Backend mock/demo/fake/hardcoded systems

- `server.js` logs that it will use a "mockup fallback" when `mysql2` or `bcryptjs` is unavailable.
- `server.js` accepts hardcoded admin credentials: username `Admin` and password `491693148qQ`.
- `server.js` returns a hardcoded admin profile with id `admin`, name `Admin`, role `admin`, and `999999` points.
- `server.js` creates unsigned user session tokens from `user_${username}_${Date.now()}` instead of issuing verifiable server-managed sessions.
- `server.js` derives user identity from any bearer token beginning with `user_`, allowing forged user identities.
- `server.js` contains hardcoded default MySQL host, port, database, table, username, password, and column names.
- `server.js` contains hardcoded default payment branding and empty PromptPay/EasySlip settings.
- `server.js` contains hardcoded default product categories: `All`, `Rank`, `Keys`, and `Privillege`.
- `server.js` contains hardcoded default products: `VIP Rank`, `Myth Key x5`, and `Fly Privillege`.
- `server.js` contains hardcoded Minecraft public server host `sv3.mcsv.me` and port `10976`.
- `server.js` contains a hardcoded Discord invite code `dU2wma23f3`.
- `server.js` contains cleanup logic for mock Minecraft names: `Steve`, `Alex`, `Notch`, `Herobrine`, `Dinnerbone`, `Grumm`, `Jeb_`, and `Dream`.
- `server.js` falls back to local test login when database auth fails.
- `server.js` accepts test password `1234` in fallback login mode.
- `server.js` creates member records automatically on fallback/login with default points and totals.
- `server.js` has prototype topup behavior when no EasySlip API key exists, crediting points without real verification.
- `server.js` records prototype topups with generated `topup_` transaction ids.
- `server.js` uses local JSON state as the only data store for products, users, wallet balances, topups, cart purchases, admin config, tickets, and item codes.
- `server.js` exposes admin-managed product/category defaults from local state if no real data has been configured.
- `config.yml` contains example bridge URL `wss://panel.example.com/bridge`.
- `config.yml` contains sample MySQL users such as `root` and example config comments for AuthMe/nLogin.
- `README.md` describes the old mockup/template behavior, including PromptPay/TrueMoney QR simulation and developer adaptation notes.

## Frontend mock/demo/fake/hardcoded systems

- `public/index.html` hardcodes a logged-in placeholder profile using `Steve` and `5,000 Points`.
- `public/shop.html` hardcodes a logged-in placeholder profile using `Steve` and `5,000 Points`.
- `public/topup.html` hardcodes a logged-in placeholder profile using `Steve` and `5,000 Points`.
- `public/contact.html` hardcodes a logged-in placeholder profile using `Steve` and `5,000 Points`.
- `public/shop.html` includes a fake logout action using `alert('จำลองการออกจากระบบ')`.
- `public/topup.html` contains hardcoded topup amount buttons: `50`, `90`, `150`, `300`, `500`, and `1000`.
- `public/topup.html` uses a static QR image placeholder from Wikimedia before generating a PromptPay QR.
- `public/topup.html` hardcodes a 5-minute payment timer.
- `public/topup.html` fetches `/api/config`, which is an admin-protected endpoint in the backend, for public payment settings.
- `public/js/main.js` stores full user objects in `localStorage` and trusts those values for display.
- `public/js/main.js` protects admin routes by checking the locally stored user role instead of verifying the session with the backend.
- `public/js/main.js` sends usernames from localStorage to redeem/history APIs instead of deriving identity from the backend session.
- `public/shop.html` calculates wallet balance client-side from localStorage before checkout.
- `public/shop.html` loops over cart items and calls `/api/shop/buy` once per quantity instead of submitting a backend-owned cart/checkout request.
- `public/shop.html` displays product command strings to customers as item descriptions.
- `public/index.html` contains hardcoded promotion copy for rank package discounts.
- `public/index.html` contains fixed visual slots for top donators and recent topups that are later filled by JavaScript.
- `public/admin.html` contains hardcoded default server IP `play.octocraft.net` and port `25565`.
- `public/admin.html` contains placeholder token text `กำลังโหลด...` and `ยังไม่มี Token (กดปุ่ม Generate)`.
- `public/admin.html` contains placeholder EasySlip key format `easyslip_xxxxxxxxxxxxxxxxx`.
- `public/admin.html` contains example command placeholder `lp user {player} parent add VIP`.
- `public/contact.html` contains example ticket subject text.

## Required production separation

- The original `public/` mock UI must be moved to `/legacy-mockup`.
- Production frontend files must live under `/frontend`.
- Production backend files must live under `/backend`.
- Production frontend must call backend APIs only for admin, topup, cart, user, wallet, and product data.
- Production files must not import or use mock/demo/fake/sample data.
