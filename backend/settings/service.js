const crypto = require("crypto");
const { pool } = require("../db");
const { env } = require("../config/env");
const { recreateNLoginPool } = require("../players/nlogin-db");
const { HttpError } = require("../errors");

let settingsCache = {};

async function ensureColumn(table, column, definition) {
  const [columns] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (columns.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function ensureIndex(table, indexName, definition) {
  const [indexes] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [indexName]);
  if (indexes.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD ${definition}`);
  }
}

async function ensureUniqueIndex(table, indexName, columnsSql) {
  const [indexes] = await pool.query(
    `SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`,
    [indexName]
  );
  if (indexes.length === 0) {
    await pool.query(
      `ALTER TABLE \`${table}\` ADD UNIQUE KEY \`${indexName}\` (${columnsSql})`
    );
    return;
  }
  if (indexes.some(index => Number(index.Non_unique) !== 0)) {
    throw new Error(`${table}.${indexName} must be a unique index`);
  }
}

async function ensureForeignKey(table, constraintName, definition) {
  const [constraints] = await pool.execute(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?`,
    [table, constraintName]
  );
  if (constraints.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraintName}\` ${definition}`);
  }
}

async function migrateManualTopups() {
  await ensureColumn(
    "topup_requests",
    "source",
    "ENUM('slip', 'manual') NOT NULL DEFAULT 'slip' AFTER `status`"
  );
  await ensureColumn(
    "topup_requests",
    "approved_by_user_id",
    "BIGINT UNSIGNED NULL AFTER `trans_ref`"
  );
  await ensureColumn(
    "topup_requests",
    "admin_note",
    "VARCHAR(500) NULL AFTER `approved_by_user_id`"
  );
  await ensureColumn(
    "topup_requests",
    "approved_at",
    "TIMESTAMP NULL AFTER `admin_note`"
  );
  await ensureUniqueIndex(
    "topup_requests",
    "topup_requests_trans_ref_idx",
    "`trans_ref`"
  );
  await ensureIndex(
    "topup_requests",
    "topup_requests_approved_by_idx",
    "KEY `topup_requests_approved_by_idx` (`approved_by_user_id`)"
  );
  await ensureForeignKey(
    "topup_requests",
    "topup_requests_approved_by_fk",
    "FOREIGN KEY (`approved_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL"
  );
  await pool.execute(
    `UPDATE topup_requests
     SET approved_at = updated_at
     WHERE status = 'approved' AND approved_at IS NULL`
  );
}

async function migrateOrderItemSnapshots() {
  await ensureColumn(
    "order_items",
    "product_name_snapshot",
    "VARCHAR(160) NULL AFTER `product_id`"
  );
  await ensureColumn(
    "order_items",
    "product_sku_snapshot",
    "VARCHAR(64) NULL AFTER `product_name_snapshot`"
  );
  await pool.execute(
    `UPDATE order_items oi
     JOIN products p ON p.id = oi.product_id
     SET oi.product_name_snapshot = COALESCE(oi.product_name_snapshot, p.name),
         oi.product_sku_snapshot = COALESCE(oi.product_sku_snapshot, p.sku)
     WHERE oi.product_name_snapshot IS NULL OR oi.product_sku_snapshot IS NULL`
  );
}

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

  try {
    await migrateManualTopups();
  } catch (err) {
    console.error("Migration: failed to prepare manual top-ups:", err);
    throw err;
  }

  try {
    await migrateOrderItemSnapshots();
  } catch (err) {
    console.error("Migration: failed to prepare order item snapshots:", err);
    throw err;
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
    if (key === "POINT_RATE") {
      const pointRate = Number(value);
      if (!Number.isFinite(pointRate) || pointRate <= 0 || pointRate > 100_000) {
        throw new HttpError(400, "invalid_point_rate");
      }
      value = String(pointRate);
    }

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
