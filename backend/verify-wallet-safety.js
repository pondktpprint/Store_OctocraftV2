const assert = require("assert");
const fs = require("fs");
const path = require("path");

const walletService = fs.readFileSync(path.join(__dirname, "wallet", "service.js"), "utf8");
const ordersRoutes = fs.readFileSync(path.join(__dirname, "orders", "routes.js"), "utf8");
const db = fs.readFileSync(path.join(__dirname, "db.js"), "utf8");
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

assert(walletService.includes('input.type !== "credit" && input.type !== "debit"'));
assert(walletService.includes("invalid_wallet_transaction_type"));
assert(walletService.includes("if (nextBalance < 0n)"));
assert(walletService.includes("insufficient_wallet_balance"));
assert(walletService.includes("INSERT INTO wallet_transactions"));
assert(walletService.includes("UPDATE wallet_accounts SET balance_points = ? WHERE user_id = ?"));
assert(walletService.indexOf("UPDATE wallet_accounts") < walletService.indexOf("INSERT INTO wallet_transactions"));

assert(ordersRoutes.includes("const order = await transaction(async (connection) => {"));
assert(ordersRoutes.includes("await recordTransaction(connection"));
assert(ordersRoutes.includes('type: "debit"'));
assert(ordersRoutes.includes("INSERT INTO orders"));
assert(ordersRoutes.includes("INSERT INTO order_items"));
assert(ordersRoutes.includes("INSERT INTO delivery_jobs"));
assert(ordersRoutes.indexOf("await recordTransaction(connection") > ordersRoutes.indexOf("INSERT INTO orders"));
assert(ordersRoutes.indexOf("await recordTransaction(connection") < ordersRoutes.indexOf("INSERT INTO order_items"));
assert(ordersRoutes.indexOf("await recordTransaction(connection") < ordersRoutes.indexOf("INSERT INTO delivery_jobs"));

assert(db.includes("await connection.beginTransaction()"));
assert(db.includes("await connection.commit()"));
assert(db.includes("await connection.rollback()"));
assert(db.indexOf("await connection.rollback()") < db.indexOf("throw error"));

assert(schema.includes("type ENUM('credit', 'debit') NOT NULL"));
assert(schema.includes("balance_after BIGINT NOT NULL"));

console.log("wallet safety verification passed");
