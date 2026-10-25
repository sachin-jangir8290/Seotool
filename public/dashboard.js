const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json" }, body: opts.body && JSON.stringify(opts.body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

let analyzers = [], current = null;

const resultTable = (r) => r.text
  ? `<pre class="term" style="white-space:pre-wrap">${esc(r.text)}</pre>`
  : r.rows?.length
    ? `<div class="scroll"><table><thead><tr>${r.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${r.rows
        .map((row) => `<tr>${r.columns.map((c) => `<td>${esc(row[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : "<p>No actions proposed.</p>";

async function boot() {
  const { user, aiEnabled } = await api("/api/me");
  if (!user) { $("#auth-box").hidden = false; return; }
  $("#who").textContent = user.email;
  $("#app").hidden = false;
  analyzers = await api("/api/analyzers");
  $("#kind").innerHTML = analyzers.map((a) => `<option value="${a.kind}">${esc(a.label)}</option>`).join("") +
    `<option value="ai" ${aiEnabled ? "" : "disabled"}>Custom AI agent (Claude)${aiEnabled ? "" : " — set ANTHROPIC_API_KEY"}</option>`;
  loadAgents();
  loadOverview();
  if (!aiEnabled) $("#chat-log").innerHTML = '<p class="intro">Set ANTHROPIC_API_KEY on the server to enable the assistant.</p>';
}

// ---- tabs ----
function showTab(name) {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.dataset.pane !== name));
  if (name === "overview") loadOverview();
}
$("#tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); };
document.addEventListener("click", (e) => e.target.dataset.go && showTab(e.target.dataset.go));

// ---- overview ----
async function loadOverview() {
  const o = await api("/api/overview");
  const tile = (label, v, sub = "") => `<div class="kpi"><small>${label}</small><b>${v}</b><span>${esc(sub)}</span></div>`;
  $("#kpis").innerHTML = tile("SEO score", o.lastSeo ? o.lastSeo.score : "—", o.lastSeo?.url || "No audit yet") +
    tile("AI visibility", o.lastGeo ? o.lastGeo.score : "—", o.lastGeo?.url || "No check yet") +
    tile("Agents", o.agents) + tile("Agent runs", o.runs) + tile("Pending approvals", o.pending);
  const list = (await api("/api/audits")).slice(0, 8);
  $("#audit-list").innerHTML = list.length
    ? `<div class="scroll"><table><thead><tr><th>Type</th><th>URL</th><th>Score</th><th>Date</th><th></th></tr></thead><tbody>${list.map((a) =>
        `<tr><td>${a.type === "seo" ? "SEO" : "AI visibility"}</td><td>${esc(a.url)}</td><td>${scoreBadge(a.score)}</td><td>${esc(a.created_at)}</td><td><button class="btn ghost" data-audit-id="${a.id}">View</button></td></tr>`).join("")}</tbody></table></div>`
    : "<p>No audits yet.</p>";
}
$("#audit-list").onclick = async (e) => {
  const id = e.target.dataset.auditId;
  if (!id) return;
  const a = await api(`/api/audits/${id}`);
  showTab(a.type);
  document.querySelector(`[data-pane="${a.type}"] .audit-out`).innerHTML = auditView(a.result);
};

// ---- audits ----
const scoreBadge = (s) => `<span class="pill ${s >= 80 ? "good" : s >= 50 ? "mid" : "bad"}">${s}/100</span>`;
const ICON = { pass: "✓", warn: "!", fail: "✕" };
function auditView(r) {
  return `<div class="score-ring" style="--s:${r.score}"><b>${r.score}</b><small>score</small></div>
    <p class="intro" style="text-align:center">${esc(r.url)}</p>
    ${r.bots ? `<div class="bots">${r.bots.map((b) => `<span class="${b.allowed ? "ok" : "no"}">${b.allowed ? "✓" : "✕"} ${esc(b.bot)}</span>`).join("")}</div>` : ""}
    <div class="checks">${r.checks.map((c) => `<div class="check ${c.status}"><i>${ICON[c.status]}</i><div><b>${esc(c.name)}</b><small>${esc(c.detail)}</small></div></div>`).join("")}</div>`;
}
document.querySelectorAll("[data-audit]").forEach((f) => (f.onsubmit = async (e) => {
  e.preventDefault();
  const out = f.parentElement.querySelector(".audit-out");
  out.innerHTML = "<p>Auditing… this can take up to 15 seconds.</p>";
  try { out.innerHTML = auditView(await api("/api/audits", { method: "POST", body: { type: f.dataset.audit, url: f.url.value } })); }
  catch (err) { out.innerHTML = `<p style="color:#d93a3a">${esc(err.message)}</p>`; }
}));

// ---- assistant chat ----
const chatHistory = [];
$("#chat-form").onsubmit = async (e) => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  if (!q) return;
  e.target.q.value = "";
  chatHistory.push({ role: "user", content: q });
  const draw = (pending) => {
    $("#chat-log").innerHTML = chatHistory.map((m) => `<div class="msg ${m.role}">${esc(m.content)}</div>`).join("") + (pending ? '<div class="msg assistant">…</div>' : "");
    $("#chat-log").scrollTop = 1e9;
  };
  draw(true);
  try { chatHistory.push({ role: "assistant", content: (await api("/api/chat", { method: "POST", body: { messages: chatHistory } })).reply }); }
  catch (err) { chatHistory.pop(); $("#chat-log").insertAdjacentHTML("beforeend", `<p style="color:#d93a3a">${esc(err.message)}</p>`); return; }
  draw(false);
};

async function loadAgents() {
  const list = await api("/api/agents");
  $("#agents").innerHTML = list.length
    ? `<div class="scroll"><table><thead><tr><th>Agent</th><th>Type</th><th>Runs</th><th>Cadence</th><th></th></tr></thead><tbody>${list
        .map((a) => `<tr><td><b>${esc(a.name)}</b><br><small>${esc(a.role)}</small></td><td>${esc(a.kind)}</td><td>${a.run_count}</td><td>${esc(a.cadence)}</td>
          <td style="white-space:nowrap"><button class="btn" data-open="${a.id}">Open</button> <button class="btn ghost" data-del="${a.id}">✕</button></td></tr>`).join("")}</tbody></table></div>`
    : "<p>No agents yet. Create your first one above.</p>";
  $("#agents").onclick = async (e) => {
    const open = e.target.dataset.open, del = e.target.dataset.del;
    if (open) openAgent(list.find((a) => a.id == open));
    if (del && confirm("Delete this agent and its runs?")) { await api(`/api/agents/${del}`, { method: "DELETE" }); $("#runner").hidden = true; loadAgents(); }
  };
}

function openAgent(a) {
  current = a;
  const info = analyzers.find((x) => x.kind === a.kind);
  $("#runner").hidden = false;
  $("#run-title").textContent = a.name;
  $("#run-cols").textContent = info ? `Required CSV columns: ${info.columns}` : "Paste any data (CSV, report text) — Claude follows your role and rules.";
  $("#sample-btn").hidden = !info;
  $("#run-out").innerHTML = "";
  loadHistory();
  $("#runner").scrollIntoView({ behavior: "smooth" });
}

async function loadHistory() {
  const runs = await api(`/api/agents/${current.id}/runs`);
  const badge = (v) => (v === 1 ? '<span class="pill">approved</span>' : v === -1 ? '<span class="pill" style="background:#555">rejected</span>' : "pending");
  $("#history").innerHTML = runs.length
    ? runs.map((r) => `<details style="border-top:1px solid var(--line);padding:8px 0"><summary>#${r.id} · ${esc(r.created_at)} · ${badge(r.approved)} — ${esc(r.summary)}</summary>
        ${resultTable(r.result)}
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">${r.approved ? "" : `<button class="btn" data-ok="${r.id}">Approve</button><button class="btn ghost" data-no="${r.id}">Reject</button>`}<a class="btn ghost" href="/api/runs/${r.id}/export.csv">Export CSV</a></div></details>`).join("")
    : "<p>No runs yet.</p>";
}

$("#history").onclick = async (e) => {
  const id = e.target.dataset.ok || e.target.dataset.no;
  if (!id) return;
  await api(`/api/runs/${id}/approve`, { method: "POST", body: { approved: !!e.target.dataset.ok } });
  loadHistory();
};

$("#auth-form").onsubmit = (e) => e.preventDefault();
$("#auth-form").onclick = async (e) => {
  const mode = e.target.dataset.mode;
  if (!mode) return;
  const f = new FormData($("#auth-form"));
  try { await api(`/api/${mode}`, { method: "POST", body: Object.fromEntries(f) }); location.reload(); }
  catch (err) { $("#auth-err").textContent = err.message; }
};

$("#new-agent").onsubmit = async (e) => {
  e.preventDefault();
  try { await api("/api/agents", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); loadAgents(); }
  catch (err) { alert(err.message); }
};

$("#csv-file").onchange = async (e) => { const f = e.target.files[0]; if (f) $("#csv").value = await f.text(); };
$("#sample-btn").onclick = () => { $("#csv").value = analyzers.find((x) => x.kind === current.kind).sample; };
$("#run-btn").onclick = async () => {
  $("#run-out").innerHTML = "<p>Running…</p>";
  try {
    const r = await api(`/api/agents/${current.id}/run`, { method: "POST", body: { csv: $("#csv").value } });
    $("#run-out").innerHTML = `<div class="score">${esc(r.summary)}</div>${resultTable(r.result)}<p class="intro">Saved to history — approve or reject below.</p>`;
    loadHistory(); loadAgents();
  } catch (err) { $("#run-out").innerHTML = `<p style="color:#c2410c">${esc(err.message)}</p>`; }
};
$("#logout").onclick = async () => { await api("/api/logout", { method: "POST" }); location.reload(); };

boot();
