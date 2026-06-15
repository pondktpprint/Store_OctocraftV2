const { nLoginPool } = require("./nlogin-db");
const { env } = require("../config/env");

const TBL = env.NLOGIN_TABLE;
const COL_ID = env.NLOGIN_COL_ID;
const COL_USERNAME = env.NLOGIN_COL_USERNAME;
const COL_EMAIL = env.NLOGIN_COL_EMAIL;
const COL_CREATED = env.NLOGIN_COL_CREATED_AT;
const COL_LAST_SEEN = env.NLOGIN_COL_LAST_SEEN;

// Enforces strict return schema to prevent leaking passwords, tokens, hashes, salts, or IPs
function mapSafePlayer(row) {
  if (!row) return null;
  return {
    id: row[COL_ID],
    username: row[COL_USERNAME],
    email: row[COL_EMAIL],
    created_at: row[COL_CREATED],
    last_seen: row[COL_LAST_SEEN]
  };
}

async function checkHealth() {
  try {
    await nLoginPool.execute("SELECT 1");
    return true;
  } catch (error) {
    console.error("nLogin DB Health Check Failed:", error);
    return false;
  }
}

async function searchPlayers(query) {
  if (!query) return [];
  const [rows] = await nLoginPool.execute(
    `SELECT ??, ??, ??, ??, ?? FROM ?? WHERE ?? LIKE ? LIMIT 50`,
    [
      COL_ID, COL_USERNAME, COL_EMAIL, COL_CREATED, COL_LAST_SEEN,
      TBL,
      COL_USERNAME,
      `%${query}%`
    ]
  );
  return rows.map(mapSafePlayer);
}

async function getPlayerByUsername(username) {
  if (!username) return null;
  const [rows] = await nLoginPool.execute(
    `SELECT ??, ??, ??, ??, ?? FROM ?? WHERE ?? = ? LIMIT 1`,
    [
      COL_ID, COL_USERNAME, COL_EMAIL, COL_CREATED, COL_LAST_SEEN,
      TBL,
      COL_USERNAME,
      username
    ]
  );
  return mapSafePlayer(rows[0]);
}

const bcrypt = require("bcryptjs");

async function verifyNLoginPassword(username, password) {
  if (!username || !password) return null;
  try {
    const [rows] = await nLoginPool.execute(
      `SELECT ??, ?? FROM ?? WHERE ?? = ? LIMIT 1`,
      [COL_ID, env.NLOGIN_COL_PASSWORD, TBL, COL_USERNAME, username]
    );
    if (!rows.length) return null;
    
    const hash = String(rows[0][env.NLOGIN_COL_PASSWORD]);
    const valid = await bcrypt.compare(password, hash);
    if (!valid) return null;

    return getPlayerByUsername(username); // Returns the safe mapped player object
  } catch (error) {
    console.error("nLogin verification error:", error);
    return null;
  }
}

module.exports = {
  checkHealth,
  searchPlayers,
  getPlayerByUsername,
  verifyNLoginPassword
};
