const express = require("express");
const fs = require("fs");
const path = require("path");
const { pool, transaction } = require("../db");
const { HttpError, asyncHandler } = require("../errors");
const { requireUser } = require("../auth/session");
const { getSettings } = require("../settings/service");
const { recordTransaction } = require("../wallet/service");
const { parseBahtToMinor, calculatePoints } = require("../admin/manual-topup");
const { analyzeBankVerification } = require("./easyslip");

const topupRouter = express.Router();
const TERMINAL_INVALID_EASYSLIP_CODES = new Set([
  "INVALID_IMAGE",
  "INVALID_IMAGE_TYPE",
  "INVALID_IMAGE_FORMAT",
  "INVALID_BASE64",
  "INVALID_PAYLOAD",
  "INVALID_QR_CODE",
  "UNSUPPORTED_FILE_TYPE",
  "IMAGE_TOO_LARGE",
  "IMAGE_SIZE_TOO_LARGE",
  "SLIP_NOT_FOUND",
  "VALIDATION_ERROR"
]);

function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

async function findTopupByReference(executor, transRef) {
  const [rows] = await executor.execute(
    `SELECT tr.id, tr.user_id, tr.status, tr.source, tr.amount_minor, tr.points,
            tr.provider_reference, tr.trans_ref,
            EXISTS(
              SELECT 1
              FROM wallet_transactions wt
              WHERE wt.user_id = tr.user_id
                AND wt.type = 'credit'
                AND wt.amount_points = tr.points
                AND wt.reference_type = 'topup'
                AND wt.reference_id = tr.id
            ) AS wallet_recorded
     FROM topup_requests tr
     WHERE tr.trans_ref = ?
     LIMIT 1`,
    [transRef]
  );
  return rows[0] || null;
}

function matchesSlipTopup(existing, userId, amountMinor) {
  return existing
    && existing.source === "slip"
    && String(existing.user_id) === String(userId)
    && Number(existing.amount_minor) === amountMinor;
}

function getEasySlipError(responseBody) {
  const nestedError = responseBody && typeof responseBody.error === "object"
    ? responseBody.error
    : null;
  const code = String(
    nestedError?.code
    || responseBody?.code
    || ""
  ).trim().toUpperCase();
  const message = String(
    nestedError?.message
    || responseBody?.message
    || ""
  ).trim();
  return { code, message };
}

function shouldQueueEasySlipFailure(httpStatus, code) {
  if (TERMINAL_INVALID_EASYSLIP_CODES.has(code)) return false;

  // Unknown errors are kept for manual review. This deliberately includes
  // SLIP_PENDING, quota/auth/IP/branch errors, HTTP 429/5xx and provider faults.
  return true;
}

function providerFailureReason(httpStatus, code) {
  const safeCode = String(code || `http_${httpStatus || "unknown"}`)
    .replace(/[^A-Z0-9_-]/gi, "_")
    .slice(0, 80);
  return `easyslip_provider_error:${safeCode}`;
}

function parseTopupRequestId(value) {
  const requestId = String(value || "").trim();
  if (!/^[1-9]\d{0,19}$/.test(requestId)) {
    throw new HttpError(400, "invalid_topup_request_id");
  }
  return requestId;
}

async function resolveApprovedReplay(transRef, userId, amountMinor) {
  if (!transRef) return null;
  const existing = await findTopupByReference(pool, transRef);
  if (
    matchesSlipTopup(existing, userId, amountMinor)
    && existing.status === "approved"
    && Number(existing.wallet_recorded) === 1
  ) {
    return existing;
  }
  return null;
}

async function insertPendingTopup({
  userId,
  amountMinor,
  points,
  providerReference,
  transRef = null,
  reason = null
}) {
  try {
    const [result] = await pool.execute(
      `INSERT INTO topup_requests
       (user_id, status, source, amount_minor, points, provider_reference, trans_ref, admin_note)
       VALUES (?, 'pending', 'slip', ?, ?, ?, ?, ?)`,
      [userId, amountMinor, points, providerReference, transRef, reason]
    );
    return { id: result.insertId, status: "pending", idempotent: false };
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY" && transRef) {
      const existing = await findTopupByReference(pool, transRef);
      if (matchesSlipTopup(existing, userId, amountMinor)) {
        const walletRecorded = Number(existing.wallet_recorded) === 1;
        if (
          existing.status !== "pending"
          && !(existing.status === "approved" && walletRecorded)
        ) {
          throw new HttpError(409, "duplicate_slip");
        }
        return {
          id: existing.id,
          status: existing.status,
          idempotent: true,
          walletRecorded
        };
      }
      throw new HttpError(409, "duplicate_slip");
    }
    throw error;
  }
}

async function respondWithPendingTopup({
  res,
  userId,
  amountMinor,
  points,
  providerReference,
  transRef = null,
  reason,
  message,
  uploadedPath
}) {
  let pending;
  try {
    pending = await insertPendingTopup({
      userId,
      amountMinor,
      points,
      providerReference,
      transRef,
      reason
    });
  } catch (error) {
    if (error instanceof HttpError) removeFileIfExists(uploadedPath);
    throw error;
  }

  if (pending.idempotent) removeFileIfExists(uploadedPath);

  if (pending.status === "approved" && pending.walletRecorded) {
    res.json({
      ok: true,
      status: "approved",
      requestId: String(pending.id),
      idempotent: true,
      message: "สลิปนี้ได้รับพอยท์เรียบร้อยแล้ว"
    });
    return;
  }

  res.json({
    ok: true,
    status: "pending",
    requestId: String(pending.id),
    idempotent: pending.idempotent,
    message
  });
}

async function approveVerifiedTopup({
  userId,
  amountMinor,
  points,
  providerReference,
  transRef
}) {
  try {
    return await transaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO topup_requests
         (user_id, status, source, amount_minor, points, provider_reference, trans_ref, approved_at)
         VALUES (?, 'approved', 'slip', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, amountMinor, points, providerReference, transRef]
      );

      await recordTransaction(connection, {
        userId,
        type: "credit",
        amountPoints: points,
        referenceType: "topup",
        referenceId: result.insertId
      });

      return { id: result.insertId, idempotent: false };
    });
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") {
      const existing = await resolveApprovedReplay(transRef, userId, amountMinor);
      if (existing) {
        return { id: existing.id, idempotent: true };
      }
      throw new HttpError(409, "duplicate_slip");
    }
    throw error;
  }
}

// Helper to parse base64 image data
function parseBase64Image(dataString) {
  if (typeof dataString !== "string") {
    throw new HttpError(400, "invalid_image_format");
  }
  const matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new HttpError(400, "invalid_image_format");
  }
  return {
    type: matches[1],
    data: Buffer.from(matches[2], "base64")
  };
}

// 1. GET /api/topup/config (Public)
topupRouter.get("/config", asyncHandler(async (req, res) => {
  const settings = await getSettings();
  res.json({
    ok: true,
    promptpayTarget: settings.PROMPTPAY_TARGET || "",
    promptpayName: settings.PROMPTPAY_NAME || "",
    pointRate: parseFloat(settings.POINT_RATE || 1.0)
  });
}));

// 2. GET /api/topup/status/:requestId (Authenticated)
topupRouter.get("/status/:requestId", requireUser, asyncHandler(async (req, res) => {
  const requestId = parseTopupRequestId(req.params.requestId);
  res.set("Cache-Control", "no-store");
  const [rows] = await pool.execute(
    `SELECT id, status, amount_minor, points, created_at, updated_at, approved_at
     FROM topup_requests
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [requestId, req.user.id]
  );
  if (!rows.length) throw new HttpError(404, "request_not_found");

  const topup = rows[0];
  res.json({
    ok: true,
    topup: {
      id: String(topup.id),
      status: topup.status,
      amount: Number(topup.amount_minor) / 100,
      points: Number(topup.points),
      createdAt: topup.created_at,
      updatedAt: topup.updated_at,
      approvedAt: topup.approved_at
    }
  });
}));

// 3. POST /api/topup/verify-slip (Authenticated)
topupRouter.post("/verify-slip", requireUser, asyncHandler(async (req, res) => {
  const { amount, slipData } = req.body;
  
  if (!amount || !slipData) {
    throw new HttpError(400, "missing_required_fields");
  }

  const amountMinor = parseBahtToMinor(amount);
  const parsedAmount = amountMinor / 100;
  const settings = await getSettings();
  const parsedPoints = calculatePoints(amountMinor, settings.POINT_RATE || 1);

  // Parse and validate base64 image
  const image = parseBase64Image(slipData);
  const mimeMap = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp"
  };
  const ext = mimeMap[image.type];
  if (!ext) {
    throw new HttpError(400, "unsupported_image_type");
  }

  // EasySlip accepts decoded images up to 4 MB.
  if (image.data.length > 4 * 1024 * 1024) {
    throw new HttpError(400, "file_too_large");
  }

  // Write image file
  const filename = `slip_${req.user.id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const targetDir = path.join(__dirname, "../../frontend/public/images/slips");
  fs.mkdirSync(targetDir, { recursive: true });
  
  const targetPath = path.join(targetDir, filename);
  fs.writeFileSync(targetPath, image.data);

  // Reference path relative to web server public folder
  const relativePath = `images/slips/${filename}`;

  if (!settings.EASYSLIP_API_KEY) {
    // Manual verification fallback
    const pending = await insertPendingTopup({
      userId: req.user.id,
      amountMinor,
      points: parsedPoints,
      providerReference: relativePath,
      reason: "easyslip_disabled"
    });

    res.json({
      ok: true,
      status: "pending",
      requestId: String(pending.id),
      message: "บันทึกข้อมูลและแนบสลิปเรียบร้อยแล้ว กรุณารอทีมงานตรวจสอบความถูกต้อง"
    });
    return;
  }

  let easySlipRes;
  let easySlipData;
  try {
    easySlipRes = await fetch("https://api.easyslip.com/v2/verify/bank", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Authorization": `Bearer ${settings.EASYSLIP_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        base64: slipData,
        matchAmount: parsedAmount,
        matchAccount: true,
        checkDuplicate: true
      })
    });
    easySlipData = await easySlipRes.json();
  } catch (error) {
    console.error("[EasySlip] Provider request failed; queued for review:", {
      httpStatus: easySlipRes?.status,
      code: error.code,
      message: error.message
    });
    await respondWithPendingTopup({
      res,
      userId: req.user.id,
      amountMinor,
      points: parsedPoints,
      providerReference: relativePath,
      reason: "easyslip_provider_unavailable",
      message: "ระบบ EasySlip ขัดข้องชั่วคราว บันทึกสลิปไว้ให้ทีมงานตรวจสอบแล้ว",
      uploadedPath: targetPath
    });
    return;
  }

  const providerStatus = easySlipData?.status == null
    ? null
    : Number(easySlipData.status);
  const providerSucceeded = easySlipRes.ok
    && easySlipData
    && typeof easySlipData === "object"
    && easySlipData.success !== false
    && (providerStatus === null || providerStatus === 200)
    && (easySlipData.success === true || providerStatus === 200);

  if (!providerSucceeded) {
    const providerError = getEasySlipError(easySlipData);
    console.error("[EasySlip] Slip verification failed:", {
      httpStatus: easySlipRes.status,
      apiStatus: easySlipData?.status,
      code: providerError.code,
      message: providerError.message
    });

    if (shouldQueueEasySlipFailure(easySlipRes.status, providerError.code)) {
      await respondWithPendingTopup({
        res,
        userId: req.user.id,
        amountMinor,
        points: parsedPoints,
        providerReference: relativePath,
        reason: providerFailureReason(easySlipRes.status, providerError.code),
        message: providerError.code === "SLIP_PENDING"
          ? "ธนาคารยังประมวลผลสลิปไม่เสร็จ บันทึกรายการไว้ให้ทีมงานตรวจสอบแล้ว"
          : "ระบบ EasySlip ยังยืนยันสลิปไม่ได้ บันทึกรายการไว้ให้ทีมงานตรวจสอบแล้ว",
        uploadedPath: targetPath
      });
      return;
    }

    removeFileIfExists(targetPath);
    throw new HttpError(400, "slip_verification_failed");
  }

  const verification = analyzeBankVerification(easySlipData, amountMinor);

  if (verification.isDuplicate === true) {
    const existing = await resolveApprovedReplay(
      verification.transRef,
      req.user.id,
      amountMinor
    );
    if (existing) {
      removeFileIfExists(targetPath);
      res.json({
        ok: true,
        status: "approved",
        requestId: String(existing.id),
        idempotent: true,
        message: "สลิปนี้ได้รับพอยท์เรียบร้อยแล้ว"
      });
      return;
    }

    // EasySlip can mark a retry as duplicate after it verified successfully
    // but before this application committed the wallet transaction.
    await respondWithPendingTopup({
      res,
      userId: req.user.id,
      amountMinor,
      points: parsedPoints,
      providerReference: relativePath,
      transRef: verification.transRef,
      reason: "easyslip_duplicate_requires_review",
      message: "EasySlip เคยตรวจสลิปนี้แล้ว แต่ไม่พบการเติมพอยท์ที่สมบูรณ์ จึงบันทึกไว้ให้ทีมงานตรวจสอบ",
      uploadedPath: targetPath
    });
    return;
  }

  if (
    verification.isAmountMatched === false
    || (
      verification.verifiedAmountMinor !== null
      && !verification.amountMatchesExactly
    )
  ) {
    removeFileIfExists(targetPath);
    throw new HttpError(400, "slip_amount_mismatch");
  }

  if (!verification.canAutoApprove) {
    const pendingReason = verification.accountMatched
      ? "easyslip_incomplete_verification"
      : "easyslip_receiver_not_matched";
    await respondWithPendingTopup({
      res,
      userId: req.user.id,
      amountMinor,
      points: parsedPoints,
      providerReference: relativePath,
      transRef: verification.transRef,
      reason: pendingReason,
      message: verification.accountMatched
        ? "ข้อมูลยืนยันจาก EasySlip ไม่ครบถ้วน บันทึกรายการไว้ให้ทีมงานตรวจสอบแล้ว"
        : "EasySlip ยังจับคู่บัญชีผู้รับไม่ได้ บันทึกรายการไว้ให้ทีมงานตรวจสอบแล้ว",
      uploadedPath: targetPath
    });
    return;
  }

  let approved;
  try {
    approved = await approveVerifiedTopup({
      userId: req.user.id,
      amountMinor,
      points: parsedPoints,
      providerReference: relativePath,
      transRef: verification.transRef
    });
  } catch (error) {
    console.error("[Topup] Automatic approval failed; attempting recovery:", {
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      message: error.message
    });

    try {
      const existing = await resolveApprovedReplay(
        verification.transRef,
        req.user.id,
        amountMinor
      );
      if (existing) {
        removeFileIfExists(targetPath);
        res.json({
          ok: true,
          status: "approved",
          requestId: String(existing.id),
          idempotent: true,
          message: "สลิปนี้ได้รับพอยท์เรียบร้อยแล้ว"
        });
        return;
      }
    } catch (replayError) {
      console.error("[Topup] Could not confirm an approved replay:", {
        code: replayError.code,
        message: replayError.message
      });
    }

    try {
      await respondWithPendingTopup({
        res,
        userId: req.user.id,
        amountMinor,
        points: parsedPoints,
        providerReference: relativePath,
        transRef: verification.transRef,
        reason: "easyslip_auto_approval_failed",
        message: "ตรวจสลิปผ่านแล้ว แต่ระบบเติมพอยท์ยังไม่สมบูรณ์ จึงบันทึกไว้ให้ทีมงานตรวจสอบ",
        uploadedPath: targetPath
      });
      return;
    } catch (recoveryError) {
      if (recoveryError instanceof HttpError) throw recoveryError;
      console.error("[Topup] Could not queue failed automatic approval:", {
        code: recoveryError.code,
        errno: recoveryError.errno,
        sqlMessage: recoveryError.sqlMessage,
        message: recoveryError.message
      });
      // Keep the uploaded evidence on disk if the database is unavailable.
      throw new HttpError(500, "easyslip_error");
    }
  }

  if (approved.idempotent) removeFileIfExists(targetPath);
  res.json({
    ok: true,
    status: "approved",
    requestId: String(approved.id),
    idempotent: approved.idempotent,
    message: "ตรวจสอบสลิปสำเร็จ! เติมเงินและรับ Point เรียบร้อยแล้ว"
  });
}));

module.exports = { topupRouter };
