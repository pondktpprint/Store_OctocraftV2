const express = require("express");
const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

function saveProductImage(base64Image, sku) {
  if (!base64Image || !base64Image.startsWith('data:image/')) return null;
  const matches = base64Image.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `prod_${sku}_${Date.now()}.${ext}`;
  const savePath = path.join(__dirname, '../../frontend/public/images/products', filename);
  
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  fs.writeFileSync(savePath, buffer);
  
  return `/images/products/${filename}`;
}
const { asyncHandler } = require("../errors");
const { requireUser, requireAdmin } = require("../auth/session");
const { requireProductPayload, normalizeDuplicateSkuError } = require("./validation");

const productsRouter = express.Router();

productsRouter.get("/", asyncHandler(async (req, res) => {
  const [products] = await pool.execute(
    "SELECT id, sku, name, description, price_points, category, minecraft_command, image, active FROM products WHERE active = 1 ORDER BY id DESC"
  );
  res.json({ ok: true, products });
}));

productsRouter.post("/", requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const product = requireProductPayload(req.body);
  try {
    let imagePath = null;
    if (product.image && product.image.startsWith('data:image/')) {
      imagePath = saveProductImage(product.image, product.sku);
    } else if (product.image) {
      imagePath = product.image;
    }

    const [result] = await pool.execute(
      `INSERT INTO products (sku, name, description, price_points, category, minecraft_command, image, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.sku,
        product.name,
        product.description,
        product.pricePoints,
        product.category,
        product.command,
        imagePath,
        product.active
      ]
    );
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    normalizeDuplicateSkuError(error);
  }
}));

productsRouter.patch("/:id", requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const product = requireProductPayload(req.body);
  try {
    let imagePath = null;
    if (product.image && product.image.startsWith('data:image/')) {
      imagePath = saveProductImage(product.image, product.sku);
    } else if (product.image) {
      imagePath = product.image;
    }

    await pool.execute(
      `UPDATE products
       SET sku = ?, name = ?, description = ?, price_points = ?, category = ?, minecraft_command = ?, image = ?, active = ?
       WHERE id = ?`,
      [
        product.sku,
        product.name,
        product.description,
        product.pricePoints,
        product.category,
        product.command,
        imagePath,
        product.active,
        req.params.id
      ]
    );
    res.json({ ok: true });
  } catch (error) {
    normalizeDuplicateSkuError(error);
  }
}));

productsRouter.delete("/:id", requireUser, requireAdmin, asyncHandler(async (req, res) => {
  await pool.execute("DELETE FROM products WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
}));

module.exports = { productsRouter };
