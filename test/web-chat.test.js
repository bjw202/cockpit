// 채팅 판의 순수 함수 — DOM 없이 (VERIFICATION 6절: 화면 시험은 순수 함수와 정적 검사뿐이다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultComposerText, messageView, roomKind, splitMarker, statusChip, statusOfState, STATUS_CHIPS, shortTime } from '../web/chat.js';

const project = {
  name: 'worktogether', bot: { id: 1, name: 'prodev-worktogether-비서' },
  rooms: { main: { id: 11, name: 'prodev-worktogether' }, files: { id: 12, name: 'prodev-worktogether/files' } },
};
const msg = over => ({ id: 1, room_id: 11, author_type: 'user', author_user_id: 2, author_bot_id: null, body: '', created_at: '2026-09-14 07:35:08', author_name: '김과제', attachments: [], ...over });

test('본방 입력칸 기본값은 @TO(<그 과제 봇의 실제 이름>) ', () => {
  assert.equal(roomKind(project.rooms.main), 'main');
  assert.equal(roomKind(project.rooms.files), 'files');
  assert.equal(defaultComposerText(project, 'main'), '@TO(prodev-worktogether-비서) ', '기본 이름(prodev-<과제>-bot)이 아니라 그 과제 봇의 이름');
  assert.equal(defaultComposerText({ ...project, bot: { id: 2, name: 'prodev-수율-bot' } }, 'main'), '@TO(prodev-수율-bot) ');
  assert.equal(defaultComposerText(project, 'files'), '', '파일방은 비운다 (봉투 없는 파일방 글은 봇에게 안 간다)');
  assert.equal(defaultComposerText(null, 'main'), '');
});

test('[카드] 첫 줄 강조', () => {
  assert.deepEqual(splitMarker('[카드] 샤워헤드 교체 후 수율\n- 91%\n- 로트 A'), { marker: '[카드]', firstLine: '[카드] 샤워헤드 교체 후 수율', rest: '- 91%\n- 로트 A' });
  assert.equal(splitMarker('[발송] 주간 보고').marker, '[발송]');
  assert.equal(splitMarker('@TO(prodev-worktogether-비서) [카드] 확정').marker, '[카드]', '앞의 봉투는 건너뛴다');
  assert.equal(splitMarker('수율 [카드] 는 가운데').marker, null);
  assert.equal(splitMarker('첫 줄\n[카드] 둘째 줄').marker, null, '첫 줄만 본다');

  const v = messageView(msg({ author_type: 'bot', author_user_id: null, author_bot_id: 1, author_name: 'prodev-worktogether-비서', body: '[카드] 샤워헤드\n본문' }));
  assert.equal(v.marker, '[카드]');
  assert.equal(v.firstLine, '[카드] 샤워헤드');
  assert.equal(v.rest, '본문');
  assert.equal(v.className, 'msg msg-bot msg-marked');
  assert.equal(messageView(msg({ body: '그냥 글' })).className, 'msg msg-user');
});

test('system 🔒 글 모양', () => {
  const lock = messageView(msg({ author_type: 'system', author_user_id: null, author_name: '시스템', body: '🔒 Bash 요청 · Run command · 도우미 agent-01' }));
  assert.equal(lock.kind, 'system');
  assert.equal(lock.lock, true);
  assert.equal(lock.answer, null);
  assert.equal(lock.marker, null);
  assert.equal(lock.author, '시스템');
  assert.equal(lock.className, 'msg msg-system msg-lock');

  const allow = messageView(msg({ author_type: 'system', author_name: '시스템', body: '✅ 김피엘 이번 세션 허용 · Bash' }));
  assert.deepEqual([allow.lock, allow.answer, allow.className], [false, 'allow', 'msg msg-system msg-answer-allow']);
  const deny = messageView(msg({ author_type: 'system', author_name: '시스템', body: '⛔ 시간 초과 거부 (10분) · Bash' }));
  assert.deepEqual([deny.lock, deny.answer], [false, 'deny']);
  const compact = messageView(msg({ author_type: 'system', author_name: '시스템', body: '정리가 끝났습니다. 이어서 하려면 말을 걸어 주세요.' }));
  assert.deepEqual([compact.compact, compact.className], ['end', 'msg msg-system msg-compact']);
  assert.equal(messageView(msg({ body: '🔒 사람이 쓴 자물쇠' })).lock, false, '사람 글은 🔒 로 시작해도 요청 줄이 아니다');
});

test('상태 칩 넷(생각 중 · 도구 실행 중 · 승인 대기 · 꺼짐)', () => {
  assert.deepEqual(['thinking', 'tool', 'approval', 'off'].map(s => statusChip(s).text), ['생각 중', '도구 실행 중', '승인 대기', '꺼짐']);
  assert.equal(statusChip('tool', 'Bash').title, '도구 실행 중 · Bash');
  assert.equal(statusChip('idle'), null, 'idle 은 칩이 없다');
  assert.equal(statusChip('모름'), null);
  assert.deepEqual(Object.keys(STATUS_CHIPS).sort(), ['approval', 'off', 'starting', 'thinking', 'tool']);
  assert.deepEqual(['working', 'waiting_approval', 'stopped', 'error', 'idle', 'starting'].map(statusOfState), ['thinking', 'approval', 'off', 'off', 'idle', 'starting']);
});

test('글 보기 — 첨부 받기 주소 · 내 글 · 시각', () => {
  const v = messageView(msg({ attachments: [{ id: 7, filename: '성적서 9월.csv' }] }), { me: { id: 2 } });
  assert.deepEqual(v.attachments, [{ id: 7, filename: '성적서 9월.csv', href: '/api/attachments/7' }]);
  assert.equal(v.mine, true);
  assert.equal(messageView(msg({}), { me: { id: 3 } }).mine, false);
  assert.match(shortTime('2026-09-14 07:35:08'), /^\d\d-\d\d \d\d:\d\d$/);
  assert.equal(shortTime('어그러짐'), '어그러짐');
});
