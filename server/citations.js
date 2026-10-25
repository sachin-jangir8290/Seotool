// Citation tracking: ask each AI engine the buyer questions and judge every answer —
// is the brand named, at what position, with what sentiment, is the site cited, who is named instead.
const { ENGINES } = require("./engines");

const POS = /\b(best|great|excellent|recommend(ed)?|top|trusted|reliable|popular|favou?rite|high[- ]quality|leading|love[ds]?)\b/gi;
const NEG = /\b(avoid|bad|poor|worse|worst|complaints?|scam|expensive|overpriced|issues?|problems?|not recommended|unreliable)\b/gi;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

function names(entity) {
  return [entity.name, ...(entity.aliases || []), entity.domain].filter(Boolean).map((s) => s.trim()).filter((s) => s.length > 1);
}
function firstIndex(text, entity) {
  let best = -1;
  for (const n of names(entity)) {
    const m = new RegExp(`(^|[^a-z0-9])${esc(n)}($|[^a-z0-9])`, "i").exec(text);
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

function judgeAnswer(answer, brand, competitors) {
  const text = answer.text || "";
  const domains = (answer.sources || []).map(host);
  const all = [{ ...brand, isBrand: true }, ...competitors].map((e) => ({ ...e, at: firstIndex(text, e), cited: e.domain ? domains.some((d) => d === e.domain || d.endsWith("." + e.domain)) : false }));
  const named = all.filter((e) => e.at >= 0 || e.cited).sort((a, b) => (a.at < 0 ? 1e9 : a.at) - (b.at < 0 ? 1e9 : b.at));
  const me = all[0];
  const mentioned = me.at >= 0 || me.cited;
  let sentiment = null;
  if (me.at >= 0) {
    const around = text.slice(Math.max(0, me.at - 200), me.at + 300);
    const p = (around.match(POS) || []).length, n = (around.match(NEG) || []).length;
    sentiment = Math.round(Math.max(0, Math.min(1, 0.6 + 0.1 * p - 0.15 * n)) * 100);
  }
  return {
    mentioned, cited: me.cited,
    position: mentioned ? named.findIndex((e) => e.isBrand) + 1 : null,
    sentiment,
    namedInstead: named.filter((e) => !e.isBrand).map((e) => e.name),
    sources: [...new Set(domains)].slice(0, 10),
  };
}

function summarize(rows) {
  const byEngine = {};
  for (const r of rows) {
    const s = (byEngine[r.engine] ||= { engine: r.engine, asked: 0, named: 0, cited: 0, errors: 0, positions: [], sentiments: [], instead: {} });
    if (r.error) { s.errors++; continue; }
    s.asked++;
    if (r.mentioned) { s.named++; s.positions.push(r.position); if (r.sentiment != null) s.sentiments.push(r.sentiment); }
    if (r.cited) s.cited++;
    for (const c of r.namedInstead) s.instead[c] = (s.instead[c] || 0) + 1;
  }
  const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
  return Object.values(byEngine).map((s) => {
    const [top] = Object.entries(s.instead).sort((a, b) => b[1] - a[1]);
    return {
      engine: s.engine, asked: s.asked, named: s.named, skipped: s.asked - s.named, cited: s.cited, errors: s.errors,
      rate: s.asked ? Math.round((s.named / s.asked) * 100) : 0,
      avgPosition: avg(s.positions), sentiment: avg(s.sentiments),
      citedInstead: top ? { name: top[0], share: Math.round((top[1] / Math.max(1, s.asked)) * 100) } : null,
    };
  });
}

// Runs every (engine, question) pair with limited concurrency, calling onRow as each answer lands.
async function track({ brand, competitors, questions, engines }, onRow, concurrency = 4) {
  const jobs = engines.flatMap((engine) => questions.map((question) => ({ engine, question })));
  const rows = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { engine, question } = jobs[next++];
      const t0 = Date.now();
      let row;
      try {
        const answer = await ENGINES[engine].ask(question);
        row = { engine, question, ms: Date.now() - t0, answer: answer.text.slice(0, 4000), ...judgeAnswer(answer, brand, competitors) };
      } catch (e) {
        row = { engine, question, ms: Date.now() - t0, error: e.message, namedInstead: [] };
      }
      rows.push(row);
      onRow?.(row);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return { rows, summary: summarize(rows) };
}

module.exports = { judgeAnswer, summarize, track };
