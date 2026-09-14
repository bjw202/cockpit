// 방 목록 — minidiscord server/src/routes-rooms.ts:12-20 (핀 6633f7b) 와 같은 모양 (ADR-005).
//   GET /api/rooms → { active:[{id,name,status,created_at,archived_at}], archived:[…] } · id 내림차순 · 모든 사람이 모든 방을 본다
// cockpit 에서 방을 만드는 길은 과제 열기(POST /api/projects) 하나다.

export function registerRoomRoutes(route, ctx) {
  route('GET', '/api/rooms', () => ctx.chatDb.listRooms());
}
