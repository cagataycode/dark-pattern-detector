// Small hand-made pages: honest ones that must NOT be flagged, and the cases each fix must keep catching.
// Each case is one or more page loads in the same tab; the findings after the last load are checked.
//
// Usage: node eval/probes.mjs      (needs puppeteer-core and a local Chrome, as eval/run.mjs)

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const puppeteer = createRequire(import.meta.url)(process.env.PUPPETEER_CORE || "puppeteer-core");
const bundle = ["patterns.js", "detect.js", "ui.js", "content.js"]
  .map((f) => readFileSync(join(root, "extension", f), "utf8")).join("\n;\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tick = (txt) => `<div id="t"></div><script>let n=899;const f=()=>{document.getElementById("t").textContent=${JSON.stringify(txt)}.replace("CLOCK",String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0"));n--};f();setInterval(f,1000)</script>`;
const rows = (n) => ["A","B","C","D"].map((x,i)=>`<div>${x} <s>€${(i+1)*50}.00</s> €${(i+1)*40}.00</div>`).join("");
// [name, [html per page load], expected "pattern/confidence" set on the LAST load]
const CASES = [
 ["honest: store hours next to sale", [`<p>Winter sale all week. Store opens at 09:30</p>`], []],
 ["honest: login decline", [`<button>No, I already have an account</button>`], []],
 ["honest: login decline DE", [`<button>Nein, ich habe bereits ein Kundenkonto</button>`], []],
 ["honest: express ticked by shopper in cart, then checkout page", [
    `<label><input type="checkbox"> Express shipping +€4.99</label><p>Total €50.00</p>`,
    `<label><input type="checkbox" checked> Express shipping +€4.99</label><p>Total €54.99</p>`], []],
 ["honest: announced 20% sale", [`<h2>20% off everything this week</h2>` + rows()], ["fakeref/medium"]],
 ["unexplained uniform 20%", [rows()], ["fakeref/high"]],
 ["still caught: ticking countdown", [tick("Offer ends in CLOCK")], ["urgency/medium"]],
 ["still caught: countdown restarts on reload", [tick("Offer ends in CLOCK"), tick("Offer ends in CLOCK")], ["urgency/high"]],
 ["still caught: pre-ticked on first sight", [`<label><input type="checkbox" checked> Protection plan +€9.99</label>`], ["preticked/high"]],
 ["still caught: pre-ticked, shopper unticks, next page", [
    `<label><input type="checkbox" checked> Protection plan +€9.99</label>`,
    `<label><input type="checkbox"> Protection plan +€9.99</label>`], ["preticked/high"]],
 ["still caught: confirmshaming", [`<button>No thanks, I prefer paying full price</button>`], ["confirmshaming/medium"]],
];

let html = "";
const server = createServer((_q, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><body>${html}</body></html>`);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});

let fails = 0;
for (const [name, loads, expected] of CASES) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  let found = [];
  for (const [i, h] of loads.entries()) {
    if (i) await sleep(4000); // long enough for a restarted countdown to stand out
    html = h;
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(bundle);
    await sleep(2500); // a countdown has to tick before it counts
    found = await page.evaluate(() => { window.__dpd.scan(); return window.__dpd.findings().map((x) => x.pattern + "/" + x.confidence); });
  }
  const got = [...new Set(found)].sort().join(", "), want = [...expected].sort().join(", ");
  if (got !== want) fails++;
  console.log(`${got === want ? "ok  " : "FAIL"} ${name}: ${got || "nothing"}${got === want ? "" : `  (expected ${want || "nothing"})`}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(fails ? `\n${fails} of ${CASES.length} failed` : `\nAll ${CASES.length} passed`);
process.exit(fails ? 1 : 0);
