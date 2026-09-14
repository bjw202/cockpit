// 방 길 — minidiscord server/src/routes-rooms.ts (핀 6633f7b) 와 같은 모양 (ADR-005 · ARCHITECTURE 8.1 · 8.2).
//   GET  /api/rooms  로그인 — { active:[{id,name,status,created_at,archived_at}], archived:[…] } · id 내림차순 · 모든 사람이 모든 방을 본다
//   POST /api/rooms  admin — (v2) { name: <과제 이름> } → 방 만들기 = 봇 생성 (ARCHITECTURE 4.6 · ADR-017)
//                    201 { id, name, status, created_at, archived_at, project, bot:{id,name} } — minidiscord 생성 응답의 다섯 키 + 둘
//                    400 이름 규칙 · 403 member · 409 같은 이름 · 봇 폴더 있음 · 502 setup 실패 { error, setup_tail } · 500 저장 실패

import { readJson, sendJson } from './respond.js';
import { createRoom } from '../rooms/create.js';

export function registerRoomRoutes(route, ctx) {
  route('GET', '/api/rooms', () => ctx.chatDb.listRooms());

  route('POST', '/api/rooms', async ({ req, res }) => {
    const { name } = await readJson(req);
    const made = await createRoom(ctx, { project: typeof name === 'string' ? name.trim() : name });
    const room = ctx.chatDb.roomById(made.main.id);
    sendJson(res, 201, { ...room, project: made.project, bot: { id: made.bot.id, name: made.bot.name } });
  }, { auth: 'admin' });
}
