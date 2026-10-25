const { test } = require("node:test");
const assert = require("node:assert");
const { ANALYZERS, parseCSV } = require("../server/analyzers");

test("example plugin is loaded and works", () => {
  const a = ANALYZERS.cannibalization;
  assert.ok(a, "plugin analyzer registered");
  const out = a.run(parseCSV(a.sample));
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].winner, "/guides/plant-dye");
});
