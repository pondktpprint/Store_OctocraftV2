const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const {
  normalizeSlipReference,
  analyzeBankVerification
} = require("./topup/easyslip");
const {
  buildLoginLimiterOptions,
  createLoginLimiter
} = require("./auth/rate-limit");

const validVerification = {
  success: true,
  data: {
    isAmountMatched: true,
    isDuplicate: false,
    matchedAccount: {
      bankNumber: "123-4-56789-0"
    },
    amountInSlip: 50,
    rawSlip: {
      transRef: "  V2-TRANS-REF-123456  ",
      amount: { amount: 50 }
    }
  }
};

const validAnalysis = analyzeBankVerification(validVerification, 5_000);
assert.strictEqual(validAnalysis.transRef, "V2-TRANS-REF-123456");
assert.strictEqual(validAnalysis.verifiedAmountMinor, 5_000);
assert.strictEqual(validAnalysis.isAmountMatched, true);
assert.strictEqual(validAnalysis.isDuplicate, false);
assert.strictEqual(validAnalysis.accountMatched, true);
assert.strictEqual(validAnalysis.canAutoApprove, true);

const amountFlagMismatch = analyzeBankVerification({
  ...validVerification,
  data: { ...validVerification.data, isAmountMatched: false }
}, 5_000);
assert.strictEqual(amountFlagMismatch.canAutoApprove, false);

const exactAmountMismatch = analyzeBankVerification({
  ...validVerification,
  data: { ...validVerification.data, amountInSlip: 49.99 }
}, 5_000);
assert.strictEqual(exactAmountMismatch.amountMatchesExactly, false);
assert.strictEqual(exactAmountMismatch.canAutoApprove, false);

const duplicateVerification = analyzeBankVerification({
  ...validVerification,
  data: { ...validVerification.data, isDuplicate: true }
}, 5_000);
assert.strictEqual(duplicateVerification.canAutoApprove, false);

const unmatchedReceiver = analyzeBankVerification({
  ...validVerification,
  data: { ...validVerification.data, matchedAccount: null }
}, 5_000);
assert.strictEqual(unmatchedReceiver.accountMatched, false);
assert.strictEqual(unmatchedReceiver.canAutoApprove, false);

for (const malformedAccount of [{}, [], { bankNumber: "   " }]) {
  const malformedReceiver = analyzeBankVerification({
    ...validVerification,
    data: { ...validVerification.data, matchedAccount: malformedAccount }
  }, 5_000);
  assert.strictEqual(malformedReceiver.accountMatched, false);
  assert.strictEqual(malformedReceiver.canAutoApprove, false);
}

const incompleteVerification = analyzeBankVerification({
  success: true,
  data: {
    amountInSlip: 50,
    rawSlip: { transRef: "V2-TRANS-REF-654321" }
  }
}, 5_000);
assert.strictEqual(incompleteVerification.canAutoApprove, false);

assert.strictEqual(normalizeSlipReference("   "), null);
assert.strictEqual(normalizeSlipReference(" REF-123456 "), "REF-123456");
assert.strictEqual(normalizeSlipReference("x".repeat(121)).length, 64);

const limiterOptions = buildLoginLimiterOptions({ windowMs: 60_000, max: 2 });
assert.strictEqual(limiterOptions.skipSuccessfulRequests, true);
assert.deepStrictEqual(limiterOptions.message, {
  ok: false,
  error: "too_many_attempts"
});

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function verifyLoginLimiterBehavior() {
  const app = express();
  app.use(express.json());
  app.post(
    "/login",
    createLoginLimiter({ windowMs: 60_000, max: 2 }),
    (req, res) => {
      if (req.body.success) {
        res.json({ ok: true });
        return;
      }
      res.status(401).json({ ok: false, error: "invalid_credentials" });
    }
  );

  const server = http.createServer(app);
  const port = await listen(server);
  const request = async success => {
    const response = await fetch(`http://127.0.0.1:${port}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success })
    });
    return {
      status: response.status,
      body: await response.json()
    };
  };

  try {
    assert.strictEqual((await request(true)).status, 200);
    assert.strictEqual((await request(true)).status, 200);
    assert.strictEqual((await request(true)).status, 200);
    assert.strictEqual((await request(false)).status, 401);
    assert.strictEqual((await request(false)).status, 401);
    const limited = await request(false);
    assert.strictEqual(limited.status, 429);
    assert.strictEqual(limited.body.error, "too_many_attempts");
  } finally {
    await close(server);
  }
}

function installModuleMock(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
    children: [],
    paths: []
  };
}

async function verifyEasySlipRouteBehavior() {
  const dbPath = require.resolve("./db");
  const sessionPath = require.resolve("./auth/session");
  const settingsPath = require.resolve("./settings/service");
  const walletPath = require.resolve("./wallet/service");
  const routesPath = require.resolve("./topup/routes");
  const mockedPaths = [dbPath, sessionPath, settingsPath, walletPath, routesPath];
  const originalCache = new Map(mockedPaths.map(modulePath => [
    modulePath,
    require.cache[modulePath]
  ]));

  let providerResponse = {
    ok: true,
    status: 200,
    payload: validVerification
  };
  let transactionCount = 0;
  let walletCreditCount = 0;
  let approvedInsertCount = 0;
  let pendingInsertCount = 0;
  let nextTopupId = 800;
  let failNextWalletCredit = false;
  const providerRequests = [];
  const topupsByReference = new Map();
  const topupsById = new Map();

  const duplicateEntryError = () => {
    const error = new Error("Duplicate entry");
    error.code = "ER_DUP_ENTRY";
    return error;
  };

  const pool = {
    async execute(sql, params = []) {
      if (sql.includes("WHERE id = ? AND user_id = ?")) {
        const existing = topupsById.get(String(params[0]));
        return [existing && String(existing.user_id) === String(params[1])
          ? [existing]
          : []];
      }
      if (sql.includes("FROM topup_requests tr")) {
        const existing = topupsByReference.get(params[0]);
        return [existing ? [existing] : []];
      }
      if (sql.includes("INSERT INTO topup_requests") && sql.includes("'pending'")) {
        const [
          userId,
          amountMinor,
          points,
          providerReference,
          transRef,
          adminNote
        ] = params;
        if (transRef && topupsByReference.has(transRef)) {
          throw duplicateEntryError();
        }
        pendingInsertCount += 1;
        const id = ++nextTopupId;
        const record = {
          id,
          user_id: userId,
          status: "pending",
          source: "slip",
          amount_minor: amountMinor,
          points,
          provider_reference: providerReference,
          trans_ref: transRef,
          admin_note: adminNote,
          wallet_recorded: 0
        };
        if (transRef) topupsByReference.set(transRef, record);
        topupsById.set(String(id), record);
        return [{ insertId: id }];
      }
      throw new Error(`Unexpected pool query in verification: ${sql}`);
    }
  };

  installModuleMock(dbPath, {
    pool,
    transaction: async callback => {
      transactionCount += 1;
      const staged = {
        topup: null,
        walletRecorded: false
      };
      const connection = {
        staged,
        async execute(sql, params = []) {
          if (sql.includes("INSERT INTO topup_requests") && sql.includes("'approved'")) {
            const [userId, amountMinor, points, providerReference, transRef] = params;
            staged.topup = {
              id: ++nextTopupId,
              user_id: userId,
              status: "approved",
              source: "slip",
              amount_minor: amountMinor,
              points,
              provider_reference: providerReference,
              trans_ref: transRef,
              wallet_recorded: 1
            };
            return [{ insertId: staged.topup.id }];
          }
          throw new Error(`Unexpected transaction query in verification: ${sql}`);
        }
      };

      const result = await callback(connection);
      if (staged.topup.trans_ref && topupsByReference.has(staged.topup.trans_ref)) {
        throw duplicateEntryError();
      }
      topupsByReference.set(staged.topup.trans_ref, staged.topup);
      topupsById.set(String(staged.topup.id), staged.topup);
      approvedInsertCount += 1;
      if (staged.walletRecorded) walletCreditCount += 1;
      return result;
    }
  });
  installModuleMock(sessionPath, {
    requireUser(req, res, next) {
      if (req.get("x-test-no-auth") === "1") {
        res.status(401).json({ ok: false, error: "auth_required" });
        return;
      }
      const testUserId = Number(req.get("x-test-user-id") || 42);
      req.user = { id: testUserId, username: "OctoPlayer", role: "user" };
      next();
    }
  });
  installModuleMock(settingsPath, {
    async getSettings() {
      return { EASYSLIP_API_KEY: "test-key", POINT_RATE: "1" };
    }
  });
  installModuleMock(walletPath, {
    async recordTransaction(executor, input) {
      assert.strictEqual(input.userId, 42);
      assert.strictEqual(input.amountPoints, 50);
      if (failNextWalletCredit) {
        failNextWalletCredit = false;
        throw new Error("simulated wallet transaction failure");
      }
      executor.staged.walletRecorded = true;
      return { balance_points: 50 };
    }
  });
  delete require.cache[routesPath];

  const originalFetch = global.fetch;
  const originalMkdir = fs.mkdirSync;
  const originalWrite = fs.writeFileSync;
  const originalExists = fs.existsSync;
  const originalUnlink = fs.unlinkSync;
  const uploadedFiles = new Set();
  global.fetch = async (url, options) => {
    if (String(url) === "https://api.easyslip.com/v2/verify/bank") {
      providerRequests.push(JSON.parse(options.body));
      if (providerResponse.throwError) throw providerResponse.throwError;
      return {
        ok: providerResponse.ok,
        status: providerResponse.status,
        async json() {
          if (providerResponse.jsonError) throw providerResponse.jsonError;
          return providerResponse.payload;
        }
      };
    }
    return originalFetch(url, options);
  };
  fs.mkdirSync = () => {};
  fs.writeFileSync = filePath => {
    uploadedFiles.add(filePath);
  };
  fs.existsSync = filePath => uploadedFiles.has(filePath);
  fs.unlinkSync = filePath => {
    uploadedFiles.delete(filePath);
  };

  const { HttpError } = require("./errors");
  const { topupRouter } = require("./topup/routes");
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/topup", topupRouter);
  app.use((error, req, res, next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ ok: false, error: error.code });
      return;
    }
    next(error);
  });

  const server = http.createServer(app);
  const port = await listen(server);
  const submit = async () => {
    const response = await originalFetch(
      `http://127.0.0.1:${port}/api/topup/verify-slip`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: "50.00",
          slipData: "data:image/png;base64,aGVsbG8="
        })
      }
    );
    return {
      status: response.status,
      body: await response.json()
    };
  };
  const getStatus = async (requestId, userId = 42, extraHeaders = {}) => {
    const response = await originalFetch(
      `http://127.0.0.1:${port}/api/topup/status/${encodeURIComponent(requestId)}`,
      {
        headers: { "x-test-user-id": String(userId), ...extraHeaders },
        cache: "no-store"
      }
    );
    return {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      body: await response.json()
    };
  };

  const verificationFor = (transRef, overrides = {}) => {
    const rawSlipOverrides = overrides.rawSlip || {};
    return {
      success: true,
      data: {
        ...validVerification.data,
        ...overrides,
        rawSlip: {
          ...validVerification.data.rawSlip,
          ...rawSlipOverrides,
          transRef
        }
      }
    };
  };
  const setProviderPayload = payload => {
    providerResponse = { ok: true, status: 200, payload };
  };

  try {
    setProviderPayload(verificationFor("AUTO-APPROVE-REF"));
    const approved = await submit();
    assert.strictEqual(approved.status, 200);
    assert.strictEqual(approved.body.status, "approved");
    assert.match(approved.body.requestId, /^\d+$/);
    assert.strictEqual(transactionCount, 1);
    assert.strictEqual(approvedInsertCount, 1);
    assert.strictEqual(walletCreditCount, 1);
    assert.deepStrictEqual(
      {
        matchAmount: providerRequests[0].matchAmount,
        matchAccount: providerRequests[0].matchAccount,
        checkDuplicate: providerRequests[0].checkDuplicate
      },
      {
        matchAmount: 50,
        matchAccount: true,
        checkDuplicate: true
      }
    );
    const approvedStatus = await getStatus(approved.body.requestId);
    assert.strictEqual(approvedStatus.status, 200);
    assert.strictEqual(approvedStatus.body.topup.status, "approved");
    assert.strictEqual(approvedStatus.body.topup.id, approved.body.requestId);
    assert.strictEqual(approvedStatus.body.topup.amount, 50);
    assert.strictEqual(approvedStatus.body.topup.points, 50);
    assert.strictEqual(approvedStatus.cacheControl, "no-store");

    const unauthenticatedStatus = await getStatus(
      approved.body.requestId,
      42,
      { "x-test-no-auth": "1" }
    );
    assert.strictEqual(unauthenticatedStatus.status, 401);
    assert.strictEqual(unauthenticatedStatus.body.error, "auth_required");

    const otherUserStatus = await getStatus(approved.body.requestId, 7);
    assert.strictEqual(otherUserStatus.status, 404);
    assert.strictEqual(otherUserStatus.body.error, "request_not_found");

    const invalidStatusId = await getStatus("not-a-number");
    assert.strictEqual(invalidStatusId.status, 400);
    assert.strictEqual(invalidStatusId.body.error, "invalid_topup_request_id");

    setProviderPayload(verificationFor("AUTO-APPROVE-REF", {
      isDuplicate: true
    }));
    const approvedReplay = await submit();
    assert.strictEqual(approvedReplay.status, 200);
    assert.strictEqual(approvedReplay.body.status, "approved");
    assert.strictEqual(approvedReplay.body.idempotent, true);
    assert.strictEqual(approvedInsertCount, 1);
    assert.strictEqual(walletCreditCount, 1);

    setProviderPayload(verificationFor("CONCURRENT-REF"));
    const concurrent = await Promise.all([submit(), submit()]);
    assert.deepStrictEqual(concurrent.map(result => result.status), [200, 200]);
    assert.deepStrictEqual(
      concurrent.map(result => result.body.status),
      ["approved", "approved"]
    );
    assert.strictEqual(approvedInsertCount, 2);
    assert.strictEqual(walletCreditCount, 2);

    setProviderPayload(verificationFor("AMOUNT-MISMATCH-REF", {
      isAmountMatched: false
    }));
    const amountMismatch = await submit();
    assert.strictEqual(amountMismatch.status, 400);
    assert.strictEqual(amountMismatch.body.error, "slip_amount_mismatch");
    assert.strictEqual(walletCreditCount, 2);

    setProviderPayload(verificationFor("UNTRACKED-DUPLICATE-REF", {
      isDuplicate: true
    }));
    const duplicate = await submit();
    assert.strictEqual(duplicate.status, 200);
    assert.strictEqual(duplicate.body.status, "pending");
    assert.match(duplicate.body.requestId, /^\d+$/);
    assert.strictEqual(pendingInsertCount, 1);
    assert.strictEqual(walletCreditCount, 2);
    const pendingStatus = await getStatus(duplicate.body.requestId);
    assert.strictEqual(pendingStatus.status, 200);
    assert.strictEqual(pendingStatus.body.topup.status, "pending");
    topupsById.get(duplicate.body.requestId).status = "rejected";
    const rejectedStatus = await getStatus(duplicate.body.requestId);
    assert.strictEqual(rejectedStatus.status, 200);
    assert.strictEqual(rejectedStatus.body.topup.status, "rejected");

    setProviderPayload({
      success: true,
      data: {
        matchedAccount: validVerification.data.matchedAccount,
        amountInSlip: 50,
        rawSlip: {
          transRef: "INCOMPLETE-V2-REF-123456",
          amount: { amount: 50 }
        }
      }
    });
    const pending = await submit();
    assert.strictEqual(pending.status, 200);
    assert.strictEqual(pending.body.status, "pending");
    assert.strictEqual(pendingInsertCount, 2);
    assert.strictEqual(walletCreditCount, 2);

    setProviderPayload(verificationFor("EMPTY-ACCOUNT-REF", {
      matchedAccount: {}
    }));
    const emptyAccount = await submit();
    assert.strictEqual(emptyAccount.status, 200);
    assert.strictEqual(emptyAccount.body.status, "pending");
    assert.strictEqual(pendingInsertCount, 3);
    assert.strictEqual(walletCreditCount, 2);

    providerResponse = {
      ok: false,
      status: 404,
      payload: {
        success: false,
        status: 404,
        error: { code: "SLIP_PENDING", message: "Bank is processing" }
      }
    };
    const providerPending = await submit();
    assert.strictEqual(providerPending.status, 200);
    assert.strictEqual(providerPending.body.status, "pending");
    assert.strictEqual(pendingInsertCount, 4);
    assert.strictEqual(walletCreditCount, 2);

    providerResponse = {
      throwError: Object.assign(new Error("simulated timeout"), {
        code: "ABORT_ERR"
      })
    };
    const timeoutFallback = await submit();
    assert.strictEqual(timeoutFallback.status, 200);
    assert.strictEqual(timeoutFallback.body.status, "pending");
    assert.strictEqual(pendingInsertCount, 5);
    assert.strictEqual(walletCreditCount, 2);

    providerResponse = {
      ok: false,
      status: 503,
      payload: {
        success: false,
        status: 503,
        error: { code: "API_SERVER_ERROR" }
      }
    };
    const outageFallback = await submit();
    assert.strictEqual(outageFallback.status, 200);
    assert.strictEqual(outageFallback.body.status, "pending");
    assert.strictEqual(pendingInsertCount, 6);
    assert.strictEqual(walletCreditCount, 2);

    providerResponse = {
      ok: false,
      status: 502,
      jsonError: new SyntaxError("invalid JSON")
    };
    const invalidJsonFallback = await submit();
    assert.strictEqual(invalidJsonFallback.status, 200);
    assert.strictEqual(invalidJsonFallback.body.status, "pending");
    assert.strictEqual(pendingInsertCount, 7);
    assert.strictEqual(walletCreditCount, 2);

    providerResponse = {
      ok: false,
      status: 400,
      payload: {
        success: false,
        status: 400,
        error: { code: "INVALID_IMAGE_FORMAT" }
      }
    };
    const invalidImage = await submit();
    assert.strictEqual(invalidImage.status, 400);
    assert.strictEqual(invalidImage.body.error, "slip_verification_failed");
    assert.strictEqual(pendingInsertCount, 7);
    assert.strictEqual(walletCreditCount, 2);

    failNextWalletCredit = true;
    setProviderPayload(verificationFor("FAILED-COMMIT-RECOVERY-REF"));
    const recoveredFailure = await submit();
    assert.strictEqual(recoveredFailure.status, 200);
    assert.strictEqual(recoveredFailure.body.status, "pending");
    assert.strictEqual(pendingInsertCount, 8);
    assert.strictEqual(walletCreditCount, 2);

    setProviderPayload(verificationFor("FAILED-COMMIT-RECOVERY-REF", {
      isDuplicate: true
    }));
    const recoveredRetry = await submit();
    assert.strictEqual(recoveredRetry.status, 200);
    assert.strictEqual(recoveredRetry.body.status, "pending");
    assert.strictEqual(recoveredRetry.body.idempotent, true);
    assert.strictEqual(pendingInsertCount, 8);
    assert.strictEqual(walletCreditCount, 2);

    assert.strictEqual(
      [...topupsByReference.values()]
        .filter(topup => topup.status === "approved")
        .length,
      2
    );
    assert.strictEqual(approvedInsertCount, walletCreditCount);
    assert(uploadedFiles.size >= pendingInsertCount + approvedInsertCount);
  } finally {
    await close(server);
    global.fetch = originalFetch;
    fs.mkdirSync = originalMkdir;
    fs.writeFileSync = originalWrite;
    fs.existsSync = originalExists;
    fs.unlinkSync = originalUnlink;
    for (const modulePath of mockedPaths) {
      const cached = originalCache.get(modulePath);
      if (cached) require.cache[modulePath] = cached;
      else delete require.cache[modulePath];
    }
  }
}

const topupRoutes = fs.readFileSync(path.join(__dirname, "topup", "routes.js"), "utf8");
const authRoutes = fs.readFileSync(path.join(__dirname, "auth", "routes.js"), "utf8");
const backendIndex = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
const appScript = fs.readFileSync(
  path.join(__dirname, "..", "frontend", "public", "js", "app.js"),
  "utf8"
);
const indexHtml = fs.readFileSync(
  path.join(__dirname, "..", "frontend", "public", "index.html"),
  "utf8"
);
const topupHtml = fs.readFileSync(
  path.join(__dirname, "..", "frontend", "public", "topup.html"),
  "utf8"
);
const redesignCss = fs.readFileSync(
  path.join(__dirname, "..", "frontend", "public", "css", "redesign.css"),
  "utf8"
);

assert(topupRoutes.includes("matchAmount: parsedAmount"));
assert(topupRoutes.includes("matchAccount: true"));
assert(topupRoutes.includes("checkDuplicate: true"));
assert(topupRoutes.includes("verification.isAmountMatched === false"));
assert(topupRoutes.includes("verification.isDuplicate === true"));
assert(topupRoutes.includes("verification.accountMatched"));
assert(topupRoutes.includes("easyslip_provider_unavailable"));
assert(topupRoutes.includes("easyslip_duplicate_requires_review"));
assert(topupRoutes.includes("approveVerifiedTopup"));
assert(topupRoutes.includes('topupRouter.get("/status/:requestId"'));
assert(topupRoutes.includes("WHERE id = ? AND user_id = ?"));
assert(topupRoutes.includes('res.set("Cache-Control", "no-store")'));
assert(topupRoutes.includes("requestId: String("));
assert(!topupRoutes.includes("easySlipData.data?.ref1"));
assert(authRoutes.includes("createLoginLimiter"));
assert(backendIndex.includes('app.use("/api/public", publicApiLimiter)'));
assert(backendIndex.includes('req.path.startsWith("/public/")'));
assert(appScript.includes("'too_many_attempts'"));
assert(indexHtml.includes("App.translateError(data.error)"));
assert(topupHtml.includes('id="live-topup-status"'));
assert(topupHtml.includes("res.status === 'approved'"));
assert(topupHtml.includes("res.status === 'pending'"));
assert(topupHtml.includes("/api/topup/status/"));
assert(topupHtml.includes("statusPollGeneration"));
assert(topupHtml.includes("newButton.hidden = state === 'pending' || loginRequired"));
assert(topupHtml.includes("topupSubmissionInFlight || activePendingRequestId"));
assert(topupHtml.includes("setStepOneControlsDisabled(flowLocked || qrFlowActive)"));
assert(topupHtml.includes("const submittedAmount = activeQrAmount > 0"));
assert(topupHtml.includes("stepOne.inert = showingStepTwo"));
assert(topupHtml.includes("Unable to persist pending top-up status"));
assert(redesignCss.includes("@media (prefers-reduced-motion: reduce)"));
assert(!topupHtml.includes("window.location.reload()"));

Promise.all([
  verifyLoginLimiterBehavior(),
  verifyEasySlipRouteBehavior()
])
  .then(() => {
    console.log("EasySlip and auth verification passed");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
