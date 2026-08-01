const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { attachOrderItems, loadAdminOrders, normalizeOrderItem } = require("./admin/order-details");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

async function run() {
  const normalized = normalizeOrderItem({
    id: 11,
    product_id: 7,
    product_name: "VIP Rank",
    product_sku: "VIP_30D",
    quantity: 2,
    unit_price_points: 1490,
    delivery_succeeded: 1,
    delivery_pending: 0,
    delivery_failed: 1,
    delivery_updated_at: "2026-08-01T03:00:00.000Z"
  });
  assert.deepStrictEqual(normalized, {
    id: "11",
    productId: "7",
    name: "VIP Rank",
    sku: "VIP_30D",
    quantity: 2,
    unitPricePoints: 1490,
    totalPoints: 2980,
    delivery: {
      succeeded: 1,
      pending: 0,
      failed: 1,
      updatedAt: "2026-08-01T03:00:00.000Z"
    }
  });

  const attached = attachOrderItems(
    [
      { id: 2, username: "Steve", total_points: "2980" },
      { id: 1, username: "Alex", total_points: "500" }
    ],
    [
      { id: 11, order_id: 2, product_id: 7, product_name: "VIP Rank", product_sku: "VIP_30D", quantity: 2, unit_price_points: 1490 }
    ]
  );
  assert.strictEqual(attached[0].items.length, 1);
  assert.strictEqual(attached[0].items[0].totalPoints, 2980);
  assert.deepStrictEqual(attached[1].items, []);
  assert.strictEqual(attached[0].total_points, 2980);

  const calls = [];
  const mockPool = {
    async execute(sql, values) {
      calls.push({ sql, values });
      if (calls.length === 1) {
        return [[{ id: 9, username: "OctoPlayer", status: "delivered", total_points: 99 }]];
      }
      return [[{
        id: 21,
        order_id: 9,
        product_id: 3,
        product_name: "Octo Key",
        product_sku: "OCTO_KEY",
        quantity: 1,
        unit_price_points: 99,
        delivery_succeeded: 1,
        delivery_pending: 0,
        delivery_failed: 0
      }]];
    }
  };
  const loaded = await loadAdminOrders(mockPool);
  assert.strictEqual(calls.length, 2, "orders should load in two batched queries");
  assert(calls[1].sql.includes("product_name_snapshot"));
  assert(calls[1].sql.includes("LEFT JOIN delivery_jobs"));
  assert.deepStrictEqual(calls[1].values, [9]);
  assert.strictEqual(loaded[0].items[0].name, "Octo Key");

  let emptyCalls = 0;
  const empty = await loadAdminOrders({
    async execute() {
      emptyCalls += 1;
      return [[]];
    }
  });
  assert.deepStrictEqual(empty, []);
  assert.strictEqual(emptyCalls, 1, "empty order lists should not query order_items");

  const schema = read("backend/schema.sql");
  const settings = read("backend/settings/service.js");
  const orderRoutes = read("backend/orders/routes.js");
  const adminRoutes = read("backend/admin/routes.js");
  const adminHtml = read("frontend/public/admin.html");
  const adminJs = read("frontend/public/js/admin.js");
  const adminCss = read("frontend/public/css/admin-theme.css");

  assert(schema.includes("product_name_snapshot VARCHAR(160) NOT NULL"));
  assert(schema.includes("product_sku_snapshot VARCHAR(64) NOT NULL"));
  assert(settings.includes("migrateOrderItemSnapshots"));
  assert(settings.includes("UPDATE order_items oi"));
  assert(orderRoutes.includes("line.product.name"));
  assert(orderRoutes.includes("line.product.sku"));
  assert(adminRoutes.includes("loadAdminOrders(pool)"));
  assert(adminHtml.includes('id="order-detail-modal"'));
  assert(adminHtml.includes("20260801-order-details-1"));
  assert(adminJs.includes("openOrderDetails(orderId)"));
  assert(adminJs.includes("getOrderItemsSummary(order)"));
  assert(adminCss.includes(".order-detail-item"));
  assert(adminCss.includes(".order-status-badge"));

  console.log("Order details verification passed");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
