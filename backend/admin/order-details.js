const ORDER_LIMIT = 100;

function normalizeOrderItem(row) {
  const quantity = Number(row.quantity) || 0;
  const unitPricePoints = Number(row.unit_price_points) || 0;

  return {
    id: String(row.id),
    productId: String(row.product_id),
    name: row.product_name || `Product #${row.product_id}`,
    sku: row.product_sku || "unknown",
    quantity,
    unitPricePoints,
    totalPoints: quantity * unitPricePoints,
    delivery: {
      succeeded: Number(row.delivery_succeeded) || 0,
      pending: Number(row.delivery_pending) || 0,
      failed: Number(row.delivery_failed) || 0,
      updatedAt: row.delivery_updated_at || null
    }
  };
}

function attachOrderItems(orders, itemRows) {
  const itemsByOrder = new Map();

  for (const row of itemRows) {
    const orderId = String(row.order_id);
    if (!itemsByOrder.has(orderId)) itemsByOrder.set(orderId, []);
    itemsByOrder.get(orderId).push(normalizeOrderItem(row));
  }

  return orders.map(order => ({
    ...order,
    id: String(order.id),
    total_points: Number(order.total_points) || 0,
    items: itemsByOrder.get(String(order.id)) || []
  }));
}

async function loadAdminOrders(pool) {
  const [orders] = await pool.execute(
    `SELECT o.id, o.status, o.total_points, o.created_at, o.updated_at, u.username
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ORDER BY o.id DESC
     LIMIT ${ORDER_LIMIT}`
  );

  if (!orders.length) return [];

  const orderIds = orders.map(order => order.id);
  const placeholders = orderIds.map(() => "?").join(", ");
  const [items] = await pool.execute(
    `SELECT oi.id, oi.order_id, oi.product_id,
            COALESCE(oi.product_name_snapshot, p.name, CONCAT('Product #', oi.product_id)) AS product_name,
            COALESCE(oi.product_sku_snapshot, p.sku, 'unknown') AS product_sku,
            oi.quantity, oi.unit_price_points,
            COALESCE(SUM(dj.status = 'succeeded'), 0) AS delivery_succeeded,
            COALESCE(SUM(dj.status IN ('queued', 'processing')), 0) AS delivery_pending,
            COALESCE(SUM(dj.status = 'failed'), 0) AS delivery_failed,
            MAX(dj.updated_at) AS delivery_updated_at
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN delivery_jobs dj ON dj.order_item_id = oi.id
     WHERE oi.order_id IN (${placeholders})
     GROUP BY oi.id, oi.order_id, oi.product_id, oi.product_name_snapshot,
              oi.product_sku_snapshot, p.name, p.sku, oi.quantity, oi.unit_price_points
     ORDER BY oi.order_id DESC, oi.id ASC`,
    orderIds
  );

  return attachOrderItems(orders, items);
}

module.exports = { ORDER_LIMIT, attachOrderItems, loadAdminOrders, normalizeOrderItem };
