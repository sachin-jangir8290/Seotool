// Built-in agents: deterministic analysis of a CSV export. Each returns { summary, rows, columns }.

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row");
  const split = (line) => {
    const out = []; let cur = ""; let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const head = split(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}

const num = (v) => Number(String(v ?? "").replace(/[$,%\s]/g, "")) || 0;
const need = (rows, cols) => {
  const missing = cols.filter((c) => !(c in rows[0]));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}`);
};

const ANALYZERS = {
  "click-loss": {
    label: "SEO click-loss detective",
    columns: "page, clicks_current, clicks_previous",
    sample: "page,clicks_current,clicks_previous\n/blog/a,120,410\n/blog/b,300,320\n/guide/c,40,190",
    run(rows) {
      need(rows, ["page", "clicks_current", "clicks_previous"]);
      const out = rows
        .map((r) => ({ page: r.page, now: num(r.clicks_current), before: num(r.clicks_previous) }))
        .map((r) => ({ ...r, lost: r.before - r.now, pct: r.before ? Math.round(((r.now - r.before) / r.before) * 100) : 0 }))
        .filter((r) => r.lost > 0).sort((a, b) => b.lost - a.lost).slice(0, 10)
        .map((r) => ({ ...r, fix: r.pct <= -50 ? "Refresh content" : r.pct <= -20 ? "Rewrite title & meta" : "Add internal links" }));
      const total = out.reduce((s, r) => s + r.lost, 0);
      return { summary: `${out.length} pages lost ${total} clicks. Biggest: ${out[0]?.page ?? "none"}.`, columns: ["page", "before", "now", "lost", "pct", "fix"], rows: out };
    },
  },
  "search-terms": {
    label: "Google Ads search term miner",
    columns: "search_term, cost, conversions",
    sample: "search_term,cost,conversions,clicks\nfree seo tool,54.20,0,61\nseo agency pricing,88.10,3,40\nseo jobs,23.50,0,30",
    run(rows, opts = {}) {
      need(rows, ["search_term", "cost", "conversions"]);
      const min = num(opts.minSpend) || 20;
      const out = rows
        .map((r) => ({ term: r.search_term, cost: num(r.cost), conversions: num(r.conversions), clicks: num(r.clicks) }))
        .filter((r) => r.conversions === 0 && r.cost >= min).sort((a, b) => b.cost - a.cost)
        .map((r) => ({ ...r, action: "Add as negative (phrase)" }));
      const waste = out.reduce((s, r) => s + r.cost, 0);
      return { summary: `${out.length} negative keywords proposed, saving ~$${waste.toFixed(2)} per period.`, columns: ["term", "cost", "clicks", "conversions", "action"], rows: out };
    },
  },
  "creative-fatigue": {
    label: "Meta Ads creative fatigue agent",
    columns: "ad_name, frequency, ctr_current, ctr_previous",
    sample: "ad_name,frequency,ctr_current,ctr_previous\nUGC video 1,4.2,0.8,1.6\nCarousel offer,1.9,1.4,1.3\nStatic promo,3.5,0.9,1.2",
    run(rows) {
      need(rows, ["ad_name", "frequency", "ctr_current", "ctr_previous"]);
      const out = rows
        .map((r) => ({ ad: r.ad_name, frequency: num(r.frequency), ctr_now: num(r.ctr_current), ctr_before: num(r.ctr_previous) }))
        .map((r) => ({ ...r, ctr_change: r.ctr_before ? Math.round(((r.ctr_now - r.ctr_before) / r.ctr_before) * 100) : 0 }))
        .filter((r) => r.frequency >= 3 && r.ctr_change <= -20).sort((a, b) => a.ctr_change - b.ctr_change)
        .map((r) => ({ ...r, action: "Refresh creative" }));
      return { summary: `${out.length} ads are fatigued (frequency ≥ 3 and CTR down ≥ 20%).`, columns: ["ad", "frequency", "ctr_before", "ctr_now", "ctr_change", "action"], rows: out };
    },
  },
  "budget-pacing": {
    label: "Budget guard",
    columns: "campaign, spend_to_date, monthly_budget",
    sample: "campaign,spend_to_date,monthly_budget\nBrand,900,1500\nGeneric,2100,2500\nPMax,400,2000",
    run(rows, opts = {}) {
      need(rows, ["campaign", "spend_to_date", "monthly_budget"]);
      const now = new Date();
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const elapsed = num(opts.dayOfMonth) || now.getDate();
      const out = rows.map((r) => {
        const spend = num(r.spend_to_date), budget = num(r.monthly_budget);
        const projected = Math.round((spend / elapsed) * days);
        const pace = budget ? Math.round((projected / budget) * 100) : 0;
        return { campaign: r.campaign, spend, budget, projected, pace, action: pace > 110 ? "Over-pacing: cut daily budget" : pace < 80 ? "Under-pacing: raise budget or bids" : "On track" };
      });
      const flagged = out.filter((r) => r.action !== "On track").length;
      return { summary: `${flagged} of ${out.length} campaigns off pace (day ${elapsed} of ${days}).`, columns: ["campaign", "spend", "budget", "projected", "pace", "action"], rows: out };
    },
  },
};

// Plugins: every .js file in /plugins (or PLUGINS_DIR) can add analyzers.
// A plugin exports { analyzers: { "kind": { label, columns, sample, run(rows, opts) } } }.
function loadPlugins(dir = process.env.PLUGINS_DIR || require("path").join(__dirname, "..", "plugins")) {
  const fs = require("fs"), path = require("path");
  if (!fs.existsSync(dir)) return [];
  const loaded = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort()) {
    try {
      const plugin = require(path.join(dir, file));
      for (const [kind, a] of Object.entries(plugin.analyzers || {})) {
        if (ANALYZERS[kind]) throw new Error(`analyzer "${kind}" already exists`);
        if (typeof a.run !== "function" || !a.label) throw new Error(`analyzer "${kind}" needs label and run()`);
        ANALYZERS[kind] = a;
        loaded.push(kind);
      }
    } catch (e) {
      console.warn(`Plugin ${file} skipped: ${e.message}`);
    }
  }
  return loaded;
}
// Export before loading so plugins can require these helpers.
module.exports = { ANALYZERS, parseCSV, num, need, loadPlugins };
loadPlugins();
