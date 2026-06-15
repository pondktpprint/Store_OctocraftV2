const TERMINAL_DELIVERY_STATES = new Set(["succeeded", "failed"]);

function isTerminalDeliveryState(status) {
  return TERMINAL_DELIVERY_STATES.has(status);
}

function shouldIgnoreDeliveryResult(status) {
  return isTerminalDeliveryState(status) || status !== "processing";
}

module.exports = { isTerminalDeliveryState, shouldIgnoreDeliveryResult };
