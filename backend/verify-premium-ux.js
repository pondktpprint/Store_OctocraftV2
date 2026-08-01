const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const app = read("frontend/public/js/app.js");
const css = read("frontend/public/css/redesign.css");
const shop = read("frontend/public/shop.html");
const wallet = read("frontend/public/wallet.html");
const history = read("frontend/public/history.html");

assert(app.includes("ensureNavbarServerStatus()"));
assert(app.includes("updateNavbarServerStatus()"));
assert(app.includes("ensureMobileStickyCart()"));
assert(app.includes("animateCartAdd(sourceElement)"));
assert(app.includes("animatePointValue(element, from, to)"));
assert(app.includes("loadingSkeleton(type = 'list', count = 3)"));
assert(app.includes("emptyState({ icon = 'package-open'"));
assert(app.includes("octo-toast"));
assert(app.includes("fetch('/api/public/server-status'"));

assert(css.includes(".nav-live-status"));
assert(css.includes(".octo-skeleton-card"));
assert(css.includes(".octo-empty-state"));
assert(css.includes(".mobile-sticky-cart"));
assert(css.includes(".cart-fly-particle"));
assert(css.includes(".point-balance-up"));
assert(css.includes("@media (prefers-reduced-motion: reduce)"));

assert(shop.includes("octo-skeleton-card"));
assert(shop.includes("App.addToCart(item, qty, event.currentTarget)"));
assert(shop.includes("window.addDetailsToCart"));
assert(wallet.includes("wallet-balance-wrap"));
assert(wallet.includes("octo-skeleton-row"));
assert(history.includes("octo-skeleton-row"));

for (const page of ["index", "shop", "topup", "history", "wallet"]) {
  const html = read(`frontend/public/${page}.html`);
  assert(html.includes("20260801-premium-ux-1"), `${page}.html cache buster missing`);
}

console.log("Premium player UX verification passed");
