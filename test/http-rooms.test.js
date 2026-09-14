import { test } from 'node:test';
import { CAN_SYMLINK } from './fakes/platform.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { httpWorld } from './fakes/http-world.js';

async function world(t, opts) {
  const w = await httpWorld(opts);
  t.after(() => w.close());
  await w.user('김피엘', 'admin');
  await w.user('김과제');
  return { w, ...w.open() };
}
const form = (body, files = []) => {
  const fd = new FormData();
  fd.append('body', body);
  for (const [name, text] of files) fd.append('files', new Blob([text]), name);
  return fd;
};
const post = (w, as, roomId, fd) => w.json(as, `/api/rooms/${roomId}/messages`, { method: 'POST', body: fd });

test('쿠키 없으면 401', async t => {
  const { w, main } = await world(t);
  const rooms = await w.json(null, '/api/rooms');
  assert.equal(rooms.status, 401);
  assert.deepEqual(rooms.body, { error: '로그인이 필요합니다' });
  assert.equal((await post(w, null, main.id, form('안녕'))).status, 401);
  assert.equal((await w.json(null, `/api/rooms/${main.id}/messages?after=0`)).status, 401);
  assert.equal((await w.json('deadbeef', '/api/rooms')).status, 401, '틀린 쿠키');
  assert.equal(w.chatDb.messagesAfter(main.id, 0).length, 0);
});

test('Authorization Bearer 만 있으면 401', async t => {
  const { w } = await world(t);
  const bearer = await w.json(null, '/api/rooms', { headers: { authorization: `Bearer ${w.tokens['김과제']}` } });
  assert.equal(bearer.status, 401);
  assert.equal((await w.json('김과제', '/api/rooms')).status, 200, '같은 값을 쿠키로 주면 200');
});

test('JSON 본문 POST 는 406', async t => {
  const { w, main } = await world(t);
  const r = await w.json('김과제', `/api/rooms/${main.id}/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: '안녕' }),
  });
  assert.equal(r.status, 406);
  assert.equal(r.body.message, 'the request is not multipart');
  assert.equal(w.chatDb.messagesAfter(main.id, 0).length, 0);
});

test('GET /api/rooms 는 {active, archived}', async t => {
  const { w, main } = await world(t);
  const second = w.open("둘째").main;   // (v2) 과제 하나 = 방 하나 — 순서를 보려고 과제를 하나 더 연다
  const old = w.chatDb.createRoom('prodev-옛과제');
  w.chatDb.db.prepare("UPDATE rooms SET status = 'archived', archived_at = datetime('now') WHERE id = ?").run(old.id);
  const r = await w.json('김과제', '/api/rooms');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), ['active', 'archived']);
  assert.deepEqual(r.body.active.map(x => x.name), [second.name, main.name], 'id 내림차순 (minidiscord 와 같다)');
  assert.deepEqual(r.body.archived.map(x => x.name), ['prodev-옛과제']);
  for (const room of [...r.body.active, ...r.body.archived]) {
    assert.deepEqual(Object.keys(room), ['id', 'name', 'status', 'created_at', 'archived_at']);
  }
});

test('POST 는 {ok, message:{id,…,author_name,attachments[{id,filename}]}}', async t => {
  const { w, bot, main } = await world(t);
  const r = await post(w, '김과제', main.id, form(`@TO(${bot.name}) 성적서입니다`, [['성적서 9월.csv', 'lot,yield\nA,91\n']]));
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), ['ok', 'message']);
  assert.equal(r.body.ok, true);
  const m = r.body.message;
  assert.deepEqual(Object.keys(m), ['id', 'room_id', 'author_type', 'author_user_id', 'author_bot_id', 'body', 'created_at', 'author_name', 'attachments']);
  assert.equal(m.room_id, main.id);
  assert.equal(m.author_type, 'user');
  assert.equal(m.author_bot_id, null);
  assert.equal(m.author_name, '김과제');
  assert.equal(m.body, `@TO(${bot.name}) 성적서입니다`);
  assert.deepEqual(m.attachments.map(a => Object.keys(a)), [['id', 'filename']]);
  assert.equal(m.attachments[0].filename, '성적서 9월.csv');

  const [att] = w.chatDb.attachmentsOf(m.id);
  assert.ok(att.path.startsWith(w.config.uploadsDir + path.sep), '업로드 폴더 안에 쓴다');
  assert.equal(fs.readFileSync(att.path, 'utf8'), 'lot,yield\nA,91\n');
  assert.equal(att.mime, 'text/csv');
  assert.deepEqual(w.cockpitDb.pendingInbox(bot.id).map(x => [x.message_id, x.delivery]), [[m.id, 'to']], '봉투대로 큐에');
});

test('?after=N 오름차순 최대 200', async t => {
  const { w, main } = await world(t);
  const u = w.chatDb.ensureUser('김과제');
  const ins = w.chatDb.db.prepare("INSERT INTO messages (room_id, author_type, author_user_id, body) VALUES (?, 'user', ?, ?)");
  for (let i = 0; i < 205; i++) ins.run(main.id, u.id, `글 ${i}`);

  const first = await w.json('김과제', `/api/rooms/${main.id}/messages?after=0`);
  assert.deepEqual(Object.keys(first.body), ['messages']);
  const ids = first.body.messages.map(m => m.id);
  assert.equal(ids.length, 200);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
  const rest = await w.json('김과제', `/api/rooms/${main.id}/messages?after=${ids.at(-1)}`);
  assert.equal(rest.body.messages.length, 5);
  assert.ok(rest.body.messages.every(m => m.id > ids.at(-1)));
  assert.equal((await w.json('김과제', `/api/rooms/${main.id}/messages`)).body.messages.length, 200, 'after 가 없으면 0 부터');
  assert.deepEqual((await w.json('김과제', '/api/rooms/9999/messages?after=0')).body, { messages: [] }, '없는 방은 빈 배열');
  assert.deepEqual((await w.json('김과제', `/api/rooms/${main.id}/messages?after=abc`)).body, { messages: [] });
});

test('보관 방 409 · 없는 방 404 · 빈 글 400', async t => {
  const { w, main, bot } = await world(t);
  const none = await post(w, '김과제', 9999, form('안녕'));
  assert.equal(none.status, 404);
  assert.deepEqual(none.body, { error: '방을 찾을 수 없습니다' });

  const empty = await post(w, '김과제', main.id, form('   '));
  assert.equal(empty.status, 400);
  assert.deepEqual(empty.body, { error: '내용이나 파일이 필요합니다' });

  const stranger = await post(w, '김과제', main.id, form('@TO(prodev-남의-bot) 안녕', [['메모.txt', '첨부']]));
  assert.equal(stranger.status, 400);
  assert.deepEqual(stranger.body, { error: 'prodev-남의-bot 봇은 이 방에 초대되지 않았습니다' });
  assert.deepEqual(fs.readdirSync(w.config.uploadsDir), [], '거절된 글의 첨부는 남기지 않는다');

  w.chatDb.db.prepare("UPDATE rooms SET status = 'archived' WHERE id = ?").run(main.id);
  const archived = await post(w, '김과제', main.id, form('안녕'));
  assert.equal(archived.status, 409);
  assert.deepEqual(archived.body, { error: '보관된 방에는 메시지를 보낼 수 없습니다' });

  assert.equal(w.chatDb.messagesAfter(main.id, 0).length, 0, '아무 행도 안 남는다');
  assert.equal(w.cockpitDb.pendingInbox(bot.id).length, 0);
});

test('응답 어디에도 stored_path 가 없다', async t => {
  const { w, main, bot } = await world(t);
  const sent = await post(w, '김과제', main.id, form(`@TO(${bot.name}) 자료`, [['yield.csv', 'a,b\n']]));
  const list = await w.json('김과제', `/api/rooms/${main.id}/messages?after=0`);
  const rooms = await w.json('김과제', '/api/rooms');
  for (const r of [sent, list, rooms]) {
    assert.equal(r.status, 200);
    assert.ok(!r.text.includes('stored_path'), r.text);
    assert.ok(!r.text.includes(w.config.uploadsDir), '서버 경로가 새지 않는다');
  }
  assert.equal(list.body.messages[0].attachments[0].filename, 'yield.csv');
});

test('첨부 받기는 filename* 헤더', async t => {
  const { w, main, bot } = await world(t);
  const sent = await post(w, '김과제', main.id, form(`@TO(${bot.name}) 자료`, [['성적서 9월.csv', 'lot,yield\nA,91\n']]));
  const id = sent.body.message.attachments[0].id;

  const r = await w.fetch('김피엘', `/api/attachments/${id}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-disposition'), `attachment; filename*=UTF-8''${encodeURIComponent('성적서 9월.csv')}`);
  assert.equal(r.headers.get('content-type'), 'text/csv');
  assert.equal(await r.text(), 'lot,yield\nA,91\n');

  assert.equal((await w.fetch(null, `/api/attachments/${id}`)).status, 401);
  assert.equal((await w.fetch('김피엘', '/api/attachments/9999')).status, 404);
  // 기록된 경로가 업로드 폴더 밖을 가리키면 열지 않는다
  const outside = w.chatDb.storedPathFor(path.join(w.config.dataDir, 'chat.db'));
  w.chatDb.db.prepare('UPDATE attachments SET stored_path = ? WHERE id = ?').run(outside, id);
  const sealed = await w.json('김피엘', `/api/attachments/${id}`);
  assert.equal(sealed.status, 404);
  assert.deepEqual(sealed.body, { message: '파일을 찾을 수 없습니다' });
});

test('정적 파일 경로 탈출(../) 404', async t => {
  const outer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-web-')));
  const webDir = path.join(outer, 'web');
  fs.mkdirSync(webDir);
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>조종석</title>');
  fs.writeFileSync(path.join(webDir, 'app.js'), 'export {};\n');
  fs.writeFileSync(path.join(outer, 'secret.txt'), 'SECRET');
  if (CAN_SYMLINK) fs.symlinkSync(path.join(outer, 'secret.txt'), path.join(webDir, 'link.txt'));   // 못 만드는 기계에서는 /link.txt 칸이 없는 파일 404 로 돈다 — as-built 4절
  const { w } = await world(t, { webDir });

  const index = await w.raw('/');
  assert.equal(index.status, 200);
  assert.match(index.text, /<title>조종석<\/title>/);
  assert.match(index.headers['content-security-policy'], /default-src 'self'/);
  assert.equal((await w.raw('/app.js')).headers['content-type'], 'text/javascript; charset=utf-8');

  for (const p of ['/../secret.txt', '/..%2fsecret.txt', '/%2e%2e/secret.txt', '/%2e%2e%2fsecret.txt', '/..%5csecret.txt', '/a/../../secret.txt', '/link.txt', `/${encodeURIComponent('없는')}.js`]) {
    const r = await w.raw(p);
    assert.equal(r.status, 404, p);
    assert.ok(!r.text.includes('SECRET'), p);
  }
});

// (M6 N16) 같은 주소에 v1 → v2 를 올리자 브라우저가 옛 app.js 를 써 로그인이 안 됐다 — 재검증 기준을 싣는다
test('정적 파일은 no-cache + etag · last-modified 로 재검증한다 — 같으면 304, 바뀌면 새 etag 로 200', async t => {
  const webDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-web-')));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>조종석</title>');
  fs.writeFileSync(path.join(webDir, 'app.js'), 'export const v = 1;\n');
  const { w } = await world(t, { webDir });

  const first = await w.raw('/app.js');
  assert.equal(first.status, 200);
  assert.equal(first.headers['cache-control'], 'no-cache');
  assert.match(first.headers.etag ?? '', /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
  assert.ok(!Number.isNaN(Date.parse(first.headers['last-modified'])), 'last-modified 가 날짜');
  assert.equal((await w.raw('/')).headers['cache-control'], 'no-cache', 'index.html 도');

  const same = await w.raw('/app.js', { 'if-none-match': first.headers.etag });
  assert.equal(same.status, 304);
  assert.equal(same.text, '');
  assert.equal(same.headers.etag, first.headers.etag);

  fs.writeFileSync(path.join(webDir, 'app.js'), 'export const v = 2; // 새 판\n');
  fs.utimesSync(path.join(webDir, 'app.js'), new Date(), new Date(Date.now() + 5000));
  const changed = await w.raw('/app.js', { 'if-none-match': first.headers.etag });
  assert.equal(changed.status, 200, '옛 etag 로 물어도 새 파일을 준다');
  assert.match(changed.text, /새 판/);
  assert.notEqual(changed.headers.etag, first.headers.etag);
});

test('다른 출처의 POST 는 403 · 없는 길은 404 · health 는 로그인 없이', async t => {
  const { w, main } = await world(t);
  const cross = await post(w, '김과제', main.id, form('안녕'));
  assert.equal(cross.status, 200, 'Origin 머리가 없으면 받는다');
  const evil = await w.json('김과제', `/api/rooms/${main.id}/messages`, { method: 'POST', body: form('안녕'), headers: { origin: 'http://evil.example' } });
  assert.equal(evil.status, 403);
  const same = await w.json('김과제', `/api/rooms/${main.id}/messages`, { method: 'POST', body: form('안녕'), headers: { origin: w.base } });
  assert.equal(same.status, 200, '같은 주소의 Origin 은 받는다');
  assert.equal((await w.json('김과제', '/api/없는길')).status, 404);
  assert.deepEqual((await w.json(null, '/api/health')).body, { ok: true });
});
