const express = require("express");
const { pool, transaction } = require("../db");
const { HttpError, asyncHandler } = require("../errors");
const { requireUser, requireAdmin } = require("../auth/session");
const { recordTransaction } = require("../wallet/service");
const { getConnectedClientCount } = require("../rcon/bridge");
const { checkHealth } = require("../players/service");
const { config, env } = require("../config");
const { getSettings, updateBulkSettings, regenerateBridgeToken } = require("../settings/service");

const adminRouter = express.Router();

adminRouter.use(requireUser, requireAdmin);

adminRouter.get("/system-status", asyncHandler(async (req, res) => {
  const nloginDbStatus = await checkHealth();
  const settings = await getSettings();
  res.json({
    ok: true,
    bridge_token: settings.BRIDGE_TOKEN,
    bridge_connected: getConnectedClientCount() > 0,
    nlogin_db_status: nloginDbStatus
  });
}));

adminRouter.get("/settings", asyncHandler(async (req, res) => {
  const settings = await getSettings();
  res.json({ ok: true, settings });
}));

adminRouter.post("/settings", asyncHandler(async (req, res) => {
  await updateBulkSettings(req.body);
  res.json({ ok: true });
}));

adminRouter.post("/settings/regenerate-token", asyncHandler(async (req, res) => {
  const newToken = await regenerateBridgeToken();
  res.json({ ok: true, token: newToken });
}));

adminRouter.get("/orders", asyncHandler(async (req, res) => {
  const [orders] = await pool.execute(
    `SELECT o.id, o.status, o.total_points, o.created_at, u.username
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ORDER BY o.id DESC
     LIMIT 100`
  );
  res.json({ ok: true, orders });
}));

adminRouter.get("/delivery-jobs", asyncHandler(async (req, res) => {
  const [jobs] = await pool.execute(
    `SELECT id, order_id, order_item_id, status, retry_count, last_error, updated_at
     FROM delivery_jobs
     ORDER BY id DESC
     LIMIT 100`
  );
  res.json({ ok: true, jobs });
}));

adminRouter.get("/products", asyncHandler(async (req, res) => {
  const [products] = await pool.execute(
    "SELECT id, sku, name, description, price_points, category, minecraft_command, active FROM products ORDER BY id DESC"
  );
  res.json({ ok: true, products });
}));

adminRouter.post("/delivery-jobs/:id/retry", asyncHandler(async (req, res) => {
  await pool.execute(
    `UPDATE delivery_jobs 
     SET status = 'queued', last_error = NULL, retry_count = retry_count + 1 
     WHERE id = ?`,
    [req.params.id]
  );
  res.json({ ok: true });
}));

adminRouter.get("/wallet", asyncHandler(async (req, res) => {
  const [transactions] = await pool.execute(
    `SELECT wt.id, wt.type, wt.amount_points, wt.balance_after, wt.reference_type, wt.created_at, u.username
     FROM wallet_transactions wt
     JOIN users u ON u.id = wt.user_id
     ORDER BY wt.id DESC
     LIMIT 100`
  );
  res.json({ ok: true, transactions });
}));

adminRouter.post("/wallet/credit", asyncHandler(async (req, res) => {
  const { username, amount_points } = req.body;
  if (!username || !amount_points) throw new HttpError(400, "missing_fields");
  
  await transaction(async (connection) => {
    const [users] = await connection.execute("SELECT id FROM users WHERE username = ?", [username]);
    if (!users.length) throw new HttpError(404, "user_not_found");
    
    await recordTransaction(connection, {
      userId: users[0].id,
      type: "credit",
      amountPoints: amount_points,
      referenceType: "admin_credit"
    });
  });
  res.json({ ok: true });
}));

adminRouter.post("/wallet/debit", asyncHandler(async (req, res) => {
  const { username, amount_points } = req.body;
  if (!username || !amount_points) throw new HttpError(400, "missing_fields");
  
  await transaction(async (connection) => {
    const [users] = await connection.execute("SELECT id FROM users WHERE username = ?", [username]);
    if (!users.length) throw new HttpError(404, "user_not_found");
    
    await recordTransaction(connection, {
      userId: users[0].id,
      type: "debit",
      amountPoints: amount_points,
      referenceType: "admin_debit"
    });
  });
  res.json({ ok: true });
}));

adminRouter.get("/topup", asyncHandler(async (req, res) => {
  const [requests] = await pool.execute(
    `SELECT tr.id, tr.status, tr.amount_minor, tr.points, tr.provider_reference, tr.created_at, u.username
     FROM topup_requests tr
     JOIN users u ON u.id = tr.user_id
     ORDER BY tr.id DESC
     LIMIT 100`
  );
  res.json({ ok: true, requests });
}));

adminRouter.post("/topup/:id/approve", asyncHandler(async (req, res) => {
  await transaction(async (connection) => {
    const [reqs] = await connection.execute(
      "SELECT id, user_id, status, points FROM topup_requests WHERE id = ? FOR UPDATE", 
      [req.params.id]
    );
    if (!reqs.length) throw new HttpError(404, "request_not_found");
    if (reqs[0].status !== "pending") throw new HttpError(400, "not_pending");

    await connection.execute(
      "UPDATE topup_requests SET status = 'approved' WHERE id = ?",
      [req.params.id]
    );

    await recordTransaction(connection, {
      userId: reqs[0].user_id,
      type: "credit",
      amountPoints: reqs[0].points,
      referenceType: "topup",
      referenceId: reqs[0].id
    });
  });
  res.json({ ok: true });
}));

adminRouter.post("/topup/:id/reject", asyncHandler(async (req, res) => {
  const [result] = await pool.execute(
    "UPDATE topup_requests SET status = 'rejected' WHERE id = ? AND status = 'pending'",
    [req.params.id]
  );
  if (result.affectedRows === 0) throw new HttpError(400, "cannot_reject");
  res.json({ ok: true });
}));

module.exports = { adminRouter };
