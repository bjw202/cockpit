import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChatDb } from '../src/db/chat-db.js';

// minidiscord server/src/db.ts (핀 6633f7b) 의 여섯 표 — 열 이름과 순서를 손으로 옮겨 적었다
const PINNED = {
  users: ['id', 'username', 'created_at'],
  rooms: ['id', 'name', 'status', 'created_at', 'archived_at'],
  bots: ['id', 'name', 'description', 'token', 'role', 'created_at'],
  messages: ['id', 'room_id', 'author_type', 'author_user_id', 'author_bot_id', 'body', 'created_at'],
  message_targets: ['message_id', 'bot_id', 'delivery'],
  attachments: ['id', 'message_id', 'filename', 'stored_path', 'size', 'mime'],
};

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-chatdb-'));
  const db = new ChatDb(path.join(dir, 'data', 'chat.db'));
  const { bot, main, files } = db.openProject('시험', 'prodev-시험-bot');
  const user = db.ensureUser('김과제');
  return { dir, db, bot, main, files, user };
}
const targetsOf = (db, messageId) =>
  db.db.prepare('SELECT bot_id, delivery FROM message_targets WHERE message_id = ? ORDER BY rowid').all(messageId).map(r => ({ ...r }));

test('표 여섯의 열이 minidiscord db.ts(6633f7b) 와 같다', () => {
  const { db } = fresh();
  for (const [table, cols] of Object.entries(PINNED)) {
    assert.deepEqual(db.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name), cols, table);
  }
});

test('sessions 와 room_bots 는 만들지 않는다', () => {
  const { db } = fresh();
  const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  assert.deepEqual(tables, Object.keys(PINNED).sort());
});

test('봇마다 token 이 다른 uuid 다', () => {
  const { db } = fresh();
  db.openProject('둘째', 'prodev-둘째-bot');
  const tokens = db.db.prepare('SELECT token FROM bots').all().map(r => r.token);
  assert.equal(tokens.length, 2);
  assert.notEqual(tokens[0], tokens[1]);
  for (const t of tokens) assert.match(t, /^[0-9a-f-]{36}$/);
});

test('본방 봉투 없는 글은 to 한 줄', () => {
  const { db, bot, main, user } = fresh();
  const { message } = db.insertUserMessage({ roomId: main.id, userId: user.id, body: '안녕', bot });
  assert.deepEqual(targetsOf(db, message.id), [{ bot_id: bot.id, delivery: 'to' }]);
});

test('@TO 는 to · @CC 는 cc', () => {
  const { db, bot, files, user } = fresh();
  const a = db.insertUserMessage({ roomId: files.id, userId: user.id, body: '@TO(prodev-시험-bot) 봐 주세요', bot }).message;
  const b = db.insertUserMessage({ roomId: files.id, userId: user.id, body: '@CC(prodev-시험-bot) 참고', bot }).message;
  assert.deepEqual(targetsOf(db, a.id), [{ bot_id: bot.id, delivery: 'to' }]);
  assert.deepEqual(targetsOf(db, b.id), [{ bot_id: bot.id, delivery: 'cc' }]);
});

test('같은 봇 TO+CC 는 두 줄', () => {
  const { db, bot, main, user } = fresh();
  const m = db.insertUserMessage({ roomId: main.id, userId: user.id, body: '@TO(prodev-시험-bot) @CC(prodev-시험-bot) 둘', bot }).message;
  assert.deepEqual(targetsOf(db, m.id), [{ bot_id: bot.id, delivery: 'to' }, { bot_id: bot.id, delivery: 'cc' }]);
});

test('파일방 봉투 없는 글은 행 없음', () => {
  const { db, bot, files, user } = fresh();
  const m = db.insertUserMessage({ roomId: files.id, userId: user.id, body: '그냥 올림', bot }).message;
  assert.deepEqual(targetsOf(db, m.id), []);
});

test('모르는 봇 이름은 거절하고 행을 안 남긴다', () => {
  const { db, bot, main, user } = fresh();
  assert.throws(() => db.insertUserMessage({ roomId: main.id, userId: user.id, body: '@TO(비서) 안녕', bot }),
    e => e.code === 'UNKNOWN_BOT' && e.status === 400 && /비서 봇은 이 방에 초대되지 않았습니다/.test(e.message));
  assert.equal(db.db.prepare('SELECT COUNT(*) c FROM messages').get().c, 0);
  assert.equal(db.db.prepare('SELECT COUNT(*) c FROM message_targets').get().c, 0);
});

test('stored_path 를 dirname(chat.db)/.. 기준으로 풀면 실제 파일이다', () => {
  const { dir, db, bot, files, user } = fresh();
  const abs = path.join(dir, 'uploads', 'a1b2-성적서.csv');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, 'x,y\n1,2\n');
  const { message } = db.insertUserMessage({ roomId: files.id, userId: user.id, body: '@TO(prodev-시험-bot) 자료', bot,
    files: [{ filename: '성적서.csv', absPath: abs, size: 8 }] });
  const row = db.db.prepare('SELECT stored_path, mime FROM attachments WHERE message_id = ?').get(message.id);
  assert.equal(path.isAbsolute(row.stored_path), false);
  assert.equal(path.resolve(path.dirname(db.file), '..', row.stored_path), abs);   // prodev chat.js:193 의 풀이
  assert.ok(fs.existsSync(db.attachmentsOf(message.id)[0].path));
  assert.equal(row.mime, 'text/csv');
  assert.deepEqual(message.attachments.map(a => a.filename), ['성적서.csv']);
  assert.equal('stored_path' in message.attachments[0], false);
});

test('작성자 이름: user → username · bot → name · system → 시스템', () => {
  const { db, bot, main, user } = fresh();
  const u = db.insertUserMessage({ roomId: main.id, userId: user.id, body: '사람', bot }).message;
  const b = db.insertBotMessage({ roomId: main.id, botId: bot.id, body: '봇' });
  const s = db.insertSystemMessage(main.id, '🔒 Bash 요청');
  assert.deepEqual([u, b, s].map(m => m.author_name), ['김과제', 'prodev-시험-bot', '시스템']);
  assert.deepEqual(db.messagesAfter(main.id, u.id).map(m => m.id), [b.id, s.id]);
});

test('보관 방 409 · 없는 방 404 · 빈 글 400', () => {
  const { db, bot, main, user } = fresh();
  assert.throws(() => db.insertUserMessage({ roomId: 999, userId: user.id, body: 'x', bot }), e => e.status === 404);
  assert.throws(() => db.insertUserMessage({ roomId: main.id, userId: user.id, body: '  ', bot }), e => e.status === 400);
  db.db.prepare("UPDATE rooms SET status='archived' WHERE id = ?").run(main.id);
  assert.throws(() => db.insertUserMessage({ roomId: main.id, userId: user.id, body: 'x', bot }), e => e.status === 409);
});

test('history: since_id 를 limit 보다 먼저 건다', () => {
  const { db, bot, main, user } = fresh();
  const ids = [];
  for (let i = 0; i < 10; i++) ids.push(db.insertUserMessage({ roomId: main.id, userId: user.id, body: `글${i}`, bot }).message.id);
  // since_id = 둘째 글, limit 3 → 셋째 · 넷째 · 다섯째 (최근 3개를 먼저 자르면 여덟째부터가 나온다 — OD-9)
  assert.deepEqual(db.history({ roomId: main.id, sinceId: ids[1], limit: 3 }).map(r => r.id), ids.slice(2, 5));
  // since_id 가 없으면 최근 3개를 오름차순으로
  assert.deepEqual(db.history({ roomId: main.id, limit: 3 }).map(r => r.id), ids.slice(7));
  assert.equal(db.history({ roomId: main.id, speaker: '없는사람' }).length, 0);
});
