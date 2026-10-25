const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");
process.env.AUDIT_ALLOW_PRIVATE = "1";
const rewriter = require("../server/rewriter");

const PAGE = `<html><head><title>Dye</title></head><body><h1>Plant dye</h1>
<p>Welcome to our blog where we talk about many lovely things for a long time and keep going and going without ever answering anything at all today friends.</p>
<h2>Is henna safe?</h2><h2>Does it cover gray?</h2><h2>How long does it last?</h2></body></html>`;

test("rules mode drafts changes and exports approved HTML", async () => {
  const srv = http.createServer((req, res) => res.end(PAGE)).listen(0);
  try {
    const out = await rewriter.rewritePage(`http://127.0.0.1:${srv.address().port}/dye`, { mode: "rules" });
    const els = out.items.map((i) => i.element);
    assert.ok(els.includes("Title") && els.includes("Meta description") && els.includes("FAQ") && els.includes("Canonical"));
    assert.ok(!els.includes("FAQ schema (JSON-LD)"), "no FAQ schema until answers are written");
    const title = out.items.find((i) => i.element === "Title");
    assert.notEqual(title.after, "Dye");
    out.items.forEach((i) => (i.status = "approved"));
    out.items.find((i) => i.element === "FAQ").after = 'Q: Is henna safe?\nA: Yes, <mostly>.';
    const html = rewriter.exportHtml(out.items);
    assert.match(html, /<title>.+<\/title>/);
    assert.match(html, /<h3>Is henna safe\?<\/h3>\n<p>Yes, &lt;mostly&gt;\.<\/p>/);
    assert.match(html, /application\/ld\+json/);
  } finally { srv.close(); }
});
