const { HttpError } = require("../errors");

function requireProductPayload(body) {
  const sku = String(body.sku || "").trim();
  const name = String(body.name || "").trim();
  const description = body.description || null;
  const pricePoints = Number(body.price_points);
  const command = String(body.minecraft_command || "").trim();
  const active = body.active === false ? 0 : 1;
  const category = String(body.category || "Rank").trim();
  const image = body.image || null;

  if (!sku) throw new HttpError(400, "sku_required");
  if (!name) throw new HttpError(400, "product_name_required");
  if (!Number.isInteger(pricePoints) || pricePoints <= 0) {
    throw new HttpError(400, "product_price_invalid");
  }
  if (!command) throw new HttpError(400, "product_command_required");

  return {
    sku,
    name,
    description,
    pricePoints,
    command,
    active,
    category,
    image
  };
}

function normalizeDuplicateSkuError(error) {
  if (error && error.code === "ER_DUP_ENTRY") {
    throw new HttpError(409, "sku_already_exists");
  }
  throw error;
}

module.exports = { requireProductPayload, normalizeDuplicateSkuError };
