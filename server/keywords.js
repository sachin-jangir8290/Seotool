// Keyword opportunities + rank tracking, built on Search Console query data.
const db = require("./db");
const google = require("./google");

db.exec(`
  CREATE TABLE IF NOT EXISTS tracked_keywords (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, site TEXT NOT NULL, keyword TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, site, keyword));
  CREATE TABLE IF NOT EXISTS rank_snapshots (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, site TEXT NOT NULL, date TEXT NOT NULL,
    keyword TEXT NOT NULL, position REAL, clicks INTEGER, impressions INTEGER, page TEXT,
    PRIMARY KEY (user_id, site, date, keyword));
`);

// Typical organic CTR by position (rounded industry averages); used to spot titles that under-perform.
const EXPECTED_CTR = [0, 0.28, 0.16, 0.11, 0.08, 0.06, 0.045, 0.035, 0.03, 0.025, 0.02];
const expectedCtr = (pos) => EXPECTED_CTR[Math.min(10, Math.max(1, Math.round(pos)))] * (pos > 10 ? 0.5 : 1);
const path = (u) => { try { return new URL(u).pathname; } catch { return u; } };

// rows: [{ query, page, clicks, impressions, position }]
function opportunities(rows, { minImpressions = 50 } = {}) {
  const byQuery = new Map();
  for (const r of rows) {
    const q = byQuery.get(r.query);
    if (!q || r.impressions > q.impressions) byQuery.set(r.query, { ...r, pages: (q?.pages || 0) + 1 });
    else q.pages++;
  }
  const out = [];
  for (const r of byQuery.values()) {
    if (r.impressions < minImpressions) continue;
    const ctr = r.clicks / Math.max(1, r.impressions), exp = expectedCtr(r.position);
    let type = null, action = "", gain = 0;
    if (r.position > 10 && r.position <= 20) {
      type = "Striking distance"; action = "Page 2 → page 1: add a section answering this query, internal links from strong pages";
      gain = Math.round(r.impressions * expectedCtr(8) - r.clicks);
    } else if (r.position <= 10 && ctr < exp * 0.6) {
      type = "Low CTR"; action = "Rewrite title & meta to match the query and promise a clear answer";
      gain = Math.round(r.impressions * exp - r.clicks);
    } else if (r.position > 4 && r.position <= 10) {
      type = "Top 3 push"; action = "Strengthen the page: answer-first intro, FAQ, fresher data, more internal links";
      gain = Math.round(r.impressions * expectedCtr(3) - r.clicks);
    }
    if (r.pages > 1 && type) action += ` · ${r.pages} pages compete for it — consolidate`;
    if (type && gain > 0) out.push({ query: r.query, page: path(r.page), position: Math.round(r.position * 10) / 10, impressions: r.impressions, clicks: r.clicks, ctr: `${(ctr * 100).toFixed(1)}%`, type, gain, action });
  }
  return out.sort((a, b) => b.gain - a.gain);
}

async function fetchQueryRows(userId, site, days = 28) {
  const d = await google.searchAnalytics(userId, site, { startDate: google.day(days + 2), endDate: google.day(3), dimensions: ["query", "page"], rowLimit: 25000 });
  return (d.rows || []).map((r) => ({ query: r.keys[0], page: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position }));
}

function track(userId, site, keywords) {
  const ins = db.prepare("INSERT OR IGNORE INTO tracked_keywords (user_id, site, keyword) VALUES (?, ?, ?)");
  const clean = [...new Set(keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, 500);
  for (const k of clean) ins.run(userId, site, k);
  return clean.length;
}
const untrack = (userId, site, keyword) => db.prepare("DELETE FROM tracked_keywords WHERE user_id = ? AND site = ? AND keyword = ?").run(userId, site, keyword);

// Stores one snapshot per tracked keyword (last 7 days, as Search Console reports it).
async function snapshot(userId, site) {
  const kws = db.prepare("SELECT keyword FROM tracked_keywords WHERE user_id = ? AND site = ?").all(userId, site).map((r) => r.keyword);
  if (!kws.length) throw new Error("Track some keywords first");
  const d = await google.searchAnalytics(userId, site, { startDate: google.day(9), endDate: google.day(3), dimensions: ["query", "page"], rowLimit: 25000 });
  const best = new Map();
  for (const r of d.rows || []) {
    const q = r.keys[0].toLowerCase();
    const cur = best.get(q);
    if (!cur) best.set(q, { position: r.position, clicks: r.clicks, impressions: r.impressions, page: path(r.keys[1]) });
    else { cur.clicks += r.clicks; cur.impressions += r.impressions; if (r.position < cur.position) { cur.position = r.position; cur.page = path(r.keys[1]); } }
  }
  const date = new Date().toISOString().slice(0, 10);
  const up = db.prepare(`INSERT INTO rank_snapshots (user_id, site, date, keyword, position, clicks, impressions, page) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, site, date, keyword) DO UPDATE SET position = excluded.position, clicks = excluded.clicks, impressions = excluded.impressions, page = excluded.page`);
  let found = 0;
  for (const k of kws) {
    const b = best.get(k);
    if (b) found++;
    up.run(userId, site, date, k, b ? Math.round(b.position * 10) / 10 : null, b?.clicks || 0, b?.impressions || 0, b?.page || null);
  }
  const top10 = kws.filter((k) => best.get(k)?.position <= 10).length;
  return { date, tracked: kws.length, found, top10, score: Math.round((top10 / kws.length) * 100) };
}

function history(userId, site) {
  const kws = db.prepare("SELECT keyword FROM tracked_keywords WHERE user_id = ? AND site = ? ORDER BY keyword").all(userId, site);
  const snap = db.prepare("SELECT date, position, clicks, impressions, page FROM rank_snapshots WHERE user_id = ? AND site = ? AND keyword = ? ORDER BY date DESC LIMIT 30");
  return kws.map(({ keyword }) => {
    const s = snap.all(userId, site, keyword).reverse();
    const last = s.at(-1), prev = s.at(-2);
    const change = last?.position != null && prev?.position != null ? Math.round((prev.position - last.position) * 10) / 10 : null;
    return { keyword, position: last?.position ?? null, change, clicks: last?.clicks ?? null, page: last?.page ?? null, series: s.map((x) => ({ date: x.date, position: x.position })) };
  });
}

module.exports = { opportunities, fetchQueryRows, track, untrack, snapshot, history, expectedCtr };
