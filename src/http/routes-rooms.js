// 방 길 — minidiscord server/src/routes-rooms.ts (핀 6633f7b) 와 같은 모양 (ADR-005 · ARCHITECTURE 8.1 · 8.2).
//   GET  /api/rooms              로그인 — { active:[{id,name,status,created_at,archived_at}], archived:[…] } · id 내림차순 · 모든 사람이 모든 방을 본다
//   POST /api/rooms              admin — (v2) { name: <과제 이름> } → 방 만들기 = 봇 생성 (ARCHITECTURE 4.6 · ADR-017)
//                                201 { id, name, status, created_at, archived_at, project, bot:{id,name} } — minidiscord 생성 응답의 다섯 키 + 둘
//                                400 이름 규칙 · 403 member · 409 같은 이름 · 봇 폴더 있음 · 502 setup 실패 { error, setup_tail } · 500 저장 실패
//   POST /api/rooms/:id/archive  admin — (v2) 그 방이 과제의 방이면 세션을 끄고(끄기와 같은 확인) 방을 archived 로 (ARCHITECTURE 4.6 끝)
//                                200 { ok, id, status:'archived' } · 404 없는 방 · 409 이미 보관 · 409 TASKS_RUNNING(→ ?confirm=1) · 403 member
// 봇 목록 · 방에 봇 배정 길(/api/bots · /api/rooms/:id/bots)은 없다 — 방마다 전용 봇 하나 (R13)

import { HttpError, readJson, sendJson } from './respond.js';
import { createRoom } from '../rooms/create.js';

export function registerRoomRoutes(route, ctx) {
  route('GET', '/api/rooms', () => ctx.chatDb.listRooms());

  route('POST', '/api/rooms', async ({ req, res }) => {
    const { name } = await readJson(req);
    const made = await createRoom(ctx, { project: typeof name === 'string' ? name.trim() : name });
    const room = ctx.chatDb.roomById(made.main.id);
    sendJson(res, 201, { ...room, project: made.project, bot: { id: made.bot.id, name: made.bot.name } });
  }, { auth: 'admin' });

  route('POST', '/api/rooms/:id/archive', async ({ req, url, params }) => {
    req.resume();
    const id = Number(params.id);
    const room = Number.isInteger(id) ? ctx.chatDb.roomById(id) : null;
    if (!room) throw new HttpError(404, { error: '방을 찾을 수 없습니다' });
    if (room.status === 'archived') throw new HttpError(409, { error: '이미 보관된 방입니다' });

    // 과제의 방(본방)이면 세션을 끈다 — 끄기 길과 같은 확인 · 걸린 승인 요청은 거둬 감. 옛 files 방은 세션을 건드리지 않는다
    const project = ctx.manager.projectOfRoom(id);
    const isMain = project != null && ctx.chatDb.projectRooms(project).main?.id === id;
    if (isMain) {
      const tasks = ctx.manager.backgroundTasks(project);
      const confirmed = ['1', 'true', 'yes'].includes(String(url.searchParams.get('confirm') ?? '').toLowerCase());
      if (tasks.length && !confirmed) {
        throw new HttpError(409, { error: `백그라운드 도우미 ${tasks.length}개가 돌고 있습니다 — 확인하려면 confirm=1`, code: 'TASKS_RUNNING', tasks });
      }
      ctx.relay?.cancelProject(project);
      await ctx.manager.stop(project);
    }
    if (!ctx.chatDb.archiveRoom(id)) throw new HttpError(409, { error: '이미 보관된 방입니다' });
    ctx.hub?.publish('room_archived', { project, room: { id, name: room.name } });
    return { ok: true, id, status: 'archived' };
  }, { auth: 'admin' });
}
