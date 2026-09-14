import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ChatDb } from '../src/db/chat-db.js';
import { CockpitDb } from '../src/db/cockpit-db.js';
import { hashPassword, verifyPassword, SCRYPT } from '../src/auth/password.js';
import {
  COOKIE_NAME, sessionCookie, clearSessionCookie, createAccount, initAdmin, login, issueToken, authenticateRequest,
} from '../src/auth/sessions.js';
import { httpWorld } from './fakes/http-world.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'bin', 'cockpit.js');

function world() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-auth-')));
  const config = {};
  for (const k of ['botsDir', 'projectsDir', 'uploadsDir', 'dataDir']) {
    config[k] = path.join(dir, k);
    fs.mkdirSync(config[k], { recursive: true });
  }
  const configFile = path.join(dir, 'cockpit.json');
  fs.writeFileSync(configFile, JSON.stringify(config));
  const open = () => ({ chatDb: new ChatDb(path.join(config.dataDir, 'chat.db')), cockpitDb: new CockpitDb(path.join(config.dataDir, 'cockpit.db')) });
  return { dir, config, configFile, open };
}
const cli = (w, args, input) => spawnSync(process.execPath, [CLI, ...args, '--config', w.configFile], { input, encoding: 'utf8' });

test('scrypt 저장 꼴 scrypt$N$r$p$소금$해시', async () => {
  const stored = await hashPassword('비밀번호는여덟자');
  const parts = stored.split('$');
  assert.equal(parts.length, 6);
  assert.deepEqual(parts.slice(0, 4), ['scrypt', String(SCRYPT.N), String(SCRYPT.r), String(SCRYPT.p)]);
  assert.equal(Buffer.from(parts[4], 'base64').length, 16);
  assert.equal(Buffer.from(parts[5], 'base64').length, 64);
  assert.notEqual(await hashPassword('비밀번호는여덟자'), stored, '소금이 매번 다르다');
  assert.equal(await verifyPassword('비밀번호는여덟자', stored), true);
});

test('틀린 비밀번호 거절(timingSafeEqual)', async () => {
  const stored = await hashPassword('correct-horse');
  assert.equal(await verifyPassword('correct-hors', stored), false);
  assert.equal(await verifyPassword('', stored), false);
  assert.equal(await verifyPassword('correct-horse', 'scrypt$어그러짐'), false, '어그러진 저장값은 오류가 아니라 거절');
  assert.match(fs.readFileSync(path.join(REPO, 'src', 'auth', 'password.js'), 'utf8'), /timingSafeEqual\(got, want\)/);

  const w = world(); const deps = w.open();
  await createAccount({ ...deps, username: '김과제', password: 'correct-horse' });
  assert.equal(await login(deps, { username: '김과제', password: 'wrong-horse!' }), null);
  assert.equal(await login(deps, { username: '없는사람', password: 'correct-horse' }), null);
  const ok = await login(deps, { username: '김과제', password: 'correct-horse' });
  assert.deepEqual(ok.user, { id: 1, username: '김과제', role: 'member' });
});

test('쿠키는 HttpOnly · SameSite=Lax · Path=/', () => {
  const attrs = sessionCookie('abc').split(';').map(s => s.trim());
  assert.equal(attrs[0], `${COOKIE_NAME}=abc`);
  assert.equal(COOKIE_NAME, 'md_session');
  for (const a of ['HttpOnly', 'SameSite=Lax', 'Path=/']) assert.ok(attrs.includes(a), `${a} 가 없다: ${attrs}`);
  assert.ok(!attrs.includes('Secure'));
  assert.ok(sessionCookie('abc', { secure: true }).split('; ').includes('Secure'), 'tls 면 Secure');
  assert.match(clearSessionCookie(), /^md_session=; .*Max-Age=0/);
});

test('만료된 세션은 401', async () => {
  const w = world(); const deps = w.open();
  const acc = await createAccount({ ...deps, username: '김과제', password: 'correct-horse' });
  const t0 = Date.now();
  const token = deps.cockpitDb.createWebSession(acc.id, { ttlMs: 60_000, now: t0 });
  const headers = { cookie: `other=1; md_session=${token}` };
  assert.deepEqual(authenticateRequest(deps, headers, { now: t0 + 59_000 }).user, { id: acc.id, username: '김과제', role: 'member' });
  const expired = authenticateRequest(deps, headers, { now: t0 + 61_000 });
  assert.equal(expired.status, 401);
  assert.equal(expired.user, undefined);
  assert.equal(authenticateRequest(deps, { authorization: `Bearer ${token}` }, { now: t0 }).status, 401, 'Bearer 는 받지 않는다');
  assert.equal(authenticateRequest(deps, {}, { now: t0 }).status, 401);
});

test('init-admin 은 admin 이 있으면 거절', async () => {
  const w = world();
  const first = cli(w, ['init-admin', '김피엘'], 'pl-password-1\n');
  assert.equal(first.status, 0, first.stderr);
  const second = cli(w, ['init-admin', '박피엘'], 'pl-password-2\n');
  assert.equal(second.status, 1);
  assert.match(second.stderr, /admin 이 이미 있다/);

  const deps = w.open();
  assert.deepEqual(deps.chatDb.db.prepare('SELECT username FROM users ORDER BY id').all().map(r => r.username), ['김피엘']);
  assert.ok(await login(deps, { username: '김피엘', password: 'pl-password-1' }), '파이프로 준 첫 줄이 비밀번호');
  await assert.rejects(() => initAdmin({ ...deps, username: '박피엘', password: 'pl-password-2' }), e => e.status === 409);
});

test('users.username 과 accounts 가 한 트랜잭션으로 생긴다', async () => {
  const w = world(); const deps = w.open();
  const acc = await createAccount({ ...deps, username: '김과제', password: 'correct-horse', role: 'member' });
  assert.equal(deps.chatDb.userById(acc.id).username, '김과제');
  assert.equal(deps.cockpitDb.account(acc.id).role, 'member');

  // accounts 쓰기에서 죽으면 users 줄도 안 남는다
  const real = deps.cockpitDb.createAccount.bind(deps.cockpitDb);
  deps.cockpitDb.createAccount = () => { throw new Error('디스크가 찼다'); };
  await assert.rejects(() => createAccount({ ...deps, username: '박과제', password: 'correct-horse' }), /디스크가 찼다/);
  deps.cockpitDb.createAccount = real;
  assert.equal(deps.chatDb.db.prepare("SELECT COUNT(*) AS n FROM users WHERE username = '박과제'").get().n, 0);

  // 같은 이름을 다시 만들면 409, 줄은 그대로
  await assert.rejects(() => createAccount({ ...deps, username: '김과제', password: 'correct-horse' }), e => e.status === 409);
  assert.equal(deps.cockpitDb.accounts().length, 1);
  // 이름 규칙은 minidiscord 와 같다
  await assert.rejects(() => createAccount({ ...deps, username: ' 김과제', password: 'correct-horse' }), e => e.status === 400);
  await assert.rejects(() => createAccount({ ...deps, username: '새사람', password: 'short' }), e => e.status === 400);
});

test('session-token 이 낸 값으로 GET /api/rooms 200', async t => {
  const w = await httpWorld();
  t.after(() => w.close());
  await createAccount({ chatDb: w.chatDb, cockpitDb: w.cockpitDb, username: '김피엘', password: 'pl-password-1', role: 'admin' });
  const token = execFileSync(process.execPath, [CLI, 'session-token', '김피엘', '--config', w.configFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const rooms = await fetch(`${w.base}/api/rooms`, { headers: { cookie: `md_session=${token}` } });
  assert.equal(rooms.status, 200);
  assert.deepEqual(Object.keys(await rooms.json()), ['active', 'archived']);

  // 브라우저 길도 같은 쿠키다: 로그인 → 나 → 로그아웃 → 401
  const bad = await fetch(`${w.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: '김피엘', password: 'wrong-password' }) });
  assert.equal(bad.status, 401);
  const login = await fetch(`${w.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: '김피엘', password: 'pl-password-1' }) });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /^md_session=[0-9a-f]{64}; HttpOnly; SameSite=Lax; Path=\//);
  const cookie = setCookie.split(';')[0];
  assert.deepEqual(await (await fetch(`${w.base}/api/auth/me`, { headers: { cookie } })).json(), { id: 1, username: '김피엘', role: 'admin' });
  const out = await fetch(`${w.base}/api/auth/logout`, { method: 'POST', headers: { cookie } });
  assert.match(out.headers.get('set-cookie'), /^md_session=; .*Max-Age=0/);
  assert.equal((await fetch(`${w.base}/api/auth/me`, { headers: { cookie } })).status, 401);
  assert.equal((await fetch(`${w.base}/api/rooms`, { headers: { cookie: `md_session=${token}` } })).status, 200, '다른 세션은 그대로');
});

test('session-token 은 계정이 있어야 낸다 — 한 줄 · 쿠키로 풀린다', async () => {
  const w = world();
  assert.equal(cli(w, ['add-user', '김과제'], 'member-pass\n').status, 0);
  const out = execFileSync(process.execPath, [CLI, 'session-token', '김과제', '--config', w.configFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const token = out.trim();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(out, `${token}\n`);
  const deps = w.open();
  assert.equal(authenticateRequest(deps, { cookie: `md_session=${token}` }).user.username, '김과제');
  const none = cli(w, ['session-token', '없는사람']);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /계정이 없다/);
  assert.throws(() => issueToken(deps, '없는사람'), e => e.status === 404);
});
