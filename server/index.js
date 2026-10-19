const express = require("express");
const crypto = require("crypto");
const path = require("path");
const db = require("./db");
const { ANALYZERS, parseCSV } = require("./analyzers");
const ai = require("./ai");

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

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`SEOTool running on http://localhost:${PORT}`));
module.exports = app;
