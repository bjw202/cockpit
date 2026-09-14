// 화면 잇기 순수 함수 (TASKS M5.6 · M5.7 · ARCHITECTURE 7.3 · 7.4). DOM 없이 돈다.
// 옛 시험 web-chat · web-tabs 의 자리를 이 파일이 대신한다 (짝은 as-built).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  botMark, composerDefault, composerHint, HINT_DEFAULT, HINT_NO_BOT, messageForRoom, prefillValue, projectOfRoom, roomBotsOf,
} from '../web/glue.js';
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

test('composerDefault 는 @TO(<봇 이름>) ', () => {
  assert.equal(composerDefault({ id: 3, name: 'prodev-worktogether-비서' }), '@TO(prodev-worktogether-비서) ');
  assert.equal(composerDefault(null), '');
});

test('composerHint: 봉투가 없으면 "봇에게 가지 않습니다 — 부르려면 @"', () => {
  assert.equal(HINT_NO_BOT, '봇에게 가지 않습니다 — 부르려면 @');
  assert.equal(composerHint(''), HINT_NO_BOT);
  assert.equal(composerHint('그냥 사람끼리'), HINT_NO_BOT);
  assert.equal(composerHint('@TO(prodev-수율-bot) 봐 주세요'), HINT_DEFAULT);
  assert.equal(composerHint('참고 @CC(prodev-수율-bot)'), HINT_DEFAULT);
  assert.equal(composerHint('@TO(이름 공백)'), HINT_NO_BOT, '서버 봉투 정규식에 안 맞는 이름은 봉투가 아니다');
});

test('보관 방은 미리 채우지 않는다', () => {
  const bot = projects[0].bot;
  assert.equal(prefillValue({ value: '', bot, archived: true }), null);
  assert.equal(prefillValue({ value: '', bot }), '@TO(prodev-수율-bot) ');
  assert.equal(prefillValue({ value: '치던 글', bot }), null, '사람이 친 글은 건드리지 않는다');
  assert.equal(prefillValue({ value: '', bot: null }), null);
});

test('rich.js 는 cockpit 🔒 요청 줄에 승인 단추를 그리지 않는다', () => {
  // cockpit 의 🔒 줄 꼴 (src/permissions/relay.js) — minidiscord 브로커의 `승인하려면 "yes <id>"…` 줄이 아니다 (ADR-019 결과)
  for (const body of ['🔒 Bash 요청 · Claude wants to run curl --version · 도우미 agent-01', '🔒 Bash 요청 · Run command', '✅ 김피엘 허용 · Bash']) {
    assert.equal(permissionRequestId(body), null, body);
  }
  assert.equal(permissionRequestId('승인하려면 "yes abcde", 거절하려면 "no abcde" 라고 답해주세요.'), 'abcde', '검사가 원래 꼴은 잡는다');
});
