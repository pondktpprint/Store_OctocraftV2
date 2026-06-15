const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  isTerminalDeliveryState,
  shouldIgnoreDeliveryResult
} = require("./rcon/delivery-state");

const root = path.join(__dirname, "..");
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
const bridge = fs.readFileSync(path.join(__dirname, "rcon", "bridge.js"), "utf8");

assert.strictEqual(isTerminalDeliveryState("succeeded"), true);
assert.strictEqual(isTerminalDeliveryState("failed"), true);
assert.strictEqual(isTerminalDeliveryState("queued"), false);
assert.strictEqual(isTerminalDeliveryState("processing"), false);

assert.strictEqual(shouldIgnoreDeliveryResult("succeeded"), true);
assert.strictEqual(shouldIgnoreDeliveryResult("failed"), true);
assert.strictEqual(shouldIgnoreDeliveryResult("queued"), true);
assert.strictEqual(shouldIgnoreDeliveryResult("processing"), false);

assert(schema.includes("ENUM('queued', 'processing', 'succeeded', 'failed')"));
assert(schema.includes("retry_count INT UNSIGNED NOT NULL DEFAULT 0"));
assert(schema.includes("last_attempt_at TIMESTAMP NULL"));
assert(schema.includes("lease_expires_at TIMESTAMP NULL"));
assert(!schema.includes("'sent'"));

assert(bridge.includes("requeueExpiredProcessingJobs"));
assert(bridge.includes("WHERE status = 'processing'"));
assert(bridge.includes("lease_expires_at < CURRENT_TIMESTAMP"));
assert(bridge.includes("status = 'processing'"));
assert(bridge.includes("shouldIgnoreDeliveryResult(job.status)"));
assert(bridge.includes("status = 'pending_delivery'"));
assert(bridge.includes("status <> 'delivered'"));

console.log("delivery reliability verification passed");
