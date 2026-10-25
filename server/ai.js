// Optional Claude-powered agent: runs the agent's role/rules over the uploaded data.
// Only enabled when credentials are configured (ANTHROPIC_API_KEY).
const Anthropic = require("@anthropic-ai/sdk");

const enabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
let client;

async function runAI(agent, data) {
  if (!enabled()) throw new Error("AI agents need ANTHROPIC_API_KEY set on the server");
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "You are a marketing agent inside an agentic marketing tool. Follow the role and rules exactly. " +
      "Only propose changes; a human approves them. Answer in concise markdown with a short summary first, then a table of proposed actions.",
    messages: [{
      role: "user",
      content: `ROLE: ${agent.role || agent.name}\nRULES: ${agent.rules || "none"}\n\nDATA:\n${data}`,
    }],
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined this request");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { summary: text.split("\n").find((l) => l.trim()) || "Done", text };
}

// Chat assistant grounded in the user's own recent agent runs and audits.
async function chat(history, context) {
  if (!enabled()) throw new Error("The assistant needs ANTHROPIC_API_KEY set on the server");
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "You are a senior performance marketer helping with Google Ads, Meta Ads, SEO and AI search (GEO). " +
      "Use the user's account context below when relevant, be specific and practical, and keep answers short.\n\n" +
      `ACCOUNT CONTEXT:\n${context || "No runs or audits yet."}`,
    messages: history,
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined this request");
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

module.exports = { runAI, chat, enabled };
