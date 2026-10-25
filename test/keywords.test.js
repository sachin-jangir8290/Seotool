const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const os = require("os"), path = require("path"), fs = require("fs");
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kw-")), "t.db");
process.env.SECRET_KEY = "kw-secret";
const db = require("../server/db");
const google = require("../server/google");
const keywords = require("../server/keywords");
const scheduler = require("../server/scheduler");

test("opportunities: striking distance, low CTR, top-3 push, competing pages", () => {
  const out = keywords.opportunities([
    { query: "plant dye", page: "https://s.com/a", clicks: 10, impressions: 2000, position: 13 },
    { query: "plant dye", page: "https://s.com/b", clicks: 1, impressions: 300, position: 30 },
    { query: "henna gray", page: "https://s.com/h", clicks: 5, impressions: 1000, position: 3 },
    { query: "box dye", page: "https://s.com/x", clicks: 30, impressions: 1000, position: 7 },
    { query: "tiny", page: "https://s.com/t", clicks: 0, impressions: 10, position: 12 },
  ]);
  const by = Object.fromEntries(out.map((o) => [o.query, o]));
  assert.equal(by["plant dye"].type, "Striking distance");
  assert.match(by["plant dye"].action, /2 pages compete/);
  assert.equal(by["henna gray"].type, "Low CTR");
  assert.equal(by["box dye"].type, "Top 3 push");
  assert.equal(by.tiny, undefined, "below impression threshold");
  assert.ok(out[0].gain >= out.at(-1).gain, "sorted by gain");
});

test("track keywords, snapshot positions, history change, ranks schedule", async () => {
  let pos = 14;
  const fake = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c));
    req.on("end", () => res.end(JSON.stringify({ rows: [
      { keys: ["plant dye", "https://s.com/a"], clicks: 10, impressions: 900, position: pos },
      { keys: ["Plant Dye", "https://s.com/b"], clicks: 2, impressions: 100, position: pos + 5 },
      { keys: ["other", "https://s.com/o"], clicks: 1, impressions: 50, position: 3 },
    ] })));
  }).listen(0);
  process.env.GSC_API_URL = `http://127.0.0.1:${fake.address().port}`;
  try {
    const user = Number(db.prepare("INSERT INTO users (email, pass_hash) VALUES ('k@w.co', 'x')").run().lastInsertRowid);
    db.prepare("INSERT INTO connections (user_id, provider, tokens) VALUES (?, 'google', ?)").run(user, google.seal({ access_token: "A", refresh_token: "R", expires_at: Date.now() + 36e5 }));
    assert.equal(keywords.track(user, "sc-domain:s.com", ["Plant Dye", "plant dye ", "missing kw"]), 2);

    db.prepare("INSERT INTO rank_snapshots (user_id, site, date, keyword, position) VALUES (?, 'sc-domain:s.com', '2000-01-01', 'plant dye', 18)").run(user);
    const r = await keywords.snapshot(user, "sc-domain:s.com");
    assert.deepEqual([r.tracked, r.found, r.top10], [2, 1, 0]);

    const h = keywords.history(user, "sc-domain:s.com");
    const pd = h.find((k) => k.keyword === "plant dye");
    assert.equal(pd.position, 14);
    assert.equal(pd.change, 4, "moved up 4 places since last snapshot");
    assert.equal(pd.clicks, 12, "clicks summed across pages");
    assert.equal(pd.page, "/a", "best-ranking page");
    assert.equal(h.find((k) => k.keyword === "missing kw").position, null);

    pos = 6;
    const sid = Number(db.prepare(`INSERT INTO schedules (user_id, name, type, config, cadence, next_run_at) VALUES (?, 'Ranks', 'ranks', ?, 'daily', ?)`)
      .run(user, JSON.stringify({ site: "sc-domain:s.com" }), Date.now()).lastInsertRowid);
    const out = await scheduler.runSchedule(sid);
    assert.equal(out.score, 50);
    assert.match(out.detail, /1 of 2 tracked keywords in the top 10/);
  } finally { fake.close(); }
});
