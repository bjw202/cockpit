// 스모크 m1-guard — pre-reply 훅이 막으면 방에 봇 글이 안 남는가 (PRD F7).
//   node smoke/m1-guard.mjs <스크래치 폴더> [모델] [--no-origin]
// 봇에게 1200자 reply 를 시킨다. 내는 줄: HOOK_BLOCKED · ROOM_MESSAGES_FROM_BOT · LONG_BOT_MESSAGES · ASKED
import { parseSmokeArgs, makeScratch, startRuntime, waitUntil, events, resultCount } from './lib.mjs';

const { root, model, noOrigin } = parseSmokeArgs(process.argv.slice(2), '쓰는 법: node smoke/m1-guard.mjs <스크래치 폴더> [모델] [--no-origin]');
const d = makeScratch(root, 'smoke');
const { rt, asked, main, files } = startRuntime(d, { model, noOrigin });
let code = 0;
try {
  await rt.manager.start(d.project, { resume: false });
  rt.manager.postUserMessage({
    roomId: main.id, username: '김과제',
    body: `@TO(${d.botName}) 시험이다. reply 도구로 chat_id "${main.id}" 에 한글 1200자짜리 긴 글(아무 내용, 줄바꿈 없이)을 한 번 보내라. 막히면 그 이유를 한 줄로 reply 하고 다시 시도하지 마라.`,
  });
  const done = await waitUntil(() => resultCount(rt, d.project) >= 1 && rt.manager.state(d.project) === 'idle', { timeoutMs: 240000 });

  const ev = events(rt, d.project);
  const replyUses = new Set(ev.filter(e => e.type === 'tool_use' && e.data.name === 'mcp__cockpit__reply').map(e => e.data.id));
  const blocked = ev.some(e => e.type === 'tool_result' && replyUses.has(e.data.tool_use_id) && e.data.is_error);
  const botMsgs = [main, files].flatMap(r => rt.chatDb.messagesAfter(r.id, 0)).filter(m => m.author_type === 'bot');
  console.log(`TURN_DONE ${done ? 'yes' : 'no'}`);
  console.log(`REPLY_CALLS ${replyUses.size}`);
  console.log(`HOOK_BLOCKED ${blocked ? 'yes' : 'no'}`);
  console.log(`ROOM_MESSAGES_FROM_BOT ${botMsgs.length}`);
  console.log(`LONG_BOT_MESSAGES ${botMsgs.filter(m => [...m.body].length > 900).length}`);
  console.log(`ASKED ${JSON.stringify(asked)}`);
  const err = ev.find(e => e.type === 'error');
  if (err) console.log(`ERROR ${JSON.stringify(err.data)}`);
  console.log(`COST_USD ${rt.cockpitDb.agentSession(d.project).cost_usd.toFixed(4)}`);
  if (!done) code = 1;
} finally {
  await rt.close();
}
process.exit(code);
