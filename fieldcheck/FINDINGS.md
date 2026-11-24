# Field check, 23 Nov 2026

The detector ran on 10 German shop homepages (`sites.json`) in headless Chrome. (The first run also included 10 Turkish shops; Turkish has since been dropped from the project, and those results are left out here.) On each site that loaded, it also ran on the first sale or deals page the homepage linked to. Every page was checked twice, with a reload in between, so the "did it change between visits" rules could fire.

The runner doesn't click anything. Cookie banners stay as they are, so no consent is given, and sites that block automated browsers are recorded as blocked, not worked around. Raw results and screenshots are in `runs/` and stay local.

## Reach

| | Sites | Loaded | Blocked (HTTP 403 / bot check) |
|---|---|---|---|
| DE | 10 | 7 | Zalando, home24, notebooksbilliger |

Of the sites that loaded, Temu gave almost nothing to check: it showed a login page.

## What was found (after the fixes below)

| Site | Page | Findings |
|---|---|---|
| OTTO | home | 1 deadline ("Nur noch heute") |
| MediaMarkt | home | 7 deadlines ("Nur bis 30.11. 9 Uhr", …), 4 UVP comparisons |
| MediaMarkt | Angebote & Aktionen | 2 deadlines, 6 UVP comparisons |
| Lidl | home | 1 earlier-price claim ("Starterpaket 0.99 € statt 9.99 €") |
| limango | home | 12 UVP comparisons |
| limango | sale | 108 UVP comparisons (one per product, up to -82% off UVP) |
| ABOUT YOU | sale | 1 countdown, shown twice ("02D 09H 32M 43S"). It didn't restart on reload, so it stays "likely" |
| Westwing, OTTO Black Friday, Temu | | none |

**Nothing on real sites reached "confirmed".** No countdown restarted, and no stock or viewer claims were found. Pre-ticked add-ons, drip pricing and confirmshaming sit in carts, checkouts and signup flows, and the runner never reaches those.

## What the first run missed, and the fixes

The first run found **nothing at all**. Looking at the screenshots and page text showed why:

| Miss | Example | Fix |
|---|---|---|
| German price shorthand | "799.-" | Amount pattern now accepts `799.-`, `1.299,–` |
| Reference price stated in words, not struck through | "0.99 € statt 9.99 €", "UVP: 79,95 €" | New rule for `statt`, `UVP`, `vorher` |
| Fixed-date deadlines | "Nur bis 30.11. 9 Uhr" | New rule. Stays "likely": real sales end too |
| Countdowns with units | "02D 09H 32M 43S", "1 Tag 4 Std 12 Min" | Countdown parser accepts day/hour/minute/second units (EN, DE) |
| UVP and "earlier price" treated the same | | Separate wording: a UVP comparison is legal but an anchor; an earlier price falls under the EU 30-day lowest-price rule |
| 108 tags on one page | limango sale | More than five flags of one kind show as icon-only tags |

## What this means for the project

1. **Most real manipulation is in images and in flows.** Hero banners carry "-62%" and "799.-" as pictures, which text rules can't read. The strongest patterns (pre-ticked add-ons, drip pricing) only appear once something is in the cart. The test shop covers the flows, and the study measures them there.
2. **German shops lean on anchors and deadlines, not fake timers.** UVP comparisons and "Nur bis …" deadlines were everywhere. Countdowns were rare and didn't restart. That fits the EU rules on earlier prices, which are stricter than for UVP. It's worth a paragraph in the reflection on cultural differences and regulation.
3. **The detector needs to say how sure it is.** A UVP comparison is legal; a restarted countdown is deceptive. The "likely" vs. "confirmed" split did that job, and the wording now says when something is legal but still an anchor.
4. **Next field check: by hand.** Install the extension, browse 10 German shops normally, including adding to cart up to checkout without buying, and note each flag as right, wrong, or missed. That also reaches the shops that blocked the headless run.
