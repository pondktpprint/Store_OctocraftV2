# Admin Panel Handover

## Overview
A comprehensive single-page Admin Panel has been built and integrated at `admin.html`. It provides real-time administrative capabilities over the entire e-commerce flow, including inventory management, order oversight, wallet adjustments, and bridging issue resolutions.

## Features Implemented

1. **Products Management**:
   - List all products (including inactive).
   - Create new products defining their SKU, name, description, points cost, and underlying `minecraft_command` (e.g., `give {player} diamond 1`).
   - Edit existing products and seamlessly toggle their Active/Disabled state.
2. **Orders Management**:
   - View a global list of recent orders securely retrieved from `GET /api/admin/orders`.
3. **Delivery Jobs**:
   - Monitor the internal queue of delivery jobs.
   - For jobs stuck in a `failed` state due to bridge disconnections or game server issues, admins can click **Retry** to immediately re-queue the task for processing.
4. **Wallet Administration**:
   - Manually issue **Credit** (add points) or **Debit** (deduct points) directly to a user's wallet via their username.
   - Monitor a global ledger of all wallet transactions (both user-initiated and admin-initiated).
5. **Topup Requests**:
   - View pending manual top-up requests.
   - **Approve** a request to automatically credit the user's wallet with the requested points.
   - **Reject** an invalid request.

## Technical Notes

- **Backend Adjustments**: To satisfy the functional requirements of retrying jobs, crediting wallets, and approving topups, several new secured REST endpoints were elegantly appended to `backend/admin/routes.js`. They strictly follow the existing architectural patterns and utilize the existing database schemas and transaction logic.
- **Security**: The entire admin panel logic is protected. The frontend verifies `App.state.user.role === 'admin'` before allowing the page to load, and every backend endpoint strictly requires a valid Admin JWT token via the `requireAdmin` middleware.

## Usage
Simply navigate to `http://127.0.0.1:3000/admin.html` (or click the Admin Panel link if added to the user dropdown) while logged in as a user with the `admin` role.
