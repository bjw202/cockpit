// 승인 중계 — canUseTool 을 받아 적고, admin 에게 띄우고, 첫 답을 SDK 에 돌려준다 (ARCHITECTURE 6절 · ADR-009).
//
//   ① permission_requests 에 한 줄 (키 toolUseID · agentID)          ② 본방 system 글 🔒 요청 한 줄
//   ③ permission_request 사건 (브라우저 전부 — 단추는 admin 화면에만)   ④ 답 · 시간 초과 · signal(abort) 중 먼저 오는 것
//   ⑤ UPDATE … WHERE answered_at IS NULL — 바뀐 행이 1 이면 이 답이 이긴다. 0 이면 409
//   ⑥ SDK 에 돌려준다                                                   ⑦ 본방 system 글 ✅ · ⛔ 한 줄 (🔒 는 요청 줄에만)
//   ⑧ permission_resolved 사건. 걸린 요청이 0 이 되면 state working 은 세션 관리자가 한다
//
// 카드 글은 SDK 가 준 칸을 그대로 쓴다: title · displayName · description · decisionReason · blockedPath · suggestions ·
// suppressAlwaysAllowRule · defaultToNo (meta M2 지시 4절 2항). 새로고침 뒤 되그리려고 card_json 에 둔다.

import { EventEmitter } from 'node:events';
import { ChatError } from '../db/chat-db.js';

export const DECISIONS = Object.freeze(['allow', 'allow_session', 'deny']);
export const CARD_FIELDS = Object.freeze(['title', 'displayName', 'description', 'decisionReason', 'blockedPath', 'suggestions', 'suppressAlwaysAllowRule', 'defaultToNo']);
const INPUT_PREVIEW_CHARS = 500;

export function cardOf(options = {}) {
  const card = {};
  for (const k of CARD_FIELDS) if (options[k] !== undefined) card[k] = options[k];
  return card;
}

export function inputPreview(input) {
  const s = JSON.stringify(input ?? {});
  return s.length > INPUT_PREVIEW_CHARS ? `${s.slice(0, INPUT_PREVIEW_CHARS)}…` : s;
}

// 방에 남는 두 줄. weekly 의 🔒 수 = 요청 수라서 답 줄에는 🔒 를 쓰지 않는다 (meta D0 Q7)
export function lockLine({ tool, card = {}, agentId }) {
  return `🔒 ${tool} 요청 · ${card.title ?? card.displayName ?? tool}${agentId ? ` · 도우미 ${String(agentId).slice(0, 8)}` : ''}`;
}
export function answerLine({ behavior, by, tool, timeoutMin }) {
  switch (behavior) {
    case 'allow': return `✅ ${by} 허용 · ${tool}`;
    case 'allow_session': return `✅ ${by} 이번 세션 허용 · ${tool}`;
    case 'deny': return `⛔ ${by} 거부 · ${tool}`;
    case 'timeout': return `⛔ 시간 초과 거부 (${timeoutMin}분) · ${tool}`;
    default: return `⛔ 거둬 감 · ${tool}`;
  }
}

export function requestView(row) {
  return {
    tool_use_id: row.tool_use_id, project: row.project, tool: row.tool, agent_id: row.agent_id, asked_at: row.asked_at,
    card: JSON.parse(row.card_json), input: inputPreview(JSON.parse(row.input_json)),
    behavior: row.behavior, answered_by: row.answered_by, answered_at: row.answered_at,
  };
}

export class PermissionRelay extends EventEmitter {
  constructor({ chatDb, cockpitDb, config, setTimer = setTimeout, clearTimer = clearTimeout }) {
    super();
    Object.assign(this, { chatDb, cockpitDb, config, setTimer, clearTimer });
    this.pending = new Map();   // tool_use_id → { resolve, input, card, rooms, timer, signal, onAbort }
    this.handler = this.handler.bind(this);
  }

  get timeoutMin() { return this.config?.approvalTimeoutMin ?? 10; }

  // 세션 관리자의 permissionHandler 자리 — { project, toolName, input, options(SDK canUseTool 셋째 인자), rooms }
  async handler({ project, toolName, input, options = {}, rooms }) {
    const toolUseId = options.toolUseID;
    const agentId = options.agentID ?? null;
    const card = cardOf(options);
    this.cockpitDb.insertPermission({ toolUseId, agentId, project, tool: toolName, input, card });
    this.#system(project, rooms, lockLine({ tool: toolName, card, agentId }));
    this.emit('permission_request', requestView(this.cockpitDb.permission(toolUseId)));

    return new Promise(resolve => {
      const entry = { resolve, input, card, rooms, timer: null, signal: options.signal ?? null, onAbort: null };
      this.pending.set(toolUseId, entry);
      entry.timer = this.setTimer(() => this.#settle(toolUseId, { behavior: 'timeout' }), this.timeoutMin * 60_000);
      entry.timer?.unref?.();
      if (entry.signal) {
        entry.onAbort = () => this.#settle(toolUseId, { behavior: 'cancelled' });
        if (entry.signal.aborted) entry.onAbort();
        else entry.signal.addEventListener('abort', entry.onAbort, { once: true });
      }
    });
  }

  // admin 의 답. 돌려주는 것 { ok, tool_use_id, behavior } · 던지는 것 ChatError 403 · 400 · 404 · 409
  answer(toolUseId, { decision, reason, user }) {
    if (user?.role !== 'admin') throw new ChatError('FORBIDDEN', 'admin 만 답할 수 있습니다', 403);
    if (!DECISIONS.includes(decision)) throw new ChatError('BAD_DECISION', `decision 은 ${DECISIONS.join(' · ')} 중 하나다`, 400);
    const row = this.cockpitDb.permission(toolUseId);
    if (!row) throw new ChatError('NO_REQUEST', '승인 요청을 찾을 수 없습니다', 404);
    if (decision === 'allow_session' && JSON.parse(row.card_json).suppressAlwaysAllowRule) {
      throw new ChatError('NO_SESSION_ALLOW', '이 요청은 이번 세션 허용을 받지 않습니다', 400);
    }
    if (!this.#settle(toolUseId, { behavior: decision, by: user.username, reason })) throw new ChatError('ANSWERED', '이미 답이 있습니다', 409);
    return { ok: true, tool_use_id: toolUseId, behavior: decision };
  }

  // 서버가 다시 켜질 때: 앞 프로세스에서 답을 못 받은 요청은 SDK 쪽이 이미 사라졌다 — 거둬 감으로 닫는다
  cancelStale() {
    const stale = this.cockpitDb.pendingPermissions().filter(r => !this.pending.has(r.tool_use_id));
    for (const r of stale) this.#settle(r.tool_use_id, { behavior: 'cancelled' });
    return stale.length;
  }

  #settle(toolUseId, { behavior, by = null, reason }) {
    if (!this.cockpitDb.answerPermission(toolUseId, { behavior, answeredBy: by })) return false;
    const row = this.cockpitDb.permission(toolUseId);
    const entry = this.pending.get(toolUseId);
    this.pending.delete(toolUseId);
    if (entry) {
      this.clearTimer(entry.timer);
      entry.signal?.removeEventListener('abort', entry.onAbort);
      entry.resolve(this.#resultOf(behavior, { by, reason, input: entry.input, card: entry.card }));
    }
    this.#system(row.project, entry?.rooms, answerLine({ behavior, by, tool: row.tool, timeoutMin: this.timeoutMin }));
    this.emit('permission_resolved', { project: row.project, tool_use_id: toolUseId, behavior, answered_by: by, answered_at: row.answered_at });
    return true;
  }

  #resultOf(behavior, { by, reason, input, card }) {
    switch (behavior) {
      case 'allow': return { behavior: 'allow', updatedInput: input };
      // 이름대로 "이번 세션" 만 — SDK 가 localSettings 등을 주어도 session 으로 바꿔 넣는다. 봇 폴더에 영구 규칙을 남기지 않는다 (meta M2.M N7 · ADR-009)
      case 'allow_session': return { behavior: 'allow', updatedInput: input, updatedPermissions: (card.suggestions ?? []).map(s => ({ ...s, destination: 'session' })) };
      case 'deny': return { behavior: 'deny', message: reason ? `${by} 거부: ${reason}` : `${by} 거부` };
      case 'timeout': return { behavior: 'deny', message: `승인 시간 초과 (${this.timeoutMin}분)` };
      default: return { behavior: 'deny', message: '승인 요청을 거둬 갔다 (멈춤 · 끄기)' };
    }
  }

  #system(project, rooms, text) {
    const mainId = rooms?.main?.id ?? this.chatDb.projectRooms(project).main?.id;
    if (mainId == null) return;
    const message = this.chatDb.insertSystemMessage(mainId, text);
    this.emit('message', { project, message });
  }
}
