// 스모크 m4-sessions — 세션 셋의 자원 (TASKS M4.3 · 판정 P-W4.d 는 meta).
//   node smoke/m4-sessions.mjs <스크래치 폴더> [모델] [--minutes 5]
//
// 진짜 CLI serve 를 자식으로 띄우고(smoke/server.mjs) 과제 셋(s1 · s2 · s3)을 admin API 로 켠다. 과제마다 글 하나를 보내
// 봇이 한 번 답하게 한 뒤(세션이 실제로 일한 상태), 0분부터 N분까지 1분마다 serve 프로세스와 그 밑 프로세스 나무의
// 상주 메모리를 적는다. 맥 · 리눅스는 ps, 윈도우는 Win32_Process 의 WorkingSetSize(상주 메모리에 해당)로 잰다.
// 끝에 셋을 끈다. 승인 카드가 뜨면 admin 으로 허용하고 ASKED 에 남긴다.
// 내는 줄: PLATFORM · START_API <과제> · WARM <과제> yes|no · RSS_MB <분> <서버> <자식 합> · CHILD_PROCS <분> <수> ·
//          STATES · STOP_API <과제> · ASKED · COST_USD (· ERROR)
// 판정하지 않는다.

import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_MODEL } from './lib.mjs';
import { makeScratch, addScratchProject } from './scratch.mjs';
import { autoApprove, botMessagesAfter, httpClient, prepareServer, sleep, startServe, until } from './server.mjs';

const USAGE = '쓰는 법: node smoke/m4-sessions.mjs <스크래치 폴더> [모델] [--minutes 5]';
const argv = process.argv.slice(2);
const mi = argv.indexOf('--minutes');
const minutes = mi >= 0 ? Number(argv[mi + 1]) : 5;
const pos = argv.filter((a, i) => !a.startsWith('--') && !(mi >= 0 && i === mi + 1));
if (!pos[0] || !(minutes >= 0)) { console.error(USAGE); process.exit(1); }
const root = path.resolve(pos[0]);
const model = pos[1] || DEFAULT_MODEL;

// 온 기계의 프로세스 표 { pid, ppid, rssKb }
function processTable() {
  if (process.platform === 'win32') {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress'],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(out).map(p => ({ pid: p.ProcessId, ppid: p.ParentProcessId, rssKb: Math.round(Number(p.WorkingSetSize) / 1024) }));
  }
  return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n')
    .map(l => l.trim().split(/\s+/).map(Number)).map(([pid, ppid, rssKb]) => ({ pid, ppid, rssKb }));
}

// serve 한 프로세스 + 그 밑 나무 전부 (Claude CLI 와 그 자식 · MCP · 훅)
function treeRss(rootPid) {
  const table = processTable();
  const kids = new Map();
  for (const p of table) { if (!kids.has(p.ppid)) kids.set(p.ppid, []); kids.get(p.ppid).push(p); }
  const server = table.find(p => p.pid === rootPid);
  const below = [];
  const stack = [...(kids.get(rootPid) ?? [])];
  while (stack.length) { const p = stack.pop(); below.push(p); stack.push(...(kids.get(p.pid) ?? [])); }
  const mb = kb => (kb / 1024).toFixed(1);
  return { server: server ? mb(server.rssKb) : 'gone', children: mb(below.reduce((s, p) => s + p.rssKb, 0)), count: below.length };
}

const d = makeScratch(root, 's1');
for (const p of ['s2', 's3']) addScratchProject(d, p);
const names = d.bots.map(b => b.project);
const srv = await prepareServer(d);
const api = httpClient(srv.base, srv.tokens);
const logFile = path.join(d.root, 'serve.log');
console.log(`PLATFORM ${process.platform} ${os.release()} node ${process.versions.node} cpus=${os.cpus().length} mem_gb=${(os.totalmem() / 1024 ** 3).toFixed(1)} model=${model}`);
const serve = await startServe(srv.configFile, { model, logFile });
const approver = autoApprove(api);
let code = 0;
try {
  for (const name of names) {
    const r = await api.session(name, 'start');
    console.log(`START_API ${name} ${r.status} ${r.body?.state ?? JSON.stringify(r.body)}`);
    if (r.status !== 200) code = 1;
  }
  const sent = {};
  for (const b of d.bots) sent[b.project] = await api.post(srv.projects[b.project].rooms.main.id, `@TO(${b.botName}) 안녕하세요. 이 방 이름을 한 줄로 reply 해 주세요.`);
  for (const name of names) {
    const got = await until(async () => (await botMessagesAfter(api, srv.projects[name].rooms, sent[name].id))[0], { timeoutMs: 300_000, pollMs: 2000 });
    console.log(`WARM ${name} ${got ? 'yes' : 'no'}`);
  }
  for (const name of names) await api.waitIdleAfter(name, 0, { timeoutMs: 180_000 });

  for (let m = 0; m <= minutes; m++) {
    const t = treeRss(serve.child.pid);
    console.log(`RSS_MB ${m} ${t.server} ${t.children}`);
    console.log(`CHILD_PROCS ${m} ${t.count}`);
    if (m < minutes) await sleep(60_000);
  }

  const states = [];
  let cost = 0;
  for (const name of names) {
    const p = await api.project(name);
    states.push(`${name}:${p?.session.state}`);
    cost += Number(p?.session.cost_usd ?? 0);
  }
  console.log(`STATES ${states.join(' ')}`);
  for (const name of names) {
    let r = await api.session(name, 'stop');
    if (r.status === 409) r = await api.session(name, 'stop', '?confirm=1');
    console.log(`STOP_API ${name} ${r.status} ${r.body?.state ?? JSON.stringify(r.body)}`);
  }
  approver.stop();
  console.log(`ASKED ${JSON.stringify(approver.asked)}`);
  for (const name of names) {
    const err = (await api.events(name)).find(e => e.type === 'error');
    if (err) { console.log(`ERROR ${name} ${JSON.stringify(err.data)}`); code = 1; }
  }
  console.log(`COST_USD ${cost.toFixed(4)}`);
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
