// 스모크 m2-compact — 글 → idle 에서 admin API 로 압축 → 글 (VERIFICATION 3절 · meta 실증 5 의 말 셋).
//   node smoke/m2-compact.mjs <스크래치 폴더> [모델] [--no-origin]
//
// 진짜 CLI(bin/cockpit.js serve)를 띄우고 세션 조작은 admin API 로만 한다 (M3.M 준비 — meta 가 대본의 손 걸음 s3 압축을
// 같은 길로 대신한다): POST …/session/start → 글 → POST …/session/compact → 글 → POST …/session/stop.
// 압축은 idle 을 기다렸다가 밀린 글보다 먼저 /compact 가 들어간다 (ADR-008).
// 보는 것: compact_boundary · 본방 system 글 둘(정리 중 · 정리 끝) · pre-compact 훅의 인수인계서(<봇 폴더>/handoff-compact.md) ·
// 압축 뒤 첫 답. 승인 카드가 뜨면 admin 으로 허용하고 ASKED 에 남긴다.
// 내는 줄: START_API · FIRST_REPLY · COMPACT_API · COMPACTED · COMPACT_BOUNDARY · SYSTEM_MESSAGES · HANDOFF 정상|못 썼다|없음 ·
//          HANDOFF_AT · FIRST_TEXT_AFTER · HOOKS · STOP_API · ASKED · COST_USD
// 판정하지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { parseSmokeArgs, makeScratch } from './lib.mjs';
import { autoApprove, botMessagesAfter, httpClient, prepareServer, sleep, startServe, until } from './server.mjs';
import { COMPACT_START_TEXT, COMPACT_END_TEXT } from '../src/session/manager.js';

const { root, model, noOrigin } = parseSmokeArgs(process.argv.slice(2), '쓰는 법: node smoke/m2-compact.mjs <스크래치 폴더> [모델] [--no-origin]');
const d = makeScratch(root, 'smoke');
const srv = await prepareServer(d);
const api = httpClient(srv.base, srv.tokens);
const logFile = path.join(d.root, 'serve.log');
const serve = await startServe(srv.configFile, { model, logFile, extra: noOrigin ? ['--no-origin'] : [] });
const approver = autoApprove(api);
let code = 0;
try {
  const started = await api.session(d.project, 'start');
  console.log(`START_API ${started.status} ${started.body?.state ?? JSON.stringify(started.body)}`);
  const first = await api.post(srv.rooms.main.id, `@TO(${d.botName}) 안녕하세요. 이 과제 방 이름을 한 줄로 답해 주세요.`);
  const r1 = await until(async () => (await botMessagesAfter(api, srv.rooms, first.id))[0], { timeoutMs: 240_000, pollMs: 1500 });
  await api.waitIdleAfter(d.project, 0, { timeoutMs: 120_000 });
  console.log(`FIRST_REPLY ${r1 ? JSON.stringify(r1.body.slice(0, 60)) : 'none'}`);

  const mark = (await api.events(d.project)).at(-1)?.id ?? 0;
  const compact = await api.session(d.project, 'compact');
  console.log(`COMPACT_API ${compact.status} queued=${compact.body?.queued}`);
  const compacted = await until(async () => {
    const ev = await api.events(d.project, mark);
    if (!ev.some(e => e.type === 'compact') || !ev.some(e => e.type === 'result')) return null;
    return (await api.project(d.project))?.session.state === 'idle';
  }, { timeoutMs: 300_000, pollMs: 2000 });
  const boundary = (await api.events(d.project, mark)).find(e => e.type === 'compact');
  console.log(`COMPACTED ${compacted ? 'yes' : 'no'}`);
  console.log(`COMPACT_BOUNDARY ${boundary ? `pre=${boundary.data.pre_tokens ?? '?'} trigger=${boundary.data.trigger ?? '?'} ${JSON.stringify(boundary.data)}` : 'none'}`);

  const sys = (await api.messages(srv.rooms.main.id, 0)).filter(m => m.author_type === 'system').map(m => m.body);
  console.log(`SYSTEM_MESSAGES ${sys.filter(b => b === COMPACT_START_TEXT || b === COMPACT_END_TEXT).length} ${JSON.stringify(sys)}`);
  const handoffFile = path.join(d.botDir, 'handoff-compact.md');
  const handoff = fs.existsSync(handoffFile) ? fs.readFileSync(handoffFile, 'utf8') : null;
  console.log(`HANDOFF ${handoff == null ? '없음' : handoff.includes('못 만들었다') ? '못 썼다' : '정상'}`);
  // 인수인계서가 스크래치 봇 폴더 밖(실제 prodev 의 bots/)에 생겼나 — PRODEV_BOT_DIR 이 먹는지 (meta M3.0 ②)
  const leaked = path.join(d.prodev, 'bots', d.botName, 'handoff-compact.md');
  console.log(`HANDOFF_AT ${handoff != null ? 'scratch' : fs.existsSync(leaked) ? `prodev ${leaked}` : 'none'}`);

  const second = await api.post(srv.rooms.main.id, `@TO(${d.botName}) 방금 무엇을 하고 있었는지 한 줄로 알려 주세요.`);
  const r2 = await until(async () => (await botMessagesAfter(api, srv.rooms, second.id))[0], { timeoutMs: 240_000, pollMs: 1500 });
  console.log(`FIRST_TEXT_AFTER ${r2 ? JSON.stringify([...r2.body].slice(0, 40).join('')) : 'none'}`);

  const ev = await api.events(d.project);
  console.log(`HOOKS ${JSON.stringify(ev.filter(e => e.type === 'hook').map(e => `${e.data.hook_event ?? e.data.hook_name}:${e.data.subtype}${e.data.exit_code != null ? `:${e.data.exit_code}` : ''}`))}`);
  await api.waitIdleAfter(d.project, mark, { minResults: 2, timeoutMs: 120_000 });   // 압축 턴 + 둘째 글 턴
  let stop = await api.session(d.project, 'stop');
  if (stop.status === 409) stop = await api.session(d.project, 'stop', '?confirm=1');
  console.log(`STOP_API ${stop.status} ${stop.body?.state ?? JSON.stringify(stop.body)}`);
  approver.stop();
  console.log(`ASKED ${JSON.stringify(approver.asked)}`);
  const err = ev.find(e => e.type === 'error');
  if (err) console.log(`ERROR ${JSON.stringify(err.data)}`);
  console.log(`COST_USD ${Number((await api.project(d.project))?.session.cost_usd ?? 0).toFixed(4)}`);
  if (!compacted || !r2 || stop.status !== 200) code = 1;
} catch (e) {
  console.log(`ERROR ${JSON.stringify(String(e?.stack ?? e).split('\n').slice(0, 3))}`);
  code = 1;
} finally {
  approver.stop();
  await serve.kill('SIGINT');
  await Promise.race([serve.exited, sleep(5000)]);
  await serve.kill('SIGKILL');
  if (code) console.log(`SERVE_LOG ${logFile}`);
}
process.exit(code);
