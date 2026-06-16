const { pool } = require('./backend/db');
async function test() {
  try {
    const [rows] = await pool.query("SELECT * FROM topup_requests");
    console.log("topup_requests:", rows);
    const [wt] = await pool.query("SELECT * FROM wallet_transactions WHERE type='credit'");
    console.log("wallet_transactions (credit):", wt);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
test();
