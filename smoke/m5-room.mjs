// 스모크 m5-room — (v2) 방 만들기 = 봇 생성 · 사람끼리 글 · 따라잡기 · 보관 (TASKS M5.9 · VERIFICATION 3절 · ADR-017 · 018 · 020).
//   node smoke/m5-room.mjs <스크래치 폴더> [모델] [--fail-setup]
//
// 스크래치는 prodev 를 **복사**한 자리다 (smoke/scratch.mjs makeRoomScratch — 링크면 setup.js 가 실제 prodev/bots 에 봇 폴더를 만든다).
// 진짜 CLI(bin/cockpit.js serve)를 자식 프로세스로 띄우고 사람 역할을 HTTP 로 한다:
//   ① admin 이 POST /api/rooms {name} — 진짜 setup.js 가 과제 폴더 · 봇 폴더 · 설정 두 장을 만든다
//   ② admin API 로 켜기
//   ③ member 가 봉투 없는 글 둘(하나에 csv 첨부) — 사람끼리의 글
//   ④ 30초 기다림 — 봇 턴이 돌면 안 된다
//   ⑤ member 가 @TO(봇) 로 "위에 올린 파일 봐 주세요" — 봇이 fetch_history 로 따라잡는가 · 첨부를 읽는가
//   ⑥ 봇 답을 기다린다 ⑦ admin 이 방을 보관 — 세션이 꺼진다
// --fail-setup: 사본의 setup.js 가 봇 폴더를 반쯤 만들고 exit 1 → ① 이 502 와 되돌림을 내는지만 본다 (세션은 켜지 않는다)
// 내는 줄: ROOM_CREATE_API · ROOMS_FOR_PROJECT · BOT_DIR_SETTINGS_LOCAL · START_API · PLAIN_MESSAGES … TARGET_ROWS … INBOX_ROWS ·
//          BOT_TURNS_AFTER_PLAIN · DELIVERED_AFTER_PLAIN · FETCH_HISTORY_CALLED · FETCH_HISTORY_HAS_ATTACHMENTS · READ_ATTACHMENT ·
//          BOT_REPLY · ARCHIVE_API · COST_USD · ASKED (· ERROR)
//          (--fail-setup) ROOM_CREATE_API 502 · SETUP_ERROR · SETUP_TAIL · ROLLBACK_BOT_DIR_EXISTS · ROLLBACK_PROJECT_DIR_EXISTS · ROLLBACK_ROWS
// 판정하지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeRoomScratch } from './scratch.mjs';
import { ADMIN, MEMBER, autoApprove, freePort, httpClient, sleep, startServe, until } from './server.mjs';
import { openRuntime } from '../src/runtime.js';
import { createAccount } from '../src/auth/sessions.js';
import { ChatDb } from '../src/db/chat-db.js';
import { createCockpitTools } from '../src/mcp/tools.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const argv = process.argv.slice(2);
const failSetup = argv.includes('--fail-setup');
const pos = argv.filter(a => !a.startsWith('--'));
if (!pos[0]) { console.error('쓰는 법: node smoke/m5-room.mjs <스크래치 폴더> [모델] [--fail-setup]'); process.exit(1); }
const model = pos[1] || DEFAULT_MODEL;
const PROJECT = 'smoke';
const BOT = `prodev-${PROJECT}-bot`;
const PLAIN_WAIT_MS = 30_000;

const d = makeRoomScratch(pos[0], { failSetup });
const port = await freePort();
const configFile = path.join(d.root, 'cockpit.json');
fs.writeFileSync(configFile, JSON.stringify({ ...d.config, host: '127.0.0.1', port }, null, 2));

// 계정 둘 — 과제는 열지 않는다 (방 만들기가 한다)
const tokens = {};
{
  const rt = openRuntime(d.config);
  try {
    for (const [username, role] of [[ADMIN, 'admin'], [MEMBER, 'member']]) {
      const acc = await createAccount({ chatDb: rt.chatDb, cockpitDb: rt.cockpitDb, username, password: 'smoke-password', role });
      tokens[username] = rt.cockpitDb.createWebSession(acc.id);
    }
  } finally {
    await rt.close({ keepState: true });
  }
}

const api = httpClient(`http://127.0.0.1:${port}`, tokens);
const chatFile = path.join(d.dataDir, 'chat.db');
const cockpitFile = path.join(d.dataDir, 'cockpit.db');
const count = (file, sql) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return Number(db.prepare(sql).get().c); } finally { db.close(); }
};
const serve = await startServe(configFile, { model, logFile: path.join(d.root, 'serve.log') });
let approver = null;
let code = 0;

try {
  // ① 방 만들기 = 봇 생성
  const t0 = Date.now();
  const made = await api.call(ADMIN, 'POST', '/api/rooms', { json: { name: PROJECT } });
  console.log(`ROOM_CREATE_API ${made.status} room=${made.body?.name ?? 'none'} bot=${made.body?.bot?.name ?? 'none'} setup_ms=${Date.now() - t0}`);

  if (failSetup) {
    console.log(`SETUP_ERROR ${JSON.stringify(made.body?.error ?? null)}`);
    console.log(`SETUP_TAIL ${JSON.stringify(made.body?.setup_tail ?? [])}`);
    console.log(`ROLLBACK_BOT_DIR_EXISTS ${fs.existsSync(path.join(d.botsDir, BOT)) ? 'yes' : 'no'}`);
    console.log(`ROLLBACK_PROJECT_DIR_EXISTS ${fs.existsSync(path.join(d.projectsDir, PROJECT)) ? 'yes' : 'no'}`);
    const rows = count(chatFile, 'SELECT COUNT(*) c FROM bots') + count(chatFile, 'SELECT COUNT(*) c FROM rooms') + count(cockpitFile, 'SELECT COUNT(*) c FROM agent_sessions');
    console.log(`ROLLBACK_ROWS ${rows}`);
    if (made.status !== 502) code = 1;
  } else {
    if (made.status !== 201) throw new Error(`방 만들기 실패 ${made.status} ${JSON.stringify(made.body)}`);
    const roomId = made.body.id;
    const rooms = (await api.call(MEMBER, 'GET', '/api/rooms')).body;
    console.log(`ROOMS_FOR_PROJECT ${rooms.active.filter(r => r.name === `prodev-${PROJECT}` || r.name.startsWith(`prodev-${PROJECT}/`)).length}`);
    console.log(`BOT_DIR_SETTINGS_LOCAL ${fs.existsSync(path.join(d.botsDir, BOT, '.claude', 'settings.local.json')) ? 'yes' : 'no'}`);
    // 결재 대조용 헌장 한 줄 — setup 은 헌장을 만들지 않는다 (charter 스킬의 일)
    const charter = path.join(d.projectsDir, PROJECT, 'charter.md');
    if (!fs.existsSync(charter)) fs.writeFileSync(charter, '# 헌장 (스모크)\n\nPL: 김피엘\n');

    // ② 켜기
    approver = autoApprove(api);
    const started = await api.session(PROJECT, 'start');
    console.log(`START_API ${started.status} ${started.body?.state ?? JSON.stringify(started.body)}`);
    const eventsBeforePlain = (await api.events(PROJECT)).at(-1)?.id ?? 0;

    // ③ 사람끼리 글 둘 — 하나에 csv
    const fd = new FormData();
    fd.append('body', '어제 라인 3 수율 자료 올려요');
    fd.append('file', new Blob(['lot,yield\nA-0913,91.2\nB-0913,88.7\n'], { type: 'text/csv' }), 'yield.csv');
    const plain1 = (await api.call(MEMBER, 'POST', `/api/rooms/${roomId}/messages`, { form: fd })).body?.message;
    const plain2 = await api.post(roomId, 'B 로트가 좀 낮네요. 봇한테는 이따 물어볼게요', MEMBER);
    const ids = [plain1?.id, plain2?.id].filter(Number.isInteger);
    const inList = ids.length ? ids.join(',') : '0';
    console.log(`PLAIN_MESSAGES ${ids.length} TARGET_ROWS ${count(chatFile, `SELECT COUNT(*) c FROM message_targets WHERE message_id IN (${inList})`)} INBOX_ROWS ${count(cockpitFile, `SELECT COUNT(*) c FROM bot_inbox WHERE message_id IN (${inList})`)}`);

    // ④ 기다림 — 봇 턴이 돌면 안 된다
    await sleep(PLAIN_WAIT_MS);
    const quiet = await api.events(PROJECT, eventsBeforePlain);
    console.log(`BOT_TURNS_AFTER_PLAIN ${quiet.filter(e => e.type === 'result').length}`);
    console.log(`DELIVERED_AFTER_PLAIN ${quiet.filter(e => e.type === 'delivered').length}`);

    // ⑤ 부르기 — 따라잡기
    const eventsBeforeCall = (await api.events(PROJECT)).at(-1)?.id ?? 0;
    const call = await api.post(roomId, `@TO(${BOT}) 위에 올린 수율 자료 파일 봐 주세요. 파일 첫 줄에 무엇이 있는지 알려 주세요.`, MEMBER);
    const reply = await until(async () => (await api.messages(roomId, call.id)).find(m => m.author_type === 'bot'), { timeoutMs: 300_000, pollMs: 2000 });
    await api.waitIdleAfter(PROJECT, eventsBeforeCall, { timeoutMs: 240_000 });
    const ev = await api.events(PROJECT, eventsBeforeCall);

    const fetches = ev.filter(e => e.type === 'tool_use' && e.data.name === 'mcp__cockpit__fetch_history');
    console.log(`FETCH_HISTORY_CALLED ${fetches.length ? 'yes' : 'no'}`);
    // 결과에 첨부가 실렸나 — 사건의 결과 요약은 200자에서 잘리므로, 봇이 준 입력 그대로 처리기를 다시 돌려 본다 (읽기만)
    let hasAttachments = 'no';
    if (fetches.length) {
      const chatDb = new ChatDb(chatFile);
      try {
        const tools = createCockpitTools({
          chatDb, bot: chatDb.botByName(BOT), rooms: chatDb.projectRooms(PROJECT),
          projectsDir: d.projectsDir, uploadsDir: d.uploadsDir, getLastToRoom: () => roomId,
        });
        for (const f of fetches) {
          let args;
          try { args = JSON.parse(f.data.input); } catch { args = { chat_id: String(roomId) }; }
          const out = await tools.fetchHistory(args);
          if (/"attachments":\[\{"filename":"yield\.csv"/.test(out.content[0].text)) hasAttachments = 'yes';
        }
      } finally {
        chatDb.close();
      }
    }
    console.log(`FETCH_HISTORY_HAS_ATTACHMENTS ${hasAttachments}`);
    const read = ev.some(e => e.type === 'tool_use' && e.data.name === 'Read'
      && String(e.data.file_path ?? '').includes(`${path.sep}uploads${path.sep}`) && String(e.data.file_path).endsWith('-yield.csv'));
    console.log(`READ_ATTACHMENT ${read ? 'yes' : 'no'}`);
    console.log(`BOT_REPLY ${reply ? `message_id=${reply.id} ${JSON.stringify(reply.body.slice(0, 80))}` : 'none'}`);
    const err = ev.find(e => e.type === 'error');
    if (err) console.log(`ERROR ${JSON.stringify(err.data)}`);

    // ⑦ 보관
    const archived = await api.call(ADMIN, 'POST', `/api/rooms/${roomId}/archive?confirm=1`);
    const after = await api.project(PROJECT);
    console.log(`ARCHIVE_API ${archived.status} state=${after?.session.state ?? 'none'}`);
    console.log(`COST_USD ${Number(after?.session.cost_usd ?? 0).toFixed(4)}`);
    if (!reply) code = 1;
  }
} catch (e) {
  console.log(`ERROR ${JSON.stringify(String(e?.message ?? e).split('\n')[0])}`);
  code = 1;
} finally {
  if (approver) approver.stop();
  console.log(`ASKED ${JSON.stringify(approver?.asked ?? [])}`);
  await serve.kill('SIGTERM');
}
process.exit(code);
