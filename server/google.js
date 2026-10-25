// Google connection (OAuth 2.0) + Search Console data, via plain HTTPS calls.
// Tokens are stored encrypted with SECRET_KEY (AES-256-GCM).
const crypto = require("crypto");
const db = require("./db");

db.exec(`
  CREATE TABLE IF NOT EXISTS connections (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL,
    account TEXT, tokens TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, provider));
  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
`);

// Endpoints are overridable so tests can point them at a local fake.
const URLS = {
  auth: () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
  token: () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
  revoke: () => process.env.GOOGLE_REVOKE_URL || "https://oauth2.googleapis.com/revoke",
  gsc: () => process.env.GSC_API_URL || "https://www.googleapis.com/webmasters/v3",
};
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly", "openid", "email"];

const configured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SECRET_KEY);
const redirectUri = () => `${(process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "")}/api/google/callback`;

// ---------- encryption ----------
const key = () => crypto.createHash("sha256").update(String(process.env.SECRET_KEY)).digest();
function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}
function open(s) {
  const [iv, tag, data] = s.split(".").map((b) => Buffer.from(b, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString("utf8"));
}

// ---------- OAuth ----------
function authUrl(userId) {
  const state = crypto.randomBytes(24).toString("hex");
  db.prepare("DELETE FROM oauth_states WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO oauth_states (state, user_id, expires_at) VALUES (?, ?, ?)").run(state, userId, Date.now() + 10 * 60000);
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: "code",
    scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `${URLS.auth()}?${q}`;
}

async function tokenRequest(params) {
  const res = await fetch(URLS.token(), {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `token HTTP ${res.status}`);
  return data;
}

const emailFromIdToken = (idToken) => {
  try { return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()).email || null; } catch { return null; }
};

async function handleCallback({ code, state, userId }) {
  const row = db.prepare("SELECT * FROM oauth_states WHERE state = ?").get(String(state || ""));
  db.prepare("DELETE FROM oauth_states WHERE state = ?").run(String(state || ""));
  if (!row || row.expires_at < Date.now() || row.user_id !== userId) throw new Error("Login link expired or invalid — try connecting again");
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("Google did not return a refresh token — remove SEOTool from your Google account permissions and connect again");
  const tokens = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + (t.expires_in - 60) * 1000 };
  db.prepare(`INSERT INTO connections (user_id, provider, account, tokens) VALUES (?, 'google', ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET account = excluded.account, tokens = excluded.tokens`).run(userId, emailFromIdToken(t.id_token || ""), seal(tokens));
}

function connection(userId) {
  const row = db.prepare("SELECT account, tokens, created_at FROM connections WHERE user_id = ? AND provider = 'google'").get(userId);
  return row ? { account: row.account, created_at: row.created_at, tokens: open(row.tokens) } : null;
}

async function accessToken(userId) {
  const c = connection(userId);
  if (!c) throw new Error("Google is not connected");
  if (c.tokens.expires_at > Date.now()) return c.tokens.access_token;
  const t = await tokenRequest({ refresh_token: c.tokens.refresh_token, grant_type: "refresh_token" });
  const tokens = { ...c.tokens, access_token: t.access_token, expires_at: Date.now() + (t.expires_in - 60) * 1000 };
  db.prepare("UPDATE connections SET tokens = ? WHERE user_id = ? AND provider = 'google'").run(seal(tokens), userId);
  return tokens.access_token;
}

async function disconnect(userId) {
  const c = connection(userId);
  if (!c) return;
  await fetch(`${URLS.revoke()}?token=${encodeURIComponent(c.tokens.refresh_token)}`, { method: "POST", signal: AbortSignal.timeout(10000) }).catch(() => {});
  db.prepare("DELETE FROM connections WHERE user_id = ? AND provider = 'google'").run(userId);
}

// ---------- Search Console ----------
async function gsc(userId, path, body) {
  const res = await fetch(URLS.gsc() + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${await accessToken(userId)}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Search Console HTTP ${res.status}`);
  return data;
}

async function sites(userId) {
  const d = await gsc(userId, "/sites");
  return (d.siteEntry || []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => s.siteUrl).sort();
}

const day = (offset) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);
const query = (userId, site, body) => gsc(userId, `/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { rowLimit: 5000, ...body });
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const toCsv = (cols, rows) => [cols.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");

// Search Console data lags ~3 days, so periods end 3 days ago.
async function report(userId, site, kind, days = 28) {
  if (kind === "click-loss") {
    const cur = { startDate: day(days + 2), endDate: day(3) };
    const prev = { startDate: day(2 * days + 2), endDate: day(days + 3) };
    const [a, b] = await Promise.all([query(userId, site, { ...cur, dimensions: ["page"] }), query(userId, site, { ...prev, dimensions: ["page"] })]);
    const map = new Map();
    for (const r of b.rows || []) map.set(r.keys[0], { now: 0, before: r.clicks });
    for (const r of a.rows || []) map.set(r.keys[0], { ...(map.get(r.keys[0]) || { before: 0 }), now: r.clicks });
    const path = (u) => { try { return new URL(u).pathname; } catch { return u; } };
    return { csv: toCsv(["page", "clicks_current", "clicks_previous"], [...map].map(([p, v]) => [path(p), v.now, v.before])), rows: map.size, period: `${cur.startDate} → ${cur.endDate} vs ${prev.startDate} → ${prev.endDate}` };
  }
  if (kind === "cannibalization" || kind === "queries") {
    const range = { startDate: day(days + 2), endDate: day(3) };
    const d = await query(userId, site, { ...range, dimensions: ["query", "page"] });
    const path = (u) => { try { return new URL(u).pathname; } catch { return u; } };
    const rows = (d.rows || []).map((r) => [r.keys[0], path(r.keys[1]), r.clicks, r.impressions, Math.round(r.position * 10) / 10]);
    return { csv: toCsv(["query", "page", "clicks", "impressions", "position"], rows), rows: rows.length, period: `${range.startDate} → ${range.endDate}` };
  }
  throw new Error("Unknown report");
}

module.exports = { configured, redirectUri, authUrl, handleCallback, connection, accessToken, disconnect, sites, report, seal, open, URLS };
