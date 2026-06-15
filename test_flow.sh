#!/bin/bash
set -e

export API="http://127.0.0.1:4987"
export MYSQL_HOST="127.0.0.1"
export MYSQL_PORT="3306"
export MYSQL_USER="root"
export MYSQL_PASSWORD="root"
export MYSQL_DATABASE="store"
export BRIDGE_TOKEN="bridgetoken123"

# 1. Seed Test Data
node -e "const bcrypt=require('bcryptjs'); console.log('ADMIN_HASH=' + bcrypt.hashSync('admin-pass', 12)); console.log('USER_HASH=' + bcrypt.hashSync('user-pass', 12));" > hashes.txt
ADMIN_HASH=$(grep ADMIN_HASH hashes.txt | cut -d= -f2)
USER_HASH=$(grep USER_HASH hashes.txt | cut -d= -f2)

mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" <<SQL
INSERT INTO users (username, password_hash, role)
VALUES
  ('flow_admin', '${ADMIN_HASH}', 'admin'),
  ('flow_player', '${USER_HASH}', 'user')
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

# 2. Login
USER_TOKEN=$(curl -sS "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"flow_player","password":"user-pass"}' \
  | node -pe 'JSON.parse(fs.readFileSync(0,"utf8")).token')

echo "USER_TOKEN=$USER_TOKEN"

# 3. Products
PRODUCT_ID=$(curl -sS "$API/api/products" \
  | node -pe 'JSON.parse(fs.readFileSync(0,"utf8")).products.find(p => p.sku === "flow_rank").id')

echo "PRODUCT_ID=$PRODUCT_ID"

# 4. Wallet Credit
mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" <<'SQL'
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

curl -sS "$API/api/wallet" \
  -H "Authorization: Bearer $USER_TOKEN"

# 5. Checkout
ORDER_ID=$(curl -sS "$API/api/orders" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product_id\":$PRODUCT_ID,\"quantity\":1}]}" \
  | node -pe 'JSON.parse(fs.readFileSync(0,"utf8")).order.id')

echo "ORDER_ID=$ORDER_ID"

# 6. Delivery Job
mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  -e "SELECT id, order_id, status, command_payload FROM delivery_jobs WHERE order_id = $ORDER_ID;"

echo "Flow setup complete. Use wscat to test bridge next."
