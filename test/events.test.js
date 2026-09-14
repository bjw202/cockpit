// 사건 접기와 되그리기 (TASKS M3.1 · ARCHITECTURE 5.3) — 모의 SDK 가 낸 메시지가 session_events 의 어느 type 이 되나,
// 그리고 GET /api/projects/:name/events?after= 가 그것을 되돌려 주나.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChatDb } from '../src/db/chat-db.js';
import { CockpitDb } from '../src/db/cockpit-db.js';
import { SessionManager } from '../src/session/manager.js';
import { makeFakeQueryFn, waitFor } from './fakes/fake-query.js';
import { httpWorld } from './fakes/http-world.js';

function managerWorld(turns, extra = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-events-')));
  const config = { maxSessions: 3, projectsDir: path.join(dir, 'projects'), uploadsDir: path.join(dir, 'uploads'), extraEnvKeys: [] };
  fs.mkdirSync(config.projectsDir, { recursive: true });
  const q = makeFakeQueryFn({ turns, ...extra });
  const mgr = new SessionManager({
    chatDb: new ChatDb(path.join(dir, 'data', 'chat.db')), cockpitDb: new CockpitDb(path.join(dir, 'data', 'cockpit.db')),
    config, queryFn: q, makeMcpServer: handlers => ({ handlers }), processEnv: { PATH: '/bin' },
  });
  const botDir = path.join(dir, 'bots', 'prodev-시험-bot');
  fs.mkdirSync(botDir, { recursive: true });
  const { main } = mgr.openProject({ project: '시험', botDir });
  return { mgr, q, main };
}

const assistantToolUse = (id, name, input, parent = null) => ({ msg: { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] }, parent_tool_use_id: parent } });
const toolResult = (id, content, isError = false, parent = null) => ({ msg: { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] }, parent_tool_use_id: parent } });
const sys = (subtype, more = {}) => ({ msg: { type: 'system', subtype, ...more } });
const turnTypes = events => events.filter(e => !['init', 'delivered', 'command'].includes(e.type)).map(e => [e.type, e.data.subtype ?? e.data.type ?? e.data.name ?? null]);

test('ARCHITECTURE 5.3 표의 메시지마다 type 이 맞다', async () => {
  const { mgr, main } = managerWorld([[
    assistantToolUse('toolu_1', 'Bash', { command: 'node scripts/find.js 수율' }),
    sys('hook_started', { hook_event: 'PreToolUse', hook_name: 'pre-reply' }),
    sys('hook_response', { hook_event: 'PreToolUse', hook_name: 'pre-reply', exit_code: 2 }),
    toolResult('toolu_1', '카드 E-0007', false),
    sys('task_started', { task_id: 't1', tool_use_id: 'toolu_2', description: '리서치', subagent_type: 'researcher', is_backgrounded: true }),
    sys('task_progress', { task_id: 't1', description: '문헌 셋째', last_tool_name: 'WebFetch', usage: { total_tokens: 1, tool_uses: 1, duration_ms: 1 } }),
    sys('task_updated', { task_id: 't1', patch: { status: 'running' } }),
    sys('background_tasks_changed', { tasks: [{ task_id: 't1', task_type: 'local_agent', description: '리서치' }] }),
    sys('task_notification', { task_id: 't1', status: 'completed', summary: '끝', output_file: '/x' }),
    sys('status', { status: 'compacting' }),
    sys('compact_boundary', { compact_metadata: { trigger: 'auto', pre_tokens: 150000 } }),
    { msg: { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning' } } },
    { msg: { type: 'auth_status', isAuthenticating: false, error: '로그인 만료' } },
    { msg: { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '안' } } } },
    { result: true, cost: 0.03 },
  ]]);
  await mgr.start('시험');
  mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '찾아 줘' });
  await waitFor(() => mgr.cockpitDb.eventsAfter('시험').some(e => e.type === 'context'), { what: 'result 뒤 context' });
  const events = mgr.cockpitDb.eventsAfter('시험');
  assert.deepEqual(turnTypes(events), [
    ['tool_use', 'Bash'],
    ['hook', 'hook_started'], ['hook', 'hook_response'],
    ['tool_result', null],
    ['task', 'task_started'], ['task', 'task_progress'], ['task', 'task_updated'], ['task', 'background_tasks_changed'], ['task', 'task_notification'],
    ['status', null], ['compact', null],
    ['status', 'rate_limit_event'], ['status', 'auth_status'],
    ['result', 'success'],
    ['context', null],
  ]);
  const by = type => events.filter(e => e.type === type);
  assert.equal(by('hook')[1].data.exit_code, 2);
  assert.equal(by('tool_result')[0].data.tool_use_id, 'toolu_1');
  assert.ok(Number.isInteger(by('tool_result')[0].data.duration_ms), '걸린 시간');
  assert.deepEqual(by('task')[3].data.tasks, [{ task_id: 't1', task_type: 'local_agent', description: '리서치', ambient: false }]);
  assert.equal(by('task')[4].data.status, 'completed');
  assert.equal(by('status')[1].data.type, 'rate_limit_event');
  assert.equal(by('status')[2].data.error, '로그인 만료', 'auth_status 의 작은 칸은 옮긴다');
  assert.equal(by('compact')[0].data.pre_tokens, 150000);
  assert.deepEqual(by('context')[0].data, { percentage: 12.5, total_tokens: 25000, max_tokens: 200000, model: 'fake' });
  assert.deepEqual(mgr.sessionInfo('시험'), { model: 'fake', context_pct: 12.5 }, '머리의 모델은 system/init, 사용률은 context');
  await mgr.stop('시험');
});

test('tool_use 입력 요약은 200자', async () => {
  const long = { command: `echo ${'가'.repeat(500)}`, file_path: `/p/${'긴이름'.repeat(100)}.csv` };
  const { mgr, main } = managerWorld([[assistantToolUse('toolu_9', 'Read', long, 'toolu_parent'), toolResult('toolu_9', 'x'.repeat(900), true, 'toolu_parent'), { result: true }]]);
  await mgr.start('시험');
  mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '읽어 줘' });
  await waitFor(() => mgr.cockpitDb.eventsAfter('시험').some(e => e.type === 'result'));
  const events = mgr.cockpitDb.eventsAfter('시험');
  const use = events.find(e => e.type === 'tool_use').data;
  assert.equal(use.input.length, 201, '200자 + …');
  assert.ok(use.input.endsWith('…'));
  assert.equal(use.file_path, long.file_path, 'file_path 는 자르지 않는다');
  assert.equal(use.parent_tool_use_id, 'toolu_parent');
  const res = events.find(e => e.type === 'tool_result').data;
  assert.equal(res.content.length, 201);
  assert.deepEqual([res.is_error, res.parent_tool_use_id], [true, 'toolu_parent']);
  await mgr.stop('시험');
});

test('stream_event 0행', async () => {
  const deltas = Array.from({ length: 30 }, (_, i) => ({ msg: { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: String(i) } } } }));
  const { mgr, main } = managerWorld([[...deltas, { result: true }]]);
  const partials = [];
  mgr.on('partial', p => partials.push(p));
  await mgr.start('시험');
  mgr.postUserMessage({ roomId: main.id, username: '김과제', body: '말해 줘' });
  await waitFor(() => mgr.cockpitDb.eventsAfter('시험').some(e => e.type === 'result'));
  assert.equal(partials.length, 30, '살아 있는 화면에는 흘린다');
  const n = mgr.cockpitDb.db.prepare("SELECT COUNT(*) AS n FROM session_events WHERE type LIKE '%stream%' OR json LIKE '%content_block_delta%'").get().n;
  assert.equal(n, 0);
  await mgr.stop('시험');
});

test('result 마다 cost_usd 누적', async () => {
  // SDK 의 total_cost_usd 가 이미 세션 누적값이다 — 행마다 그 누적값을 적고, agent_sessions.cost_usd 는 마지막 누적값 (W2r.2)
  const { mgr, main } = managerWorld([[{ result: true, cost: 0.05 }], [{ result: true, cost: 0.12 }], [{ result: true, cost: 0.2 }]]);
  await mgr.start('시험');
  const results = () => mgr.cockpitDb.eventsAfter('시험').filter(e => e.type === 'result');
  for (const [i, body] of ['하나', '둘', '셋'].entries()) {
    mgr.postUserMessage({ roomId: main.id, username: '김과제', body });
    await waitFor(() => results().length === i + 1 && mgr.state('시험') === 'idle');
    assert.ok(Math.abs(mgr.cockpitDb.agentSession('시험').cost_usd - [0.05, 0.12, 0.2][i]) < 1e-9, `result ${i + 1} 뒤`);
  }
  assert.deepEqual(results().map(e => e.data.total_cost_usd), [0.05, 0.12, 0.2], '누적값이 줄지 않는다');
  await mgr.stop('시험');
});

test('after=N 이면 N 뒤만', async t => {
  const w = await httpWorld({ turns: [[assistantToolUse('toolu_1', 'Bash', { command: 'ls' }), toolResult('toolu_1', 'ok'), { result: true }]] });
  t.after(() => w.close());
  await w.user('김과제');
  w.open('수율');
  await w.manager.start('수율');
  const { main } = w.chatDb.projectRooms('수율');
  w.manager.postUserMessage({ roomId: main.id, username: '김과제', body: 'ls' });
  await waitFor(() => w.cockpitDb.eventsAfter('수율').some(e => e.type === 'context'));

  const all = await w.json('김과제', `/api/projects/${encodeURIComponent('수율')}/events`);
  assert.equal(all.status, 200, 'member 도 본다');
  const ids = all.body.events.map(e => e.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), '오름차순');
  assert.deepEqual(Object.keys(all.body.events[0]).sort(), ['at', 'data', 'id', 'type']);
  const cut = ids[2];
  const after = await w.json('김과제', `/api/projects/${encodeURIComponent('수율')}/events?after=${cut}`);
  assert.deepEqual(after.body.events.map(e => e.id), ids.filter(id => id > cut));
  assert.deepEqual((await w.json('김과제', `/api/projects/${encodeURIComponent('수율')}/events?after=${ids.at(-1)}`)).body.events, []);
  assert.equal((await w.json('김과제', '/api/projects/없는과제/events')).status, 404);
  assert.equal((await w.json(null, `/api/projects/${encodeURIComponent('수율')}/events`)).status, 401);

  const listed = (await w.json('김과제', '/api/projects')).body.projects[0].session;
  assert.deepEqual([listed.model, listed.context_pct], ['fake', 12.5], 'GET /api/projects 머리 두 칸');
  await w.manager.stop('수율');
});
