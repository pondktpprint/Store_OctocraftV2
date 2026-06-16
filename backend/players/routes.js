const express = require("express");
const { asyncHandler, HttpError } = require("../errors");
const { requireUser, requireAdmin } = require("../auth/session");
const { checkHealth, searchPlayers, getPlayerByUsername } = require("./service");

const playersRouter = express.Router();

// All routes here are admin-only
playersRouter.use(requireUser, requireAdmin);

playersRouter.get("/health", asyncHandler(async (req, res) => {
  const isHealthy = await checkHealth();
  if (!isHealthy) {
    throw new HttpError(503, "nlogin_db_unreachable");
  }
  res.json({ ok: true, status: "connected" });
}));

playersRouter.get("/", asyncHandler(async (req, res) => {
  const players = await require("./service").getAllPlayers();
  res.json({ ok: true, players });
}));

playersRouter.get("/search", asyncHandler(async (req, res) => {
  const query = req.query.q;
  if (!query) {
    const players = await require("./service").getAllPlayers();
    return res.json({ ok: true, players });
  }
  const players = await searchPlayers(query);
  res.json({ ok: true, players });
}));

playersRouter.get("/:username", asyncHandler(async (req, res) => {
  const player = await getPlayerByUsername(req.params.username);
  if (!player) {
    throw new HttpError(404, "player_not_found");
  }
  res.json({ ok: true, player });
}));

module.exports = { playersRouter };
