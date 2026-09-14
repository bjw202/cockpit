// 계정 길 — 로그인 · 로그아웃 · 나 · 계정 관리(admin) (ARCHITECTURE 8.2).

import { COOKIE_NAME, clearSessionCookie, createAccount, login, parseCookies, sessionCookie, setPassword } from '../auth/sessions.js';
import { HttpError, readJson, sendJson } from './respond.js';

export function registerAuthRoutes(route, ctx) {
  route('POST', '/api/auth/login', async ({ req, res, secure }) => {
    const { username, password } = await readJson(req);
    const ok = await login(ctx, { username, password });
    if (!ok) throw new HttpError(401, { error: '이름이나 비밀번호가 맞지 않습니다' });
    res.setHeader('set-cookie', sessionCookie(ok.token, { secure }));
    return { ok: true, user: ok.user };
  }, { auth: 'none' });

  // 쿠키가 틀렸거나 만료돼도 지우기는 한다 — 그래서 인증 없이 받는다
  route('POST', '/api/auth/logout', ({ req, res, secure }) => {
    req.resume();
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (token) {
      ctx.cockpitDb.deleteWebSession(token);
      ctx.hub?.closeToken(token);
    }
    res.setHeader('set-cookie', clearSessionCookie({ secure }));
    return { ok: true };
  }, { auth: 'none' });

  route('GET', '/api/auth/me', ({ user }) => user);

  route('GET', '/api/accounts', () => ({
    accounts: ctx.cockpitDb.accounts().map(a => ({
      id: a.user_id, username: ctx.chatDb.userById(a.user_id)?.username ?? null, role: a.role, created_at: a.created_at,
    })),
  }), { auth: 'admin' });

  route('POST', '/api/accounts', async ({ req, res }) => {
    const { username, password, role = 'member' } = await readJson(req);
    sendJson(res, 201, await createAccount({ chatDb: ctx.chatDb, cockpitDb: ctx.cockpitDb, username, password, role }));
  }, { auth: 'admin' });

  route('POST', '/api/accounts/:id/password', async ({ req, params }) => {
    const { password } = await readJson(req);
    await setPassword(ctx, Number(params.id), password);
    return { ok: true };
  }, { auth: 'admin' });
}
