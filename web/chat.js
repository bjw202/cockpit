// 채팅 판의 조각 — 글 → 보기 모양 · 입력칸 기본값 · [카드][발송] 표식 · 봇 상태 칩 (ARCHITECTURE 7절).
// 순수 함수는 DOM 없이 시험한다 (test/web-chat.test.js). DOM 을 만드는 함수는 doc 을 인자로 받고 textContent 로만 채운다.

import { renderMarkdown } from './markdown.js';

export const MARKERS = Object.freeze(['[카드]', '[발송]']);
// 세션 관리자가 본방에 남기는 압축 알림 두 줄 (src/session/manager.js 와 같은 문장)
export const COMPACT_TEXTS = Object.freeze(['문맥을 정리 중입니다. 곧 이어서 합니다.', '정리가 끝났습니다. 이어서 하려면 말을 걸어 주세요.']);

// 방 이름의 첫 '/' 가 갈래다 — 본방 prodev-<과제> · 파일방 prodev-<과제>/files
export const roomKind = room => (String(room?.name ?? '').includes('/') ? 'files' : 'main');

// 본방은 그 과제 봇의 실제 이름으로 @TO 를 채워 둔다. 지워도 간다(본방 봉투 없음 = to). 파일방은 비운다
export function defaultComposerText(project, kind) {
  return kind === 'main' && project?.bot?.name ? `@TO(${project.bot.name}) ` : '';
}

// 첫 줄이 [카드] · [발송] 으로 시작하면 그 줄을 강조한다. 앞의 봉투(@TO(…) · @CC(…))는 건너뛰고 본다
export function splitMarker(body) {
  const text = String(body ?? '');
  const nl = text.indexOf('\n');
  const firstLine = nl < 0 ? text : text.slice(0, nl);
  const rest = nl < 0 ? '' : text.slice(nl + 1);
  const head = firstLine.replace(/^\s*(?:@(?:TO|CC)\([^()\s]+\)\s*)*/, '');
  return { marker: MARKERS.find(m => head.startsWith(m)) ?? null, firstLine, rest };
}

// chat.db 의 created_at 은 'YYYY-MM-DD HH:MM:SS' (UTC). 화면은 이 PC 의 시각으로 'MM-DD HH:MM'
export function shortTime(createdAt) {
  const s = String(createdAt ?? '');
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return s;
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function messageView(msg, { me } = {}) {
  const kind = msg.author_type;
  const body = String(msg.body ?? '');
  const system = kind === 'system';
  const lock = system && body.startsWith('🔒');
  const answer = !system ? null : body.startsWith('✅') ? 'allow' : body.startsWith('⛔') ? 'deny' : null;
  const compact = !system ? null : body === COMPACT_TEXTS[0] ? 'start' : body === COMPACT_TEXTS[1] ? 'end' : null;
  const { marker, firstLine, rest } = system ? { marker: null, firstLine: body, rest: '' } : splitMarker(body);
  return {
    id: msg.id, roomId: msg.room_id, kind, body,
    author: msg.author_name ?? '', time: shortTime(msg.created_at),
    mine: kind === 'user' && me != null && msg.author_user_id === me.id,
    marker, firstLine, rest, lock, answer, compact,
    attachments: (msg.attachments ?? []).map(a => ({ id: a.id, filename: a.filename, href: `/api/attachments/${a.id}` })),
    className: ['msg', `msg-${kind}`, lock && 'msg-lock', answer && `msg-answer-${answer}`, compact && 'msg-compact', marker && 'msg-marked']
      .filter(Boolean).join(' '),
  };
}

// 봇 상태 칩 — 서버의 bot_status 사건 status 값 → 글자. idle 은 칩이 없다
export const STATUS_CHIPS = Object.freeze({
  thinking: Object.freeze({ text: '생각 중', tone: 'busy' }),
  tool: Object.freeze({ text: '도구 실행 중', tone: 'busy' }),
  approval: Object.freeze({ text: '승인 대기', tone: 'wait' }),
  off: Object.freeze({ text: '꺼짐', tone: 'off' }),
  starting: Object.freeze({ text: '켜는 중', tone: 'busy' }),
});

export function statusChip(status, tool) {
  const chip = STATUS_CHIPS[status];
  if (!chip) return null;
  return { status, text: chip.text, tone: chip.tone, title: status === 'tool' && tool ? `${chip.text} · ${tool}` : chip.text };
}

// agent_sessions.state → bot_status (서버 src/http/sse.js 의 botStatusOfState 와 같다)
export const statusOfState = state => ({ working: 'thinking', waiting_approval: 'approval', stopped: 'off', error: 'off', idle: 'idle', starting: 'starting' })[state] ?? 'off';

// ── DOM ────────────────────────────────────────────────────
function markdownOrText(src, doc) {
  try { return renderMarkdown(src, doc); } catch {
    const p = doc.createElement('p');
    p.textContent = src;
    return p;
  }
}

export function renderMessage(view, doc = document) {
  const li = doc.createElement('li');
  li.className = view.className + (view.mine ? ' msg-mine' : '');
  li.dataset.id = String(view.id);

  const head = doc.createElement('div');
  head.className = 'msg-head';
  const who = doc.createElement('span');
  who.className = 'msg-author';
  who.textContent = view.author;
  const when = doc.createElement('time');
  when.className = 'msg-time';
  when.textContent = view.time;
  head.append(who, when);

  const body = doc.createElement('div');
  body.className = 'msg-body';
  if (view.kind === 'system') {
    body.textContent = view.body;
  } else if (view.marker) {
    const line = doc.createElement('div');
    line.className = 'msg-marker-line';
    line.textContent = view.firstLine;
    body.append(line);
    if (view.rest) body.append(markdownOrText(view.rest, doc));
  } else {
    body.append(markdownOrText(view.body, doc));
  }
  li.append(head, body);

  if (view.attachments.length) {
    const files = doc.createElement('ul');
    files.className = 'msg-files';
    for (const a of view.attachments) {
      const item = doc.createElement('li');
      const link = doc.createElement('a');
      link.href = a.href;
      link.textContent = a.filename;
      link.setAttribute('download', a.filename);
      item.append(link);
      files.append(item);
    }
    li.append(files);
  }
  return li;
}
