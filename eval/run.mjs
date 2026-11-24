// Precision/recall of the detector against the test shop, whose patterns are known.
//
// For each pattern configuration (all off, all on, each pattern alone), it walks the
// shop like a shopper: home with the signup popup, home again after a reload, a product
// page, the cart, the checkout, and the checkout after a reload. At every step it
// compares what the detector flagged with the shop's ground truth, element by element.
//
// Every configuration runs in both shop languages: English (wording the rules were written
// against) and German (wording and markup typical of German shops).
//
// Usage: node eval/run.mjs [repeats]       (default 3; scarcity is random per load)
// Needs puppeteer-core and a local Chrome (PUPPETEER_CORE, CHROME as in fieldcheck/).

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || "puppeteer-core");
const REPEATS = +(process.argv[2] || 3);
const PATTERNS = ["urgency", "scarcity", "preticked", "drip", "confirmshaming", "fakeref"];
const LANGS = ["en", "de"];

// ---------- static server for the test shop ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, "test-shop", path);
  if (!file.startsWith(join(root, "test-shop")) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const bundle = ["patterns.js", "detect.js", "ui.js", "content.js"]
  .map((f) => readFileSync(join(root, "extension", f), "utf8"))
  .join("\n;\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- ground truth and matching, run inside the page ----------
function judge(cfg) {
  const on = (p) => cfg.includes(p);
  const vis = (el) => el && el.getClientRects().length > 0;
  const truth = [];
  const add = (pattern, el) => { if (vis(el)) truth.push({ pattern, el }); };
  const route = location.hash;

  if (on("urgency")) add("urgency", document.getElementById("urgency"));
  if (on("scarcity")) {
    document.querySelectorAll(".badge").forEach((e) => add("scarcity", e));
    add("scarcity", document.getElementById("viewers"));
  }
  if (on("preticked") && route.startsWith("#/cart")) {
    for (const id of ["protection", "express"]) {
      const box = document.getElementById(id);
      if (box) add("preticked", box.closest("label") || box);
    }
  }
  if (on("drip") && route.startsWith("#/checkout")) {
    document.querySelectorAll(".line.fee").forEach((l) => add("drip", l));
  }
  if (on("confirmshaming")) add("confirmshaming", document.getElementById("popup-decline"));
  if (on("fakeref")) document.querySelectorAll(".was").forEach((w) => add("fakeref", w.parentElement));

  const related = (a, b) => a === b || a.contains(b) || b.contains(a);
  const used = new Set();
  const tp = [], fp = [];
  for (const d of window.__dpd.findings()) {
    const i = truth.findIndex((t, k) => !used.has(k) && t.pattern === d.pattern && related(t.el, d.el));
    if (i >= 0) { used.add(i); tp.push({ pattern: d.pattern, confidence: d.confidence }); }
    else fp.push({ pattern: d.pattern, text: d.el.textContent.trim().slice(0, 60), evidence: d.evidence.slice(0, 90) });
  }
  const fn = truth.filter((_, k) => !used.has(k)).map((t) => ({ pattern: t.pattern, text: t.el.textContent.trim().slice(0, 60) }));
  return { tp, fp, fn };
}

// ---------- one shopping session ----------
async function session(browser, cfg, lang, run) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const steps = [];
  // 1.3 s: a countdown only counts once it has been seen ticking down at least once.
  const inject = async () => { await page.evaluate(bundle); await sleep(1300); };
  const step = async (name) => {
    await page.evaluate(() => window.__dpd.scan());
    steps.push({ step: name, ...(await page.evaluate(judge, cfg)) });
  };
  const go = async (hash) => { await page.evaluate((h) => (location.hash = h), hash); await sleep(500); };

  const p = cfg.length ? cfg.join(",") : "none";
  await page.goto(`${BASE}index.html?p=${p}&v=${lang}&sid=eval-${run}`, { waitUntil: "load" });
  await inject();
  await sleep(4300); // the signup popup opens after 4 s
  await step("home + popup");
  await page.evaluate(() => document.getElementById("popup-decline").click());

  await page.reload({ waitUntil: "load" });
  await inject();
  await step("home, reloaded");

  await go("#/product/headphones");
  await step("product");
  await page.evaluate(() => document.getElementById("add").click());
  await go("#/cart");
  await step("cart");
  await go("#/checkout");
  await step("checkout");

  await page.reload({ waitUntil: "load" });
  await inject();
  await step("checkout, reloaded");

  await ctx.close();
  return steps;
}

// ---------- run ----------
const configs = [
  { name: "all off", cfg: [] },
  { name: "all on", cfg: PATTERNS },
  ...PATTERNS.map((p) => ({ name: `${p} only`, cfg: [p] })),
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});

const runs = [];
for (const lang of LANGS) {
  for (const c of configs) {
    for (let r = 0; r < REPEATS; r++) {
      const steps = await session(browser, c.cfg, lang, `${lang}-${c.name}-${r}`.replace(/\s+/g, "_"));
      runs.push({ lang, config: c.name, repeat: r, steps });
      const n = (k) => steps.reduce((s, x) => s + x[k].length, 0);
      console.log(`${lang} ${c.name.padEnd(20)} #${r}  tp ${n("tp")}  fp ${n("fp")}  fn ${n("fn")}`);
    }
  }
}
await browser.close();
server.close();

// ---------- summary ----------
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "–");
const uniq = (list) => [...new Map(list.map((x) => [JSON.stringify([x.config, x.step, x.pattern, x.text]), x])).values()];
const summary = {};
for (const lang of LANGS) {
  const per = Object.fromEntries(PATTERNS.map((p) => [p, { tp: 0, fp: 0, fn: 0, high: 0 }]));
  const fps = [], fns = [];
  for (const r of runs.filter((x) => x.lang === lang)) {
    for (const s of r.steps) {
      for (const x of s.tp) { per[x.pattern].tp++; if (x.confidence === "high") per[x.pattern].high++; }
      for (const x of s.fp) { per[x.pattern].fp++; fps.push({ config: r.config, step: s.step, ...x }); }
      for (const x of s.fn) { per[x.pattern].fn++; fns.push({ config: r.config, step: s.step, ...x }); }
    }
  }
  summary[lang] = per;
  const tot = Object.values(per).reduce((a, x) => ({ tp: a.tp + x.tp, fp: a.fp + x.fp, fn: a.fn + x.fn }), { tp: 0, fp: 0, fn: 0 });
  console.log(`\n### Shop language: ${lang}\n`);
  console.log([
    "| Pattern | TP | FP | FN | Precision | Recall | TP marked confirmed |",
    "|---|---|---|---|---|---|---|",
    ...PATTERNS.map((p) => {
      const x = per[p];
      return `| ${p} | ${x.tp} | ${x.fp} | ${x.fn} | ${pct(x.tp, x.tp + x.fp)} | ${pct(x.tp, x.tp + x.fn)} | ${pct(x.high, x.tp)} |`;
    }),
    `| **all** | ${tot.tp} | ${tot.fp} | ${tot.fn} | ${pct(tot.tp, tot.tp + tot.fp)} | ${pct(tot.tp, tot.tp + tot.fn)} | |`,
  ].join("\n"));
  if (fps.length) console.log("\nFalse positives:\n" + uniq(fps).map((x) => `- [${x.config} / ${x.step}] ${x.pattern}: "${x.text}"`).join("\n"));
  if (fns.length) console.log("\nMisses:\n" + uniq(fns).map((x) => `- [${x.config} / ${x.step}] ${x.pattern}: "${x.text}"`).join("\n"));
}

mkdirSync(join(here, "results"), { recursive: true });
const out = join(here, "results", `${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(out, JSON.stringify({ repeats: REPEATS, summary, runs }, null, 2));
console.log("\nSaved to", out);
