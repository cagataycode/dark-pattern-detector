// Field check: open each site in headless Chrome, run the detector, reload, run it again
// (so the "did it change between visits" checks can fire), and save findings + screenshots.
//
// Usage: node fieldcheck/run.mjs [sites.json] [outDir]
// Needs puppeteer-core and a local Chrome. Set PUPPETEER_CORE to the package path if it
// isn't resolvable from here, and CHROME to the Chrome binary.
//
// It does not click anything: cookie banners stay as they are (no consent is given),
// and sites that block headless browsers are recorded as blocked, not worked around.

import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || "puppeteer-core");

const sitesFile = resolve(process.argv[2] || join(here, "sites.json"));
const outDir = resolve(process.argv[3] || join(here, "runs", new Date().toISOString().slice(0, 10)));
mkdirSync(join(outDir, "shots"), { recursive: true });

const ext = join(here, "..", "extension");
const bundle = ["patterns.js", "detect.js", "ui.js", "content.js"]
  .map((f) => readFileSync(join(ext, f), "utf8"))
  .join("\n;\n");

const sites = JSON.parse(readFileSync(sitesFile, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function detect(page) {
  // Runtime.evaluate isn't subject to the page's CSP, unlike an injected <script>.
  await page.evaluate(bundle);
  await sleep(6000);
  return page.evaluate(() => {
    const host = document.querySelector("dpd-root");
    return host && host.dataset.findings ? JSON.parse(host.dataset.findings) : [];
  });
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--lang=de-DE"],
  defaultViewport: { width: 1366, height: 900 },
});

const SALE = /(sale|angebot|deals?|prozente|black-?friday|outlet)/i;
const count = (list) => list.reduce((m, f) => ((m[f.pattern] = (m[f.pattern] || 0) + 1), m), {});

// Two passes on one URL: detect, reload, detect again.
async function check(site, url, id, findSale) {
  const row = { ...site, url, status: null, title: null, finalUrl: null, first: [], second: [], error: null, sale: null };
  const page = await browser.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    row.status = res ? res.status() : null;
    await sleep(4000);
    row.title = await page.title();
    row.finalUrl = page.url();
    if (findSale && row.status < 400) {
      // First same-site link that looks like a sale or deals page.
      row.sale = await page.evaluate((src) => {
        const re = new RegExp(src, "i");
        for (const a of document.querySelectorAll("a[href]")) {
          const u = new URL(a.href, location.href);
          if (u.host !== location.host || u.href === location.href) continue;
          if (re.test(u.pathname) || re.test(a.textContent || "")) return u.href;
        }
        return null;
      }, SALE.source);
    }
    row.first = await detect(page);
    await page.screenshot({ path: join(outDir, "shots", `${id}-1.png`) });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(4000);
    row.second = await detect(page);
    await page.screenshot({ path: join(outDir, "shots", `${id}-2.png`) });
  } catch (e) {
    row.error = String(e.message || e).split("\n")[0];
  }
  await page.close();
  console.log(`${site.country} ${(site.name + (findSale ? "" : " (sale)")).padEnd(26)} ${String(row.status).padEnd(4)} ${row.error ? "ERROR " + row.error : JSON.stringify(count(row.second))}`);
  return row;
}

const results = [];
for (const site of sites) {
  const id = slug(site.name);
  const home = await check(site, site.url, id, true);
  results.push(home);
  if (home.sale) results.push(await check(site, home.sale, id + "-sale", false));
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
}

await browser.close();
console.log("Saved to", outDir);
