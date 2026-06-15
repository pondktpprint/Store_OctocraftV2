const express = require("express");
const { pool } = require("../db");
const { asyncHandler } = require("../errors");
const { requireUser, requireAdmin } = require("../auth/session");
const { requireProductPayload, normalizeDuplicateSkuError } = require("./validation");

const productsRouter = express.Router();

productsRouter.get("/", asyncHandler(async (req, res) => {
  const [products] = await pool.execute(
    "SELECT id, sku, name, description, price_points, category, active FROM products WHERE active = 1 ORDER BY id DESC"
  );
  res.json({ ok: true, products });
}));

productsRouter.post("/", requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const product = requireProductPayload(req.body);
  try {
    const [result] = await pool.execute(
      `INSERT INTO products (sku, name, description, price_points, category, minecraft_command, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        product.sku,
        product.name,
        product.description,
        product.pricePoints,
        product.category,
        product.command,
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
    await pool.execute(
      `UPDATE products
       SET sku = ?, name = ?, description = ?, price_points = ?, category = ?, minecraft_command = ?, active = ?
       WHERE id = ?`,
      [
        product.sku,
        product.name,
        product.description,
        product.pricePoints,
        product.category,
        product.command,
        product.active,
        req.params.id
      ]
    );
    res.json({ ok: true });
  } catch (error) {
    normalizeDuplicateSkuError(error);
  }
}));

module.exports = { productsRouter };
