// Example plugin: finds queries where two or more of your pages compete in Search Console.
// Copy this file to make your own agent — see CONTRIBUTING.md.
const { num, need } = require("../server/analyzers");

module.exports = {
  analyzers: {
    cannibalization: {
      label: "SEO cannibalization checker (plugin)",
      columns: "query, page, clicks",
      sample: "query,page,clicks,position\nplant hair dye,/guides/plant-dye,120,4\nplant hair dye,/blog/plant-dye-tips,30,11\nhenna safety,/faq,40,6",
      run(rows) {
        need(rows, ["query", "page", "clicks"]);
        const byQuery = {};
        for (const r of rows) (byQuery[r.query] ||= []).push({ page: r.page, clicks: num(r.clicks), position: num(r.position) });
        const out = Object.entries(byQuery)
          .filter(([, pages]) => pages.length > 1)
          .map(([query, pages]) => {
            pages.sort((a, b) => b.clicks - a.clicks);
            return { query, pages: pages.length, winner: pages[0].page, losers: pages.slice(1).map((p) => p.page).join(" | "), action: "Merge or redirect the weaker pages into the winner" };
          });
        return { summary: `${out.length} queries have competing pages.`, columns: ["query", "pages", "winner", "losers", "action"], rows: out };
      },
    },
  },
};
