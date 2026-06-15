const { env } = require("./config/env");

const config = {
  port: env.PORT,
  host: env.HOST,
  jwtSecret: env.JWT_SECRET,
  bridgeToken: env.BRIDGE_TOKEN,
  db: {
    host: env.STORE_DB_HOST,
    port: env.STORE_DB_PORT,
    database: env.STORE_DB_NAME,
    user: env.STORE_DB_USER,
    password: env.STORE_DB_PASSWORD,
    connectionLimit: env.STORE_DB_CONNECTION_LIMIT
  },
  rateLimit: {
    loginMax: env.RATE_LIMIT_LOGIN_MAX,
    loginWindowMs: env.RATE_LIMIT_LOGIN_WINDOW_MS,
    apiMax: env.RATE_LIMIT_API_MAX,
    apiWindowMs: env.RATE_LIMIT_API_WINDOW_MS
  }
};

module.exports = { config, env };
