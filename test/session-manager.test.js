import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChatDb } from '../src/db/chat-db.js';
import { CockpitDb } from '../src/db/cockpit-db.js';
import { SessionManager, COMPACT_START_TEXT, COMPACT_END_TEXT } from '../src/session/manager.js';
import { makeFakeQueryFn, deferred, waitFor } from './fakes/fake-query.js';

const makeMcpServer = handlers => ({ handlers });

function world() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-mgr-')));
  const config = { maxSessions: 3, projectsDir: path.join(dir, 'projects'), uploadsDir: path.join(dir, 'uploads'), extraEnvKeys: [] };
  fs.mkdirSync(config.projectsDir, { recursive: true });
  return { dir, config, chatFile: path.join(dir, 'data', 'chat.db'), cockpitFile: path.join(dir, 'data', 'cockpit.db') };
}
function manager(w, queryFn, extra = {}) {
  const chatDb = new ChatDb(w.chatFile);
  const cockpitDb = new CockpitDb(w.cockpitFile);
  return new SessionManager({ chatDb, cockpitDb, config: w.config, queryFn, makeMcpServer, processEnv: { PATH: '/bin', HOME: '/h' }, ...extra });
}
function open(mgr, w, project = '시험') {
  const botDir = path.join(w.dir, 'bots', `prodev-${project}-bot`);
  fs.mkdirSync(botDir, { recursive: true });
  return mgr.openProject({ project, botDir });
}
const text = um => um.message.content[0].text;
const messageIdsIn = um => [...text(um).matchAll(/message_id="(\d+)"/g)].map(m => Number(m[1]));

test('같은 과제에 글 셋 → queryFn 호출 1회', async () => {
  const w = world(); const q = makeFakeQueryFn();
  const mgr = manager(w, q); const { main } = open(mgr, w);
  await mgr.start('시험');
  for (const t of ['하나', '둘', '셋']) {
    mgr.postUserMessage({ roomId: main.id, username: '김과제', body: t });
    await waitFor(() => mgr.state('시험') === 'idle' && mgr.cockpitDb.pendingInbox(1).length === 0);
  }
  assert.equal(q.calls.length, 1);
  assert.equal(q.calls[0].received.length, 3);
  await mgr.stop('시험');
});

test('working 중에 들어온 글도 곧바로 queryFn 입력으로 간다', async () => {
  const w = world(); const hold = deferred();
  const q = makeFakeQueryFn({ turns: [[{ wait: hold.promise }, { result: true }]] });
  const mgr = manager(w, q); const { main } = open(mgr, w);
  await mgr.start('시험');
  const a = mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '첫 글' });
  await waitFor(() => q.calls[0].received.length === 1);
  assert.equal(mgr.state('시험'), 'working');
  const b = mgr.postUserMessage({ roomId: main.id, username: '박과제', body: '둘째 글' });
  await waitFor(() => q.calls[0].received.length === 2, { what: '턴 도중 배달' });   // 턴이 끝나기 전에 (W2r.1)
  assert.equal(mgr.state('시험'), 'working');
  assert.equal(mgr.cockpitDb.pendingInbox(1).length, 0, '큐에 걸려 있지 않다');
  assert.deepEqual(messageIdsIn(q.calls[0].received[0]), [a.id]);
  assert.deepEqual(messageIdsIn(q.calls[0].received[1]), [b.id]);
  hold.resolve();
  await waitFor(() => mgr.state('시험') === 'idle');
  assert.equal(mgr.cockpitDb.eventsAfter('시험').filter(e => e.type === 'result').length, 1, 'SDK 가 그 턴에 접어 result 는 하나');
  await mgr.stop('시험');
});

test('idle 에서 밀린 글 셋은 사용자 메시지 하나에 id 순으로', async () => {
  const w = world(); const q = makeFakeQueryFn();
  const mgr = manager(w, q); const { main, files } = open(mgr, w);
  const ids = [
    mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '본방 글' }).id,
    mgr.postUserMessage({ roomId: files.id, username: '김과제', body: '@CC(prodev-시험-bot) 참고' }).id,
    mgr.postUserMessage({ roomId: files.id, username: '박과제', body: '@TO(prodev-시험-bot) 봐 주세요' }).id,
  ];
  await mgr.start('시험');
  await waitFor(() => q.calls[0].received.length === 1);
  const um = q.calls[0].received[0];
  assert.deepEqual(messageIdsIn(um), ids);
  assert.match(text(um), /delivery="cc" sender="김과제" author_type="user" room_name="prodev-시험\/files">\n\[김과제\] @CC/);
  assert.equal(mgr.cockpitDb.pendingInbox(1).length, 0);
  await mgr.stop('시험');
});

test('waiting_approval 중에도 배달', async () => {
  const w = world(); const answer = deferred();
  const q = makeFakeQueryFn({ turns: [[{ canUse: { toolName: 'Bash', input: { command: 'curl --version' }, toolUseID: 'toolu_1' } }, { result: true }]] });
  const asked = [];
  const mgr = manager(w, q, { permissionHandler: async a => { asked.push(a.toolName); return answer.promise; } });
  const { main } = open(mgr, w);
  await mgr.start('시험');
  mgr.postUserMessage({ roomId: main.id, username: '김과제', body: 'curl 돌려 줘' });
  await waitFor(() => mgr.state('시험') === 'waiting_approval');
  const later = mgr.postUserMessage({ roomId: main.id, username: '박과제', body: '그 사이 다른 글' });
  await waitFor(() => q.calls[0].received.length === 2, { what: '승인 대기 중 배달' });
  assert.deepEqual(messageIdsIn(q.calls[0].received[1]), [later.id]);
  assert.equal(mgr.state('시험'), 'waiting_approval', '배달이 승인 대기 상태를 덮지 않는다');
  assert.deepEqual(asked, ['Bash']);
  answer.resolve({ behavior: 'allow', updatedInput: { command: 'curl --version' } });
  await waitFor(() => mgr.state('시험') === 'idle');
  assert.equal(q.calls[0].answers[0].behavior, 'allow');
  await mgr.stop('시험');
});

test('interrupt 는 큐를 거치지 않는다', async () => {
  const w = world(); const hold = deferred();
  const q = makeFakeQueryFn({ turns: [[{ wait: hold.promise }, { result: true }]] });
  const mgr = manager(w, q); const { main } = open(mgr, w);
  await mgr.start('시험');
  mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '긴 일' });
  await waitFor(() => mgr.state('시험') === 'working');
  await mgr.interrupt('시험');
  assert.equal(q.calls[0].interrupts, 1);
  assert.equal(q.calls[0].received.length, 1);
  hold.resolve();
  await mgr.stop('시험');
});

test('/compact 는 idle 을 기다렸다가 밀린 글보다 먼저 들어간다', async () => {
  // 턴 0: 일(붙잡힘) — 그 사이 온 글은 곧바로 가서 턴 0 에 접힌다. 턴 1: /compact(붙잡힘) — 그 사이 온 글은 압축 뒤에
  const w = world(); const hold = deferred(); const holdCompact = deferred();
  const q = makeFakeQueryFn({ turns: [[{ wait: hold.promise }, { result: true }], [{ result: true }], [{ wait: holdCompact.promise }, { result: true }]] });
  const mgr = manager(w, q); const { main } = open(mgr, w);
  await mgr.start('시험');
  mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '일' });
  await waitFor(() => mgr.state('시험') === 'working');
  mgr.compact('시험');
  const during = mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '일하는 중에 온 글' });
  await waitFor(() => q.calls[0].received.length === 2, { what: '글은 곧바로' });
  assert.deepEqual(messageIdsIn(q.calls[0].received[1]), [during.id]);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(q.calls[0].received.length, 2, 'working 중에는 /compact 를 안 넣는다');

  hold.resolve();
  await waitFor(() => q.calls[0].received.length === 3, { what: 'idle 에서 /compact' });
  assert.equal(text(q.calls[0].received[2]), '/compact');
  const after = mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '압축 중에 온 글' });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(q.calls[0].received.length, 3, '압축 턴 동안은 글을 붙잡는다');
  assert.equal(mgr.cockpitDb.pendingInbox(1).length, 1);

  holdCompact.resolve();
  await waitFor(() => q.calls[0].received.length === 4, { what: '압축 뒤 배달' });
  assert.deepEqual(messageIdsIn(q.calls[0].received[3]), [after.id]);
  await mgr.stop('시험');
});

test('채팅 글에는 origin channel/cockpit, /compact 에는 origin human', async () => {
  const w = world(); const q = makeFakeQueryFn();
  const mgr = manager(w, q); const { main } = open(mgr, w);
  await mgr.start('시험');
  mgr.compact('시험');
  await waitFor(() => q.calls[0].received.length === 1);
  mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '안녕' });
  await waitFor(() => q.calls[0].received.length === 2);
  assert.deepEqual(q.calls[0].received[0].origin, { kind: 'human' });
  assert.deepEqual(q.calls[0].received[1].origin, { kind: 'channel', server: 'cockpit' });
  await mgr.stop('시험');

  const w2 = world(); const q2 = makeFakeQueryFn();
  const bare = manager(w2, q2, { origin: null }); const r2 = open(bare, w2);
  await bare.start('시험');
  bare.postUserMessage({ roomId: r2.main.id, username: '김과제', body: '안녕' });
  await waitFor(() => q2.calls[0].received.length === 1);
  assert.equal('origin' in q2.calls[0].received[0], false);
  await bare.stop('시험');
});

test('넷째 세션은 거절(maxSessions 3)', async () => {
  const w = world(); const q = makeFakeQueryFn();
  const mgr = manager(w, q);
  for (const p of ['가', '나', '다', '라']) open(mgr, w, p);
  for (const p of ['가', '나', '다']) await mgr.start(p);
  await assert.rejects(mgr.start('라'), e => e.code === 'LIMIT' && e.status === 409);
  await mgr.stop('가');
  await mgr.start('라');
  for (const p of ['나', '다', '라']) await mgr.stop(p);
});

test('재기동: 새 manager 가 stopped 아닌 줄을 resume:session_id 로 켜고 delivered_at IS NULL 을 순서대로 넣는다', async () => {
  const w = world(); const hold = deferred();
  const qa = makeFakeQueryFn({ turns: [[{ result: true }], [{ wait: hold.promise }]] });
  const a = manager(w, qa); const { main, files } = open(a, w);
  open(a, w, '꺼진과제');
  await a.start('시험');
  a.postUserMessage({ roomId: main.id, username: '김과제', body: '첫 글' });
  await waitFor(() => a.state('시험') === 'idle' && qa.calls[0].received.length === 1);
  a.postUserMessage({ roomId: main.id, username: '김과제', body: '둘째 — 턴 도중 서버가 죽는다' });
  await waitFor(() => qa.calls[0].received.length === 2);
  // 여기서 서버가 죽었다 — 상태는 working 그대로 남는다 (stop 을 안 부른다)
  await a.release('시험');
  assert.equal(a.cockpitDb.agentSession('시험').state, 'working');
  // 서버가 없는 사이 들어온 글 — 큐에만 쌓인다 (W2r.1 뒤로는 살아 있는 세션이면 곧바로 배달되므로 죽은 뒤에 넣는다)
  const m3 = a.postUserMessage({ roomId: files.id, username: '박과제', body: '@TO(prodev-시험-bot) 셋째' });
  const m4 = a.postUserMessage({ roomId: main.id, username: '김과제', body: '넷째' });
  assert.equal(a.cockpitDb.agentSession('시험').session_id, 'sess-1');

  const qb = makeFakeQueryFn();
  const b = manager(w, qb);
  const booted = await b.bootResume();
  assert.deepEqual(booted.map(x => x.project), ['시험']);   // 꺼진과제(stopped)는 안 켠다
  assert.equal(qb.calls[0].options.resume, 'sess-1');
  await waitFor(() => qb.calls[0].received.length === 1);
  assert.deepEqual(messageIdsIn(qb.calls[0].received[0]), [m3.id, m4.id]);
  hold.resolve();
  await b.stop('시험');
});

test('resume 실패면 새 세션으로 켜고 session_events 에 까닭', async () => {
  const w = world();
  const qa = makeFakeQueryFn();
  const a = manager(w, qa); open(a, w);
  await a.start('시험');
  const { main } = a.projectInfo('시험').rooms;
  a.postUserMessage({ roomId: main.id, username: '김과제', body: '글' });
  await waitFor(() => a.state('시험') === 'idle' && qa.calls[0].received.length === 1);

  const qb = makeFakeQueryFn({ resumable: false });
  const b = manager(w, qb);
  await b.bootResume();
  assert.equal(qb.calls.length, 2);
  assert.equal(qb.calls[0].options.resume, 'sess-1');
  assert.equal(qb.calls[1].options.resume, undefined);
  assert.equal(b.state('시험'), 'idle');
  const ev = b.cockpitDb.eventsAfter('시험').find(e => e.type === 'resume_failed');
  assert.equal(ev.data.session_id, 'sess-1');
  assert.match(ev.data.error, /No conversation found/);
  await b.stop('시험');
});

test('compact_boundary → 본방 system 글 둘', async () => {
  const w = world();
  const q = makeFakeQueryFn({ turns: [[
    { msg: { type: 'system', subtype: 'status', status: 'compacting' } },
    { msg: { type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 23614, post_tokens: 2404 } } },
    { result: true },
  ]] });
  const mgr = manager(w, q); const { main } = open(mgr, w);
  await mgr.start('시험');
  mgr.compact('시험');
  await waitFor(() => mgr.chatDb.messagesAfter(main.id).length === 2);
  const sys = mgr.chatDb.messagesAfter(main.id);
  assert.deepEqual(sys.map(m => [m.author_type, m.body]), [['system', COMPACT_START_TEXT], ['system', COMPACT_END_TEXT]]);
  await waitFor(() => mgr.state('시험') === 'idle');
  assert.equal(mgr.cockpitDb.eventsAfter('시험').find(e => e.type === 'compact').data.pre_tokens, 23614);
  await mgr.stop('시험');
});

test('stream_event 는 session_events 에 안 적는다', async () => {
  const w = world();
  const q = makeFakeQueryFn({ turns: [[
    { msg: { type: 'stream_event', event: { type: 'content_block_delta', delta: { text: '안' } } } },
    { msg: { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_9', name: 'mcp__cockpit__reply', input: { chat_id: '1', text: 'x'.repeat(500) } }] }, parent_tool_use_id: null } },
    { msg: { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_9', is_error: true, content: '분량이 넘는다' }] }, parent_tool_use_id: null } },
    { result: true, cost: 0.02 },
  ]] });
  const mgr = manager(w, q); const { main } = open(mgr, w);
  const partials = [];
  mgr.on('partial', p => partials.push(p));
  await mgr.start('시험');
  mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '안녕' });
  await waitFor(() => mgr.cockpitDb.eventsAfter('시험').some(e => e.type === 'result'));
  const events = mgr.cockpitDb.eventsAfter('시험');
  assert.equal(partials.length, 1);
  assert.equal(events.some(e => /stream|partial/.test(e.type)), false);
  const use = events.find(e => e.type === 'tool_use');
  assert.equal(use.data.name, 'mcp__cockpit__reply');
  assert.ok(use.data.input.length <= 201);
  assert.equal(events.find(e => e.type === 'tool_result').data.is_error, true);
  assert.ok(Math.abs(mgr.cockpitDb.agentSession('시험').cost_usd - 0.02) < 1e-9);
  await mgr.stop('시험');
});

test('CLI 가 죽으면 state error 와 까닭', async () => {
  const w = world();
  const q = makeFakeQueryFn({ turns: [[{ throw: 'spawn claude ENOENT' }]] });
  const mgr = manager(w, q); const { main } = open(mgr, w);
  await mgr.start('시험');
  mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '안녕' });
  await waitFor(() => mgr.state('시험') === 'error');
  assert.match(mgr.cockpitDb.eventsAfter('시험').find(e => e.type === 'error').data.error, /ENOENT/);
});
