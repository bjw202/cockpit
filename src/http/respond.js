// HTTP 응답 몇 가지 — 길들이 같이 쓴다. 오류는 던지고(HttpError · ChatError) server.js 가 한 곳에서 JSON 으로 옮긴다.

export const JSON_LIMIT_BYTES = 1024 * 1024;

export class HttpError extends Error {
  constructor(status, body) {
    super(body?.error ?? body?.message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

// JSON 본문을 받는 길은 content-type: application/json 만 받는다 (ARCHITECTURE 8절). 객체가 아니면 400
export async function readJson(req, { limit = JSON_LIMIT_BYTES } = {}) {
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) {
    throw new HttpError(415, { error: 'content-type 은 application/json 이어야 합니다' });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, { error: '본문이 너무 큽니다' });
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { value = null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, { error: 'JSON 객체 본문이 필요합니다' });
  return value;
}
