const express = require("express");
const fs = require("fs");
const path = require("path");
const { pool, transaction } = require("../db");
const { HttpError, asyncHandler } = require("../errors");
const { requireUser } = require("../auth/session");
const { getSettings } = require("../settings/service");
const { recordTransaction } = require("../wallet/service");

const topupRouter = express.Router();

// Helper to parse base64 image data
function parseBase64Image(dataString) {
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
  const { amount, points, slipData } = req.body;
  
  if (!amount || !points || !slipData) {
    throw new HttpError(400, "missing_required_fields");
  }

  const parsedAmount = parseFloat(amount);
  const parsedPoints = parseInt(points, 10);

  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new HttpError(400, "invalid_amount");
  }
  if (isNaN(parsedPoints) || parsedPoints <= 0) {
    throw new HttpError(400, "invalid_points");
  }

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

  const amountMinor = Math.round(parsedAmount * 100); // Satang
  const settings = await getSettings();

  if (settings.EASYSLIP_API_KEY) {
    // EasySlip verification enabled
    try {
      const easySlipRes = await fetch("https://api.easyslip.com/v2/verify/bank", {
        method: "POST",
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
      
      if (easySlipData.success !== true && easySlipData.status !== 200) {
        fs.unlinkSync(targetPath); // Remove invalid image
        throw new HttpError(400, "slip_verification_failed", `การตรวจสอบสลิปล้มเหลว: ${easySlipData.message || 'สลิปไม่ถูกต้อง หรือถูกใช้งานไปแล้ว'}`);
      }
      
      const transRef = easySlipData.data?.transRef || easySlipData.data?.ref1 || easySlipData.data?.payload || null;

      // Automatically approve and credit points
      await transaction(async (connection) => {
        try {
          const [result] = await connection.execute(
            `INSERT INTO topup_requests (user_id, status, amount_minor, points, provider_reference, trans_ref)
             VALUES (?, 'approved', ?, ?, ?, ?)`,
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
             if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
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
      throw new HttpError(500, "easyslip_error", "เกิดข้อผิดพลาดในการเชื่อมต่อระบบตรวจสอบสลิป");
    }
  } else {
    // Manual verification fallback
    await pool.execute(
      `INSERT INTO topup_requests (user_id, status, amount_minor, points, provider_reference)
       VALUES (?, 'pending', ?, ?, ?)`,
      [req.user.id, amountMinor, parsedPoints, relativePath]
    );

    res.json({
      ok: true,
      message: "บันทึกข้อมูลและแนบสลิปเรียบร้อยแล้ว กรุณารอทีมงานตรวจสอบความถูกต้อง"
    });
  }
}));

module.exports = { topupRouter };
