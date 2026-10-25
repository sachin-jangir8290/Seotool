const { test } = require("node:test");
const assert = require("node:assert");
const os = require("os"), path = require("path"), fs = require("fs");
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "seo-")), "t.db");
const app = require("../server/index.js");

test("signup, create agent, run, approve", async () => {
  const srv = app.listen(0);
  const base = `http://localhost:${srv.address().port}`;
  let cookie = "";
  const call = async (url, method = "GET", body) => {
    const r = await fetch(base + url, { method, headers: { "Content-Type": "application/json", cookie }, body: body && JSON.stringify(body) });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal((await call("/api/agents")).status, 401);
    assert.equal((await call("/api/signup", "POST", { email: "a@b.co", password: "secret123" })).status, 200);
    assert.equal((await call("/api/login", "POST", { email: "a@b.co", password: "wrongpass" })).status, 401);
    const { data: { id } } = await call("/api/agents", "POST", { name: "Miner", kind: "search-terms" });
    const run = await call(`/api/agents/${id}/run`, "POST", { csv: "search_term,cost,conversions\nfree tool,54,0\ngood,90,3\ncheap,5,0" });
    assert.equal(run.data.result.rows.length, 1);
    assert.equal(run.data.result.rows[0].term, "free tool");
    await call(`/api/runs/${run.data.id}/approve`, "POST", { approved: true });
    assert.equal((await call(`/api/agents/${id}/runs`)).data[0].approved, 1);
    await call("/api/progress/cmo", "PUT", { "cmo-0": 1 });
    assert.deepEqual((await call("/api/progress")).data, { cmo: { "cmo-0": 1 } });
    const bad = await call(`/api/agents/${id}/run`, "POST", { csv: "x,y\n1,2" });
    assert.match(bad.data.error, /Missing columns/);
  } finally { srv.close(); }
});
