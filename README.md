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

## Structure

- `public/` — guide (`index.html`) and dashboard (`dashboard.html`)
- `server/index.js` — Express API: auth, checklist progress, agents, runs, approvals
- `server/analyzers.js` — built-in agents: click-loss, search-term miner, creative fatigue, budget pacing (CSV input)
- `server/ai.js` — Claude-powered custom agent
- `server/db.js` — SQLite schema
