// 승인 카드 — 글자만 (PRD F11). DOM 없이 순수 함수로.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPermissionEvent, cardView } from '../web/card.js';

// m2-approval 스모크에서 SDK 가 실제로 준 꼴 (title 이 null 이었다)
const request = over => ({
  tool_use_id: 'toolu_A', project: '수율', tool: 'Bash', agent_id: null, asked_at: '2026-09-14T07:40:00.000Z',
  input: '{"command":"curl --version"}',
  card: { displayName: 'Bash', description: 'Check curl version', suggestions: [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'curl --version' }], behavior: 'allow', destination: 'localSettings' }] },
  ...over,
});

test('title 이 있으면 title, 없으면 displayName', () => {
  const titled = cardView(request({ card: { title: 'Claude wants to run curl --version', displayName: 'Run command', description: 'curl 판을 본다' } }), { role: 'admin' });
  assert.equal(titled.heading, 'Claude wants to run curl --version');
  assert.equal(titled.subheading, 'Run command');
  assert.equal(titled.description, 'curl 판을 본다');
  const untitled = cardView(request(), { role: 'admin' });
  assert.equal(untitled.heading, 'Bash');
  assert.equal(untitled.subheading, null);
  assert.equal(cardView(request({ card: {} }), { role: 'admin' }).heading, 'Bash', '둘 다 없으면 도구 이름');
  assert.equal(cardView(request({ agent_id: 'agent-0123456789' })).agent, 'agent-01');
});

test('suppressAlwaysAllowRule 이면 이번 세션 허용 단추가 없다', () => {
  assert.deepEqual(cardView(request(), { role: 'admin' }).buttons.map(b => b.decision), ['allow', 'allow_session', 'deny']);
  const suppressed = cardView(request({ card: { displayName: 'Bash', suppressAlwaysAllowRule: true } }), { role: 'admin' });
  assert.deepEqual(suppressed.buttons.map(b => b.decision), ['allow', 'deny']);
  assert.ok(!suppressed.buttons.some(b => b.label === '이번 세션 허용'));
});

test('defaultToNo 면 초점이 거부', () => {
  const v = cardView(request({ card: { displayName: 'Bash', defaultToNo: true } }), { role: 'admin' });
  assert.equal(v.focus, 'deny');
  assert.equal(v.buttons[0].decision, 'deny', '거부가 맨 앞 — 카드에 들어온 첫 Enter 가 허용이 되지 않는다');
  assert.equal(cardView(request(), { role: 'admin' }).focus, 'allow');
});

test('member 화면에는 단추가 없다', () => {
  for (const role of ['member', undefined]) {
    const v = cardView(request({ card: { displayName: 'Bash', defaultToNo: true } }), { role });
    assert.deepEqual(v.buttons, []);
    assert.equal(v.focus, null);
    assert.equal(v.note, 'admin 이 답합니다');
    assert.equal(v.heading, 'Bash', '카드 글은 member 도 본다');
  }
});

test('permission_resolved 를 받으면 카드를 거둔다', () => {
  let cards = [];
  cards = applyPermissionEvent(cards, 'permission_request', request());
  cards = applyPermissionEvent(cards, 'permission_request', request({ tool_use_id: 'toolu_B' }));
  cards = applyPermissionEvent(cards, 'permission_request', request());   // 다시 받은 같은 요청(재접속)은 하나로
  assert.deepEqual(cards.map(c => c.tool_use_id), ['toolu_A', 'toolu_B']);
  cards = applyPermissionEvent(cards, 'permission_resolved', { project: '수율', tool_use_id: 'toolu_A', behavior: 'deny', answered_by: '김피엘' });
  assert.deepEqual(cards.map(c => c.tool_use_id), ['toolu_B']);
  assert.equal(applyPermissionEvent(cards, 'message', {}), cards, '다른 사건은 그대로');
});
