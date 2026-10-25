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
- **AI citation tracking** — asks Claude, ChatGPT, Gemini and Perplexity your buyer questions; shows citation rate, position, sentiment, whether your site is cited, and who gets named instead (each engine runs only when its API key is set)
- **Google connection (Search Console + GA4)** — OAuth, read-only, tokens encrypted at rest; import live data straight into agents: click-loss and cannibalization (Search Console), landing pages and **AI-assistant referrals** — visits and key events from ChatGPT, Perplexity, Claude, Gemini, Copilot (GA4)
- **✎ Page rewriter** — turns Blitz "Change" verdicts into drafts (title, meta, H1, answer-first intro, FAQ, FAQ/Article schema, canonical) with Claude or free rules mode; edit, approve or reject each one and copy the approved HTML
- **Schedules & alerts** — run SEO audits, AI visibility, Blitz and AI-citation tracking hourly/daily/weekly/monthly; get an alert in the dashboard, on Slack/Discord (webhook) or by email when a score moves past your threshold
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
| `ANTHROPIC_API_KEY` | Custom AI agents, Assistant, Claude citation tracking |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | ChatGPT citation tracking (default model `gpt-4o-mini`) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Gemini citation tracking (default `gemini-2.5-flash`) |
| `PERPLEXITY_API_KEY` / `PERPLEXITY_MODEL` | Perplexity citation tracking (default `sonar`) |
| `NODE_ENV=production` | Secure cookies (serve over HTTPS) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app for Search Console (see below) |
| `SECRET_KEY` | Long random string; encrypts stored OAuth tokens |
| `PUBLIC_URL` | Public address of your server, e.g. `https://seo.example.com` (used for the OAuth redirect) |
| `SMTP_URL` / `SMTP_FROM` | Email alerts, e.g. `smtps://user:pass@smtp.example.com` |
| `SCHEDULER=off` | Disable the built-in scheduler (e.g. on extra replicas) |
| `PLUGINS_DIR` | Extra plugin folder (default `./plugins`) |
| `AUDIT_ALLOW_PRIVATE=1` | Let audits reach localhost/private IPs (development only) |

## Connect Google (Search Console + GA4)

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project and enable the **Google Search Console API**, **Google Analytics Admin API** and **Google Analytics Data API**.
2. *APIs & Services → OAuth consent screen*: choose **External**, add the scopes `.../auth/webmasters.readonly` and `.../auth/analytics.readonly`, and add yourself as a test user.
3. *Credentials → Create credentials → OAuth client ID → Web application*. Add the redirect URI shown on the dashboard's Connections card: `PUBLIC_URL/api/google/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SECRET_KEY` and `PUBLIC_URL`, restart, then click **Connect Google** on the Overview tab.

## Extend it

Add a new agent by dropping one file into `plugins/` — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- [x] Real AI citation tracking (ask ChatGPT, Claude, Gemini, Perplexity)
- [x] Live connections: Search Console, GA4
- [ ] Live connections: Google Ads, Meta Ads
- [x] Scheduled runs with email / Slack alerts
- [x] One-click AI rewrites for Blitz "Change" verdicts
- [ ] Keyword research and rank tracking
- [ ] Multi-client agency mode and white-label reports
- [ ] UI translations (Hindi first)

## License

[MIT](LICENSE)
