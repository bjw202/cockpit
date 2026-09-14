// 과제 탭 · 압축 경계 · 칩 (TASKS M3.5) — 화면 순수 함수, DOM 없이.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANES, applySessionState, chatItems, tabsView } from '../web/tabs.js';
import { COMPACT_START_TEXT, COMPACT_END_TEXT } from '../src/session/manager.js';

const project = (name, state = 'stopped') => ({ name, bot: { id: 1, name: `prodev-${name}-bot` }, rooms: {}, session: { state } });
const msg = (id, author_type, body) => ({ id, room_id: 1, author_type, body, created_at: '2026-09-14 10:00:00', author_name: author_type === 'system' ? '시스템' : '김과제', attachments: [] });

test('과제마다 탭 하나', () => {
  const tabs = tabsView([project('수율', 'working'), project('worktogether'), project('수율', 'working')], 'worktogether');
  assert.deepEqual(tabs.map(t => [t.name, t.active]), [['수율', false], ['worktogether', true]], '같은 이름은 하나');
  assert.equal(tabs[0].chip.text, '생각 중', '목록의 state 로 첫 칩');
  assert.equal(tabs[1].chip.text, '꺼짐');
  assert.deepEqual(tabsView([], null), []);
  assert.deepEqual(PANES.map(p => p.label), ['채팅', '조종석', '파일'], '판 셋');
});

test('compact_boundary 는 채팅 판에 경계 한 줄', () => {
  // 세션 관리자가 compact_boundary 에 남기는 system 글 둘 — 문장이 화면 쪽 사본과 같아야 경계가 된다
  const items = chatItems([
    msg(1, 'user', '@TO(prodev-수율-bot) 요약해 줘'),
    msg(2, 'system', COMPACT_START_TEXT),
    msg(3, 'system', COMPACT_END_TEXT),
    msg(4, 'bot', '이어서 합니다'),
  ]);
  assert.deepEqual(items.map(i => i.kind), ['message', 'message', 'boundary', 'message']);
  assert.equal(items.filter(i => i.kind === 'boundary').length, 1);
  assert.equal(items[2].id, 3);
  assert.match(items[2].text, /문맥 정리/);
  assert.equal(chatItems([msg(5, 'user', COMPACT_END_TEXT)])[0].kind, 'message', '사람이 같은 문장을 써도 경계가 아니다');
});

test('session_state 사건으로 칩이 바뀐다', () => {
  const projects = [project('수율', 'idle')];
  let statuses = new Map();
  assert.equal(tabsView(projects, '수율', statuses)[0].chip, null, 'idle 은 칩이 없다');
  statuses = applySessionState(statuses, { project: '수율', state: 'waiting_approval' });
  assert.equal(tabsView(projects, '수율', statuses)[0].chip.text, '승인 대기');
  const before = statuses;
  statuses = applySessionState(statuses, { project: '수율', state: 'stopped' });
  assert.equal(tabsView(projects, '수율', statuses)[0].chip.text, '꺼짐');
  assert.equal(before.get('수율').status, 'approval', '새 Map 을 돌려준다');
});
