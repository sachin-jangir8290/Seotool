# SEOTool — Agentic Marketing

Full-stack app: the agentic marketing guide plus a dashboard where you create agents, run them on your data, and approve or reject what they propose.

## Run

```bash
npm install
npm start            # http://localhost:3000
npm test
```

Requires Node 22.5+ (uses the built-in `node:sqlite`; no database server needed).

| Env var | Purpose |
|---|---|
| `PORT` | Server port (default 3000) |
| `DB_PATH` | SQLite file (default `./seotool.db`) |
| `ANTHROPIC_API_KEY` | Enables "Custom AI agent" (Claude) |
| `NODE_ENV=production` | Secure cookies (HTTPS) |
| `AUDIT_ALLOW_PRIVATE=1` | Let audits reach localhost/private IPs (dev only) |

## Structure

- `public/` — guide (`index.html`) and dashboard (`dashboard.html`)
- `server/index.js` — Express API: auth, checklist progress, agents, runs, approvals
- `server/analyzers.js` — built-in agents: click-loss, search-term miner, creative fatigue, budget pacing (CSV input)
- `server/audit.js` — SEO site audit (14 checks) and AI-search/GEO visibility check (AI crawlers, llms.txt, schema)
- `server/blitz.js` — Blitz: fast rules engine (no AI call per item) that crawls a site and judges every SEO element, scores AI-citation chance per page, matches buyer questions to pages, scores competitor pages to copy, and tears down ad copy into patterns + briefs
- `server/ai.js` — Claude-powered custom agent and marketing assistant chat
- `server/db.js` — SQLite schema
