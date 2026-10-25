// Connections (Google Search Console) on Overview + import into agents. Uses $, esc, api from dashboard.js.
const GSC_KINDS = { "click-loss": "click-loss", cannibalization: "cannibalization" };
let gscStatus = null, gscSites = null;

const SOON = [["Google Ads", "#fbbc04", "Needs a Google Ads developer token"], ["Meta Ads", "#1877f2", "Needs a Meta app with ads_read"], ["GA4", "#e37400", "Coming next"]];

async function loadConnections() {
  gscStatus = await api("/api/google/status");
  const g = gscStatus;
  const action = !g.configured
    ? `<small>Server setup needed: set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>SECRET_KEY</code> and <code>PUBLIC_URL</code>. Redirect URI to register in Google Cloud: <code>${esc(g.redirectUri)}</code></small>`
    : g.connected ? `<button class="btn ghost" id="gsc-disconnect">Disconnect</button>` : `<a class="btn" href="/api/google/connect">Connect Google</a>`;
  $("#conn-list").innerHTML = `<div class="conn"><div class="logo-g" style="background:#4285f4">G</div>
      <div class="info"><b>Google Search Console</b><small>${g.connected ? `Connected as ${esc(g.account || "your Google account")} · read-only` : "Clicks, impressions and positions for your pages and queries"}</small>${g.configured ? "" : action}</div>
      ${g.configured ? action : ""}</div>` +
    SOON.map(([n, c, why]) => `<div class="conn"><div class="logo-g" style="background:${c}">${n[0]}</div><div class="info"><b>${n}</b><small>${why}</small></div><span class="badge">Coming soon</span></div>`).join("");
  const d = $("#gsc-disconnect");
  if (d) d.onclick = async () => { if (confirm("Disconnect Google?")) { await api("/api/google", { method: "DELETE" }); gscSites = null; loadConnections(); } };
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
  if (!GSC_KINDS[a.kind] || !gscStatus?.connected) return;
  try {
    gscSites ??= await api("/api/google/sites");
    if (!gscSites.length) return;
    $("#gsc-site").innerHTML = gscSites.map((s) => `<option>${esc(s)}</option>`).join("");
    box.hidden = false;
  } catch {}
};
$("#gsc-btn").onclick = async () => {
  const btn = $("#gsc-btn"); btn.disabled = true; btn.textContent = "Importing…";
  try {
    const r = await api(`/api/google/report?site=${encodeURIComponent($("#gsc-site").value)}&kind=${GSC_KINDS[current.kind]}`);
    $("#csv").value = r.csv;
    btn.textContent = `Imported ${r.rows} rows (${r.period})`;
  } catch (e) { btn.textContent = "Import from Search Console"; alert(e.message); }
  finally { btn.disabled = false; }
};

(async () => { try { if ((await api("/api/me")).user) await loadConnections(); } catch {} })();
