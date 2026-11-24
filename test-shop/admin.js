// Admin page: build participant links and export the event log.

const box = document.getElementById("patterns");
box.innerHTML = Object.entries(PATTERNS)
  .map(([id, label]) => `<label><input type="checkbox" value="${id}"> <code>${id}</code> ${label}</label>`)
  .join("");
const boxes = [...box.querySelectorAll("input")];
const sidInput = document.getElementById("sid");
const linkInput = document.getElementById("link");

function buildLink() {
  const chosen = boxes.filter((b) => b.checked).map((b) => b.value);
  const url = new URL("index.html", location.href);
  url.searchParams.set("p", chosen.length ? chosen.join(",") : "none");
  if (sidInput.value.trim()) url.searchParams.set("sid", sidInput.value.trim());
  if (document.getElementById("lang").value === "de") url.searchParams.set("v", "de");
  linkInput.value = url.toString();
  document.getElementById("open").href = url.toString();
}

boxes.forEach((b) => (b.onchange = buildLink));
sidInput.oninput = buildLink;
document.getElementById("lang").onchange = buildLink;
document.getElementById("all").onclick = () => { boxes.forEach((b) => (b.checked = true)); buildLink(); };
document.getElementById("none").onclick = () => { boxes.forEach((b) => (b.checked = false)); buildLink(); };
document.getElementById("copy").onclick = async () => {
  await navigator.clipboard.writeText(linkInput.value);
  document.getElementById("copy").textContent = "Copied";
  setTimeout(() => (document.getElementById("copy").textContent = "Copy link"), 1200);
};

function readLog() {
  return JSON.parse(localStorage.getItem(STORE.log) || "[]");
}

function renderLog() {
  const log = readLog();
  document.getElementById("count").textContent = `(${log.length} events)`;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const rows = log.slice(-200).reverse().map((e) => {
    const { t, sid, patterns, type, ...data } = e;
    return `<tr><td>${esc(t.slice(11, 19))}</td><td>${esc(sid || "–")}</td><td>${esc(type)}</td>
      <td>${esc(patterns.join(", ") || "none")}</td><td class="data">${esc(JSON.stringify(data))}</td></tr>`;
  }).join("");
  document.getElementById("log").innerHTML =
    `<tr><th>Time</th><th>Session</th><th>Event</th><th>Patterns on</th><th>Data</th></tr>` + rows;
}

document.getElementById("export").onclick = () => {
  const blob = new Blob([JSON.stringify(readLog(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `shop-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
document.getElementById("clear").onclick = () => {
  if (confirm("Delete all logged events in this browser? Export first if you need them.")) {
    localStorage.removeItem(STORE.log);
    renderLog();
  }
};

window.addEventListener("storage", renderLog);
buildLink();
renderLog();
