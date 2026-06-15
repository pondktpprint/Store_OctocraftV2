#!/bin/bash
set -e

export MYSQL_HOST="127.0.0.1"
export MYSQL_PORT="3306"
export MYSQL_USER="root"
export MYSQL_PASSWORD="root"
export MYSQL_DATABASE="store"

npm start &
PID=$!
sleep 2

node test_ws.js

kill $PID || true

echo "Checking delivery jobs:"
mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  -e "SELECT id, order_id, status, retry_count, last_error FROM delivery_jobs;"

echo "Checking orders:"
mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  -e "SELECT id, status FROM orders;"
