// Site audits: on-page SEO and AI-search (GEO) readiness for a public URL.
const dns = require("dns").promises;
const net = require("net");

const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "CCBot"];

// Refuse private/loopback targets so the server can't be used to probe internal hosts.
function isPrivate(ip) {
  if (net.isIPv6(ip)) return ip === "::1" || /^f[cd]|^fe80/i.test(ip) || ip.startsWith("::ffff:") && isPrivate(ip.slice(7));
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function checkUrl(raw) {
  let url;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw new Error("Invalid URL"); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) URLs");
  if (process.env.AUDIT_ALLOW_PRIVATE !== "1") {
    const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => { throw new Error("Could not resolve host"); });
    if (addrs.some((a) => isPrivate(a.address))) throw new Error("Private addresses are not allowed");
  }
  return url;
}

// Follows redirects by hand so every hop goes through the same host check.
async function get(url, hops = 5) {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "SEOToolAudit/1.0" } });
  const loc = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && loc) {
    if (!hops) throw new Error("Too many redirects");
    return get(await checkUrl(new URL(loc, url).href), hops - 1);
  }
  const text = (await res.text()).slice(0, 3_000_000);
  return { status: res.status, text, finalUrl: String(url) };
}

const pick = (html, re) => (html.match(re) || [])[1]?.trim() || "";
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const meta = (html, name) => pick(html, new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)`, "i"))
  || pick(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"));

function scoreOf(checks) {
  const w = { pass: 1, warn: 0.5, fail: 0 };
  return Math.round((checks.reduce((s, c) => s + w[c.status], 0) / checks.length) * 100);
}

async function seoAudit(raw) {
  const url = await checkUrl(raw);
  const t0 = Date.now();
  const page = await get(url);
  const ms = Date.now() - t0;
  const h = page.text;
  const title = pick(h, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = meta(h, "description");
  const h1s = h.match(/<h1[\s>]/gi) || [];
  const imgs = h.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter((i) => !/\balt=["'][^"']+/i.test(i)).length;
  const words = strip(h).split(" ").filter(Boolean).length;
  const links = [...h.matchAll(/<a\b[^>]*href=["']([^"'#]+)/gi)].map((m) => m[1]);
  const internal = links.filter((l) => l.startsWith("/") || l.includes(url.hostname)).length;
  const c = (name, status, detail) => ({ name, status, detail });
  const checks = [
    c("HTTP status", page.status === 200 ? "pass" : "fail", `Returned ${page.status}`),
    c("HTTPS", page.finalUrl.startsWith("https:") ? "pass" : "fail", page.finalUrl),
    c("Title tag", !title ? "fail" : title.length >= 30 && title.length <= 60 ? "pass" : "warn", title ? `${title.length} chars: "${title.slice(0, 80)}"` : "Missing"),
    c("Meta description", !desc ? "fail" : desc.length >= 70 && desc.length <= 160 ? "pass" : "warn", desc ? `${desc.length} chars` : "Missing"),
    c("One H1", h1s.length === 1 ? "pass" : h1s.length ? "warn" : "fail", `${h1s.length} H1 tags`),
    c("Image alt text", noAlt === 0 ? "pass" : noAlt <= 3 ? "warn" : "fail", `${noAlt} of ${imgs.length} images missing alt`),
    c("Content length", words >= 600 ? "pass" : words >= 300 ? "warn" : "fail", `${words} words`),
    c("Canonical tag", /<link[^>]+rel=["']canonical/i.test(h) ? "pass" : "warn", /<link[^>]+rel=["']canonical/i.test(h) ? "Present" : "Missing"),
    c("Mobile viewport", /<meta[^>]+name=["']viewport/i.test(h) ? "pass" : "fail", ""),
    c("Open Graph tags", meta(h, "og:title") ? "pass" : "warn", meta(h, "og:title") ? "Present" : "Missing og:title"),
    c("Indexable", /<meta[^>]+content=["'][^"']*noindex/i.test(h) ? "fail" : "pass", /noindex/i.test(h) ? "noindex found" : "No noindex"),
    c("Internal links", internal >= 10 ? "pass" : internal >= 3 ? "warn" : "fail", `${internal} internal / ${links.length} total`),
    c("Response time", ms < 1000 ? "pass" : ms < 3000 ? "warn" : "fail", `${ms} ms`),
    c("Page size", h.length < 500_000 ? "pass" : "warn", `${Math.round(h.length / 1024)} KB HTML`),
  ];
  return { url: page.finalUrl, score: scoreOf(checks), checks };
}

async function geoAudit(raw) {
  const url = await checkUrl(raw);
  const origin = url.origin;
  const [page, robots, llms] = await Promise.all([
    get(url),
    get(origin + "/robots.txt").catch(() => ({ status: 0, text: "" })),
    get(origin + "/llms.txt").catch(() => ({ status: 0, text: "" })),
  ]);
  const h = page.text;
  const robotsTxt = robots.status === 200 ? robots.text : "";
  // Is the bot blocked from "/" by a group naming it (or by "*" if it has no group of its own)?
  const groups = robotsTxt.split(/\n(?=\s*user-agent)/i).map((g) => ({
    agents: [...g.matchAll(/user-agent:\s*(\S+)/gi)].map((m) => m[1].toLowerCase()),
    blocked: /^\s*disallow:\s*\/\s*$/im.test(g),
  }));
  const blocked = (bot) => {
    const own = groups.find((g) => g.agents.includes(bot.toLowerCase()));
    return (own || groups.find((g) => g.agents.includes("*")))?.blocked || false;
  };
  const bots = AI_BOTS.map((b) => ({ bot: b, allowed: !blocked(b) }));
  const schemas = [...h.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  const text = strip(h);
  const c = (name, status, detail) => ({ name, status, detail });
  const allowed = bots.filter((b) => b.allowed).length;
  const checks = [
    c("AI crawlers allowed", allowed === bots.length ? "pass" : allowed ? "warn" : "fail", `${allowed}/${bots.length} AI bots can crawl`),
    c("llms.txt", llms.status === 200 && llms.text.trim() && !/<html/i.test(llms.text) ? "pass" : "warn", llms.status === 200 ? "Found" : "Not found"),
    c("Structured data", schemas.length ? "pass" : "fail", schemas.length ? [...new Set(schemas)].slice(0, 8).join(", ") : "No JSON-LD"),
    c("FAQ / Q&A content", schemas.some((s) => /FAQ|QAPage/i.test(s)) || (h.match(/<h[23][^>]*>[^<]*\?/gi) || []).length >= 3 ? "pass" : "warn", "Question-style headings or FAQ schema help AI answers"),
    c("Organization entity", schemas.some((s) => /Organization|LocalBusiness|Person/i.test(s)) ? "pass" : "warn", "Who you are, in schema"),
    c("Direct answer up top", text.split(" ").length > 50 ? "pass" : "warn", "Pages should answer the main question in the first paragraph"),
    c("Lists & tables", /<(ul|ol|table)\b/i.test(h) ? "pass" : "warn", "AI engines quote structured content"),
    c("Freshness signal", /dateModified|datePublished|<time\b/i.test(h) ? "pass" : "warn", "Show a published/updated date"),
    c("Author / expertise", /"author"|rel=["']author|class=["'][^"']*author/i.test(h) ? "pass" : "warn", "Named authors build trust"),
  ];
  return { url: page.finalUrl, score: scoreOf(checks), checks, bots };
}

module.exports = { seoAudit, geoAudit, isPrivate, get, checkUrl, strip, pick, meta };
