const { test } = require("node:test");
const assert = require("node:assert");
const os = require("os"), path = require("path"), fs = require("fs");
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hard-")), "t.db");

test("health check, security headers, login rate limit, closed sign-up", async () => {
  const app = require("../server/index.js");
  const srv = app.listen(0);
  const base = `http://localhost:${srv.address().port}`;
  const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    const h = await fetch(base + "/healthz");
    assert.deepEqual(await h.json(), { ok: true });
    assert.equal(h.headers.get("x-frame-options"), "DENY");
    assert.equal(h.headers.get("x-powered-by"), null);

    process.env.ALLOW_SIGNUP = "false";
    assert.equal((await post("/api/signup", { email: "first@x.co", password: "secret123" })).status, 200, "first account always allowed");
    assert.equal((await post("/api/signup", { email: "second@x.co", password: "secret123" })).status, 403);
    delete process.env.ALLOW_SIGNUP;

    let last;
    for (let i = 0; i < 10; i++) last = await post("/api/login", { email: "first@x.co", password: "wrong" });
    assert.equal(last.status, 429, "11th auth attempt from one IP is blocked");
  } finally { srv.close(); }
});
