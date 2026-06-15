const jwt = require("jsonwebtoken");
const { config } = require("../config");
const { pool } = require("../db");
const { HttpError } = require("../errors");

function issueToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, username: user.username },
    config.jwtSecret,
    { expiresIn: "12h" }
  );
}

async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.replace(/^Bearer\s+/i, "");
    if (!token) throw new HttpError(401, "auth_required");
    const payload = jwt.verify(token, config.jwtSecret);
    const [rows] = await pool.execute(
      "SELECT id, username, role FROM users WHERE id = ?",
      [payload.sub]
    );
    if (!rows.length) throw new HttpError(401, "auth_required");
    req.user = rows[0];
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "auth_required"));
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    next(new HttpError(403, "admin_required"));
    return;
  }
  next();
}

module.exports = { issueToken, requireUser, requireAdmin };
