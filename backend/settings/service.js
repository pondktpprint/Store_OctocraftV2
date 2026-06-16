const crypto = require("crypto");
const { pool } = require("../db");
const { env } = require("../config/env");
const { recreateNLoginPool } = require("../players/nlogin-db");

let settingsCache = {};

async function initSettings() {
  // Create table if it doesn't exist
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      setting_value TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Migration: Add category and image columns to products table if not exists
  try {
    const [cols] = await pool.execute("SHOW COLUMNS FROM products LIKE 'category'");
    if (cols.length === 0) {
      await pool.execute("ALTER TABLE products ADD COLUMN category VARCHAR(64) NOT NULL DEFAULT 'Rank'");
    }

    const [imgCols] = await pool.execute("SHOW COLUMNS FROM products LIKE 'image'");
    if (imgCols.length === 0) {
      await pool.execute("ALTER TABLE products ADD COLUMN image VARCHAR(255) NULL");
    }
  } catch (err) {
    console.error("Migration: failed to add columns:", err);
  }

  // Load existing settings
  const [rows] = await pool.execute("SELECT setting_key, setting_value FROM system_settings");
  rows.forEach(row => {
    settingsCache[row.setting_key] = row.setting_value;
  });

  // Seed default settings from .env if they don't exist in DB
  const defaults = {
    BRIDGE_TOKEN: env.BRIDGE_TOKEN || crypto.randomBytes(32).toString("hex"),
    NLOGIN_DB_HOST: env.NLOGIN_DB_HOST || "localhost",
    NLOGIN_DB_PORT: String(env.NLOGIN_DB_PORT || 3306),
    NLOGIN_DB_NAME: env.NLOGIN_DB_NAME || "nlogin",
    NLOGIN_DB_USER: env.NLOGIN_DB_USER || "root",
    NLOGIN_DB_PASSWORD: env.NLOGIN_DB_PASSWORD || "",
    SERVER_IP: "127.0.0.1",
    SERVER_PORT: "25565",
    PROMPTPAY_TARGET: "0812345678",
    PROMPTPAY_NAME: "นาย ทดสอบ ระบบ",
    POINT_RATE: "1.0",
    EASYSLIP_API_KEY: ""
  };

  for (const [key, val] of Object.entries(defaults)) {
    if (settingsCache[key] === undefined) {
      await saveSetting(key, val);
    }
  }

  // Initialize the nLogin Pool with the loaded settings
  await recreateNLoginPool(settingsCache);
}

async function getSettings() {
  return settingsCache;
}

async function saveSetting(key, value) {
  await pool.execute(
    "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
    [key, value, value]
  );
  settingsCache[key] = value;
}

function savePromoImage(base64Image) {
  if (!base64Image || !base64Image.startsWith('data:image/')) return null;
  const matches = base64Image.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `promo_${Date.now()}.${ext}`;
  const savePath = require('path').join(__dirname, '../../frontend/public/images/promo', filename);
  
  require('fs').mkdirSync(require('path').dirname(savePath), { recursive: true });
  require('fs').writeFileSync(savePath, buffer);
  
  return `images/promo/${filename}`;
}

async function updateBulkSettings(newSettings) {
  let dbConfigChanged = false;

  for (let [key, value] of Object.entries(newSettings)) {
    if (key === "PROMO_IMAGE" && value && value.startsWith('data:image/')) {
      const savedPath = savePromoImage(value);
      if (savedPath) value = savedPath;
    }

    if (settingsCache[key] !== value) {
      await saveSetting(key, value);
      if (key.startsWith("NLOGIN_DB_")) {
        dbConfigChanged = true;
      }
    }
  }

  if (dbConfigChanged) {
    await recreateNLoginPool(settingsCache);
  }
}

async function regenerateBridgeToken() {
  const newToken = "octo_" + crypto.randomBytes(32).toString("hex");
  await saveSetting("BRIDGE_TOKEN", newToken);
  return newToken;
}

module.exports = {
  initSettings,
  getSettings,
  saveSetting,
  updateBulkSettings,
  regenerateBridgeToken
};
