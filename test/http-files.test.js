// 파일 판 길 (TASKS M3.4 · ARCHITECTURE 7절) — 과제 폴더 읽기 전용 · 실경로 봉인 · 미리보기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { httpWorld } from './fakes/http-world.js';
import { parseCsv } from '../src/http/routes-files.js';

// 1×1 투명 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const P = encodeURIComponent('수율');

async function world(t) {
  const w = await httpWorld();
  t.after(() => w.close());
  await w.user('김피엘', 'admin');
  await w.user('김과제');
  w.open('수율');
  const root = path.join(w.config.projectsDir, '수율');
  for (const sub of ['cards', 'wiki', 'inbox/20260914-샤워헤드']) fs.mkdirSync(path.join(root, sub), { recursive: true });
  fs.writeFileSync(path.join(root, 'charter.md'), '# 헌장\n\nPL: 김피엘\n');
  fs.writeFileSync(path.join(root, 'cards', 'E-0007.md'), '---\nid: E-0007\n---\n# 샤워헤드\n');
  fs.writeFileSync(path.join(root, '.secret'), '숨김');
  const csv = ['일련번호,두께(mm),비고', '"SH2200-0001",1.02,"쉼표, 든 비고"', ...Array.from({ length: 70 }, (_, i) => `SH2200-${String(i + 2).padStart(4, '0')},1.0${i % 10},`)].join('\r\n');
  fs.writeFileSync(path.join(root, 'inbox', '20260914-샤워헤드', '성적서.csv'), `﻿${csv}\r\n`);
  fs.writeFileSync(path.join(root, 'inbox', '20260914-샤워헤드', '사진.png'), PNG);
  fs.writeFileSync(path.join(root, 'report.pptx'), Buffer.alloc(1234));
  // 과제 폴더 밖
  fs.writeFileSync(path.join(w.dir, 'outside.txt'), '밖의 비밀');
  fs.symlinkSync(path.join(w.dir, 'outside.txt'), path.join(root, 'cards', 'link-out.md'));
  fs.symlinkSync(w.dir, path.join(root, 'escape'), 'dir');
  fs.symlinkSync(path.join(root, 'charter.md'), path.join(root, 'wiki', 'link-in.md'));   // 안을 가리키는 링크는 된다
  return { w, root };
}
const q = rel => encodeURIComponent(rel);

test('폴더 한 층 목록 — 폴더 먼저 · 점 이름 뺌 · member 도 본다', async t => {
  const { w } = await world(t);
  const r = await w.json('김과제', `/api/projects/${P}/files`);
  assert.equal(r.status, 200);
  assert.equal(r.body.path, '');
  const names = r.body.entries.map(e => `${e.dir ? 'd' : 'f'}:${e.name}`);
  assert.deepEqual(names.filter(n => n.startsWith('d:')), ['d:cards', 'd:escape', 'd:inbox', 'd:wiki'].sort((a, b) => a.localeCompare(b)));
  assert.ok(names.indexOf('f:charter.md') > names.indexOf('d:wiki'), '폴더 먼저');
  assert.ok(!names.some(n => n.includes('.secret')), '점 이름은 뺀다');
  const charter = r.body.entries.find(e => e.name === 'charter.md');
  assert.equal(charter.size, fs.statSync(path.join(w.config.projectsDir, '수율', 'charter.md')).size);
  assert.match(charter.mtime, /^\d{4}-\d\d-\d\dT/);
  const sub = await w.json('김과제', `/api/projects/${P}/files?path=${q('inbox/20260914-샤워헤드')}`);
  assert.deepEqual(sub.body.entries.map(e => e.name), ['사진.png', '성적서.csv']);
  assert.equal((await w.json(null, `/api/projects/${P}/files`)).status, 401);
  assert.equal((await w.json('김과제', '/api/projects/없는과제/files')).status, 404);
  const md = await w.json('김과제', `/api/projects/${P}/file?path=${q('cards/E-0007.md')}`);
  const cardText = '---\nid: E-0007\n---\n# 샤워헤드\n';
  assert.deepEqual(md.body, { path: 'cards/E-0007.md', kind: 'text', size: Buffer.byteLength(cardText), text: cardText, truncated: false }, 'size 는 바이트');
  assert.deepEqual((await w.json('김과제', `/api/projects/${P}/file?path=report.pptx`)).body, { path: 'report.pptx', kind: 'other', size: 1234 });
});

test('../ 탈출 404', async t => {
  const { w } = await world(t);
  for (const rel of ['..', '../..', '../../outside.txt', 'cards/../../../outside.txt', '/etc/hosts', `${w.dir}/outside.txt`, 'cards/\0x']) {
    for (const kind of ['file', 'files']) {
      const r = await w.json('김과제', `/api/projects/${P}/${kind}?path=${q(rel)}`);
      assert.equal(r.status, 404, `${kind} ${JSON.stringify(rel)}`);
      assert.ok(!r.text.includes('밖의 비밀'));
    }
  }
  // 주소 자체의 ../ 도 (fetch 가 접지 않게 날 경로로)
  const raw = await w.raw(`/api/projects/${P}/file?path=../../outside.txt`, { cookie: `md_session=${w.tokens['김과제']}` });
  assert.equal(raw.status, 404);
  assert.equal((await w.json('김과제', `/api/projects/${P}/file?path=${q('../수율/charter.md')}`)).status, 200, '돌아 들어와 안이면 된다');
});

test('과제 폴더 밖을 가리키는 심볼릭 링크 404', async t => {
  const { w } = await world(t);
  assert.equal((await w.json('김과제', `/api/projects/${P}/file?path=${q('cards/link-out.md')}`)).status, 404);
  assert.equal((await w.json('김과제', `/api/projects/${P}/files?path=escape`)).status, 404);
  assert.equal((await w.json('김과제', `/api/projects/${P}/file?path=${q('escape/outside.txt')}`)).status, 404);
  const inside = await w.json('김과제', `/api/projects/${P}/file?path=${q('wiki/link-in.md')}`);
  assert.equal(inside.status, 200, '안을 가리키는 링크는 된다');
  assert.equal(inside.body.path, 'charter.md', '실경로로 풀어 낸다');
});

test('csv 는 앞 50행', async t => {
  const { w } = await world(t);
  const r = await w.json('김과제', `/api/projects/${P}/file?path=${q('inbox/20260914-샤워헤드/성적서.csv')}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.kind, 'csv');
  assert.equal(r.body.rows.length, 50);
  assert.equal(r.body.truncated, true);
  assert.deepEqual(r.body.rows[0], ['일련번호', '두께(mm)', '비고'], 'BOM 을 떼고 머리 행');
  assert.deepEqual(r.body.rows[1], ['SH2200-0001', '1.02', '쉼표, 든 비고'], '따옴표 안 쉼표');
  assert.deepEqual(parseCsv('a,b\n"x ""y""",\n', 50), { rows: [['a', 'b'], ['x "y"', '']], more: false });
  assert.deepEqual(parseCsv('a\nb', 1), { rows: [['a']], more: true });
});

test('png 는 image/png', async t => {
  const { w } = await world(t);
  const r = await w.fetch('김과제', `/api/projects/${P}/file?path=${q('inbox/20260914-샤워헤드/사진.png')}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
});

test('쓰기 메서드(PUT/POST/DELETE) 405', async t => {
  const { w, root } = await world(t);
  const before = fs.readFileSync(path.join(root, 'charter.md'), 'utf8');
  for (const kind of ['file', 'files']) {
    for (const method of ['PUT', 'POST', 'DELETE', 'PATCH']) {
      const r = await w.json('김피엘', `/api/projects/${P}/${kind}?path=charter.md`, { method, headers: { 'content-type': 'application/json' }, body: method === 'DELETE' ? undefined : '{"text":"덮어쓰기"}' });
      assert.equal(r.status, 405, `${method} ${kind}`);
    }
  }
  assert.equal(fs.readFileSync(path.join(root, 'charter.md'), 'utf8'), before);
  assert.ok(fs.existsSync(path.join(root, 'charter.md')));
});
