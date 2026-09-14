// 방 보관 · 봇 길 없음 (TASKS M5.4 · ARCHITECTURE 4.6 끝 · PRD F22 · F23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { httpWorld } from './fakes/http-world.js';
import { deferred, waitFor } from './fakes/fake-query.js';

async function world(t, opts = {}) {
  const w = await httpWorld(opts);
  t.after(() => w.close());
  await w.user('김피엘', 'admin');
  await w.user('김과제');
  const opened = w.open('수율');
  return { w, ...opened };
}
const archive = (w, as, id, qs = '') => w.json(as, `/api/rooms/${id}/archive${qs}`, { method: 'POST' });
const sseEvents = w => w.server.hub.buffer.map(f => ({ event: /event: (\w+)/.exec(f.frame)[1], data: JSON.parse(/data: (.*)/.exec(f.frame)[1]) }));
const say = (w, roomId, body) => {
  const fd = new FormData();
  fd.append('body', body);
  return w.json('김과제', `/api/rooms/${roomId}/messages`, { method: 'POST', body: fd });
};

test('보관: 세션 stopped · rooms archived · room_archived 사건', async t => {
  const { w, main } = await world(t);
  await w.manager.start('수율');
  assert.equal(w.manager.state('수율'), 'idle');
  const r = await archive(w, '김피엘', main.id);
  assert.deepEqual([r.status, r.body], [200, { ok: true, id: main.id, status: 'archived' }]);
  assert.equal(w.cockpitDb.agentSession('수율').state, 'stopped');
  assert.equal(w.manager.state('수율'), 'stopped');
  const room = w.chatDb.roomById(main.id);
  assert.equal(room.status, 'archived');
  assert.ok(room.archived_at);
  assert.deepEqual((await w.json('김과제', '/api/rooms')).body.archived.map(x => x.name), ['prodev-수율']);
  assert.deepEqual(sseEvents(w).filter(e => e.event === 'room_archived').map(e => e.data), [{ project: '수율', room: { id: main.id, name: 'prodev-수율' } }]);
  assert.ok(w.cockpitDb.agentSession('수율'), 'agent_sessions 줄은 그대로 둔다');
});

test('도우미가 돌면 409 TASKS_RUNNING · confirm=1 이면 보관', async t => {
  const tasks = [{ task_id: 'task-7f3a', task_type: 'local_agent', description: '리서치', ambient: false }];
  const { w, main } = await world(t, { turns: [[{ msg: { type: 'system', subtype: 'background_tasks_changed', tasks } }, { result: true }]] });
  await w.manager.start('수율');
  await say(w, main.id, '@TO(prodev-수율-bot) 리서치 해 주세요');
  await waitFor(() => w.manager.backgroundTasks('수율').length === 1, { what: '백그라운드 도우미' });

  const refused = await archive(w, '김피엘', main.id);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'TASKS_RUNNING');
  assert.deepEqual(refused.body.tasks.map(x => x.task_id), ['task-7f3a']);
  assert.equal(w.chatDb.roomById(main.id).status, 'active', '거절은 보관하지 않는다');
  assert.notEqual(w.manager.state('수율'), 'stopped');

  const ok = await archive(w, '김피엘', main.id, '?confirm=1');
  assert.equal(ok.status, 200);
  assert.equal(w.chatDb.roomById(main.id).status, 'archived');
  assert.equal(w.cockpitDb.agentSession('수율').state, 'stopped');
});

test('보관 방 글 POST 409 · 두 번째 보관 409', async t => {
  const { w, main } = await world(t);
  assert.equal((await archive(w, '김피엘', main.id)).status, 200);
  const post = await say(w, main.id, '@TO(prodev-수율-bot) 아직 있나요');
  assert.deepEqual([post.status, post.body], [409, { error: '보관된 방에는 메시지를 보낼 수 없습니다' }]);
  const again = await archive(w, '김피엘', main.id);
  assert.deepEqual([again.status, again.body], [409, { error: '이미 보관된 방입니다' }]);
  assert.equal((await archive(w, '김피엘', 9999)).status, 404);
  assert.equal((await archive(w, '김피엘', 'abc')).status, 404);
});

test('걸린 승인 요청은 거둬 감', async t => {
  const hold = deferred();
  const { w, main } = await world(t, { turns: [[{ wait: hold.promise }, { result: true }]] });
  t.after(() => hold.resolve());
  await w.manager.start('수율');
  await say(w, main.id, '@TO(prodev-수율-bot) 일을 시작해 주세요');
  await waitFor(() => w.manager.state('수율') === 'working', { what: 'working' });
  const q = w.queryFn.calls[0];
  const pending = q.options.canUseTool('Bash', { command: 'curl --version' }, { signal: new AbortController().signal, requestId: 'req-A', toolUseID: 'toolu_A' });
  await waitFor(() => w.cockpitDb.pendingPermissions('수율').length === 1, { what: '승인 요청' });

  assert.equal((await archive(w, '김피엘', main.id)).status, 200);
  assert.equal(w.cockpitDb.permission('toolu_A').behavior, 'cancelled');
  assert.equal((await pending).behavior, 'deny');
  assert.equal(w.cockpitDb.pendingPermissions('수율').length, 0);
});

test('member 403', async t => {
  const { w, main } = await world(t);
  const r = await archive(w, '김과제', main.id);
  assert.deepEqual([r.status, r.body], [403, { error: 'admin 만 할 수 있습니다' }]);
  assert.equal((await archive(w, null, main.id)).status, 401);
  assert.equal(w.chatDb.roomById(main.id).status, 'active');
});

test('/api/bots · /api/rooms/:id/bots 는 404', async t => {
  const { w, main } = await world(t);
  for (const [method, p] of [['GET', '/api/bots'], ['POST', '/api/bots'], ['GET', `/api/rooms/${main.id}/bots`], ['POST', `/api/rooms/${main.id}/bots`]]) {
    const r = await w.json('김피엘', p, { method, ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}) });
    assert.equal(r.status, 404, `${method} ${p}`);
  }
  assert.equal((await w.json('김피엘', '/api/bots/1', { method: 'DELETE' })).status, 404);
});
