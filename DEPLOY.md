# Deploying Citeloop

Citeloop is one Node.js process with a SQLite file. Anything that runs a Docker container **and keeps a disk** works.
The built-in scheduler runs inside the server, so the server must stay on 24/7 (no "sleep on idle" plans).

| Option | Cost (approx.) | Effort |
|---|---|---|
| **Render** (Blueprint) | Starter plan + 1 GB disk | Easiest |
| **Railway** | Usage-based + volume | Easy |
| **Any VPS** (Hetzner, DigitalOcean, Lightsail…) with Docker | Cheapest | Medium |

> Free tiers that sleep or have no persistent disk will lose your database on restart and stop scheduled runs.

## 1. Render

1. Push this repo to GitHub.
2. On [render.com](https://render.com): **New → Blueprint** → choose the repo. Render reads `render.yaml`.
3. After the first deploy, open the service → **Environment** and set:
   - `PUBLIC_URL` = your Render URL, e.g. `https://seotool.onrender.com`
   - optional keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_URL`
4. Open the URL, create your account, then set `ALLOW_SIGNUP=false` if the tool is only for you or your team.

`SECRET_KEY` is generated automatically. **Never change it later** — stored Google tokens are encrypted with it.

## 2. Railway

1. [railway.com](https://railway.com) → **New Project → Deploy from GitHub repo**. Railway uses `railway.json` and the `Dockerfile`.
2. Service → **Volumes → Add volume**, mount path `/data`.
3. **Variables**: `DB_PATH=/data/seotool.db`, `NODE_ENV=production`, `SECRET_KEY=<long random string>`, `PUBLIC_URL=https://<your-app>.up.railway.app`, plus any optional keys.
4. **Settings → Networking → Generate domain.**

## 3. VPS with Docker

```bash
git clone https://github.com/<you>/Seotool.git && cd Seotool
cp .env.example .env        # fill in SECRET_KEY, PUBLIC_URL and any API keys
docker compose up -d --build   # app listens on 127.0.0.1:3000 only
```

Put HTTPS in front with [Caddy](https://caddyserver.com) (automatic certificates):

```
seo.example.com {
  reverse_proxy localhost:3000
}
```

Set `NODE_ENV=production` in `.env` once HTTPS works (cookies become secure-only).

## After deploying

- [ ] `https://<your-domain>/healthz` returns `{"ok":true}`
- [ ] You can sign up and log in
- [ ] `ALLOW_SIGNUP=false` if the server is private
- [ ] Google Cloud OAuth client has the redirect URI `PUBLIC_URL/api/google/callback` (shown on the dashboard's Connections card)
- [ ] Back up the database: copy `/data/seotool.db` regularly (e.g. a nightly cron or your host's disk snapshots)

## Generate a SECRET_KEY

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
