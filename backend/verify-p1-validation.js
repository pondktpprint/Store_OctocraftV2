const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { HttpError } = require("./errors");
const { requireProductPayload } = require("./products/validation");

function expectHttpError(fn, code) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof HttpError);
    assert.strictEqual(error.code, code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

expectHttpError(() => requireProductPayload({ sku: "rank", price_points: 1, minecraft_command: "cmd" }), "product_name_required");
expectHttpError(() => requireProductPayload({ sku: "rank", name: "Rank", price_points: 0, minecraft_command: "cmd" }), "product_price_invalid");
expectHttpError(() => requireProductPayload({ sku: "rank", name: "Rank", price_points: -1, minecraft_command: "cmd" }), "product_price_invalid");
expectHttpError(() => requireProductPayload({ sku: "rank", name: "Rank", price_points: 1 }), "product_command_required");

const product = requireProductPayload({
  sku: "rank",
  name: "Rank",
  price_points: 1,
  minecraft_command: "give {player} item"
});
assert.deepStrictEqual(
  {
    sku: product.sku,
    name: product.name,
    pricePoints: product.pricePoints,
    command: product.command
  },
  {
    sku: "rank",
    name: "Rank",
    pricePoints: 1,
    command: "give {player} item"
  }
);

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
const productsRoutes = fs.readFileSync(path.join(__dirname, "products", "routes.js"), "utf8");
const productValidation = fs.readFileSync(path.join(__dirname, "products", "validation.js"), "utf8");
const ordersRoutes = fs.readFileSync(path.join(__dirname, "orders", "routes.js"), "utf8");

assert(schema.includes("UNIQUE KEY products_sku_unique (sku)"));
assert(productValidation.includes("sku_already_exists"));
assert(ordersRoutes.includes("const MAX_ORDER_LINES = 50"));
assert(ordersRoutes.includes("const MAX_CHECKOUT_QUANTITY = 100"));
assert(ordersRoutes.includes("items.length > MAX_ORDER_LINES"));
assert(ordersRoutes.includes("quantity > MAX_CHECKOUT_QUANTITY"));
assert(ordersRoutes.includes("SELECT id, price_points, minecraft_command"));
assert(ordersRoutes.includes("total += Number(product.price_points) * quantity"));
assert(!ordersRoutes.includes("price_points:"));
assert(!ordersRoutes.includes("line.price"));

console.log("P1 validation verification passed");
