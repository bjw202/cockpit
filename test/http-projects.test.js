import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { httpWorld } from './fakes/http-world.js';

async function world(t) {
  const w = await httpWorld();
  t.after(() => w.close());
  await w.user('김피엘', 'admin');
  await w.user('김과제');
  return w;
}
const open = (w, as, body) => w.json(as, '/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const counts = w => ({
  bots: w.chatDb.db.prepare('SELECT COUNT(*) AS n FROM bots').get().n,
  rooms: w.chatDb.db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n,
  sessions: w.cockpitDb.agentSessions().length,
});

test('admin 만 연다(member 403)', async t => {
  const w = await world(t);
  const r = await open(w, '김과제', { name: '수율' });
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: 'admin 만 할 수 있습니다' });
  assert.equal((await open(w, null, { name: '수율' })).status, 401);
  assert.deepEqual(counts(w), { bots: 0, rooms: 0, sessions: 0 });
  assert.deepEqual((await w.json('김과제', '/api/projects')).body, { projects: [] }, '목록은 member 도 본다');
});

test('봇 한 줄 · 방 둘(prodev-<과제> · prodev-<과제>/files) · agent_sessions 한 줄', async t => {
  const w = await world(t);
  const r = await open(w, '김피엘', { name: '수율' });
  assert.equal(r.status, 201);
  const botDir = path.join(w.config.botsDir, 'prodev-수율-bot');
  assert.deepEqual(r.body, {
    name: '수율',
    bot: { id: 1, name: 'prodev-수율-bot' },
    rooms: { main: { id: 1, name: 'prodev-수율' }, files: { id: 2, name: 'prodev-수율/files' } },
    session: { state: 'stopped', session_id: null, cost_usd: 0, last_result_at: null, model: null, context_pct: null },
    bot_dir: botDir, bot_dir_exists: false,
  });
  assert.deepEqual(counts(w), { bots: 1, rooms: 2, sessions: 1 });
  const bot = w.chatDb.db.prepare('SELECT name, role, token FROM bots').get();
  assert.equal(bot.role, 'orchestrator');
  assert.match(bot.token, /^[0-9a-f-]{36}$/);
  const row = w.cockpitDb.agentSession('수율');
  assert.equal(row.state, 'stopped');
  assert.equal(row.bot_dir, botDir);
  assert.deepEqual((await w.json('김과제', '/api/rooms')).body.active.map(x => x.name), ['prodev-수율/files', 'prodev-수율']);

  // 옛 대본의 봇 이름 꼴로도 연다
  const old = await open(w, '김피엘', { name: 'worktogether', bot_name: 'prodev-worktogether-비서' });
  assert.equal(old.status, 201);
  assert.equal(old.body.bot.name, 'prodev-worktogether-비서');
  assert.equal(old.body.bot_dir, path.join(w.config.botsDir, 'prodev-worktogether-bot'));

  const list = await w.json('김과제', '/api/projects');
  assert.deepEqual(list.body.projects.map(p => p.name), ['worktogether', '수율']);
  assert.ok(list.body.projects.every(p => !('bot_dir' in p)), 'member 에게는 서버 경로를 안 싣는다');

  // 새 과제의 본방에 봉투 없이 쓰면 그 봇의 큐에 to 로 간다
  const fd = new FormData();
  fd.append('body', '안녕하세요');
  const sent = await w.json('김과제', `/api/rooms/${old.body.rooms.main.id}/messages`, { method: 'POST', body: fd });
  assert.equal(sent.status, 200);
  assert.deepEqual(w.cockpitDb.pendingInbox(old.body.bot.id).map(x => x.delivery), ['to']);
});

test('같은 이름을 다시 열면 409', async t => {
  const w = await world(t);
  assert.equal((await open(w, '김피엘', { name: '수율' })).status, 201);
  const before = counts(w);

  const again = await open(w, '김피엘', { name: '수율' });
  assert.equal(again.status, 409);
  assert.deepEqual(again.body, { error: '과제가 이미 있습니다: 수율' });
  assert.equal((await open(w, '김피엘', { name: '수율2', bot_name: 'prodev-수율-bot' })).status, 409, '봇 이름이 겹쳐도 409');
  assert.deepEqual(counts(w), before, '거절은 행을 안 남긴다');

  for (const body of [{ name: '' }, { name: 'a/b' }, { name: '수 율' }, { name: '..' }, { name: '수율3', bot_name: 'a(b)' },
    { name: '수율3', bot_dir: '/etc' }, { name: '수율3', bot_dir: 'bots/x' }, { name: '수율3', bot_dir: w.config.botsDir }]) {
    assert.equal((await open(w, '김피엘', body)).status, 400, JSON.stringify(body));
  }
  assert.deepEqual(counts(w), before);
});
