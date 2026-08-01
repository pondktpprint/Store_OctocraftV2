const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokBoundaries(now = new Date()) {
  const local = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const utcFromBangkok = (y, m, d) => new Date(Date.UTC(y, m, d) - BANGKOK_OFFSET_MS);

  return {
    today: utcFromBangkok(year, month, day),
    month: utcFromBangkok(year, month, 1),
    sevenDays: utcFromBangkok(year, month, day - 6)
  };
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyFromMinor(value) {
  return number(value) / 100;
}

function calculateSuccessRate(succeeded, failed) {
  const total = number(succeeded) + number(failed);
  return total > 0 ? Math.round((number(succeeded) / total) * 1000) / 10 : 100;
}

function buildAlerts({ topups, delivery, minecraft, easySlip }) {
  const alerts = [];

  if (!minecraft.online) {
    alerts.push({
      id: "minecraft_offline",
      severity: "critical",
      title: "Minecraft Server Offline",
      message: "ไม่สามารถตรวจสอบสถานะเซิร์ฟเวอร์หรือผู้เล่นออนไลน์ได้"
    });
  } else if (!minecraft.bridgeConnected) {
    alerts.push({
      id: "minecraft_bridge_offline",
      severity: "critical",
      title: "Minecraft Bridge Offline",
      message: "เซิร์ฟเวอร์ออนไลน์ แต่ระบบส่งสินค้าอัตโนมัติยังไม่เชื่อมต่อ"
    });
  }
  if (delivery.failedOpen > 0) {
    alerts.push({
      id: "delivery_failed",
      severity: "critical",
      title: `${delivery.failedOpen} Delivery ต้องตรวจสอบ`,
      message: "มีรายการส่งสินค้าไม่สำเร็จ กรุณาตรวจสอบ Delivery Jobs"
    });
  }
  if (topups.pending.count > 0) {
    alerts.push({
      id: "topup_pending",
      severity: "warning",
      title: `${topups.pending.count} สลิปรอการตรวจสอบ`,
      message: `มูลค่ารวม ${topups.pending.amount.toLocaleString("th-TH")} บาท`
    });
  }

  const quotaRemaining = easySlip?.quota?.remaining;
  const quotaMax = easySlip?.quota?.max;
  const quotaRatio = Number.isFinite(Number(quotaRemaining)) && Number(quotaMax) > 0
    ? Number(quotaRemaining) / Number(quotaMax)
    : null;
  if (easySlip?.state !== "healthy") {
    alerts.push({
      id: "easyslip_unhealthy",
      severity: easySlip?.state === "degraded" ? "warning" : "critical",
      title: "EasySlip ต้องตรวจสอบ",
      message: easySlip?.configured === false
        ? "ยังไม่ได้ตั้งค่า EasySlip API Key"
        : "บริการตรวจสอบสลิปอัตโนมัติไม่อยู่ในสถานะพร้อมใช้งาน"
    });
  } else if (quotaRatio !== null && quotaRatio <= 0.2) {
    alerts.push({
      id: "easyslip_quota_low",
      severity: quotaRatio <= 0.05 ? "critical" : "warning",
      title: "EasySlip Quota ใกล้หมด",
      message: `เหลือ ${number(quotaRemaining).toLocaleString("th-TH")} จาก ${number(quotaMax).toLocaleString("th-TH")} ครั้ง`
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: "all_clear",
      severity: "success",
      title: "ระบบทำงานปกติ",
      message: "ยังไม่พบรายการที่ต้องดำเนินการเร่งด่วน"
    });
  }

  return alerts;
}

async function getMinecraftStatus({ settings, bridgeConnected, pingMinecraftServer }) {
  const host = settings.SERVER_IP || "127.0.0.1";
  const port = Number(settings.SERVER_PORT || 25565);
  try {
    const status = await pingMinecraftServer(host, port);
    return {
      online: true,
      bridgeConnected,
      host,
      port,
      version: status?.version?.name || "",
      players: {
        online: number(status?.players?.online),
        max: number(status?.players?.max)
      }
    };
  } catch (error) {
    return {
      online: false,
      bridgeConnected,
      host,
      port,
      version: "",
      players: { online: 0, max: 0 },
      error: String(error?.message || "minecraft_status_unavailable")
    };
  }
}

async function loadDashboard({
  pool,
  now = new Date(),
  settings,
  bridgeConnected,
  pingMinecraftServer,
  checkEasySlipHealth,
  forceEasySlip = false
}) {
  const boundaries = bangkokBoundaries(now);
  const approvedTime = "COALESCE(approved_at, created_at)";

  const [
    topupResult,
    orderResult,
    deliveryResult,
    sellerResult,
    trendResult,
    minecraft,
    easySlip
  ] = await Promise.all([
    pool.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'approved' AND ${approvedTime} >= ? THEN amount_minor ELSE 0 END), 0) AS revenue_today_minor,
         COALESCE(SUM(CASE WHEN status = 'approved' AND ${approvedTime} >= ? THEN amount_minor ELSE 0 END), 0) AS revenue_month_minor,
         SUM(status = 'approved' AND ${approvedTime} >= ?) AS approved_today_count,
         SUM(status = 'pending') AS pending_count,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_minor ELSE 0 END), 0) AS pending_minor,
         SUM(status = 'rejected' AND updated_at >= ?) AS rejected_today_count
       FROM topup_requests`,
      [boundaries.today, boundaries.month, boundaries.today, boundaries.today]
    ),
    pool.execute(
      `SELECT
         SUM(created_at >= ?) AS today_count,
         SUM(created_at >= ?) AS month_count,
         COALESCE(SUM(CASE WHEN created_at >= ? THEN total_points ELSE 0 END), 0) AS month_points,
         COUNT(*) AS total_count
       FROM orders`,
      [boundaries.today, boundaries.month, boundaries.month]
    ),
    pool.execute(
      `SELECT
         SUM(status = 'succeeded' AND updated_at >= ?) AS succeeded_today,
         SUM(status = 'failed' AND updated_at >= ?) AS failed_today,
         SUM(status = 'failed') AS failed_open,
         SUM(status = 'queued') AS queued,
         SUM(status = 'processing') AS processing
       FROM delivery_jobs`,
      [boundaries.today, boundaries.today]
    ),
    pool.execute(
      `SELECT
         COALESCE(oi.product_name_snapshot, p.name, CONCAT('Product #', oi.product_id)) AS name,
         COALESCE(oi.product_sku_snapshot, p.sku, 'unknown') AS sku,
         SUM(oi.quantity) AS quantity,
         SUM(oi.quantity * oi.unit_price_points) AS points
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.created_at >= ?
       GROUP BY oi.product_id, oi.product_name_snapshot, oi.product_sku_snapshot, p.name, p.sku
       ORDER BY quantity DESC, points DESC
       LIMIT 5`,
      [boundaries.month]
    ),
    pool.execute(
      `SELECT DATE_FORMAT(CONVERT_TZ(${approvedTime}, '+00:00', '+07:00'), '%Y-%m-%d') AS day,
              COALESCE(SUM(amount_minor), 0) AS amount_minor
       FROM topup_requests
       WHERE status = 'approved' AND ${approvedTime} >= ?
       GROUP BY day
       ORDER BY day ASC`,
      [boundaries.sevenDays]
    ),
    getMinecraftStatus({ settings, bridgeConnected, pingMinecraftServer }),
    checkEasySlipHealth(settings.EASYSLIP_API_KEY, { force: forceEasySlip })
  ]);

  const topupRow = topupResult[0][0] || {};
  const orderRow = orderResult[0][0] || {};
  const deliveryRow = deliveryResult[0][0] || {};
  const topups = {
    revenue: {
      today: moneyFromMinor(topupRow.revenue_today_minor),
      month: moneyFromMinor(topupRow.revenue_month_minor)
    },
    approved: { count: number(topupRow.approved_today_count) },
    pending: {
      count: number(topupRow.pending_count),
      amount: moneyFromMinor(topupRow.pending_minor)
    },
    rejected: { count: number(topupRow.rejected_today_count) }
  };
  const delivery = {
    succeededToday: number(deliveryRow.succeeded_today),
    failedToday: number(deliveryRow.failed_today),
    failedOpen: number(deliveryRow.failed_open),
    queued: number(deliveryRow.queued),
    processing: number(deliveryRow.processing),
    successRateToday: calculateSuccessRate(deliveryRow.succeeded_today, deliveryRow.failed_today)
  };

  const dashboard = {
    generatedAt: now.toISOString(),
    timezone: "Asia/Bangkok",
    topups,
    orders: {
      today: number(orderRow.today_count),
      month: number(orderRow.month_count),
      monthPoints: number(orderRow.month_points),
      total: number(orderRow.total_count),
      bestSellers: sellerResult[0].map(row => ({
        name: row.name,
        sku: row.sku,
        quantity: number(row.quantity),
        points: number(row.points)
      }))
    },
    delivery,
    minecraft,
    easySlip,
    revenueTrend: trendResult[0].map(row => ({
      day: row.day,
      amount: moneyFromMinor(row.amount_minor)
    }))
  };
  dashboard.alerts = buildAlerts(dashboard);
  return dashboard;
}

module.exports = {
  bangkokBoundaries,
  buildAlerts,
  calculateSuccessRate,
  getMinecraftStatus,
  loadDashboard
};
