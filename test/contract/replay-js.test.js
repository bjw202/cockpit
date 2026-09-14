// 계약 시험 — 형제 저장소 prodev 의 진짜 scripts/replay.js 를 cockpit 서버에 붙인다 (ADR-005 · VERIFICATION 2.2).
//
// prodev test/server/replay.test.js 는 minidiscord 길 셋을 흉내 낸 가짜 서버에 replay.js 를 돌린다.
// 여기서는 그 가짜 서버 자리에 **cockpit 서버**를 세우고 같은 시나리오를 돌린다: 서버 쪽 계약이 걸린 것만 옮겼다
// (대본 검사 · sleep · manual 은 replay.js 혼자의 일이라 뺐다).
// 봇은 모의 SDK 다 — 큐에서 받은 <channel> 덩이를 보고 cockpit 의 reply 처리기를 부른다 (진짜 CLI 가 도구를 부르는 자리).
// 토큰은 bin/cockpit.js session-token 이 낸다. 형제가 없으면 건너뛴다 (건너뜀은 통과로 세지 않는다).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { httpWorld } from '../fakes/http-world.js';
import { createAccount } from '../../src/auth/sessions.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRODEV = process.env.COCKPIT_PRODEV_DIR || path.resolve(REPO, '..', 'prodev');
const REPLAY = path.join(PRODEV, 'scripts', 'replay.js');
const CLI = path.join(REPO, 'bin', 'cockpit.js');
const skip = fs.existsSync(REPLAY) ? false : `형제 prodev 없음 (${REPLAY})`;

// 사용자 메시지 하나에 담긴 <channel> 덩이들
const blocksOf = um => [...um.message.content[0].text.matchAll(/<channel [^>]*chat_id="(\d+)" message_id="(\d+)" delivery="(to|cc)"[^>]*>\n([\s\S]*?)\n<\/channel>/g)]
  .map(m => ({ chatId: m[1], messageId: Number(m[2]), delivery: m[3], content: m[4] }));

// answer(덩이) 가 글을 내면 그 방에 reply, null 이면 잠자코 있다
async function cockpit(t, answer) {
  const w = await httpWorld({
    turns: um => [
      ...blocksOf(um).filter(b => b.delivery === 'to').flatMap(b => {
        const text = answer(b);
        return text ? [{ callTool: 'reply', args: { chat_id: b.chatId, text } }] : [];
      }),
      { result: true },
    ],
  });
  t.after(() => w.close());
  await createAccount({ chatDb: w.chatDb, cockpitDb: w.cockpitDb, username: '김피엘', password: 'pl-password-1', role: 'admin' });
  await createAccount({ chatDb: w.chatDb, cockpitDb: w.cockpitDb, username: '김과제', password: 'member-pass-1' });
  const token = name => execFileSync(process.execPath, [CLI, 'session-token', name, '--config', w.configFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const tokens = { PL: token('김피엘'), member: token('김과제') };
  const opened = w.open('시험');
  await w.manager.start('시험');
  return { w, tokens, ...opened };
}

function replay(w, tokens, script, record, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [REPLAY, script, record, '--base', w.base],
      { encoding: 'utf8', env: { ...process.env, REPLAY_TOKEN_PL: tokens.PL, REPLAY_TOKEN_MEMBER: tokens.member, ...env } },
      (e, out, err) => (e ? reject(Object.assign(e, { out, err })) : resolve({ out, err })));
  });
}

function scriptFile(w, name, doc) {
  const file = path.join(w.dir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(doc));
  return { file, record: path.join(w.dir, `${name}.jsonl`) };
}
const lines = record => fs.readFileSync(record, 'utf8').trim().split('\n').map(l => JSON.parse(l));

test('걸음 셋짜리 대본: exit 0 · 기록 JSONL 에 bot.message_id 가 셋', { skip }, async t => {
  const { w, tokens, main, files } = await cockpit(t, b => `받았습니다 #${b.messageId}`);
  fs.mkdirSync(path.join(w.dir, 'data'));
  fs.writeFileSync(path.join(w.dir, 'data', 'yield.csv'), 'lot,yield\nA,91\n');
  const { file, record } = scriptFile(w, 'r3', {
    name: 'R-계약', project: '시험', actors: { PL: '김피엘', member: '김과제' }, bot: 'prodev-시험-bot',
    steps: [
      { id: 's1', room: '본방', author: 'PL', text: '안녕하세요', wait: 'bot', timeout_s: 20 },
      { id: 's2', room: 'files', author: 'member', text: '@TO(prodev-시험-bot) 자료입니다', attach: ['data/yield.csv'], wait: 'bot', timeout_s: 20 },
      { id: 's3', room: '본방', author: 'member', text: '@TO(prodev-시험-bot) 확인 부탁드립니다', wait: 'bot', timeout_s: 20 },
    ],
  });
  const { out } = await replay(w, tokens, file, record);   // exit 0 이 아니면 여기서 던진다
  assert.match(out, new RegExp(`방 본방=${main.id} · files=${files.id}`));

  const r = lines(record);
  const botIds = r.filter(x => x.bot?.message_id).map(x => x.bot.message_id);
  assert.equal(botIds.length, 3);
  assert.deepEqual(r.at(-1).summary, { steps: 3, timeouts: 0, bot_msgs: 3 });
  for (const x of r.filter(y => y.id)) {
    const botMsg = w.chatDb.messageById(x.bot.message_id);
    assert.equal(botMsg.author_type, 'bot');
    assert.equal(botMsg.room_id, x.room_id, `${x.id}: 봇이 받은 방에 답했다`);
    assert.equal(botMsg.body, `받았습니다 #${x.message_id}`);
  }
});

test('걸음 셋 — wait bot · expect then/else · 상한 1초 무응답 이 기록 JSONL 로 남는다', { skip }, async t => {
  const { w, tokens, main, files } = await cockpit(t, b => (b.content.includes('자료입니다') ? '읽었습니다. 맞으면 확정이라고 답해 주세요' : null));
  const { file, record } = scriptFile(w, 'r', {
    name: 'R-시험', project: '시험', actors: { PL: '김피엘', member: '김과제' }, bot: 'prodev-시험-bot',
    steps: [
      { id: 's1', room: 'files', author: 'member', text: '@TO(prodev-시험-bot) 자료입니다', wait: 'bot', timeout_s: 20,
        expect: '확정',
        then: [{ id: 's1a', room: 'files', author: 'member', text: '확정', wait: 'none' }],
        else: [{ id: 's1b', room: 'files', author: 'member', text: '여기는 안 와야 한다', wait: 'none' }] },
      { id: 's2', room: '본방', author: 'PL', text: '아무도 안 받는 글', wait: 'bot', timeout_s: 1 },
      { id: 's3', room: '본방', author: 'PL', text: '마지막', wait: 'none' },
    ],
  });
  await replay(w, tokens, file, record);

  const r = lines(record);
  const line = id => r.find(x => x.id === id);
  assert.deepEqual(r.filter(x => x.id).map(x => x.id), ['s1', 's1a', 's2', 's3'], 's1b 는 안 돈다');
  assert.deepEqual(r.at(-1).summary, { steps: 4, timeouts: 1, bot_msgs: 1 });
  assert.equal(line('s1').room_id, files.id);
  assert.ok(line('s1').message_id > 0);
  assert.match(line('s1').bot.text, /확정/);
  assert.equal(line('s1').bot.attachments, 0);
  assert.equal(line('s1').branch, 'then');
  assert.equal(line('s1').timeout, false);
  assert.ok(line('s1').t_sent && line('s1').bot.t);
  assert.equal(line('s2').timeout, true);
  assert.equal(line('s2').bot, null);
  assert.equal(line('s2').room_id, main.id);
  assert.equal(line('s3').timeout, false);
  assert.equal(line('s3').bot, null);
  // 사람 글은 계정 이름으로 남는다 — PL 토큰은 김피엘, member 토큰은 김과제
  assert.equal(w.chatDb.messageById(line('s2').message_id).author_name, '김피엘');
  assert.equal(w.chatDb.messageById(line('s1a').message_id).author_name, '김과제');
});

test('expect 가 안 걸리면 else 를 돈다', { skip }, async t => {
  const { w, tokens } = await cockpit(t, () => '아직 모르겠습니다. 하나만 여쭙습니다');
  const { file, record } = scriptFile(w, 'e', {
    name: 'else', project: '시험', steps: [
      { id: 's1', room: 'files', author: 'member', text: '@TO(prodev-시험-bot) 자료', wait: 'bot', timeout_s: 20,
        expect: '확정',
        then: [{ id: 't1', room: 'files', author: 'member', text: 'then', wait: 'none' }],
        else: [{ id: 'e1', room: 'files', author: 'member', text: 'else', wait: 'none' }] },
    ],
  });
  await replay(w, tokens, file, record);
  const r = lines(record);
  assert.deepEqual(r.filter(x => x.id).map(x => x.id), ['s1', 'e1']);
  assert.equal(r.find(x => x.id === 's1').branch, 'else');
});

test('첨부가 이름 그대로 올라간다', { skip }, async t => {
  const { w, tokens, files } = await cockpit(t, () => null);
  fs.mkdirSync(path.join(w.dir, 'data'));
  fs.writeFileSync(path.join(w.dir, 'data', 'yield.csv'), 'a,b\n1,2\n');
  const { file, record } = scriptFile(w, 'a', {
    name: '첨부', project: '시험', steps: [
      { id: 's1', room: 'files', author: 'member', text: '자료', attach: ['data/yield.csv'], wait: 'none' },
    ],
  });
  await replay(w, tokens, file, record);
  const [msg] = w.chatDb.messagesAfter(files.id, 0);
  assert.deepEqual(msg.attachments.map(a => a.filename), ['yield.csv'], '대본 기준 상대 경로가 풀리고 이름이 그대로다');
  assert.equal(msg.author_name, '김과제', 'member 토큰으로 올라간다');
  assert.equal(fs.readFileSync(w.chatDb.attachmentsOf(msg.id)[0].path, 'utf8'), 'a,b\n1,2\n');
});

test('방을 못 찾으면 죽는다 (exit 1) · 토큰이 안 먹으면 죽는다 (exit 1)', { skip }, async t => {
  const { w, tokens } = await cockpit(t, () => null);
  const missing = scriptFile(w, 'y', { name: 'y', project: '없는과제', steps: [{ id: 's1', room: '본방', author: 'PL', text: 'ㄱ', wait: 'none' }] });
  await assert.rejects(() => replay(w, tokens, missing.file, missing.record),
    e => { assert.equal(e.code, 1); assert.match(e.err, /방을 못 찾았다: prodev-없는과제/); return true; });

  const ok = scriptFile(w, 'z', { name: 'z', project: '시험', steps: [{ id: 's1', room: '본방', author: 'PL', text: 'ㄱ', wait: 'none' }] });
  await assert.rejects(() => replay(w, { ...tokens, PL: 'deadbeef' }, ok.file, ok.record),
    e => { assert.equal(e.code, 1); assert.match(e.err, /토큰이 안 먹는다 \(401\)/); return true; });
});
