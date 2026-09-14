// 과제 탭 · 판 고르기 · 채팅 판의 압축 경계 (ARCHITECTURE 7절 · TASKS M3.5).
// 순수 함수는 DOM 없이 시험한다 (test/web-tabs.test.js).

import { COMPACT_TEXTS, statusChip, statusOfState } from './chat.js';

export const PANES = Object.freeze([
  Object.freeze({ id: 'chat', label: '채팅' }),
  Object.freeze({ id: 'cockpit', label: '조종석' }),
  Object.freeze({ id: 'files', label: '파일' }),
]);

// 과제마다 탭 하나 — 같은 이름이 두 번 와도(다른 탭의 project_opened 뒤 목록 겹침) 하나
export function tabsView(projects, current, statuses = new Map()) {
  const seen = new Set();
  const out = [];
  for (const p of projects ?? []) {
    if (!p?.name || seen.has(p.name)) continue;
    seen.add(p.name);
    const st = statuses.get(p.name) ?? { status: statusOfState(p.session?.state) };
    out.push({ name: p.name, active: p.name === current, chip: statusChip(st.status, st.tool) });
  }
  return out;
}

// session_state 사건 → 칩 재료. 새 Map 을 돌려준다 (bot_status 는 도구 이름까지 싣고 오므로 그쪽이 오면 그것이 이긴다)
export function applySessionState(statuses, { project, state }) {
  const next = new Map(statuses);
  next.set(project, { status: statusOfState(state) });
  return next;
}

// 채팅 판의 줄 — 압축이 끝났다는 system 글(compact_boundary 가 남긴 것)은 경계 한 줄로 바꾼다.
// "정리 중" 글은 그대로 둔다 (그 사이 봇이 바쁜 까닭이다)
export function chatItems(messages) {
  return (messages ?? []).map(m => (m.author_type === 'system' && m.body === COMPACT_TEXTS[1]
    ? { kind: 'boundary', id: m.id, text: `문맥 정리 · ${m.body}`, message: m }
    : { kind: 'message', id: m.id, message: m }));
}

export function renderBoundary(item, doc = document) {
  const li = doc.createElement('li');
  li.className = 'boundary';
  li.dataset.id = String(item.id);
  li.setAttribute('role', 'separator');
  li.textContent = item.text;
  return li;
}
