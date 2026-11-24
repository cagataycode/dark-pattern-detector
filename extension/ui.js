// On-page UI: a dashed outline and a tag on each flagged element, plus a summary
// button in the corner. Everything except the outlines lives in a shadow root, so
// the page's CSS can't break it and it can't break the page.

const DPD_UI = (() => {
  const CSS = `
    :host { all: initial; }
    .tag {
      position: absolute; z-index: 2147483647;
      font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #e8590c; color: #fff; border: 0; border-radius: 4px;
      padding: 3px 7px; cursor: pointer; white-space: nowrap;
      box-shadow: 0 1px 4px rgba(0,0,0,.25);
    }
    .tag.medium { background: #f08c00; }
    .card, .panel {
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1d1d1f; background: #fff; border-radius: 10px;
      box-shadow: 0 6px 24px rgba(0,0,0,.22); padding: 14px 16px;
    }
    .card { position: absolute; z-index: 2147483647; width: 300px; }
    .card h4, .panel h4 { margin: 0 0 4px; font-size: 14px; }
    .card .bias { color: #b34700; font-weight: 600; margin-bottom: 6px; }
    .card p { margin: 6px 0 0; }
    .card .ev { background: #fff4e6; border-radius: 6px; padding: 8px; }
    .conf { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #868e96; }
    .fab {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1d1d1f; color: #fff; border: 0; border-radius: 999px;
      padding: 10px 14px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.3);
    }
    .fab .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #e8590c; margin-right: 6px; }
    .panel { position: fixed; right: 16px; bottom: 60px; z-index: 2147483647; width: 320px; max-height: 60vh; overflow: auto; }
    .panel ul { list-style: none; margin: 8px 0 0; padding: 0; }
    .panel li { padding: 8px 0; border-top: 1px solid #f1f3f5; cursor: pointer; }
    .panel li:hover .n { text-decoration: underline; }
    .panel .n { font-weight: 600; }
    .panel .muted { color: #868e96; font-size: 12px; }
  `;

  let host, root, layer, fab, panel;
  let findings = [];
  let openCard = null;
  let panelOpen = false;
  const outlined = new Map(); // el -> previous inline outline values

  function mount() {
    if (host) return host;
    host = document.createElement("dpd-root");
    host.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><div class="layer"></div>`;
    layer = root.querySelector(".layer");
    document.documentElement.appendChild(host);
    window.addEventListener("scroll", reposition, { passive: true, capture: true });
    window.addEventListener("resize", reposition);
    return host;
  }

  function unmount() {
    for (const [el, prev] of outlined) restoreOutline(el, prev);
    outlined.clear();
    if (host) host.remove();
    host = root = layer = fab = panel = null;
    findings = [];
    openCard = null;
    panelOpen = false;
    window.removeEventListener("scroll", reposition, { capture: true });
    window.removeEventListener("resize", reposition);
  }

  function restoreOutline(el, prev) {
    el.style.outline = prev.outline;
    el.style.outlineOffset = prev.offset;
  }

  function render(next) {
    mount();
    findings = next;
    // Outlines: add new ones, remove stale ones.
    const live = new Set(findings.map((f) => f.el));
    for (const [el, prev] of outlined) {
      if (!live.has(el)) { restoreOutline(el, prev); outlined.delete(el); }
    }
    for (const f of findings) {
      if (outlined.has(f.el)) continue;
      outlined.set(f.el, { outline: f.el.style.outline, offset: f.el.style.outlineOffset });
      f.el.style.outline = `2px dashed ${f.confidence === "high" ? "#e8590c" : "#f08c00"}`;
      f.el.style.outlineOffset = "2px";
    }
    if (openCard && !findings.some((f) => f.key === openCard)) openCard = null;
    draw();
    host.dataset.findings = JSON.stringify(findings.map(({ pattern, confidence, evidence }) => ({ pattern, confidence, evidence })));
  }

  function draw() {
    if (!layer) return;
    // Measure everything before touching the layer: reading positions between DOM writes
    // forces a layout per tag, which made redraws take seconds on long product lists.
    // Only tags near the visible part of the page are drawn; scrolling redraws.
    const margin = innerHeight;
    const placed = [];
    for (const f of findings) {
      const r = f.el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (r.bottom < -margin || r.top > innerHeight + margin) continue;
      if (covered(f.el, r)) continue;
      placed.push({ f, r });
    }
    const perPattern = new Map();
    for (const f of findings) perPattern.set(f.pattern, (perPattern.get(f.pattern) || 0) + 1);

    const frag = document.createDocumentFragment();
    const perEl = new Map();
    let openEl = null;
    for (const { f, r } of placed) {
      const stack = perEl.get(f.el) || 0;
      perEl.set(f.el, stack + 1);
      const tag = document.createElement("button");
      tag.className = "tag " + f.confidence;
      // Many flags of one kind (e.g. a price on every product): icon-only tags to keep the page readable.
      const compact = perPattern.get(f.pattern) > 5;
      tag.textContent = compact ? "⚠" : "⚠ " + DPD_PATTERNS[f.pattern].name;
      tag.title = DPD_PATTERNS[f.pattern].name;
      const top = Math.max(0, r.top + scrollY - 22 - stack * 22);
      const left = r.left + scrollX;
      tag.style.top = top + "px";
      tag.style.left = left + "px";
      tag.onclick = (e) => { e.stopPropagation(); openCard = openCard === f.key ? null : f.key; draw(); };
      frag.appendChild(tag);
      if (openCard === f.key) openEl = card(f, top + 24, Math.min(left, scrollX + innerWidth - 320));
    }
    // The open card goes last so no other tag is drawn over it.
    if (openEl) frag.appendChild(openEl);
    // Summary button and panel.
    if (findings.length) {
      fab = document.createElement("button");
      fab.className = "fab";
      fab.innerHTML = `<span class="dot"></span>${findings.length} dark pattern${findings.length === 1 ? "" : "s"}`;
      fab.onclick = (e) => { e.stopPropagation(); panelOpen = !panelOpen; draw(); };
      frag.appendChild(fab);
      if (panelOpen) frag.appendChild(summary());
    }
    layer.replaceChildren(frag);
  }

  // True when something else (a modal, a sticky bar) sits on top of the element's centre.
  // Off-screen elements can't be tested and count as not covered.
  function covered(el, r) {
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    if (!hit || hit === host) return false;
    return !(el === hit || el.contains(hit) || hit.contains(el));
  }

  function card(f, top, left) {
    const p = DPD_PATTERNS[f.pattern];
    const el = document.createElement("div");
    el.className = "card";
    el.style.top = top + "px";
    el.style.left = Math.max(8, left) + "px";
    el.innerHTML = `
      <div class="conf">${f.confidence === "high" ? "Confirmed" : "Likely"}</div>
      <h4></h4><div class="bias"></div><p class="why"></p><p class="ev"></p>`;
    el.querySelector("h4").textContent = p.name;
    el.querySelector(".bias").textContent = "Exploits: " + p.bias;
    el.querySelector(".why").textContent = p.why;
    el.querySelector(".ev").textContent = f.evidence;
    el.onclick = (e) => e.stopPropagation();
    return el;
  }

  function summary() {
    panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `<h4>Dark patterns on this page</h4><div class="muted">Click one to jump to it.</div><ul></ul>`;
    panel.onclick = (e) => e.stopPropagation();
    const ul = panel.querySelector("ul");
    for (const f of findings) {
      const li = document.createElement("li");
      li.innerHTML = `<div class="n"></div><div class="muted"></div>`;
      li.querySelector(".n").textContent = DPD_PATTERNS[f.pattern].name;
      li.querySelector(".muted").textContent = `${f.confidence === "high" ? "Confirmed" : "Likely"} · ${DPD_PATTERNS[f.pattern].bias}`;
      li.onclick = () => {
        f.el.scrollIntoView({ behavior: "smooth", block: "center" });
        openCard = f.key;
        setTimeout(draw, 400);
      };
      ul.appendChild(li);
    }
    return panel;
  }

  let raf = 0;
  function reposition() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; draw(); });
  }

  document.addEventListener("click", () => {
    if (openCard || panelOpen) { openCard = null; panelOpen = false; draw(); }
  });

  return { render, unmount, mount, host: () => host };
})();
