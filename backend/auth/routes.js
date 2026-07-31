const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { config } = require("../config");
const { HttpError, asyncHandler } = require("../errors");
const { issueToken, requireUser } = require("./session");
const { createLoginLimiter } = require("./rate-limit");

const authRouter = express.Router();

const loginLimiter = createLoginLimiter({
  windowMs: config.rateLimit.loginWindowMs,
  max: config.rateLimit.loginMax
});

const { verifyNLoginPassword } = require("../players/service");

authRouter.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!username || !password) throw new HttpError(400, "invalid_credentials");

  let localUser = null;

  // 1. Try nLogin Authentication first
  const nLoginPlayer = await verifyNLoginPassword(username, password);
  
  if (nLoginPlayer) {
    // nLogin auth succeeded. Ensure they exist locally.
    const [existing] = await pool.execute("SELECT id, username, role FROM users WHERE username = ?", [nLoginPlayer.username]);
    if (existing.length) {
      localUser = existing[0];
    } else {
      // Auto-register nLogin player in the store DB
      const [result] = await pool.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')",
        [nLoginPlayer.username, "[nlogin_managed]"]
      );
      localUser = { id: result.insertId, username: nLoginPlayer.username, role: 'user' };
      // Create initial wallet
      await pool.execute("INSERT IGNORE INTO wallet_accounts (user_id, balance_points) VALUES (?, 0)", [result.insertId]);
    }
  } else {
    // 2. Fallback to Local Authentication (for manually created Admins)
    const [rows] = await pool.execute(
      "SELECT id, username, password_hash, role FROM users WHERE username = ?",
      [username]
    );
    if (!rows.length) throw new HttpError(401, "invalid_credentials");
    
    localUser = rows[0];
    const valid = await bcrypt.compare(password, localUser.password_hash);
    if (!valid) throw new HttpError(401, "invalid_credentials");
  }

  res.json({
    ok: true,
    token: issueToken(localUser),
    user: { id: localUser.id, username: localUser.username, role: localUser.role }
  });
}));

authRouter.get("/me", requireUser, asyncHandler(async (req, res) => {
  res.json({ ok: true, user: req.user });
}));

module.exports = { authRouter };
