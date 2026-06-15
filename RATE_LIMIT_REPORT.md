# Rate Limiting Implementation Report

## Overview
As per the production readiness audit findings, network-level rate limiting has been successfully instituted on the backend to safeguard the platform against brute-force intrusion and denial-of-service (DoS) attempts.

## Technology Stack
- Implemented via `express-rate-limit` (installed as an NPM dependency).

## Configuration
The thresholds are now fully manageable through environment variables to allow seamless adjustments without redeploying code.
- `RATE_LIMIT_LOGIN_MAX`: Max attempts allowed on the login route per window. Default: `5`.
- `RATE_LIMIT_LOGIN_WINDOW_MS`: Timeframe window for login attempts. Default: `900000` (15 minutes).
- `RATE_LIMIT_API_MAX`: Max requests allowed globally per window. Default: `100`.
- `RATE_LIMIT_API_WINDOW_MS`: Timeframe window for global API. Default: `900000` (15 minutes).

## Protected Zones

### 1. The Login Gateway
- A specialized constraint strictly targets `POST /api/auth/login`.
- If a specific IP address fails to login 5 times within 15 minutes, the router blocks the request gracefully and returns `{ "ok": false, "error": "too_many_attempts" }`.

### 2. The Global API
- A generalized constraint wraps the entire `/api/*` root mount within `backend/index.js`.
- Protects all administrative (`/api/admin`), authentication, delivery, and wallet endpoints from high-frequency spam or automated scrapping.
- Exceeding 100 requests per 15 minutes returns `{ "ok": false, "error": "too_many_requests" }`.

*(Both limiters utilize standard HTTP header communication, exposing `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` directly to legitimate frontend clients).*
