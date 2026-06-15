const { HttpError } = require("../errors");

async function ensureAccount(connection, userId) {
  await connection.execute(
    "INSERT IGNORE INTO wallet_accounts (user_id, balance_points) VALUES (?, 0)",
    [userId]
  );
}

async function getAccountForUpdate(connection, userId) {
  await ensureAccount(connection, userId);
  const [rows] = await connection.execute(
    "SELECT user_id, balance_points FROM wallet_accounts WHERE user_id = ? FOR UPDATE",
    [userId]
  );
  return rows[0];
}

async function recordTransaction(connection, input) {
  const account = await getAccountForUpdate(connection, input.userId);
  if (input.type !== "credit" && input.type !== "debit") {
    throw new HttpError(400, "invalid_wallet_transaction_type");
  }

  const amount = Number(input.amountPoints);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new HttpError(400, "invalid_wallet_amount");
  }

  const nextBalance = input.type === "credit"
    ? Number(account.balance_points) + amount
    : Number(account.balance_points) - amount;

  if (nextBalance < 0) throw new HttpError(409, "insufficient_wallet_balance");

  await connection.execute(
    "UPDATE wallet_accounts SET balance_points = ? WHERE user_id = ?",
    [nextBalance, input.userId]
  );
  const [result] = await connection.execute(
    `INSERT INTO wallet_transactions
     (user_id, type, amount_points, balance_after, reference_type, reference_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.type,
      amount,
      nextBalance,
      input.referenceType,
      input.referenceId || null
    ]
  );

  return { id: result.insertId, balance_points: nextBalance };
}

module.exports = { ensureAccount, recordTransaction };
