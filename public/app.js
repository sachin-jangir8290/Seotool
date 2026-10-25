const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const table = (head, rows) =>
  `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<td><b>${esc(c)}</b></td>` : `<td>${esc(c)}</td>`)).join("")}</tr>`)
    .join("")}</tbody></table></div>`;

// Checklist groups persist per-viewer and show a running score.
function checklist(id, groups) {
  const saved = store.get("chk-" + id, {});
  let n = 0;
  const html = Object.entries(groups)
    .map(([g, items]) => `<div><h3>${esc(g)}</h3>${items
      .map((it) => { const key = `${id}-${n++}`; return `<label class="chk"><input type="checkbox" data-k="${key}" ${saved[key] ? "checked" : ""}> ${esc(it)}</label>`; })
      .join("")}</div>`)
    .join("");
  return `<div class="groups" data-chk="${id}">${html}</div><div class="score" id="score-${id}"></div>`;
}

function bindChecklist(id, total, verdict) {
  const root = $(`[data-chk="${id}"]`);
  const update = () => {
    const state = {};
    root.querySelectorAll("input").forEach((i) => { if (i.checked) state[i.dataset.k] = 1; });
    store.set("chk-" + id, state);
    if (loggedIn) fetch("/api/progress/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) });
    const done = Object.keys(state).length;
    $("#score-" + id).innerHTML = `<b>${done}</b> / ${total} done — ${verdict(done, total)}<div class="bar"><i style="width:${(done / total) * 100}%"></i></div>`;
  };
  root.addEventListener("change", update);
  update();
}

const teamSheet = (t) =>
  table(["#", "Agent", "What it does", "Runs"], t.agents.map((a, i) => [String(i + 1).padStart(2, "0"), ...a]))
    .replace(/<td><b>(\d\d)<\/b><\/td>/g, '<td class="idx">$1</td>') + `<pre class="term"><b>start here →</b> ${esc(t.tip)}</pre>`;

const SHEETS = [
  ["The 5-layer agentic marketing stack", "Build it from the bottom up: data first, you on top.", () =>
    `<div class="stack">${DATA.stack.map((s, i) => `<div class="${i === 4 ? "hot" : ""}"><span>${5 - i}. ${esc(s[0])}</span><small>${esc(s[2])}</small></div>`).join("")}</div>` +
    table(["Layer", "What it is", "Examples"], DATA.stack)],

  ["Where are you on the agentic ladder?", "Click the step that matches how you work today.", () =>
    `<div class="ladder">${DATA.ladder.map((l, i) => `<button data-step="${i}" style="height:${30 + i * 17}%">${i + 1}<br>${esc(l[0])}</button>`).join("")}</div><div class="ladder-out" id="ladder-out">Pick a step.</div>`],

  ["The anatomy of an AI agent", "Six parts. Miss one and the agent drifts.", () =>
    `<div class="cards">${DATA.anatomy.map((a, i) => `<div class="card ${i === 0 ? "hot" : ""}"><b>${esc(a[0])}</b>${esc(a[1])}<br><small class="mono">${esc(a[2])}</small></div>`).join("")}</div>
    <pre class="term"><b>ROLE</b> You are a Search Term Miner for our Google Ads account.
<b>DATA</b> Search terms report, last 30 days, all campaigns.
<b>RULES</b> Flag terms with spend &gt; $20 and 0 conversions. Never touch brand terms.
<b>OUTPUT</b> Table: term, spend, clicks, reason, suggested match type.
<b>CADENCE</b> Every Monday 8am.  <b>APPROVAL</b> Nothing applied until I approve.</pre>`],

  ["Prompt, automation or agent — and the 10 rules", "Pick the right tool for the job.", () =>
    table(DATA.modes.head, DATA.modes.rows) +
    `<div class="cards" style="margin-top:12px">${DATA.rules.map((r, i) => `<div class="card"><span class="mono" style="color:var(--accent)">${String(i + 1).padStart(2, "0")}</span> ${esc(r)}</div>`).join("")}</div>`],

  ["Build your first agent in 30 days", "One bottleneck, one agent, one month.", () =>
    checklist("plan30", Object.fromEntries(DATA.plan30.map((p) => [p[0], [`${p[1]} — ${p[2]}`]])))],

  ["Google Ads vs Meta Ads vs SEO vs AI search", "Four channels, four kinds of agent work.", () => table(DATA.channels.head, DATA.channels.rows)],
  [DATA.teams.google.title, "10 agents for search, shopping and PMax.", () => teamSheet(DATA.teams.google)],
  [DATA.teams.meta.title, "10 agents for creative, audiences and budget.", () => teamSheet(DATA.teams.meta)],
  [DATA.teams.seo.title, "10 agents that keep pages ranking and growing.", () => teamSheet(DATA.teams.seo)],
  [DATA.teams.geo.title, "10 agents that get you cited in ChatGPT, Perplexity and Gemini.", () => teamSheet(DATA.teams.geo)],

  ["A real run: the weekly click-loss report", "Search Console, last 28 days vs prior 28 days.", () =>
    `<div class="kpis">${DATA.realRun.kpis.map((k) => `<div><b>${esc(k[0])}</b><small>${esc(k[1])}</small></div>`).join("")}</div>` +
    `<div class="scroll"><table><thead><tr><th>Page</th><th>Clicks lost</th><th>Why</th><th>Fix</th></tr></thead><tbody>${DATA.realRun.rows
      .map((r) => `<tr><td class="mono">${esc(r[0])}</td><td>−${r[1]}</td><td>${esc(r[2])}</td><td><span class="pill">${esc(r[3])}</span></td></tr>`).join("")}</tbody></table></div>`],

  ["The 16 metrics your agents watch", "Filter by channel.", () =>
    `<div class="tool"><select id="metric-filter"><option value="">All channels</option>${[...new Set(DATA.metrics.map((m) => m[0]))].map((c) => `<option>${esc(c)}</option>`).join("")}</select></div><div id="metric-table" style="margin-top:8px"></div>`],

  ["The agent delegation matrix", "Every recurring task goes in one of four boxes.", () =>
    `<div class="matrix">${Object.entries(DATA.delegation).map(([k, v]) => `<div class="${k === "Keep" ? "keep" : ""}"><h3>${k}</h3>${v.map((x) => `<div style="font-size:13px;padding:3px 0">☐ ${esc(x)}</div>`).join("")}</div>`).join("")}</div>`],

  ["The weekly agent calendar", "What runs when, and what you review.", () =>
    `<div class="cal">${DATA.calendar.map(([d, items]) => `<div class="day"><h4>${d}</h4>${items.map((i) => `<p><b>${esc(i[0])}</b><br>${esc(i[1])}</p>`).join("")}</div>`).join("")}</div>`],

  ["The agent guardrails checklist", "24 rules before an agent touches a live account.", () => checklist("guard", DATA.guardrails)],
  ["The agentic CMO checklist", "Score your setup. 0–10 manual, 11–20 assisted, 21+ agentic.", () => checklist("cmo", DATA.cmo)],

  ["Agent prompt builder", "Fill the six parts, get a ready-to-use agent prompt.", () =>
    `<div class="tool">
      <select id="pb-team"><option value="">Start from a template…</option>${Object.values(DATA.teams).flatMap((t) => t.agents.map((a) => `<option value="${esc(a[0])}|${esc(a[1])}|${esc(a[2])}">${esc(a[0])}</option>`)).join("")}</select>
      ${["Role", "Data", "Rules", "Output", "Cadence", "Approval"].map((f) => `<input id="pb-${f}" placeholder="${f}">`).join("")}
      <div style="display:flex;gap:8px"><button class="btn" id="pb-go">Build prompt</button><button class="btn ghost" id="pb-copy">Copy</button></div>
      <pre class="term" id="pb-out">Your prompt appears here.</pre></div>`, true],
];

function render() {
  $("#stats").innerHTML = DATA.stats.map(([n, l]) => `<span><b>${n}</b> ${l}</span>`).join("");
  const icons = { google: "◎", meta: "◆", seo: "↗", geo: "✦" };
  const teamSheet0 = SHEETS.findIndex((x) => x[0] === DATA.teams.google.title);
  $("#svc").innerHTML = Object.entries(DATA.teams).map(([k, t], i) =>
    `<a href="#s${teamSheet0 + i + 1}"><div class="ico">${icons[k]}</div><h3>${esc(t.title.replace(/^The | agent team$/g, ""))}</h3><p>${esc(t.agents.slice(0, 3).map((a) => a[0]).join(", "))} and more.</p><span>${t.agents.length} agents →</span></a>`).join("");
  $("#toc").innerHTML = SHEETS.map((s, i) => `<a href="#s${i + 1}">${i + 1}. ${esc(s[0])}</a>`).join("");
  $("#sheets").innerHTML = SHEETS.map(([title, intro, body, wide], i) =>
    `<section class="sheet ${wide ? "wide" : ""}" id="s${i + 1}"><div class="num">Sheet ${String(i + 1).padStart(2, "0")}</div><h2>${esc(title)}</h2><p class="intro">${esc(intro)}</p>${body()}</section>`).join("");

  // Ladder
  document.querySelectorAll(".ladder button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".ladder button").forEach((x) => x.classList.toggle("on", +x.dataset.step <= +b.dataset.step));
    const l = DATA.ladder[b.dataset.step];
    $("#ladder-out").innerHTML = `<b>Step ${+b.dataset.step + 1}: ${esc(l[0])}.</b> ${esc(l[1])}<br><b>Next move:</b> ${esc(l[2])}`;
  }));

  // Metrics filter
  const drawMetrics = (f) => { $("#metric-table").innerHTML = table(["Group", "Metric", "Meaning", "Channel"], DATA.metrics.filter((m) => !f || m[0] === f)); };
  $("#metric-filter").addEventListener("change", (e) => drawMetrics(e.target.value));
  drawMetrics("");

  // Checklists
  bindChecklist("plan30", DATA.plan30.length, (d, t) => (d === t ? "first agent live 🎉" : "keep going"));
  bindChecklist("guard", 24, (d) => (d >= 24 ? "safe to go live" : d >= 12 ? "read-only only" : "not ready for live accounts"));
  bindChecklist("cmo", 29, (d) => (d >= 21 ? "Agentic" : d >= 11 ? "Assisted" : "Manual"));

  // Prompt builder
  const fields = ["Role", "Data", "Rules", "Output", "Cadence", "Approval"];
  $("#pb-team").addEventListener("change", (e) => {
    if (!e.target.value) return;
    const [name, job, cadence] = e.target.value.split("|");
    $("#pb-Role").value = `You are the ${name}. Your job: ${job.toLowerCase()}.`;
    $("#pb-Cadence").value = cadence;
    $("#pb-Approval").value = "Propose changes only. Nothing is applied until I approve.";
    $("#pb-Output").value = "A table with item, metric, reason and suggested action.";
  });
  $("#pb-go").addEventListener("click", () => {
    $("#pb-out").textContent = fields.map((f) => `${f.toUpperCase()}: ${$("#pb-" + f).value || "—"}`).join("\n");
  });
  $("#pb-copy").addEventListener("click", () => navigator.clipboard?.writeText($("#pb-out").textContent));
}

// When served by the backend and signed in, checklist progress syncs to the account.
let loggedIn = false;
(async () => {
  try {
    const me = await (await fetch("/api/me")).json();
    if (me.user) {
      loggedIn = true;
      const saved = await (await fetch("/api/progress")).json();
      Object.entries(saved).forEach(([k, v]) => store.set("chk-" + k, v));
    }
  } catch {}
  render();
})();
