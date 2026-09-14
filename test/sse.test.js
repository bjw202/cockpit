import { test } from 'node:test';
import assert from 'node:assert/strict';
import { httpWorld } from './fakes/http-world.js';
import { waitFor } from './fakes/fake-query.js';

async function world(t) {
  const w = await httpWorld();
  t.after(() => w.close());
  await w.user('김피엘', 'admin');
  await w.user('김과제');
  return { w, ...w.open() };
}

function parseFrame(raw) {
  const f = { id: null, event: null, data: null, comment: null };
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) f.comment = line.slice(1).trim();
    else if (line.startsWith('id: ')) f.id = Number(line.slice(4));
    else if (line.startsWith('event: ')) f.event = line.slice(7);
    else if (line.startsWith('data: ')) f.data = JSON.parse(line.slice(6));
  }
  return f;
}

// 흐름 하나를 열고 틀을 모은다. 서버가 닫으면 closed 가 참이 된다
async function openStream(w, as, headers = {}) {
  const ctrl = new AbortController();
  const r = await w.fetch(as, '/api/stream', { headers, signal: ctrl.signal });
  const s = { status: r.status, frames: [], closed: false, close: () => ctrl.abort() };
  if (r.status !== 200) { s.closed = true; return s; }
  const events = () => s.frames.filter(f => f.event);
  s.events = events;
  (async () => {
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) { s.frames.push(parseFrame(buf.slice(0, i))); buf = buf.slice(i + 2); }
      }
    } catch { /* 끊었다 */ }
    s.closed = true;
  })();
  await waitFor(() => s.frames.some(f => f.comment === 'connected'), { what: '연결 주석' });
  return s;
}

const send = (w, as, roomId, body) => {
  const fd = new FormData();
  fd.append('body', body);
  return w.json(as, `/api/rooms/${roomId}/messages`, { method: 'POST', body: fd });
};

test('사건마다 id', async t => {
  const { w, main } = await world(t);
  const s = await openStream(w, '김과제');
  t.after(() => s.close());
  assert.equal(s.status, 200);
  for (const body of ['하나', '둘']) await send(w, '김피엘', main.id, body);
  await waitFor(() => s.events().length === 2, { what: '사건 둘' });
  const [a, b] = s.events();
  assert.equal(a.event, 'message');
  assert.equal(a.data.project, '시험');
  assert.equal(a.data.message.body, '하나');
  assert.equal(a.data.message.author_name, '김피엘');
  assert.ok(Number.isInteger(a.id) && a.id > 0);
  assert.equal(b.id, a.id + 1);
  assert.equal((await w.json(null, '/api/stream')).status, 401, '로그인한 사람만');
});

test('Last-Event-ID 뒤의 사건만 다시 준다', async t => {
  const { w, main } = await world(t);
  const first = await openStream(w, '김과제');
  for (const body of ['하나', '둘', '셋']) await send(w, '김과제', main.id, body);
  await waitFor(() => first.events().length === 3, { what: '사건 셋' });
  const ids = first.events().map(f => f.id);
  first.close();

  const again = await openStream(w, '김과제', { 'last-event-id': String(ids[0]) });
  t.after(() => again.close());
  await waitFor(() => again.events().length === 2, { what: '놓친 사건 둘' });
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(again.events().map(f => f.id), ids.slice(1));
  assert.deepEqual(again.events().map(f => f.data.message.body), ['둘', '셋']);

  const fresh = await openStream(w, '김과제');
  t.after(() => fresh.close());
  await new Promise(r => setTimeout(r, 30));
  assert.equal(fresh.events().length, 0, 'Last-Event-ID 가 없으면 옛 사건을 안 준다');
});

test('partial 은 id 가 없다', async t => {
  const { w, main } = await world(t);
  const s = await openStream(w, '김과제');
  t.after(() => s.close());
  w.manager.emit('partial', { project: '시험', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '안녕' } } });
  w.manager.emit('partial', { project: '시험', event: { type: 'message_start' } });   // 글자가 아닌 조각은 안 흘린다
  await send(w, '김과제', main.id, '뒤의 글');
  await waitFor(() => s.events().length === 2, { what: 'partial 과 message' });
  const [p, m] = s.events();
  assert.deepEqual(p, { id: null, event: 'partial', data: { project: '시험', text: '안녕' }, comment: null });
  assert.equal(m.event, 'message');

  const again = await openStream(w, '김과제', { 'last-event-id': '0' });
  t.after(() => again.close());
  await waitFor(() => again.events().length >= 1, { what: '다시 받기' });
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(again.events().map(f => f.event), ['message'], 'partial 은 다시 주지 않는다');
});

test('로그아웃하면 흐름을 닫는다', async t => {
  const { w } = await world(t);
  const mine = await openStream(w, '김과제');
  const other = await openStream(w, '김피엘');
  t.after(() => { mine.close(); other.close(); });
  const out = await w.json('김과제', '/api/auth/logout', { method: 'POST' });
  assert.equal(out.status, 200);
  await waitFor(() => mine.closed, { what: '내 흐름이 닫힘' });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(other.closed, false, '다른 사람의 흐름은 그대로');
  assert.equal((await w.json('김과제', '/api/stream')).status, 401, '끊긴 쿠키로는 다시 못 연다');
});
