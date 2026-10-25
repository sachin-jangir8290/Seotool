const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const os = require("os"), path = require("path"), fs = require("fs");
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sched-")), "t.db");
process.env.AUDIT_ALLOW_PRIVATE = "1";
const db = require("../server/db");
const scheduler = require("../server/scheduler");

const GOOD = `<!doctype html><html><head><title>A good title for testing the scheduler ok</title><meta name="viewport" content="width=device-width">
<meta name="description" content="${"d".repeat(100)}"><link rel="canonical" href="/"><meta property="og:title" content="x"></head>
<body><h1>One</h1><p>${"word ".repeat(700)}</p>${'<a href="/a">a</a>'.repeat(12)}</body></html>`;
const BAD = "<html><body>tiny</body></html>";

test("scheduled SEO audit raises a drop alert and calls the webhook", async () => {
  let html = GOOD;
  const hooks = [];
  const site = http.createServer((req, res) => res.end(html)).listen(0);
  const hook = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { hooks.push(JSON.parse(b)); res.end("ok"); }); }).listen(0);
  try {
    const user = db.prepare("INSERT INTO users (email, pass_hash) VALUES ('s@t.co', 'x')").run().lastInsertRowid;
    const id = db.prepare(`INSERT INTO schedules (user_id, name, type, config, cadence, threshold, webhook, next_run_at)
      VALUES (?, 'Home', 'seo', ?, 'daily', 10, ?, ?)`).run(user, JSON.stringify({ url: `http://127.0.0.1:${site.address().port}/` }), `http://127.0.0.1:${hook.address().port}/`, Date.now()).lastInsertRowid;

    assert.equal(await scheduler.tick(), 1);
    let s = db.prepare("SELECT * FROM schedules WHERE id = ?").get(id);
    const first = s.last_score;
    assert.ok(first >= 80, `first score ${first}`);
    assert.ok(s.next_run_at > Date.now() + 23 * 36e5, "next run pushed a day out");
    assert.equal(await scheduler.tick(), 0, "not due again yet");

    html = BAD;
    await scheduler.runSchedule(Number(id));
    s = db.prepare("SELECT * FROM schedules WHERE id = ?").get(id);
    assert.ok(s.last_score < first - 10);
    const alerts = db.prepare("SELECT * FROM alerts WHERE schedule_id = ?").all(id);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].level, "drop");
    assert.equal(hooks.length, 1);
    assert.match(hooks[0].text, /score dropped/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM schedule_results WHERE schedule_id = ?").get(id).n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM audits WHERE user_id = ?").get(user).n, 2);

    site.close();
    await scheduler.runSchedule(Number(id));
    assert.equal(db.prepare("SELECT level FROM alerts WHERE schedule_id = ? ORDER BY id DESC").get(id).level, "error");
  } finally { site.close(); hook.close(); }
});
