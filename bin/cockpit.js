#!/usr/bin/env node
// cockpit 명령 하나에 부속 명령 여럿.
//
//   node bin/cockpit.js check [--config <파일>]
//       설정 검사. 어긋난 키마다 ✗ 한 줄, 하나라도 있으면 exit 1
//   node bin/cockpit.js open-project <과제> [--bot-dir <봇 폴더>] [--bot-name <이름>] [--config <파일>]
//       chat.db 에 봇 한 줄 · 방 둘, cockpit.db 에 세션 한 줄. 봇 이름 기본은 prodev-<과제>-bot, 봇 폴더 기본은 <botsDir>/prodev-<과제>-bot
//   node bin/cockpit.js chat <과제> "<글>" [--room main|files] [--as <이름>] [--timeout <초>] [--model <모델>] [--config <파일>]
//       진짜 SDK 로 세션을 켜고(있으면 resume) 글 하나를 넣고 봇 답 하나를 기다려 찍는다. 승인 요청은 전부 거부한다 (M1)
//   node bin/cockpit.js init-admin <이름> [--config <파일>]
//       첫 admin. 비밀번호는 표준입력에서 (터미널이면 화면에 안 보이게 두 번, 파이프면 첫 줄). admin 이 있으면 거절
//   node bin/cockpit.js add-user <이름> [--role member|admin] [--config <파일>]
//       계정 하나 더. 비밀번호는 init-admin 과 같이 받는다
//   node bin/cockpit.js session-token <이름> [--days <일>] [--config <파일>]
//       그 계정의 쿠키 md_session 값을 한 줄로 낸다 (서버 PC 에서만 되는 발급 — meta 의 replay.js 토큰)
//   node bin/cockpit.js serve [--start <과제>[,<과제>…]] [--model <모델>] [--config <파일>]
//       서버를 띄운다. stopped 가 아닌 세션은 resume 으로 되살리고, --start 로 준 과제는 켠다.
//       Ctrl-C 로 끈다 — 세션 상태는 적힌 그대로 두어 다음 기동이 resume 한다. --model 은 스모크 · 개발용
//
// 설정 파일은 --config 가 없으면 현재 폴더의 cockpit.json 이다.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, PATH_KEYS } from '../src/config.js';
import { openRuntime, waitForBotMessage } from '../src/runtime.js';
import { createAccount, initAdmin, issueToken } from '../src/auth/sessions.js';
import { botNameProblem, defaultBotDir, projectNameProblem } from '../src/http/routes-projects.js';
import { applyMigration, describeLegacy, legacyFilesRooms, legacyWarning } from '../src/rooms/migrate.js';

export function parseArgs(argv) {
  const pos = []; const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt[k] = true;
      else { opt[k] = next; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}

const configFile = opt => path.resolve(typeof opt.config === 'string' ? opt.config : 'cockpit.json');

function loadOrDie(opt) {
  const { config, errors } = loadConfig(configFile(opt));
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e.key} ${e.reason}`);
    return null;
  }
  return config;
}

function check(opt) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  let failed = false;
  if (major > 22 || (major === 22 && minor >= 13)) console.log(`✓ node v${process.versions.node} (>= 22.13)`);
  else { console.log(`✗ node v${process.versions.node} — node:sqlite 에 22.13 이상이 필요하다`); failed = true; }

  const { config, errors } = loadConfig(configFile(opt));
  const badKeys = new Set(errors.map(e => e.key));
  for (const e of errors) console.log(`✗ ${e.key} ${e.reason}`);
  for (const key of PATH_KEYS) {
    if (!badKeys.has(key) && config[key]) console.log(`✓ ${key} ${config[key]}`);
  }
  // (v2) 방 만들기가 부르는 setup.js. 적어 준 prodevDir 에 없으면 ✗, botsDir 의 부모로 짐작한 자리면 알리기만 한다 (ARCHITECTURE 10절)
  if (config.prodevDir && !badKeys.has('prodevDir') && !badKeys.has('botsDir')) {
    const has = fs.existsSync(path.join(config.prodevDir, 'scripts', 'setup.js'));
    if (config.prodevDirDerived) console.log(`· prodevDir ${config.prodevDir} (botsDir 의 부모) — setup.js ${has ? '있음' : '없음 — 방 만들기가 502'}`);
    else if (has) console.log(`✓ prodevDir ${config.prodevDir} — setup.js 있음`);
    else { console.log(`✗ prodevDir ${config.prodevDir} — scripts/setup.js 가 없다`); failed = true; }
  }
  // claudePath 는 있다는 것만으로 모자란다 — 불러서 판이 나와야 SDK 가 띄울 수 있다 (M4.2 · 윈도우는 필수)
  if (config.claudePath && !badKeys.has('claudePath')) {
    try {
      const out = execFileSync(config.claudePath, ['--version'], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      console.log(`✓ claudePath ${out.trim().split(/\r?\n/)[0]} — ${config.claudePath}`);
    } catch (e) {
      console.log(`✗ claudePath 실행이 안 된다 (--version) — ${String(e.message).split(/\r?\n/)[0]}`);
      failed = true;
    }
  } else if (!config.claudePath && !badKeys.has('claudePath')) {
    console.log('· claudePath 없음 — 맥 · 리눅스는 SDK 동봉 CLI 를 쓴다');
  }
  if (!errors.length) console.log('✓ 경로 공백 없음');
  return failed || errors.length ? 1 : 0;
}

async function openProject(opt, [project]) {
  if (!project) {
    console.error('쓰는 법: open-project <과제> [--bot-dir <봇 폴더>] [--bot-name <이름>]');
    return 1;
  }
  const config = loadOrDie(opt);
  if (!config) return 1;
  const botName = typeof opt['bot-name'] === 'string' ? opt['bot-name'] : undefined;
  const bad = projectNameProblem(project) ?? (botName === undefined ? null : botNameProblem(botName));
  if (bad) { console.error(`✗ ${bad}`); return 1; }
  const rt = openRuntime(config);
  try {
    const { bot, main, files } = rt.manager.openProject({
      project, botDir: typeof opt['bot-dir'] === 'string' ? path.resolve(opt['bot-dir']) : defaultBotDir(config, project), ...(botName ? { botName } : {}),
    });
    console.log(`과제 ${project} · 봇 ${bot.name} (id ${bot.id}) · 본방 ${main.name} (id ${main.id}) · 파일방 ${files.name} (id ${files.id})`);
    return 0;
  } finally { await rt.close(); }
}

async function chat(opt, [project, body]) {
  if (!project || !body) {
    console.error('쓰는 법: chat <과제> "<글>" [--room main|files] [--as <이름>] [--timeout <초>] [--model <모델>]');
    return 1;
  }
  const config = loadOrDie(opt);
  if (!config) return 1;
  const { sdkBinding } = await import('../src/session/sdk-query.js');   // check · open-project 는 SDK 를 싣지 않는다
  const rt = openRuntime(config, {
    binding: sdkBinding,
    model: typeof opt.model === 'string' ? opt.model : undefined,
    permissionHandler: async ({ toolName, input }) => {
      console.log(`승인 요청 → 거부 (M1 에는 승인 중계가 없다): ${toolName} ${JSON.stringify(input).slice(0, 120)}`);
      return { behavior: 'deny', message: `승인 중계가 없다 — ${toolName} 거부` };
    },
  });
  try {
    const { rooms } = rt.manager.projectInfo(project);
    const room = opt.room === 'files' ? rooms.files : rooms.main;
    const s = await rt.manager.start(project, { resume: true });
    if (s.state === 'error') { console.error('세션을 못 켰다 — session_events 의 error 를 보라'); return 1; }
    const sent = rt.manager.postUserMessage({ roomId: room.id, username: typeof opt.as === 'string' ? opt.as : 'cli', body });
    console.log(`보냄 #${sent.id} [${room.name}] · 세션 ${s.sessionId ?? '(아직 없음)'}`);
    const reply = await waitForBotMessage(rt.manager, project, sent.id, { timeoutMs: (Number(opt.timeout) || 300) * 1000 });
    if (!reply) { console.error(`봇 답 없음 (상태 ${rt.manager.state(project)})`); return 1; }
    const replyRoom = rt.chatDb.roomById(reply.room_id);
    console.log(`봇 #${reply.id} [${replyRoom.name}] ${reply.body}`);
    return 0;
  } finally { await rt.close(); }
}

// 비밀번호 받기 — 터미널이면 되울림 없이 두 번 받아 맞대고, 파이프면 첫 줄 하나
async function readPassword() {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    let all = '';
    for await (const chunk of stdin) all += chunk;
    return all.split(/\r?\n/)[0];
  }
  const ask = prompt => new Promise((resolve, reject) => {
    process.stderr.write(prompt);
    let buf = '';
    const done = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stderr.write('\n'); };
    const onData = s => {
      for (const ch of s) {
        if (ch === '\r' || ch === '\n') { done(); resolve(buf); return; }
        if (ch === '\u0003') { done(); reject(new Error('취소했다')); return; }
        if (ch === '\u007f' || ch === '\b') buf = [...buf].slice(0, -1).join('');
        else buf += ch;
      }
    };
    stdin.setRawMode(true); stdin.setEncoding('utf8'); stdin.resume(); stdin.on('data', onData);
  });
  const first = await ask('비밀번호: ');
  if (first !== await ask('한 번 더: ')) throw new Error('두 비밀번호가 다르다');
  return first;
}

async function withStores(opt, fn) {
  const config = loadOrDie(opt);
  if (!config) return 1;
  const rt = openRuntime(config);
  try { return await fn(rt); } finally { await rt.close(); }
}

async function initAdminCmd(opt, [username]) {
  if (!username) { console.error('쓰는 법: init-admin <이름>   (비밀번호는 표준입력)'); return 1; }
  return withStores(opt, async rt => {
    if (rt.cockpitDb.hasAdmin()) { console.error('✗ admin 이 이미 있다 — 계정은 add-user 로 더한다'); return 1; }
    const acc = await initAdmin({ ...rt, username, password: await readPassword() });
    console.log(`admin ${acc.username} (id ${acc.id}) 을 만들었다`);
    return 0;
  });
}

async function addUserCmd(opt, [username]) {
  const role = typeof opt.role === 'string' ? opt.role : 'member';
  if (!username) { console.error('쓰는 법: add-user <이름> [--role member|admin]   (비밀번호는 표준입력)'); return 1; }
  return withStores(opt, async rt => {
    const acc = await createAccount({ ...rt, username, password: await readPassword(), role });
    console.log(`${acc.role} ${acc.username} (id ${acc.id}) 을 만들었다`);
    return 0;
  });
}

async function sessionTokenCmd(opt, [username]) {
  if (!username) { console.error('쓰는 법: session-token <이름> [--days <일>]'); return 1; }
  const days = Number(opt.days) > 0 ? Number(opt.days) : 7;
  return withStores(opt, async rt => {
    console.log(issueToken(rt, username, { ttlMs: days * 24 * 3600 * 1000 }));
    return 0;
  });
}

async function serve(opt) {
  const config = loadOrDie(opt);
  if (!config) return 1;
  const { sdkBinding } = await import('../src/session/sdk-query.js');
  const { createServer } = await import('../src/http/server.js');
  const rt = openRuntime(config, {
    binding: sdkBinding, model: typeof opt.model === 'string' ? opt.model : undefined, ...(opt['no-origin'] ? { origin: null } : {}),
  });
  const server = createServer({ ...rt, config });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve); });
  } catch (e) {
    console.error(`✗ ${config.host}:${config.port} 에서 듣지 못했다 — ${e.message}`);
    await rt.close({ keepState: true });
    return 1;
  }
  console.log(`cockpit 듣는 중 ${config.tls ? 'https' : 'http'}://${config.host}:${server.address().port}`);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    console.log('끄는 중 — 세션 상태는 그대로 두고 다음 기동에 resume 한다');
    server.closeAllConnections();
    server.close();
    await rt.close({ keepState: true });
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  const legacy = legacyWarning(rt);   // (v2) 막지 않는다 — 회사 PC 의 v1 과제가 멈추면 안 된다 (ARCHITECTURE 4.7)
  if (legacy) console.log(legacy);
  const stale = rt.relay.cancelStale();
  if (stale) console.log(`앞 프로세스에서 답을 못 받은 승인 요청 ${stale} 건을 거둬 감으로 닫았다`);
  for (const r of await rt.manager.bootResume()) {
    console.log(r.error ? `✗ resume ${r.project} — ${r.error}` : `resume ${r.project} → ${r.state}`);
  }
  const starts = typeof opt.start === 'string' ? opt.start.split(',').map(s => s.trim()).filter(Boolean) : [];
  for (const project of starts) {
    try { console.log(`켬 ${project} → ${(await rt.manager.start(project, { resume: true })).state}`); }
    catch (e) { console.log(`✗ 켜기 ${project} — ${e.message}`); }
  }
  return new Promise(() => {});   // Ctrl-C 까지
}

// (v2) 옛 files 방 이관 — 기본은 보이기만, --apply 로 보관 (ARCHITECTURE 4.7)
async function migrateV2(opt) {
  return withStores(opt, async rt => {
    const rows = legacyFilesRooms(rt);
    for (const r of rows) console.log(describeLegacy(r));
    if (!opt.apply) {
      console.log(rows.some(r => r.room.status === 'active') ? '보이기만 했다 — 적용하려면 --apply' : '보관할 옛 files 방이 없다 (--apply 로 돌려도 같다)');
      return 0;
    }
    console.log(`보관 ${applyMigration(rt)}`);
    return 0;
  });
}

const COMMANDS = {
  check, 'open-project': openProject, chat, 'migrate-v2': migrateV2,
  'init-admin': initAdminCmd, 'add-user': addUserCmd, 'session-token': sessionTokenCmd, serve,
};

async function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  const cmd = COMMANDS[pos[0]];
  if (!cmd) {
    console.error(`쓰는 법: node bin/cockpit.js <${Object.keys(COMMANDS).join(' | ')}> …`);
    return 1;
  }
  return cmd(opt, pos.slice(1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }, e => { console.error('오류: ' + (e && e.message || e)); process.exitCode = 1; });
}
