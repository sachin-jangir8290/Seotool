const { test } = require("node:test");
const assert = require("node:assert");
const os = require("os"), path = require("path"), fs = require("fs");
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cite-")), "t.db");
const { ENGINES } = require("../server/engines");
const { judgeAnswer } = require("../server/citations");

const brand = { name: "Glowberry", domain: "glowberry.com", aliases: ["Glow Berry"] };
const rivals = [{ name: "Henna Lab", domain: "hennalab.com" }, { name: "Naturtint", domain: "" }];

test("judgeAnswer: named, position, sentiment, cited, named instead", () => {
  const a = judgeAnswer({ text: "Top picks: Henna Lab is popular. Glowberry is the best and most trusted option.", sources: ["https://www.glowberry.com/guide"] }, brand, rivals);
  assert.equal(a.mentioned, true);
  assert.equal(a.position, 2);
  assert.equal(a.cited, true);
  assert.deepEqual(a.namedInstead, ["Henna Lab"]);
  assert.ok(a.sentiment > 60);
  const b = judgeAnswer({ text: "Try Naturtint. Avoid Glowberrys knockoffs", sources: [] }, brand, rivals);
  assert.equal(b.mentioned, false, "no partial-word match");
  assert.deepEqual(b.namedInstead, ["Naturtint"]);
  const c = judgeAnswer({ text: "glow berry has complaints and issues, poor support", sources: [] }, brand, rivals);
  assert.equal(c.mentioned, true);
  assert.ok(c.sentiment < 50);
});

test("run endpoint streams rows and saves the run", async () => {
  process.env.ANTHROPIC_API_KEY = "test"; process.env.OPENAI_API_KEY = "test";
  ENGINES.claude.ask = async (q) => ({ text: q.includes("gray") ? "Glowberry is great for gray hair." : "Henna Lab is the leading brand.", sources: [] });
  ENGINES.chatgpt.ask = async () => { throw new Error("rate limited"); };
  const app = require("../server/index.js");
  const srv = app.listen(0);
  const base = `http://localhost:${srv.address().port}`;
  let cookie = "";
  const call = async (url, body) => {
    const r = await fetch(base + url, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", cookie }, body: body && JSON.stringify(body) });
    cookie = r.headers.get("set-cookie")?.split(";")[0] || cookie;
    return r;
  };
  try {
    await call("/api/signup", { email: "c@d.co", password: "secret123" });
    const eng = await (await call("/api/citations/engines")).json();
    assert.deepEqual(eng.filter((e) => e.enabled).map((e) => e.id), ["claude", "chatgpt"]);
    const res = await call("/api/citations/run", { brand: "Glowberry", domain: "https://www.glowberry.com/", competitors: "Henna Lab | hennalab.com", questions: "best dye for gray hair\ncheapest dye" });
    const msgs = (await res.text()).trim().split("\n").map(JSON.parse);
    assert.equal(msgs.filter((m) => m.type === "row").length, 4);
    const done = msgs.find((m) => m.type === "done");
    const claude = done.summary.find((s) => s.engine === "claude");
    assert.equal(claude.rate, 50);
    assert.equal(claude.citedInstead.name, "Henna Lab");
    assert.equal(done.summary.find((s) => s.engine === "chatgpt").errors, 2);
    const runs = await (await call("/api/citations/runs")).json();
    assert.equal(runs.length, 1);
    const none = await call("/api/citations/run", { brand: "X", questions: "q", engines: ["gemini"] });
    assert.match(await none.text(), /No AI engine configured/);
  } finally { srv.close(); }
});
