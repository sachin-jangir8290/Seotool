const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const os = require("os"), path = require("path"), fs = require("fs");
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "goog-")), "t.db");
Object.assign(process.env, { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret", SECRET_KEY: "test-secret" });

// Fake Google: token endpoint + Search Console API.
const calls = [];
const fake = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls.push({ url: req.url, auth: req.headers.authorization, body });
    res.setHeader("content-type", "application/json");
    if (req.url === "/token") {
      const p = new URLSearchParams(body);
      if (p.get("client_secret") !== "csecret") { res.statusCode = 401; return res.end("{}"); }
      if (p.get("grant_type") === "authorization_code") {
        const idToken = "x." + Buffer.from(JSON.stringify({ email: "owner@site.com" })).toString("base64url") + ".y";
        return res.end(JSON.stringify({ access_token: "A1", refresh_token: "R1", expires_in: 30, id_token: idToken }));
      }
      return res.end(JSON.stringify({ access_token: "A2", expires_in: 3600 }));
    }
    if (req.url === "/gsc/sites") return res.end(JSON.stringify({ siteEntry: [{ siteUrl: "sc-domain:site.com", permissionLevel: "siteOwner" }, { siteUrl: "https://x.com/", permissionLevel: "siteUnverifiedUser" }] }));
    if (req.url.startsWith("/gsc/sites/sc-domain%3Asite.com/searchAnalytics/query")) {
      const q = JSON.parse(body);
      const recent = q.endDate === new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
      if (q.dimensions.length === 2) return res.end(JSON.stringify({ rows: [{ keys: ["plant dye", "https://site.com/a"], clicks: 5, impressions: 50, position: 4.26 }] }));
      return res.end(JSON.stringify({ rows: recent ? [{ keys: ["https://site.com/a"], clicks: 10 }] : [{ keys: ["https://site.com/a"], clicks: 40 }, { keys: ["https://site.com/b"], clicks: 7 }] }));
    }
    if (req.url.startsWith("/revoke")) return res.end("{}");
    res.statusCode = 404; res.end("{}");
  });
}).listen(0);
const F = `http://127.0.0.1:${fake.address().port}`;
Object.assign(process.env, { GOOGLE_AUTH_URL: F + "/auth", GOOGLE_TOKEN_URL: F + "/token", GOOGLE_REVOKE_URL: F + "/revoke", GSC_API_URL: F + "/gsc" });

test("connect Google, list sites, import click-loss, refresh token, disconnect", async () => {
  const app = require("../server/index.js");
  const srv = app.listen(0);
  const base = `http://localhost:${srv.address().port}`;
  let cookie = "";
  const call = async (url, opts = {}) => {
    const r = await fetch(base + url, { redirect: "manual", ...opts, headers: { "Content-Type": "application/json", cookie } });
    cookie = r.headers.get("set-cookie")?.split(";")[0] || cookie;
    return r;
  };
  try {
    await call("/api/signup", { method: "POST", body: JSON.stringify({ email: "g@h.co", password: "secret123" }) });
    assert.deepEqual((await (await call("/api/google/status")).json()).connected, false);

    const go = await call("/api/google/connect");
    assert.equal(go.status, 302);
    const loc = new URL(go.headers.get("location"));
    assert.equal(loc.searchParams.get("access_type"), "offline");
    assert.match(loc.searchParams.get("scope"), /webmasters\.readonly/);
    const state = loc.searchParams.get("state");

    const bad = await call(`/api/google/callback?code=c&state=wrong`);
    assert.match(bad.headers.get("location"), /connect_error/);
    const ok = await call(`/api/google/callback?code=c&state=${state}`);
    assert.match(ok.headers.get("location"), /connected=google/);
    const replay = await call(`/api/google/callback?code=c&state=${state}`);
    assert.match(replay.headers.get("location"), /connect_error/, "state is single-use");

    const st = await (await call("/api/google/status")).json();
    assert.equal(st.connected, true); assert.equal(st.account, "owner@site.com");

    const db = require("../server/db");
    const raw = db.prepare("SELECT tokens FROM connections").get().tokens;
    assert.ok(!raw.includes("R1"), "tokens are encrypted at rest");

    assert.deepEqual(await (await call("/api/google/sites")).json(), ["sc-domain:site.com"]);
    assert.ok(calls.some((c) => c.url === "/token" && c.body.includes("grant_type=refresh_token")), "expired token was refreshed");
    assert.equal(calls.find((c) => c.url === "/gsc/sites").auth, "Bearer A2");

    const rep = await (await call(`/api/google/report?site=${encodeURIComponent("sc-domain:site.com")}&kind=click-loss`)).json();
    assert.equal(rep.csv, "page,clicks_current,clicks_previous\n/a,10,40\n/b,0,7");
    const can = await (await call(`/api/google/report?site=${encodeURIComponent("sc-domain:site.com")}&kind=cannibalization`)).json();
    assert.equal(can.csv, "query,page,clicks,impressions,position\nplant dye,/a,5,50,4.3");

    // The imported CSV runs straight through the click-loss agent.
    const { ANALYZERS, parseCSV } = require("../server/analyzers");
    assert.equal(ANALYZERS["click-loss"].run(parseCSV(rep.csv)).rows[0].page, "/a");

    await call("/api/google", { method: "DELETE" });
    assert.equal((await (await call("/api/google/status")).json()).connected, false);
    assert.ok(calls.some((c) => c.url.startsWith("/revoke")));
  } finally { srv.close(); fake.close(); }
});
