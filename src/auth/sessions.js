// 계정과 쿠키 세션 (ARCHITECTURE 3.2 · 8절 · ADR-005 · 011).
//
// 사람 한 명 = chat.db users 한 줄 + cockpit.db accounts 한 줄. users.username 은 charter 의 PL: 과 글자 그대로 맞대는
// 값이라(결재 대조) 이름 규칙은 minidiscord auth.ts 와 같다. 비밀번호 · 역할은 chat.db 에 두지 않는다 — 봇이 읽는 파일이다.
// 쿠키 이름은 md_session 그대로다 — meta 의 replay.js 가 이 이름으로 싣는다 (prodev scripts/replay.js:18-25 · :85).

import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from './password.js';
import { ChatError } from '../db/chat-db.js';

export const COOKIE_NAME = 'md_session';
export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
export const ROLES = Object.freeze(['admin', 'member']);
export const UNAUTHORIZED = Object.freeze({ status: 401, error: '로그인이 필요합니다' });

// minidiscord server/src/auth.ts:13-18 (핀 6633f7b) — 길이 상한 · 보이지 않는 글자 · 앞뒤 공백
export const USERNAME_MAX_LENGTH = 32;
const USERNAME_FORBIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

export function usernameProblem(username) {
  if (typeof username !== 'string' || username === '') return '이름이 필요합니다';
  if ([...username].length > USERNAME_MAX_LENGTH) return `이름은 ${USERNAME_MAX_LENGTH}자 이하여야 합니다`;
  if (USERNAME_FORBIDDEN.test(username) || username !== username.trim()) return '이름에 제어문자나 앞뒤 공백을 쓸 수 없습니다';
  return null;
}

export function passwordProblem(password) {
  if (typeof password !== 'string' || [...password].length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`;
  return null;
}

// ── 쿠키 ─────────────────────────────────────────────────
export function sessionCookie(token, { secure = false, maxAgeSec = Math.floor(SESSION_TTL_MS / 1000) } = {}) {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}
export const clearSessionCookie = ({ secure = false } = {}) => sessionCookie('', { secure, maxAgeSec: 0 });

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

// ── 계정 ─────────────────────────────────────────────────
// users 와 accounts 는 두 파일이라 SQL 트랜잭션 하나로 못 묶는다. chat.db 트랜잭션을 열어 둔 채 accounts 를 넣고,
// 무엇이든 실패하면 chat.db 를 되돌리고 넣은 accounts 를 지운다 — 둘 다 생기거나 둘 다 안 생긴다.
export async function createAccount({ chatDb, cockpitDb, username, password, role = 'member' }) {
  const bad = usernameProblem(username) ?? passwordProblem(password) ?? (ROLES.includes(role) ? null : `역할은 ${ROLES.join(' · ')} 중 하나다: ${role}`);
  if (bad) throw new ChatError('BAD_INPUT', bad, 400);
  const pwHash = await hashPassword(password);

  let created = null;
  chatDb.db.exec('BEGIN IMMEDIATE');
  try {
    chatDb.db.prepare('INSERT OR IGNORE INTO users (username) VALUES (?)').run(username);
    const user = chatDb.db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
    if (cockpitDb.account(user.id)) throw new ChatError('EXISTS', `계정이 이미 있다: ${username}`, 409);
    cockpitDb.createAccount({ userId: user.id, role, pwHash });
    created = user.id;
    chatDb.db.exec('COMMIT');
    return { id: user.id, username: user.username, role };
  } catch (e) {
    try { chatDb.db.exec('ROLLBACK'); } catch { /* COMMIT 이 이미 끝났다 */ }
    if (created != null) cockpitDb.deleteAccount(created);
    throw e;
  }
}

// 첫 admin — admin 이 이미 있으면 거절한다 (ADR-011)
export async function initAdmin({ chatDb, cockpitDb, username, password }) {
  if (cockpitDb.hasAdmin()) throw new ChatError('ADMIN_EXISTS', 'admin 이 이미 있다 — 계정은 add-user 로 더한다', 409);
  return createAccount({ chatDb, cockpitDb, username, password, role: 'admin' });
}

export function accountByName({ chatDb, cockpitDb }, username) {
  const user = chatDb.db.prepare('SELECT id, username FROM users WHERE username = ?').get(String(username ?? ''));
  const acc = user && cockpitDb.account(user.id);
  return acc ? { id: user.id, username: user.username, role: acc.role, pwHash: acc.pw_hash } : null;
}

export async function setPassword({ cockpitDb }, userId, password) {
  const bad = passwordProblem(password);
  if (bad) throw new ChatError('BAD_INPUT', bad, 400);
  if (!cockpitDb.account(userId)) throw new ChatError('NO_ACCOUNT', '계정을 찾을 수 없습니다', 404);
  cockpitDb.setPasswordHash(userId, await hashPassword(password));
  cockpitDb.deleteWebSessionsOf(userId);   // 비밀번호를 바꾸면 살아 있던 쿠키를 모두 끊는다
}

// ── 세션 ─────────────────────────────────────────────────
// 맞으면 { token, user }, 틀리면 null. 이름이 없을 때도 해시를 한 번 돌려 걸린 시간으로 계정 유무가 새지 않게 한다
const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
export async function login(deps, { username, password }) {
  const acc = accountByName(deps, username);
  const ok = await verifyPassword(String(password ?? ''), acc?.pwHash ?? DUMMY_HASH);
  if (!acc || !ok) return null;
  const token = deps.cockpitDb.createWebSession(acc.id);
  return { token, user: { id: acc.id, username: acc.username, role: acc.role } };
}

// session-token 명령 — 서버 PC 에서만 되는, 비밀번호 없는 발급. meta 가 재생 계정의 토큰을 받는다 (ADR-005)
export function issueToken(deps, username, { ttlMs = SESSION_TTL_MS } = {}) {
  const acc = accountByName(deps, username);
  if (!acc) throw new ChatError('NO_ACCOUNT', `계정이 없다: ${username} — init-admin 이나 add-user 로 먼저 만든다`, 404);
  return deps.cockpitDb.createWebSession(acc.id, { ttlMs });
}

export function userFromToken({ chatDb, cockpitDb }, token, { now = Date.now() } = {}) {
  if (!token) return null;
  const userId = cockpitDb.webSessionUserId(token, { now });
  if (userId == null) return null;
  const acc = cockpitDb.account(userId);
  const user = acc && chatDb.userById(userId);
  return user ? { id: user.id, username: user.username, role: acc.role } : null;
}

// 요청 머리에서 사람을 푼다. 쿠키 md_session 하나만 본다 — Authorization: Bearer 는 받지 않는다 (minidiscord 와 같다)
export function authenticateRequest(deps, headers, { now } = {}) {
  const token = parseCookies(headers?.cookie)[COOKIE_NAME];
  const user = userFromToken(deps, token, { now });
  return user ? { user, token } : { ...UNAUTHORIZED };
}
