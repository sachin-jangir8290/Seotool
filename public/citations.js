// AI Citations tab. Uses $, esc and api from dashboard.js.
const ENGINE_COLORS = { claude: "#d97757", chatgpt: "#10a37f", gemini: "#4285f4", perplexity: "#20808d" };
let citeEngines = [];

async function loadCiteEngines() {
  citeEngines = await api("/api/citations/engines");
  $("#cite-engines").innerHTML = citeEngines.map((e) => `<label class="${e.enabled ? "" : "off"}" title="${e.enabled ? "" : `Set ${e.key} on the server`}">
    <input type="checkbox" name="engine" value="${e.id}" ${e.enabled ? "checked" : "disabled"}> ${esc(e.label)}${e.enabled ? "" : " — needs key"}</label>`).join("");
  loadCiteHistory();
}

function engineCard(id, s) {
  const label = citeEngines.find((e) => e.id === id)?.label || id;
  return `<section class="eng" id="eng-${id}" style="--c:${ENGINE_COLORS[id] || "var(--p1)"}">
    <header><div><h3>${esc(label)}</h3><small>${s.asked} answers read${s.errors ? ` · ${s.errors} errors` : ""}</small></div>
      <div class="ring" style="--v:${s.rate}"><b>${s.rate}%</b><small>named</small></div></header>
    <div class="nums"><div>Answers naming you<b style="color:#16a36a">${s.named}</b></div><div>Answers skipping you<b style="color:#d93a3a">${s.skipped}</b></div>
      <div>Avg position<b>${s.avgPosition != null ? "#" + s.avgPosition : "—"}</b></div><div>Sentiment<b>${s.sentiment != null ? s.sentiment + "%" : "—"}</b></div>
      <div>Site cited as source<b>${s.cited}</b></div><div>Named instead${s.citedInstead ? ` · ${s.citedInstead.share}%` : ""}<b>${esc(s.citedInstead?.name || "—")}</b></div></div>
    <div class="feed"></div></section>`;
}

function qCard(r) {
  const tag = r.error ? `<span class="tag err">Error</span>` : r.mentioned ? `<span class="tag yes">● Named</span>` : `<span class="tag no">● Missing</span>`;
  const meta = r.error ? esc(r.error) : `Position ${r.position ? "#" + r.position : "—"} · Sentiment ${r.sentiment ?? "—"}${r.sentiment != null ? "%" : ""} · ${r.cited ? "site cited" : "site not cited"}${r.namedInstead.length ? ` · named instead: ${esc(r.namedInstead.join(", "))}` : ""}`;
  return `<div class="q">${tag} <small style="display:inline">${r.ms} ms</small><div><b>${esc(r.question)}</b></div><small>${meta}</small>
    ${r.answer ? `<details><summary>Answer</summary><p>${esc(r.answer)}</p></details>` : ""}</div>`;
}

function renderRun(summary, rows) {
  $("#cite-out").innerHTML = summary.map((s) => engineCard(s.engine, s)).join("");
  for (const r of rows) document.querySelector(`#eng-${r.engine} .feed`)?.insertAdjacentHTML("afterbegin", qCard(r));
}

$("#cite-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = Object.fromEntries(new FormData(f));
  body.engines = [...document.querySelectorAll("#cite-engines input:checked")].map((i) => i.value);
  const btn = f.querySelector("button"); btn.disabled = true;
  const rows = [];
  let total = 0;
  const t0 = performance.now();
  const stats = () => {
    const done = rows.length, named = rows.filter((r) => r.mentioned).length;
    $("#cite-stats").hidden = false;
    $("#cite-stats").innerHTML = [["Answers read", `${done} / ${total}`], ["Naming you", named], ["Skipping you", rows.filter((r) => !r.error && !r.mentioned).length],
      ["Citation rate", done ? Math.round((named / Math.max(1, rows.filter((r) => !r.error).length)) * 100) + "%" : "—"], ["Elapsed", ((performance.now() - t0) / 1000).toFixed(1) + "s"]]
      .map(([l, v]) => `<div><small>${l}</small><b>${v}</b></div>`).join("");
  };
  const timer = setInterval(stats, 200);
  try {
    const res = await fetch("/api/citations/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const m of lines.filter(Boolean).map(JSON.parse)) {
        if (m.type === "error") throw new Error(m.message);
        if (m.type === "start") { total = m.total; $("#cite-out").innerHTML = m.engines.map((id) => engineCard(id, { asked: 0, named: 0, skipped: 0, rate: 0, cited: 0, errors: 0 })).join(""); }
        if (m.type === "row") { rows.push(m.row); document.querySelector(`#eng-${m.row.engine} .feed`).insertAdjacentHTML("afterbegin", qCard(m.row)); }
        if (m.type === "done") { renderRun(m.summary, rows); loadCiteHistory(); }
      }
    }
  } catch (err) {
    $("#cite-out").innerHTML = `<p style="color:#d93a3a">${esc(err.message)}</p>`;
  } finally { clearInterval(timer); stats(); btn.disabled = false; }
};

async function loadCiteHistory() {
  const runs = await api("/api/citations/runs");
  $("#cite-history").innerHTML = runs.length
    ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Brand</th>${citeEngines.map((e) => `<th>${esc(e.label)}</th>`).join("")}<th></th></tr></thead><tbody>${runs.map((r) =>
        `<tr><td>${esc(r.created_at)}</td><td>${esc(r.brand)}</td>${citeEngines.map((e) => { const s = r.summary.find((x) => x.engine === e.id); return `<td>${s ? s.rate + "%" : "—"}</td>`; }).join("")}
        <td><button class="btn ghost" data-cite-run="${r.id}">View</button></td></tr>`).join("")}</tbody></table></div>`
    : "<p>No runs yet.</p>";
}
$("#cite-history").onclick = async (e) => {
  const id = e.target.dataset.citeRun;
  if (!id) return;
  const r = await api(`/api/citations/runs/${id}`);
  renderRun(r.summary, r.rows);
  $("#cite-out").scrollIntoView({ behavior: "smooth" });
};

loadCiteEngines().catch(() => {});
