// Keywords tab: opportunities + tracked rankings. Uses $, esc, api, showTab from dashboard.js.
let kwOpps = [], kwFilter = "";
const KW_CLASS = { "Striking distance": "s", "Low CTR": "c", "Top 3 push": "t" };

// Position sparkline: lower position = higher on the chart.
function posSpark(series) {
  const pts = series.filter((p) => p.position != null);
  if (pts.length < 2) return "";
  const w = 90, h = 26, max = Math.max(...pts.map((p) => p.position)), min = Math.min(...pts.map((p) => p.position));
  const y = (v) => (max === min ? h / 2 : ((v - min) / (max - min)) * (h - 4) + 2);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * w},${y(p.position).toFixed(1)}`).join(" ");
  return `<svg class="pos" width="${w}" height="${h}"><path d="${d}" fill="none" stroke="#6a3df5" stroke-width="2"/></svg>`;
}

async function kwInit() {
  const st = await api("/api/google/status");
  $("#kw-need").hidden = st.connected; $("#kw-bar").hidden = !st.connected;
  if (!st.connected) return;
  if (!$("#kw-site").options.length) {
    const sites = await api("/api/google/sites");
    $("#kw-site").innerHTML = sites.map((s) => `<option>${esc(s)}</option>`).join("");
  }
  $("#kw-track").hidden = false;
  loadTracked();
}

function drawOpps() {
  const rows = kwOpps.filter((o) => !kwFilter || o.type === kwFilter);
  $("#kw-opp-list").innerHTML = rows.length ? `<div class="scroll"><table><thead><tr><th>Query</th><th>Page</th><th>Position</th><th>Impr.</th><th>CTR</th><th>Type</th><th>+Clicks</th><th>What to do</th><th></th></tr></thead><tbody>${rows.map((o) =>
    `<tr><td><b>${esc(o.query)}</b></td><td>${esc(o.page)}</td><td>${o.position}</td><td>${o.impressions}</td><td>${o.ctr}</td><td><span class="kw-type ${KW_CLASS[o.type]}">${esc(o.type)}</span></td>
     <td><b>+${o.gain}</b></td><td>${esc(o.action)}</td><td><button class="btn ghost" data-kwtrack="${esc(o.query)}">Track</button></td></tr>`).join("")}</tbody></table></div>` : "<p>No opportunities in this group.</p>";
}

$("#kw-find").onclick = async () => {
  const b = $("#kw-find"); b.disabled = true; b.textContent = "Reading Search Console…";
  try {
    kwOpps = await api(`/api/keywords/opportunities?site=${encodeURIComponent($("#kw-site").value)}`);
    $("#kw-opps").hidden = false; drawOpps();
  } catch (e) { alert(e.message); }
  finally { b.disabled = false; b.textContent = "Find opportunities"; }
};
$("#kw-filter").onclick = (e) => {
  if (e.target.dataset.f === undefined) return;
  kwFilter = e.target.dataset.f;
  document.querySelectorAll("#kw-filter button").forEach((b) => b.classList.toggle("on", b === e.target));
  drawOpps();
};

async function addTracked(list) {
  await api("/api/keywords/track", { method: "POST", body: { site: $("#kw-site").value, keywords: list } });
  loadTracked();
}
$("#kw-opp-list").onclick = (e) => { if (e.target.dataset.kwtrack) { addTracked([e.target.dataset.kwtrack]); e.target.textContent = "Tracked ✓"; e.target.disabled = true; } };
$("#kw-add").onsubmit = (e) => { e.preventDefault(); if (e.target.k.value.trim()) { addTracked([e.target.k.value]); e.target.reset(); } };

async function loadTracked() {
  const list = await api(`/api/keywords/tracked?site=${encodeURIComponent($("#kw-site").value)}`);
  $("#kw-list").innerHTML = list.length ? `<div class="scroll"><table><thead><tr><th>Keyword</th><th>Position</th><th>Change</th><th>Trend</th><th>Clicks (7d)</th><th>Ranking page</th><th></th></tr></thead><tbody>${list.map((k) => {
    const chg = k.change == null ? "—" : k.change > 0 ? `<span class="chg up">▲ ${k.change}</span>` : k.change < 0 ? `<span class="chg down">▼ ${-k.change}</span>` : "0";
    return `<tr><td><b>${esc(k.keyword)}</b></td><td>${k.position ?? (k.series.length ? "not ranking" : "—")}</td><td>${chg}</td><td>${posSpark(k.series)}</td><td>${k.clicks ?? "—"}</td><td>${esc(k.page || "—")}</td>
      <td><button class="btn ghost" data-kwdel="${esc(k.keyword)}">✕</button></td></tr>`;
  }).join("")}</tbody></table></div>` : "<p>No tracked keywords yet. Add some above or click Track on an opportunity.</p>";
}
$("#kw-list").onclick = async (e) => {
  const k = e.target.dataset.kwdel;
  if (k) { await api(`/api/keywords/track?site=${encodeURIComponent($("#kw-site").value)}&keyword=${encodeURIComponent(k)}`, { method: "DELETE" }); loadTracked(); }
};
$("#kw-snap").onclick = async () => {
  const b = $("#kw-snap"); b.disabled = true;
  try { const r = await api("/api/keywords/snapshot", { method: "POST", body: { site: $("#kw-site").value } }); b.textContent = `Updated · ${r.top10}/${r.tracked} in top 10`; loadTracked(); }
  catch (e) { alert(e.message); b.textContent = "Update positions now"; }
  finally { b.disabled = false; }
};
$("#kw-site").onchange = () => { kwOpps = []; $("#kw-opps").hidden = true; loadTracked(); };
$("#tabs").addEventListener("click", (e) => { if (e.target.closest("[data-tab=kw]")) kwInit().catch((err) => alert(err.message)); });
