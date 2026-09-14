// 방 만들기 = 과제 열기 = 봇 생성 (ARCHITECTURE 4.6 · ADR-017).
//
// POST /api/rooms {name} · POST /api/projects {name, bot_name?, bot_dir?} · CLI open-project 가 이 처리기 하나를 탄다.
//   ⓪ 검사 — 이름 규칙 · 중복(방 · 봇 · agent_sessions · 봇 폴더) · 같은 이름 동시 요청은 잠금 하나로
//   ① setup — prodev setup.js 가 과제 폴더 · 봇 폴더 · 설정 두 장을 만든다 (setup:false 면 건너뛴다 — 스모크 · 옛 봇 이름 재생)
//   ② chat.db 한 트랜잭션: 봇 · 방   ③ cockpit.db: agent_sessions(stopped)   ④ SSE room_created
// 되돌림은 그 요청이 새로 만든 것만, 뒤에서부터. 요청 전에 있던 과제 폴더는 절대 안 지운다.

import fs from 'node:fs';
import path from 'node:path';
import { mainRoomName } from '../db/chat-db.js';
import { ENV_WHITELIST } from '../session/env.js';
import { HttpError } from '../http/respond.js';
import { runSetup as realRunSetup, setupErrorLine } from './setup-runner.js';

export const NAME_MAX = 64;
// 과제 이름은 방 이름의 첫 '/' 앞이다 — '/' 가 들어가면 갈래가 틀어진다
const BAD_PROJECT_CHARS = /[/\\()\s\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
// 봇 이름은 봉투 정규식 @(TO|CC)\(([^()\s]+)\) 에 실려야 한다
const BAD_BOT_CHARS = /[()\s\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

export function projectNameProblem(name) {
  if (typeof name !== 'string' || name === '') return '과제 이름이 필요합니다';
  if ([...name].length > NAME_MAX) return `과제 이름은 ${NAME_MAX}자 이하여야 합니다`;
  if (BAD_PROJECT_CHARS.test(name) || name === '.' || name === '..') return '과제 이름에 / · \\ · 괄호 · 공백 · 제어문자를 쓸 수 없습니다';
  return null;
}

export function botNameProblem(name) {
  if (typeof name !== 'string' || name === '') return '봇 이름이 필요합니다';
  if ([...name].length > NAME_MAX) return `봇 이름은 ${NAME_MAX}자 이하여야 합니다`;
  if (BAD_BOT_CHARS.test(name)) return '봇 이름에 괄호 · 공백 · 제어문자를 쓸 수 없습니다';
  return null;
}

export const defaultBotDir = (config, project) => path.join(config.botsDir, `prodev-${project}-bot`);

// setup 자식 프로세스의 env — 봇 세션과 같은 화이트리스트 + extraEnvKeys. PRODEV_BOT_DIR 은 싣지 않는다 (ARCHITECTURE 5.5)
export function setupEnv(source, { extraKeys = [], platform = process.platform } = {}) {
  const fold = platform === 'win32' ? k => k.toUpperCase() : k => k;
  const allowed = new Set([...ENV_WHITELIST, ...extraKeys].map(fold));
  return Object.fromEntries(Object.entries(source ?? {}).filter(([k, v]) => v !== undefined && allowed.has(fold(k))));
}

// 같은 저장소(chat.db 연결)에서 만드는 중인 과제 이름 — 같은 이름의 둘째 요청은 409
const building = new WeakMap();

// ctx: { config, configFile, chatDb, cockpitDb, manager?, hub?, runSetup? }. 돌려주는 것: { bot, main, project, botDir }
export async function createRoom(ctx, { project, botName, botDir, setup = true }) {
  const { config, chatDb, cockpitDb } = ctx;
  const bad = projectNameProblem(project)
    ?? (String(project).startsWith('prodev-') ? '과제 이름만 주세요 — prodev- 는 붙이지 않습니다' : null)
    ?? (botName === undefined ? null : botNameProblem(botName));
  if (bad) throw new HttpError(400, { error: bad });
  const name = botName ?? `prodev-${project}-bot`;
  const dir = path.resolve(botDir ?? defaultBotDir(config, project));
  const projectDir = path.join(config.projectsDir, project);

  if (!building.has(chatDb)) building.set(chatDb, new Set());
  const held = building.get(chatDb);
  if (held.has(project)) throw new HttpError(409, { error: `과제를 만드는 중입니다: ${project}` });
  held.add(project);
  try {
    if (cockpitDb.agentSession(project) || chatDb.roomByName(mainRoomName(project))) throw new HttpError(409, { error: `과제가 이미 있습니다: ${project}` });
    if (chatDb.botByName(name)) throw new HttpError(409, { error: `봇이 이미 있습니다: ${name}` });
    if (setup && fs.existsSync(dir)) throw new HttpError(409, { error: `봇 폴더가 이미 있습니다: ${dir}` });

    const had = { [dir]: fs.existsSync(dir), [projectDir]: fs.existsSync(projectDir) };
    // 요청이 새로 만든 폴더만 지운다. 지우기가 실패한 경로는 left 로 알린다 — 사람이 치운다
    const undoFolders = () => {
      if (!setup) return [];
      const left = [];
      for (const p of [dir, projectDir]) {
        if (had[p] || !fs.existsSync(p)) continue;
        try { fs.rmSync(p, { recursive: true, force: true }); } catch { left.push(p); }
      }
      if (left.length) console.error(`cockpit 방 만들기 되돌림 — 못 지운 자리: ${left.join(' · ')}`);
      return left;
    };
    const withLeft = (body, left) => (left.length ? { ...body, left } : body);

    if (setup) {
      const run = ctx.runSetup ?? realRunSetup;
      const out = ctx.configFile
        ? await run({
          project, botDir: dir, projectDir, prodevDir: config.prodevDir ?? path.dirname(config.botsDir), configFile: ctx.configFile,
          env: setupEnv(ctx.manager?.processEnv ?? process.env, { extraKeys: config.extraEnvKeys ?? [] }),
        })
        : { code: 1, tail: ['설정 파일 경로를 모른다 — setup.js --cockpit 에 넘길 것이 없다'] };
      const made = fs.existsSync(path.join(dir, '.claude', 'settings.local.json'));
      if (out.code !== 0 || !made) {
        const first = out.code !== 0 ? setupErrorLine(out.tail) : `settings.local.json 이 안 생겼다: ${dir}`;
        throw new HttpError(502, withLeft({ error: `setup 실패: ${first}`, setup_tail: out.tail ?? [] }, undoFolders()));
      }
    }

    let opened;
    try {
      opened = chatDb.openProject(project, name);
    } catch (e) {
      const left = undoFolders();
      if (e?.status === 409) throw new HttpError(409, withLeft({ error: e.message }, left));
      throw new HttpError(500, withLeft({ error: `저장 실패: ${String(e?.message ?? e).split('\n')[0]}` }, left));
    }
    try {
      cockpitDb.createAgentSession({ project, botId: opened.bot.id, botDir: dir });
    } catch (e) {
      try { chatDb.removeOpened(opened); } catch (e2) { console.error(`cockpit 방 만들기 되돌림 — chat.db 행을 못 지웠다: ${e2.message}`); }
      throw new HttpError(500, withLeft({ error: `저장 실패: ${String(e?.message ?? e).split('\n')[0]}` }, undoFolders()));
    }
    ctx.hub?.publish('room_created', { project, room: { id: opened.main.id, name: opened.main.name }, bot: { id: opened.bot.id, name: opened.bot.name } });
    return { ...opened, project, botDir: dir };
  } finally {
    held.delete(project);
  }
}
