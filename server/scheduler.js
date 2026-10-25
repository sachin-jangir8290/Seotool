// Scheduled runs + alerts. A timer checks every minute for due schedules, runs them,
// stores the result like a manual run, and raises an alert when the score drops.
const db = require("./db");
const audit = require("./audit");
const blitz = require("./blitz");
const citations = require("./citations");
const engines = require("./engines");

db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, type TEXT NOT NULL, config TEXT NOT NULL, cadence TEXT NOT NULL,
    threshold INTEGER DEFAULT 5, email TEXT, webhook TEXT, enabled INTEGER DEFAULT 1,
    next_run_at INTEGER NOT NULL, last_run_at INTEGER, last_score INTEGER, last_error TEXT, running INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS schedule_results (
    id INTEGER PRIMARY KEY, schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    score INTEGER, detail TEXT, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL, level TEXT NOT NULL, message TEXT NOT NULL,
    read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

const CADENCE_MS = { hourly: 36e5, daily: 864e5, weekly: 7 * 864e5, monthly: 30 * 864e5 };
const TYPES = ["seo", "geo", "blitz", "citations"];

// Each job returns { score (0-100), detail } and saves its run where the manual feature would.
const JOBS = {
  async seo(s, cfg) {
    const out = await audit.seoAudit(cfg.url);
    db.prepare("INSERT INTO audits (user_id, type, url, score, result) VALUES (?, 'seo', ?, ?, ?)").run(s.user_id, out.url, out.score, JSON.stringify(out));
    const failed = out.checks.filter((c) => c.status === "fail").map((c) => c.name);
    return { score: out.score, detail: failed.length ? `Failing: ${failed.join(", ")}` : "All checks pass or warn" };
  },
  async geo(s, cfg) {
    const out = await audit.geoAudit(cfg.url);
    db.prepare("INSERT INTO audits (user_id, type, url, score, result) VALUES (?, 'geo', ?, ?, ?)").run(s.user_id, out.url, out.score, JSON.stringify(out));
    const blocked = out.bots.filter((b) => !b.allowed).map((b) => b.bot);
    return { score: out.score, detail: blocked.length ? `Blocked AI bots: ${blocked.join(", ")}` : "All AI bots allowed" };
  },
  async blitz(s, cfg) {
    const pages = await blitz.crawl(cfg.url, Math.min(cfg.limit || 25, 100));
    if (!pages.length) throw new Error("No pages could be read");
    const cites = pages.map(blitz.citability);
    const changes = pages.flatMap(blitz.judgeElements).filter((e) => e.verdict === "Change").length;
    const avg = Math.round(cites.reduce((a, c) => a + c.chance, 0) / cites.length);
    return { score: avg, detail: `${pages.length} pages · ${changes} elements to change · avg AI-citation chance ${avg}%` };
  },
  async citations(s, cfg) {
    const enabled = engines.available().filter((e) => e.enabled).map((e) => e.id);
    const chosen = (cfg.engines?.length ? cfg.engines : enabled).filter((e) => enabled.includes(e));
    if (!chosen.length) throw new Error("No AI engine API key configured");
    const out = await citations.track({ brand: cfg.brand, competitors: cfg.competitors || [], questions: cfg.questions, engines: chosen });
    db.prepare("INSERT INTO citation_runs (user_id, brand, config, summary, rows) VALUES (?, ?, ?, ?, ?)")
      .run(s.user_id, cfg.brand.name, JSON.stringify({ ...cfg, engines: chosen }), JSON.stringify(out.summary), JSON.stringify(out.rows));
    const ok = out.summary.filter((e) => e.asked);
    const score = ok.length ? Math.round(ok.reduce((a, e) => a + e.rate, 0) / ok.length) : 0;
    return { score, detail: out.summary.map((e) => `${e.engine} ${e.rate}%`).join(" · ") };
  },
};

// ---------- notifications ----------
async function sendWebhook(url, text) {
  await audit.checkUrl(url);
  // "text" works for Slack and Mattermost, "content" for Discord.
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
}
let transport;
async function sendEmail(to, subject, text) {
  if (!process.env.SMTP_URL) return;
  transport ??= require("nodemailer").createTransport(process.env.SMTP_URL);
  await transport.sendMail({ from: process.env.SMTP_FROM || "SEOTool <alerts@localhost>", to, subject, text });
}

async function notify(s, level, message) {
  db.prepare("INSERT INTO alerts (user_id, schedule_id, level, message) VALUES (?, ?, ?, ?)").run(s.user_id, s.id, level, message);
  const text = `[SEOTool] ${s.name}: ${message}`;
  const jobs = [];
  if (s.webhook) jobs.push(sendWebhook(s.webhook, text));
  if (s.email) jobs.push(sendEmail(s.email, `SEOTool alert: ${s.name}`, text));
  for (const r of await Promise.allSettled(jobs)) if (r.status === "rejected") console.warn(`Alert delivery failed: ${r.reason.message}`);
}

// ---------- running ----------
async function runSchedule(id) {
  // Claim the row so two ticks (or a tick and "Run now") never run it twice.
  const claimed = db.prepare("UPDATE schedules SET running = 1 WHERE id = ? AND running = 0").run(id);
  if (!claimed.changes) return { skipped: true };
  const s = db.prepare("SELECT * FROM schedules WHERE id = ?").get(id);
  const now = Date.now();
  try {
    const { score, detail } = await JOBS[s.type](s, JSON.parse(s.config));
    db.prepare("INSERT INTO schedule_results (schedule_id, score, detail) VALUES (?, ?, ?)").run(id, score, detail);
    db.prepare("UPDATE schedules SET last_score = ?, last_error = NULL, last_run_at = ? WHERE id = ?").run(score, now, id);
    if (s.last_score != null && s.last_score - score >= s.threshold) {
      await notify(s, "drop", `score dropped ${s.last_score} → ${score} (−${s.last_score - score}). ${detail}`);
    } else if (s.last_score != null && score - s.last_score >= s.threshold) {
      await notify(s, "rise", `score improved ${s.last_score} → ${score} (+${score - s.last_score}).`);
    }
    return { score, detail };
  } catch (e) {
    db.prepare("INSERT INTO schedule_results (schedule_id, error) VALUES (?, ?)").run(id, e.message);
    db.prepare("UPDATE schedules SET last_error = ?, last_run_at = ? WHERE id = ?").run(e.message, now, id);
    await notify(s, "error", `run failed: ${e.message}`);
    return { error: e.message };
  } finally {
    db.prepare("UPDATE schedules SET running = 0, next_run_at = ? WHERE id = ?").run(now + CADENCE_MS[s.cadence], id);
  }
}

async function tick() {
  const due = db.prepare("SELECT id FROM schedules WHERE enabled = 1 AND running = 0 AND next_run_at <= ? ORDER BY next_run_at LIMIT 5").all(Date.now());
  for (const { id } of due) await runSchedule(id);
  return due.length;
}

let timer;
function start(intervalMs = Number(process.env.SCHEDULER_INTERVAL_MS) || 60000) {
  db.prepare("UPDATE schedules SET running = 0").run(); // clear claims left by a crash
  timer = setInterval(() => tick().catch((e) => console.warn("Scheduler:", e.message)), intervalMs);
  timer.unref();
}
const stop = () => clearInterval(timer);

module.exports = { TYPES, CADENCE_MS, runSchedule, tick, start, stop, notify };
