const express = require("express");
const http = require("http");
const { config } = require("./config");
const { HttpError } = require("./errors");
const { authRouter } = require("./auth/routes");
const { productsRouter } = require("./products/routes");
const { walletRouter } = require("./wallet/routes");
const { ordersRouter } = require("./orders/routes");
const { topupRouter } = require("./topup/routes");
const { adminRouter } = require("./admin/routes");
const { playersRouter } = require("./players/routes");
const { attachBridge } = require("./rcon/bridge");

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Nginx) for rate limiting
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const rateLimit = require("express-rate-limit");
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.apiMax,
  message: { ok: false, error: "too_many_requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", apiLimiter);

app.get("/health", (req, res) => res.json({ ok: true }));

const { pingMinecraftServer } = require("./rcon/ping");
const { getSettings } = require("./settings/service");
const { getConnectedClientCount } = require("./rcon/bridge");

app.get("/api/public/server-status", async (req, res) => {
  try {
    const settings = await getSettings();
    const host = settings.SERVER_IP || "127.0.0.1";
    const port = Number(settings.SERVER_PORT || 25565);
    
    const isBridgeConnected = getConnectedClientCount() > 0;
    if (!isBridgeConnected) {
      return res.json({
        ok: true,
        online: false,
        host,
        port,
        players: { online: 0, max: 0 }
      });
    }

    const status = await pingMinecraftServer(host, port);
    res.json({
      ok: true,
      online: true,
      host,
      port,
      version: status.version && status.version.name ? status.version.name : "",
      players: {
        online: status.players && Number(status.players.online || 0),
        max: status.players && Number(status.players.max || 0)
      }
    });
  } catch (error) {
    res.json({
      ok: true,
      online: false,
      host: "127.0.0.1",
      port: 25565,
      players: { online: 0, max: 0 },
      error: error.message
    });
  }
});

app.get("/api/public/donators", async (req, res) => {
  try {
    const settings = await require('../settings/service').getSettings();
    const pointRate = parseFloat(settings.POINT_RATE) || 1;

    const [topDonators] = await pool.execute(
      `SELECT u.username AS name, SUM(wt.amount) AS total_points
       FROM wallet_transactions wt
       JOIN users u ON u.id = wt.user_id
       WHERE wt.type = 'credit'
       GROUP BY wt.user_id, u.username
       ORDER BY total_points DESC
       LIMIT 3`
    );
    
    // Convert points to estimated Baht
    const topDonatorsMapped = topDonators.map(d => ({
      name: d.name,
      amount: (Number(d.total_points) / pointRate).toFixed(2)
    }));

    const [recentDonators] = await pool.execute(
      `SELECT u.username AS name, wt.amount AS points, wt.created_at
       FROM wallet_transactions wt
       JOIN users u ON u.id = wt.user_id
       WHERE wt.type = 'credit'
       ORDER BY wt.id DESC
       LIMIT 5`
    );

    const recentDonatorsMapped = recentDonators.map(d => ({
      name: d.name,
      amount: (Number(d.points) / pointRate).toFixed(2),
      created_at: d.created_at
    }));

    res.json({
      ok: true,
      topDonators: topDonatorsMapped,
      recentDonators: recentDonatorsMapped
    });
  } catch (error) {
    console.error("Failed to query donators:", error);
    res.json({
      ok: true,
      topDonators: [],
      recentDonators: []
    });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/products", productsRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/topup", topupRouter);
app.use("/api/admin/players", playersRouter);
app.use("/api/admin", adminRouter);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

app.use((error, req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ ok: false, error: error.code });
    return;
  }
  console.error(error);
  res.status(500).json({ ok: false, error: "internal_error", details: error.message || String(error) });
});

const { initSettings } = require("./settings/service");

const server = http.createServer(app);
attachBridge(server);

initSettings().then(() => {
  server.listen(config.port, config.host, () => {
    console.log(`OctoCraft backend listening on ${config.host}:${config.port}`);
  });
}).catch(err => {
  console.error("Failed to initialize system settings:", err);
  process.exit(1);
});
