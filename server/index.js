const express = require("express");
const crypto = require("crypto");
const path = require("path");
const db = require("./db");
const { ANALYZERS, parseCSV } = require("./analyzers");
const ai = require("./ai");
const audit = require("./audit");
const blitz = require("./blitz");
const engines = require("./engines");
const citations = require("./citations");
const scheduler = require("./scheduler");

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// ---- auth helpers ----
const hash = (pw, salt = crypto.randomBytes(16).toString("hex")) =>
  `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
const verify = (pw, stored) => {
  const [salt, h] = stored.split(":");
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), crypto.scryptSync(pw, salt, 64));
};
const SESSION_DAYS = 30;
const cookieOf = (req) => Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")));

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, Date.now() + SESSION_DAYS * 864e5);
  res.cookie("sid", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: SESSION_DAYS * 864e5 });
}

app.use((req, _res, next) => {
  const sid = cookieOf(req).sid;
  if (sid) {
    req.user = db.prepare(
      "SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?"
    ).get(sid, Date.now());
  }
  next();
});
const auth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: "Login required" }));
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ error: e.message }));

// ---- auth routes ----
app.post("/api/signup", wrap((req, res) => {
  const { email, password, name } = req.body || {};
  if (!/^\S+@\S+\.\S+$/.test(email || "")) throw new Error("Valid email required");
  if ((password || "").length < 8) throw new Error("Password must be at least 8 characters");
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email.toLowerCase())) throw new Error("Email already registered");
  const { lastInsertRowid } = db.prepare("INSERT INTO users (email, name, pass_hash) VALUES (?, ?, ?)").run(email.toLowerCase(), name || "", hash(password));
  startSession(res, Number(lastInsertRowid));
  res.json({ ok: true });
}));

app.post("/api/login", wrap((req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email || "").toLowerCase());
  if (!u || !verify(password || "", u.pass_hash)) return res.status(401).json({ error: "Wrong email or password" });
  startSession(res, u.id);
  res.json({ ok: true });
}));

app.post("/api/logout", (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(cookieOf(req).sid || "");
  res.clearCookie("sid").json({ ok: true });
});

app.get("/api/me", (req, res) => res.json({ user: req.user || null, aiEnabled: ai.enabled() }));

// ---- checklist progress ----
app.get("/api/progress", auth, (req, res) => {
  const rows = db.prepare("SELECT list, state FROM progress WHERE user_id = ?").all(req.user.id);
  res.json(Object.fromEntries(rows.map((r) => [r.list, JSON.parse(r.state)])));
});
app.put("/api/progress/:list", auth, (req, res) => {
  db.prepare("INSERT INTO progress (user_id, list, state) VALUES (?, ?, ?) ON CONFLICT(user_id, list) DO UPDATE SET state = excluded.state")
    .run(req.user.id, req.params.list, JSON.stringify(req.body || {}));
  res.json({ ok: true });
});

// ---- agents ----
app.get("/api/analyzers", (_req, res) =>
  res.json(Object.entries(ANALYZERS).map(([kind, a]) => ({ kind, label: a.label, columns: a.columns, sample: a.sample }))));

const ownAgent = (req) => {
  const a = db.prepare("SELECT * FROM agents WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!a) throw new Error("Agent not found");
  return a;
};

app.get("/api/agents", auth, (req, res) => {
  res.json(db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM runs r WHERE r.agent_id = a.id) AS run_count
    FROM agents a WHERE user_id = ? ORDER BY id DESC`).all(req.user.id));
});

app.post("/api/agents", auth, wrap((req, res) => {
  const { name, kind, channel, role, rules, cadence } = req.body || {};
  if (!name) throw new Error("Name required");
  if (kind !== "ai" && !ANALYZERS[kind]) throw new Error("Unknown agent kind");
  const { lastInsertRowid } = db.prepare("INSERT INTO agents (user_id, name, kind, channel, role, rules, cadence) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(req.user.id, name, kind, channel || "", role || "", rules || "", cadence || "Weekly");
  res.json({ id: Number(lastInsertRowid) });
}));

app.delete("/api/agents/:id", auth, wrap((req, res) => {
  ownAgent(req);
  db.prepare("DELETE FROM agents WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

app.post("/api/agents/:id/run", auth, wrap(async (req, res) => {
  const agent = ownAgent(req);
  const csv = String(req.body?.csv || "");
  if (!csv.trim()) throw new Error("Paste or upload data first");
  let summary, result;
  if (agent.kind === "ai") {
    const out = await ai.runAI(agent, csv);
    summary = out.summary; result = { text: out.text };
  } else {
    const out = ANALYZERS[agent.kind].run(parseCSV(csv), req.body.options || {});
    summary = out.summary; result = out;
  }
  const { lastInsertRowid } = db.prepare("INSERT INTO runs (agent_id, status, summary, result) VALUES (?, 'done', ?, ?)")
    .run(agent.id, summary, JSON.stringify(result));
  res.json({ id: Number(lastInsertRowid), summary, result });
}));

app.get("/api/agents/:id/runs", auth, wrap((req, res) => {
  ownAgent(req);
  const rows = db.prepare("SELECT * FROM runs WHERE agent_id = ? ORDER BY id DESC LIMIT 50").all(req.params.id);
  res.json(rows.map((r) => ({ ...r, result: JSON.parse(r.result || "{}") })));
}));

// Approval queue: proposed changes are only "applied" once a human approves them.
app.post("/api/runs/:id/approve", auth, wrap((req, res) => {
  const run = db.prepare("SELECT r.id FROM runs r JOIN agents a ON a.id = r.agent_id WHERE r.id = ? AND a.user_id = ?").get(req.params.id, req.user.id);
  if (!run) throw new Error("Run not found");
  db.prepare("UPDATE runs SET approved = ? WHERE id = ?").run(req.body?.approved === false ? -1 : 1, run.id);
  res.json({ ok: true });
}));

// ---- site audits (SEO + AI search readiness) ----
app.post("/api/audits", auth, wrap(async (req, res) => {
  const { url, type } = req.body || {};
  if (!["seo", "geo"].includes(type)) throw new Error("type must be seo or geo");
  const out = await (type === "seo" ? audit.seoAudit : audit.geoAudit)(String(url || ""));
  const { lastInsertRowid } = db.prepare("INSERT INTO audits (user_id, type, url, score, result) VALUES (?, ?, ?, ?, ?)")
    .run(req.user.id, type, out.url, out.score, JSON.stringify(out));
  res.json({ id: Number(lastInsertRowid), ...out });
}));

app.get("/api/audits", auth, (req, res) => {
  const rows = db.prepare("SELECT id, type, url, score, created_at FROM audits WHERE user_id = ? ORDER BY id DESC LIMIT 50").all(req.user.id);
  res.json(rows);
});

app.get("/api/audits/:id", auth, wrap((req, res) => {
  const a = db.prepare("SELECT * FROM audits WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!a) throw new Error("Audit not found");
  res.json({ ...a, result: JSON.parse(a.result) });
}));

// ---- overview stats for the dashboard home ----
app.get("/api/overview", auth, (req, res) => {
  const one = (sql) => db.prepare(sql).get(req.user.id);
  res.json({
    agents: one("SELECT COUNT(*) n FROM agents WHERE user_id = ?").n,
    runs: one("SELECT COUNT(*) n FROM runs r JOIN agents a ON a.id = r.agent_id WHERE a.user_id = ?").n,
    pending: one("SELECT COUNT(*) n FROM runs r JOIN agents a ON a.id = r.agent_id WHERE a.user_id = ? AND r.approved = 0").n,
    lastSeo: one("SELECT score, url FROM audits WHERE user_id = ? AND type = 'seo' ORDER BY id DESC LIMIT 1") || null,
    lastGeo: one("SELECT score, url FROM audits WHERE user_id = ? AND type = 'geo' ORDER BY id DESC LIMIT 1") || null,
  });
});

// ---- CSV export of a run ----
app.get("/api/runs/:id/export.csv", auth, wrap((req, res) => {
  const run = db.prepare("SELECT r.* FROM runs r JOIN agents a ON a.id = r.agent_id WHERE r.id = ? AND a.user_id = ?").get(req.params.id, req.user.id);
  if (!run) throw new Error("Run not found");
  const r = JSON.parse(run.result || "{}");
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = r.rows ? [r.columns.map(cell).join(","), ...r.rows.map((row) => r.columns.map((c) => cell(row[c])).join(","))].join("\n") : cell(r.text);
  res.type("text/csv").attachment(`run-${run.id}.csv`).send(csv);
}));

// ---- AI assistant chat ----
app.post("/api/chat", auth, wrap(async (req, res) => {
  const history = (req.body?.messages || []).filter((m) => ["user", "assistant"].includes(m.role) && m.content).slice(-20);
  if (!history.length || history.at(-1).role !== "user") throw new Error("Send a message");
  const runs = db.prepare(`SELECT a.name, r.summary, r.created_at FROM runs r JOIN agents a ON a.id = r.agent_id
    WHERE a.user_id = ? ORDER BY r.id DESC LIMIT 10`).all(req.user.id);
  const audits = db.prepare("SELECT type, url, score, created_at FROM audits WHERE user_id = ? ORDER BY id DESC LIMIT 5").all(req.user.id);
  const context = [...runs.map((r) => `Run ${r.created_at} — ${r.name}: ${r.summary}`), ...audits.map((a) => `${a.type.toUpperCase()} audit ${a.created_at} — ${a.url}: ${a.score}/100`)].join("\n");
  res.json({ reply: await ai.chat(history, context) });
}));

// ---- Blitz: fast rules-engine judgments, streamed as NDJSON so the UI fills live ----
app.post("/api/blitz/site", auth, async (req, res) => {
  const { url, competitors = [], questions = "", limit = 25 } = req.body || {};
  res.type("application/x-ndjson");
  const t0 = Date.now();
  const stat = { pages: 0, judgments: 0 };
  const send = (o) => res.write(JSON.stringify(o) + "\n");
  const tick = () => send({ type: "stat", ...stat, elapsed: (Date.now() - t0) / 1000 });
  try {
    const max = Math.min(Number(limit) || 25, 100);
    const ours = await blitz.crawl(String(url || ""), max, (page) => {
      stat.pages++;
      const els = blitz.judgeElements(page);
      stat.judgments += els.length + 8;
      send({ type: "elements", rows: els });
      send({ type: "cite", row: blitz.citability(page) });
      tick();
    });
    if (!ours.length) throw new Error("Could not read any pages from that site");
    const qs = String(questions).split(/\r?\n/).map((q) => q.trim()).filter(Boolean).slice(0, 500);
    if (qs.length) {
      stat.judgments += qs.length * ours.length;
      send({ type: "coverage", rows: blitz.coverage(qs, ours) });
      tick();
    }
    for (const c of [].concat(competitors).map(String).filter(Boolean).slice(0, 5)) {
      try {
        const theirs = await blitz.crawl(c, Math.min(max, 15), () => { stat.pages++; });
        stat.judgments += theirs.length * 6;
        send({ type: "competitor", rows: blitz.competitorRows(theirs, ours) });
      } catch (e) { send({ type: "warn", message: `${c}: ${e.message}` }); }
      tick();
    }
    send({ type: "done", ...stat, elapsed: (Date.now() - t0) / 1000 });
  } catch (e) {
    send({ type: "error", message: e.message });
  }
  res.end();
});

app.post("/api/blitz/ads", auth, wrap((req, res) => {
  const t0 = process.hrtime.bigint();
  const ads = blitz.parseAds(req.body?.csv || "");
  if (!ads.length) throw new Error("Paste ads first: one per line, or CSV with brand,text,days");
  const rows = ads.map(blitz.teardown);
  const cat = blitz.categorize(rows);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  res.json({ rows, category: cat, briefs: blitz.briefs(cat), stats: { ads: rows.length, judgments: rows.length * 9, brands: new Set(rows.map((r) => r.brand)).size, ms } });
}));

// ---- AI citation tracking: ask real AI engines the buyer questions ----
app.get("/api/citations/engines", auth, (_req, res) => res.json(engines.available()));

const list = (v) => String(v || "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
app.post("/api/citations/run", auth, async (req, res) => {
  res.type("application/x-ndjson");
  const send = (o) => res.write(JSON.stringify(o) + "\n");
  try {
    const b = req.body || {};
    const brand = { name: String(b.brand || "").trim(), domain: String(b.domain || "").trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""), aliases: list(b.aliases) };
    if (!brand.name) throw new Error("Brand name required");
    const competitors = list(b.competitors).slice(0, 10).map((c) => {
      const [name, domain] = c.split(/\s*[|:]\s*/);
      return { name, domain: (domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") };
    });
    const questions = String(b.questions || "").split(/\r?\n/).map((q) => q.trim()).filter(Boolean).slice(0, 50);
    if (!questions.length) throw new Error("Add at least one buyer question");
    const enabled = engines.available().filter((e) => e.enabled).map((e) => e.id);
    const chosen = [].concat(b.engines || enabled).filter((e) => enabled.includes(e));
    if (!chosen.length) throw new Error("No AI engine configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY or PERPLEXITY_API_KEY on the server.");
    const t0 = Date.now();
    send({ type: "start", total: chosen.length * questions.length, engines: chosen });
    const out = await citations.track({ brand, competitors, questions, engines: chosen }, (row) => send({ type: "row", row, elapsed: (Date.now() - t0) / 1000 }));
    const { lastInsertRowid } = db.prepare("INSERT INTO citation_runs (user_id, brand, config, summary, rows) VALUES (?, ?, ?, ?, ?)")
      .run(req.user.id, brand.name, JSON.stringify({ brand, competitors, questions, engines: chosen }), JSON.stringify(out.summary), JSON.stringify(out.rows));
    send({ type: "done", id: Number(lastInsertRowid), summary: out.summary, elapsed: (Date.now() - t0) / 1000 });
  } catch (e) {
    send({ type: "error", message: e.message });
  }
  res.end();
});

app.get("/api/citations/runs", auth, (req, res) => {
  const rows = db.prepare("SELECT id, brand, summary, created_at FROM citation_runs WHERE user_id = ? ORDER BY id DESC LIMIT 30").all(req.user.id);
  res.json(rows.map((r) => ({ ...r, summary: JSON.parse(r.summary || "[]") })));
});

app.get("/api/citations/runs/:id", auth, wrap((req, res) => {
  const r = db.prepare("SELECT * FROM citation_runs WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!r) throw new Error("Run not found");
  res.json({ ...r, config: JSON.parse(r.config), summary: JSON.parse(r.summary || "[]"), rows: JSON.parse(r.rows || "[]") });
}));

// ---- schedules & alerts ----
const ownSchedule = (req) => {
  const s = db.prepare("SELECT * FROM schedules WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!s) throw new Error("Schedule not found");
  return s;
};
const cleanDomain = (d) => String(d || "").trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

app.get("/api/schedules", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM schedules WHERE user_id = ? ORDER BY id DESC").all(req.user.id);
  const hist = db.prepare("SELECT score, error, created_at FROM schedule_results WHERE schedule_id = ? ORDER BY id DESC LIMIT 12");
  res.json(rows.map((s) => ({ ...s, config: JSON.parse(s.config), history: hist.all(s.id).reverse() })));
});

app.post("/api/schedules", auth, wrap((req, res) => {
  const b = req.body || {};
  if (!scheduler.TYPES.includes(b.type)) throw new Error("Unknown schedule type");
  if (!scheduler.CADENCE_MS[b.cadence]) throw new Error("Unknown cadence");
  let config;
  if (b.type === "citations") {
    const questions = String(b.questions || "").split(/\r?\n/).map((q) => q.trim()).filter(Boolean).slice(0, 50);
    if (!b.brand || !questions.length) throw new Error("Brand and questions are required");
    const competitors = String(b.competitors || "").split(/\n/).map((c) => c.trim()).filter(Boolean).slice(0, 10)
      .map((c) => { const [name, domain] = c.split(/\s*[|:]\s*/); return { name, domain: cleanDomain(domain) }; });
    config = { brand: { name: String(b.brand).trim(), domain: cleanDomain(b.domain), aliases: [] }, competitors, questions };
  } else {
    if (!b.url) throw new Error("URL is required");
    config = { url: String(b.url).trim(), limit: Number(b.limit) || 25 };
  }
  const name = String(b.name || "").trim() || `${b.type.toUpperCase()} · ${config.url || config.brand.name}`;
  const { lastInsertRowid } = db.prepare(`INSERT INTO schedules (user_id, name, type, config, cadence, threshold, email, webhook, next_run_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(req.user.id, name, b.type, JSON.stringify(config), b.cadence,
    Math.max(1, Number(b.threshold) || 5), String(b.email || "").trim() || null, String(b.webhook || "").trim() || null, Date.now());
  res.json({ id: Number(lastInsertRowid) });
}));

app.patch("/api/schedules/:id", auth, wrap((req, res) => {
  ownSchedule(req);
  db.prepare("UPDATE schedules SET enabled = ? WHERE id = ?").run(req.body?.enabled ? 1 : 0, req.params.id);
  res.json({ ok: true });
}));

app.delete("/api/schedules/:id", auth, wrap((req, res) => {
  ownSchedule(req);
  db.prepare("DELETE FROM schedules WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

app.post("/api/schedules/:id/run", auth, wrap(async (req, res) => {
  ownSchedule(req);
  res.json(await scheduler.runSchedule(Number(req.params.id)));
}));

app.get("/api/alerts", auth, (req, res) => {
  res.json({
    unread: db.prepare("SELECT COUNT(*) n FROM alerts WHERE user_id = ? AND read = 0").get(req.user.id).n,
    alerts: db.prepare("SELECT * FROM alerts WHERE user_id = ? ORDER BY id DESC LIMIT 50").all(req.user.id),
  });
});
app.post("/api/alerts/read", auth, (req, res) => {
  db.prepare("UPDATE alerts SET read = 1 WHERE user_id = ?").run(req.user.id);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`SEOTool running on http://localhost:${PORT}`));
  if (process.env.SCHEDULER !== "off") scheduler.start();
}
module.exports = app;
