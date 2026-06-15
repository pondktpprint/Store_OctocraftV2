const express = require("express");
const fs = require("fs");
const path = require("path");
const { pool } = require("../db");
const { HttpError, asyncHandler } = require("../errors");
const { requireUser } = require("../auth/session");
const { getSettings } = require("../settings/service");

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

  // Insert into DB
  const amountMinor = Math.round(parsedAmount * 100); // Satang
  
  await pool.execute(
    `INSERT INTO topup_requests (user_id, status, amount_minor, points, provider_reference)
     VALUES (?, 'pending', ?, ?, ?)`,
    [req.user.id, amountMinor, parsedPoints, relativePath]
  );

  res.json({
    ok: true,
    message: "บันทึกข้อมูลและแนบสลิปเรียบร้อยแล้ว กรุณารอทีมงานตรวจสอบความถูกต้อง"
  });
}));

module.exports = { topupRouter };
