const express = require("express");
const { pool, transaction } = require("../db");
const { HttpError, asyncHandler } = require("../errors");
const { requireUser } = require("../auth/session");
const { recordTransaction } = require("../wallet/service");
const { triggerDelivery } = require("../rcon/bridge");

const ordersRouter = express.Router();
const MAX_ORDER_LINES = 50;
const MAX_CHECKOUT_QUANTITY = 100;

function expandCommand(command, user) {
  return command.replace(/\{player\}/g, user.username);
}

ordersRouter.get("/", requireUser, asyncHandler(async (req, res) => {
  const [orders] = await pool.execute(
    `SELECT id, status, total_points, created_at, updated_at
     FROM orders
     WHERE user_id = ?
     ORDER BY id DESC`,
    [req.user.id]
  );
  res.json({ ok: true, orders });
}));

ordersRouter.get("/:id", requireUser, asyncHandler(async (req, res) => {
  const [orders] = await pool.execute(
    `SELECT id, status, total_points, created_at, updated_at
     FROM orders
     WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.id]
  );
  if (!orders.length) throw new HttpError(404, "order_not_found");
  const [items] = await pool.execute(
    `SELECT oi.id, oi.product_id,
            COALESCE(oi.product_name_snapshot, p.name, CONCAT('Product #', oi.product_id)) AS name,
            COALESCE(oi.product_sku_snapshot, p.sku, 'unknown') AS sku,
            oi.quantity, oi.unit_price_points
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?`,
    [req.params.id]
  );
  res.json({ ok: true, order: orders[0], items });
}));

ordersRouter.post("/", requireUser, asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) throw new HttpError(400, "empty_order");
  if (items.length > MAX_ORDER_LINES) throw new HttpError(400, "too_many_order_lines");

  const order = await transaction(async (connection) => {
    let total = 0;
    const resolved = [];

    for (const line of items) {
      const productId = Number(line.product_id);
      const quantity = Number(line.quantity || 1);
      if (
        !Number.isInteger(productId) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_CHECKOUT_QUANTITY
      ) {
        throw new HttpError(400, "invalid_order_item");
      }

      const [products] = await connection.execute(
        `SELECT id, sku, name, price_points, minecraft_command
         FROM products
         WHERE id = ? AND active = 1
         FOR UPDATE`,
        [productId]
      );
      if (!products.length) throw new HttpError(404, "product_not_found");
      const product = products[0];
      total += Number(product.price_points) * quantity;
      resolved.push({ product, quantity });
    }

    const [orderResult] = await connection.execute(
      "INSERT INTO orders (user_id, status, total_points) VALUES (?, 'pending_delivery', ?)",
      [req.user.id, total]
    );
    const orderId = orderResult.insertId;

    await recordTransaction(connection, {
      userId: req.user.id,
      type: "debit",
      amountPoints: total,
      referenceType: "order",
      referenceId: orderId
    });

    for (const line of resolved) {
      const [itemResult] = await connection.execute(
        `INSERT INTO order_items
         (order_id, product_id, product_name_snapshot, product_sku_snapshot,
          quantity, unit_price_points, minecraft_command)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          line.product.id,
          line.product.name,
          line.product.sku,
          line.quantity,
          line.product.price_points,
          line.product.minecraft_command
        ]
      );

      for (let index = 0; index < line.quantity; index += 1) {
        await connection.execute(
          `INSERT INTO delivery_jobs (order_id, order_item_id, command_payload)
           VALUES (?, ?, ?)`,
          [
            orderId,
            itemResult.insertId,
            expandCommand(line.product.minecraft_command, req.user)
          ]
        );
      }
    }

    return { id: orderId, status: "pending_delivery", total_points: total };
  });

  // Trigger immediate command delivery through the WebSocket bridge
  triggerDelivery().catch((err) => {
    console.error("Failed to trigger delivery on checkout:", err);
  });

  res.status(201).json({ ok: true, order });
}));

module.exports = { ordersRouter };
