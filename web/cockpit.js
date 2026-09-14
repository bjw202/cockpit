// 조종석 판 — 머리(모델 · 계정 종류 · 상태 · 값 · 문맥 사용률) · 이번 턴 도구 호출 · 도우미 · 훅 · 세션 조작 단추 (ARCHITECTURE 7절 · 5.3).
// 재료는 session_events 한 줄기다: GET /api/projects/:name/events?after= 로 되그리고 SSE session_event 로 잇는다.
// 순수 함수는 DOM 없이 시험한다 (test/web-cockpit.test.js). DOM 을 만드는 함수는 doc 을 받고 textContent 로만 채운다.

import { toolLabel, toolSummary } from './glue.js';

export const COST_NOTE = '추정치';
export const EVENTS_KEEP = 2000;   // 화면이 들고 있는 사건 수 — 넘치면 오래된 것부터 버린다 (되그리기는 서버에서)

const STATE_TEXT = Object.freeze({
  stopped: '꺼짐', starting: '켜는 중', idle: '대기', working: '일하는 중', waiting_approval: '승인 대기', error: '오류',
});

export const stateText = state => STATE_TEXT[state] ?? String(state ?? '모름');

// 값은 SDK 가 낸 세션 누적 추정치다 — 청구액이 아니다 (ARCHITECTURE 5.3 끝줄)
export function costText(usd) {
  const n = Number(usd);
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)} ${COST_NOTE}`;
}

// context 사건 data 또는 숫자 → '13%'. 퍼센트를 못 구하면 '—'
export function contextPercent(input) {
  let pct = null;
  if (typeof input === 'number') pct = input;
  else if (input && Number.isFinite(input.percentage)) pct = input.percentage;
  else if (input && input.max_tokens > 0 && Number.isFinite(input.total_tokens)) pct = (100 * input.total_tokens) / input.max_tokens;
  if (!Number.isFinite(pct)) return '—';
  return `${Math.round(Math.max(0, Math.min(100, pct)))}%`;
}

// 사건 목록에 새것을 붙인다 — id 가 겹치면 버리고 id 순을 지킨다
export function mergeEvents(events, incoming) {
  const seen = new Set(events.map(e => e.id));
  const out = [...events];
  for (const e of incoming) if (e && !seen.has(e.id)) { seen.add(e.id); out.push(e); }
  out.sort((a, b) => a.id - b.id);
  return out.length > EVENTS_KEEP ? out.slice(out.length - EVENTS_KEEP) : out;
}

// 이번 턴 = 마지막 result 뒤. 도구 호출마다 결과를 짝지어 한 줄
export function currentTurnTools(events) {
  let start = 0;
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === 'result') { start = i + 1; break; }
  const turn = events.slice(start);
  const results = new Map(turn.filter(e => e.type === 'tool_result').map(e => [e.data.tool_use_id, e.data]));
  return turn.filter(e => e.type === 'tool_use').map(e => {
    const r = results.get(e.data.id);
    return {
      id: e.data.id, name: e.data.name, input: e.data.input ?? '', parent: e.data.parent_tool_use_id ?? null,
      done: !!r, isError: !!r?.is_error, durationMs: r?.duration_ms ?? null, result: r?.content ?? null,
    };
  });
}

// is_error 는 빨강 — 훅이 막은 reply 도 여기서만 보인다 (실증 3 걸림 3)
// (M6 N17) label 은 mcp__cockpit__ 를 뗀 이름 · summary 는 도구별 한 줄 · detail 은 서버가 준 입력 요약(누르면 펼친다)
export function toolRowView(row, project = null) {
  const tone = row.isError ? 'red' : row.done ? 'done' : 'running';
  const secs = row.durationMs == null ? '' : ` · ${(row.durationMs / 1000).toFixed(1)}초`;
  return {
    id: row.id, tone,
    className: ['tool', `tool-${tone}`].join(' '),
    label: toolLabel(row.name),
    summary: toolSummary(row.name, row.input, project),
    detail: row.input,
    status: row.isError ? `오류${secs}` : row.done ? `끝${secs}` : '도는 중',
    result: row.isError ? row.result : null,
  };
}

// 도우미 안의 호출은 그 도우미를 띄운 tool_use 의 id(parent_tool_use_id)로 묶는다
export function groupByParent(rows) {
  const main = [];
  const helpers = new Map();
  for (const r of rows) {
    if (!r.parent) { main.push(r); continue; }
    if (!helpers.has(r.parent)) helpers.set(r.parent, []);
    helpers.get(r.parent).push(r);
  }
  const byId = new Map(rows.map(r => [r.id, r]));
  return {
    main,
    helpers: [...helpers.entries()].map(([parent, list]) => {
      const spawn = byId.get(parent);
      return { parent, title: spawn ? `${spawn.name} · ${spawn.input}` : `도우미 ${String(parent).slice(0, 12)}`, rows: list };
    }),
  };
}

// 이번 턴의 훅 — exit_code 가 0 이 아니면 막힘(빨강)
export function hookRows(events) {
  let start = 0;
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === 'result') { start = i + 1; break; }
  return events.slice(start).filter(e => e.type === 'hook' && e.data.subtype === 'hook_response').map(e => ({
    id: e.id, name: e.data.hook_name ?? e.data.hook_event ?? '훅', event: e.data.hook_event ?? null,
    exitCode: e.data.exit_code, blocked: e.data.exit_code != null && e.data.exit_code !== 0,
  }));
}

// 돌고 있는 도우미 — background_tasks_changed 의 마지막 집합(수준 신호)에 task 사건의 설명 · 상태를 덧댄다
export function taskRows(events) {
  let live = null;
  const info = new Map();
  for (const e of events) {
    if (e.type === 'init' && e.data.resumed !== undefined) { live = new Map(); continue; }   // 새 CLI 프로세스면 빈 집합에서
    if (e.type !== 'task') continue;
    const d = e.data;
    if (d.subtype === 'background_tasks_changed') { live = new Map((d.tasks ?? []).filter(t => !t.ambient).map(t => [t.task_id, t])); continue; }
    if (!d.task_id) continue;
    info.set(d.task_id, { ...(info.get(d.task_id) ?? {}), ...Object.fromEntries(Object.entries(d).filter(([, v]) => v != null && v !== '')) });
  }
  if (!live) return [];
  return [...live.values()].map(t => {
    const i = info.get(t.task_id) ?? {};
    return { id: t.task_id, type: t.task_type ?? i.subagent_type ?? null, description: i.description || t.description || '', lastTool: i.last_tool_name ?? null };
  });
}

// 머리 — 과제(GET /api/projects 한 줄)와 사건에서
export function headerView(project, events = []) {
  const s = project?.session ?? {};
  const lastOf = type => { for (let i = events.length - 1; i >= 0; i--) if (events[i].type === type) return events[i].data; return null; };
  let account = null; let model = s.model ?? null;
  for (const e of events) {
    if (e.type !== 'init') continue;
    if (e.data.account?.subscriptionType || e.data.account?.apiKeySource) account = e.data.account.subscriptionType ?? e.data.account.apiKeySource;
    if (e.data.model) model = e.data.model;
  }
  const ctx = lastOf('context');
  const warn = [...events].reverse().find(e => e.type === 'status' && (e.data.type === 'rate_limit_event' || e.data.type === 'auth_status' || e.data.error));
  const err = s.state === 'error' ? lastOf('error') : null;
  return {
    state: s.state ?? null, stateText: stateText(s.state), model: model ?? '—', account: account ?? '—',
    cost: costText(s.cost_usd), context: contextPercent(ctx ?? s.context_pct),
    warning: err ? `오류: ${err.error}` : warn ? `${warn.data.type ?? '경고'}${warn.data.error ? `: ${warn.data.error}` : ''}` : null,
  };
}

// 세션 조작 단추 — admin 화면에만. 상태마다 누를 수 있는 것만 켠다
export function sessionButtons(state, role) {
  if (role !== 'admin') return [];
  const running = ['starting', 'idle', 'working', 'waiting_approval'].includes(state);
  const busy = state === 'working' || state === 'waiting_approval';
  return [
    { op: 'start', label: '켜기', enabled: state === 'stopped' || state === 'error' || state == null },
    { op: 'interrupt', label: '멈춤', enabled: busy },
    { op: 'compact', label: '압축', enabled: running && state !== 'starting' },
    { op: 'stop', label: '끄기', enabled: running || state === 'error' },
    { op: 'restart', label: '다시 켜기', enabled: running || state === 'error' },
  ];
}

// ── DOM ────────────────────────────────────────────────────
const el = (doc, tag, cls, text) => {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// 한 줄: 이름 · 상태 / 요약(제 줄 통째로 · 넘치면 줄임표). 요약을 누르면 서버가 준 입력 요약이 펼쳐진다 (meta M6 3.1)
function toolList(doc, rows, project) {
  const ul = el(doc, 'ul', 'tools');
  for (const r of rows) {
    const v = toolRowView(r, project);
    const li = el(doc, 'li', v.className);
    li.append(el(doc, 'span', 'tool-name', v.label), el(doc, 'span', 'tool-status', v.status));
    const more = el(doc, 'details', 'tool-more');
    const line = el(doc, 'summary', 'tool-input', v.summary || v.detail);
    line.title = v.detail;
    more.append(line, el(doc, 'pre', 'tool-raw', v.detail));
    li.append(more);
    if (v.result) li.append(el(doc, 'div', 'tool-result', v.result));
    ul.append(li);
  }
  return ul;
}

// handlers: { onSession(op), onStopTask(taskId) }
export function renderCockpit({ project, events, role }, doc, handlers = {}) {
  const box = el(doc, 'div', 'cockpit-body');
  const head = headerView(project, events);
  const dl = el(doc, 'dl', 'cockpit-head');
  for (const [k, v] of [['상태', head.stateText], ['모델', head.model], ['계정', head.account], ['값', head.cost], ['문맥', head.context]]) {
    const row = el(doc, 'div', `head-${k}`);
    row.append(el(doc, 'dt', null, k), el(doc, 'dd', k === '상태' ? `state state-${head.state}` : null, v));
    dl.append(row);
  }
  box.append(dl);
  if (head.warning) box.append(el(doc, 'p', 'cockpit-warn', head.warning));

  const buttons = sessionButtons(head.state, role);
  if (buttons.length) {
    const bar = el(doc, 'div', 'session-buttons');
    for (const b of buttons) {
      const button = el(doc, 'button', null, b.label);
      button.type = 'button';
      button.dataset.op = b.op;
      button.disabled = !b.enabled;
      button.addEventListener('click', () => handlers.onSession?.(b.op, button));
      bar.append(button);
    }
    box.append(bar);
  }

  const { main, helpers } = groupByParent(currentTurnTools(events));
  box.append(el(doc, 'h3', null, '이번 턴 도구 호출'));
  box.append(main.length ? toolList(doc, main, project?.name) : el(doc, 'p', 'empty', '이번 턴에 부른 도구가 없습니다'));
  for (const h of helpers) {
    const sec = el(doc, 'section', 'helper');
    sec.append(el(doc, 'h4', null, h.title), toolList(doc, h.rows, project?.name));
    box.append(sec);
  }

  const hooks = hookRows(events);
  if (hooks.length) {
    box.append(el(doc, 'h3', null, '훅'));
    const ul = el(doc, 'ul', 'hooks');
    for (const h of hooks) ul.append(el(doc, 'li', h.blocked ? 'hook hook-blocked' : 'hook', `${h.name}${h.event ? ` (${h.event})` : ''} · exit ${h.exitCode ?? '?'}`));
    box.append(ul);
  }

  const tasks = taskRows(events);
  box.append(el(doc, 'h3', null, '백그라운드 도우미'));
  if (!tasks.length) box.append(el(doc, 'p', 'empty', '돌고 있는 도우미가 없습니다'));
  else {
    const ul = el(doc, 'ul', 'tasks');
    for (const t of tasks) {
      const li = el(doc, 'li', 'task');
      li.append(el(doc, 'span', null, `${t.type ?? '도우미'} · ${t.description}${t.lastTool ? ` · ${t.lastTool}` : ''}`));
      if (role === 'admin') {
        const stop = el(doc, 'button', 'quiet', '멈춤');
        stop.type = 'button';
        stop.addEventListener('click', () => handlers.onStopTask?.(t.id, stop));
        li.append(stop);
      }
      ul.append(li);
    }
    box.append(ul);
  }
  return box;
}
