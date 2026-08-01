const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  checkEasySlipHealth,
  resetEasySlipHealthCache,
  maskEmail
} = require("./admin/easyslip-health");

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

function successfulInfo(overrides = {}) {
  return {
    success: true,
    data: {
      application: {
        name: "OctoCraft",
        autoRenew: {
          expired: false,
          quota: true,
          expiresAt: "2027-01-01T00:00:00+07:00"
        },
        quota: {
          used: 150,
          max: 1000,
          remaining: 850,
          totalUsed: 2150,
          ...overrides.quota
        }
      },
      branch: {
        name: "Production",
        isActive: true,
        quota: { used: 150, totalUsed: 2150 },
        ...overrides.branch
      },
      account: {
        email: "admin@example.com",
        credit: 500
      },
      product: { name: "Pro" }
    }
  };
}

async function verifyDisabledState() {
  resetEasySlipHealthCache();
  let fetchCount = 0;
  const health = await checkEasySlipHealth("", {
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("must_not_fetch");
    }
  });
  assert.strictEqual(fetchCount, 0);
  assert.strictEqual(health.state, "disabled");
  assert.strictEqual(health.configured, false);
}

async function verifyHealthyStateAndCache() {
  resetEasySlipHealthCache();
  const apiKey = "super-secret-api-key";
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), authorization: options.headers.Authorization });
    if (String(url).endsWith("/health")) {
      return response(200, { success: true, data: { status: "ok" } });
    }
    if (String(url).endsWith("/info")) {
      return response(200, successfulInfo());
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const first = await checkEasySlipHealth(apiKey, { fetchImpl });
  assert.strictEqual(first.state, "healthy");
  assert.strictEqual(first.configured, true);
  assert.strictEqual(first.credentials.valid, true);
  assert.strictEqual(first.service.reachable, true);
  assert.strictEqual(first.quota.remaining, 850);
  assert.strictEqual(first.quota.percentUsed, 15);
  assert.strictEqual(first.branch.name, "Production");
  assert.strictEqual(first.branch.isActive, true);
  assert.strictEqual(first.account.email, "ad***@example.com");
  assert.strictEqual(first.account.credit, 500);
  assert.strictEqual(first.product.name, "Pro");
  assert.strictEqual(first.cached, false);
  assert.strictEqual(requests.length, 2);
  assert(requests.every(item => item.authorization === `Bearer ${apiKey}`));
  assert(!JSON.stringify(first).includes(apiKey));

  const cached = await checkEasySlipHealth(apiKey, { fetchImpl });
  assert.strictEqual(cached.cached, true);
  assert.strictEqual(requests.length, 2);

  const refreshed = await checkEasySlipHealth(apiKey, { fetchImpl, force: true });
  assert.strictEqual(refreshed.cached, false);
  assert.strictEqual(requests.length, 4);
}

async function verifyProviderFailures() {
  resetEasySlipHealthCache();
  const invalidKey = await checkEasySlipHealth("invalid-key", {
    fetchImpl: async url => {
      if (String(url).endsWith("/health")) {
        return response(200, { success: true, data: { status: "ok" } });
      }
      return response(401, {
        success: false,
        error: { code: "INVALID_API_KEY", message: "Invalid key" }
      });
    }
  });
  assert.strictEqual(invalidKey.state, "blocked");
  assert.strictEqual(invalidKey.credentials.valid, false);
  assert.strictEqual(invalidKey.credentials.error.code, "INVALID_API_KEY");

  resetEasySlipHealthCache();
  const unavailable = await checkEasySlipHealth("network-key", {
    fetchImpl: async () => {
      throw new Error("network down");
    }
  });
  assert.strictEqual(unavailable.state, "unavailable");
  assert.strictEqual(unavailable.service.reachable, false);
  assert.strictEqual(unavailable.service.error.code, "NETWORK_ERROR");
}

async function verifyQuotaAndBranchStates() {
  resetEasySlipHealthCache();
  const exhausted = await checkEasySlipHealth("quota-key", {
    fetchImpl: async url => String(url).endsWith("/health")
      ? response(200, { success: true, data: { status: "ok" } })
      : response(200, successfulInfo({ quota: { used: 1000, max: 1000, remaining: 0 } }))
  });
  assert.strictEqual(exhausted.state, "degraded");
  assert.strictEqual(exhausted.quota.remaining, 0);
  assert.strictEqual(exhausted.quota.percentUsed, 100);

  resetEasySlipHealthCache();
  const inactive = await checkEasySlipHealth("branch-key", {
    fetchImpl: async url => String(url).endsWith("/health")
      ? response(200, { success: true, data: { status: "ok" } })
      : response(200, successfulInfo({ branch: { isActive: false } }))
  });
  assert.strictEqual(inactive.state, "blocked");
  assert.strictEqual(inactive.branch.isActive, false);
}

function verifyStaticIntegration() {
  const root = path.join(__dirname, "..");
  const routes = fs.readFileSync(path.join(root, "backend/admin/routes.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "frontend/public/admin.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "frontend/public/js/admin.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "frontend/public/css/redesign.css"), "utf8");

  assert(routes.includes('adminRouter.get("/easyslip-health"'));
  assert(routes.includes('res.set("Cache-Control", "private, no-store")'));
  assert(routes.indexOf("adminRouter.use(requireUser, requireAdmin)") < routes.indexOf('adminRouter.get("/easyslip-health"'));
  assert(html.includes('id="easyslip-health-card"'));
  assert(html.includes('onclick="Admin.loadEasySlipHealth(true)"'));
  assert(html.includes("20260801-easyslip-health-1"));
  assert(script.includes("async loadEasySlipHealth(forceRefresh = false)"));
  assert(script.includes("this.loadEasySlipHealth(false)"));
  assert(css.includes(".easyslip-health-card"));
  assert(css.includes("@media (max-width: 680px)"));
}

Promise.resolve()
  .then(verifyDisabledState)
  .then(verifyHealthyStateAndCache)
  .then(verifyProviderFailures)
  .then(verifyQuotaAndBranchStates)
  .then(() => {
    assert.strictEqual(maskEmail("admin@example.com"), "ad***@example.com");
    verifyStaticIntegration();
    console.log("EasySlip health verification passed");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
