// Schedules tab + alert badge. Uses $, esc and api from dashboard.js.
const TYPE_LABEL = { seo: "SEO audit", geo: "AI visibility", blitz: "⚡ Blitz", citations: "AI citations", ranks: "Rank tracking" };
const ago = (ms) => { if (!ms) return "never"; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const until = (ms) => { const m = Math.round((ms - Date.now()) / 60000); return m <= 0 ? "due now" : m < 60 ? `in ${m} min` : m < 1440 ? `in ${Math.round(m / 60)} h` : `in ${Math.round(m / 1440)} d`; };

const schedForm = $("#sched-form");
schedForm.type.onchange = () => {
  const t = schedForm.type.value;
  schedForm.querySelector('[data-for="url"]').hidden = t === "citations" || t === "ranks";
  schedForm.querySelector('[data-for="citations"]').hidden = t !== "citations";
  schedForm.querySelector('[data-for="ranks"]').hidden = t !== "ranks";
};
schedForm.onsubmit = async (e) => {
  e.preventDefault();
  try { await api("/api/schedules", { method: "POST", body: Object.fromEntries(new FormData(schedForm)) }); schedForm.reset(); schedForm.type.onchange(); loadSchedules(); }
  catch (err) { alert(err.message); }
};

async function loadSchedules() {
  const list = await api("/api/schedules");
  $("#sched-list").innerHTML = list.length ? list.map((s) => {
    const scores = s.history.filter((h) => h.score != null).map((h) => h.score);
    const max = Math.max(100, ...scores);
    const spark = s.history.map((h) => h.error ? '<i class="err" title="error"></i>' : `<i style="height:${Math.max(3, (h.score / max) * 28)}px" title="${h.score} · ${esc(h.created_at)}"></i>`).join("");
    return `<div class="sched"><div><b class="name">${esc(s.name)}</b>
      <small>${TYPE_LABEL[s.type]} · ${s.cadence} · alert at ±${s.threshold}${s.email ? " · email" : ""}${s.webhook ? " · webhook" : ""}</small>
      <small>${s.running ? "Running…" : `Last run ${ago(s.last_run_at)} · next ${s.enabled ? until(s.next_run_at) : "paused"}`}${s.last_error ? ` · <span style="color:#d93a3a">${esc(s.last_error)}</span>` : ""}</small></div>
      <div class="acts"><span class="spark">${spark}</span>${s.last_score != null ? `<span class="pill ${s.last_score >= 80 ? "good" : s.last_score >= 50 ? "mid" : "bad"}">${s.last_score}</span>` : ""}
        <label class="switch"><input type="checkbox" data-toggle="${s.id}" ${s.enabled ? "checked" : ""}> on</label>
        <button class="btn" data-run="${s.id}">Run now</button><button class="btn ghost" data-sdel="${s.id}">✕</button></div></div>`;
  }).join("") : "<p>No schedules yet.</p>";
}

$("#sched-list").onclick = async (e) => {
  const { run, sdel } = e.target.dataset;
  if (run) { e.target.disabled = true; e.target.textContent = "Running…"; await api(`/api/schedules/${run}/run`, { method: "POST" }).catch((err) => alert(err.message)); loadSchedules(); loadAlerts(); }
  if (sdel && confirm("Delete this schedule?")) { await api(`/api/schedules/${sdel}`, { method: "DELETE" }); loadSchedules(); }
};
$("#sched-list").onchange = async (e) => {
  const id = e.target.dataset.toggle;
  if (id) { await api(`/api/schedules/${id}`, { method: "PATCH", body: { enabled: e.target.checked } }); loadSchedules(); }
};

const ALERT_ICON = { drop: "↓", rise: "↑", error: "!" };
async function loadAlerts() {
  const { unread, alerts } = await api("/api/alerts");
  $("#alert-n").hidden = !unread; $("#alert-n").textContent = unread;
  $("#alert-list").innerHTML = alerts.length ? alerts.map((a) => `<div class="alert ${a.read ? "" : "unread"}"><i class="${a.level}">${ALERT_ICON[a.level] || "•"}</i>
    <div>${esc(a.message)}<small style="display:block;color:var(--muted);font-weight:400">${esc(a.created_at)}</small></div></div>`).join("") : "<p>No alerts yet.</p>";
}
$("#alerts-read").onclick = async () => { await api("/api/alerts/read", { method: "POST" }); loadAlerts(); };

$("#tabs").addEventListener("click", (e) => { if (e.target.closest("[data-tab=sched]")) { loadSchedules(); loadAlerts(); } });
loadAlerts().catch(() => {});
setInterval(() => { if (!$("#app").hidden) { loadAlerts().catch(() => {}); if (!document.querySelector('[data-pane="sched"]').hidden) loadSchedules().catch(() => {}); } }, 30000);
