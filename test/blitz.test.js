const { test } = require("node:test");
const assert = require("node:assert");
process.env.AUDIT_ALLOW_PRIVATE = "1";
const blitz = require("../server/blitz");
const { serve } = require("./fixtures/site");

test("crawl + judge site, coverage, competitor", async () => {
  const a = serve("ours").listen(0), b = serve("theirs").listen(0);
  try {
    const ours = await blitz.crawl(`http://127.0.0.1:${a.address().port}/`, 20);
    assert.equal(ours.length, 5);
    const els = ours.flatMap(blitz.judgeElements);
    assert.ok(els.length >= 40);
    const guide = ours.find((p) => p.path === "/guides/plant-dye");
    const gEls = blitz.judgeElements(guide);
    assert.equal(gEls.find((e) => e.element === "Title").verdict, "Keep");
    assert.equal(gEls.find((e) => e.element === "Schema").verdict, "Keep");
    const home = blitz.judgeElements(ours.find((p) => p.path === "/"));
    assert.equal(home.find((e) => e.element === "Images").verdict, "Change");
    assert.ok(blitz.citability(guide).chance > blitz.citability(ours.find((p) => p.path === "/pricing")).chance);
    const cov = blitz.coverage(["How long does plant hair dye last, 720", "Cheapest way to repair a bicycle"], ours);
    assert.equal(cov[0].verdict, "Answered"); assert.equal(cov[0].asked, 720); assert.equal(cov[0].page, "/guides/plant-dye");
    assert.equal(cov[1].verdict, "No page");
    const theirs = await blitz.crawl(`http://127.0.0.1:${b.address().port}/`, 10);
    const comp = blitz.competitorRows(theirs, ours);
    assert.equal(comp.find((c) => c.page.startsWith("/compare")).verdict, "Steal");
  } finally { a.close(); b.close(); }
});

test("ad teardown", () => {
  const ads = blitz.parseAds('brand,text,days\nX,"Tired of patchy roots? Shop now",100\nX,"30% off ends tonight",4\nY,"Guaranteed results overnight",10');
  const rows = ads.map(blitz.teardown);
  assert.equal(rows[0].hook, "question");
  assert.equal(rows[1].offer, "discount");
  assert.equal(rows[1].driver, "urgency");
  assert.equal(rows[2].claimRisk, "YES");
  const cat = blitz.categorize(rows);
  assert.equal(cat.patterns[0].example.days, 100);
  assert.ok(blitz.briefs(cat).length >= 1);
});
