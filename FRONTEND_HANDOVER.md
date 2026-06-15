# Frontend Handover

## Overview
The new frontend replaces the legacy mockup with a fully functional Vanilla HTML/CSS/JS implementation that connects directly to the existing backend APIs without any mock data or hardcoded values.

## Key Technical Decisions
1. **No External Frontend Frameworks**: Used Vanilla JavaScript and the legacy CSS files directly to maintain the precise visual identity of the legacy mockup while ensuring zero overhead and maximum flexibility, as mandated by the project aesthetics.
2. **Proxy Server Handling CORS**: The backend (`port 4987`) does not configure CORS by default. To safely interface with the API while isolating frontend development, a minimal Node.js `express` server with `http-proxy-middleware` was introduced inside the `frontend` directory. It serves static assets and routes `/api/*` requests to the backend transparently.

## Implemented Pages
- **`index.html`**: Retains the legacy landing experience and acts as the entry point. Hooked up the login modal to `POST /api/auth/login`. Successful logins store a JWT inside `localStorage`.
- **`shop.html`**: Replaced mock rendering with live data via `GET /api/products`. Handles local cart state, dynamic product detail modals, and executes checkout using `POST /api/orders` along with the Bearer token.
- **`wallet.html`**: A new page utilizing the legacy layout, it dynamically queries `GET /api/wallet` to show the authoritative ledger balance and the transaction history.
- **`history.html`**: Queries `GET /api/orders` to render a list of past orders, clearly indicating their status (e.g., `delivered`, `pending_delivery`).

## How to Run

1. **Start the Backend**:
   Ensure you have MySQL running and `.env` configured, then in the project root:
   ```bash
   npm start
   ```
   (Listens on `127.0.0.1:4987`)

2. **Start the Frontend**:
   Navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   npm start
   ```
   (Listens on `http://127.0.0.1:3000`)

3. **Usage**:
   Open `http://127.0.0.1:3000` in your browser.

## Core Files
- `frontend/server.js`: Development server and API proxy.
- `frontend/public/js/app.js`: Contains the global `App` state object. Manages all asynchronous backend interactions, JWT header injection, cart state, and session UI changes.

## Next Steps
- Implement frontend UI for Topup and Admin panels.
- Fine-tune specific UI validations based on backend limits (e.g., 50 line items limit).
