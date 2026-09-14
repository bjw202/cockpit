// 옛 files 방 이관 (TASKS M5.0 · ARCHITECTURE 4.7). v1 판 chat.db 를 손으로 흉내 낸다 — 과제마다 본방 + prodev-<과제>/files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openRuntime } from '../src/runtime.js';
import { filesRoomName } from '../src/db/chat-db.js';
import { applyMigration, legacyFilesRooms, legacyWarning } from '../src/rooms/migrate.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'bin', 'cockpit.js');

// 설정 검사가 포트 0 을 거절하므로 serve 시험은 비어 있는 포트 하나를 받아 쓴다
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function v1World(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-migrate-')));
  const config = { maxSessions: 3, approvalTimeoutMin: 10, extraEnvKeys: [], host: '127.0.0.1', port: await freePort(), claudePath: null, tls: null };
  for (const k of ['projectsDir', 'uploadsDir', 'dataDir']) { config[k] = path.join(dir, k); fs.mkdirSync(config[k], { recursive: true }); }
  config.botsDir = path.join(dir, 'prodev', 'bots');
  fs.mkdirSync(config.botsDir, { recursive: true });
  const configFile = path.join(dir, 'cockpit.json');
  fs.writeFileSync(configFile, JSON.stringify(config));
  const rt = openRuntime(config);
  t.after(() => rt.close());
  const seed = project => {
    const botDir = path.join(config.botsDir, `prodev-${project}-bot`);
    const { bot, main } = rt.manager.openProject({ project, botDir });
    const files = rt.chatDb.roomByName(filesRoomName(project)) ?? rt.chatDb.createRoom(filesRoomName(project));
    const user = rt.chatDb.ensureUser('김과제');
    const abs = path.join(config.uploadsDir, `a-${project}.csv`);
    fs.writeFileSync(abs, 'a,b\n');
    const m1 = rt.chatDb.insertUserMessage({ roomId: files.id, userId: user.id, body: `@TO(${bot.name}) 자료`, bot, files: [{ filename: 'a.csv', absPath: abs, size: 4 }] });
    for (const x of m1.targets) rt.cockpitDb.enqueue(m1.message.id, x.botId, x.delivery);
    rt.chatDb.insertUserMessage({ roomId: files.id, userId: user.id, body: '그냥 올림', bot });
    rt.chatDb.insertUserMessage({ roomId: main.id, userId: user.id, body: `@TO(${bot.name}) 본방 글`, bot });
    return { bot, main, files };
  };
  return { dir, config, configFile, rt, seed };
}

const counts = rt => ({
  messages: Number(rt.chatDb.db.prepare('SELECT COUNT(*) c FROM messages').get().c),
  attachments: Number(rt.chatDb.db.prepare('SELECT COUNT(*) c FROM attachments').get().c),
  targets: Number(rt.chatDb.db.prepare('SELECT COUNT(*) c FROM message_targets').get().c),
  inbox: Number(rt.cockpitDb.db.prepare('SELECT COUNT(*) c FROM bot_inbox').get().c),
  pending: Number(rt.cockpitDb.db.prepare('SELECT COUNT(*) c FROM bot_inbox WHERE delivered_at IS NULL').get().c),
});
const statuses = rt => rt.chatDb.db.prepare('SELECT name, status FROM rooms ORDER BY id').all().map(r => `${r.name}:${r.status}`);
const cli = args => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('migrate-v2 는 보이기만 하고 아무 행도 안 바꾼다', async t => {
  const w = await v1World(t);
  const a = w.seed('수율');
  w.seed('샤워');
  const before = { counts: counts(w.rt), statuses: statuses(w.rt) };
  const out = cli(['migrate-v2', '--config', w.configFile]);
  const lines = out.trim().split('\n');
  assert.ok(lines.includes(`prodev-수율/files  id=${a.files.id}  글 2  첨부 1  큐 미배달 1  → 보관`), out);
  assert.equal(lines.filter(l => l.endsWith('→ 보관')).length, 2);
  assert.match(lines.at(-1), /--apply/);
  assert.deepEqual({ counts: counts(w.rt), statuses: statuses(w.rt) }, before);
});

test('--apply 는 옛 files 방을 archived 로 두고 글 · 첨부 · 대상 · 큐 행 수가 그대로다', async t => {
  const w = await v1World(t);
  w.seed('수율');
  w.seed('샤워');
  const before = counts(w.rt);
  const out = cli(['migrate-v2', '--apply', '--config', w.configFile]);
  assert.equal(out.trim().split('\n').at(-1), '보관 2');
  assert.deepEqual(counts(w.rt), before);
  assert.deepEqual(statuses(w.rt).filter(s => s.includes('/files')), ['prodev-수율/files:archived', 'prodev-샤워/files:archived']);
  assert.ok(statuses(w.rt).filter(s => !s.includes('/files')).every(s => s.endsWith(':active')), '본방은 그대로');
  assert.ok(w.rt.chatDb.db.prepare("SELECT archived_at FROM rooms WHERE name LIKE '%/files'").all().every(r => r.archived_at));
});

test('두 번 돌려도 같다', async t => {
  const w = await v1World(t);
  w.seed('수율');
  assert.equal(applyMigration(w.rt), 1);
  const once = { counts: counts(w.rt), rooms: w.rt.chatDb.db.prepare('SELECT * FROM rooms ORDER BY id').all() };
  assert.equal(applyMigration(w.rt), 0);
  assert.deepEqual({ counts: counts(w.rt), rooms: w.rt.chatDb.db.prepare('SELECT * FROM rooms ORDER BY id').all() }, once);
  assert.deepEqual(legacyFilesRooms(w.rt).map(r => r.room.status), ['archived']);
  assert.equal(legacyWarning(w.rt), null);
});

test('serve 는 활성 files 방이 있으면 경고 한 줄을 내고 뜬다', async t => {
  const w = await v1World(t);
  w.seed('수율');
  const child = spawn(process.execPath, [CLI, 'serve', '--config', w.configFile], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  const lines = [];
  const take = c => lines.push(...String(c).split('\n').filter(Boolean));
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  const end = Date.now() + 20_000;
  while (!(lines.some(l => l.includes('듣는 중')) && lines.some(l => l.startsWith('! 옛 files 방')))) {
    if (Date.now() > end || child.exitCode !== null) break;
    await new Promise(r => setTimeout(r, 50));
  }
  assert.ok(lines.some(l => l.includes('듣는 중')), lines.join('\n'));
  assert.deepEqual(lines.filter(l => l.startsWith('! 옛 files 방')), ['! 옛 files 방 1 개 — migrate-v2 --apply 를 돌린다']);
  assert.equal(child.exitCode, null, '막지 않고 뜬 채로 있다');
});
