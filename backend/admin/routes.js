const express = require("express");
const { pool, transaction } = require("../db");
const { HttpError, asyncHandler } = require("../errors");
const { requireUser, requireAdmin } = require("../auth/session");
const { recordTransaction } = require("../wallet/service");
const { getConnectedClientCount } = require("../rcon/bridge");
const { checkHealth } = require("../players/service");
const { config, env } = require("../config");
const { getSettings, updateBulkSettings, regenerateBridgeToken } = require("../settings/service");
const {
  parseManualTopupInput,
  parseTransactionReference,
  parseManualTopupReason
} = require("./manual-topup");
const { checkEasySlipHealth } = require("./easyslip-health");

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

adminRouter.get("/easyslip-health", asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const health = await checkEasySlipHealth(settings.EASYSLIP_API_KEY, {
    force: req.query.refresh === "1"
  });
  const [rows] = await pool.execute(
    `SELECT id, status, amount_minor, points, admin_note, created_at, approved_at
     FROM topup_requests
     WHERE source = 'slip'
     ORDER BY id DESC
     LIMIT 1`
  );
  const latest = rows[0] || null;

  res.set("Cache-Control", "private, no-store");
  res.json({
    ok: true,
    health: {
      ...health,
      lastVerification: latest ? {
        id: String(latest.id),
        status: latest.status,
        amount: Number(latest.amount_minor) / 100,
        points: Number(latest.points),
        reason: latest.admin_note || null,
        createdAt: latest.created_at,
        approvedAt: latest.approved_at
      } : null
    }
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
    `SELECT wt.id, wt.type, wt.amount_points, wt.balance_after,
            wt.reference_type, wt.reference_id, wt.created_at, u.username
     FROM wallet_transactions wt
     JOIN users u ON u.id = wt.user_id
     ORDER BY wt.id DESC
     LIMIT 100`
  );
  res.json({ ok: true, transactions });
}));

adminRouter.get("/wallet/player/:username", asyncHandler(async (req, res) => {
  const [users] = await pool.execute(
    `SELECT u.id, u.username, COALESCE(wa.balance_points, 0) AS balance_points
     FROM users u
     LEFT JOIN wallet_accounts wa ON wa.user_id = u.id
     WHERE u.username = ?
     LIMIT 1`,
    [req.params.username]
  );
  if (!users.length) throw new HttpError(404, "user_not_found");

  const [transactions] = await pool.execute(
    `SELECT wt.id, wt.type, wt.amount_points, wt.balance_after,
            wt.reference_type, wt.reference_id, wt.created_at
     FROM wallet_transactions wt
     WHERE wt.user_id = ?
     ORDER BY wt.id DESC
     LIMIT 100`,
    [users[0].id]
  );

  res.json({
    ok: true,
    player: {
      id: users[0].id,
      username: users[0].username,
      balance_points: Number(users[0].balance_points)
    },
    transactions
  });
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
    `SELECT tr.id, tr.status, tr.source, tr.amount_minor, tr.points,
            tr.provider_reference, tr.trans_ref, tr.admin_note,
            tr.approved_at, tr.created_at, u.username,
            admin_user.username AS approved_by
     FROM topup_requests tr
     JOIN users u ON u.id = tr.user_id
     LEFT JOIN users admin_user ON admin_user.id = tr.approved_by_user_id
     ORDER BY tr.id DESC
     LIMIT 100`
  );
  res.json({ ok: true, requests });
}));

async function findTopupByTransactionReference(executor, transactionReference) {
  const [rows] = await executor.execute(
    `SELECT tr.id, tr.user_id, tr.status, tr.source, tr.amount_minor, tr.points,
            tr.trans_ref, u.username, COALESCE(wa.balance_points, 0) AS balance_points,
            EXISTS(
              SELECT 1
              FROM wallet_transactions wt
              WHERE wt.user_id = tr.user_id
                AND wt.type = 'credit'
                AND wt.amount_points = tr.points
                AND wt.reference_type = 'admin_topup'
                AND wt.reference_id = tr.id
            ) AS wallet_recorded
     FROM topup_requests tr
     JOIN users u ON u.id = tr.user_id
     LEFT JOIN wallet_accounts wa ON wa.user_id = tr.user_id
     WHERE tr.trans_ref = ?
     LIMIT 1`,
    [transactionReference]
  );
  return rows[0] || null;
}

function matchesManualTopup(existing, userId, amountMinor) {
  return existing &&
    existing.source === "manual" &&
    existing.status === "approved" &&
    String(existing.user_id) === String(userId) &&
    Number(existing.amount_minor) === amountMinor;
}

function mapManualTopupResult(row, idempotent) {
  return {
    id: row.id,
    username: row.username,
    amount_minor: Number(row.amount_minor),
    points: Number(row.points),
    balance_points: Number(row.balance_points),
    transaction_reference: row.trans_ref,
    idempotent
  };
}

adminRouter.post("/topup/manual", asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const input = parseManualTopupInput(req.body, settings.POINT_RATE || 1);

  const executeManualTopup = async () => transaction(async (connection) => {
    const [users] = await connection.execute(
      "SELECT id, username FROM users WHERE username = ? FOR UPDATE",
      [input.username]
    );
    if (!users.length) throw new HttpError(404, "user_not_found");
    const user = users[0];

    const existing = await findTopupByTransactionReference(connection, input.transactionReference);
    if (existing) {
      if (matchesManualTopup(existing, user.id, input.amountMinor) && Number(existing.wallet_recorded) === 1) {
        return mapManualTopupResult(existing, true);
      }
      if (matchesManualTopup(existing, user.id, input.amountMinor)) {
        throw new HttpError(409, "manual_topup_inconsistent");
      }
      throw new HttpError(409, "transaction_reference_already_used");
    }

    const [pending] = await connection.execute(
      `SELECT id
       FROM topup_requests
       WHERE user_id = ?
         AND status = 'pending'
         AND amount_minor = ?
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE`,
      [user.id, input.amountMinor]
    );
    if (pending.length) {
      throw new HttpError(409, "pending_topup_exists");
    }

    let insertResult;
    try {
      [insertResult] = await connection.execute(
        `INSERT INTO topup_requests
         (user_id, status, source, amount_minor, points, trans_ref,
          approved_by_user_id, admin_note, approved_at)
         VALUES (?, 'approved', 'manual', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          user.id,
          input.amountMinor,
          input.points,
          input.transactionReference,
          req.user.id,
          input.reason
        ]
      );
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        error.manualTopupReferenceConflict = true;
      }
      throw error;
    }

    const walletResult = await recordTransaction(connection, {
      userId: user.id,
      type: "credit",
      amountPoints: input.points,
      referenceType: "admin_topup",
      referenceId: insertResult.insertId
    });

    return {
      id: insertResult.insertId,
      username: user.username,
      amount_minor: input.amountMinor,
      points: input.points,
      balance_points: walletResult.balance_points,
      transaction_reference: input.transactionReference,
      idempotent: false
    };
  });

  try {
    const topup = await executeManualTopup();
    res.json({ ok: true, topup });
  } catch (error) {
    if (error && error.manualTopupReferenceConflict) {
      const [users] = await pool.execute(
        "SELECT id FROM users WHERE username = ? LIMIT 1",
        [input.username]
      );
      if (!users.length) throw new HttpError(404, "user_not_found");

      const existing = await findTopupByTransactionReference(pool, input.transactionReference);
      if (matchesManualTopup(existing, users[0].id, input.amountMinor) && Number(existing.wallet_recorded) === 1) {
        res.json({ ok: true, topup: mapManualTopupResult(existing, true) });
        return;
      }
      if (matchesManualTopup(existing, users[0].id, input.amountMinor)) {
        throw new HttpError(409, "manual_topup_inconsistent");
      }
      throw new HttpError(409, "transaction_reference_already_used");
    }
    throw error;
  }
}));

adminRouter.post("/topup/:id/approve", asyncHandler(async (req, res) => {
  const transactionReference = parseTransactionReference(req.body?.transaction_reference);
  const reason = parseManualTopupReason(req.body?.reason);

  await transaction(async (connection) => {
    const [reqs] = await connection.execute(
      `SELECT id, user_id, status, points, trans_ref
       FROM topup_requests
       WHERE id = ?
       FOR UPDATE`,
      [req.params.id]
    );
    if (!reqs.length) throw new HttpError(404, "request_not_found");
    if (reqs[0].status !== "pending") throw new HttpError(400, "not_pending");
    if (reqs[0].trans_ref && reqs[0].trans_ref !== transactionReference) {
      throw new HttpError(409, "transaction_reference_mismatch");
    }

    try {
      await connection.execute(
        `UPDATE topup_requests
         SET status = 'approved',
             trans_ref = COALESCE(trans_ref, ?),
             approved_by_user_id = ?,
             admin_note = ?,
             approved_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [transactionReference, req.user.id, reason, req.params.id]
      );
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        throw new HttpError(409, "transaction_reference_already_used");
      }
      throw error;
    }

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
