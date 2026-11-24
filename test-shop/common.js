// Shared config, catalogue and event log for the test shop and the admin page.

const PATTERNS = {
  urgency: "Fake urgency (countdown that restarts on every load)",
  scarcity: "Fake scarcity and fake social proof",
  preticked: "Pre-ticked add-ons in the cart",
  drip: "Drip pricing (fees appear only at checkout)",
  confirmshaming: "Confirmshaming in the signup popup",
  fakeref: "Fake reference price (made-up 'was' price)",
};

const PRODUCTS = [
  { id: "backpack", name: "Daypack 22L", price: 59.0, color: "#3f6e5a", icon: "🎒", blurb: "Water-resistant daypack with a padded laptop sleeve." },
  { id: "headphones", name: "Studio Headphones", price: 89.0, color: "#34495e", icon: "🎧", blurb: "Closed-back headphones with a detachable cable." },
  { id: "bottle", name: "Steel Bottle 750ml", price: 24.0, color: "#8a5a44", icon: "🧴", blurb: "Double-walled, keeps drinks cold for 24 hours." },
  { id: "lamp", name: "Desk Lamp", price: 42.0, color: "#a0812f", icon: "💡", blurb: "Dimmable LED lamp with a warm and a cool setting." },
  { id: "mug", name: "Ceramic Mug Set", price: 29.0, color: "#6b4f7a", icon: "☕", blurb: "Set of two stoneware mugs, dishwasher safe." },
  { id: "notebook", name: "Dot Grid Notebook", price: 14.0, color: "#4a6a8a", icon: "📓", blurb: "A5, 160 pages, lay-flat binding." },
];

const FEES = { service: 3.49, handling: 1.99 };
const ADDONS = {
  protection: { label: "Protection Plan (2 years)", perItem: 4.99 },
  express: { label: "Express shipping", flat: 6.9 },
};

// Shop language: "en" (default) or "de", set with ?v=de. The German version uses wording and
// markup typical of German shops, to test how well the detector's rules carry over.
let SHOP_LANG = "en";
const L = (en, de) => (SHOP_LANG === "de" ? de : en);

const STORE = {
  config: "shop.config",
  cart: "shop.cart",
  log: "shop.log",
};

function readConfig() {
  const url = new URL(location.href);
  const p = url.searchParams.get("p");
  const sid = url.searchParams.get("sid");
  const v = url.searchParams.get("v");
  // Without any settings (e.g. opening the shop by hand) every pattern is on, so a plain visit
  // shows the shop's purpose. Study links from the admin page always set ?p= explicitly.
  let cfg = JSON.parse(sessionStorage.getItem(STORE.config) || "null") || { patterns: Object.keys(PATTERNS), sid: null, lang: "en" };
  if (v !== null || p !== null) cfg.lang = v === "de" ? "de" : "en";
  if (p !== null) {
    if (p === "all") cfg.patterns = Object.keys(PATTERNS);
    else if (p === "none" || p === "") cfg.patterns = [];
    else cfg.patterns = p.split(",").map((s) => s.trim()).filter((s) => s in PATTERNS);
  }
  if (sid !== null) cfg.sid = sid || null;
  if (p !== null || sid !== null || v !== null) {
    sessionStorage.setItem(STORE.config, JSON.stringify(cfg));
    // A new config starts a fresh shopping session.
    sessionStorage.removeItem(STORE.cart);
    sessionStorage.removeItem("shop.popupSeen");
    sessionStorage.removeItem("shop.started");
    history.replaceState(null, "", url.pathname + url.hash);
  }
  SHOP_LANG = cfg.lang || "en";
  document.documentElement.lang = SHOP_LANG;
  return cfg;
}

function logEvent(type, data = {}) {
  const cfg = JSON.parse(sessionStorage.getItem(STORE.config) || "null") || { patterns: [], sid: null };
  const log = JSON.parse(localStorage.getItem(STORE.log) || "[]");
  log.push({ t: new Date().toISOString(), sid: cfg.sid, lang: cfg.lang || "en", patterns: cfg.patterns, type, ...data });
  localStorage.setItem(STORE.log, JSON.stringify(log));
}

function eur(n) {
  return SHOP_LANG === "de" ? n.toFixed(2).replace(".", ",") + "\u00a0€" : "€" + n.toFixed(2);
}
