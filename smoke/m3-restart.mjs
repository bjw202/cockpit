// 스모크 m3-restart — 서버 재기동 되살림 (TASKS M3.6 · VERIFICATION 3절) + admin API 로 끄기 · 켜기 (M3.M 준비).
//   node smoke/m3-restart.mjs <스크래치 폴더> [모델]
//
// 진짜 CLI(bin/cockpit.js serve)를 자식 프로세스 묶음으로 띄운다:
//   ① admin API start → 김과제가 본방에 글 하나 → 봇 답
//   ② 서버 프로세스 묶음(serve + Claude CLI)을 SIGKILL — PC 가 꺼진 것처럼. agent_sessions.state 는 적힌 그대로 남는다
//   ③ 서버가 없는 사이 글 둘을 DB 에 넣는다 (세션 관리자 postUserMessage — 큐에만 쌓인다)
//   ④ serve 를 다시 띄운다 — stopped 가 아닌 세션을 resume 으로 되살리고 남은 큐를 푼다
//   ⑤ 답 둘을 기다린다
//   ⑥ admin API stop → start — 끄고 켜도 같은 session_id 로 이어지는가 (meta R5 의 손 걸음 s5 · s11 자리)
// 승인 카드가 뜨면 admin 으로 허용하고 ASKED 에 남긴다.
// 내는 줄: START_API · FIRST_REPLY · SESSION_BEFORE · KILLED · STATE_AFTER_KILL · INSERTED · RESUMED · REDELIVERED ·
//          BOT_REPLIES_AFTER_RESTART · STOP_API · START_API_AGAIN · CONTEXT_PCT · ASKED · COST_USD (· ERROR)
// 판정하지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { makeScratch, DEFAULT_MODEL, parseSmokeArgs } from './lib.mjs';
import { ADMIN, MEMBER, autoApprove, botMessagesAfter, httpClient, prepareServer, sleep, startServe, until } from './server.mjs';
import { openRuntime } from '../src/runtime.js';

const { root, model } = parseSmokeArgs(process.argv.slice(2), '쓰는 법: node smoke/m3-restart.mjs <스크래치 폴더> [모델]');
const d = makeScratch(root, 'smoke');
const srv = await prepareServer(d);
const api = httpClient(srv.base, srv.tokens);
const logFile = path.join(d.root, 'serve.log');
const bot = d.botName;
let code = 0;
let serve = await startServe(srv.configFile, { model: model || DEFAULT_MODEL, logFile });
let approver = autoApprove(api);
const asked = [];

try {
  // ① 켜기 · 글 · 답
  const started = await api.session(d.project, 'start');
  console.log(`START_API ${started.status} ${started.body?.state ?? JSON.stringify(started.body)}`);
  const first = await api.post(srv.rooms.main.id, `@TO(${bot}) 안녕하세요. 이 방 이름을 한 줄로 reply 해 주세요.`);
  const firstReply = await until(async () => (await botMessagesAfter(api, srv.rooms, first.id))[0], { timeoutMs: 240_000, pollMs: 1500 });
  console.log(`FIRST_REPLY ${firstReply ? `message_id=${firstReply.id} ${JSON.stringify(firstReply.body.slice(0, 60))}` : 'none'}`);
  await api.waitIdleAfter(d.project, 0, { timeoutMs: 180_000 });
  const before = await api.project(d.project);
  const sessionBefore = before?.session.session_id ?? null;
  console.log(`SESSION_BEFORE ${sessionBefore}`);
  const lastEventBeforeKill = (await api.events(d.project)).at(-1)?.id ?? 0;

  // ② 강제 종료
  approver.stop();
  asked.push(...approver.asked);
  const exit = await serve.kill('SIGKILL');
  console.log(`KILLED signal=${exit.signal ?? 'none'} code=${exit.code ?? 'none'}`);
  await sleep(1500);

  // ③ 서버가 없는 사이의 글 둘
  const rt = openRuntime(d.config);
  let m3; let m4;
  try {
    console.log(`STATE_AFTER_KILL ${rt.cockpitDb.agentSession(d.project).state}`);
    m3 = rt.manager.postUserMessage({ roomId: srv.rooms.main.id, username: MEMBER, body: `@TO(${bot}) 서버가 꺼진 사이 쓴 첫째 글입니다. 이 글에는 "첫째 받음" 으로 시작하는 reply 하나로 답해 주세요.` });
    m4 = rt.manager.postUserMessage({ roomId: srv.rooms.main.id, username: MEMBER, body: `@TO(${bot}) 서버가 꺼진 사이 쓴 둘째 글입니다. 이 글에는 따로 "둘째 받음" 으로 시작하는 reply 하나로 답해 주세요.` });
    console.log(`INSERTED ${m3.id} ${m4.id} pending=${rt.cockpitDb.pendingInbox(srv.bot.id).length}`);
  } finally {
    await rt.close({ keepState: true });
  }

  // ④ 다시 켠다
  serve = await startServe(srv.configFile, { model: model || DEFAULT_MODEL, logFile });
  approver = autoApprove(api);

  // ⑤ 답 둘
  const replies = await until(async () => {
    const got = await botMessagesAfter(api, srv.rooms, m4.id);
    if (got.length >= 2) return got;
    const p = await api.project(d.project);
    const results = (await api.events(d.project, lastEventBeforeKill)).filter(e => e.type === 'result').length;
    // 봇이 한 reply 로 둘을 묶으면 둘째가 안 온다 — 턴이 끝나고 20초 더 기다린 뒤 있는 만큼으로 닫는다
    if (p?.session.state === 'idle' && results >= 1) { await sleep(20_000); return botMessagesAfter(api, srv.rooms, m4.id); }
    return p?.session.state === 'error' ? got : null;
  }, { timeoutMs: 300_000, pollMs: 2000 }) ?? [];

  // serve 는 "듣는 중" 을 낸 뒤에 bootResume 한다 — 그 줄은 답을 기다린 뒤에 모은다
  console.log(`SERVE_BOOT ${JSON.stringify(serve.lines.filter(l => /resume|켬|✗/.test(l)))}`);
  const after = await api.project(d.project);
  const eventsAfterBoot = await api.events(d.project, lastEventBeforeKill);
  const resumeFailed = eventsAfterBoot.find(e => e.type === 'resume_failed');
  const same = !resumeFailed && sessionBefore != null && after?.session.session_id === sessionBefore;
  console.log(`RESUMED ${same ? `session_id=${after.session.session_id}` : `NEW (${after?.session.session_id ?? 'none'}${resumeFailed ? ` · ${resumeFailed.data.error}` : ''})`}`);
  const delivered = new Set(eventsAfterBoot.filter(e => e.type === 'delivered').flatMap(e => e.data.message_ids ?? []));
  console.log(`REDELIVERED ${[m3.id, m4.id].filter(id => delivered.has(id)).length}`);
  console.log(`BOT_REPLIES_AFTER_RESTART ${replies.length} ${JSON.stringify(replies.map(m => m.body.slice(0, 30)))}`);

  // ⑥ admin API 끄기 · 켜기
  await api.waitIdleAfter(d.project, lastEventBeforeKill, { timeoutMs: 120_000 });
  let stop = await api.session(d.project, 'stop');
  if (stop.status === 409 && stop.body?.code === 'TASKS_RUNNING') {
    console.log(`STOP_API 409 TASKS_RUNNING ${JSON.stringify(stop.body.tasks)}`);
    stop = await api.session(d.project, 'stop', '?confirm=1');
  }
  console.log(`STOP_API ${stop.status} ${stop.body?.state ?? JSON.stringify(stop.body)}`);
  const again = await api.session(d.project, 'start');
  console.log(`START_API_AGAIN ${again.status} ${again.body?.state ?? JSON.stringify(again.body)} same_session=${again.body?.session_id === sessionBefore ? 'yes' : 'no'}`);

  const final = await api.project(d.project);
  console.log(`CONTEXT_PCT ${final?.session.context_pct ?? 'null'} model=${final?.session.model ?? 'null'}`);
  approver.stop();
  asked.push(...approver.asked);
  console.log(`ASKED ${JSON.stringify(asked)}`);
  const err = (await api.events(d.project)).find(e => e.type === 'error');
  if (err) { console.log(`ERROR ${JSON.stringify(err.data)}`); code = 1; }
  console.log(`COST_USD ${Number(final?.session.cost_usd ?? 0).toFixed(4)}`);
  await api.session(d.project, 'stop', '?confirm=1');
  if (!firstReply || !same || replies.length < 1 || stop.status !== 200 || again.status !== 200) code = 1;
} catch (e) {
  console.log(`ERROR ${JSON.stringify(String(e?.stack ?? e).split('\n').slice(0, 3))}`);
  code = 1;
} finally {
  approver.stop();
  await serve.kill('SIGINT');
  await Promise.race([serve.exited, sleep(5000)]);
  await serve.kill('SIGKILL');
  if (code) console.log(`SERVE_LOG ${logFile} (${fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').length : 0}줄)`);
}
process.exit(code);
