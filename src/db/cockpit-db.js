// cockpit.db — 봇이 못 보는 조종석 저장소. 표 여섯 (ARCHITECTURE 3.2 · ADR-003).
//
// 봇 설정에는 이 파일의 경로가 없고 deny 에 들어간다. 다만 deny 는 벽이 아니라서(Bash(node:*) 스크립트는 연다)
// 여기에는 해시만 둔다: 비밀번호는 scrypt(auth/password.js), 쿠키는 SHA-256. 새어도 로그인이나 살아 있는 쿠키가 안 나온다.

import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SESSION_STATES = ['stopped', 'starting', 'idle', 'working', 'waiting_approval', 'error'];
export const PERMISSION_BEHAVIORS = ['allow', 'allow_session', 'deny', 'timeout', 'cancelled'];

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
const list = xs => xs.map(x => `'${x}'`).join(',');

export const COCKPIT_SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  user_id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  pw_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS web_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_sessions (
  project TEXT PRIMARY KEY,
  bot_id INTEGER NOT NULL,
  bot_dir TEXT NOT NULL,
  session_id TEXT,
  state TEXT NOT NULL DEFAULT 'stopped' CHECK (state IN (${list(SESSION_STATES)})),
  started_at TEXT,
  last_result_at TEXT,
  cost_usd REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT ${NOW},
  type TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS permission_requests (
  tool_use_id TEXT PRIMARY KEY,
  agent_id TEXT,
  project TEXT NOT NULL,
  tool TEXT NOT NULL,
  input_json TEXT NOT NULL,
  card_json TEXT NOT NULL,
  asked_at TEXT NOT NULL DEFAULT ${NOW},
  answered_by TEXT,
  behavior TEXT CHECK (behavior IS NULL OR behavior IN (${list(PERMISSION_BEHAVIORS)})),
  answered_at TEXT
);
CREATE TABLE IF NOT EXISTS bot_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  bot_id INTEGER NOT NULL,
  delivery TEXT NOT NULL CHECK (delivery IN ('to','cc')),
  queued_at TEXT NOT NULL DEFAULT ${NOW},
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_project ON session_events(project, id);
CREATE INDEX IF NOT EXISTS idx_inbox_pending ON bot_inbox(bot_id, delivered_at, id);
`;

export const hashToken = token => createHash('sha256').update(String(token)).digest('hex');
const iso = ms => new Date(ms).toISOString();

export class CockpitDb {
  constructor(file) {
    this.file = path.resolve(file);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(COCKPIT_SCHEMA);
  }

  close() { this.db.close(); }

  // ── 계정 ───────────────────────────────────────────────
  createAccount({ userId, role, pwHash }) {
    this.db.prepare('INSERT INTO accounts (user_id, role, pw_hash) VALUES (?, ?, ?)').run(userId, role, pwHash);
    return this.account(userId);
  }
  account(userId) { return this.db.prepare('SELECT user_id, role, pw_hash, created_at FROM accounts WHERE user_id = ?').get(userId); }
  accounts() { return this.db.prepare('SELECT user_id, role, created_at FROM accounts ORDER BY user_id').all(); }
  hasAdmin() { return !!this.db.prepare("SELECT 1 FROM accounts WHERE role = 'admin' LIMIT 1").get(); }
  deleteAccount(userId) { this.db.prepare('DELETE FROM accounts WHERE user_id = ?').run(userId); }
  setPasswordHash(userId, pwHash) { this.db.prepare('UPDATE accounts SET pw_hash = ? WHERE user_id = ?').run(pwHash, userId); }
  deleteWebSessionsOf(userId) { this.db.prepare('DELETE FROM web_sessions WHERE user_id = ?').run(userId); }

  // 쿠키 값 원문은 돌려주기만 하고 저장하지 않는다
  createWebSession(userId, { ttlMs = 7 * 24 * 3600 * 1000, now = Date.now() } = {}) {
    const token = randomBytes(32).toString('hex');
    this.db.prepare('INSERT INTO web_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), userId, iso(now + ttlMs));
    return token;
  }
  webSessionUserId(token, { now = Date.now() } = {}) {
    const row = this.db.prepare('SELECT user_id, expires_at FROM web_sessions WHERE token_hash = ?').get(hashToken(token));
    return row && row.expires_at > iso(now) ? row.user_id : null;
  }
  deleteWebSession(token) { this.db.prepare('DELETE FROM web_sessions WHERE token_hash = ?').run(hashToken(token)); }

  // ── 세션 ───────────────────────────────────────────────
  createAgentSession({ project, botId, botDir }) {
    this.db.prepare('INSERT INTO agent_sessions (project, bot_id, bot_dir) VALUES (?, ?, ?)').run(project, botId, botDir);
    return this.agentSession(project);
  }
  agentSession(project) { return this.db.prepare('SELECT * FROM agent_sessions WHERE project = ?').get(project); }
  agentSessions() { return this.db.prepare('SELECT * FROM agent_sessions ORDER BY project').all(); }
  setState(project, state) { this.db.prepare('UPDATE agent_sessions SET state = ? WHERE project = ?').run(state, project); }
  setSessionId(project, sessionId) {
    this.db.prepare('UPDATE agent_sessions SET session_id = ?, started_at = COALESCE(started_at, ?) WHERE project = ?').run(sessionId, iso(Date.now()), project);
  }
  recordResult(project, costUsd) {
    this.db.prepare('UPDATE agent_sessions SET last_result_at = ?, cost_usd = cost_usd + ? WHERE project = ?').run(iso(Date.now()), Number(costUsd) || 0, project);
  }

  // ── 사건 ───────────────────────────────────────────────
  addEvent(project, type, data) {
    const r = this.db.prepare('INSERT INTO session_events (project, type, json) VALUES (?, ?, ?)').run(project, type, JSON.stringify(data ?? {}));
    return Number(r.lastInsertRowid);
  }
  eventsAfter(project, after = 0, limit = 500) {
    return this.db.prepare('SELECT id, project, at, type, json FROM session_events WHERE project = ? AND id > ? ORDER BY id LIMIT ?')
      .all(project, Number(after) || 0, limit).map(r => ({ ...r, data: JSON.parse(r.json) }));
  }

  // ── 승인 ───────────────────────────────────────────────
  insertPermission({ toolUseId, agentId, project, tool, input, card }) {
    this.db.prepare('INSERT INTO permission_requests (tool_use_id, agent_id, project, tool, input_json, card_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(toolUseId, agentId ?? null, project, tool, JSON.stringify(input ?? {}), JSON.stringify(card ?? {}));
  }
  // 요청마다 첫 답이 이긴다: 아직 답이 없을 때만 바뀐다. true = 이 답이 먹혔다
  answerPermission(toolUseId, { behavior, answeredBy }) {
    const r = this.db.prepare('UPDATE permission_requests SET behavior = ?, answered_by = ?, answered_at = ? WHERE tool_use_id = ? AND answered_at IS NULL')
      .run(behavior, answeredBy ?? null, iso(Date.now()), toolUseId);
    return Number(r.changes) === 1;
  }
  permission(toolUseId) { return this.db.prepare('SELECT * FROM permission_requests WHERE tool_use_id = ?').get(toolUseId); }
  recentPermissions(limit = 100) {
    return this.db.prepare('SELECT * FROM permission_requests ORDER BY asked_at DESC LIMIT ?').all(limit);
  }
  pendingPermissions(project) {
    const rows = project == null
      ? this.db.prepare('SELECT * FROM permission_requests WHERE answered_at IS NULL ORDER BY asked_at').all()
      : this.db.prepare('SELECT * FROM permission_requests WHERE answered_at IS NULL AND project = ? ORDER BY asked_at').all(project);
    return rows;
  }

  // ── 큐 ─────────────────────────────────────────────────
  enqueue(messageId, botId, delivery) {
    this.db.prepare('INSERT INTO bot_inbox (message_id, bot_id, delivery) VALUES (?, ?, ?)').run(messageId, botId, delivery);
  }
  pendingInbox(botId, limit = 20) {
    return this.db.prepare('SELECT id, message_id, bot_id, delivery, queued_at FROM bot_inbox WHERE bot_id = ? AND delivered_at IS NULL ORDER BY id LIMIT ?')
      .all(botId, limit);
  }
  markDelivered(ids) {
    const up = this.db.prepare('UPDATE bot_inbox SET delivered_at = ? WHERE id = ?');
    const at = iso(Date.now());
    for (const id of ids) up.run(at, id);
  }
}
