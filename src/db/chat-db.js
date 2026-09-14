// chat.db — 봇이 읽는 대화 저장소. minidiscord 표 여섯을 이름 · 열 그대로 둔다 (ADR-003 · 004).
//
// 스키마 출처: minidiscord server/src/db.ts:9-65 (핀 6633f7b). 여덟 표 가운데 하네스가 읽는 여섯만 만든다 —
// sessions(로그인)는 cockpit.db 의 web_sessions 가, room_bots(배달 커서)는 cockpit.db 의 bot_inbox 가 대신한다.
// 열을 더하지도 빼지도 않는다. prodev 의 chat.js · pre-reply.js · places.js 가 이 열에 직접 묶여 있다.
//
// 쓰는 것은 cockpit 서버뿐이다. 봇은 MINIDISCORD_DB 로 이 파일을 readOnly 로 연다.

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseMentions } from '../envelope/mention.js';

export const CHAT_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);
CREATE TABLE IF NOT EXISTS bots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  token TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'worker',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  author_type TEXT NOT NULL CHECK (author_type IN ('user','bot','system')),
  author_user_id INTEGER REFERENCES users(id),
  author_bot_id INTEGER REFERENCES bots(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS message_targets (
  message_id INTEGER NOT NULL REFERENCES messages(id),
  bot_id INTEGER NOT NULL REFERENCES bots(id),
  delivery TEXT NOT NULL CHECK (delivery IN ('to','cc'))
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id),
  filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, id);
CREATE INDEX IF NOT EXISTS idx_targets_bot ON message_targets(bot_id, message_id);
`;

// 확장자 → MIME. minidiscord routes-messages.ts 의 표 그대로. 없으면 application/octet-stream
const MIME = {
  '.txt': 'text/plain', '.log': 'text/plain', '.md': 'text/markdown', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.pdf': 'application/pdf',
  '.json': 'application/json', '.csv': 'text/csv', '.zip': 'application/zip',
};
export const mimeOf = filename => MIME[path.extname(String(filename)).toLowerCase()] ?? 'application/octet-stream';

// 과제 하나 = 방 둘 (prodev ADR-022). 이름의 첫 '/' 가 갈래다 — prodev places.js 의 roomParts 와 같은 규칙.
export const mainRoomName = project => `prodev-${project}`;
export const filesRoomName = project => `prodev-${project}/files`;
export function roomParts(name) {
  const s = String(name ?? '');
  const i = s.indexOf('/');
  return i < 0 ? { head: s, branch: null } : { head: s.slice(0, i), branch: s.slice(i + 1) };
}

// 부르는 쪽(HTTP · CLI)이 상태 코드로 옮기는 오류. code 가 까닭이다.
export class ChatError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

// 작성자 이름 — author_type 별 풀이 (minidiscord routes-messages.ts displayName · 결합 재고 C.4)
const AUTHOR = `CASE m.author_type
  WHEN 'user' THEN COALESCE(u.username, '사용자')
  WHEN 'bot' THEN COALESCE(b.name, '(삭제된 봇)')
  ELSE '시스템' END`;
const FROM = `FROM messages m LEFT JOIN users u ON u.id = m.author_user_id LEFT JOIN bots b ON b.id = m.author_bot_id`;

export class ChatDb {
  constructor(file) {
    this.file = path.resolve(file);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(CHAT_SCHEMA);
  }

  close() { this.db.close(); }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  // ── stored_path ────────────────────────────────────────
  // prodev chat.js:193 이 path.resolve(dirname(DB), '..', stored_path) 로 푼다. 그래서 기준은 DB 폴더의 부모다
  // (meta D0 Q2 — chat.js 가 진실). 드라이브가 다르면 path.relative 가 절대 경로를 내고, resolve 는 그것도 푼다.
  storedPathFor(absPath) { return path.relative(path.dirname(path.dirname(this.file)), path.resolve(absPath)); }
  resolveStored(stored) { return path.resolve(path.dirname(this.file), '..', stored); }

  // ── 사람 · 봇 · 방 ─────────────────────────────────────
  ensureUser(username) {
    this.db.prepare('INSERT OR IGNORE INTO users (username) VALUES (?)').run(username);
    return this.db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
  }
  userById(id) { return this.db.prepare('SELECT id, username FROM users WHERE id = ?').get(id); }

  // token 은 UNIQUE NOT NULL 이라 봇마다 다른 uuid 를 넣는다. cockpit 은 이 값을 쓰지 않는다.
  createBot(name, description = '') {
    const r = this.db.prepare("INSERT INTO bots (name, description, token, role) VALUES (?, ?, ?, 'orchestrator')")
      .run(name, description, randomUUID());
    return this.botById(Number(r.lastInsertRowid));
  }
  botById(id) { return this.db.prepare('SELECT id, name FROM bots WHERE id = ?').get(id); }
  botByName(name) { return this.db.prepare('SELECT id, name FROM bots WHERE name = ?').get(name); }

  createRoom(name) {
    const r = this.db.prepare('INSERT INTO rooms (name) VALUES (?)').run(name);
    return this.roomById(Number(r.lastInsertRowid));
  }
  roomById(id) {
    return this.db.prepare('SELECT id, name, status, created_at, archived_at FROM rooms WHERE id = ?').get(Number(id));
  }
  roomByName(name) {
    return this.db.prepare('SELECT id, name, status, created_at, archived_at FROM rooms WHERE name = ? ORDER BY id DESC LIMIT 1').get(name);
  }
  listRooms() {
    const rows = this.db.prepare('SELECT id, name, status, created_at, archived_at FROM rooms ORDER BY id DESC').all();
    return { active: rows.filter(r => r.status === 'active'), archived: rows.filter(r => r.status === 'archived') };
  }
  projectRooms(project) {
    return { main: this.roomByName(mainRoomName(project)), files: this.roomByName(filesRoomName(project)) };
  }

  // 과제 열기: 봇 한 줄 · 방 둘. 이미 있으면 ChatError(EXISTS).
  openProject(project, botName) {
    return this.tx(() => {
      if (this.roomByName(mainRoomName(project))) throw new ChatError('EXISTS', `과제가 이미 있다: ${project}`, 409);
      if (this.botByName(botName)) throw new ChatError('EXISTS', `봇이 이미 있다: ${botName}`, 409);
      const bot = this.createBot(botName, `prodev ${project} bot`);
      return { bot, main: this.createRoom(mainRoomName(project)), files: this.createRoom(filesRoomName(project)) };
    });
  }

  // ── 봉투 → 대상 (ARCHITECTURE 4.3) ─────────────────────
  // bot: 이 방의 봇 { id, name }. 방마다 봇은 하나다.
  resolveTargets(room, bot, body) {
    const mentions = parseMentions(body);
    if (mentions.length === 0) {
      // 본방에서 봉투 없는 글은 to (사람 결정). 파일방은 minidiscord 처럼 아무에게도 안 간다.
      return { targets: roomParts(room.name).branch === null ? [{ botId: bot.id, name: bot.name, delivery: 'to' }] : [], unknown: [] };
    }
    const targets = []; const unknown = [];
    for (const m of mentions) {
      if (m.bot === bot.name) targets.push({ botId: bot.id, name: bot.name, delivery: m.delivery });
      else unknown.push(m.bot);
    }
    return { targets, unknown };
  }

  // ── 글 넣기 ────────────────────────────────────────────
  // files: [{ filename, absPath, size, mime? }] — 이미 uploads 에 쓴 파일. 한 트랜잭션에 글 · 첨부 · 대상.
  insertUserMessage({ roomId, userId, body, files = [], bot }) {
    const room = this.roomById(roomId);
    if (!room) throw new ChatError('NO_ROOM', '방을 찾을 수 없습니다', 404);
    if (room.status === 'archived') throw new ChatError('ARCHIVED', '보관된 방에는 메시지를 보낼 수 없습니다', 409);
    const text = String(body ?? '');
    if (!text.trim() && files.length === 0) throw new ChatError('EMPTY', '내용이나 파일이 필요합니다', 400);
    const { targets, unknown } = this.resolveTargets(room, bot, text);
    if (unknown.length) throw new ChatError('UNKNOWN_BOT', `${unknown.join(', ')} 봇은 이 방에 초대되지 않았습니다`, 400);

    const id = this.tx(() => {
      const r = this.db.prepare("INSERT INTO messages (room_id, author_type, author_user_id, body) VALUES (?, 'user', ?, ?)")
        .run(room.id, userId, text);
      const messageId = Number(r.lastInsertRowid);
      this.#insertAttachments(messageId, files);
      const ins = this.db.prepare('INSERT INTO message_targets (message_id, bot_id, delivery) VALUES (?, ?, ?)');
      for (const t of targets) ins.run(messageId, t.botId, t.delivery);
      return messageId;
    });
    return { message: this.messageById(id), targets };
  }

  insertBotMessage({ roomId, botId, body, files = [] }) {
    const id = this.tx(() => {
      const r = this.db.prepare("INSERT INTO messages (room_id, author_type, author_bot_id, body) VALUES (?, 'bot', ?, ?)")
        .run(Number(roomId), botId, String(body ?? ''));
      const messageId = Number(r.lastInsertRowid);
      this.#insertAttachments(messageId, files);
      return messageId;
    });
    return this.messageById(id);
  }

  insertSystemMessage(roomId, body) {
    const r = this.db.prepare("INSERT INTO messages (room_id, author_type, body) VALUES (?, 'system', ?)").run(Number(roomId), String(body));
    return this.messageById(Number(r.lastInsertRowid));
  }

  #insertAttachments(messageId, files) {
    const ins = this.db.prepare('INSERT INTO attachments (message_id, filename, stored_path, size, mime) VALUES (?, ?, ?, ?, ?)');
    for (const f of files) ins.run(messageId, f.filename, this.storedPathFor(f.absPath), f.size, f.mime ?? mimeOf(f.filename));
  }

  // ── 읽기 ───────────────────────────────────────────────
  // 응답 모양은 minidiscord 와 같다. stored_path 는 내보내지 않는다 (sync-audit F-02).
  messageById(id) {
    const row = this.db.prepare(`SELECT m.*, ${AUTHOR} AS author_name ${FROM} WHERE m.id = ?`).get(Number(id));
    return row ? { ...row, attachments: this.db.prepare('SELECT id, filename FROM attachments WHERE message_id = ?').all(row.id) } : null;
  }

  messagesAfter(roomId, after = 0, limit = 200) {
    const rows = this.db.prepare(`SELECT m.*, ${AUTHOR} AS author_name ${FROM} WHERE m.room_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT ?`)
      .all(Number(roomId), Number(after) || 0, limit);
    const att = this.db.prepare('SELECT id, filename FROM attachments WHERE message_id = ?');
    return rows.map(r => ({ ...r, attachments: att.all(r.id) }));
  }

  // 첨부의 절대 경로 — 봇에게 주는 봉투 · 받기 길이 쓴다
  attachmentsOf(messageId) {
    return this.db.prepare('SELECT id, filename, stored_path, size, mime FROM attachments WHERE message_id = ? ORDER BY id').all(Number(messageId))
      .map(a => ({ ...a, path: this.resolveStored(a.stored_path) }));
  }

  // fetch_history 의 재료. 거르기(since_id · since · until · speaker)를 limit 보다 먼저 건다 — OD-9 를 물려받지 않는다.
  // since_id 가 있으면 그 뒤의 오래된 것부터 limit 개(커서로 이어 읽기), 없으면 최근 limit 개. 둘 다 id 오름차순으로 낸다.
  history({ roomId, sinceId, since, until, speaker, limit }) {
    const where = ['m.room_id = ?']; const args = [Number(roomId)];
    if (sinceId != null) { where.push('m.id > ?'); args.push(Number(sinceId)); }
    if (since != null) { where.push('m.created_at >= ?'); args.push(String(since)); }
    if (until != null) { where.push('m.created_at < ?'); args.push(String(until)); }
    if (speaker != null) { where.push(`${AUTHOR} = ?`); args.push(String(speaker)); }
    const lim = Math.min(Number(limit ?? 100) || 100, 500);
    const order = sinceId != null ? 'ASC' : 'DESC';
    const rows = this.db.prepare(`SELECT m.id, m.body, m.created_at, ${AUTHOR} AS author_name ${FROM} WHERE ${where.join(' AND ')} ORDER BY m.id ${order} LIMIT ?`)
      .all(...args, lim);
    return order === 'DESC' ? rows.reverse() : rows;
  }
}
