const express = require("express");
const { HttpError, asyncHandler } = require("../errors");
const { requireUser } = require("../auth/session");

const topupRouter = express.Router();

topupRouter.post("/", requireUser, asyncHandler(async () => {
  throw new HttpError(501, "topup_gateway_not_configured");
}));

module.exports = { topupRouter };
