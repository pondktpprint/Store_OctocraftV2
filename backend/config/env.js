require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[FATAL] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optional(name, defaultValue) {
  const value = process.env[name];
  return value !== undefined ? value : defaultValue;
}

const env = {
  PORT: Number(optional("PORT", 4987)),
  HOST: optional("HOST", "0.0.0.0"),

  JWT_SECRET: required("JWT_SECRET"),
  BRIDGE_TOKEN: required("BRIDGE_TOKEN"),

  STORE_DB_HOST: required("STORE_DB_HOST"),
  STORE_DB_PORT: Number(optional("STORE_DB_PORT", 3306)),
  STORE_DB_NAME: required("STORE_DB_NAME"),
  STORE_DB_USER: required("STORE_DB_USER"),
  STORE_DB_PASSWORD: required("STORE_DB_PASSWORD"),
  STORE_DB_CONNECTION_LIMIT: Number(optional("STORE_DB_CONNECTION_LIMIT", 10)),

  NLOGIN_DB_HOST: required("NLOGIN_DB_HOST"),
  NLOGIN_DB_PORT: Number(optional("NLOGIN_DB_PORT", 3306)),
  NLOGIN_DB_NAME: required("NLOGIN_DB_NAME"),
  NLOGIN_DB_USER: required("NLOGIN_DB_USER"),
  NLOGIN_DB_PASSWORD: required("NLOGIN_DB_PASSWORD"),

  NLOGIN_TABLE: optional("NLOGIN_TABLE", "nlogin"),
  NLOGIN_COL_ID: optional("NLOGIN_COL_ID", "ai"),
  NLOGIN_COL_USERNAME: optional("NLOGIN_COL_USERNAME", "username"),
  NLOGIN_COL_PASSWORD: optional("NLOGIN_COL_PASSWORD", "password"),
  NLOGIN_COL_EMAIL: optional("NLOGIN_COL_EMAIL", "email"),
  NLOGIN_COL_CREATED_AT: optional("NLOGIN_COL_CREATED_AT", "creation_date"),
  NLOGIN_COL_LAST_SEEN: optional("NLOGIN_COL_LAST_SEEN", "last_seen"),

  RATE_LIMIT_LOGIN_MAX: Number(optional("RATE_LIMIT_LOGIN_MAX", 5)),
  RATE_LIMIT_LOGIN_WINDOW_MS: Number(optional("RATE_LIMIT_LOGIN_WINDOW_MS", 15 * 60 * 1000)),
  RATE_LIMIT_API_MAX: Number(optional("RATE_LIMIT_API_MAX", 1000)),
  RATE_LIMIT_API_WINDOW_MS: Number(optional("RATE_LIMIT_API_WINDOW_MS", 15 * 60 * 1000))
};

module.exports = { env };
