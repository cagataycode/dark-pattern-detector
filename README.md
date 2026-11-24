# dark-pattern-detector

A browser extension that flags manipulative design while you shop and names the cognitive bias each pattern exploits. This folder also holds a test shop with a known set of dark patterns, which serves as ground truth for the detector and as the environment for user studies.

## Extension

Load it in Chrome: open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose the `extension/` folder. The toolbar popup turns warnings on and off and lists what was found on the current page.

All detection runs locally with rules. Nothing leaves the browser. A few facts are kept in the page's `sessionStorage` under `dpd:` keys, so the extension can check whether something changed between page loads (a countdown's value, a stock number, the fee lines of the last step, and whether an add-on box was ticked when first seen). They are gone once the tab closes.

| Pattern | How it's detected | Confirmed when |
|---|---|---|
| Fake urgency | A `mm:ss` or `2d 9h 32m` timer next to words like "ends", "sale", "offer" that is seen counting down (a clock time that never changes isn't flagged); fixed deadlines like "Nur bis 30.11." | A timer shows more time after a reload than it should |
| Scarcity / popularity | "Only N left", "N people are viewing" (EN, DE) | The stock number changes between visits |
| Pre-ticked add-on | A checkbox for insurance, express, newsletter etc. or a "+€" price that was already ticked the first time this tab saw it, across page loads, so a box the shopper ticked in the cart isn't flagged on the next page | Always (rule is specific) |
| Drip pricing | Fee lines next to a total | A fee line appears that the previous step's total didn't have |
| Confirmshaming | A decline button in the first person ("No thanks, I prefer…"); account answers like "No, I already have an account" are ignored | Never, it's a wording judgement |
| Unverified "was" price | A struck-through amount next to a lower one; "statt", "UVP" comparisons | Three or more struck-through prices share the same discount (±1 point), and the page doesn't announce that percentage as a sale ("20% off everything") |

Each flag is drawn as a dashed outline with a tag. Click the tag for the bias it exploits and the evidence. The page also gets a `dpd-root` element whose `data-findings` attribute holds the findings as JSON, so automated tests can read them.

For development without installing it, serve this whole folder (`python3 -m http.server 8011 --directory .`) and inject `extension/patterns.js`, `detect.js`, `ui.js` and `content.js` into a page in that order. Without the `chrome` API, the content script simply runs.

## Evaluation against the test shop

`eval/run.mjs` serves the test shop itself, then walks it like a shopper in 8 configurations: all patterns off, all on, and each pattern alone. The walk covers the home page with the signup popup, home after a reload, a product page, the cart, the checkout, and the checkout after a reload. At every step it compares the detector's findings with the shop's ground truth, element by element, and reports precision and recall per pattern.

Every configuration runs in both shop languages. The English shop uses the wording the rules were written against. The German shop (`?v=de`) uses wording and markup typical of German shops, such as "Nur noch 2 Stück auf Lager", "00 Std. 09 Min. 59 Sek.", "Servicepauschale", "statt <del>136,99 €</del>", and "… haben diesen Artikel in der letzten Stunde angesehen". Results go to `eval/results/`.

```bash
PUPPETEER_CORE=/path/to/node_modules/puppeteer-core node eval/run.mjs 3   # 3 sessions per configuration and language
```

### German shop, first run (rules not yet adapted), 23 Nov 2026

This is the meaningful number: the rules met wording they hadn't been written for. Raw data: `eval/results/2026-11-23-baseline.json`.

| Pattern | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|
| urgency | 0 | 0 | 36 | – | 0% |
| scarcity | 40 | 36 | 6 | 53% | 87% |
| preticked | 12 | 0 | 0 | 100% | 100% |
| drip | 0 | 0 | 24 | – | 0% |
| confirmshaming | 6 | 0 | 0 | 100% | 100% |
| fakeref | 78 | 0 | 0 | 100% | 100% |
| **all** | 136 | 36 | 66 | **79%** | **67%** |

Why:
- **Countdown "nur noch 00 Std. 09 Min."**: the abbreviation dots broke the time parser, and "nur noch 00" read as a stock claim. So every countdown was both missed and reported as scarcity: 36 misses and 36 false alarms from one banner.
- **Drip pricing**: the cart total "Summe" was printed straight before the amount ("Summe53,89 €" in the page text), so no total was found and the cart-to-checkout comparison never ran. "Servicepauschale" also wasn't a known fee word.
- **Viewer claims**: "angesehen" (past tense) and a longer sentence than the rule allowed for.

### After fixing those four rules

| Shop | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|
| English | 207 | 0 | 0 | 100% | 100% |
| German | 202 | 0 | 0 | 100% | 100% |

These are regression results, not accuracy. The fixes were made after seeing the misses, and the shop and the detector come from the same author. The first German run and the [field check](fieldcheck/FINDINGS.md) are the honest measures. "Marked confirmed" rates are in the JSON: urgency 83% (every view after the first reload), pre-ticked and drip 100%, scarcity 15–18% (only when a stock number changed between loads), confirmshaming 0% (wording is never confirmed).

### Probes: honest pages and edge cases

`eval/probes.mjs` loads 11 small hand-made pages. Four are honest and must not be flagged: a store's opening time next to the word "sale", "No, I already have an account" (EN and DE), and an add-on the shopper ticked in the cart before a new checkout page loads. The others check that the same fixes still catch the real patterns: a ticking and a restarting countdown, a pre-ticked box, an announced vs. an unexplained uniform discount, and confirmshaming.

```bash
PUPPETEER_CORE=/path/to/node_modules/puppeteer-core node eval/probes.mjs
```

### Speed

Large product lists used to freeze the tab: on a page with 3,000 products, one scan took about 20 s and every scroll redraw about 19 s, because several checks compared every finding with every other one, and tags were measured between DOM writes. After the fix (24 Nov 2026), the same page scans in about 0.2 s and redraws in under 20 ms. Only tags near the visible part of the page are drawn.

## Field check

`fieldcheck/run.mjs` opens a list of sites in headless Chrome, runs the detector twice with a reload in between, and saves findings and screenshots to `fieldcheck/runs/` (not committed). It needs `puppeteer-core` and a local Chrome. Results from the first run are in [fieldcheck/FINDINGS.md](fieldcheck/FINDINGS.md).

```bash
PUPPETEER_CORE=/path/to/node_modules/puppeteer-core node fieldcheck/run.mjs
```

## User study

Drafts for a small study with the test shop (dark patterns with vs. without the extension's warnings): [study/PROTOCOL.md](study/PROTOCOL.md) (design, procedure, measures, data protection, questionnaire), [study/CONSENT.md](study/CONSENT.md) and [study/DEBRIEF.md](study/DEBRIEF.md).

## Test shop

A static single-page shop (`test-shop/`) with no build step and no real payments. It doesn't collect personal data: the email field in the signup popup is never stored.

Run it:

```bash
python3 -m http.server 8011 --bind 127.0.0.1 --directory test-shop
```

Then open http://127.0.0.1:8011/admin.html to choose patterns and get a participant link.

### Patterns

Set them with `?p=` on any shop URL: a comma-separated list of ids, or `all` / `none`. A session id can be given with `?sid=`, and `?v=de` switches the shop to German. All three stay set for the browser tab until changed. Without `?p=`, a new tab starts with every pattern on. Note that `localhost` and `127.0.0.1` are separate sites to the browser, each with its own settings and event log, so use one of them consistently.

| id | On | Off (honest version) |
|---|---|---|
| `urgency` | "Flash sale ends in 09:59" banner, restarts on every page load | No banner |
| `scarcity` | "Only N left!" badges and "N people are viewing this", random | No stock or viewer claims |
| `preticked` | Protection plan and express shipping checked by default in the cart | Same options, unchecked |
| `drip` | Service and payment-handling fees appear only at checkout | Same fees shown in the cart already |
| `confirmshaming` | Signup popup declines with "No thanks, I prefer paying full price" | Declines with "No thanks" |
| `fakeref` | Struck-through "was" price and "-57%" with no real prior price | Plain price |

### Event log

Every relevant action (pattern shown, add-on toggled, popup answer, order placed) is written to `localStorage` in that browser. Export it from the admin page as JSON after a session.
