// 옛 files 방 이관 — v1 판 chat.db 의 prodev-<과제>/files 를 보관으로 돌린다 (ARCHITECTURE 4.7 · ADR-015).
//
// 옮기지도 합치지도 않는다. 글 번호 · room_id 가 바뀌면 카드의 source_msgs · confirmed_at 과 chat.js show 가
// 가리키는 자리가 깨진다. 글 · 첨부 · message_targets · bot_inbox 는 건드리지 않고 rooms.status 만 archived 로.

import { filesRoomName } from '../db/chat-db.js';

// 과제마다 옛 files 방 하나 (없으면 뺀다). status 는 active 또는 archived
export function legacyFilesRooms({ chatDb, cockpitDb }) {
  const out = [];
  for (const row of cockpitDb.agentSessions()) {
    const room = chatDb.roomByName(filesRoomName(row.project));
    if (!room) continue;
    const ids = chatDb.db.prepare('SELECT id FROM messages WHERE room_id = ?').all(room.id).map(r => Number(r.id));
    const attachments = Number(chatDb.db.prepare('SELECT COUNT(*) c FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE room_id = ?)').get(room.id).c);
    const pending = ids.length
      ? Number(cockpitDb.db.prepare(`SELECT COUNT(*) c FROM bot_inbox WHERE delivered_at IS NULL AND message_id IN (${ids.map(() => '?').join(',')})`).get(...ids).c)
      : 0;
    out.push({ project: row.project, room, messages: ids.length, attachments, pending });
  }
  return out;
}

export const describeLegacy = r =>
  `${r.room.name}  id=${r.room.id}  글 ${r.messages}  첨부 ${r.attachments}  큐 미배달 ${r.pending}  → ${r.room.status === 'archived' ? '이미 보관' : '보관'}`;

// 한 트랜잭션. 이미 보관된 방은 건너뛴다 — 두 번 돌려도 같다. 돌려주는 것: 이번에 보관한 수
export function applyMigration({ chatDb, cockpitDb }) {
  const todo = legacyFilesRooms({ chatDb, cockpitDb }).filter(r => r.room.status === 'active');
  chatDb.tx(() => {
    const up = chatDb.db.prepare("UPDATE rooms SET status = 'archived', archived_at = datetime('now') WHERE id = ? AND status = 'active'");
    for (const r of todo) up.run(r.room.id);
  });
  return todo.length;
}

// serve 기동 때 한 줄 — 막지 않는다 (회사 PC 의 v1 과제가 멈추면 안 된다)
export function legacyWarning(ctx) {
  const n = legacyFilesRooms(ctx).filter(r => r.room.status === 'active').length;
  return n ? `! 옛 files 방 ${n} 개 — migrate-v2 --apply 를 돌린다` : null;
}
