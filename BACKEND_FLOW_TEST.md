# Backend Flow Test

Goal: test `login -> products -> wallet credit -> checkout -> delivery job -> bridge success -> order delivered`.

Most steps use `curl`. Two steps cannot be pure `curl` in the current backend:

- Wallet credit: no payment gateway or admin wallet-credit API exists yet, so seed wallet credit directly in MySQL.
- Bridge success: `/bridge` is WebSocket; use a WebSocket client to send `delivery_result`.

## Environment

```bash
export API="http://127.0.0.1:4987"
export MYSQL_PWD="$MYSQL_PASSWORD"
```

Start backend:

```bash
npm start
```

## 1. Seed Test Data

Create password hashes:

```bash
node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('admin-pass', 12)); console.log(bcrypt.hashSync('user-pass', 12));"
```

Insert an admin user, player user, wallet row, and product. Replace hash values first.

```bash
mysql -h "$MYSQL_HOST" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" "$MYSQL_DATABASE" <<'SQL'
INSERT INTO users (username, password_hash, role)
VALUES
  ('flow_admin', '<ADMIN_BCRYPT_HASH>', 'admin'),
  ('flow_player', '<USER_BCRYPT_HASH>', 'user')
ON DUPLICATE KEY UPDATE username = VALUES(username);

INSERT IGNORE INTO wallet_accounts (user_id, balance_points)
SELECT id, 0 FROM users WHERE username = 'flow_player';

INSERT INTO products (sku, name, description, price_points, minecraft_command, active)
VALUES ('flow_rank', 'Flow Rank', 'Flow test product', 100, 'lp user {player} parent add flow', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  price_points = VALUES(price_points),
  minecraft_command = VALUES(minecraft_command),
  active = 1;
SQL
```

## 2. Login

Player login:

```bash
curl -sS "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"flow_player","password":"user-pass"}'
```

Save token:

```bash
export USER_TOKEN="$(curl -sS "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"flow_player","password":"user-pass"}' \
  | node -pe 'JSON.parse(fs.readFileSync(0,"utf8")).token')"
```

Check session:

```bash
curl -sS "$API/api/auth/me" \
  -H "Authorization: Bearer $USER_TOKEN"
```

## 3. Products

List active products:

```bash
curl -sS "$API/api/products"
```

Save product id:

```bash
export PRODUCT_ID="$(curl -sS "$API/api/products" \
  | node -pe 'JSON.parse(fs.readFileSync(0,"utf8")).products.find(p => p.sku === "flow_rank").id')"
```

## 4. Wallet Credit

There is no wallet credit API yet. Seed a real ledger credit in MySQL:

```bash
mysql -h "$MYSQL_HOST" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" "$MYSQL_DATABASE" <<'SQL'
START TRANSACTION;
SET @user_id := (SELECT id FROM users WHERE username = 'flow_player');
INSERT IGNORE INTO wallet_accounts (user_id, balance_points) VALUES (@user_id, 0);
SELECT balance_points INTO @before_balance FROM wallet_accounts WHERE user_id = @user_id FOR UPDATE;
SET @after_balance := @before_balance + 500;
UPDATE wallet_accounts SET balance_points = @after_balance WHERE user_id = @user_id;
INSERT INTO wallet_transactions
  (user_id, type, amount_points, balance_after, reference_type, reference_id)
VALUES
  (@user_id, 'credit', 500, @after_balance, 'manual_flow_test', NULL);
COMMIT;
SQL
```

Verify wallet with curl:

```bash
curl -sS "$API/api/wallet" \
  -H "Authorization: Bearer $USER_TOKEN"
```

## 5. Checkout

Create an order. Do not send a price; backend calculates from DB product price.

```bash
curl -sS "$API/api/orders" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product_id\":$PRODUCT_ID,\"quantity\":1}]}"
```

Save order id:

```bash
export ORDER_ID="$(curl -sS "$API/api/orders" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product_id\":$PRODUCT_ID,\"quantity\":1}]}" \
  | node -pe 'JSON.parse(fs.readFileSync(0,"utf8")).order.id')"
```

Check order is pending delivery:

```bash
curl -sS "$API/api/orders/$ORDER_ID" \
  -H "Authorization: Bearer $USER_TOKEN"
```

## 6. Delivery Job

Find the queued delivery job:

```bash
mysql -h "$MYSQL_HOST" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" "$MYSQL_DATABASE" \
  -e "SELECT id, order_id, status, command_payload FROM delivery_jobs WHERE order_id = $ORDER_ID;"
```

## 7. Bridge Success

Connect the bridge with a WebSocket client. The backend sends queued jobs after the bridge sends `ready`.

Example using `wscat`:

```bash
wscat -c "ws://127.0.0.1:4987/bridge?token=$BRIDGE_TOKEN"
```

Send:

```json
{"type":"ready"}
```

The server replies with:

```json
{"type":"execute_command","message_id":"...","job_id":1,"command":"lp user flow_player parent add flow"}
```

Copy `message_id`, then send success:

```json
{"type":"delivery_result","message_id":"<MESSAGE_ID>","success":true}
```

## 8. Order Delivered

Confirm delivery job state:

```bash
mysql -h "$MYSQL_HOST" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" "$MYSQL_DATABASE" \
  -e "SELECT id, order_id, status, retry_count, last_error FROM delivery_jobs WHERE order_id = $ORDER_ID;"
```

Confirm order is delivered:

```bash
curl -sS "$API/api/orders/$ORDER_ID" \
  -H "Authorization: Bearer $USER_TOKEN"
```

Expected order status:

```json
"status":"delivered"
```

## Optional Admin Checks

Login as admin:

```bash
export ADMIN_TOKEN="$(curl -sS "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"flow_admin","password":"admin-pass"}' \
  | node -pe 'JSON.parse(fs.readFileSync(0,"utf8")).token')"
```

Admin list orders:

```bash
curl -sS "$API/api/admin/orders" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Admin list delivery jobs:

```bash
curl -sS "$API/api/admin/delivery-jobs" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```
