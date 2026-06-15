const mysql = require("mysql2/promise");
const { env } = require("../config/env");

const nLoginPool = mysql.createPool({
  host: env.NLOGIN_DB_HOST,
  port: env.NLOGIN_DB_PORT,
  database: env.NLOGIN_DB_NAME,
  user: env.NLOGIN_DB_USER,
  password: env.NLOGIN_DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

module.exports = { nLoginPool };
