// 스모크 m2-compact — 글 → idle 에서 admin /compact → 글 (VERIFICATION 3절 · meta 실증 5 의 말 셋).
//   node smoke/m2-compact.mjs <스크래치 폴더> [모델] [--no-origin]
//
// 압축은 세션 관리자의 compact() 로 건다 — idle 을 기다렸다가 밀린 글보다 먼저 /compact 가 들어간다 (ADR-008).
// 보는 것: compact_boundary · 본방 system 글 둘(정리 중 · 정리 끝) · pre-compact 훅의 인수인계서(<봇 폴더>/handoff-compact.md) ·
// 압축 뒤 첫 답.
// 내는 줄: FIRST_REPLY · COMPACTED · COMPACT_BOUNDARY · SYSTEM_MESSAGES · HANDOFF 정상|못 썼다|없음 · FIRST_TEXT_AFTER · HOOKS · ASKED · COST_USD
// 판정하지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { parseSmokeArgs, makeScratch, startRuntime, waitForBotMessage, waitUntil, events, resultCount } from './lib.mjs';
import { COMPACT_START_TEXT, COMPACT_END_TEXT } from '../src/session/manager.js';

const { root, model, noOrigin } = parseSmokeArgs(process.argv.slice(2), '쓰는 법: node smoke/m2-compact.mjs <스크래치 폴더> [모델] [--no-origin]');
const d = makeScratch(root, 'smoke');
const { rt, asked, main } = startRuntime(d, { model, noOrigin });
let code = 0;
try {
  await rt.manager.start(d.project, { resume: false });
  const first = rt.manager.postUserMessage({ roomId: main.id, username: '김과제', body: `@TO(${d.botName}) 안녕하세요. 이 과제 방 이름을 한 줄로 답해 주세요.` });
  const r1 = await waitForBotMessage(rt.manager, d.project, first.id, { timeoutMs: 240_000 });
  await waitUntil(() => rt.manager.state(d.project) === 'idle', { timeoutMs: 120_000 });
  console.log(`FIRST_REPLY ${r1 ? JSON.stringify(r1.body.slice(0, 60)) : 'none'}`);

  const results = resultCount(rt, d.project);
  rt.manager.compact(d.project);
  const compacted = await waitUntil(
    () => events(rt, d.project).some(e => e.type === 'compact') && resultCount(rt, d.project) > results && rt.manager.state(d.project) === 'idle',
    { timeoutMs: 300_000 },
  );
  const boundary = events(rt, d.project).find(e => e.type === 'compact');
  console.log(`COMPACTED ${compacted ? 'yes' : 'no'}`);
  console.log(`COMPACT_BOUNDARY ${boundary ? `pre=${boundary.data.pre_tokens ?? '?'} trigger=${boundary.data.trigger ?? '?'} ${JSON.stringify(boundary.data)}` : 'none'}`);

  const sys = rt.chatDb.messagesAfter(main.id, 0).filter(m => m.author_type === 'system').map(m => m.body);
  console.log(`SYSTEM_MESSAGES ${sys.filter(b => b === COMPACT_START_TEXT || b === COMPACT_END_TEXT).length} ${JSON.stringify(sys)}`);
  const handoffFile = path.join(d.botDir, 'handoff-compact.md');
  const handoff = fs.existsSync(handoffFile) ? fs.readFileSync(handoffFile, 'utf8') : null;
  console.log(`HANDOFF ${handoff == null ? '없음' : handoff.includes('못 만들었다') ? '못 썼다' : '정상'}`);

  const second = rt.manager.postUserMessage({ roomId: main.id, username: '김과제', body: `@TO(${d.botName}) 방금 무엇을 하고 있었는지 한 줄로 알려 주세요.` });
  const r2 = await waitForBotMessage(rt.manager, d.project, second.id, { timeoutMs: 240_000 });
  console.log(`FIRST_TEXT_AFTER ${r2 ? JSON.stringify([...r2.body].slice(0, 40).join('')) : 'none'}`);

  const ev = events(rt, d.project);
  console.log(`HOOKS ${JSON.stringify(ev.filter(e => e.type === 'hook').map(e => `${e.data.hook_event ?? e.data.hook_name}:${e.data.subtype}${e.data.exit_code != null ? `:${e.data.exit_code}` : ''}`))}`);
  console.log(`ASKED ${JSON.stringify(asked)}`);
  const err = ev.find(e => e.type === 'error');
  if (err) console.log(`ERROR ${JSON.stringify(err.data)}`);
  console.log(`COST_USD ${rt.cockpitDb.agentSession(d.project).cost_usd.toFixed(4)}`);
  if (!compacted || !r2) code = 1;
} finally {
  await rt.close();
}
process.exit(code);
