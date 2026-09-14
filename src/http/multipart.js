// multipart 읽기 — Node 에 든 Request.formData() 로 (ADR-010, 의존성 0).
//
// 텍스트 파트는 이름을 가리지 않고 차례로 이어 body 로 (minidiscord routes-messages.ts:55-57 과 같다).
// 파일 파트도 이름을 가리지 않는다. 저장 이름은 <uuid>-<원래 이름> 이고, 원래 이름에서 경로 성분을 벗긴다 (REQ-MSG-007).

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mimeOf } from '../db/chat-db.js';
import { HttpError } from './respond.js';

export const MAX_FILE_BYTES = 100 * 1024 * 1024;   // 파일 하나 상한 (minidiscord 와 같다)
export const MAX_REQUEST_BYTES = 2 * MAX_FILE_BYTES;
const TOO_BIG = Object.freeze({ error: '파일이 너무 큽니다 (파일 하나 100MB 까지)' });

export const isMultipart = req => /^multipart\/form-data\b/i.test(String(req.headers['content-type'] ?? ''));

export function safeFilename(name) {
  const base = path.posix.basename(String(name ?? '').replace(/\\/g, '/'));
  return base && base !== '.' && base !== '..' ? base : 'file';
}

// 돌려주는 것: { body, files:[{ filename, absPath, size, mime }] } — 파일은 이미 uploadsDir 에 쓰였다
export async function readMultipart(req, { uploadsDir, maxRequestBytes = MAX_REQUEST_BYTES, maxFileBytes = MAX_FILE_BYTES }) {
  if (Number(req.headers['content-length']) > maxRequestBytes) throw new HttpError(413, TOO_BIG);

  // content-length 없는 본문(chunked)도 상한을 넘으면 끊는다 — formData() 는 본문을 메모리에 모은다
  let seen = 0;
  let tooBig = false;
  async function* counted() {
    for await (const chunk of req) {
      seen += chunk.length;
      if (seen > maxRequestBytes) { tooBig = true; throw new Error('본문 상한'); }
      yield chunk;
    }
  }
  const request = new Request('http://cockpit.local/', {
    method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: ReadableStream.from(counted()), duplex: 'half',
  });
  let form;
  try { form = await request.formData(); } catch {
    throw tooBig ? new HttpError(413, TOO_BIG) : new HttpError(400, { error: 'multipart 본문을 읽지 못했습니다' });
  }

  let body = '';
  const files = [];
  try {
    for (const [, value] of form.entries()) {
      if (typeof value === 'string') { body += value; continue; }
      if (value.size === 0 && !value.name) continue;   // 고르지 않은 파일 칸
      if (value.size > maxFileBytes) throw new HttpError(413, TOO_BIG);
      const filename = safeFilename(value.name);
      fs.mkdirSync(uploadsDir, { recursive: true });
      const absPath = path.join(uploadsDir, `${randomUUID()}-${filename}`);
      fs.writeFileSync(absPath, Buffer.from(await value.arrayBuffer()));
      files.push({ filename, absPath, size: value.size, mime: mimeOf(filename) });
    }
  } catch (e) {
    for (const f of files) fs.rmSync(f.absPath, { force: true });
    throw e;
  }
  return { body, files };
}
