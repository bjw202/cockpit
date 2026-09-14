// minidiscord 화면과 cockpit 서버를 잇는 순수 함수 — DOM 없이 시험한다 (test/web-glue.test.js · ARCHITECTURE 7.3 · 7.4).
// 옮긴 app.js 는 jsdom 시험 없이 들어왔으므로(PRD N4), 잇는 판단은 여기 모아 둔다. 글자를 DOM 에 넣는 일은 부르는 쪽이 한다.

// 세션이 이 상태면 봇 칩이 🟢 (켜져 있다)
export const RUNNING_STATES = Object.freeze(['starting', 'idle', 'working', 'waiting_approval']);
export const HINT_DEFAULT = '메시지 보내기';
export const HINT_NO_BOT = '봇에게 가지 않습니다 — 부르려면 @';
const MENTION = /@(?:TO|CC)\([^()\s]+\)/;

// 방 번호 → 과제 (GET /api/projects 의 모양). 이관된 옛 files 방도 그 과제다 (ADR-015)
export function projectOfRoom(projects, roomId) {
  return (projects ?? []).find(p => p.rooms?.main?.id === roomId || p.rooms?.legacy_files?.id === roomId) ?? null;
}

// 방 봇 칩 · @ 자동완성의 재료 — minidiscord GET /api/rooms/:id/bots 와 같은 모양 [{ bot_id, bot_name, online }] (R13)
export function roomBotsOf(projects, roomId) {
  const project = projectOfRoom(projects, roomId);
  if (!project?.bot) return [];
  return [{ bot_id: project.bot.id, bot_name: project.bot.name, online: RUNNING_STATES.includes(project.session?.state) }];
}

// SSE message 사건 { project, message } → 지금 연 방의 글이면 그 글, 아니면 null
export function messageForRoom(data, roomId) {
  const m = data?.message ?? null;
  return m && roomId != null && m.room_id === roomId ? m : null;
}

// cockpit bot_status 의 status(thinking · tool · approval · starting · idle · off) → minidiscord 칩의 working · idle
export function botMark(status) {
  return ['thinking', 'tool', 'approval', 'starting'].includes(status) ? 'working' : 'idle';
}

// 작성기 기본값 — 그 방 봇의 실제 이름으로 @TO 를 채운다. 지우면 사람끼리의 글 (ADR-018)
export const composerDefault = bot => (bot?.name ? `@TO(${bot.name}) ` : '');

// 작성기 안내 글자(placeholder) — 봉투가 없으면 봇에게 가지 않는다고 알린다
export function composerHint(value) {
  return MENTION.test(String(value ?? '')) ? HINT_DEFAULT : HINT_NO_BOT;
}

// 방을 열 때 · 보낸 뒤 입력칸에 넣을 값. 사람이 친 글이 있거나 · 보관 방이거나 · 봇이 없으면 null(건드리지 않는다)
export function prefillValue({ value, bot, archived = false } = {}) {
  if (archived || String(value ?? '') !== '') return null;
  return composerDefault(bot) || null;
}

// 접이식 판의 기본 — 기억한 값('open' · 'closed')이 이긴다. 없으면 admin 펼침 · member 접힘 (ADR-019)
export function panelOpenByDefault(role, saved) {
  if (saved === 'open') return true;
  if (saved === 'closed') return false;
  return role === 'admin';
}

// 접힌 판 단추에 붙이는 걸린 승인 수
export const pendingBadge = count => (Number(count) > 0 ? `(${Number(count)})` : '');
