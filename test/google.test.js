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
        return res.end(JSON.stringify({ access_token: "A1", refresh_token: "R1", expires_in: 30, id_token: idToken,
          scope: "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly" }));
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
    if (req.url.startsWith("/gaAdmin/accountSummaries")) return res.end(JSON.stringify({ accountSummaries: [{ displayName: "Acme", propertySummaries: [{ property: "properties/42", displayName: "acme.com" }] }] }));
    if (req.url === "/gaData/properties/42:runReport") {
      const q = JSON.parse(body);
      const cur = q.dateRanges[0].endDate === "yesterday";
      const m = (...v) => v.map((x) => ({ value: String(x) }));
      if (q.dimensions[0].name === "sessionSource") {
        return res.end(JSON.stringify({ rows: cur
          ? [{ dimensionValues: [{ value: "chatgpt.com" }], metricValues: m(300, 6, 0.65) }, { dimensionValues: [{ value: "google" }], metricValues: m(9000, 80, 0.6) }, { dimensionValues: [{ value: "perplexity.ai" }], metricValues: m(50, 1, 0.7) }]
          : [{ dimensionValues: [{ value: "chatgpt.com" }], metricValues: m(200) }] }));
      }
      return res.end(JSON.stringify({ rows: cur ? [{ dimensionValues: [{ value: "/pricing" }], metricValues: m(800, 0, 0.35) }] : [{ dimensionValues: [{ value: "/pricing" }], metricValues: m(1200) }] }));
    }
    if (req.url.startsWith("/revoke")) return res.end("{}");
    res.statusCode = 404; res.end("{}");
  });
}).listen(0);
const F = `http://127.0.0.1:${fake.address().port}`;
Object.assign(process.env, { GOOGLE_AUTH_URL: F + "/auth", GOOGLE_TOKEN_URL: F + "/token", GOOGLE_REVOKE_URL: F + "/revoke", GSC_API_URL: F + "/gsc", GA_ADMIN_URL: F + "/gaAdmin", GA_DATA_URL: F + "/gaData" });

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

    // GA4
    assert.equal(st.ga4, true);
    assert.deepEqual(await (await call("/api/google/ga4/properties")).json(), [{ id: "properties/42", name: "acme.com (Acme)" }]);
    const ref = await (await call("/api/google/ga4/report?property=properties/42&kind=ai-referrals")).json();
    assert.equal(ref.csv, "source,sessions_current,sessions_previous,key_events,engagement_rate\nchatgpt.com,300,200,6,65\nperplexity.ai,50,0,1,70", "only AI sources kept");
    const refRun = ANALYZERS["ai-referrals"].run(parseCSV(ref.csv));
    assert.match(refRun.summary, /350 visits from AI assistants \(\+75%/);
    const lp = await (await call("/api/google/ga4/report?property=properties/42&kind=landing-pages")).json();
    const lpRun = ANALYZERS["landing-pages"].run(parseCSV(lp.csv));
    assert.match(lpRun.rows[0].issues, /traffic -33%/);
    assert.match(lpRun.rows[0].issues, /no key events/);
    const badProp = await call("/api/google/ga4/report?property=../../evil&kind=ai-referrals");
    assert.equal(badProp.status, 400);

    await call("/api/google", { method: "DELETE" });
    assert.equal((await (await call("/api/google/status")).json()).connected, false);
    assert.ok(calls.some((c) => c.url.startsWith("/revoke")));
  } finally { srv.close(); fake.close(); }
});
