const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { pool, transaction } = require("../db");
const { shouldIgnoreDeliveryResult } = require("./delivery-state");
const { getSettings } = require("../settings/service");

const clients = new Set();
const DELIVERY_LEASE_MS = Number(process.env.DELIVERY_LEASE_MS || 30000);

function attachBridge(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname !== "/bridge") return;
    
    let token = url.searchParams.get("token");
    if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.substring(7);
    }
    
    const settings = await getSettings();
    
    if (token !== settings.BRIDGE_TOKEN) {
      console.warn(`[Bridge] Unauthorized connection attempt from ${req.socket.remoteAddress}`);
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    
    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log(`[Bridge] WebSocket connection established successfully from ${req.socket.remoteAddress}`);
      wss.emit("connection", ws);
    });
  });

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("message", (raw) => handleBridgeMessage(ws, raw).catch((error) => {
      ws.send(JSON.stringify({ type: "error", error: error.message }));
    }));
    ws.on("close", () => clients.delete(ws));
    sendQueuedJobs(ws).catch((error) => {
      ws.send(JSON.stringify({ type: "error", error: error.message }));
    });
  });
}

async function handleBridgeMessage(ws, raw) {
  const message = JSON.parse(raw.toString("utf8"));
  if (message.type === "ready") {
    await sendQueuedJobs(ws);
    return;
  }
  if (message.type === "delivery_result") {
    await recordDeliveryResult(message);
    await sendQueuedJobs(ws);
  }
}

async function sendQueuedJobs(ws) {
  await requeueExpiredProcessingJobs();

  const [jobs] = await pool.execute(
    `SELECT id, command_payload
     FROM delivery_jobs
     WHERE status = 'queued'
     ORDER BY id ASC
     LIMIT 25`
  );

  for (const job of jobs) {
    const messageId = crypto.randomUUID();
    const leaseExpiresAt = new Date(Date.now() + DELIVERY_LEASE_MS);
    const [result] = await pool.execute(
      `UPDATE delivery_jobs
       SET status = 'processing',
           retry_count = retry_count + 1,
           last_attempt_at = CURRENT_TIMESTAMP,
           lease_expires_at = ?,
           bridge_message_id = ?,
           last_error = NULL
       WHERE id = ? AND status = 'queued'`,
      [leaseExpiresAt, messageId, job.id]
    );
    if (!result.affectedRows) continue;
    ws.send(JSON.stringify({
      type: "execute_command",
      message_id: messageId,
      job_id: job.id,
      command: job.command_payload
    }));
  }
}

async function requeueExpiredProcessingJobs() {
  await pool.execute(
    `UPDATE delivery_jobs
     SET status = 'queued',
         bridge_message_id = NULL,
         lease_expires_at = NULL,
         last_error = 'delivery_lease_expired'
     WHERE status = 'processing'
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at < CURRENT_TIMESTAMP`
  );
}

async function recordDeliveryResult(message) {
  const succeeded = message.success === true;
  await transaction(async (connection) => {
    const [jobs] = await connection.execute(
      "SELECT id, order_id, status FROM delivery_jobs WHERE bridge_message_id = ? FOR UPDATE",
      [String(message.message_id || "")]
    );
    if (!jobs.length) return;

    const job = jobs[0];
    if (shouldIgnoreDeliveryResult(job.status)) return;

    await connection.execute(
      `UPDATE delivery_jobs
       SET status = ?, last_error = ?, lease_expires_at = NULL
       WHERE id = ?`,
      [
        succeeded ? "succeeded" : "failed",
        succeeded ? null : String(message.error || "delivery_failed"),
        job.id
      ]
    );

    if (!succeeded) {
      await connection.execute(
        "UPDATE orders SET status = 'delivery_failed' WHERE id = ? AND status <> 'delivered'",
        [job.order_id]
      );
      return;
    }

    const [remaining] = await connection.execute(
      `SELECT COUNT(*) AS count
       FROM delivery_jobs
       WHERE order_id = ? AND status <> 'succeeded'`,
      [job.order_id]
    );
    if (Number(remaining[0].count) === 0) {
      await connection.execute(
        "UPDATE orders SET status = 'delivered' WHERE id = ? AND status = 'pending_delivery'",
        [job.order_id]
      );
    }
  });
}

function getConnectedClientCount() {
  return clients.size;
}

module.exports = { attachBridge, requeueExpiredProcessingJobs, recordDeliveryResult, getConnectedClientCount };
