// HTTP 서버 — node:http 하나에 길 나누기 · 인증 · 정적 서빙 (ARCHITECTURE 8절 · ADR-010).
//
// 프레임워크 없이 짠다. 길은 표 한 장이고 길마다 인증 수준을 적는다: none · user(로그인) · admin.
// 사람은 쿠키 md_session 하나로 푼다 — Authorization 머리는 보지 않는다 (ADR-005).
// 상태를 바꾸는 요청(GET · HEAD 밖)은 Origin 머리가 있으면 서버 주소와 같아야 한다 (다른 사이트가 쿠키를 싣고 쏘는 것을 막는다).

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticateRequest, UNAUTHORIZED } from '../auth/sessions.js';
import { HttpError, sendJson } from './respond.js';
import { SseHub, connectHub } from './sse.js';
import { registerAuthRoutes } from './routes-auth.js';
import { registerRoomRoutes } from './routes-rooms.js';
import { registerMessageRoutes } from './routes-messages.js';
import { registerPermissionRoutes } from './routes-permissions.js';
import { registerProjectRoutes } from './routes-projects.js';
import { registerFileRoutes } from './routes-files.js';
import { registerSessionRoutes } from './routes-session.js';

export const DEFAULT_WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
};
// 사내망 · CDN 없음 (ADR-010) — 화면은 자기 주소의 것만 싣는다
const CSP = "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

const insideDir = (root, p) => {
  const r = path.relative(root, p);
  return r !== '' && r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r);
};

function serveStatic(req, res, url, webDir) {
  const notFound = () => { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('없는 파일입니다'); };
  req.resume();
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return; }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return notFound(); }
  if (rel.includes('\0')) return notFound();
  if (rel === '/') rel = '/index.html';
  let root; let real;
  try { root = fs.realpathSync(webDir); real = fs.realpathSync(path.join(root, rel)); } catch { return notFound(); }
  // 실경로로 맞댄다 — ../ 도, 안쪽 심볼릭 링크로 밖을 가리키는 것도 여기서 떨어진다
  if (!insideDir(root, real)) return notFound();
  const st = fs.statSync(real);
  if (!st.isFile()) return notFound();
  res.writeHead(200, {
    'content-type': STATIC_TYPES[path.extname(real).toLowerCase()] ?? 'application/octet-stream',
    'content-length': st.size, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'content-security-policy': CSP,
  });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(real).pipe(res);
}

// ctx: { config, chatDb, cockpitDb, manager, relay?, webDir?, hub? } — hub 를 안 주면 여기서 만들고 manager · relay 사건에 잇는다
export function createApp(baseCtx) {
  const ctx = { ...baseCtx, hub: baseCtx.hub ?? new SseHub() };
  if (!baseCtx.hub) connectHub(ctx.hub, ctx);
  const routes = [];
  const route = (method, pattern, handler, { auth = 'user' } = {}) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, handler, auth });
  };
  route('GET', '/api/health', () => ({ ok: true }), { auth: 'none' });
  route('GET', '/api/stream', ({ req, res, url, user, token }) => {
    ctx.hub.subscribe(res, { user, token, lastEventId: req.headers['last-event-id'] ?? url.searchParams.get('lastEventId') });
  });
  registerAuthRoutes(route, ctx);
  registerRoomRoutes(route, ctx);
  registerMessageRoutes(route, ctx);
  registerPermissionRoutes(route, ctx);
  registerProjectRoutes(route, ctx);
  registerFileRoutes(route, ctx);
  registerSessionRoutes(route, ctx);

  const webDir = ctx.webDir ?? DEFAULT_WEB_DIR;
  const secure = !!ctx.config?.tls;

  async function handle(req, res) {
    let url;
    try { url = new URL(req.url, 'http://cockpit.local'); } catch { req.resume(); return sendJson(res, 400, { error: '주소를 읽지 못했습니다' }); }
    try {
      if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url, webDir);

      const matching = routes.filter(r => r.re.test(url.pathname));
      const hit = matching.find(r => r.method === req.method || (req.method === 'HEAD' && r.method === 'GET'));
      if (!hit) throw new HttpError(matching.length ? 405 : 404, { error: matching.length ? '허용하지 않는 메서드입니다' : '없는 길입니다' });
      if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) throw new HttpError(403, { error: '다른 출처의 요청은 받지 않습니다' });

      const auth = authenticateRequest(ctx, req.headers);
      if (hit.auth !== 'none' && !auth.user) throw new HttpError(401, { error: UNAUTHORIZED.error });
      if (hit.auth === 'admin' && auth.user.role !== 'admin') throw new HttpError(403, { error: 'admin 만 할 수 있습니다' });

      const m = hit.re.exec(url.pathname);
      let params;
      try { params = Object.fromEntries(hit.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])); }
      catch { throw new HttpError(400, { error: '주소를 읽지 못했습니다' }); }

      const out = await hit.handler({ req, res, url, params, user: auth.user ?? null, token: auth.token ?? null, secure });
      if (out !== undefined && !res.headersSent) sendJson(res, 200, out);
    } catch (e) {
      req.resume();   // 안 읽은 본문을 흘려보내야 응답이 끊기지 않는다
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof HttpError) return sendJson(res, e.status, e.body);
      if (Number.isInteger(e?.status)) return sendJson(res, e.status, { error: e.message });   // ChatError
      console.error('cockpit http 오류:', e);
      sendJson(res, 500, { error: '서버 오류' });
    }
  }
  handle.hub = ctx.hub;
  return handle;
}

export function createServer(ctx) {
  const handler = createApp(ctx);
  const tls = ctx.config?.tls;
  const server = tls
    ? https.createServer({ cert: fs.readFileSync(tls.cert), key: fs.readFileSync(tls.key) }, handler)
    : http.createServer(handler);
  server.hub = handler.hub;
  server.on('close', () => handler.hub.closeAll());
  return server;
}
