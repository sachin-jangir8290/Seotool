// Connections (Google Search Console) on Overview + import into agents. Uses $, esc, api from dashboard.js.
// Which live source feeds each agent kind.
const IMPORTS = {
  "click-loss": { source: "gsc", kind: "click-loss" }, cannibalization: { source: "gsc", kind: "cannibalization" },
  "landing-pages": { source: "ga4", kind: "landing-pages" }, "ai-referrals": { source: "ga4", kind: "ai-referrals" },
};
let gscStatus = null, gscSites = null, ga4Props = null;

const SOON = [["Google Ads", "#fbbc04", "Needs a Google Ads developer token"], ["Meta Ads", "#1877f2", "Needs a Meta app with ads_read"]];

async function loadConnections() {
  gscStatus = await api("/api/google/status");
  const g = gscStatus;
  const action = !g.configured
    ? `<small>Server setup needed: set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>SECRET_KEY</code> and <code>PUBLIC_URL</code>. Redirect URI to register in Google Cloud: <code>${esc(g.redirectUri)}</code></small>`
    : g.connected ? `<button class="btn ghost" id="gsc-disconnect">Disconnect</button>` : `<a class="btn" href="/api/google/connect">Connect Google</a>`;
  $("#conn-list").innerHTML = `<div class="conn"><div class="logo-g" style="background:#4285f4">G</div>
      <div class="info"><b>Google Search Console</b><small>${g.connected ? `Connected as ${esc(g.account || "your Google account")} · read-only` : "Clicks, impressions and positions for your pages and queries"}</small>${g.configured ? "" : action}</div>
      ${g.configured ? action : ""}</div>
    <div class="conn"><div class="logo-g" style="background:#e37400">A</div>
      <div class="info"><b>Google Analytics 4</b><small>${g.connected && g.ga4 ? "Connected · landing pages and AI-assistant referrals" : g.connected ? "Your Google connection predates GA4 access — disconnect and connect again to add it" : "Uses the same Google connection"}</small></div>
      ${g.connected && g.ga4 ? '<span class="badge">Connected</span>' : ""}</div>` +
    SOON.map(([n, c, why]) => `<div class="conn"><div class="logo-g" style="background:${c}">${n[0]}</div><div class="info"><b>${n}</b><small>${why}</small></div><span class="badge">Coming soon</span></div>`).join("");
  const d = $("#gsc-disconnect");
  if (d) d.onclick = async () => { if (confirm("Disconnect Google?")) { await api("/api/google", { method: "DELETE" }); gscSites = ga4Props = null; loadConnections(); } };
}

// Show the connect result once after returning from Google.
const params = new URLSearchParams(location.search);
if (params.has("connected") || params.has("connect_error")) {
  const ok = params.has("connected");
  document.querySelector("main").insertAdjacentHTML("afterbegin", `<div class="flash-msg ${ok ? "ok" : "err"}">${ok ? "Google Search Console connected ✓" : "Could not connect: " + esc(params.get("connect_error"))}</div>`);
  history.replaceState(null, "", location.pathname);
}

// Agent runner: offer a Search Console import for agents that can use it.
const baseOpenAgent = openAgent;
openAgent = async (a) => {
  baseOpenAgent(a);
  const box = $("#gsc-import");
  box.hidden = true;
  const imp = IMPORTS[a.kind];
  if (!imp || !gscStatus?.connected || (imp.source === "ga4" && !gscStatus.ga4)) return;
  try {
    let opts;
    if (imp.source === "gsc") opts = (gscSites ??= await api("/api/google/sites")).map((s) => [s, s]);
    else opts = (ga4Props ??= await api("/api/google/ga4/properties")).map((p) => [p.id, p.name]);
    if (!opts.length) return;
    $("#gsc-site").innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
    $("#gsc-btn").textContent = imp.source === "gsc" ? "Import from Search Console" : "Import from GA4";
    box.hidden = false;
  } catch {}
};
$("#gsc-btn").onclick = async () => {
  const btn = $("#gsc-btn"); btn.disabled = true; btn.textContent = "Importing…";
  const imp = IMPORTS[current.kind];
  try {
    const v = encodeURIComponent($("#gsc-site").value);
    const r = await api(imp.source === "gsc" ? `/api/google/report?site=${v}&kind=${imp.kind}` : `/api/google/ga4/report?property=${v}&kind=${imp.kind}`);
    $("#csv").value = r.csv;
    btn.textContent = `Imported ${r.rows} rows (${r.period})`;
  } catch (e) { btn.textContent = "Import"; alert(e.message); }
  finally { btn.disabled = false; }
};

(async () => { try { if ((await api("/api/me")).user) await loadConnections(); } catch {} })();
