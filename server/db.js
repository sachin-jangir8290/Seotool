const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, "..", "seotool.db"));

db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, pass_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, list TEXT NOT NULL,
    state TEXT NOT NULL, PRIMARY KEY (user_id, list));
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, kind TEXT NOT NULL, channel TEXT, role TEXT, rules TEXT, cadence TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    status TEXT NOT NULL, summary TEXT, result TEXT, approved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS audits (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, url TEXT NOT NULL, score INTEGER, result TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

module.exports = db;
