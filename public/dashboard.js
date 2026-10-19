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
}

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
        ${r.approved ? "" : `<div style="margin-top:8px;display:flex;gap:8px"><button class="btn" data-ok="${r.id}">Approve</button><button class="btn ghost" data-no="${r.id}">Reject</button></div>`}</details>`).join("")
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
