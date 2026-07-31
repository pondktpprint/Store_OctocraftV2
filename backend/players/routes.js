const express = require("express");
const { asyncHandler, HttpError } = require("../errors");
const { requireUser, requireAdmin } = require("../auth/session");
const { checkHealth, searchPlayers, getPlayerByUsername } = require("./service");
const { pool } = require("../db");

const playersRouter = express.Router();

// All routes here are admin-only
playersRouter.use(requireUser, requireAdmin);

async function attachStoreWalletData(players) {
  if (!players.length) return players;

  const usernames = players.map(player => player.username);
  const placeholders = usernames.map(() => "?").join(",");
  const [accounts] = await pool.execute(
    `SELECT u.id AS store_user_id, u.username,
            COALESCE(wa.balance_points, 0) AS balance_points,
            COALESCE(SUM(CASE WHEN tr.status = 'approved' THEN tr.amount_minor ELSE 0 END), 0) AS total_topup_minor
     FROM users u
     LEFT JOIN wallet_accounts wa ON wa.user_id = u.id
     LEFT JOIN topup_requests tr ON tr.user_id = u.id
     WHERE u.username IN (${placeholders})
     GROUP BY u.id, u.username, wa.balance_points`,
    usernames
  );

  const byUsername = new Map(
    accounts.map(account => [String(account.username).toLowerCase(), account])
  );

  return players.map(player => {
    const account = byUsername.get(String(player.username).toLowerCase());
    return {
      ...player,
      store_user_id: account ? Number(account.store_user_id) : null,
      registered_on_web: Boolean(account),
      balance_points: account ? Number(account.balance_points) : 0,
      total_topup_minor: account ? Number(account.total_topup_minor) : 0
    };
  });
}

playersRouter.get("/health", asyncHandler(async (req, res) => {
  const isHealthy = await checkHealth();
  if (!isHealthy) {
    throw new HttpError(503, "nlogin_db_unreachable");
  }
  res.json({ ok: true, status: "connected" });
}));

playersRouter.get("/", asyncHandler(async (req, res) => {
  const players = await attachStoreWalletData(await require("./service").getAllPlayers());
  res.json({ ok: true, players });
}));

playersRouter.get("/search", asyncHandler(async (req, res) => {
  const query = req.query.q;
  if (!query) {
    const players = await attachStoreWalletData(await require("./service").getAllPlayers());
    return res.json({ ok: true, players });
  }
  const players = await attachStoreWalletData(await searchPlayers(query));
  res.json({ ok: true, players });
}));

playersRouter.get("/:username", asyncHandler(async (req, res) => {
  const player = await getPlayerByUsername(req.params.username);
  if (!player) {
    throw new HttpError(404, "player_not_found");
  }
  const [enrichedPlayer] = await attachStoreWalletData([player]);
  res.json({ ok: true, player: enrichedPlayer });
}));

module.exports = { playersRouter };
