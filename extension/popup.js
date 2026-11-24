const box = document.getElementById("enabled");
const status = document.getElementById("status");
const list = document.getElementById("list");

chrome.storage.local.get({ enabled: true }, (v) => {
  box.checked = v.enabled;
  refresh();
});
box.onchange = () => {
  chrome.storage.local.set({ enabled: box.checked });
  setTimeout(refresh, 300);
};

async function refresh() {
  list.innerHTML = "";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { type: "dpd:findings" }, (res) => {
    if (chrome.runtime.lastError || !res) {
      status.textContent = "Not available on this page.";
      return;
    }
    if (!res.enabled) {
      status.textContent = "Warnings are off.";
      return;
    }
    // Diagnostics: how often the page was scanned, and the last error if a scan failed.
    const diag = document.getElementById("diag");
    diag.textContent = `Scanned ${res.scans} time${res.scans === 1 ? "" : "s"}${res.error ? ". Error: " + res.error : ""}`;
    diag.style.color = res.error ? "#c92a2a" : "";
    status.textContent = res.findings.length
      ? `${res.findings.length} dark pattern${res.findings.length === 1 ? "" : "s"} on this page:`
      : "No dark patterns found on this page.";
    for (const f of res.findings) {
      const p = DPD_PATTERNS[f.pattern];
      const li = document.createElement("li");
      li.innerHTML = `<div class="n"></div><div class="muted"></div>`;
      li.querySelector(".n").textContent = p.name;
      li.querySelector(".n").classList.add(f.confidence);
      li.querySelector(".muted").textContent = `${f.confidence === "high" ? "Confirmed" : "Likely"} · exploits ${p.bias.toLowerCase()}`;
      list.appendChild(li);
    }
  });
}
