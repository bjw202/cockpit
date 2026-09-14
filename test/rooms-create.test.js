// 방 만들기 = 봇 생성 · 되돌림 (TASKS M5.3 · ARCHITECTURE 4.6 · ADR-017). setup 은 가짜(test/fakes/fake-setup.js)를 주입한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { httpWorld } from './fakes/http-world.js';
import { makeFakeSetup } from './fakes/fake-setup.js';
import { ENV_WHITELIST } from '../src/session/env.js';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cockpit.js');

async function world(t, opts = {}) {
  const w = await httpWorld(opts);
  t.after(() => w.close());
  await w.user('김피엘', 'admin');
  await w.user('김과제');
  return w;
}
const postJson = (w, as, p, body) => w.json(as, p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const makeRoom = (w, as, body) => postJson(w, as, '/api/rooms', body);
const counts = w => ({
  bots: Number(w.chatDb.db.prepare('SELECT COUNT(*) AS n FROM bots').get().n),
  rooms: Number(w.chatDb.db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n),
  sessions: w.cockpitDb.agentSessions().length,
});
const botDirOf = (w, p) => path.join(w.config.botsDir, `prodev-${p}-bot`);
const projectDirOf = (w, p) => path.join(w.config.projectsDir, p);
const sseEvents = w => w.server.hub.buffer.map(f => ({ event: /event: (\w+)/.exec(f.frame)[1], data: JSON.parse(/data: (.*)/.exec(f.frame)[1]) }));

test('성공: setup 한 번 · 봇 · 방 하나 · agent_sessions stopped · room_created 사건 · 201', async t => {
  const setup = makeFakeSetup();
  const w = await world(t, { runSetup: setup });
  const r = await makeRoom(w, '김피엘', { name: '수율' });
  assert.equal(r.status, 201, r.text);
  assert.deepEqual(Object.keys(r.body), ['id', 'name', 'status', 'created_at', 'archived_at', 'project', 'bot']);
  assert.equal(r.body.name, 'prodev-수율');
  assert.equal(r.body.status, 'active');
  assert.equal(r.body.project, '수율');
  assert.deepEqual(r.body.bot, { id: 1, name: 'prodev-수율-bot' });
  assert.equal(setup.calls.length, 1);
  assert.deepEqual({ project: setup.calls[0].project, botDir: setup.calls[0].botDir, configFile: setup.calls[0].configFile },
    { project: '수율', botDir: botDirOf(w, '수율'), configFile: w.configFile });
  assert.ok(fs.existsSync(path.join(botDirOf(w, '수율'), '.claude', 'settings.local.json')));
  assert.deepEqual(counts(w), { bots: 1, rooms: 1, sessions: 1 });
  assert.equal(w.cockpitDb.agentSession('수율').state, 'stopped');
  assert.equal(w.cockpitDb.agentSession('수율').bot_dir, botDirOf(w, '수율'));
  const created = sseEvents(w).filter(e => e.event === 'room_created');
  assert.deepEqual(created.map(e => e.data), [{ project: '수율', room: { id: r.body.id, name: 'prodev-수율' }, bot: { id: 1, name: 'prodev-수율-bot' } }]);
  assert.deepEqual((await w.json('김과제', '/api/rooms')).body.active.map(x => x.name), ['prodev-수율']);
});

test('setup 이 실패하면 502 · setup_tail · 새 봇 폴더 · 새 과제 폴더 · 행 0', async t => {
  const w = await world(t, { runSetup: makeFakeSetup({ mode: 'fail' }) });
  const r = await makeRoom(w, '김피엘', { name: '수율' });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'setup 실패: 오류: 조종석 설정이 없다 (가짜 setup)');
  assert.ok(Array.isArray(r.body.setup_tail) && r.body.setup_tail.length === 3);
  assert.equal(fs.existsSync(botDirOf(w, '수율')), false);
  assert.equal(fs.existsSync(projectDirOf(w, '수율')), false);
  assert.deepEqual(counts(w), { bots: 0, rooms: 0, sessions: 0 });
  assert.equal(sseEvents(w).filter(e => e.event === 'room_created').length, 0);
});

test('setup 이 반쯤 만들고 죽어도 요청이 새로 만든 폴더를 지운다', async t => {
  const w = await world(t, { runSetup: makeFakeSetup({ mode: 'half' }) });
  const r = await makeRoom(w, '김피엘', { name: '수율' });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /반쯤/);
  assert.equal('left' in r.body, false, '다 지웠으면 left 가 없다');
  assert.equal(fs.existsSync(botDirOf(w, '수율')), false);
  assert.equal(fs.existsSync(projectDirOf(w, '수율')), false);
  assert.deepEqual(counts(w), { bots: 0, rooms: 0, sessions: 0 });
});

test('cockpit.db 쓰기가 실패하면 chat.db 행과 봇 폴더를 되돌린다', async t => {
  const w = await world(t);
  w.cockpitDb.createAgentSession = () => { throw new Error('disk I/O error\n자세한 줄'); };
  const r = await makeRoom(w, '김피엘', { name: '수율' });
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: '저장 실패: disk I/O error' });
  assert.deepEqual(counts(w), { bots: 0, rooms: 0, sessions: 0 });
  assert.equal(fs.existsSync(botDirOf(w, '수율')), false);
  assert.equal(fs.existsSync(projectDirOf(w, '수율')), false);
});

test('요청 전에 있던 과제 폴더는 지우지 않는다', async t => {
  const w = await world(t, { runSetup: makeFakeSetup({ mode: 'half' }) });
  fs.mkdirSync(projectDirOf(w, '수율'), { recursive: true });
  fs.writeFileSync(path.join(projectDirOf(w, '수율'), 'charter.md'), 'PL: 김피엘\n');
  const r = await makeRoom(w, '김피엘', { name: '수율' });
  assert.equal(r.status, 502);
  assert.equal(fs.readFileSync(path.join(projectDirOf(w, '수율'), 'charter.md'), 'utf8'), 'PL: 김피엘\n', '재개하는 과제의 폴더는 그대로');
  assert.equal(fs.existsSync(botDirOf(w, '수율')), false, '요청이 만든 봇 폴더만 지운다');
});

test('같은 이름 409 — 방 · 봇 · agent_sessions · 봇 폴더', async t => {
  const setup = makeFakeSetup();
  const w = await world(t, { runSetup: setup });
  assert.equal((await makeRoom(w, '김피엘', { name: '수율' })).status, 201);
  const again = await makeRoom(w, '김피엘', { name: '수율' });
  assert.deepEqual([again.status, again.body], [409, { error: '과제가 이미 있습니다: 수율' }]);

  w.chatDb.createRoom('prodev-방만');
  assert.deepEqual((await makeRoom(w, '김피엘', { name: '방만' })).body, { error: '과제가 이미 있습니다: 방만' });
  w.chatDb.createBot('prodev-봇만-bot');
  const bot = await makeRoom(w, '김피엘', { name: '봇만' });
  assert.deepEqual([bot.status, bot.body], [409, { error: '봇이 이미 있습니다: prodev-봇만-bot' }]);
  w.cockpitDb.createAgentSession({ project: '세션만', botId: 999, botDir: '/없음' });
  assert.equal((await makeRoom(w, '김피엘', { name: '세션만' })).status, 409);
  fs.mkdirSync(botDirOf(w, '폴더만'), { recursive: true });
  const folder = await makeRoom(w, '김피엘', { name: '폴더만' });
  assert.deepEqual([folder.status, folder.body], [409, { error: `봇 폴더가 이미 있습니다: ${botDirOf(w, '폴더만')}` }]);

  assert.equal(setup.calls.length, 1, '거절은 setup 을 부르지 않는다');
  assert.equal(fs.existsSync(botDirOf(w, '폴더만')), true, '있던 봇 폴더를 건드리지 않는다');
});

test('같은 이름 동시 두 요청은 하나만 201', async t => {
  const setup = makeFakeSetup({ mode: 'slow', delayMs: 200 });
  const w = await world(t, { runSetup: setup });
  const [a, b] = await Promise.all([makeRoom(w, '김피엘', { name: '수율' }), makeRoom(w, '김피엘', { name: '수율' })]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(setup.calls.length, 1);
  assert.deepEqual(counts(w), { bots: 1, rooms: 1, sessions: 1 });
});

test('prodev- 로 시작하는 이름은 400', async t => {
  const setup = makeFakeSetup();
  const w = await world(t, { runSetup: setup });
  const r = await makeRoom(w, '김피엘', { name: 'prodev-수율' });
  assert.deepEqual([r.status, r.body], [400, { error: '과제 이름만 주세요 — prodev- 는 붙이지 않습니다' }]);
  for (const body of [{}, { name: '' }, { name: 'a/b' }, { name: '수 율' }]) assert.equal((await makeRoom(w, '김피엘', body)).status, 400, JSON.stringify(body));
  assert.equal(setup.calls.length, 0);
  assert.deepEqual(counts(w), { bots: 0, rooms: 0, sessions: 0 });
});

test('member 는 403', async t => {
  const setup = makeFakeSetup();
  const w = await world(t, { runSetup: setup });
  const r = await makeRoom(w, '김과제', { name: '수율' });
  assert.deepEqual([r.status, r.body], [403, { error: 'admin 만 할 수 있습니다' }]);
  assert.equal((await makeRoom(w, null, { name: '수율' })).status, 401);
  assert.equal(setup.calls.length, 0);
  assert.deepEqual(counts(w), { bots: 0, rooms: 0, sessions: 0 });
});

test('POST /api/projects 와 open-project 도 같은 처리기(방 하나)', async t => {
  const setup = makeFakeSetup();
  const w = await world(t, { runSetup: setup });
  const p = await postJson(w, '김피엘', '/api/projects', { name: '옛모양' });
  assert.equal(p.status, 201);
  assert.deepEqual(p.body.rooms, { main: { id: 1, name: 'prodev-옛모양' }, legacy_files: null });
  assert.deepEqual(setup.calls.map(c => c.project), ['옛모양'], '같은 setup 을 부른다');
  assert.equal(p.body.bot_dir_exists, true);

  // CLI — --no-setup 이면 setup 없이 방 하나, 없으면 진짜 setup.js 를 부른다(이 시험의 prodevDir 에는 없다 → 502 와 같은 실패 · 행 0)
  const dir = path.join(w.config.botsDir, 'prodev-둘-bot');
  fs.mkdirSync(dir, { recursive: true });
  const noSetup = spawnSync(process.execPath, [CLI, 'open-project', '둘', '--no-setup', '--bot-dir', dir, '--config', w.configFile], { encoding: 'utf8' });
  assert.equal(noSetup.status, 0, noSetup.stderr);
  assert.match(noSetup.stdout, /과제 둘 · 봇 prodev-둘-bot \(id \d+\) · 방 prodev-둘 \(id \d+\) · 봇 폴더 .* \(setup 건너뜀\)/);
  const real = spawnSync(process.execPath, [CLI, 'open-project', '셋', '--config', w.configFile], { encoding: 'utf8' });
  assert.equal(real.status, 1);
  assert.match(real.stderr, /✗ setup 실패: setup\.js 가 없다: /);
  assert.equal(w.chatDb.roomByName('prodev-셋'), undefined);
  assert.deepEqual((await w.json('김과제', '/api/rooms')).body.active.map(x => x.name), ['prodev-둘', 'prodev-옛모양']);
});

test('setup 자식 프로세스 env 는 화이트리스트 키뿐', async t => {
  const setup = makeFakeSetup();
  const w = await world(t, { runSetup: setup, runtime: { processEnv: { PATH: '/bin', HOME: '/h', COCKPIT_SECRET_PROBE: 'x', AWS_SECRET_ACCESS_KEY: 'y', LANG: 'ko_KR.UTF-8' } } });
  assert.equal((await makeRoom(w, '김피엘', { name: '수율' })).status, 201);
  const keys = setup.calls[0].envKeys;
  assert.deepEqual(keys, ['HOME', 'LANG', 'PATH']);
  assert.ok(keys.every(k => ENV_WHITELIST.includes(k)));
  assert.equal(keys.includes('PRODEV_BOT_DIR'), false, '봇 세션 env 가 아니다');
});
