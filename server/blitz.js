// Blitz: a fast rules engine that judges many small items (page elements, pages, questions, ads)
// against a fixed set of verdicts. No LLM call per item, so thousands of judgments run per second.
const { get, checkUrl, strip, pick, meta } = require("./audit");

const STOP = new Set("a an the and or of to in on for with is are was be by it this that how what why when where which who do does can i my your our you we best vs from at as".split(" "));
const tokens = (s) => String(s).toLowerCase().match(/[a-z0-9]{2,}/g)?.filter((t) => !STOP.has(t)) || [];
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const r2 = (n) => Math.round(n * 100) / 100;

// ---------- crawling ----------
async function crawl(start, limit, onPage) {
  const root = await checkUrl(start);
  const seen = new Set(), queue = [root.href];
  // Prefer the sitemap when there is one; fall back to following links.
  try {
    const sm = await get(new URL("/sitemap.xml", root));
    if (sm.status === 200) for (const m of sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) queue.push(m[1]);
  } catch {}
  const pages = [];
  const norm = (u) => { const x = new URL(u); x.hash = ""; return x.href; };
  while (queue.length && pages.length < limit) {
    const batch = [];
    while (queue.length && batch.length < 6 && pages.length + batch.length < limit) {
      let u; try { u = norm(new URL(queue.shift(), root)); } catch { continue; }
      if (seen.has(u) || new URL(u).host !== root.host || /\.(png|jpe?g|gif|svg|pdf|zip|css|js|xml|webp)$/i.test(u)) continue;
      seen.add(u); batch.push(u);
    }
    const got = await Promise.all(batch.map((u) => get(u).catch(() => null)));
    got.forEach((res, i) => {
      if (!res || res.status !== 200 || !/<html|<body|<title/i.test(res.text)) return;
      const page = parsePage(res.text, batch[i]);
      pages.push(page);
      for (const m of res.text.matchAll(/<a\b[^>]*href=["']([^"'#]+)/gi)) queue.push(new URL(m[1], batch[i]).href);
      onPage?.(page);
    });
  }
  return pages;
}

function parsePage(html, url) {
  const u = new URL(url);
  const text = strip(html);
  const words = text.split(" ").filter(Boolean).length;
  const firstP = strip(pick(html, /<p[^>]*>([\s\S]*?)<\/p>/i));
  const schema = [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  const dateStr = pick(html, /"date(?:Modified|Published)"\s*:\s*"([^"]+)"/i) || pick(html, /<time[^>]*datetime=["']([^"']+)/i);
  const date = dateStr ? new Date(dateStr) : null;
  const links = [...html.matchAll(/<a\b[^>]*href=["'](https?:[^"']+)/gi)].map((m) => m[1]);
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const qHeads = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].map((m) => strip(m[1])).filter((h) => h.endsWith("?"));
  return {
    url, path: u.pathname + u.search, host: u.host,
    title: strip(pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i)),
    desc: meta(html, "description"),
    h1s: [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1])),
    firstP, words,
    imgs: imgs.length, noAlt: imgs.filter((i) => !/\balt=["'][^"']+/i.test(i)).length,
    schema, faq: schema.some((s) => /FAQ|QAPage/i.test(s)) || qHeads.length >= 3, qHeads,
    canonical: /<link[^>]+rel=["']canonical/i.test(html),
    ageMonths: date && !isNaN(date) ? (Date.now() - date) / 2.63e9 : null,
    table: /<table\b/i.test(html), list: /<(ul|ol)\b/i.test(html),
    external: links.filter((l) => !l.includes(u.host)).length,
    numbers: (text.match(/\b\d[\d,.]*%?/g) || []).length,
    author: /"author"|rel=["']author|class=["'][^"']*author/i.test(html),
    titleTokens: new Set(tokens(strip(pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i)) + " " + strip(pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)))),
    bodyTokens: new Set(tokens(text)),
  };
}

// ---------- 01: every SEO element, judged one by one ----------
function judgeElements(p) {
  const out = [];
  const add = (element, now, proposed, verdict, confidence) => out.push({ page: p.path, element, now, proposed, verdict, confidence: r2(confidence) });
  const h1 = p.h1s[0] || "";
  const site = p.host.replace(/^www\./, "");
  const t = p.title;
  if (!t) add("Title", "missing", `${h1 || p.path} | ${site}`, "Change", 0.98);
  else if (t.length > 60) add("Title", t, t.slice(0, 57).replace(/\s+\S*$/, "") + "…", "Change", 0.9);
  else if (t.length < 30) add("Title", t, `${t} — ${h1 && h1 !== t ? h1 : "guide & FAQs"}`.slice(0, 60), "Change", 0.8);
  else add("Title", t, "—", "Keep", 0.9);
  const d = p.desc;
  if (!d) add("Meta", "missing", (p.firstP || t).slice(0, 155), "Change", 0.95);
  else if (d.length < 70 || d.length > 160) add("Meta", d, (d.length > 160 ? d : `${d} ${p.firstP}`).slice(0, 155), "Change", 0.85);
  else add("Meta", d, "—", "Keep", 0.88);
  if (p.h1s.length === 1) add("H1", h1, "—", "Keep", 0.95);
  else if (!p.h1s.length) add("H1", "missing", t || p.path, "Change", 0.97);
  else add("H1", `${p.h1s.length} H1 tags`, "Keep one H1, demote the rest to H2", "Change", 0.9);
  const introWords = p.firstP.split(" ").filter(Boolean).length;
  const answers = introWords > 0 && introWords <= 60 && /\b(is|are|means|helps|costs?|takes|lasts|works)\b|\d/.test(p.firstP);
  add("Intro", p.firstP.slice(0, 80) || "missing", answers ? "—" : "Answer the main question in the first 40 words", answers ? "Keep" : "Change", answers ? 0.8 : 0.92);
  add("Images", `${p.imgs - p.noAlt} of ${p.imgs} have alt text`, p.noAlt ? `Add alt text to ${p.noAlt} images` : "—", p.noAlt ? "Change" : "Keep", p.noAlt ? 0.9 : 0.95);
  add("FAQ", p.faq ? "present" : "missing", p.faq ? "—" : "Add 5 questions buyers ask + FAQPage schema", p.faq ? "Keep" : "Change", p.faq ? 0.85 : 0.88);
  add("Schema", p.schema.length ? [...new Set(p.schema)].slice(0, 3).join(", ") : "missing", p.schema.length ? "—" : "Add Article / Product JSON-LD", p.schema.length ? "Keep" : "Change", p.schema.length ? 0.9 : 0.93);
  add("Canonical", p.canonical ? "present" : "missing", p.canonical ? "—" : `<link rel="canonical" href="${p.url}">`, p.canonical ? "Keep" : "Change", p.canonical ? 0.95 : 0.85);
  add("Content", `${p.words} words`, p.words < 600 ? "Expand to 800+ words with examples and data" : "—", p.words < 600 ? "Change" : "Keep", p.words < 300 ? 0.9 : 0.7);
  return out;
}

// ---------- 04: how likely is each page to be cited by AI? ----------
const FACTORS = [
  ["answer", 0.22, "answer in first 40 words"], ["facts", 0.14, "add numbers & specific facts"],
  ["sources", 0.12, "cite 3+ outside sources"], ["schema", 0.12, "add schema markup"],
  ["fresh", 0.14, "refresh: update date & content"], ["faq", 0.1, "add FAQ block"],
  ["compare", 0.08, "add a comparison table"], ["author", 0.08, "add named author & credentials"],
];
function factorScores(p) {
  const introWords = p.firstP.split(" ").filter(Boolean).length;
  return {
    answer: introWords && introWords <= 60 ? 1 : introWords ? 0.4 : 0,
    facts: clamp(p.numbers / Math.max(1, p.words / 100) / 2),
    sources: clamp(p.external / 3),
    schema: p.schema.length ? 1 : 0,
    fresh: p.ageMonths == null ? 0.3 : p.ageMonths < 6 ? 1 : p.ageMonths < 12 ? 0.6 : 0.2,
    faq: p.faq ? 1 : 0, compare: p.table ? 1 : 0, author: p.author ? 1 : 0,
  };
}
function citability(p) {
  const f = factorScores(p);
  const score = FACTORS.reduce((s, [k, w]) => s + w * f[k], 0);
  const [worst] = FACTORS.map(([k, w, fix]) => ({ k, gain: w * (1 - f[k]), fix })).sort((a, b) => b.gain - a.gain);
  const chance = Math.round(score * 80);
  return { page: p.path, chance, factors: f, fixFirst: worst.gain > 0 ? worst.fix : "—", after: Math.round((score + worst.gain) * 80) };
}

// ---------- 03: do our pages answer what people ask AI? ----------
function coverage(lines, pages) {
  return lines.map((line) => {
    const [q, vol] = line.split(/\t|,(?=\s*\d+\s*$)/);
    const qt = tokens(q);
    let best = null, bestScore = 0;
    for (const p of pages) {
      const s = qt.reduce((n, t) => n + (p.titleTokens.has(t) ? 1 : p.bodyTokens.has(t) ? 0.5 : 0), 0) / Math.max(1, qt.length);
      if (s > bestScore) { bestScore = s; best = p; }
    }
    const match = Math.round(bestScore * 100);
    const verdict = match >= 60 ? "Answered" : match >= 35 ? "Weak answer" : "No page";
    const next = verdict === "Answered" ? "—" : verdict === "Weak answer" ? `Add a direct answer + proof on ${best.path}` : "Write a guide page for this question";
    return { question: q.trim(), asked: Number(vol) || null, page: match >= 35 ? best.path : "—", match, verdict, next };
  });
}

// ---------- 02: competitor pages worth stealing ----------
function competitorRows(compPages, ourPages) {
  return compPages.map((p) => {
    const f = factorScores(p);
    const s = { answer: f.answer, depth: clamp(p.words / 2000), proof: (f.facts + f.sources) / 2, schema: f.schema, fresh: f.fresh };
    const total = Object.values(s).reduce((a, b) => a + b, 0);
    const topic = [...p.titleTokens];
    const ours = Math.max(0, ...ourPages.map((o) => topic.filter((t) => o.titleTokens.has(t)).length / Math.max(1, topic.length)));
    const verdict = ours >= 0.75 ? "Have it" : total >= 2.6 ? "Steal" : "Skip";
    return { competitor: p.host, page: p.path, title: p.title, scores: s, total: r2(total), verdict };
  });
}

// ---------- ads: teardown, category patterns and briefs ----------
const RULES = {
  hook: [["question", /\?/], ["offer promo", /\d+%\s*off|sale\b|\bfree\b|deal|discount|save \$?\d/i], ["news announcement", /\b(new|introducing|launch|just dropped|now available)\b/i],
    ["problem callout", /\b(tired of|struggling|stop|no more|sick of|problem|hate|can't)\b/i], ["social proof", /\b(reviews?|customers|loved by|rated|stars?|★)\b/i],
    ["bold claim", /\b(best|#1|only|guaranteed|proven|ever)\b/i]],
  format: [["comparison", /\b(vs\.?|versus|compared|than)\b/i], ["listicle", /\b\d+\s+(ways|reasons|tips|things|benefits)\b|•|✓|✔/i],
    ["testimonial", /["“].{10,}["”]|\bI (was|tried|love|stopped)\b/i], ["how-to", /\bhow to\b|step/i], ["offer", /%|\$\d|free shipping|bundle/i]],
  offer: [["discount", /\d+%\s*off|save|sale|discount/i], ["free trial", /free trial|try (it )?free/i], ["financing / subscription", /per month|\/mo\b|subscri|financ|installment/i],
    ["free shipping", /free shipping|ships free/i], ["bundle", /bundle|kit|pack of/i]],
  cta: [["purchase", /\b(shop|buy|order|get yours|add to cart)\b/i], ["sign up", /\b(sign up|join|start|try|register)\b/i], ["book", /\b(book|schedule|demo|call)\b/i], ["learn", /\b(learn|discover|see how|find out|read)\b/i]],
  driver: [["urgency", /\b(today|now|ends|limited|last chance|hurry)\b/i], ["fear of loss", /\b(don't miss|losing|risk|mistake|before it'?s|avoid)\b/i],
    ["social", /\b(everyone|thousands|join \d|people)\b/i], ["curiosity", /\b(secret|why|this one|the reason|surprising)\b/i], ["gain", /\b(get|boost|more|faster|better|save)\b/i]],
};
const first = (list, text, dflt) => (list.find(([, re]) => re.test(text)) || [dflt])[0];

function teardown(ad) {
  const t = ad.text;
  const hook = first(RULES.hook, t, "statement");
  const offer = first(RULES.offer, t, "none");
  const awareness = offer !== "none" && ad.brand && t.toLowerCase().includes(ad.brand.toLowerCase()) ? "most aware"
    : /\b(our|this) (product|formula|app|tool)\b/i.test(t) ? "product aware"
    : /\bhow|why|way to\b/i.test(t) ? "solution aware" : RULES.hook[3][1].test(t) ? "problem aware" : "unaware";
  const specificity = Math.min(3, (/\d/.test(t) ? 1 : 0) + (/\b[A-Z][a-z]+\b.*\b[A-Z][a-z]+\b/.test(t.slice(1)) ? 1 : 0) + (t.split(" ").length <= 20 ? 1 : 0.5));
  return {
    brand: ad.brand, text: t, days: ad.days, hook, format: first(RULES.format, t, "statement"), offer, awareness,
    cta: first(RULES.cta, t, "none"), driver: first(RULES.driver, t, "none"), specificity: r2(specificity),
    claimRisk: /\b(cure|guarantee[ds]?|100%|instantly|never again|miracle|overnight)\b/i.test(t) ? "YES" : "no",
  };
}

function parseAds(csv) {
  const lines = String(csv).trim().split(/\r?\n/).filter(Boolean);
  const head = lines[0].toLowerCase();
  const hasHead = /text|copy|ad/.test(head) && head.includes(",");
  const cols = hasHead ? head.split(",").map((c) => c.trim()) : ["brand", "text", "days"];
  const iBrand = cols.findIndex((c) => /brand|advertiser|page/.test(c));
  const iText = cols.findIndex((c) => /text|copy|body|headline|^ad$/.test(c));
  const iDays = cols.findIndex((c) => /days|running|age/.test(c));
  return lines.slice(hasHead ? 1 : 0).map((l) => {
    const parts = []; let cur = "", q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { parts.push(cur); cur = ""; } else cur += ch; }
    parts.push(cur);
    if (parts.length === 1) return { brand: "", text: parts[0].trim(), days: 0 };
    return { brand: (parts[iBrand] || "").trim(), text: (parts[iText >= 0 ? iText : 1] || "").trim(), days: Number(parts[iDays]) || 0 };
  }).filter((a) => a.text);
}

function categorize(rows) {
  const count = (k) => Object.entries(rows.reduce((m, r) => ((m[r[k]] = (m[r[k]] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const avg = rows.reduce((s, r) => s + r.days, 0) / Math.max(1, rows.length);
  const patterns = Object.entries(rows.reduce((m, r) => ((m[`${r.hook} · ${r.format}`] ||= []).push(r), m), {}))
    .map(([pattern, rs]) => {
      const d = rs.reduce((s, r) => s + r.days, 0) / rs.length;
      return { pattern, ads: rs.length, avgDays: Math.round(d), survival: avg ? r2(d / avg) : 0, example: rs.sort((a, b) => b.days - a.days)[0] };
    })
    .sort((a, b) => b.survival - a.survival || b.ads - a.ads);
  return { hook: count("hook"), format: count("format"), awareness: count("awareness"), offer: count("offer"), patterns, avgDays: Math.round(avg) };
}

const ANGLES = {
  question: (b) => `Open with the question your buyer types at 11pm, then answer it in one line${b}.`,
  "problem callout": (b) => `Name the exact frustration in the first 3 words, then show the fix${b}.`,
  "bold claim": (b) => `Lead with one specific, provable claim and the number that backs it${b}.`,
  "news announcement": (b) => `"New" + what changed + who it's for${b}.`,
  "social proof": (b) => `Lead with a real customer's before/after in their words${b}.`,
  "offer promo": (b) => `Put the offer and the deadline in the first line${b}.`,
  statement: (b) => `One clear benefit, one proof point, one CTA${b}.`,
};
function briefs(cat) {
  return cat.patterns.slice(0, 6).map((p, i) => {
    const [hook, format] = p.pattern.split(" · ");
    const fit = clamp(0.5 + p.ads / 10);
    const hookScore = clamp(p.example.specificity / 3);
    const survival = clamp(p.survival / 2);
    return {
      n: i + 1, pattern: p.pattern, angle: ANGLES[hook]((format !== "statement" ? `, shown as a ${format}` : "")),
      modelledOn: p.example.text.slice(0, 90), score: Math.round((0.4 * survival + 0.35 * hookScore + 0.25 * fit) * 100),
      hook: r2(hookScore), fit: r2(fit), survival: r2(survival),
    };
  });
}

module.exports = { crawl, parsePage, judgeElements, citability, coverage, competitorRows, parseAds, teardown, categorize, briefs };
