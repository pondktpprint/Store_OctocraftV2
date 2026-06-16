const { pool } = require('./backend/db');
async function run() {
  try {
    // Insert mock users
    await pool.query("INSERT IGNORE INTO users (id, username, password_hash) VALUES (1, 'user1', 'xxx'), (2, 'user2', 'xxx')");
    // Insert mock topups
    await pool.query("INSERT IGNORE INTO topup_requests (id, user_id, amount_minor, points, status) VALUES (1, 2, 100, 1, 'approved'), (2, 1, 9400, 94, 'approved')");
    
    const [topDonators] = await pool.execute(
      `SELECT u.username AS name, SUM(tr.amount_minor) AS total_minor
       FROM topup_requests tr
       JOIN users u ON u.id = tr.user_id
       WHERE tr.status = 'approved'
       GROUP BY tr.user_id, u.username
       ORDER BY total_minor DESC
       LIMIT 3`
    );
    console.log("Top donators:", topDonators);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
