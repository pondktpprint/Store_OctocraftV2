const rateLimit = require("express-rate-limit");

function buildLoginLimiterOptions({ windowMs, max }) {
  return {
    windowMs,
    max,
    message: { ok: false, error: "too_many_attempts" },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
  };
}

function createLoginLimiter(options) {
  return rateLimit(buildLoginLimiterOptions(options));
}

module.exports = {
  buildLoginLimiterOptions,
  createLoginLimiter
};
