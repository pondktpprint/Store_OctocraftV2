const crypto = require("crypto");
const { parseBahtToMinor } = require("../admin/manual-topup");

function normalizeSlipReference(value) {
  const reference = String(value ?? "").trim();
  if (!reference) return null;
  if (reference.length <= 120) return reference;
  return crypto.createHash("sha256").update(reference).digest("hex");
}

function parseProviderAmountToMinor(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    return parseBahtToMinor(String(value));
  } catch (_) {
    return null;
  }
}

function analyzeBankVerification(responseBody, expectedAmountMinor) {
  const data = responseBody && typeof responseBody.data === "object"
    ? responseBody.data
    : null;
  const rawSlip = data && typeof data.rawSlip === "object"
    ? data.rawSlip
    : null;

  const transRef = normalizeSlipReference(
    rawSlip?.transRef
    || data?.transRef
  );
  const verifiedAmountMinor = parseProviderAmountToMinor(
    data?.amountInSlip
    ?? rawSlip?.amount?.amount
  );
  const matchedAccount = data?.matchedAccount;
  const accountMatched = Boolean(
    matchedAccount
    && typeof matchedAccount === "object"
    && !Array.isArray(matchedAccount)
    && String(matchedAccount.bankNumber || "").trim()
  );
  const amountMatchesExactly = verifiedAmountMinor === expectedAmountMinor;

  return {
    transRef,
    verifiedAmountMinor,
    matchedAccount,
    accountMatched,
    isAmountMatched: data?.isAmountMatched,
    isDuplicate: data?.isDuplicate,
    amountMatchesExactly,
    canAutoApprove: Boolean(
      transRef
      && data?.isAmountMatched === true
      && data?.isDuplicate === false
      && accountMatched
      && amountMatchesExactly
    )
  };
}

module.exports = {
  normalizeSlipReference,
  parseProviderAmountToMinor,
  analyzeBankVerification
};
