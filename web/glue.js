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

// 작성기 안내 글자(placeholder) — 봉투가 없으면 봇에게 가지 않는다고 알린다. 입력칸은 미리 채우지 않는다 (ADR-018 되돌림)
export function composerHint(value) {
  return MENTION.test(String(value ?? '')) ? HINT_DEFAULT : HINT_NO_BOT;
}

// 접이식 판의 기본 — 기억한 값('open' · 'closed')이 이긴다. 없으면 admin 펼침 · member 접힘 (ADR-019)
export function panelOpenByDefault(role, saved) {
  if (saved === 'open') return true;
  if (saved === 'closed') return false;
  return role === 'admin';
}

// 접힌 판 단추에 붙이는 걸린 승인 수
export const pendingBadge = count => (Number(count) > 0 ? `(${Number(count)})` : '');

// ── (M6 N17) 조종석 판 "이번 턴 도구 호출" 의 한 줄 — JSON 대신 도구별 사람 말 (meta M6 3.1) ──
const COCKPIT_TOOL_PREFIX = 'mcp__cockpit__';
export const toolLabel = name => {
  const s = String(name ?? '');
  return s.startsWith(COCKPIT_TOOL_PREFIX) ? s.slice(COCKPIT_TOOL_PREFIX.length) : s;
};

const cut = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const tailPath = (p, n) => String(p).split(/[\\/]+/).filter(Boolean).slice(-n).join('/');

// 서버가 준 입력은 JSON 글자이고 200자를 넘으면 잘려 `…` 가 붙는다 — 잘려서 JSON.parse 가 안 되면 앞부분에서 칸을 찾는다
function parsed(input) {
  if (input && typeof input === 'object') return input;
  try { const o = JSON.parse(String(input ?? '')); return o && typeof o === 'object' ? o : null; } catch { return null; }
}
function inputField(input, key) {
  const o = parsed(input);
  if (o) return o[key];
  const m = new RegExp(`"${key}"\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"?|(-?\\d+(?:\\.\\d+)?))`).exec(String(input ?? ''));
  if (!m) return undefined;
  if (m[2] != null) return Number(m[2]);
  try { return JSON.parse(`"${m[1].replace(/\\+$/, '')}"`); } catch { return m[1]; }
}
function inputKeys(input) {
  const o = parsed(input);
  if (o) return Object.keys(o);
  return [...new Set([...String(input ?? '').matchAll(/"([^"\\]+)"\s*:/g)].map(m => m[1]))];
}

// 과제 폴더(<projectsDir>/<과제>/) 안이면 그 뒤 경로, 아니면 끝 두 마디
function projectPath(p, project) {
  const s = String(p ?? '').replaceAll('\\', '/');
  if (project) {
    const i = s.lastIndexOf(`/${project}/`);
    if (i >= 0) return s.slice(i + project.length + 2);
  }
  return /^(?:\/|[A-Za-z]:\/)/.test(s) ? tailPath(s, 2) : s;
}

// Bash — 첫 낱말 + 마지막 경로는 끝 세 마디(폴더 둘 · 파일). 경로가 없으면 명령 앞 60자
function bashSummary(command) {
  const words = String(command ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const last = words.slice(1).filter(w => /[\\/]/.test(w)).at(-1);
  if (!last) return cut(words.join(' '), 60);
  const p = tailPath(last.replace(/^["']|["';]+$/g, ''), 3);
  return words.length > 2 ? `${words[0]} … ${p}` : `${words[0]} ${p}`;
}

// name: SDK 도구 이름 · input: tool_use 사건의 input(JSON 글자, 잘릴 수 있다) · project: 과제 이름(상대 경로용)
export function toolSummary(name, input, project = null) {
  const f = key => inputField(input, key);
  switch (toolLabel(name)) {
    case 'Bash': return bashSummary(f('command'));
    case 'Read': case 'Write': case 'Edit': case 'NotebookEdit': return projectPath(f('file_path') ?? f('notebook_path') ?? '', project);
    case 'reply': {
      const room = f('chat_id') == null ? '마지막 방' : `방 ${f('chat_id')}`;
      return `${room} · ${cut(f('text'), 40)}`;
    }
    case 'fetch_history': {
      const room = f('chat_id') == null ? '마지막 방' : `방 ${f('chat_id')}`;
      const since = f('since_id') == null ? '' : `#${f('since_id')} 뒤`;
      const limit = f('limit') == null ? '' : `${f('limit')}건`;
      const range = [since, limit].filter(Boolean).join(' ');
      return range ? `${room} · ${range}` : room;
    }
    case 'Agent': case 'Task': return cut(f('description'), 40);
    case 'WebFetch': {
      const url = String(f('url') ?? '');
      try { return new URL(url).host; } catch { return cut(url, 40); }
    }
    default: return inputKeys(input).join(' · ');
  }
}
