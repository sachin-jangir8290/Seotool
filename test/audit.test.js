const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");
process.env.AUDIT_ALLOW_PRIVATE = "1";
const { seoAudit, geoAudit, isPrivate } = require("../server/audit");

const PAGE = `<!doctype html><html><head><title>Best SEO tool for small agencies in 2026</title>
<meta name="viewport" content="width=device-width"><meta name="description" content="short">
<script type="application/ld+json">{"@type":"Organization","name":"X"}</script></head>
<body><h1>Hi</h1><img src=a.png><p>${"word ".repeat(400)}</p><ul><li>a</li></ul></body></html>`;
const ROBOTS = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n";

test("seo + geo audits", async () => {
  const srv = http.createServer((req, res) => {
    if (req.url === "/old") { res.writeHead(301, { location: "/" }); return res.end(); }
    if (req.url === "/robots.txt") return res.end(ROBOTS);
    if (req.url === "/llms.txt") { res.statusCode = 404; return res.end(); }
    res.end(PAGE);
  }).listen(0);
  const url = `http://127.0.0.1:${srv.address().port}/old`;
  try {
    const seo = await seoAudit(url);
    const by = Object.fromEntries(seo.checks.map((c) => [c.name, c.status]));
    assert.equal(by["HTTP status"], "pass");
    assert.equal(by["Title tag"], "pass");
    assert.equal(by["Meta description"], "warn");
    assert.equal(by["Image alt text"], "warn");
    assert.ok(seo.score > 0 && seo.score < 100);
    const geo = await geoAudit(url);
    assert.equal(geo.bots.find((b) => b.bot === "GPTBot").allowed, false);
    assert.equal(geo.bots.find((b) => b.bot === "ClaudeBot").allowed, true);
    assert.equal(geo.checks.find((c) => c.name === "Organization entity").status, "pass");
  } finally { srv.close(); }
});

test("blocks private addresses", async () => {
  assert.ok(isPrivate("127.0.0.1") && isPrivate("10.1.2.3") && isPrivate("192.168.0.1") && !isPrivate("8.8.8.8"));
  delete process.env.AUDIT_ALLOW_PRIVATE;
  await assert.rejects(seoAudit("http://127.0.0.1:1/"), /Private/);
  process.env.AUDIT_ALLOW_PRIVATE = "1";
});
