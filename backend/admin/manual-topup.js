const { HttpError } = require("../errors");

const MAX_MANUAL_TOPUP_BAHT = 1_000_000;
const MAX_MANUAL_TOPUP_POINTS = 10_000_000;

function parseBahtToMinor(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new HttpError(400, "invalid_amount");
  }

  const [wholePart, decimalPart = ""] = normalized.split(".");
  const whole = Number(wholePart);
  const satang = Number(decimalPart.padEnd(2, "0"));
  const amountMinor = (whole * 100) + satang;

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_MANUAL_TOPUP_BAHT * 100) {
    throw new HttpError(400, "invalid_amount");
  }
  return amountMinor;
}

function calculatePoints(amountMinor, pointRate) {
  const rate = Number(pointRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new HttpError(500, "invalid_point_rate");
  }

  const normalizedRate = String(pointRate).trim().toLowerCase();
  if (
    normalizedRate.length > 64
    || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/.test(normalizedRate)
  ) {
    throw new HttpError(500, "invalid_point_rate");
  }

  const [coefficient, exponentPart = "0"] = normalizedRate.split("e");
  const [wholePart, fractionPart = ""] = coefficient.split(".");
  const exponent = Number(exponentPart);
  const digits = `${wholePart}${fractionPart}`.replace(/^0+/, "") || "0";
  const decimalPlaces = fractionPart.length - exponent;

  let rateNumerator = BigInt(digits);
  let rateDenominator = 1n;
  if (decimalPlaces > 0) {
    rateDenominator = 10n ** BigInt(decimalPlaces);
  } else if (decimalPlaces < 0) {
    rateNumerator *= 10n ** BigInt(-decimalPlaces);
  }

  const divisor = 100n * rateDenominator;
  const scaledPoints = BigInt(amountMinor) * rateNumerator;
  const pointsBigInt = (scaledPoints + (divisor / 2n)) / divisor;

  if (pointsBigInt <= 0n || pointsBigInt > BigInt(MAX_MANUAL_TOPUP_POINTS)) {
    throw new HttpError(400, "invalid_points");
  }
  return Number(pointsBigInt);
}

function parseTransactionReference(value) {
  const transactionReference = String(value ?? "").trim();
  if (transactionReference.length < 6 || transactionReference.length > 120) {
    throw new HttpError(400, "invalid_transaction_reference");
  }
  return transactionReference;
}

function parseManualTopupReason(value) {
  const reason = String(value ?? "").trim();
  if (reason.length < 5 || reason.length > 500) {
    throw new HttpError(400, "invalid_manual_topup_reason");
  }
  return reason;
}

function parseManualTopupInput(input, pointRate) {
  const username = String(input?.username ?? "").trim();

  if (!username || username.length > 64) {
    throw new HttpError(400, "invalid_username");
  }

  const transactionReference = parseTransactionReference(input?.transaction_reference);
  const reason = parseManualTopupReason(input?.reason);
  const amountMinor = parseBahtToMinor(input?.amount_baht);
  const points = calculatePoints(amountMinor, pointRate);

  return {
    username,
    transactionReference,
    reason,
    amountMinor,
    points
  };
}

module.exports = {
  MAX_MANUAL_TOPUP_BAHT,
  MAX_MANUAL_TOPUP_POINTS,
  parseBahtToMinor,
  calculatePoints,
  parseTransactionReference,
  parseManualTopupReason,
  parseManualTopupInput
};
