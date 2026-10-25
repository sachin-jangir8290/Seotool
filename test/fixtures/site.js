// Tiny multi-page site used by tests and screenshots.
const http = require("http");
const page = (title, h1, intro, extra = "") => `<!doctype html><html><head><title>${title}</title>
<meta name="description" content="${intro.slice(0, 90)}"><meta name="viewport" content="width=device-width"></head>
<body><h1>${h1}</h1><p>${intro}</p>${extra}<a href="/">Home</a> <a href="/guides/plant-dye">Plant dye</a> <a href="/blog/cover-gray">Cover gray</a> <a href="/pricing">Pricing</a> <a href="/faq">FAQ</a></body></html>`;
const SITES = {
  ours: {
    "/": page("Plant hair dye", "Plant-based hair colour", "We make hair dye from plants.", "<img src=a.png><img src=b.png alt=box>"),
    "/guides/plant-dye": page("How long does plant hair dye last? A complete guide for 2026", "How long plant dye lasts",
      "Plant hair dye lasts 4 to 6 weeks on most hair types and fades gradually.",
      `<script type="application/ld+json">{"@type":"Article","dateModified":"${new Date().toISOString()}","author":"Ana"}</script><table><tr><td>Henna</td><td>6 weeks</td></tr></table><p>${"Results vary by hair 12% 30 days ".repeat(80)}</p><a href="https://pubmed.ncbi.nlm.nih.gov/1">study</a><a href="https://example.org/2">s2</a><a href="https://example.net/3">s3</a>`),
    "/blog/cover-gray": page("Cover gray", "Covering gray hair", "Welcome to our blog! Today we talk about lots of things around colour and what we love about it and much more besides, so grab a coffee and settle in for a long read about our story.".repeat(1)),
    "/pricing": page("Pricing", "Pricing", "Plans start at $19."),
    "/faq": page("FAQ — plant hair dye questions", "FAQ", "Answers to common questions.", "<h2>Is henna safe?</h2><h2>Does it cover gray?</h2><h2>How long does it last?</h2>"),
  },
  theirs: {
    "/": page("Rival Dye", "Rival", "Rival dye.", `<a href="/compare/box-dye-vs-plant-dye">compare</a>`),
    "/compare/box-dye-vs-plant-dye": page("Box dye vs plant dye: which is safer for your hair?", "Box dye vs plant dye",
      "Plant dye is gentler than box dye because it has no ammonia or PPD.",
      `<script type="application/ld+json">{"@type":"FAQPage","datePublished":"${new Date().toISOString()}"}</script><table><tr><td>a</td></tr></table><p>${"Tested on 40 people over 8 weeks 92% ".repeat(300)}</p><a href="https://a.org">a</a><a href="https://b.org">b</a><a href="https://c.org">c</a>`),
  },
};
function serve(name) {
  const routes = SITES[name];
  return http.createServer((req, res) => {
    if (req.url === "/sitemap.xml") { res.statusCode = 404; return res.end(); }
    const body = routes[req.url];
    if (!body) { res.statusCode = 404; return res.end("nope"); }
    res.setHeader("content-type", "text/html"); res.end(body);
  });
}
module.exports = { serve };
if (require.main === module) { serve("ours").listen(4101); serve("theirs").listen(4102); console.log("fixtures on 4101/4102"); }
