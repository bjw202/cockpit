#!/usr/bin/env node
// cockpit 명령 하나에 부속 명령 여럿.
//
//   node bin/cockpit.js check [--config <파일>]
//       설정 검사. 어긋난 키마다 ✗ 한 줄, 하나라도 있으면 exit 1
//   node bin/cockpit.js open-project <과제> --bot-dir <봇 폴더> [--bot-name <이름>] [--config <파일>]
//       chat.db 에 봇 한 줄 · 방 둘, cockpit.db 에 세션 한 줄. 봇 이름 기본은 prodev-<과제>-bot
//   node bin/cockpit.js chat <과제> "<글>" [--room main|files] [--as <이름>] [--timeout <초>] [--model <모델>] [--config <파일>]
//       진짜 SDK 로 세션을 켜고(있으면 resume) 글 하나를 넣고 봇 답 하나를 기다려 찍는다. 승인 요청은 전부 거부한다 (M1)
//
// 설정 파일은 --config 가 없으면 현재 폴더의 cockpit.json 이다.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, PATH_KEYS } from '../src/config.js';
import { openRuntime, waitForBotMessage } from '../src/runtime.js';

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
  for (const key of [...PATH_KEYS, 'claudePath']) {
    if (!badKeys.has(key) && config[key]) console.log(`✓ ${key} ${config[key]}`);
  }
  if (!errors.length) console.log('✓ 경로 공백 없음');
  return failed || errors.length ? 1 : 0;
}

async function openProject(opt, [project]) {
  if (!project || typeof opt['bot-dir'] !== 'string') {
    console.error('쓰는 법: open-project <과제> --bot-dir <봇 폴더> [--bot-name <이름>]');
    return 1;
  }
  const config = loadOrDie(opt);
  if (!config) return 1;
  const rt = openRuntime(config);
  try {
    const { bot, main, files } = rt.manager.openProject({
      project, botDir: path.resolve(opt['bot-dir']), ...(typeof opt['bot-name'] === 'string' ? { botName: opt['bot-name'] } : {}),
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

const COMMANDS = { check, 'open-project': openProject, chat };

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
