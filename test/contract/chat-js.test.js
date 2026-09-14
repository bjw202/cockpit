// 계약 시험 — 형제 저장소 prodev 의 진짜 scripts/chat.js 를 cockpit 이 만든 chat.db 에 붙인다.
// 형제는 읽기만 한다. 없으면 건너뛴다 (건너뜀은 통과로 세지 않는다 — VERIFICATION 2.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ChatDb } from '../../src/db/chat-db.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRODEV = process.env.COCKPIT_PRODEV_DIR || path.resolve(REPO, '..', 'prodev');
const CHAT_JS = path.join(PRODEV, 'scripts', 'chat.js');
const skip = fs.existsSync(CHAT_JS) ? false : `형제 prodev 없음 (${CHAT_JS})`;

function build() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-chatjs-'));
  const db = new ChatDb(path.join(dir, 'data', 'chat.db'));
  // 옛 대본과 같은 꼴의 봇 이름 (meta D0 Q6)
  const { bot, main, files } = db.openProject('worktogether', 'prodev-worktogether-비서');
  const user = db.ensureUser('김과제');
  const abs = path.join(dir, 'uploads', '3f2a-성적서.csv');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, 'lot,yield\nA,91\n');
  const a = db.insertUserMessage({ roomId: main.id, userId: user.id, body: '샤워헤드 수율 어땠지', bot }).message;
  const b = db.insertUserMessage({ roomId: files.id, userId: user.id, body: '@TO(prodev-worktogether-비서) 샤워헤드 성적서', bot,
    files: [{ filename: '성적서.csv', absPath: abs, size: 16 }] }).message;
  db.insertBotMessage({ roomId: main.id, botId: bot.id, body: '샤워헤드 교체 후 91% 입니다' });
  return { db, a, b, abs };
}

const run = (db, args) => execFileSync(process.execPath, [CHAT_JS, ...args], {
  env: { ...process.env, MINIDISCORD_DB: db.file }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});

test('chat.js --json 아홉 칸 이름이 같다', { skip }, () => {
  const { db } = build();
  const rows = JSON.parse(run(db, ['search', '샤워헤드', '--json']));
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.deepEqual(Object.keys(r), ['id', 'room_id', 'room', 'author', 'author_type', 'created_at', 'body', 'attachments', 'targets']);
  }
  assert.deepEqual(rows.map(r => r.author), ['김과제', '김과제', 'prodev-worktogether-비서']);
});

test('targets 칸이 <봇 이름>:to', { skip }, () => {
  const { db, a, b } = build();
  const rows = JSON.parse(run(db, ['search', '샤워헤드', '--json']));
  assert.equal(rows.find(r => r.id === a.id).targets, 'prodev-worktogether-비서:to');   // 본방 봉투 없음 → to
  assert.equal(rows.find(r => r.id === b.id).targets, 'prodev-worktogether-비서:to');
  assert.equal(rows.find(r => r.author_type === 'bot').targets, null);
});

test('show 의 첨부 path 가 실제 파일', { skip }, () => {
  const { db, b, abs } = build();
  const shown = JSON.parse(run(db, ['show', String(b.id), '--json']));
  assert.equal(shown.attachments.length, 1);
  assert.equal(shown.attachments[0].path, abs);
  assert.ok(fs.existsSync(shown.attachments[0].path));
  assert.equal(shown.room, 'prodev-worktogether/files');
});
