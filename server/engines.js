// AI answer engines used for citation tracking. Each engine is enabled only when its key is set,
// and returns { text, sources: [url] } for one buyer question.
const Anthropic = require("@anthropic-ai/sdk");

const PROMPT = (q) => `${q}\n\nAnswer as you would for a shopper researching this. Recommend specific brands or websites where relevant.`;
const urlsIn = (s) => [...String(s).matchAll(/https?:\/\/[^\s)\]"'>]+/g)].map((m) => m[0]);

async function postJSON(url, headers, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

let anthropic;
const ENGINES = {
  claude: {
    label: "Claude", key: "ANTHROPIC_API_KEY",
    // Uses web search so answers reflect what Claude finds on the live web, like a real user's chat.
    async ask(q) {
      anthropic ??= new Anthropic();
      const messages = [{ role: "user", content: PROMPT(q) }];
      let response;
      for (let i = 0; i < 3; i++) {
        response = await anthropic.beta.messages.create({
          model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
          max_tokens: 16000,
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
          messages,
        });
        if (response.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: response.content });
      }
      if (response.stop_reason === "refusal") throw new Error("declined");
      const sources = [];
      let text = "";
      for (const b of response.content) {
        if (b.type === "text") { text += b.text; for (const c of b.citations || []) if (c.url) sources.push(c.url); }
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.url) sources.push(r.url);
      }
      return { text, sources: [...new Set([...sources, ...urlsIn(text)])] };
    },
  },
  chatgpt: {
    label: "ChatGPT", key: "OPENAI_API_KEY",
    async ask(q) {
      const d = await postJSON("https://api.openai.com/v1/chat/completions", { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        { model: process.env.OPENAI_MODEL || "gpt-4o-mini", messages: [{ role: "user", content: PROMPT(q) }] });
      const text = d.choices?.[0]?.message?.content || "";
      return { text, sources: urlsIn(text) };
    },
  },
  gemini: {
    label: "Gemini", key: "GEMINI_API_KEY",
    async ask(q) {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const d = await postJSON(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { "x-goog-api-key": process.env.GEMINI_API_KEY },
        { contents: [{ parts: [{ text: PROMPT(q) }] }] });
      const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      return { text, sources: urlsIn(text) };
    },
  },
  perplexity: {
    label: "Perplexity", key: "PERPLEXITY_API_KEY",
    async ask(q) {
      const d = await postJSON("https://api.perplexity.ai/chat/completions", { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
        { model: process.env.PERPLEXITY_MODEL || "sonar", messages: [{ role: "user", content: PROMPT(q) }] });
      const text = d.choices?.[0]?.message?.content || "";
      const cited = (d.search_results || []).map((r) => r.url).concat(d.citations || []);
      return { text, sources: [...new Set([...cited, ...urlsIn(text)])] };
    },
  },
};

const available = () => Object.entries(ENGINES).map(([id, e]) => ({ id, label: e.label, enabled: Boolean(process.env[e.key]), key: e.key }));

module.exports = { ENGINES, available };
