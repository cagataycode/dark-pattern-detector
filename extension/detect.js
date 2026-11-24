// Rule-based detectors. Each returns findings: { key, pattern, confidence, evidence, el }.
// Facts that need a second look across page loads (did the countdown restart? did a fee
// appear later?) are kept in the page's sessionStorage under "dpd:" keys, so they reset with each new tab.

const DPD = (() => {
  // "€12.99", "12,99 €", and the German shorthand "799.-" / "799,–".
  const AMOUNT = /(?:€|EUR|\$|£)\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|EUR)(?![a-z])|\d{1,3}(?:\.\d{3})*[.,][-–]/gi;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "HEAD"]);

  const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
  // Rendered text with spaces between blocks, for quoting in evidence.
  const shown = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const label = (s) => s.replace(AMOUNT, "").replace(/\d+/g, "#").toLowerCase().slice(0, 80);
  const visible = (el) => el.getClientRects().length > 0;

  function amounts(s) {
    return (s.match(AMOUNT) || []).map(parseAmount).filter((n) => !isNaN(n));
  }
  function parseAmount(raw) {
    let n = raw.replace(/[^\d.,]/g, "").replace(/[.,]$/, "");
    if (/^\d{1,3}(\.\d{3})+$/.test(n)) return parseFloat(n.replace(/\./g, "")); // "1.299" thousands
    const lastComma = n.lastIndexOf(","), lastDot = n.lastIndexOf(".");
    if (lastComma > lastDot && n.length - lastComma === 3) n = n.replace(/\./g, "").replace(",", ".");
    else n = n.replace(/,/g, "");
    return parseFloat(n);
  }

  const mem = {
    get(k) { try { return JSON.parse(sessionStorage.getItem("dpd:" + k)); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem("dpd:" + k, JSON.stringify(v)); } catch {} },
  };

  // Short, visible elements with text. Shared by the text-based detectors.
  function candidates(host) {
    const out = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (SKIP_TAGS.has(el.tagName.toUpperCase()) || (host && host.contains(el))) continue;
      const t = txt(el);
      if (t.length === 0 || t.length > 200) continue;
      if (!visible(el)) continue;
      out.push({ el, t });
    }
    return out;
  }
  // The innermost elements that pass the test (drop ancestors of other matches).
  function smallest(cands, test) {
    const hits = cands.filter((c) => test(c.t, c.el));
    const hasHitInside = new Set();
    for (const c of hits) {
      for (let up = c.el.parentElement; up && !hasHitInside.has(up); up = up.parentElement) hasHitInside.add(up);
    }
    return hits.filter((c) => !hasHitInside.has(c.el));
  }
  // A test for "inside, or containing, one of these elements", built once so it stays fast with thousands of them.
  function relatedTo(els) {
    const around = new Set();
    for (const e of els) {
      for (let up = e.parentElement; up && !around.has(up); up = up.parentElement) around.add(up);
    }
    return (el) => {
      if (around.has(el)) return true;
      for (let up = el; up; up = up.parentElement) if (els.has(up)) return true;
      return false;
    };
  }
  // Closest ancestor (or self) whose text passes the test, up to a length limit.
  function contextOf(el, test, max = 200) {
    for (let cur = el; cur && cur !== document.body; cur = cur.parentElement) {
      const t = txt(cur);
      if (t.length > max) return null;
      if (test(t)) return { el: cur, t };
    }
    return null;
  }
  function mmss(s) {
    s = Math.max(0, Math.round(s));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, "0");
    if (d) return `${d}d ${h}h ${m}m`;
    if (h) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
    return `${m}:${ss}`;
  }

  // ---------- urgency ----------
  const TIMER = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/;
  // "02D 09H 32M 43S", "1 Tag 4 Std 12 Min"
  const unit = (u) => `\\s*(?:${u})\\.?(?![a-zäöü])\\s*`;
  const TIMER_UNITS = new RegExp(
    `\\b(?:(\\d{1,3})${unit("d|t|tage?|tag|days?")})?(\\d{1,2})${unit("h|std|hrs?")}(\\d{1,2})${unit("m|min")}(?:(\\d{1,2})${unit("s|sek|sec")})?`,
    "i");
  function timerSecs(t) {
    let m = t.match(TIMER);
    if (m) return m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
    m = t.match(TIMER_UNITS);
    if (m) return (+m[1] || 0) * 86400 + +m[2] * 3600 + +m[3] * 60 + (+m[4] || 0);
    return null;
  }
  const isTimer = (t) => TIMER.test(t) || TIMER_UNITS.test(t);
  const URGENT = /\b(ends?|ending|expires?|left|hurry|sale|offer|deals?|discount|rabatt|last chance|endet|läuft|angebot)\b|nur noch/i;

  function urgency(cands, state) {
    const out = [];
    for (const c of smallest(cands, isTimer)) {
      const ctx = contextOf(c.el, (t) => URGENT.test(t), 300);
      if (!ctx) continue;
      const secs = timerSecs(c.t);
      const key = "urg|" + location.origin + "|" + label(ctx.t);
      // Only a time that counts down while the page is open is a countdown. A clock time
      // next to a sale word ("Sale all week. Opens at 09:30") never changes, so it's never flagged.
      if (!state.timerLive.has(key)) {
        const first = state.timerFirst.get(key);
        if (first === undefined) { state.timerFirst.set(key, secs); continue; }
        if (!(secs < first)) continue;
        state.timerLive.add(key);
      }
      if (!state.urgencyChecked.has(key)) {
        state.urgencyChecked.add(key);
        const prev = mem.get(key);
        const now = Date.now();
        if (prev && now - prev.at < 6 * 3600e3) {
          const expected = prev.secs - (now - prev.at) / 1000;
          if (secs > expected + 3) { // 3 s of slack for timer ticks and load time
            state.urgencyVerdict.set(key, expected <= 0
              ? `This countdown restarted. Going by your earlier visit it should have run out already, but it shows ${mmss(secs)} again.`
              : `This countdown restarted. Going by your earlier visit it should show about ${mmss(expected)}, but it shows ${mmss(secs)}.`);
          }
        } else {
          mem.set(key, { secs, at: now });
        }
      }
      const verdict = state.urgencyVerdict.get(key);
      out.push({
        key, pattern: "urgency", el: ctx.el,
        confidence: verdict ? "high" : "medium",
        evidence: verdict || "A countdown puts you under time pressure. Not verified yet: reload the page, and if the timer starts over, the deadline is fake.",
      });
    }
    return out;
  }

  // Static deadlines ("Nur bis 30.11.", "today only"). Real sales end too, so these stay "likely".
  const DEADLINE = /\b(nur (noch )?(bis|heute)|endet (heute|morgen|am|in)|gilt (nur )?bis|today only|ends (today|tonight|soon|in))\b/i;

  function deadline(cands) {
    return smallest(cands, (t) => DEADLINE.test(t) && t.length < 120 && !isTimer(t)).map((c) => ({
      key: "dl|" + label(c.t), pattern: "urgency", el: c.el, confidence: "medium",
      evidence: `"${shown(c.el)}" sets a deadline. Sales do end, so this is only a dark pattern if the deadline is invented or keeps moving. Check again after it has passed.`,
    }));
  }

  // ---------- scarcity / social proof ----------
  const STOCK = /\b(only|just)\s+\d+\s+(left|remaining|in stock)\b|nur noch\s+\d+|low stock|almost (gone|sold out)|selling fast/i;
  const VIEWERS = /\d+\s+(people|others|persons|personen)\b.{0,60}?(view|looking|watching|bought|ansehen|angesehen|angeschaut|betrachten|gekauft)/i;

  function scarcity(cands, state) {
    const out = [];
    for (const c of smallest(cands, (t) => STOCK.test(t) && !isTimer(t))) {
      const n = +(c.t.match(/\d+/) || [NaN])[0];
      const owner = c.el.closest("a[href], [data-product-id], article, li");
      const where = owner ? (owner.getAttribute("href") || label(txt(owner))) : location.pathname + location.hash;
      const key = "stk|" + location.origin + "|" + where + "|" + label(c.t);
      const prev = mem.get(key);
      if (prev === null || prev === undefined) mem.set(key, n);
      const changed = prev !== null && prev !== undefined && prev !== n;
      if (changed && !state.stockChange.has(key)) state.stockChange.set(key, `${prev} → ${n}`);
      const change = state.stockChange.get(key);
      out.push({
        key, pattern: "scarcity", el: c.el,
        confidence: change ? "high" : "medium",
        evidence: change
          ? `The stock number changed between visits (${change}), so it doesn't look like real stock.`
          : `"${c.t}" is a claim you can't check. Reload later: if the number jumps around, it's made up.`,
      });
    }
    for (const c of smallest(cands, (t) => VIEWERS.test(t))) {
      const key = "view|" + location.pathname + location.hash + "|" + label(c.t);
      const n = +(c.t.match(/\d+/) || [NaN])[0];
      const seen = state.viewerSeen.get(key) || new Set();
      seen.add(n);
      state.viewerSeen.set(key, seen);
      out.push({
        key, pattern: "scarcity", el: c.el,
        confidence: "medium",
        evidence: seen.size > 1
          ? `The viewer count keeps jumping (${[...seen].slice(0, 5).join(", ")}). Shops can't usually tell you this reliably; it's there to create social pressure.`
          : `"${c.t}" is a popularity claim you can't check. It's there to create social pressure.`,
      });
    }
    return out;
  }

  // ---------- pre-ticked add-ons ----------
  const UPSELL = /(insurance|protection|warranty|guarantee|express|priority|donat|newsletter|subscribe|offers|marketing|partner|versicherung|garantie|schutz|spende)/i;
  const NOT_UPSELL = /(terms|conditions|agb|privacy|datenschutz|remember me)/i;

  function preticked(state, host) {
    const out = [];
    for (const box of document.querySelectorAll('input[type="checkbox"]')) {
      if ((host && host.contains(box)) || !visible(box)) continue;
      const lab = box.labels && box.labels[0] ? txt(box.labels[0]) : box.getAttribute("aria-label") || txt(box.parentElement || box);
      if (!lab || NOT_UPSELL.test(lab) || !(UPSELL.test(lab) || /\+\s?(?:€|\$|£)/.test(lab))) continue;
      // The first state seen in this tab counts as the default the shop chose. It's remembered
      // across page loads: on shops that load a new page for checkout, a box the shopper ticked
      // in the cart would otherwise look pre-ticked on the next page.
      const key = "chk|" + location.origin + "|" + label(lab);
      if (!state.firstChecked.has(key)) {
        const stored = mem.get(key);
        const first = stored === null ? box.checked : stored;
        if (stored === null) mem.set(key, first);
        state.firstChecked.set(key, first);
      }
      const first = state.firstChecked.get(key);
      if (!first) continue;
      out.push({
        key, pattern: "preticked", el: box.labels && box.labels[0] ? box.labels[0] : box,
        confidence: "high",
        evidence: `"${lab}" was already ticked when the page first showed it${box.checked ? "" : " (you've unticked it since)"}. It adds to your total unless you notice it.`,
      });
    }
    return out;
  }

  // ---------- drip pricing ----------
  const FEE = /\b(service|handling|processing|booking|convenience|platform|admin(istration)?)\s*(fee|charge)?\b|\bfees?\b|payment handling|gebühr|pauschale|zuschlag/i;
  const TOTAL = /^(order\s+)?(grand\s+)?(total|gesamt(summe|betrag)?|summe)(?![a-zäöü])/i;

  function drip(cands) {
    const out = [];
    const hasAmount = (t) => amounts(t).length > 0;
    const totals = smallest(cands, (t) => TOTAL.test(t) && hasAmount(t) && t.length < 60);
    if (!totals.length) return out;
    const fees = smallest(cands, (t) => FEE.test(t) && hasAmount(t) && t.length < 80 && !TOTAL.test(t));
    const here = location.pathname + location.search + location.hash;
    const key = "drip|" + location.origin;
    const prev = mem.get(key);
    const labels = [...new Set(fees.map((f) => label(f.t)))];
    let flag = mem.get(key + "|flag");
    if (prev && prev.path !== here && Date.now() - prev.at < 2 * 3600e3) {
      const added = labels.filter((l) => !prev.labels.includes(l));
      flag = added.length ? { path: here, labels: added } : null;
      mem.set(key + "|flag", flag);
    }
    if (!prev || prev.path !== here || prev.labels.join() !== labels.join()) {
      mem.set(key, { path: here, labels, at: Date.now() });
    }
    if (flag && flag.path === here) {
      for (const f of fees) {
        if (!flag.labels.includes(label(f.t))) continue;
        out.push({
          key: "drip|" + label(f.t), pattern: "drip", el: f.el, confidence: "high",
          evidence: `"${shown(f.el)}" only shows up now. The total on the previous step didn't include it.`,
        });
      }
    }
    return out;
  }

  // ---------- confirmshaming ----------
  const DECLINE = /^(no|nope|nah|not now|skip|maybe later|nein)\b/i;
  const SELF = /\b(i|i'm|i'd|me|my|ich|mir)\b|full price|miss out/i;
  // "No, I already have an account", "Nein, ich habe schon ein Kundenkonto": a factual answer, not guilt.
  const ACCOUNT = /\b(already|bereits|schon)\b.{0,30}\b(account|konto|kundenkonto|member|registered|registriert|customer|kunde)\b|\b(sign|log)\s?in\b|\beinloggen\b/i;
  const SHAME_ONLY = /\bi (don'?t|do not) (want|like|care)\b|\bi('d| would) rather\b/i;

  function confirmshaming(host) {
    const out = [];
    for (const el of document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')) {
      if ((host && host.contains(el)) || !visible(el)) continue;
      const t = el.tagName === "INPUT" ? el.value : txt(el);
      if (!t || t.length < 8 || t.length > 120 || ACCOUNT.test(t)) continue;
      const declined = DECLINE.test(t) && SELF.test(t.replace(DECLINE, "")) && t.split(" ").length > 3;
      if (!declined && !SHAME_ONLY.test(t)) continue;
      out.push({
        key: "shame|" + label(t), pattern: "confirmshaming", el, confidence: "medium",
        evidence: `The way to say no reads "${t}". A neutral version would just say "No thanks".`,
      });
    }
    return out;
  }

  // ---------- fake reference price ----------
  function fakeref(cands) {
    const struck = [];
    for (const c of cands) {
      if (c.el.children.length || c.t.length > 30 || !amounts(c.t).length) continue;
      const tag = c.el.tagName.toUpperCase();
      const strike = tag === "S" || tag === "DEL" || tag === "STRIKE" ||
        getComputedStyle(c.el).textDecorationLine.includes("line-through");
      if (!strike) continue;
      const was = amounts(c.t)[0];
      const row = c.el.parentElement;
      const others = amounts(txt(row).replace(c.t, "")).filter((n) => n < was);
      if (!others.length) continue;
      const now = Math.max(...others);
      struck.push({ el: row, was, now, pct: Math.round((1 - now / was) * 100) });
    }
    // Same discount (within one percentage point) on three or more products.
    const byPct = new Map();
    for (const s of struck) byPct.set(s.pct, (byPct.get(s.pct) || 0) + 1);
    const alike = (pct) => (byPct.get(pct - 1) || 0) + (byPct.get(pct) || 0) + (byPct.get(pct + 1) || 0);
    const nearRow = relatedTo(new Set(struck.map((s) => s.el)));
    const announced = new Map();
    return struck.map((s) => {
      const same = alike(s.pct);
      if (same >= 3 && !announced.has(s.pct)) announced.set(s.pct, saleAnnounced(cands, s.pct, nearRow));
      const uniform = same >= 3 && !announced.get(s.pct);
      return {
        key: "ref|" + s.was + "|" + s.now, pattern: "fakeref", el: s.el,
        confidence: uniform ? "high" : "medium",
        evidence: uniform
          ? `${same} products on this page are all about ${s.pct}% off. Identical discounts like this are usually calculated, not real earlier prices.`
          : `Nothing shows that anyone ever paid the struck-through price. In the EU, a "was" price has to be the lowest price of the previous 30 days.`,
      };
    });
  }

  // A page-wide promotion that explains a uniform discount: "20% off everything", "-20 % auf alles".
  // The percentage has to appear outside the product rows themselves.
  function saleAnnounced(cands, pct, nearRow) {
    const re = new RegExp(`(^|[^\\d])(${pct - 1}|${pct}|${pct + 1})\\s?%`);
    return cands.some((c) => re.test(c.t) && c.t.length < 160 && !nearRow(c.el));
  }

  // "statt 9.99 €", "UVP 799.-": reference prices stated in words.
  const REFWORD = /\b(statt|uvp|ggü\.?|vorher|früher)\b/i;

  function refwords(cands, struckEls) {
    const nearStruck = relatedTo(struckEls);
    return smallest(cands, (t) => REFWORD.test(t) && amounts(t).length > 0 && t.length < 80)
      .filter((c) => !nearStruck(c.el))
      .map((c) => {
        const listPrice = /\buvp\b/i.test(c.t);
        return {
          key: "refw|" + label(c.t), pattern: "fakeref", el: c.el, confidence: "medium",
          evidence: listPrice
            ? `"${shown(c.el)}" compares with the manufacturer's recommended price. That's allowed, but it's an anchor: few shops actually charge it, so the discount looks bigger than it is.`
            : `"${shown(c.el)}" compares with an earlier price. In the EU that earlier price has to be the lowest one charged in the previous 30 days; you can't check that here.`,
        };
      });
  }

  function scan(state, host) {
    const cands = candidates(host);
    const struck = fakeref(cands);
    const struckEls = new Set(struck.map((f) => f.el));
    return [
      ...urgency(cands, state),
      ...deadline(cands),
      ...scarcity(cands, state),
      ...preticked(state, host),
      ...drip(cands),
      ...confirmshaming(host),
      ...struck,
      ...refwords(cands, struckEls),
    ];
  }

  function newState() {
    return { timerFirst: new Map(), timerLive: new Set(), urgencyChecked: new Set(), urgencyVerdict: new Map(), stockChange: new Map(), viewerSeen: new Map(), firstChecked: new Map() };
  }

  return { scan, newState };
})();
