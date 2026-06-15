# Beta Deployment Checklist

This document provides a comprehensive runbook for deploying the OctoCraft SMP Store to the beta environment. Ensure every checkbox is completed sequentially before announcing the beta launch.

---

## 1. Environment Variables
- [ ] Copy `.env.example` to `.env` on the production host.
- [ ] Configure `STORE_DB_HOST`, `STORE_DB_PORT`, `STORE_DB_NAME`, `STORE_DB_USER`, and `STORE_DB_PASSWORD`.
- [ ] Configure `NLOGIN_DB_HOST`, `NLOGIN_DB_PORT`, `NLOGIN_DB_NAME`, `NLOGIN_DB_USER`, and `NLOGIN_DB_PASSWORD`.
- [ ] Generate a secure, high-entropy 256-bit string for `JWT_SECRET`.
- [ ] Adjust `RATE_LIMIT_LOGIN_MAX` and `RATE_LIMIT_API_MAX` according to expected beta traffic.
- [ ] Start the backend service and ensure no `[FATAL]` config errors are thrown.

## 2. Database Migration
- [ ] Execute `schema.sql` (and `mock_data.sql` if seeding initial products is desired) against the production `STORE_DB_NAME`.
- [ ] Ensure all 7 core tables are present (`users`, `products`, `orders`, `order_items`, `delivery_jobs`, `wallet_transactions`, `topup_requests`).
- [ ] Verify `FOREIGN KEY` constraints are actively enforced in the MySQL engine.

## 3. Backup Verification
- [ ] Run `/scripts/backup.sh` manually.
- [ ] Verify that an `.sql.gz` artifact is successfully generated in the `/backups` directory.
- [ ] Decompress and inspect the archive header to guarantee structural integrity.
- [ ] Register the backup script into the host machine's `crontab` to run nightly at 3:00 AM.

## 4. HTTPS Setup
- [ ] Provision an SSL certificate via Let's Encrypt (Certbot) or your infrastructure provider for the store domain (e.g., `store.octocraft.net`).
- [ ] Configure TLS 1.2+ minimum protocols.
- [ ] Disable legacy SSLv3 and TLS 1.0/1.1 protocols to prevent downgrade attacks.

## 5. Nginx Reverse Proxy
- [ ] Install and configure Nginx.
- [ ] Set up a server block to reverse-proxy port 80/443 traffic to the internal Node.js process (default `http://127.0.0.1:3000`).
- [ ] Ensure proxy headers are forwarded correctly (`X-Forwarded-For`, `X-Real-IP`).
- [ ] *Note:* If using Cloudflare, ensure Nginx respects Cloudflare's visitor IP headers so `express-rate-limit` throttles the actual user, not the CDN.

## 6. Rate Limit Verification
- [ ] Spam the `POST /api/auth/login` endpoint 6 times within 15 minutes.
- [ ] Verify the 6th attempt is successfully rejected with `{ "ok": false, "error": "too_many_attempts" }`.
- [ ] Verify the global `X-RateLimit-Remaining` headers are visible in the API response.

## 7. Admin Account Setup
- [ ] Register a standard user account via the store frontend.
- [ ] Access the MySQL terminal or UI and manually elevate the user: `UPDATE users SET role = 'admin' WHERE username = 'YourName';`
- [ ] Log in and verify the "Admin Dashboard" button is visible and grants access.

## 8. nLogin Connection Verification
- [ ] From the Admin Dashboard, navigate to the **Players** tab.
- [ ] Search for a known active nLogin username.
- [ ] Verify the profile correctly retrieves and displays the player's Email and Last Seen metadata.

## 9. Bridge Connection Verification
- [ ] Launch the OctoCraft Java server plugins.
- [ ] Verify the plugin establishes a WebSocket connection to `ws://store-domain:3000/api/rcon`.
- [ ] Check backend logs for the successful connection event.

## 10. Wallet Integrity Test
- [ ] Use the Admin Dashboard to **Credit** 500 Points to a test user.
- [ ] Log in as the test user and verify the balance displays exactly 500.
- [ ] Use the Admin Dashboard to **Debit** 1000 Points from the test user.
- [ ] Verify the debit safely bounces or correctly zeroes out without causing an integer underflow crash.

## 11. Order Delivery Test
- [ ] As the test user, add an active product to the cart and click "Checkout".
- [ ] Verify the wallet balance decreases correctly.
- [ ] Verify a `delivery_job` is created in the database.
- [ ] Check the Java server console to ensure the Minecraft Command (`command_payload`) is received and executed in-game.
- [ ] Refresh the Admin Dashboard and verify the job status updates to `success`.

## 12. Restore-from-Backup Test
- [ ] Take a snapshot backup using `/scripts/backup.sh`.
- [ ] Intentionally delete a product from the database to simulate data loss.
- [ ] Perform the restore protocol: `gunzip < backups/file.sql.gz | mysql -u user -p db_name`.
- [ ] Verify the deleted product is successfully restored to the frontend.

## 13. Rollback Procedure
- [ ] Keep the previous known-good binary or git commit hash documented.
- [ ] In the event of a catastrophic logic failure, run `git checkout <previous_hash>` and `npm install`.
- [ ] Use the latest nightly database snapshot to revert the database schema if breaking schema changes were applied.

## 14. Monitoring and Logs
- [ ] Set up PM2 or Systemd to manage the Node.js process and ensure it restarts automatically on failure.
- [ ] Ensure `pm2 logs` (or journalctl) are actively writing to a persistent disk location.
- [ ] (Optional) Hook the logs into a centralized aggregation tool (e.g., Datadog, ELK) to monitor `[FATAL]` tags or excessive `too_many_attempts` warnings.
