// 화면 잇기 순수 함수 (TASKS M5.6 · M5.7 · ARCHITECTURE 7.3 · 7.4). DOM 없이 돈다.
// 옛 시험 web-chat · web-tabs 의 자리를 이 파일이 대신한다 (짝은 as-built).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  botMark, composerHint, HINT_DEFAULT, HINT_NO_BOT, messageForRoom, projectOfRoom, roomBotsOf, toolLabel, toolSummary,
} from '../web/glue.js';
import { currentTurnTools, toolRowView } from '../web/cockpit.js';

// ── (M6 N17) 도구 호출 한 줄 요약 (meta M6 3.1) — 입력은 tool_use 사건의 input(JSON 글자, 200자 넘으면 잘리고 …) ──
test('toolSummary Bash: 첫 낱말 + 마지막 경로는 끝 세 마디 (grep … design/v2/ARCHITECTURE.md)', () => {
  assert.equal(toolSummary('Bash', JSON.stringify({ command: 'grep -rn "ARCHITECTURE" /Users/pl/work/prodev/design/v2/ARCHITECTURE.md' })), 'grep … design/v2/ARCHITECTURE.md');
  assert.equal(toolSummary('Bash', JSON.stringify({ command: 'cat C:\\work\\projects\\수율\\charter.md' })), 'cat projects/수율/charter.md');
  assert.equal(toolSummary('Bash', JSON.stringify({ command: 'npm test' })), 'npm test', '경로가 없으면 명령 그대로');
  const long = `{"command":"find /a/b/c/d -name '*.md' ${'x'.repeat(200)}`.slice(0, 200) + '…';
  assert.equal(toolSummary('Bash', long).startsWith('find … b/c/d'), true, `잘린 JSON 도: ${toolSummary('Bash', long)}`);
});

test('toolSummary Read · Write · Edit: 과제 폴더 기준 상대 경로', () => {
  assert.equal(toolSummary('Read', '{"file_path":"/w/projects/수율/cards/E-0001.md"}', '수율'), 'cards/E-0001.md');
  assert.equal(toolSummary('Write', '{"file_path":"C:\\\\w\\\\projects\\\\수율\\\\wiki\\\\공정.md","content":"…"}', '수율'), 'wiki/공정.md');
  assert.equal(toolSummary('Edit', '{"file_path":"/w/prodev/bots/prodev-수율-bot/journal.md","old_string":"a"}', '수율'), 'prodev-수율-bot/journal.md', '과제 폴더 밖이면 끝 두 마디');
});

test('toolSummary reply: 방 N · 텍스트 앞 40자 — 잘린 JSON 도', () => {
  assert.equal(toolSummary('mcp__cockpit__reply', JSON.stringify({ chat_id: '1', text: '파일 첫 줄은\nlot,yield 입니다' })), '방 1 · 파일 첫 줄은 lot,yield 입니다');
  const cutInput = `{"chat_id":"7","text":"${'가'.repeat(300)}`.slice(0, 200) + '…';
  assert.equal(toolSummary('mcp__cockpit__reply', cutInput), `방 7 · ${'가'.repeat(40)}…`);
  assert.equal(toolSummary('mcp__cockpit__reply', '{"text":"안녕"}'), '마지막 방 · 안녕', 'chat_id 가 없으면 마지막 to 방');
});

test('toolSummary fetch_history: 방 N · #since_id 뒤 limit건', () => {
  assert.equal(toolSummary('mcp__cockpit__fetch_history', '{"chat_id":"1","since_id":115,"limit":30}'), '방 1 · #115 뒤 30건');
  assert.equal(toolSummary('mcp__cockpit__fetch_history', '{"chat_id":"1"}'), '방 1');
});

test('toolSummary Agent: description 앞 40자', () => {
  const description = '카드 없는 첨부를 찾아 journal 절에 옮기고 R14 계측이 읽을 수 있게 정리하기';
  assert.equal(toolSummary('Agent', JSON.stringify({ description, prompt: '…', subagent_type: 'general-purpose' })), `${description.slice(0, 40)}…`);
  assert.equal(toolSummary('Task', '{"description":"리서치"}'), '리서치');
});

test('toolSummary WebFetch: 호스트', () => {
  assert.equal(toolSummary('WebFetch', '{"url":"https://docs.example.com/a/b?x=1","prompt":"요약"}'), 'docs.example.com');
});

test('toolSummary 그 밖: 키 이름 나열 · toolLabel 은 mcp__cockpit__ 접두를 뗀다 · toolRowView 가 둘을 싣는다', () => {
  assert.equal(toolSummary('Glob', '{"pattern":"**/*.md","path":"/w"}'), 'pattern · path');
  assert.equal(toolSummary('TodoWrite', `{"todos":[{"content":"${'x'.repeat(250)}`.slice(0, 200) + '…'), 'todos · content', '잘린 JSON 은 보이는 키만');
  assert.deepEqual([toolLabel('mcp__cockpit__reply'), toolLabel('mcp__cockpit__fetch_history'), toolLabel('Bash'), toolLabel('mcp__other__x')], ['reply', 'fetch_history', 'Bash', 'mcp__other__x']);
  const [row] = currentTurnTools([{ id: 1, at: '', type: 'tool_use', data: { id: 'u1', name: 'mcp__cockpit__fetch_history', input: '{"chat_id":"1","since_id":115,"limit":30}' } }]);
  const v = toolRowView(row);
  assert.deepEqual([v.label, v.summary, v.detail], ['fetch_history', '방 1 · #115 뒤 30건', '{"chat_id":"1","since_id":115,"limit":30}']);
});
import { permissionRequestId } from '../web/rich.js';

const projects = [
  { name: '수율', bot: { id: 3, name: 'prodev-수율-bot' }, rooms: { main: { id: 11, name: 'prodev-수율' }, legacy_files: { id: 12, name: 'prodev-수율/files' } }, session: { state: 'idle' } },
  { name: '샤워', bot: { id: 4, name: 'prodev-샤워-bot' }, rooms: { main: { id: 21, name: 'prodev-샤워' }, legacy_files: null }, session: { state: 'stopped' } },
];

test('roomBotsOf: 방의 봇 하나를 [{bot_id, bot_name, online}] 로', () => {
  assert.deepEqual(roomBotsOf(projects, 11), [{ bot_id: 3, bot_name: 'prodev-수율-bot', online: true }]);
  assert.deepEqual(roomBotsOf(projects, 12), [{ bot_id: 3, bot_name: 'prodev-수율-bot', online: true }], '옛 files 방도 그 과제의 봇');
  assert.deepEqual(roomBotsOf(projects, 99), []);
  assert.deepEqual(roomBotsOf(undefined, 11), []);
  assert.equal(projectOfRoom(projects, 21).name, '샤워');
});

test('online 은 idle · working · waiting_approval · starting 이면 참', () => {
  const at = state => roomBotsOf([{ ...projects[0], session: { state } }], 11)[0].online;
  for (const s of ['idle', 'working', 'waiting_approval', 'starting']) assert.equal(at(s), true, s);
  for (const s of ['stopped', 'error', undefined]) assert.equal(at(s), false, String(s));
});

test('messageForRoom: 다른 방 글은 null', () => {
  const m = { id: 7, room_id: 11, body: '안녕' };
  assert.equal(messageForRoom({ project: '수율', message: m }, 11), m);
  assert.equal(messageForRoom({ project: '수율', message: m }, 21), null);
  assert.equal(messageForRoom({ project: '수율', message: m }, null), null, '방을 안 열었으면 그리지 않는다');
  assert.equal(messageForRoom({ project: '수율' }, 11), null);
});

test('botMark: thinking · tool · approval → working, idle · stopped · error → idle', () => {
  for (const s of ['thinking', 'tool', 'approval', 'starting']) assert.equal(botMark(s), 'working', s);
  for (const s of ['idle', 'stopped', 'error', 'off', undefined]) assert.equal(botMark(s), 'idle', String(s));
});

test('composerHint: 봉투가 없으면 "봇에게 가지 않습니다 — 부르려면 @"', () => {
  assert.equal(HINT_NO_BOT, '봇에게 가지 않습니다 — 부르려면 @');
  assert.equal(composerHint(''), HINT_NO_BOT);
  assert.equal(composerHint('그냥 사람끼리'), HINT_NO_BOT);
  assert.equal(composerHint('@TO(prodev-수율-bot) 봐 주세요'), HINT_DEFAULT);
  assert.equal(composerHint('참고 @CC(prodev-수율-bot)'), HINT_DEFAULT);
  assert.equal(composerHint('@TO(이름 공백)'), HINT_NO_BOT, '서버 봉투 정규식에 안 맞는 이름은 봉투가 아니다');
});

test('rich.js 는 cockpit 🔒 요청 줄에 승인 단추를 그리지 않는다', () => {
  // cockpit 의 🔒 줄 꼴 (src/permissions/relay.js) — minidiscord 브로커의 `승인하려면 "yes <id>"…` 줄이 아니다 (ADR-019 결과)
  for (const body of ['🔒 Bash 요청 · Claude wants to run curl --version · 도우미 agent-01', '🔒 Bash 요청 · Run command', '✅ 김피엘 허용 · Bash']) {
    assert.equal(permissionRequestId(body), null, body);
  }
  assert.equal(permissionRequestId('승인하려면 "yes abcde", 거절하려면 "no abcde" 라고 답해주세요.'), 'abcde', '검사가 원래 꼴은 잡는다');
});

// ── (M5.7) 접이식 조종석 판 (ADR-019) ──────────────────────────
test('panelOpenByDefault: member 는 접힘 · admin 은 펼침 · 기억한 값이 이긴다', async () => {
  const { panelOpenByDefault } = await import('../web/glue.js');
  assert.equal(panelOpenByDefault('member', null), false);
  assert.equal(panelOpenByDefault('admin', null), true);
  assert.equal(panelOpenByDefault(undefined, null), false, '역할을 모르면 접는다');
  assert.equal(panelOpenByDefault('member', 'open'), true);
  assert.equal(panelOpenByDefault('admin', 'closed'), false);
  assert.equal(panelOpenByDefault('admin', '엉뚱한 값'), true, '모르는 기억은 무시한다');
});

test('pendingBadge: 0 이면 빈 글자 · N 이면 (N)', async () => {
  const { pendingBadge } = await import('../web/glue.js');
  assert.equal(pendingBadge(0), '');
  assert.equal(pendingBadge(undefined), '');
  assert.equal(pendingBadge(2), '(2)');
});
