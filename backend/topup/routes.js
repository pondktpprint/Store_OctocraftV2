const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pool, transaction } = require("../db");
const { HttpError, asyncHandler } = require("../errors");
const { requireUser } = require("../auth/session");
const { getSettings } = require("../settings/service");
const { recordTransaction } = require("../wallet/service");
const { parseBahtToMinor, calculatePoints } = require("../admin/manual-topup");

const topupRouter = express.Router();

function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function normalizeSlipReference(value) {
  if (!value) return null;
  const str = String(value);
  if (str.length <= 120) return str;
  return crypto.createHash("sha256").update(str).digest("hex");
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

// 2. POST /api/topup/verify-slip (Authenticated)
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

  // File size limit: 10MB
  if (image.data.length > 10 * 1024 * 1024) {
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

  if (settings.EASYSLIP_API_KEY) {
    // EasySlip verification enabled
    try {
      const easySlipRes = await fetch("https://api.easyslip.com/v2/verify/bank", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Authorization": `Bearer ${settings.EASYSLIP_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          base64: slipData,
          matchAmount: parsedAmount,
          checkDuplicate: true
        })
      });

      const easySlipData = await easySlipRes.json();
      
      const providerStatus = easySlipData.status == null
        ? null
        : Number(easySlipData.status);
      const providerSucceeded = easySlipRes.ok &&
        easySlipData.success !== false &&
        (providerStatus === null || providerStatus === 200) &&
        (easySlipData.success === true || providerStatus === 200);
      if (!providerSucceeded) {
        console.error("[EasySlip] Slip verification failed:", {
          httpStatus: easySlipRes.status,
          apiStatus: easySlipData.status,
          code: easySlipData.code,
          message: easySlipData.message
        });
        removeFileIfExists(targetPath); // Remove invalid image
        throw new HttpError(400, "slip_verification_failed", `การตรวจสอบสลิปล้มเหลว: ${easySlipData.message || 'สลิปไม่ถูกต้อง หรือถูกใช้งานไปแล้ว'}`);
      }
      
      const transRef = normalizeSlipReference(
        easySlipData.data?.transRef ||
        easySlipData.data?.ref1 ||
        easySlipData.data?.payload
      );

      if (!transRef) {
        await pool.execute(
          `INSERT INTO topup_requests
           (user_id, status, source, amount_minor, points, provider_reference)
           VALUES (?, 'pending', 'slip', ?, ?, ?)`,
          [req.user.id, amountMinor, parsedPoints, relativePath]
        );
        res.json({
          ok: true,
          status: "pending",
          message: "ระบบอ่านเลขอ้างอิงจากสลิปไม่ได้ บันทึกรายการไว้ให้ทีมงานตรวจสอบแล้ว"
        });
        return;
      }

      // Automatically approve and credit points
      await transaction(async (connection) => {
        try {
          const [result] = await connection.execute(
            `INSERT INTO topup_requests
             (user_id, status, source, amount_minor, points, provider_reference, trans_ref, approved_at)
             VALUES (?, 'approved', 'slip', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [req.user.id, amountMinor, parsedPoints, relativePath, transRef]
          );
          
          await recordTransaction(connection, {
            userId: req.user.id,
            type: "credit",
            amountPoints: parsedPoints,
            referenceType: "topup",
            referenceId: result.insertId
          });
        } catch (dbErr) {
          if (dbErr.code === 'ER_DUP_ENTRY') {
             removeFileIfExists(targetPath);
             throw new HttpError(400, "duplicate_slip", "ระบบป้องกันการโกง: สลิปนี้ถูกใช้งานเติมเงินไปแล้วในระบบของเรา");
          }
          throw dbErr;
        }
      });

      res.json({
        ok: true,
        message: "ตรวจสอบสลิปสำเร็จ! เติมเงินและรับ Point เรียบร้อยแล้ว"
      });

    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error("[Topup] EasySlip verification or top-up failed:", {
        code: err.code,
        errno: err.errno,
        sqlMessage: err.sqlMessage,
        message: err.message,
        stack: err.stack
      });
      removeFileIfExists(targetPath);
      throw new HttpError(500, "easyslip_error", "เกิดข้อผิดพลาดในการเชื่อมต่อระบบตรวจสอบสลิป");
    }
  } else {
    // Manual verification fallback
    await pool.execute(
      `INSERT INTO topup_requests
       (user_id, status, source, amount_minor, points, provider_reference)
       VALUES (?, 'pending', 'slip', ?, ?, ?)`,
      [req.user.id, amountMinor, parsedPoints, relativePath]
    );

    res.json({
      ok: true,
      message: "บันทึกข้อมูลและแนบสลิปเรียบร้อยแล้ว กรุณารอทีมงานตรวจสอบความถูกต้อง"
    });
  }
}));

module.exports = { topupRouter };
