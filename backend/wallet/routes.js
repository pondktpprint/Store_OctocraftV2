const express = require("express");
const { pool } = require("../db");
const { asyncHandler } = require("../errors");
const { requireUser } = require("../auth/session");

const walletRouter = express.Router();

walletRouter.get("/", requireUser, asyncHandler(async (req, res) => {
  await pool.execute(
    "INSERT IGNORE INTO wallet_accounts (user_id, balance_points) VALUES (?, 0)",
    [req.user.id]
  );
  const [accounts] = await pool.execute(
    "SELECT balance_points FROM wallet_accounts WHERE user_id = ?",
    [req.user.id]
  );
  const [transactions] = await pool.execute(
    `SELECT id, type, amount_points, balance_after, reference_type, reference_id, created_at
     FROM wallet_transactions
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json({
    ok: true,
    wallet: accounts[0],
    transactions
  });
}));

module.exports = { walletRouter };
