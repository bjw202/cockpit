// 스모크 m1-envelope — <channel> 글 꼴과 origin 스탬프를 진짜 모델로 본다 (ADR-013 · meta D0 Q9).
//   node smoke/m1-envelope.mjs <스크래치 폴더> [모델] [--no-origin]
// ① 방에 @CC 글 → 턴이 끝날 때까지 ② 같은 방에 @TO + 첨부 → 봇 답 (v2 · 방 하나 — M5.1 에서 파일방 걸음을 본방으로 옮겼다)
// 내는 줄: ORIGIN · SESSION_START_HOOK · PRE_REPLY_MARKER · REPLY_CHAT_ID · ROOM_ID · REPLIED_TO_CC · READ_ATTACHMENT · ASKED
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseSmokeArgs, makeScratch, startRuntime, waitForBotMessage, waitUntil, markerSaysReply, events, resultCount } from './lib.mjs';

const { root, model, noOrigin } = parseSmokeArgs(process.argv.slice(2), '쓰는 법: node smoke/m1-envelope.mjs <스크래치 폴더> [모델] [--no-origin]');
const d = makeScratch(root, 'smoke');
const { rt, asked, main } = startRuntime(d, { model, noOrigin });
let code = 0;
try {
  await rt.manager.start(d.project, { resume: false });

  // ① cc — 답하면 안 된다
  const cc = rt.manager.postUserMessage({ roomId: main.id, username: '김과제', body: `@CC(${d.botName}) 참고로 오늘 회의는 3시입니다.` });
  await waitUntil(() => resultCount(rt, d.project) >= 1 && rt.manager.state(d.project) === 'idle', { timeoutMs: 180000 });
  const afterCc = rt.chatDb.messagesAfter(main.id, cc.id).filter(m => m.author_type === 'bot').length;

  // ② to + 첨부 — 사람 첨부와 같은 자리(uploads/<uuid>-이름)에 둔다
  const abs = path.join(d.uploadsDir, `${randomUUID()}-memo.txt`);
  fs.writeFileSync(abs, '샤워헤드 교체일은 9월 3일이다\n두 번째 줄\n');
  const to = rt.manager.postUserMessage({
    roomId: main.id, username: '김과제', body: `@TO(${d.botName}) 첨부 파일을 Read 로 읽고 그 첫 줄만 reply 로 보내 주세요.`,
    files: [{ filename: 'memo.txt', absPath: abs, size: fs.statSync(abs).size }],
  });
  const reply = await waitForBotMessage(rt.manager, d.project, to.id, { timeoutMs: 240000 });

  const ev = events(rt, d.project);
  const read = ev.some(e => e.type === 'tool_use' && e.data.name === 'Read' && e.data.file_path && path.resolve(e.data.file_path) === abs);
  const sessionStart = ev.some(e => e.type === 'hook' && e.data.hook_event === 'SessionStart');
  console.log(`ORIGIN ${noOrigin ? 'none' : 'channel'}`);
  console.log(`SESSION_START_HOOK ${sessionStart ? 'yes' : 'no'}`);
  console.log(`PRE_REPLY_MARKER ${markerSaysReply(d.marker) ? 'yes' : 'no'}`);
  console.log(`ROOM_ID ${main.id}`);
  console.log(`REPLY_CHAT_ID ${reply ? reply.room_id : 'none'}`);
  console.log(`REPLY_TEXT ${reply ? JSON.stringify(reply.body.slice(0, 80)) : 'none'}`);
  console.log(`REPLIED_TO_CC ${afterCc > 0 ? 'yes' : 'no'}`);
  console.log(`READ_ATTACHMENT ${read ? 'yes' : 'no'}`);
  console.log(`ASKED ${JSON.stringify(asked)}`);
  const err = ev.find(e => e.type === 'error');
  if (err) console.log(`ERROR ${JSON.stringify(err.data)}`);
  console.log(`COST_USD ${rt.cockpitDb.agentSession(d.project).cost_usd.toFixed(4)}`);
  if (!reply) code = 1;
} finally {
  await rt.close();
}
process.exit(code);
