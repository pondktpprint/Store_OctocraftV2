const crypto = require("crypto");

const EASYSLIP_BASE_URL = "https://api.easyslip.com/v2";
const DEFAULT_CACHE_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 6_000;

const cache = {
  keyHash: null,
  value: null,
  expiresAt: 0,
  promise: null
};

function maskEmail(value) {
  const email = String(value || "").trim();
  const separator = email.indexOf("@");
  if (separator <= 0) return email ? "***" : null;
  const name = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(3, name.length - visible.length))}@${domain}`;
}

function keyHash(apiKey) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function timeoutSignal() {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }
  return undefined;
}

function parseProviderError(body, fallbackCode) {
  const error = body && typeof body.error === "object" ? body.error : null;
  return {
    code: String(error?.code || fallbackCode || "UNKNOWN_ERROR"),
    message: String(error?.message || "EasySlip request failed")
  };
}

async function requestEasySlip(path, apiKey, fetchImpl) {
  const startedAt = Date.now();
  let response;
  try {
    response = await fetchImpl(`${EASYSLIP_BASE_URL}${path}`, {
      method: "GET",
      signal: timeoutSignal(),
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json"
      }
    });
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      data: null,
      error: {
        code: error?.name === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR",
        message: String(error?.message || "Unable to reach EasySlip")
      }
    };
  }

  let body;
  try {
    body = await response.json();
  } catch (_) {
    return {
      ok: false,
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      data: null,
      error: {
        code: "INVALID_RESPONSE",
        message: "EasySlip returned an invalid response"
      }
    };
  }

  const ok = response.ok && body?.success !== false;
  return {
    ok,
    httpStatus: response.status,
    latencyMs: Date.now() - startedAt,
    data: ok && body && typeof body.data === "object" ? body.data : null,
    error: ok ? null : parseProviderError(body, `HTTP_${response.status}`)
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveState(health, info) {
  const codes = [health.error?.code, info.error?.code].filter(Boolean);
  const blockedCodes = new Set([
    "MISSING_API_KEY",
    "INVALID_API_KEY",
    "IP_NOT_ALLOWED",
    "BRANCH_INACTIVE",
    "SERVICE_BANNED",
    "USER_BANNED"
  ]);
  if (codes.some(code => blockedCodes.has(code))) return "blocked";
  if (!health.ok && !info.ok) return "unavailable";
  if (!health.ok || !info.ok) return "degraded";

  const remaining = numberOrNull(info.data?.application?.quota?.remaining);
  if (remaining !== null && remaining <= 0) return "degraded";
  if (info.data?.branch?.isActive === false) return "blocked";
  return "healthy";
}

function mapSnapshot(health, info) {
  const application = info.data?.application || {};
  const quota = application.quota || {};
  const branch = info.data?.branch || {};
  const account = info.data?.account || {};
  const max = numberOrNull(quota.max);
  const used = numberOrNull(quota.used);
  const remaining = numberOrNull(quota.remaining);
  const percentUsed = max && used !== null
    ? Math.max(0, Math.min(100, Math.round((used / max) * 100)))
    : null;
  const invalidKey = [health.error?.code, info.error?.code]
    .some(code => code === "MISSING_API_KEY" || code === "INVALID_API_KEY");

  return {
    state: deriveState(health, info),
    configured: true,
    checkedAt: new Date().toISOString(),
    cached: false,
    service: {
      reachable: health.ok,
      httpStatus: health.httpStatus,
      latencyMs: health.latencyMs,
      error: health.error
    },
    credentials: {
      valid: info.ok ? true : (invalidKey ? false : null),
      error: info.error
    },
    application: {
      name: application.name || null,
      expiresAt: application.autoRenew?.expiresAt || null,
      autoRenewOnExpiry: application.autoRenew?.expired === true,
      autoRenewOnQuota: application.autoRenew?.quota === true
    },
    branch: {
      name: branch.name || null,
      isActive: typeof branch.isActive === "boolean" ? branch.isActive : null,
      used: numberOrNull(branch.quota?.used),
      totalUsed: numberOrNull(branch.quota?.totalUsed)
    },
    quota: {
      used,
      max,
      remaining,
      totalUsed: numberOrNull(quota.totalUsed),
      percentUsed
    },
    account: {
      email: maskEmail(account.email),
      credit: numberOrNull(account.credit)
    },
    product: {
      name: info.data?.product?.name || null
    }
  };
}

async function checkEasySlipHealth(apiKey, options = {}) {
  const normalizedKey = String(apiKey || "").trim();
  if (!normalizedKey) {
    return {
      state: "disabled",
      configured: false,
      checkedAt: new Date().toISOString(),
      cached: false,
      service: { reachable: false, httpStatus: null, latencyMs: null, error: null },
      credentials: { valid: false, error: null },
      application: {},
      branch: {},
      quota: {},
      account: {},
      product: {}
    };
  }

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");
  const force = options.force === true;
  const cacheTtlMs = Number.isFinite(options.cacheTtlMs)
    ? Math.max(0, options.cacheTtlMs)
    : DEFAULT_CACHE_TTL_MS;
  const now = Date.now();
  const hash = keyHash(normalizedKey);

  if (!force && cache.keyHash === hash && cache.value && cache.expiresAt > now) {
    return { ...cache.value, cached: true };
  }
  if (!force && cache.keyHash === hash && cache.promise) {
    const value = await cache.promise;
    return { ...value, cached: true };
  }

  const promise = Promise.all([
    requestEasySlip("/health", normalizedKey, fetchImpl),
    requestEasySlip("/info", normalizedKey, fetchImpl)
  ]).then(([health, info]) => mapSnapshot(health, info));

  cache.keyHash = hash;
  cache.promise = promise;
  try {
    const value = await promise;
    cache.value = value;
    cache.expiresAt = Date.now() + cacheTtlMs;
    return value;
  } finally {
    if (cache.promise === promise) cache.promise = null;
  }
}

function resetEasySlipHealthCache() {
  cache.keyHash = null;
  cache.value = null;
  cache.expiresAt = 0;
  cache.promise = null;
}

module.exports = {
  checkEasySlipHealth,
  resetEasySlipHealthCache,
  maskEmail
};
