// 과제 길 (ARCHITECTURE 8.2 · 5.2).
//   GET  /api/projects   로그인 — { projects:[{ name, bot:{id,name}, rooms:{ main:{id,name}, legacy_files:{id,name}|null },
//                                   session:{ state, session_id, cost_usd, last_result_at, model, context_pct } }] }
//                        admin 에게만 bot_dir · bot_dir_exists 를 싣는다 (서버 경로다)
//   POST /api/projects   admin — { name, bot_name?, bot_dir? } → (v2) POST /api/rooms 와 같은 처리기(src/rooms/create.js, ARCHITECTURE 4.6)
//                        201 아래 과제 모양 · 400 이름 규칙 · bot_dir 이 botsDir 밖 · 409 같은 이름 · 502 setup 실패 · 500 저장 실패
// 봇 이름 기본은 prodev-<과제>-bot, 옛 대본은 prodev-worktogether-비서 꼴이라 bot_name 으로 준다 (meta D0 Q6).

import fs from 'node:fs';
import path from 'node:path';
import { HttpError, readJson, sendJson } from './respond.js';
import { createRoom, botNameProblem, defaultBotDir, projectNameProblem, NAME_MAX } from '../rooms/create.js';

// 이름 규칙은 방 만들기 처리기로 옮겼다 — CLI 와 옛 import 자리를 위해 다시 내보낸다
export { botNameProblem, defaultBotDir, projectNameProblem, NAME_MAX };
export const EVENTS_LIMIT = 500;

export function projectView(ctx, row, { admin = false } = {}) {
  const { main, legacy_files: legacy } = ctx.chatDb.projectRooms(row.project);
  const pick = r => (r ? { id: r.id, name: r.name } : null);
  const bot = ctx.chatDb.botById(row.bot_id);
  const { model, context_pct } = ctx.manager.sessionInfo(row.project);
  return {
    name: row.project,
    bot: bot ? { id: bot.id, name: bot.name } : null,
    rooms: { main: pick(main), legacy_files: pick(legacy) },   // (v2) 방 하나 + 이관된 옛 files 방 (ADR-015)
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

    let botDir;
    if (botDirIn !== undefined) {
      if (typeof botDirIn !== 'string' || !path.isAbsolute(botDirIn)) throw new HttpError(400, { error: '봇 폴더는 절대 경로여야 합니다' });
      const r = path.relative(path.resolve(ctx.config.botsDir), path.resolve(botDirIn));
      if (r === '' || r === '..' || r.startsWith(`..${path.sep}`) || path.isAbsolute(r)) throw new HttpError(400, { error: '봇 폴더는 botsDir 안이어야 합니다' });
      botDir = path.resolve(botDirIn);
    }
    await createRoom(ctx, { project: name, ...(botName ? { botName } : {}), ...(botDir ? { botDir } : {}) });
    sendJson(res, 201, projectView(ctx, ctx.cockpitDb.agentSession(name), { admin: true }));
  }, { auth: 'admin' });
}
