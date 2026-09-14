// 과제 길 (ARCHITECTURE 8.2 · 5.2).
//   GET  /api/projects   로그인 — { projects:[{ name, bot:{id,name}, rooms:{ main:{id,name}, files:{id,name} },
//                                   session:{ state, session_id, cost_usd, last_result_at, model, context_pct } }] }
//                        admin 에게만 bot_dir · bot_dir_exists 를 싣는다 (서버 경로다)
//   POST /api/projects   admin — { name, bot_name?, bot_dir? } → 201 같은 모양 · 봇 한 줄 · 방 둘 · agent_sessions 한 줄(stopped) · 같은 이름 409
// 봇 폴더는 prodev setup.js --project 가 만든다. 여기서는 자리만 적는다 — 기본 <botsDir>/prodev-<과제>-bot.
// 봇 이름 기본은 prodev-<과제>-bot, 옛 대본은 prodev-worktogether-비서 꼴이라 bot_name 으로 준다 (meta D0 Q6).

import fs from 'node:fs';
import path from 'node:path';
import { HttpError, readJson, sendJson } from './respond.js';

export const NAME_MAX = 64;
export const EVENTS_LIMIT = 500;
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

export function projectView(ctx, row, { admin = false } = {}) {
  const { main, files } = ctx.chatDb.projectRooms(row.project);
  const pick = r => (r ? { id: r.id, name: r.name } : null);
  const bot = ctx.chatDb.botById(row.bot_id);
  const { model, context_pct } = ctx.manager.sessionInfo(row.project);
  return {
    name: row.project,
    bot: bot ? { id: bot.id, name: bot.name } : null,
    rooms: { main: pick(main), files: pick(files) },
    session: {
      state: ctx.manager.state(row.project) ?? row.state, session_id: row.session_id, cost_usd: row.cost_usd,
      last_result_at: row.last_result_at, model, context_pct,   // session_events 의 마지막 init(model) · context(percentage) — M3.1
    },
    ...(admin ? { bot_dir: row.bot_dir, bot_dir_exists: fs.existsSync(row.bot_dir) } : {}),
  };
}

export function registerProjectRoutes(route, ctx) {
  route('GET', '/api/projects', ({ user }) => ({
    projects: ctx.cockpitDb.agentSessions().map(row => projectView(ctx, row, { admin: user.role === 'admin' })),
  }));

  // 조종석 판 되그리기 — session_events 오름차순 최대 EVENTS_LIMIT. 더 있으면 마지막 id 를 after 로 다시 부른다
  route('GET', '/api/projects/:name/events', ({ url, params }) => {
    if (!ctx.cockpitDb.agentSession(params.name)) throw new HttpError(404, { error: `과제가 없습니다: ${params.name}` });
    const after = Number(url.searchParams.get('after'));
    const rows = ctx.cockpitDb.eventsAfter(params.name, Number.isFinite(after) && after > 0 ? after : 0, EVENTS_LIMIT);
    return { events: rows.map(r => ({ id: r.id, at: r.at, type: r.type, data: r.data })) };
  });

  route('POST', '/api/projects', async ({ req, res }) => {
    const { name, bot_name: botName, bot_dir: botDirIn } = await readJson(req);
    const bad = projectNameProblem(name) ?? (botName === undefined ? null : botNameProblem(botName));
    if (bad) throw new HttpError(400, { error: bad });

    let botDir = defaultBotDir(ctx.config, name);
    if (botDirIn !== undefined) {
      if (typeof botDirIn !== 'string' || !path.isAbsolute(botDirIn)) throw new HttpError(400, { error: '봇 폴더는 절대 경로여야 합니다' });
      const r = path.relative(path.resolve(ctx.config.botsDir), path.resolve(botDirIn));
      if (r === '' || r === '..' || r.startsWith(`..${path.sep}`) || path.isAbsolute(r)) throw new HttpError(400, { error: '봇 폴더는 botsDir 안이어야 합니다' });
      botDir = path.resolve(botDirIn);
    }
    if (ctx.cockpitDb.agentSession(name)) throw new HttpError(409, { error: `과제가 이미 있습니다: ${name}` });

    ctx.manager.openProject({ project: name, botDir, ...(botName ? { botName } : {}) });   // 방 · 봇 이름이 이미 있으면 ChatError 409, 행을 안 남긴다
    ctx.hub?.publish('project_opened', { project: name });
    sendJson(res, 201, projectView(ctx, ctx.cockpitDb.agentSession(name), { admin: true }));
  }, { auth: 'admin' });
}
