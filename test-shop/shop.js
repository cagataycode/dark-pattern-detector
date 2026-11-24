// Test shop: catalogue, product page, cart, checkout, confirmation.
// Each dark pattern is gated by on("<id>"); with it off the honest version renders.

const cfg = readConfig();
const on = (id) => cfg.patterns.includes(id);
const view = document.getElementById("view");

if (!sessionStorage.getItem("shop.started")) {
  sessionStorage.setItem("shop.started", "1");
  logEvent("session_start");
}

// ---------- cart state ----------

function getCart() {
  return JSON.parse(sessionStorage.getItem(STORE.cart) || "null") || { items: [], addons: null, discount: false };
}
function saveCart(cart) {
  sessionStorage.setItem(STORE.cart, JSON.stringify(cart));
  updateCartLink();
}
function product(id) {
  return PRODUCTS.find((p) => p.id === id);
}
function itemCount(cart) {
  return cart.items.reduce((n, i) => n + i.qty, 0);
}
function updateCartLink() {
  document.getElementById("cart-link").textContent = `${L("Cart", "Warenkorb")} (${itemCount(getCart())})`;
}

// Add-on defaults are fixed the first time the cart is shown.
// [pattern: preticked] With it on, both add-ons start checked.
function ensureAddons(cart) {
  if (!cart.addons) {
    cart.addons = { protection: on("preticked"), express: on("preticked") };
    saveCart(cart);
  }
  return cart.addons;
}

function totals(cart) {
  const subtotal = cart.items.reduce((s, i) => s + product(i.id).price * i.qty, 0);
  const discount = cart.discount ? subtotal * 0.1 : 0;
  const addons = cart.addons || { protection: false, express: false };
  const protection = addons.protection ? ADDONS.protection.perItem * itemCount(cart) : 0;
  const express = addons.express ? ADDONS.express.flat : 0;
  const fees = cart.items.length ? FEES.service + FEES.handling : 0;
  const beforeFees = subtotal - discount + protection + express;
  return { subtotal, discount, protection, express, fees, beforeFees, total: beforeFees + fees };
}

// Fee lines, the same in cart and checkout. class="fee" marks them for the evaluation's ground truth.
// German labels as real shops write them: a "Pauschale" for the service charge, a "Gebühr" for payment.
function FEE_LINES() {
  return `
    <div class="line fee"><span>${L("Service fee", "Servicepauschale")}</span><span>${eur(FEES.service)}</span></div>
    <div class="line fee"><span>${L("Payment handling", "Zahlungsgebühr")}</span><span>${eur(FEES.handling)}</span></div>`;
}

// ---------- pattern helpers ----------

// [pattern: fakeref] A made-up "was" price, always ~57% off.
function priceHtml(p) {
  if (!on("fakeref")) return `<span class="price">${eur(p.price)}</span>`;
  const was = Math.round(p.price / 0.43) - 0.01;
  if (SHOP_LANG === "de") {
    return `<span class="price">${eur(p.price)}</span> <span class="muted">statt</span> <del class="was">${eur(was)}</del><span class="off">-57 %</span>`;
  }
  return `<span class="price">${eur(p.price)}</span><span class="was">${eur(was)}</span><span class="off">-57%</span>`;
}

// [pattern: scarcity] Random stock badges, new numbers on every load.
const lowStock = {};
if (on("scarcity")) {
  for (const p of PRODUCTS) if (Math.random() < 0.6) lowStock[p.id] = 1 + Math.floor(Math.random() * 3);
}
function stockBadge(p) {
  return lowStock[p.id] ? `<span class="badge">${L(`Only ${lowStock[p.id]} left!`, `Nur noch ${lowStock[p.id]} Stück auf Lager`)}</span>` : "";
}

// [pattern: urgency] Countdown from 09:59 that restarts on every page load.
function startUrgency() {
  if (!on("urgency")) return;
  const el = document.getElementById("urgency");
  el.hidden = false;
  let left = 9 * 60 + 59;
  const tick = () => {
    const m = String(Math.floor(left / 60)).padStart(2, "0");
    const s = String(left % 60).padStart(2, "0");
    el.innerHTML = L(
      `⚡ Flash sale: extra discounts end in <span class="clock">${m}:${s}</span>`,
      `⚡ Deal des Tages – nur noch <span class="clock">00 Std. ${m} Min. ${s} Sek.</span>`);
    left = Math.max(0, left - 1);
  };
  tick();
  setInterval(tick, 1000);
}

// [pattern: confirmshaming] Same popup either way; only the decline wording changes.
function setupPopup() {
  if (sessionStorage.getItem("shop.popupSeen")) return;
  const popup = document.getElementById("popup");
  const decline = document.getElementById("popup-decline");
  decline.textContent = on("confirmshaming")
    ? L("No thanks, I prefer paying full price", "Nein danke, ich verzichte auf meinen Rabatt")
    : L("No thanks", "Nein danke");
  document.getElementById("popup-title").textContent = L("Get 10% off your first order", "10 % Rabatt auf deine erste Bestellung");
  document.querySelector("#popup p").textContent = L(
    "Join our newsletter and the discount is applied to your cart right away.",
    "Melde dich zum Newsletter an, und der Rabatt wird sofort im Warenkorb abgezogen.");
  document.querySelector("#popup-form .btn").textContent = L("Subscribe", "Anmelden");
  const close = (answer) => {
    popup.hidden = true;
    sessionStorage.setItem("shop.popupSeen", "1");
    logEvent("popup_answer", { answer });
  };
  decline.addEventListener("click", () => close("declined"));
  document.getElementById("popup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    // The address is never stored or sent anywhere.
    e.target.reset();
    const cart = getCart();
    cart.discount = true;
    saveCart(cart);
    close("subscribed");
    if (location.hash.startsWith("#/cart")) renderCart();
  });
  setTimeout(() => {
    if (!sessionStorage.getItem("shop.popupSeen")) popup.hidden = false;
  }, 4000);
}

let viewerTimer = null;

// ---------- views ----------

function renderHome() {
  view.innerHTML = `
    <h1>${L("New arrivals", "Neuheiten")}</h1>
    <div class="grid">
      ${PRODUCTS.map((p) => `
        <a class="card" href="#/product/${p.id}">
          <div class="thumb" style="background:${p.color}22">${stockBadge(p)}${p.icon}</div>
          <div class="body">
            <div class="name">${p.name}</div>
            <div>${priceHtml(p)}</div>
          </div>
        </a>`).join("")}
    </div>`;
}

function renderProduct(id) {
  const p = product(id);
  if (!p) return renderHome();
  logEvent("view_product", { product: id });
  view.innerHTML = `
    <div class="product">
      <div class="thumb big" style="background:${p.color}22">${stockBadge(p)}${p.icon}</div>
      <div>
        <h1>${p.name}</h1>
        <div>${priceHtml(p)}</div>
        ${on("scarcity") ? `<p class="viewers" id="viewers"></p>` : ""}
        <p>${p.blurb}</p>
        <div class="qty">
          <button type="button" id="minus" aria-label="Decrease quantity">−</button>
          <span id="q">1</span>
          <button type="button" id="plus" aria-label="Increase quantity">+</button>
        </div>
        <div><button class="btn" id="add">${L("Add to cart", "In den Warenkorb")}</button></div>
        <p class="muted" id="added" hidden>${L("Added.", "Hinzugefügt.")} <a href="#/cart">${L("Go to cart", "Zum Warenkorb")}</a></p>
      </div>
    </div>`;
  let q = 1;
  const qEl = document.getElementById("q");
  document.getElementById("minus").onclick = () => { q = Math.max(1, q - 1); qEl.textContent = q; };
  document.getElementById("plus").onclick = () => { q = Math.min(9, q + 1); qEl.textContent = q; };
  document.getElementById("add").onclick = () => {
    const cart = getCart();
    const line = cart.items.find((i) => i.id === id);
    if (line) line.qty += q; else cart.items.push({ id, qty: q });
    saveCart(cart);
    logEvent("add_to_cart", { product: id, qty: q });
    document.getElementById("added").hidden = false;
  };
  // [pattern: scarcity] Fake live viewer count.
  if (on("scarcity")) {
    const el = document.getElementById("viewers");
    const update = () => { el.textContent = L(`👀 ${8 + Math.floor(Math.random() * 15)} people are viewing this right now`,
      `🔥 ${8 + Math.floor(Math.random() * 15)} Personen haben diesen Artikel in der letzten Stunde angesehen`); };
    update();
    viewerTimer = setInterval(update, 5000);
  }
}

function linesHtml(cart, editable) {
  return cart.items.map((i) => {
    const p = product(i.id);
    return `
      <div class="line">
        <div class="item">
          <div class="mini" style="background:${p.color}22">${p.icon}</div>
          <div>
            <div>${p.name}</div>
            <div class="muted">${eur(p.price)} × ${i.qty}</div>
          </div>
        </div>
        <div>
          ${editable ? `<button class="link-btn" data-remove="${i.id}">${L("Remove", "Entfernen")}</button>` : ""}
          <strong>${eur(p.price * i.qty)}</strong>
        </div>
      </div>`;
  }).join("");
}

function renderCart() {
  const cart = getCart();
  if (!cart.items.length) {
    view.innerHTML = `<h1>${L("Your cart", "Warenkorb")}</h1><div class="panel"><p>${L("Your cart is empty.", "Dein Warenkorb ist leer.")}</p><a class="btn" href="#/">${L("Keep shopping", "Weiter einkaufen")}</a></div>`;
    return;
  }
  const addons = ensureAddons(cart);
  const t = totals(cart);
  // [pattern: drip] With it on, the cart hides the fees and calls the sum "Total".
  const feeLines = on("drip") ? "" : FEE_LINES();
  const shownTotal = on("drip") ? t.beforeFees : t.total;
  view.innerHTML = `
    <h1>${L("Your cart", "Warenkorb")}</h1>
    <div class="two">
      <div class="panel">${linesHtml(cart, true)}</div>
      <div class="panel">
        <div class="addons">
          <label><input type="checkbox" id="protection" ${addons.protection ? "checked" : ""}>
            ${L("Protection Plan (2 years)", "Geräteschutz für 2 Jahre")} (+${eur(ADDONS.protection.perItem)} ${L("per item", "pro Artikel")})</label>
          <label><input type="checkbox" id="express" ${addons.express ? "checked" : ""}>
            ${L("Express shipping", "Expresslieferung")} (+${eur(ADDONS.express.flat)})</label>
        </div>
        <div class="line"><span>${L("Subtotal", "Zwischensumme")}</span><span>${eur(t.subtotal)}</span></div>
        ${t.discount ? `<div class="line"><span>${L("Newsletter discount (10%)", "Newsletter-Rabatt (10 %)")}</span><span>−${eur(t.discount)}</span></div>` : ""}
        ${t.protection ? `<div class="line"><span>${L("Protection Plan", "Geräteschutz")}</span><span>${eur(t.protection)}</span></div>` : ""}
        ${t.express ? `<div class="line"><span>${L("Express shipping", "Expresslieferung")}</span><span>${eur(t.express)}</span></div>` : ""}
        ${feeLines}
        <div class="line total"><span>${L("Total", "Summe")}</span><span>${eur(shownTotal)}</span></div>
        <div class="actions"><a class="btn" href="#/checkout">${L("Checkout", "Zur Kasse")}</a></div>
      </div>
    </div>`;
  for (const key of ["protection", "express"]) {
    document.getElementById(key).onchange = (e) => {
      const c = getCart();
      c.addons[key] = e.target.checked;
      saveCart(c);
      logEvent("addon_toggle", { addon: key, checked: e.target.checked });
      renderCart();
    };
  }
  view.querySelectorAll("[data-remove]").forEach((b) => {
    b.onclick = () => {
      const c = getCart();
      c.items = c.items.filter((i) => i.id !== b.dataset.remove);
      saveCart(c);
      logEvent("remove_from_cart", { product: b.dataset.remove });
      renderCart();
    };
  });
}

function renderCheckout() {
  const cart = getCart();
  if (!cart.items.length) return renderCart();
  ensureAddons(cart);
  const t = totals(cart);
  logEvent("checkout_view", { total: +t.total.toFixed(2) });
  view.innerHTML = `
    <h1>${L("Checkout", "Kasse")}</h1>
    <div class="two">
      <div class="panel">
        <h3>${L("Shipping", "Versand")}</h3>
        <p class="muted">${L("This is a study prototype, so no address or payment details are needed.", "Das ist ein Studien-Prototyp. Adresse und Zahlungsdaten werden nicht benötigt.")}</p>
        ${linesHtml(cart, false)}
      </div>
      <div class="panel">
        <div class="line"><span>${L("Subtotal", "Zwischensumme")}</span><span>${eur(t.subtotal)}</span></div>
        ${t.discount ? `<div class="line"><span>${L("Newsletter discount (10%)", "Newsletter-Rabatt (10 %)")}</span><span>−${eur(t.discount)}</span></div>` : ""}
        ${t.protection ? `<div class="line"><span>${L("Protection Plan", "Geräteschutz")}</span><span>${eur(t.protection)}</span></div>` : ""}
        ${t.express ? `<div class="line"><span>${L("Express shipping", "Expresslieferung")}</span><span>${eur(t.express)}</span></div>` : ""}
        ${FEE_LINES()}
        <div class="line total"><span>${L("Total", "Gesamtsumme")}</span><span>${eur(t.total)}</span></div>
        <div class="actions">
          <a class="btn secondary" href="#/cart">${L("Back to cart", "Zurück zum Warenkorb")}</a>
          <button class="btn" id="place">${L("Place order", "Zahlungspflichtig bestellen")}</button>
        </div>
      </div>
    </div>`;
  document.getElementById("place").onclick = () => {
    logEvent("order_placed", {
      items: cart.items,
      addons: cart.addons,
      discount: cart.discount,
      subtotal: +t.subtotal.toFixed(2),
      total: +t.total.toFixed(2),
    });
    sessionStorage.setItem("shop.lastTotal", t.total.toFixed(2));
    saveCart({ items: [], addons: null, discount: cart.discount });
    location.hash = "#/done";
  };
}

function renderDone() {
  const total = sessionStorage.getItem("shop.lastTotal");
  view.innerHTML = `
    <h1>${L("Thank you!", "Danke!")}</h1>
    <div class="panel">
      <p>${L("Your order", "Deine Bestellung")}${total ? ` ${L("of", "über")} <strong>${eur(+total)}</strong>` : ""} ${L("has been placed.", "ist eingegangen.")}</p>
      <p class="muted">${L("No real order was placed and nothing was charged.", "Es wurde nichts wirklich bestellt und nichts berechnet.")}</p>
      <a class="btn" href="#/">${L("Back to the shop", "Zurück zum Shop")}</a>
    </div>`;
}

// ---------- router ----------

function route() {
  clearInterval(viewerTimer);
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "product") renderProduct(parts[1]);
  else if (parts[0] === "cart") renderCart();
  else if (parts[0] === "checkout") renderCheckout();
  else if (parts[0] === "done") renderDone();
  else renderHome();
  updateCartLink();
  window.scrollTo(0, 0);
}

document.querySelector(".top nav a").textContent = "Shop";
document.querySelector(".foot").textContent = L(
  "Research prototype. No real products, payments or data collection.",
  "Forschungsprototyp. Keine echten Produkte, Zahlungen oder Datenerhebung.");
window.addEventListener("hashchange", route);
startUrgency();
setupPopup();
route();
