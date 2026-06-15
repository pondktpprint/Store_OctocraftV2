const mysql = require("mysql2/promise");
const { env } = require("../config/env");

let nLoginPool = null;

async function recreateNLoginPool(settings) {
  if (nLoginPool) {
    try {
      await nLoginPool.end();
    } catch (e) {
      console.error("Error closing old nLogin pool:", e);
    }
  }

  nLoginPool = mysql.createPool({
    host: settings.NLOGIN_DB_HOST,
    port: Number(settings.NLOGIN_DB_PORT),
    database: settings.NLOGIN_DB_NAME,
    user: settings.NLOGIN_DB_USER,
    password: settings.NLOGIN_DB_PASSWORD,
    connectionLimit: 5,
    connectTimeout: 5000
  });
}

function getNLoginPool() {
  if (!nLoginPool) throw new Error("nLoginPool not initialized");
  return nLoginPool;
}

module.exports = { recreateNLoginPool, getNLoginPool };
