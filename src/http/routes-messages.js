// 글 길 셋 + 받기 하나 — minidiscord server/src/routes-messages.ts (핀 6633f7b) 와 같은 모양 (ADR-005 · ARCHITECTURE 8.1).
// meta 의 prodev/scripts/replay.js 가 고치지 않고 이 길로 돈다. 계약 시험: test/contract/replay-js.test.js
//
//   POST /api/rooms/:id/messages   multipart 만. 방 검사(404 · 409)를 본문을 읽기 전에 → 406 → 빈 글 · 모르는 봇 400
//                                  → { ok:true, message:{ id, room_id, author_type, author_user_id, author_bot_id, body, created_at, author_name, attachments:[{id,filename}] } }
//   GET  /api/rooms/:id/messages?after=N   { messages:[…] } id 오름차순 최대 200. 방을 찾지 않는다 — 없는 방은 빈 배열
//   GET  /api/attachments/:id      파일 · content-disposition filename* · 업로드 폴더 밖이면 404
// stored_path 는 어느 응답에도 싣지 않는다 (sync-audit F-02).

import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './respond.js';
import { isMultipart, readMultipart } from './multipart.js';

// Fastify 가 multipart 아닌 본문에 내는 봉투 그대로 (@fastify/multipart FST_INVALID_MULTIPART_CONTENT_TYPE)
const NOT_MULTIPART = Object.freeze({ statusCode: 406, code: 'FST_INVALID_MULTIPART_CONTENT_TYPE', error: 'Not Acceptable', message: 'the request is not multipart' });
const NO_FILE = Object.freeze({ message: '파일을 찾을 수 없습니다' });

export function registerMessageRoutes(route, ctx) {
  const { chatDb, manager, config } = ctx;

  route('POST', '/api/rooms/:id/messages', async ({ req, params, user }) => {
    const roomId = Number(params.id);
    const room = Number.isInteger(roomId) ? chatDb.roomById(roomId) : null;
    if (!room) throw new HttpError(404, { error: '방을 찾을 수 없습니다' });
    if (room.status === 'archived') throw new HttpError(409, { error: '보관된 방에는 메시지를 보낼 수 없습니다' });
    if (!isMultipart(req)) throw new HttpError(406, NOT_MULTIPART);

    const { body, files } = await readMultipart(req, { uploadsDir: config.uploadsDir });
    try {
      // 글 · 첨부 · 대상은 chat.db 한 트랜잭션, 큐는 그 뒤 cockpit.db. SSE 와 큐 풀기는 세션 관리자의 message 사건이 잇는다
      return { ok: true, message: manager.postUserMessage({ roomId, userId: user.id, body, files }) };
    } catch (e) {
      for (const f of files) fs.rmSync(f.absPath, { force: true });   // 거절된 글의 첨부는 남기지 않는다
      throw e;
    }
  });

  route('GET', '/api/rooms/:id/messages', ({ url, params }) => {
    const raw = url.searchParams.get('after');
    const after = raw === null ? 0 : Number(raw);
    const roomId = Number(params.id);
    if (!Number.isFinite(after) || !Number.isInteger(roomId)) return { messages: [] };
    return { messages: chatDb.messagesAfter(roomId, after) };
  });

  route('GET', '/api/attachments/:id', ({ req, res, params }) => {
    const att = chatDb.attachmentById(Number(params.id));
    if (!att) throw new HttpError(404, NO_FILE);
    // 읽을 때도 봉인 — 풀린 절대 경로가 업로드 폴더 아래가 아니면 열지 않는다 (minidiscord REQ-MSG-009)
    const abs = chatDb.resolveStored(att.stored_path);
    if (!abs.startsWith(path.resolve(config.uploadsDir) + path.sep) || !fs.existsSync(abs)) throw new HttpError(404, NO_FILE);
    res.writeHead(200, {
      'content-type': att.mime,
      'content-length': fs.statSync(abs).size,
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(abs).pipe(res);
  });
}
