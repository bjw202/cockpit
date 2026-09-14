// 스모크 m1-guard — pre-reply 훅이 막으면 방에 봇 글이 안 남는가 (PRD F7).
//   node smoke/m1-guard.mjs <스크래치 폴더> [모델] [--no-origin]
//
// M1.M 에서 haiku · sonnet 둘 다 "1200자를 써라" 에 900자를 안 넘겨 판정 불가였다 (meta M2 지시 3절).
// 그래서 스크립트가 1000자 본문을 직접 주고 "이 글을 한 글자도 바꾸지 말고 그대로 reply 로 보내라" 로 시킨다.
// reply 를 부를 때마다 표식 훅이 입력을 파일에 떨구므로, 기다리는 동안 그 파일을 읽어 봇이 보내려던 글자 수를 모은다.
// 내는 줄: GIVEN_BODY_CHARS · TURN_DONE · REPLY_CALLS · REPLY_ATTEMPT_CHARS · ATTEMPTED_OVER_900 · HOOK_BLOCKED ·
//          ROOM_MESSAGES_FROM_BOT · LONG_BOT_MESSAGES · ASKED · COST_USD
import fs from 'node:fs';
import { parseSmokeArgs, makeScratch, startRuntime, waitUntil, events, resultCount } from './lib.mjs';

const { root, model, noOrigin } = parseSmokeArgs(process.argv.slice(2), '쓰는 법: node smoke/m1-guard.mjs <스크래치 폴더> [모델] [--no-origin]');
const d = makeScratch(root, 'smoke');
const { rt, asked, main, files } = startRuntime(d, { model, noOrigin });

// 줄바꿈 없는 한글 1000자
const SENTENCE = '공정 조건을 바꾼 뒤 수율이 어떻게 달라졌는지 로트마다 기록하고 다음 실험의 기준으로 삼는다. ';
const GIVEN = [...SENTENCE.repeat(Math.ceil(1000 / [...SENTENCE].length))].slice(0, 1000).join('');

let code = 0;
try {
  await rt.manager.start(d.project, { resume: false });
  rt.manager.postUserMessage({
    roomId: main.id, username: '김과제',
    body: `@TO(${d.botName}) 시험이다. 아래 <본문> 안의 글을 한 글자도 바꾸거나 줄이지 말고 그대로 reply 도구의 text 로 chat_id "${main.id}" 에 한 번 보내라. `
      + `요약하거나 나누지 마라. 막히면 그 이유를 한 줄로 reply 하고 다시 시도하지 마라.\n<본문>${GIVEN}</본문>`,
  });

  const attempts = new Map();   // 표식 파일 mtime → 글자 수
  const collect = () => {
    try {
      const st = fs.statSync(d.marker);
      if (attempts.has(st.mtimeMs)) return;
      const input = JSON.parse(fs.readFileSync(d.marker, 'utf8'));
      if (input.tool_name === 'mcp__cockpit__reply') attempts.set(st.mtimeMs, [...String(input.tool_input?.text ?? '')].length);
    } catch { /* 아직 없다 · 쓰는 중이다 */ }
  };
  const done = await waitUntil(() => { collect(); return resultCount(rt, d.project) >= 1 && rt.manager.state(d.project) === 'idle'; }, { timeoutMs: 240_000, pollMs: 100 });
  collect();

  const ev = events(rt, d.project);
  const replyUses = new Set(ev.filter(e => e.type === 'tool_use' && e.data.name === 'mcp__cockpit__reply').map(e => e.data.id));
  const blocked = ev.some(e => e.type === 'tool_result' && replyUses.has(e.data.tool_use_id) && e.data.is_error);
  const botMsgs = [main, files].flatMap(r => rt.chatDb.messagesAfter(r.id, 0)).filter(m => m.author_type === 'bot');
  const lengths = [...attempts.values()];
  console.log(`GIVEN_BODY_CHARS ${[...GIVEN].length}`);
  console.log(`TURN_DONE ${done ? 'yes' : 'no'}`);
  console.log(`REPLY_CALLS ${replyUses.size}`);
  console.log(`REPLY_ATTEMPT_CHARS ${JSON.stringify(lengths)}`);
  console.log(`ATTEMPTED_OVER_900 ${lengths.some(n => n > 900) ? 'yes' : 'no'}`);
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
