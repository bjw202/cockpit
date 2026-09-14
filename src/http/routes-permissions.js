// 승인 길 (ARCHITECTURE 8.2 · 6절).
//   GET  /api/permissions?pending=1        로그인 — 걸린 요청 목록(카드 되그리기). pending 이 없으면 최근 100
//   POST /api/permissions/:toolUseId       { decision:'allow'|'allow_session'|'deny', reason? } → 200 · 400 · 403 member · 404 · 409 이미 답

import { requestView } from '../permissions/relay.js';
import { readJson } from './respond.js';

const REASON_CHARS = 500;

export function registerPermissionRoutes(route, ctx) {
  route('GET', '/api/permissions', ({ url }) => {
    const rows = url.searchParams.get('pending') === '1' ? ctx.cockpitDb.pendingPermissions() : ctx.cockpitDb.recentPermissions(100);
    return { requests: rows.map(requestView) };
  });

  route('POST', '/api/permissions/:toolUseId', async ({ req, params, user }) => {
    const { decision, reason } = await readJson(req);
    return ctx.relay.answer(params.toolUseId, {
      decision, user, reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, REASON_CHARS) : undefined,
    });
  });
}
