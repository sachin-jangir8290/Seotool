// Page rewriter: turns Blitz "Change" verdicts into ready-to-paste drafts.
// "ai" mode asks Claude for the copy; "rules" mode uses Blitz's own proposals (no key, $0).
const Anthropic = require("@anthropic-ai/sdk");
const { get, checkUrl } = require("./audit");
const blitz = require("./blitz");

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "meta", "h1", "intro", "faq"],
  properties: {
    title: { type: "string", description: "SEO title, 30-60 characters, main keyword first" },
    meta: { type: "string", description: "Meta description, 70-155 characters, with a reason to click" },
    h1: { type: "string" },
    intro: { type: "string", description: "First paragraph that directly answers the page's main question in under 50 words" },
    faq: {
      type: "array",
      description: "5 questions buyers ask about this topic, each answered in 1-3 sentences using only facts from the page",
      items: { type: "object", additionalProperties: false, required: ["q", "a"], properties: { q: { type: "string" }, a: { type: "string" } } },
    },
  },
};

let client;
async function aiDraft(page, text, issues) {
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: "You are an SEO and AI-search (GEO) copywriter. Rewrite page elements so search engines rank them and AI assistants quote them. " +
      "Use only facts present in the page text; never invent prices, statistics, awards or claims. Keep the page's language and brand voice.",
    messages: [{
      role: "user",
      content: `URL: ${page.url}\nCurrent title: ${page.title || "(none)"}\nCurrent meta: ${page.desc || "(none)"}\nCurrent H1: ${page.h1s[0] || "(none)"}\n` +
        `Problems found:\n${issues.map((i) => `- ${i.element}: ${i.proposed}`).join("\n") || "- none"}\n\nPAGE TEXT:\n${text}`,
    }],
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined this page");
  const json = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(json);
}

function faqJsonLd(faq) {
  return JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  }, null, 2);
}
function articleJsonLd(page, draft) {
  return JSON.stringify({
    "@context": "https://schema.org", "@type": "Article", headline: draft.h1 || draft.title, description: draft.meta,
    url: page.url, dateModified: new Date().toISOString().slice(0, 10),
  }, null, 2);
}

async function rewritePage(rawUrl, { mode }) {
  const url = await checkUrl(rawUrl);
  const res = await get(url);
  if (res.status !== 200) throw new Error(`Page returned HTTP ${res.status}`);
  const page = blitz.parsePage(res.text, res.finalUrl);
  const judged = blitz.judgeElements(page);
  const issues = judged.filter((j) => j.verdict === "Change");
  const byEl = Object.fromEntries(judged.map((j) => [j.element, j]));
  const fromRules = (el, fallback) => (byEl[el]?.verdict === "Change" && !/^(Add|Answer|Keep|Expand)/.test(byEl[el].proposed) ? byEl[el].proposed : fallback);

  let draft;
  if (mode === "ai") {
    const text = require("./audit").strip(res.text).slice(0, 15000);
    draft = await aiDraft(page, text, issues);
  } else {
    draft = {
      title: fromRules("Title", page.title), meta: fromRules("Meta", page.desc), h1: fromRules("H1", page.h1s[0] || ""),
      intro: page.firstP, faq: page.qHeads.slice(0, 5).map((q) => ({ q, a: "" })),
    };
  }

  const why = (el) => byEl[el]?.verdict === "Change" ? byEl[el].proposed : "Already fine — optional polish";
  const items = [
    { element: "Title", before: page.title, after: draft.title, why: why("Title") },
    { element: "Meta description", before: page.desc, after: draft.meta, why: why("Meta") },
    { element: "H1", before: page.h1s[0] || "", after: draft.h1, why: why("H1") },
    { element: "Intro", before: page.firstP, after: draft.intro, why: why("Intro") },
  ].filter((i) => i.after && i.after !== i.before);
  const faq = draft.faq.filter((f) => f.q);
  if (faq.length) items.push({ element: "FAQ", before: page.faq ? "FAQ present" : "", after: faq.map((f) => `Q: ${f.q}\nA: ${f.a || "(write the answer)"}`).join("\n\n"), why: why("FAQ") });
  if (faq.length && faq.every((f) => f.a)) items.push({ element: "FAQ schema (JSON-LD)", before: "", after: faqJsonLd(faq), why: "Lets Google and AI engines read your Q&A directly" });
  if (!page.schema.length) items.push({ element: "Article schema (JSON-LD)", before: "", after: articleJsonLd(page, draft), why: why("Schema") });
  if (!page.canonical) items.push({ element: "Canonical", before: "", after: `<link rel="canonical" href="${page.url}">`, why: why("Canonical") });

  return { url: page.url, mode, issues: issues.length, items: items.map((i, n) => ({ id: n + 1, status: "pending", ...i })) };
}

const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Builds a paste-ready snippet from approved items.
function exportHtml(items) {
  const ok = items.filter((i) => i.status === "approved");
  const head = [], body = [];
  for (const i of ok) {
    if (i.element === "Title") head.push(`<title>${escHtml(i.after)}</title>`);
    else if (i.element === "Meta description") head.push(`<meta name="description" content="${escHtml(i.after)}">`);
    else if (i.element === "Canonical") head.push(i.after);
    else if (i.element.endsWith("(JSON-LD)")) head.push(`<script type="application/ld+json">\n${i.after}\n</script>`);
    else if (i.element === "H1") body.push(`<h1>${escHtml(i.after)}</h1>`);
    else if (i.element === "Intro") body.push(`<p>${escHtml(i.after)}</p>`);
    else if (i.element === "FAQ") {
      body.push("<section>\n<h2>Frequently asked questions</h2>");
      for (const block of i.after.split(/\n\n+/)) {
        const [, q = "", a = ""] = block.match(/^Q:\s*(.*)\nA:\s*([\s\S]*)$/) || [];
        if (q) body.push(`<h3>${escHtml(q)}</h3>\n<p>${escHtml(a)}</p>`);
      }
      body.push("</section>");
    }
  }
  return `<!-- In <head> -->\n${head.join("\n")}\n\n<!-- In <body> -->\n${body.join("\n")}`.trim();
}

module.exports = { rewritePage, exportHtml, SCHEMA };
