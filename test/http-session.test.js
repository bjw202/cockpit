// 세션 조작 길 (TASKS M3.3 · ARCHITECTURE 5.2 · 8.2) — admin 이 HTTP 로 켜기 · 끄기 · 멈춤 · 압축 · 다시 켜기 · 도우미 멈춤.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { httpWorld } from './fakes/http-world.js';
import { deferred, waitFor } from './fakes/fake-query.js';

async function world(t, opts) {
  const w = await httpWorld(opts);
  t.after(() => w.close());
  await w.user('김피엘', 'admin');
  await w.user('김과제');
  return w;
}
const S = (name, op, qs = '') => `/api/projects/${encodeURIComponent(name)}/session/${op}${qs}`;
const post = (w, as, p) => w.json(as, p, { method: 'POST' });
const say = (w, project, body) => w.manager.postUserMessage({ roomId: w.chatDb.projectRooms(project).main.id, username: '김과제', body: `@TO(prodev-${project}-bot) ${body}` });   // (v2) 봇에게 가는 글은 @TO 뿐 (ADR-018)
const text = um => um.message.content[0].text;

test('다섯 길 모두 member 403', async t => {
  const w = await world(t);
  w.open('수율');
  for (const op of ['start', 'stop', 'interrupt', 'compact', 'restart']) {
    const r = await post(w, '김과제', S('수율', op));
    assert.equal(r.status, 403, op);
    assert.deepEqual(r.body, { error: 'admin 만 할 수 있습니다' });
    assert.equal((await post(w, null, S('수율', op))).status, 401, `${op} 쿠키 없음`);
  }
  assert.equal((await post(w, '김과제', `/api/projects/${encodeURIComponent('수율')}/tasks/t1/stop`)).status, 403, '도우미 멈춤도');
  assert.equal(w.queryFn.calls.length, 0, '세션을 안 켰다');
  assert.equal(w.cockpitDb.agentSession('수율').state, 'stopped');
  assert.equal((await post(w, '김피엘', S('없는과제', 'start'))).status, 404);
  assert.equal((await w.json('김피엘', S('수율', 'start'))).status, 405, 'GET 은 없다');
});

test('start 넷째는 409', async t => {
  const w = await world(t);
  for (const p of ['가', '나', '다', '라']) w.open(p);
  for (const p of ['가', '나', '다']) {
    const r = await post(w, '김피엘', S(p, 'start'));
    assert.equal(r.status, 200, p);
    assert.equal(r.body.state, 'idle');
    assert.equal(r.body.project, p);
  }
  const fourth = await post(w, '김피엘', S('라', 'start'));
  assert.equal(fourth.status, 409);
  assert.match(fourth.body.error, /상한 3/);
  assert.equal(w.cockpitDb.agentSession('라').state, 'stopped');
  assert.equal((await post(w, '김피엘', S('가', 'start'))).status, 200, '켜진 것을 또 켜면 그대로 200');
  assert.equal(w.queryFn.calls.length, 3);
  assert.equal((await post(w, '김피엘', S('가', 'stop'))).status, 200);
  assert.equal((await post(w, '김피엘', S('라', 'start'))).status, 200, '하나 끄면 켜진다');
});

test('interrupt 는 queryFn.interrupt 1회', async t => {
  const w = await world(t, { turns: [[{ canUse: { toolName: 'Bash', input: { command: 'curl https://example.com' }, toolUseID: 'toolu_int' } }, { result: true }]] });
  w.open('수율');
  w.open('꺼짐');
  await post(w, '김피엘', S('수율', 'start'));
  say(w, '수율', 'curl 돌려 줘');
  await waitFor(() => w.manager.state('수율') === 'waiting_approval', { what: '승인 대기' });

  const r = await post(w, '김피엘', S('수율', 'interrupt'));
  assert.equal(r.status, 200);
  assert.equal(w.queryFn.calls[0].interrupts, 1);
  assert.equal(w.cockpitDb.permission('toolu_int').behavior, 'cancelled', '걸린 승인 요청은 거둬 감');
  await waitFor(() => w.manager.state('수율') === 'idle', { what: '멈춘 뒤 idle' });
  assert.equal(w.queryFn.calls[0].answers[0].behavior, 'deny');
  const sys = w.chatDb.messagesAfter(w.chatDb.projectRooms('수율').main.id, 0).filter(m => m.author_type === 'system').map(m => m.body);
  assert.deepEqual(sys, ['🔒 Bash 요청 · Bash', '⛔ 거둬 감 · Bash']);
  assert.equal((await post(w, '김피엘', S('꺼짐', 'interrupt'))).status, 409, '꺼진 세션은 멈출 것이 없다');
});

test('compact 는 working 이면 걸어 두고 idle 에 넣는다', async t => {
  const hold = deferred();
  const w = await world(t, { turns: [[{ wait: hold.promise }, { result: true }], [{ result: true }]] });
  w.open('수율');
  await post(w, '김피엘', S('수율', 'start'));
  say(w, '수율', '긴 일');
  await waitFor(() => w.manager.state('수율') === 'working');

  const r = await post(w, '김피엘', S('수율', 'compact'));
  assert.equal(r.status, 200);
  assert.equal(r.body.queued, true);
  assert.equal(r.body.state, 'working');
  await new Promise(res => setTimeout(res, 20));
  assert.equal(w.queryFn.calls[0].received.length, 1, 'working 중에는 안 넣는다');

  hold.resolve();
  await waitFor(() => w.queryFn.calls[0].received.length === 2, { what: 'idle 에서 /compact' });
  assert.equal(text(w.queryFn.calls[0].received[1]), '/compact');
  assert.deepEqual(w.queryFn.calls[0].received[1].origin, { kind: 'human' });
  await waitFor(() => w.manager.state('수율') === 'idle');
  const now = await post(w, '김피엘', S('수율', 'compact'));
  assert.equal(now.body.queued, false, 'idle 이면 곧바로');
  await waitFor(() => w.queryFn.calls[0].received.length === 3);
});

test('stop 은 백그라운드 도우미가 있으면 목록을 내고 confirm=1 이 있어야 close', async t => {
  const w = await world(t, { turns: [[
    { msg: { type: 'system', subtype: 'background_tasks_changed', tasks: [
      { task_id: 't1', task_type: 'local_agent', description: '리서치 — 문헌 대조' },
      { task_id: 't2', task_type: 'monitor', description: '감시', ambient: true },
    ] } },
    { result: true },
  ]] });
  w.open('수율');
  w.open('한가');
  await post(w, '김피엘', S('수율', 'start'));
  say(w, '수율', '리서치 해 줘');
  await waitFor(() => w.cockpitDb.eventsAfter('수율').some(e => e.type === 'task') && w.manager.state('수율') === 'idle');

  const refused = await post(w, '김피엘', S('수율', 'stop'));
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'TASKS_RUNNING');
  assert.deepEqual(refused.body.tasks, [{ task_id: 't1', task_type: 'local_agent', description: '리서치 — 문헌 대조', ambient: false }], 'ambient 는 목록에 없다');
  assert.equal(w.queryFn.calls[0].closed, false);
  assert.equal(w.manager.state('수율'), 'idle');
  assert.equal((await post(w, '김피엘', S('수율', 'restart'))).status, 409, '다시 켜기도 같은 확인');

  const ok = await post(w, '김피엘', S('수율', 'stop', '?confirm=1'));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.state, 'stopped');
  assert.equal(w.queryFn.calls[0].closed, true);
  assert.equal(w.cockpitDb.agentSession('수율').state, 'stopped');
  assert.equal((await post(w, '김피엘', S('수율', 'stop'))).status, 200, '꺼진 것을 또 끄면 그대로 200');

  await post(w, '김피엘', S('한가', 'start'));
  const plain = await post(w, '김피엘', S('한가', 'stop'));
  assert.deepEqual([plain.status, plain.body.state], [200, 'stopped'], '도우미가 없으면 확인 없이');
});

test('task stop 은 stopTask(id)', async t => {
  const w = await world(t);
  w.open('수율');
  await post(w, '김피엘', S('수율', 'start'));
  const r = await post(w, '김피엘', `/api/projects/${encodeURIComponent('수율')}/tasks/${encodeURIComponent('task-7f3a')}/stop`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, project: '수율', task_id: 'task-7f3a' });
  assert.deepEqual(w.queryFn.calls[0].stopped, ['task-7f3a']);
  assert.equal(w.cockpitDb.eventsAfter('수율').find(e => e.type === 'command' && e.data.command === 'stop_task').data.task_id, 'task-7f3a');
  await post(w, '김피엘', S('수율', 'stop'));
  assert.equal((await post(w, '김피엘', `/api/projects/${encodeURIComponent('수율')}/tasks/task-7f3a/stop`)).status, 409, '꺼진 세션');
});

test('restart 는 같은 session_id 로 resume 한다', async t => {
  const w = await world(t);
  w.open('수율');
  await post(w, '김피엘', S('수율', 'start'));
  say(w, '수율', '안녕');
  await waitFor(() => w.cockpitDb.agentSession('수율').session_id === 'sess-1' && w.manager.state('수율') === 'idle');
  const r = await post(w, '김피엘', S('수율', 'restart'));
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.state, r.body.session_id, r.body.resumed], ['idle', 'sess-1', true]);
  assert.equal(w.queryFn.calls.length, 2);
  assert.equal(w.queryFn.calls[0].closed, true, '앞 프로세스를 닫았다');
  assert.equal(w.queryFn.calls[1].options.resume, 'sess-1');
});
