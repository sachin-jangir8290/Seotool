# SEOTool — open-source agentic marketing

Run **Google Ads, Meta Ads, SEO and AI search (GEO)** with a team of AI agents — free, self-hosted, and open source.

![Dashboard](screenshots/14-overview.png)

## Features

- **⚡ Blitz** — a fast rules engine that makes thousands of judgments per second at $0:
  - every SEO element on every page judged *Keep / Change* with a proposed fix
  - AI-citation chance per page and the first thing to fix
  - buyer questions matched to your pages (*Answered / Weak / No page*)
  - competitor pages worth copying (*Steal / Skip*)
  - ad teardown: hook, format, offer, awareness, driver, CTA, claim risk → patterns that survive → briefs
- **SEO audit** — 14 on-page checks with a 0–100 score
- **AI visibility (GEO)** — AI crawler access (GPTBot, ClaudeBot, PerplexityBot…), llms.txt, schema, answer-friendly content
- **Agents** — built-in CSV agents (click-loss, search-term miner, creative fatigue, budget pacing) + plugins + custom Claude agents
- **Approval queue** — agents propose, you approve or reject; every run is logged and exportable as CSV
- **Assistant** — chat about your runs and audits (needs `ANTHROPIC_API_KEY`)
- **Agentic marketing guide** — 17 interactive sheets with checklists saved to your account

| Blitz: SEO + GEO | Blitz: ad teardown |
|---|---|
| ![](screenshots/15-blitz-seo-geo.png) | ![](screenshots/16-blitz-ads.png) |

## Quick start

**Docker**

```bash
docker compose up --build    # http://localhost:3000
```

**Node 22.5+**

```bash
npm install
npm start                    # http://localhost:3000
npm test
```

Copy `.env.example` to `.env` (or export the variables) to configure:

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default 3000) |
| `DB_PATH` | SQLite file (default `./seotool.db`) |
| `ANTHROPIC_API_KEY` | Enables custom AI agents and the Assistant |
| `NODE_ENV=production` | Secure cookies (serve over HTTPS) |
| `PLUGINS_DIR` | Extra plugin folder (default `./plugins`) |
| `AUDIT_ALLOW_PRIVATE=1` | Let audits reach localhost/private IPs (development only) |

## Extend it

Add a new agent by dropping one file into `plugins/` — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- [ ] Real AI citation tracking (ask ChatGPT, Claude, Gemini, Perplexity)
- [ ] Live connections: Search Console, Google Ads, Meta Ads, GA4
- [ ] Scheduled runs with email / Slack alerts
- [ ] One-click AI rewrites for Blitz "Change" verdicts
- [ ] Keyword research and rank tracking
- [ ] Multi-client agency mode and white-label reports
- [ ] UI translations (Hindi first)

## License

[MIT](LICENSE)
