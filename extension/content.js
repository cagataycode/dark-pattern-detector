// Glue: decide whether the detector is on, rescan when the page changes, answer the popup.

(() => {
  const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  let enabled = false;
  let observer = null;
  let state = DPD.newState();
  let last = 0;
  let timer = 0;
  let findings = [];
  let scans = 0;
  let lastError = null;

  function scan() {
    timer = 0;
    last = Date.now();
    if (!enabled) return;
    // A failing scan must not go unnoticed: the popup shows the error.
    try {
      findings = DPD.scan(state, DPD_UI.host());
      DPD_UI.render(findings);
      lastError = null;
    } catch (e) {
      lastError = String((e && e.stack) || e).split("\n").slice(0, 2).join(" ");
      console.error("[dark-pattern-detector]", e);
    }
    scans++;
  }

  // At most one scan per second; countdowns and live counters mutate the page constantly.
  function schedule() {
    if (timer || !enabled) return;
    timer = setTimeout(scan, Math.max(300, 1000 - (Date.now() - last)));
  }

  function start() {
    if (enabled) return;
    enabled = true;
    state = DPD.newState();
    DPD_UI.mount();
    observer = new MutationObserver((records) => {
      const host = DPD_UI.host();
      if (records.every((r) => host && host.contains(r.target))) return;
      schedule();
    });
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["hidden", "open", "class", "aria-hidden"],
    });
    window.addEventListener("hashchange", schedule);
    window.addEventListener("popstate", schedule);
    scan();
  }

  function stop() {
    enabled = false;
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(timer);
    timer = 0;
    findings = [];
    DPD_UI.unmount();
  }

  if (hasChrome) {
    chrome.storage.local.get({ enabled: true }, (v) => (v.enabled ? start() : stop()));
    chrome.storage.onChanged.addListener((c) => {
      if (c.enabled) c.enabled.newValue ? start() : stop();
    });
    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg && msg.type === "dpd:findings") {
        reply({
          enabled, scans, error: lastError,
          findings: findings.map(({ pattern, confidence, evidence }) => ({ pattern, confidence, evidence })),
        });
      }
    });
  } else {
    // Loaded as a plain script (development, evaluation): just run, and let tests read
    // the findings with their elements and trigger a scan without waiting.
    window.__dpd = { findings: () => findings, scan };
    start();
  }
})();
