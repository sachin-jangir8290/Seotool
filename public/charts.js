// Overview charts (Chart.js) + page title for the sidebar layout. Uses $, api, showTab from dashboard.js.
const VIZ = {
  s1: "#2a78d6", s2: "#eb6834",                              // categorical slots 1-2 (validated reference palette)
  good: "#0ca30c", critical: "#d03b3b", neutral: "#b9b8b0",  // status colours, always paired with labels
  ink: "#0b0b0b", muted: "#52514e", grid: "#ecebe6",
};
const charts = {};

if (window.Chart) {
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = VIZ.muted;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.tooltip.backgroundColor = "#0b0b0b";
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.maintainAspectRatio = false;
}

const axis = (extra = {}) => ({ grid: { color: VIZ.grid, drawTicks: false }, border: { display: false }, ticks: { padding: 6 }, ...extra });
const shortDate = (d) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

function draw(id, config) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  charts[id]?.destroy();
  charts[id] = new Chart(el, config);
}
// An empty chart says so instead of drawing an empty frame.
function emptyNote(id, text) {
  const box = document.getElementById(id)?.parentElement;
  if (!box) return;
  box.querySelector(".empty")?.remove();
  if (text) box.insertAdjacentHTML("beforeend", `<div class="empty">${text}</div>`);
}

async function loadCharts() {
  const d = await api("/api/overview/charts");

  const hasScores = d.scores.seo.some((v) => v != null) || d.scores.geo.some((v) => v != null);
  draw("ch-scores", {
    type: "line",
    data: { labels: d.scores.labels.map(shortDate), datasets: [
      { label: "SEO score", data: d.scores.seo, borderColor: VIZ.s1, backgroundColor: VIZ.s1, borderWidth: 2, pointRadius: 4, spanGaps: true, tension: 0.3 },
      { label: "AI visibility", data: d.scores.geo, borderColor: VIZ.s2, backgroundColor: VIZ.s2, borderWidth: 2, pointRadius: 4, spanGaps: true, tension: 0.3 },
    ] },
    options: { interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "top", align: "start" } },
      scales: { y: axis({ min: 0, max: 100, ticks: { stepSize: 25 } }), x: axis({ grid: { display: false }, ticks: { maxTicksLimit: 8 } }) } },
  });
  emptyNote("ch-scores", hasScores ? "" : "Run an SEO audit or AI visibility check to start this chart.");

  const ap = d.approvals, apTotal = ap.approved + ap.rejected + ap.pending;
  draw("ch-approvals", {
    type: "doughnut",
    data: { labels: ["Approved", "Pending", "Rejected"], datasets: [{ data: [ap.approved, ap.pending, ap.rejected], backgroundColor: [VIZ.good, VIZ.neutral, VIZ.critical], borderColor: "#fff", borderWidth: 2 }] },
    options: { cutout: "68%", plugins: { legend: { position: "bottom" } } },
  });
  emptyNote("ch-approvals", apTotal ? "" : "No agent runs yet.");

  draw("ch-runs", {
    type: "bar",
    data: { labels: d.runs.labels.map(shortDate), datasets: [{ label: "Runs", data: d.runs.values, backgroundColor: VIZ.s1, borderRadius: 4, borderSkipped: "start", maxBarThickness: 22 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: axis({ beginAtZero: true, ticks: { precision: 0 } }), x: axis({ grid: { display: false }, ticks: { maxTicksLimit: 7 } }) } },
  });
  emptyNote("ch-runs", d.runs.values.some(Boolean) ? "" : "No runs in the last 14 days.");

  const engineName = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini", perplexity: "Perplexity" };
  draw("ch-cite", {
    type: "bar",
    data: { labels: d.citations.map((c) => engineName[c.engine] || c.engine), datasets: [{ label: "Citation rate %", data: d.citations.map((c) => c.rate), backgroundColor: VIZ.s1, borderRadius: 4, borderSkipped: "start", maxBarThickness: 36 }] },
    options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.raw}% of answers name you` } } },
      scales: { x: axis({ min: 0, max: 100, ticks: { callback: (v) => v + "%" } }), y: axis({ grid: { display: false } }) } },
  });
  emptyNote("ch-cite", d.citations.length ? "" : "Run AI citation tracking to see how often AI assistants name you.");

  const rk = Object.entries(d.ranks);
  draw("ch-ranks", {
    type: "bar",
    data: { labels: rk.map(([k]) => k), datasets: [{ label: "Keywords", data: rk.map(([, v]) => v), backgroundColor: VIZ.s1, borderRadius: 4, borderSkipped: "start", maxBarThickness: 36 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: axis({ beginAtZero: true, ticks: { precision: 0 } }), x: axis({ grid: { display: false } }) } },
  });
  emptyNote("ch-ranks", rk.some(([, v]) => v) ? "" : "Track keywords on the Keywords tab to fill this chart.");
}

// Sidebar layout: keep the top-bar title in sync with the open section.
const PAGE_SUB = {
  overview: "Your SEO, AI search and ads performance at a glance.", agents: "Create agents, feed them data, approve what they propose.",
  seo: "On-page SEO checks for any URL.", geo: "Can AI assistants read and quote your site?", blitz: "Thousands of judgments per second across your site.",
  cite: "How often ChatGPT, Claude, Gemini and Perplexity name you.", rewrite: "Ready-to-paste fixes for every Change verdict.",
  kw: "Keyword opportunities and rank tracking.", sched: "Automatic runs and alerts.", chat: "Ask about your campaigns, audits and results.",
};
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  $("#page-title").textContent = b.textContent.replace(/\d+$/, "").trim();
  $("#page-sub").textContent = PAGE_SUB[b.dataset.tab] || "";
  if (b.dataset.tab === "overview") loadCharts().catch(() => {});
  document.body.classList.remove("side-open");
});
document.querySelector(".side-toggle")?.addEventListener("click", () => document.body.classList.toggle("side-open"));

(async () => { try { if ((await api("/api/me")).user) await loadCharts(); } catch {} })();
