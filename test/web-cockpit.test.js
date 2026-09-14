// 조종석 판의 순수 함수 — DOM 없이 (TASKS M3.2 · VERIFICATION 6절: 화면 시험은 순수 함수와 정적 검사뿐이다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COST_NOTE, contextPercent, costText, currentTurnTools, groupByParent, headerView, hookRows, mergeEvents, sessionButtons, taskRows, toolRowView,
} from '../web/cockpit.js';

let seq = 0;
const ev = (type, data) => ({ id: ++seq, at: '2026-09-14T10:00:00.000Z', type, data });
const use = (id, name, input = '{}', parent = null) => ev('tool_use', { id, name, input, file_path: null, parent_tool_use_id: parent });
const res = (id, isError = false, parent = null, content = 'ok') => ev('tool_result', { tool_use_id: id, is_error: isError, content, duration_ms: 1500, parent_tool_use_id: parent });
const result = cost => ev('result', { subtype: 'success', num_turns: 1, duration_ms: 10, total_cost_usd: cost, permission_denials: 0 });

test('이번 턴 도구 목록은 마지막 result 뒤의 tool_use 만', () => {
  const events = [
    use('a1', 'Bash'), res('a1'), result(0.1),
    use('b1', 'Read', '{"file_path":"/p/x.csv"}'), res('b1'),
    use('b2', 'mcp__cockpit__reply'),
  ];
  const rows = currentTurnTools(events);
  assert.deepEqual(rows.map(r => [r.id, r.name, r.done]), [['b1', 'Read', true], ['b2', 'mcp__cockpit__reply', false]]);
  assert.equal(rows[0].durationMs, 1500);
  assert.deepEqual(currentTurnTools([...events, res('b2'), result(0.2)]), [], 'result 로 끝난 턴 뒤에는 빈 목록');
  assert.deepEqual(currentTurnTools([use('c1', 'Bash')]).map(r => r.id), ['c1'], 'result 가 없으면 처음부터');
  assert.equal(toolRowView(rows[1]).status, '도는 중');
});

test('is_error tool_result 는 빨강 표시', () => {
  const rows = currentTurnTools([use('r1', 'mcp__cockpit__reply', '{"text":"긴 글"}'), res('r1', true, null, '분량 900자를 넘는다 — 파일로 옮겨 첨부하라'), use('r2', 'Bash'), res('r2')]);
  const bad = toolRowView(rows[0]);
  assert.equal(bad.tone, 'red');
  assert.equal(bad.className, 'tool tool-red');
  assert.match(bad.status, /^오류 · 1\.5초$/);
  assert.equal(bad.result, '분량 900자를 넘는다 — 파일로 옮겨 첨부하라', '막은 까닭을 보인다');
  const ok = toolRowView(rows[1]);
  assert.deepEqual([ok.tone, ok.className, ok.result], ['done', 'tool tool-done', null]);
  const hooks = hookRows([ev('hook', { subtype: 'hook_started', hook_event: 'PreToolUse', hook_name: 'pre-reply', exit_code: null }), ev('hook', { subtype: 'hook_response', hook_event: 'PreToolUse', hook_name: 'pre-reply', exit_code: 2 }), ev('hook', { subtype: 'hook_response', hook_event: 'SessionStart', hook_name: 'session-start', exit_code: 0 })]);
  assert.deepEqual(hooks.map(h => [h.name, h.blocked]), [['pre-reply', true], ['session-start', false]], '훅 막힘도 빨강 재료');
});

test('도우미 사건은 parent_tool_use_id 로 묶인다', () => {
  const rows = currentTurnTools([
    use('t1', 'Task', '{"description":"리서치"}'),
    use('h1', 'WebFetch', '{"url":"…"}', 't1'), res('h1', false, 't1'),
    use('m1', 'Bash'),
    use('h2', 'Write', '{"file_path":"research/x.md"}', 't1'),
    use('g1', 'Read', '{}', 't9'),
  ]);
  const g = groupByParent(rows);
  assert.deepEqual(g.main.map(r => r.id), ['t1', 'm1']);
  assert.deepEqual(g.helpers.map(h => [h.parent, h.rows.map(r => r.id)]), [['t1', ['h1', 'h2']], ['t9', ['g1']]]);
  assert.equal(g.helpers[0].title, 'Task · {"description":"리서치"}', '띄운 호출이 보이면 그 이름으로');
  assert.equal(g.helpers[1].title, '도우미 t9', '안 보이면 id 앞자리');
});

test('문맥 사용률 백분율', () => {
  assert.equal(contextPercent({ percentage: 12.5, total_tokens: 25000, max_tokens: 200000 }), '13%');
  assert.equal(contextPercent({ percentage: null, total_tokens: 50000, max_tokens: 200000 }), '25%', 'percentage 가 없으면 토큰으로');
  assert.equal(contextPercent(87.2), '87%');
  assert.equal(contextPercent(null), '—');
  assert.equal(contextPercent({}), '—');
  assert.equal(contextPercent(130), '100%');
  const h = headerView({ name: '수율', session: { state: 'working', cost_usd: 0.4, model: null, context_pct: 40 } }, [
    ev('init', { account: { apiKeySource: 'none', subscriptionType: 'Claude Max' }, commands: 3, agents: [], resumed: false }),
    ev('init', { model: 'claude-haiku-4-5-20251001', permissionMode: 'default', mcp_servers: [] }),
    ev('context', { percentage: 61.4, total_tokens: 1, max_tokens: 2, model: 'x' }),
  ]);
  assert.deepEqual([h.stateText, h.model, h.account, h.context], ['일하는 중', 'claude-haiku-4-5-20251001', 'Claude Max', '61%'], '사건의 마지막 context 가 목록의 값보다 새것');
});

test('값 옆에 "추정치" 글자', () => {
  assert.equal(COST_NOTE, '추정치');
  assert.equal(costText(0.4), '$0.40 추정치');
  assert.equal(costText(null), '$0.00 추정치');
  assert.equal(headerView({ session: { state: 'idle', cost_usd: 2.7182 } }).cost, '$2.72 추정치');
});

test('세션 조작 단추는 admin 에게만 · 상태마다 켤 것만', () => {
  assert.deepEqual(sessionButtons('working', 'member'), []);
  const on = (state, role = 'admin') => sessionButtons(state, role).filter(b => b.enabled).map(b => b.op);
  assert.deepEqual(on('stopped'), ['start']);
  assert.deepEqual(on('idle'), ['compact', 'stop', 'restart']);
  assert.deepEqual(on('working'), ['interrupt', 'compact', 'stop', 'restart']);
  assert.deepEqual(on('error'), ['start', 'stop', 'restart']);
  assert.deepEqual(sessionButtons('idle', 'admin').map(b => b.label), ['켜기', '멈춤', '압축', '끄기', '다시 켜기']);
});

test('백그라운드 도우미 목록 — 마지막 집합 · ambient 뺌 · 새 프로세스면 비움 · 사건 합치기', () => {
  const events = [
    ev('task', { subtype: 'task_started', task_id: 't1', description: '리서치', subagent_type: 'researcher' }),
    ev('task', { subtype: 'background_tasks_changed', tasks: [{ task_id: 't1', task_type: 'local_agent', description: '리서치', ambient: false }, { task_id: 'w', task_type: 'monitor', description: '감시', ambient: true }] }),
    ev('task', { subtype: 'task_progress', task_id: 't1', description: '문헌 셋째', last_tool_name: 'WebFetch' }),
  ];
  assert.deepEqual(taskRows(events), [{ id: 't1', type: 'local_agent', description: '문헌 셋째', lastTool: 'WebFetch' }]);
  assert.deepEqual(taskRows([...events, ev('init', { account: {}, commands: 0, agents: [], resumed: true })]), [], '다시 켜진 프로세스는 빈 집합에서');
  assert.deepEqual(taskRows([ev('task', { subtype: 'task_started', task_id: 'x', description: 'y' })]), [], '수준 신호가 오기 전에는 비움');
  const merged = mergeEvents(events.slice(0, 2), [events[1], events[2]]);
  assert.deepEqual(merged.map(e => e.id), events.map(e => e.id), 'id 가 겹치면 하나');
});
