// 프로세스 안 MCP 'cockpit' 의 도구 둘 — 처리기는 순수 함수(DB 와 파일만 안다). SDK 에 붙이는 층은 session/sdk-query.js.
//
// 서명은 채널 플러그인(minidiscord channel/src/channel-server.ts:136-167, 핀 6633f7b)과 같다 (ARCHITECTURE 4.2):
//   reply(chat_id?: string, text: string, files?: string[])
//   fetch_history(chat_id?: string, since_id?: number, since?: string, until?: string, speaker?: string, limit?: number)
// 이름과 매개변수 이름이 계약이다 — prodev 의 pre-reply 훅 matcher 와 tool_input.chat_id · text 가 여기에 묶여 있다.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_BODY_BYTES, MAX_HISTORY_BYTES, MAX_NAME_BYTES, truncateToBudget } from '../envelope/truncate.js';
import { neutralizeEnvelope } from '../envelope/wrap.js';
import { mimeOf } from '../db/chat-db.js';

export const SERVER_NAME = 'cockpit';
export const TOOL_NAMES = Object.freeze({ reply: 'mcp__cockpit__reply', fetch_history: 'mcp__cockpit__fetch_history' });

// 설명 문장도 채널 플러그인 그대로 — 스킬 본문과 봇의 습관이 이 문장을 전제한다
export const TOOL_DEFS = Object.freeze({
  reply: {
    description: '채팅방으로 답변을 보낸다. delivery="to"로 받은 메시지에는 반드시 이 도구로 답한다.',
    params: {
      chat_id: { type: 'string', optional: true, description: '답할 방 번호 — 받은 메시지의 chat_id 값을 그대로 넘긴다' },
      text: { type: 'string', description: '답변 본문' },
      files: { type: 'string[]', optional: true, description: '첨부할 내 PC 로컬 파일 경로 목록 (선택)' },
    },
  },
  fetch_history: {
    description: '채팅 서버에서 이 방의 대화 기록을 가져온다. 멘션 없이 오간 대화를 따라잡거나 컨텍스트를 잃었을 때 맥락을 복구할 때 사용. 결과는 JSON 한 건이고, 다음 요청의 since_id 로는 결과 JSON 의 cursor 필드 값을 그대로 넘긴다.',
    params: {
      chat_id: { type: 'string', optional: true, description: '이력을 볼 방 번호 — 받은 메시지의 chat_id 값을 그대로 넘긴다' },
      since_id: { type: 'number', optional: true, description: '이 id 다음부터 (결과 JSON 의 cursor 필드 값을 넘긴다. 시각보다 이쪽을 쓴다)' },
      since: { type: 'string', optional: true, description: '이후 (ISO 날짜)' },
      until: { type: 'string', optional: true, description: '이전 (ISO 날짜)' },
      speaker: { type: 'string', optional: true, description: '특정 발화자만' },
      limit: { type: 'number', optional: true, description: '최대 개수 (기본 100)' },
    },
  },
});

// 서명 정의 → zod 모양. zod 는 부르는 쪽이 넘긴다 (이 파일은 SDK 도 zod 도 import 하지 않는다)
export function toZodShape(params, z) {
  const shape = {};
  for (const [name, p] of Object.entries(params)) {
    let s = p.type === 'string' ? z.string() : p.type === 'number' ? z.number() : z.array(z.string());
    s = s.describe(p.description);
    shape[name] = p.optional ? s.optional() : s;
  }
  return shape;
}

const ok = text => ({ content: [{ type: 'text', text }] });
const fail = text => ({ content: [{ type: 'text', text }], isError: true });

// bot: { id, name } · rooms: { main, files } (이 과제의 방 둘) · getLastToRoom: () => 방 번호 | null
export function createCockpitTools({ chatDb, bot, rooms, projectsDir, uploadsDir, getLastToRoom = () => null, onBotMessage = () => {} }) {
  // (v2) 이 봇의 방: 본방 하나 + 이관된 옛 files 방(읽기만) — ARCHITECTURE 4.2 ② · ADR-015
  const mine = new Map([rooms.main, rooms.legacy_files].filter(Boolean).map(r => [r.id, r]));

  // 방 번호 세 겹 (minidiscord channel/src/index.ts:25-33): chat_id → 마지막 to 방 → 없음
  const roomOf = chatId => {
    const n = chatId === undefined || chatId === null || chatId === '' ? NaN : Number(chatId);
    return Number.isInteger(n) ? n : getLastToRoom();
  };
  // write: reply 는 제 본방(active)에만 쓴다. 읽기(fetch_history)는 옛 files 방도 된다
  const checkRoom = (roomId, { write = true } = {}) => {
    if (roomId == null) return 'chat_id 가 없고 마지막 to 방도 없다 — 받은 메시지의 chat_id 를 넘겨라';
    if (!mine.has(roomId)) return `방 ${roomId} 은 이 봇의 방이 아니다`;
    const room = chatDb.roomById(roomId);
    if (!room) return `방 ${roomId} 은 없다`;
    if (write && roomId !== rooms.main?.id) return `방 ${roomId} 은 옛 files 방이다 — 읽기만 된다`;
    if (write && room.status !== 'active') return `방 ${roomId} 은 보관됐거나 없다`;
    return null;
  };

  // 봇이 첨부로 넘긴 파일: 과제 폴더 뿌리 안(실경로 대조)만 uploads 로 복사한다. 밖은 조용히 뺀다
  // (minidiscord gateway.ts handleBotMessage 와 같다 — realpath 라서 뿌리 안의 심볼릭 링크로 밖을 끌어오지 못한다)
  function copyIn(files) {
    let root = null;
    try { root = fs.realpathSync(projectsDir); } catch { root = null; }
    const out = [];
    for (const f of Array.isArray(files) ? files : []) {
      try {
        const src = fs.realpathSync(String(f));
        if (!root || !src.startsWith(root + path.sep)) continue;
        const st = fs.statSync(src);
        if (!st.isFile()) continue;
        fs.mkdirSync(uploadsDir, { recursive: true });
        const dest = path.join(uploadsDir, `${randomUUID()}-${path.basename(src)}`);
        fs.copyFileSync(src, dest);
        out.push({ filename: path.basename(src), absPath: dest, size: st.size, mime: mimeOf(src) });
      } catch { /* 없거나 못 읽는 파일은 그 첨부만 건너뛴다 */ }
    }
    return out;
  }

  async function reply(args = {}) {
    const roomId = roomOf(args.chat_id);
    const bad = checkRoom(roomId);
    if (bad) return fail(bad);
    const message = chatDb.insertBotMessage({ roomId, botId: bot.id, body: String(args.text ?? ''), files: copyIn(args.files) });
    onBotMessage(message);
    return ok('sent');
  }

  // 결과는 JSON 한 건: { cursor, messages:[{ id, at, author, body }] } (minidiscord channel/src/index.ts:85-111)
  async function fetchHistory(args = {}) {
    const roomId = roomOf(args.chat_id);
    const bad = checkRoom(roomId);
    if (bad) return fail(bad);
    const rows = chatDb.history({ roomId, sinceId: args.since_id, since: args.since, until: args.until, speaker: args.speaker, limit: args.limit });
    const kept = rows.map(m => ({
      id: m.id,
      at: m.created_at,
      author: truncateToBudget(neutralizeEnvelope(m.author_name), MAX_NAME_BYTES),
      body: truncateToBudget(neutralizeEnvelope(m.body), MAX_BODY_BYTES),
    }));
    const doc = list => JSON.stringify({ cursor: list.length ? Math.max(...list.map(m => m.id)) : null, messages: list });
    // 넘치면 새것부터 버린다. 오래된 것부터 버리면 cursor 가 버린 글을 "지나간 것" 으로 선언해 영구히 사라진다
    while (kept.length > 0 && Buffer.byteLength(doc(kept), 'utf8') > MAX_HISTORY_BYTES) {
      let newest = 0;
      for (let i = 1; i < kept.length; i++) if (kept[i].id > kept[newest].id) newest = i;
      kept.splice(newest, 1);
    }
    return ok(doc(kept));
  }

  return { reply, fetchHistory };
}
