// 승인 카드 — 글자만 (ARCHITECTURE 6절 · PRD F11 · ADR-009).
// 카드 글은 SDK 가 준 칸을 그대로 쓴다: title(없으면 displayName) · description · decisionReason · blockedPath.
// suppressAlwaysAllowRule 이면 "이번 세션 허용" 단추가 없다. defaultToNo 면 초점이 거부 — 거부 단추를 맨 앞에 두어
// 카드에 들어온 첫 Tab · Enter 가 거부가 된다. 단추는 admin 화면에만 있다. 답이 오면(permission_resolved) 카드를 거둔다.
// 순수 함수는 DOM 없이 시험한다 (test/web-card.test.js).

const LABELS = Object.freeze({ allow: '허용', allow_session: '이번 세션 허용', deny: '거부' });

export function cardView(request, { role } = {}) {
  const card = request.card ?? {};
  const admin = role === 'admin';
  let buttons = [];
  if (admin) {
    const decisions = card.defaultToNo ? ['deny', 'allow', 'allow_session'] : ['allow', 'allow_session', 'deny'];
    buttons = decisions.filter(d => !(d === 'allow_session' && card.suppressAlwaysAllowRule)).map(decision => ({ decision, label: LABELS[decision] }));
  }
  return {
    id: request.tool_use_id,
    project: request.project,
    tool: request.tool,
    heading: card.title ?? card.displayName ?? request.tool,
    subheading: card.title && card.displayName ? card.displayName : null,
    description: card.description ?? null,
    reason: card.decisionReason ?? null,
    blockedPath: card.blockedPath ?? null,
    input: request.input ?? '',
    agent: request.agent_id ? String(request.agent_id).slice(0, 8) : null,
    askedAt: request.asked_at ?? null,
    buttons,
    focus: admin ? buttons[0]?.decision ?? null : null,
    note: admin ? null : 'admin 이 답합니다',
  };
}

// 카드 목록에 사건 하나를 먹인다 — 새 배열을 돌려준다
export function applyPermissionEvent(cards, type, data) {
  if (type === 'permission_request') return cards.some(c => c.tool_use_id === data.tool_use_id) ? cards : [...cards, data];
  if (type === 'permission_resolved') return cards.filter(c => c.tool_use_id !== data.tool_use_id);
  return cards;
}

// ── DOM ────────────────────────────────────────────────────
export function renderCard(view, doc, onAnswer) {
  const box = doc.createElement('article');
  box.className = 'card';
  box.dataset.id = view.id;
  const line = (cls, text, tag = 'div') => {
    if (text == null || text === '') return;
    const el = doc.createElement(tag);
    el.className = cls;
    el.textContent = text;
    box.append(el);
  };
  line('card-meta', [view.project, view.tool, view.agent && `도우미 ${view.agent}`].filter(Boolean).join(' · '));
  line('card-head', view.heading);
  line('card-meta', view.subheading);
  line('card-desc', view.description);
  line('card-meta', view.reason && `까닭: ${view.reason}`);
  line('card-meta', view.blockedPath && `경로: ${view.blockedPath}`);
  line('card-input', view.input, 'pre');
  if (view.buttons.length) {
    const row = doc.createElement('div');
    row.className = 'card-buttons';
    for (const b of view.buttons) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.dataset.decision = b.decision;
      button.textContent = b.label;
      if (b.decision === view.focus) button.dataset.default = 'true';
      button.addEventListener('click', () => onAnswer(view, b.decision, box));
      row.append(button);
    }
    box.append(row);
  }
  line('card-note', view.note, 'p');
  const error = doc.createElement('p');   // 답이 거절되면(409 · 400) 여기에 까닭
  error.className = 'card-note error';
  error.setAttribute('role', 'alert');
  box.append(error);
  return box;
}
