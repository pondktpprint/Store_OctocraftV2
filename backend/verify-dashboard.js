const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  bangkokBoundaries,
  buildAlerts,
  calculateSuccessRate,
  getMinecraftStatus,
  loadDashboard
} = require("./admin/dashboard");

async function run() {
  const boundaries = bangkokBoundaries(new Date("2026-08-01T03:30:00.000Z"));
  assert.strictEqual(boundaries.today.toISOString(), "2026-07-31T17:00:00.000Z");
  assert.strictEqual(boundaries.month.toISOString(), "2026-07-31T17:00:00.000Z");
  assert.strictEqual(boundaries.sevenDays.toISOString(), "2026-07-25T17:00:00.000Z");
  assert.strictEqual(calculateSuccessRate(9, 1), 90);
  assert.strictEqual(calculateSuccessRate(0, 0), 100);

  const executeResults = [
    [[{
      revenue_today_minor: 125000,
      revenue_month_minor: 987650,
      approved_today_count: 12,
      pending_count: 2,
      pending_minor: 15000,
      rejected_today_count: 1
    }]],
    [[{ today_count: 4, month_count: 35, month_points: 7200, total_count: 108 }]],
    [[{ succeeded_today: 8, failed_today: 2, failed_open: 1, queued: 3, processing: 1 }]],
    [[
      { name: "VIP Rank", sku: "vip", quantity: 9, points: 4500 },
      { name: "Octo Key", sku: "octo-key", quantity: 5, points: 750 }
    ]],
    [[
      { day: "2026-07-31", amount_minor: 50000 },
      { day: "2026-08-01", amount_minor: 125000 }
    ]]
  ];
  const calls = [];
  const pool = {
    execute(sql, params) {
      calls.push({ sql, params });
      return Promise.resolve(executeResults[calls.length - 1]);
    }
  };
  let pingCalls = 0;
  let healthCalls = 0;
  const dashboard = await loadDashboard({
    pool,
    now: new Date("2026-08-01T03:30:00.000Z"),
    settings: { SERVER_IP: "play.octocraft.online", SERVER_PORT: "19132", EASYSLIP_API_KEY: "test-key" },
    bridgeConnected: true,
    pingMinecraftServer: async () => {
      pingCalls += 1;
      return { version: { name: "Paper 1.20.6" }, players: { online: 23, max: 500 } };
    },
    checkEasySlipHealth: async (key, options) => {
      healthCalls += 1;
      assert.strictEqual(key, "test-key");
      assert.strictEqual(options.force, true);
      return { state: "healthy", configured: true, quota: { used: 210, max: 250, remaining: 40 } };
    },
    forceEasySlip: true
  });

  assert.strictEqual(calls.length, 5);
  assert(calls[0].sql.includes("FROM topup_requests"));
  assert(calls[3].sql.includes("FROM order_items"));
  assert.strictEqual(dashboard.topups.revenue.today, 1250);
  assert.strictEqual(dashboard.topups.revenue.month, 9876.5);
  assert.strictEqual(dashboard.topups.pending.amount, 150);
  assert.strictEqual(dashboard.orders.month, 35);
  assert.strictEqual(dashboard.orders.bestSellers[0].name, "VIP Rank");
  assert.strictEqual(dashboard.delivery.successRateToday, 80);
  assert.strictEqual(dashboard.minecraft.players.online, 23);
  assert.strictEqual(dashboard.revenueTrend[1].amount, 1250);
  assert.strictEqual(pingCalls, 1);
  assert.strictEqual(healthCalls, 1);
  assert(dashboard.alerts.some(alert => alert.id === "delivery_failed"));
  assert(dashboard.alerts.some(alert => alert.id === "topup_pending"));
  assert(dashboard.alerts.some(alert => alert.id === "easyslip_quota_low"));

  let bridgeOfflinePingCalls = 0;
  const bridgeOffline = await getMinecraftStatus({
    settings: {},
    bridgeConnected: false,
    pingMinecraftServer: async () => {
      bridgeOfflinePingCalls += 1;
      return { players: { online: 5, max: 100 } };
    }
  });
  assert.strictEqual(bridgeOffline.online, true);
  assert.strictEqual(bridgeOffline.bridgeConnected, false);
  assert.strictEqual(bridgeOffline.players.online, 5);
  assert.strictEqual(bridgeOfflinePingCalls, 1);

  const allClear = buildAlerts({
    topups: { pending: { count: 0, amount: 0 } },
    delivery: { failedOpen: 0 },
    minecraft: { online: true, bridgeConnected: true },
    easySlip: { state: "healthy", quota: { remaining: 90, max: 100 } }
  });
  assert.deepStrictEqual(allClear.map(alert => alert.id), ["all_clear"]);

  const root = path.join(__dirname, "..");
  const routes = fs.readFileSync(path.join(root, "backend/admin/routes.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "frontend/public/admin.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "frontend/public/js/admin.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "frontend/public/css/admin-theme.css"), "utf8");
  assert(routes.includes('adminRouter.get("/dashboard"'));
  assert(html.includes('id="dashboard-revenue-today"'));
  assert(html.includes('id="dashboard-easyslip-card"'));
  assert(js.includes("async loadDashboard(forceRefresh = false)"));
  assert(css.includes(".dashboard-metrics-grid"));

  console.log("Dashboard verification passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
