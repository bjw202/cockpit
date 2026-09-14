// 스모크 m1-hello — cockpit 세션 관리자 + 진짜 SDK 로 본방에 "안녕" → 봇 답 하나.
//   node smoke/m1-hello.mjs <스크래치 폴더> [모델] [--no-origin]
// 판정하지 않는다. 아래 줄만 낸다 (VERIFICATION 3절):
//   SESSION_ID · SYSTEM_PROMPT · BOT_REPLY · PRE_REPLY_MARKER · ASKED
import { parseSmokeArgs, makeScratch, startRuntime, waitForBotMessage, waitUntil, markerSaysReply, events, resultCount } from './lib.mjs';

const { root, model, noOrigin } = parseSmokeArgs(process.argv.slice(2), '쓰는 법: node smoke/m1-hello.mjs <스크래치 폴더> [모델] [--no-origin]');
const d = makeScratch(root, 'smoke');
const { rt, asked, main } = startRuntime(d, { model, noOrigin });
let code = 0;
try {
  const s = await rt.manager.start(d.project, { resume: false });
  console.log(`STATE_AFTER_START ${s.state}`);
  const sent = rt.manager.postUserMessage({
    roomId: main.id, username: '김과제',
    body: `@TO(${d.botName}) 안녕. reply 도구로 chat_id "${main.id}" 에 "안녕하세요, 비서입니다" 한 줄만 보내라. 다른 도구는 쓰지 마라.`,
  });
  const reply = await waitForBotMessage(rt.manager, d.project, sent.id, { timeoutMs: 240000 });
  // 값은 result 에 실려 온다 — 봇 글 뒤 턴이 끝날 때까지 기다린다
  if (reply) await waitUntil(() => resultCount(rt, d.project) >= 1, { timeoutMs: 60000 });
  console.log(`SESSION_ID ${rt.cockpitDb.agentSession(d.project).session_id}`);
  const sp = s.options.systemPrompt;
  console.log(`SYSTEM_PROMPT ${sp && sp.type === 'preset' && sp.append ? 'preset+append' : JSON.stringify(sp)}`);
  console.log(`ORIGIN ${noOrigin ? 'none' : 'channel'}`);
  console.log(reply ? `BOT_REPLY message_id=${reply.id} room=${rt.chatDb.roomById(reply.room_id).name}` : `BOT_REPLY none (state ${rt.manager.state(d.project)})`);
  console.log(`PRE_REPLY_MARKER ${markerSaysReply(d.marker) ? 'yes' : 'no'}`);
  console.log(`ASKED ${JSON.stringify(asked)}`);
  const err = events(rt, d.project).find(e => e.type === 'error');
  if (err) console.log(`ERROR ${JSON.stringify(err.data)}`);
  console.log(`COST_USD ${rt.cockpitDb.agentSession(d.project).cost_usd.toFixed(4)}`);
  if (!reply) code = 1;
} finally {
  await rt.close();
}
process.exit(code);
