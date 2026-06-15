const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { config } = require("../config");
const { HttpError, asyncHandler } = require("../errors");
const { issueToken, requireUser } = require("./session");

const authRouter = express.Router();

const loginLimiter = rateLimit({
  windowMs: config.rateLimit.loginWindowMs,
  max: config.rateLimit.loginMax,
  message: { ok: false, error: "too_many_attempts" },
  standardHeaders: true,
  legacyHeaders: false,
});

authRouter.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!username || !password) throw new HttpError(400, "invalid_credentials");

  const [rows] = await pool.execute(
    "SELECT id, username, password_hash, role FROM users WHERE username = ?",
    [username]
  );
  if (!rows.length) throw new HttpError(401, "invalid_credentials");

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new HttpError(401, "invalid_credentials");

  res.json({
    ok: true,
    token: issueToken(user),
    user: { id: user.id, username: user.username, role: user.role }
  });
}));

authRouter.get("/me", requireUser, asyncHandler(async (req, res) => {
  res.json({ ok: true, user: req.user });
}));

module.exports = { authRouter };
