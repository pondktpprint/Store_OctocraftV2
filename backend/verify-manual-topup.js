const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { HttpError } = require("./errors");
const {
  parseBahtToMinor,
  calculatePoints,
  parseManualTopupInput
} = require("./admin/manual-topup");

function expectHttpError(fn, code) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof HttpError);
    assert.strictEqual(error.code, code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

assert.strictEqual(parseBahtToMinor(300), 30_000);
assert.strictEqual(parseBahtToMinor("99.50"), 9_950);
assert.strictEqual(parseBahtToMinor("1.05"), 105);
assert.strictEqual(calculatePoints(30_000, 1), 300);
assert.strictEqual(calculatePoints(10_000, 1.5), 150);
assert.strictEqual(calculatePoints(9_950, 1), 100);
assert.strictEqual(calculatePoints(4_500, 0.7), 32);

assert.deepStrictEqual(
  parseManualTopupInput({
    username: "OctoPlayer",
    amount_baht: "300.00",
    transaction_reference: "BANK-REF-123456",
    reason: "EasySlip unavailable; verified against the bank slip."
  }, 1),
  {
    username: "OctoPlayer",
    transactionReference: "BANK-REF-123456",
    reason: "EasySlip unavailable; verified against the bank slip.",
    amountMinor: 30_000,
    points: 300
  }
);

expectHttpError(() => parseBahtToMinor("0"), "invalid_amount");
expectHttpError(() => parseBahtToMinor("-1"), "invalid_amount");
expectHttpError(() => parseBahtToMinor("1.001"), "invalid_amount");
expectHttpError(() => parseBahtToMinor("1e3"), "invalid_amount");
expectHttpError(() => parseBahtToMinor("1000000.01"), "invalid_amount");
expectHttpError(() => calculatePoints(100, 0), "invalid_point_rate");
expectHttpError(() => calculatePoints(1, 1), "invalid_points");
expectHttpError(() => parseManualTopupInput({
  username: "",
  amount_baht: "100",
  transaction_reference: "BANK-REF-1",
  reason: "Verified"
}, 1), "invalid_username");
expectHttpError(() => parseManualTopupInput({
  username: "OctoPlayer",
  amount_baht: "100",
  transaction_reference: "123",
  reason: "Verified"
}, 1), "invalid_transaction_reference");
expectHttpError(() => parseManualTopupInput({
  username: "OctoPlayer",
  amount_baht: "100",
  transaction_reference: "BANK-REF-1",
  reason: "no"
}, 1), "invalid_manual_topup_reason");

const adminRoutes = fs.readFileSync(path.join(__dirname, "admin", "routes.js"), "utf8");
const topupRoutes = fs.readFileSync(path.join(__dirname, "topup", "routes.js"), "utf8");
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
const adminScript = fs.readFileSync(path.join(__dirname, "..", "frontend", "public", "js", "admin.js"), "utf8");
const appScript = fs.readFileSync(path.join(__dirname, "..", "frontend", "public", "js", "app.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(__dirname, "..", "frontend", "public", "admin.html"), "utf8");
const manualRouteStart = adminRoutes.indexOf('adminRouter.post("/topup/manual"');
const manualRouteEnd = adminRoutes.indexOf('adminRouter.post("/topup/:id/approve"');
const manualRoute = adminRoutes.slice(manualRouteStart, manualRouteEnd);

assert(manualRouteStart >= 0);
assert(manualRouteEnd > manualRouteStart);
assert(manualRoute.includes("const executeManualTopup = async () => transaction"));
assert(manualRoute.includes("VALUES (?, 'approved', 'manual'"));
assert(manualRoute.includes('referenceType: "admin_topup"'));
assert(manualRoute.includes("transaction_reference_already_used"));
assert(manualRoute.includes("pending_topup_exists"));
assert(manualRoute.includes("wallet_recorded"));
assert(manualRoute.includes("approved_by_user_id"));
assert(manualRoute.indexOf("INSERT INTO topup_requests") < manualRoute.indexOf("await recordTransaction(connection"));

assert(schema.includes("source ENUM('slip', 'manual')"));
assert(schema.includes("approved_by_user_id BIGINT UNSIGNED NULL"));
assert(schema.includes("admin_note VARCHAR(500) NULL"));
assert(schema.includes("UNIQUE KEY topup_requests_trans_ref_idx (trans_ref)"));

assert(topupRoutes.includes("calculatePoints(amountMinor, settings.POINT_RATE || 1)"));
assert(!topupRoutes.includes("const { amount, points, slipData }"));
assert(topupRoutes.includes("easySlipRes.ok"));
assert(topupRoutes.includes("easySlipData.success !== false"));
assert(topupRoutes.includes("verification.canAutoApprove"));
assert(topupRoutes.includes("verification.isAmountMatched === false"));
assert(topupRoutes.includes("verification.isDuplicate === true"));
assert(topupRoutes.includes("verification.accountMatched"));

assert(adminScript.includes("openManualTopupModal"));
assert(adminScript.includes("lookupManualTopupPlayer"));
assert(adminScript.includes("updateManualTopupPreview"));
assert(adminScript.includes("saveManualTopup"));
assert(adminScript.includes("/api/admin/topup/manual"));
assert(adminScript.includes("transaction_reference: approval.value.transactionReference"));
assert(!adminScript.includes("codex-preview"));
assert(appScript.includes("'pending_topup_exists'"));
assert(appScript.includes("'manual_topup_inconsistent'"));
assert(adminHtml.includes('id="manual-topup-modal"'));
assert(adminHtml.includes('id="manual-topup-reference"'));
assert(adminHtml.includes('id="manual-topup-reason"'));

console.log("manual top-up verification passed");
