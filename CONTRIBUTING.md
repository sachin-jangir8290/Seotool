# Contributing to SEOTool

Thanks for helping! Every new agent makes the tool better for everyone.

## Run it locally

```bash
npm install
npm start        # http://localhost:3000
npm test
```

Node 22.5+ is required (uses the built-in `node:sqlite`).

## Add a new agent in one file (plugins)

Drop a `.js` file into `plugins/`. It is loaded automatically at start-up and appears in the dashboard's
"New agent" list. See `plugins/keyword-cannibalization.js` for a full example.

```js
const { num, need } = require("../server/analyzers");

module.exports = {
  analyzers: {
    "my-agent": {
      label: "My agent",
      columns: "col_a, col_b",            // shown to users
      sample: "col_a,col_b\nx,1",          // "Load sample data" button
      run(rows, opts) {                    // rows = parsed CSV, keys are lowercase_snake
        need(rows, ["col_a", "col_b"]);
        const out = rows.filter((r) => num(r.col_b) > 0);
        return { summary: `${out.length} rows flagged`, columns: ["col_a", "col_b"], rows: out };
      },
    },
  },
};
```

Please add a test in `test/` for your agent.

## Where things live

| Path | What |
|---|---|
| `public/` | Front end (landing page, guide, dashboard) — plain HTML/CSS/JS, no build step |
| `server/index.js` | Express API routes |
| `server/analyzers.js` | Built-in CSV agents + plugin loader |
| `server/blitz.js` | Blitz rules engine (SEO/GEO judgments, ad teardown) |
| `server/audit.js` | SEO audit and AI-visibility check |
| `server/engines.js`, `server/citations.js` | AI citation tracking (Claude, ChatGPT, Gemini, Perplexity) |
| `server/scheduler.js` | Scheduled runs, alerts (dashboard, webhook, email) |
| `server/ai.js` | Claude-powered agents and assistant (optional) |
| `plugins/` | Community agents |

## Pull requests

1. Fork and create a branch.
2. Keep changes focused; match the style of the surrounding code.
3. Run `npm test`.
4. Open a PR describing what changed and how you tested it.

## Good first issues

- New Blitz rules (e.g. hreflang, broken links, Core Web Vitals hints)
- New plugins (Google Ads Quality Score, Meta placement analysis, GA4 landing pages)
- Translations of the UI
