// 승인 중계 (ARCHITECTURE 6절 · ADR-009). 모의 SDK 가 턴을 붙잡은 채(working) 시험이 SDK 자리에서 canUseTool 을 부른다 —
// 세션 관리자가 SDK 에 넘긴 바로 그 콜백이다. 답은 HTTP 로 한다 (admin · member 쿠키).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { httpWorld } from './fakes/http-world.js';
import { deferred, waitFor } from './fakes/fake-query.js';

const SUGGESTIONS = [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'curl --version' }], behavior: 'allow', destination: 'session' }];

async function world(t, config) {
  const hold = deferred();
  const w = await httpWorld({ turns: [[{ wait: hold.promise }, { result: true }]], config });
  t.after(async () => { hold.resolve(); await w.close(); });
  await w.user('김피엘', 'admin');
  await w.user('박피엘', 'admin');
  await w.user('김과제');
  const opened = w.open();
  await w.manager.start('시험');
  const fd = new FormData();
  fd.append('body', '일을 시작해 주세요');
  await w.json('김과제', `/api/rooms/${opened.main.id}/messages`, { method: 'POST', body: fd });
  await waitFor(() => w.manager.state('시험') === 'working', { what: 'working' });
  const q = w.queryFn.calls[0];
  // SDK 가 부르는 모양 그대로: canUseTool(toolName, input, { signal, toolUseID, agentID, title, … })
  const ask = (toolUseID, extra = {}) => q.options.canUseTool('Bash', { command: 'curl --version' }, {
    signal: new AbortController().signal, requestId: `req-${toolUseID}`, toolUseID, ...extra,
  });
  const answer = (as, id, body) => w.json(as, `/api/permissions/${encodeURIComponent(id)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const systemLines = () => w.chatDb.messagesAfter(opened.main.id, 0).filter(m => m.author_type === 'system').map(m => m.body);
  return { w, q, ask, answer, systemLines, ...opened };
}

test('요청 → permission_requests 한 줄(tool_use_id 키, agent_id)', async t => {
  const { w, ask, answer } = await world(t);
  const card = { title: 'Claude wants to run curl --version', displayName: 'Run command', description: 'curl 판을 본다', decisionReason: '허용 목록 밖', suggestions: SUGGESTIONS, defaultToNo: false };
  const pending = ask('toolu_A', { agentID: 'agent-0123456789', ...card, matchedAskRule: undefined });
  await waitFor(() => w.cockpitDb.pendingPermissions().length === 1, { what: '요청 한 줄' });

  const row = w.cockpitDb.permission('toolu_A');
  assert.equal(row.agent_id, 'agent-0123456789');
  assert.equal(row.project, '시험');
  assert.equal(row.tool, 'Bash');
  assert.deepEqual(JSON.parse(row.input_json), { command: 'curl --version' });
  assert.deepEqual(JSON.parse(row.card_json), card, 'SDK 가 준 카드 칸을 그대로');
  assert.equal(row.answered_at, null);
  assert.equal(w.manager.state('시험'), 'waiting_approval');

  const list = await w.json('김과제', '/api/permissions?pending=1');
  assert.equal(list.status, 200, 'member 도 카드를 본다');
  assert.equal(list.body.requests.length, 1);
  assert.equal(list.body.requests[0].card.title, card.title);
  assert.equal(list.body.requests[0].input, '{"command":"curl --version"}');

  assert.equal((await answer('김피엘', 'toolu_A', { decision: 'allow' })).status, 200);
  assert.deepEqual(await pending, { behavior: 'allow', updatedInput: { command: 'curl --version' } });
  assert.equal(w.cockpitDb.permission('toolu_A').behavior, 'allow');
  assert.equal(w.cockpitDb.permission('toolu_A').answered_by, '김피엘');
  const sse = w.server.hub.buffer.map(f => /event: (\w+)/.exec(f.frame)[1]);
  assert.ok(sse.includes('permission_request') && sse.includes('permission_resolved'), sse.join(','));
});

test('본방 system 글 🔒 요청 한 줄', async t => {
  const { w, ask, answer, systemLines, files } = await world(t);
  const pending = ask('toolu_A', { agentID: 'agent-0123456789', title: 'Claude wants to run curl --version' });
  await waitFor(() => systemLines().length === 1, { what: '🔒 줄' });
  assert.deepEqual(systemLines(), ['🔒 Bash 요청 · Claude wants to run curl --version · 도우미 agent-01']);
  const bare = ask('toolu_B', { displayName: 'Run command' });
  await waitFor(() => systemLines().length === 2, { what: '둘째 🔒 줄' });
  assert.equal(systemLines()[1], '🔒 Bash 요청 · Run command', 'title 이 없으면 displayName, 본 요청은 도우미 칸이 없다');
  assert.equal(w.chatDb.messagesAfter(files.id, 0).length, 0, '파일방에는 안 쓴다');
  await answer('김피엘', 'toolu_A', { decision: 'allow' });
  await answer('김피엘', 'toolu_B', { decision: 'allow' });
  await Promise.all([pending, bare]);
});

test('도우미 둘이 동시에 물으면 카드 둘, 각각 따로 답한다', async t => {
  const { w, ask, answer } = await world(t);
  const a = ask('toolu_A', { agentID: 'agent-aaaaaaaa1' });
  const b = ask('toolu_B', { agentID: 'agent-bbbbbbbb2' });
  await waitFor(() => w.cockpitDb.pendingPermissions().length === 2, { what: '카드 둘' });
  const cards = (await w.json('김피엘', '/api/permissions?pending=1')).body.requests;
  assert.deepEqual(cards.map(c => [c.tool_use_id, c.agent_id]).sort(), [['toolu_A', 'agent-aaaaaaaa1'], ['toolu_B', 'agent-bbbbbbbb2']]);

  assert.equal((await answer('김피엘', 'toolu_B', { decision: 'deny', reason: '밖으로 나가지 마라' })).status, 200);
  assert.deepEqual(await b, { behavior: 'deny', message: '김피엘 거부: 밖으로 나가지 마라' });
  assert.equal(w.cockpitDb.permission('toolu_A').answered_at, null, 'B 의 답이 A 를 닫지 않는다');
  assert.equal(w.manager.state('시험'), 'waiting_approval');

  assert.equal((await answer('박피엘', 'toolu_A', { decision: 'allow' })).status, 200);
  assert.equal((await a).behavior, 'allow');
});

test('admin 둘이 동시에 답하면 하나 200 · 하나 409', async t => {
  const { w, ask, answer, systemLines } = await world(t);
  const pending = ask('toolu_A');
  await waitFor(() => w.cockpitDb.pendingPermissions().length === 1, { what: '요청' });
  const [r1, r2] = await Promise.all([answer('김피엘', 'toolu_A', { decision: 'allow' }), answer('박피엘', 'toolu_A', { decision: 'deny' })]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
  const loser = r1.status === 409 ? r1 : r2;
  assert.deepEqual(loser.body, { error: '이미 답이 있습니다' });
  const winner = r1.status === 200 ? '김피엘' : '박피엘';
  assert.equal(w.cockpitDb.permission('toolu_A').answered_by, winner);
  assert.equal((await pending).behavior, winner === '김피엘' ? 'allow' : 'deny');
  assert.equal(systemLines().filter(l => /^[✅⛔]/u.test(l)).length, 1, '답 줄은 이긴 답 하나');
});

test('member 가 답하면 403', async t => {
  const { w, ask, answer } = await world(t);
  const pending = ask('toolu_A');
  await waitFor(() => w.cockpitDb.pendingPermissions().length === 1, { what: '요청' });
  const r = await answer('김과제', 'toolu_A', { decision: 'allow' });
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: 'admin 만 답할 수 있습니다' });
  assert.equal(w.cockpitDb.permission('toolu_A').answered_at, null);
  assert.equal((await answer('김피엘', 'toolu_A', { decision: '글쎄' })).status, 400);
  assert.equal((await answer('김피엘', 'toolu_없음', { decision: 'allow' })).status, 404);
  await answer('김피엘', 'toolu_A', { decision: 'deny' });
  await pending;
});

test('approvalTimeoutMin 이 지나면 deny 와 behavior=timeout', async t => {
  const { w, ask, answer, systemLines } = await world(t, { approvalTimeoutMin: 0.001 });   // 60ms
  const result = await ask('toolu_A');
  assert.deepEqual(result, { behavior: 'deny', message: '승인 시간 초과 (0.001분)' });
  const row = w.cockpitDb.permission('toolu_A');
  assert.equal(row.behavior, 'timeout');
  assert.equal(row.answered_by, null);
  assert.equal(systemLines().at(-1), '⛔ 시간 초과 거부 (0.001분) · Bash');
  assert.equal((await answer('김피엘', 'toolu_A', { decision: 'allow' })).status, 409, '늦은 답은 먹지 않는다');
});

test('allow_session 은 updatedPermissions=suggestions', async t => {
  const { w, ask, answer } = await world(t);
  const pending = ask('toolu_A', { suggestions: SUGGESTIONS });
  await waitFor(() => w.cockpitDb.pendingPermissions().length === 1, { what: '요청' });
  assert.equal((await answer('김피엘', 'toolu_A', { decision: 'allow_session' })).status, 200);
  assert.deepEqual(await pending, { behavior: 'allow', updatedInput: { command: 'curl --version' }, updatedPermissions: SUGGESTIONS });
  assert.equal(w.cockpitDb.permission('toolu_A').behavior, 'allow_session');
});

test('allow_session 의 updatedPermissions 는 전부 destination=session', async t => {
  const { w, ask, answer } = await world(t);
  // m2-approval 스모크에서 SDK 가 실제로 준 꼴 — destination 이 localSettings 였고 그대로 돌려주자 봇 폴더에 규칙이 남았다
  const given = [
    { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'curl --version' }], behavior: 'allow', destination: 'localSettings' },
    { type: 'addDirectories', directories: ['/tmp/x'], destination: 'projectSettings' },
    { type: 'addRules', rules: [{ toolName: 'Read' }], behavior: 'allow', destination: 'session' },
  ];
  const pending = ask('toolu_A', { suggestions: given });
  await waitFor(() => w.cockpitDb.pendingPermissions().length === 1, { what: '요청' });
  assert.equal((await answer('김피엘', 'toolu_A', { decision: 'allow_session' })).status, 200);
  const result = await pending;
  assert.equal(result.updatedPermissions.length, 3);
  assert.ok(result.updatedPermissions.every(p => p.destination === 'session'), JSON.stringify(result.updatedPermissions));
  assert.deepEqual(result.updatedPermissions.map(({ destination, ...rest }) => rest), given.map(({ destination, ...rest }) => rest), '규칙 내용은 그대로');
  assert.deepEqual(JSON.parse(w.cockpitDb.permission('toolu_A').card_json).suggestions, given, '카드 기록에는 SDK 가 준 그대로 남긴다');
});

test('suppressAlwaysAllowRule 이면 allow_session 400', async t => {
  const { w, ask, answer } = await world(t);
  const pending = ask('toolu_A', { suggestions: SUGGESTIONS, suppressAlwaysAllowRule: true });
  await waitFor(() => w.cockpitDb.pendingPermissions().length === 1, { what: '요청' });
  const r = await answer('김피엘', 'toolu_A', { decision: 'allow_session' });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: '이 요청은 이번 세션 허용을 받지 않습니다' });
  assert.equal(w.cockpitDb.permission('toolu_A').answered_at, null, '거절된 답은 요청을 닫지 않는다');
  assert.equal((await answer('김피엘', 'toolu_A', { decision: 'allow' })).status, 200);
  assert.deepEqual(await pending, { behavior: 'allow', updatedInput: { command: 'curl --version' } });
});

test('signal abort 면 behavior=cancelled', async t => {
  const { w, q, answer, systemLines } = await world(t);
  const ac = new AbortController();
  const pending = q.options.canUseTool('Bash', { command: 'sleep 1' }, { signal: ac.signal, toolUseID: 'toolu_A', requestId: 'r1' });
  await waitFor(() => w.cockpitDb.pendingPermissions().length === 1, { what: '요청' });
  ac.abort();
  assert.equal((await pending).behavior, 'deny');
  assert.equal(w.cockpitDb.permission('toolu_A').behavior, 'cancelled');
  assert.equal(systemLines().at(-1), '⛔ 거둬 감 · Bash');
  assert.equal((await answer('김피엘', 'toolu_A', { decision: 'allow' })).status, 409);
});

test('답마다 본방 system 글 한 줄(허용 ✅ · 거부와 시간 초과 ⛔, 🔒 는 없다)', async t => {
  const { w, q, ask, answer, systemLines } = await world(t);
  const ac = new AbortController();
  const asks = [
    ask('toolu_1'), ask('toolu_2', { suggestions: SUGGESTIONS }), ask('toolu_3'),
    q.options.canUseTool('Read', { file_path: '/x' }, { signal: ac.signal, toolUseID: 'toolu_4', requestId: 'r4' }),
  ];
  await waitFor(() => w.cockpitDb.pendingPermissions().length === 4, { what: '요청 넷' });
  await answer('김피엘', 'toolu_1', { decision: 'allow' });
  await answer('박피엘', 'toolu_2', { decision: 'allow_session' });
  await answer('김피엘', 'toolu_3', { decision: 'deny', reason: '안 된다' });
  ac.abort();
  await Promise.all(asks);

  const lines = systemLines();
  assert.equal(lines.filter(l => l.includes('🔒')).length, 4, '🔒 수 = 요청 수');
  assert.deepEqual(lines.filter(l => !l.startsWith('🔒')), [
    '✅ 김피엘 허용 · Bash',
    '✅ 박피엘 이번 세션 허용 · Bash',
    '⛔ 김피엘 거부 · Bash',
    '⛔ 거둬 감 · Read',
  ]);
});

test('걸린 요청이 0 이 되면 state working', async t => {
  const { w, ask, answer } = await world(t);
  const states = [];
  w.manager.on('state', e => states.push(e.state));
  const a = ask('toolu_A');
  const b = ask('toolu_B');
  await waitFor(() => w.cockpitDb.pendingPermissions().length === 2, { what: '요청 둘' });
  assert.equal(w.manager.state('시험'), 'waiting_approval');
  await answer('김피엘', 'toolu_A', { decision: 'allow' });
  await a;
  assert.equal(w.manager.state('시험'), 'waiting_approval', '하나가 남아 있으면 그대로');
  await answer('김피엘', 'toolu_B', { decision: 'allow' });
  await b;
  assert.equal(w.manager.state('시험'), 'working');
  assert.equal(w.cockpitDb.agentSession('시험').state, 'working');
  assert.deepEqual(states.filter((s, i) => s !== states[i - 1]), ['waiting_approval', 'working']);
});
