// 파일 판 길 (ARCHITECTURE 7절 · 8.2) — 과제 폴더를 읽기만 한다.
//   GET /api/projects/:name/files?path=<상대 경로>   로그인 — { path, entries:[{ name, dir, size, mtime }] } 폴더 먼저 · 이름 순. 점으로 시작하는 이름은 뺀다
//   GET /api/projects/:name/file?path=<상대 경로>    로그인 — 미리보기
//        글(.md · .txt · .json · .py …)  { path, kind:'text', size, text, truncated }   앞 TEXT_LIMIT 바이트
//        .csv                           { path, kind:'csv', size, rows:[[…]], truncated } 앞 CSV_ROWS 행
//        그림(.png · .jpg · .gif · .webp) 바이트 그대로 · content-type image/…
//        그 밖                          { path, kind:'other', size }
// 과제 폴더 = <projectsDir>/<과제>. 실경로로 맞대어 밖(../ · 밖을 가리키는 심볼릭 링크)이면 404.
// 쓰는 길은 없다 — 같은 주소의 PUT · POST · DELETE 는 길 표가 405 로 돌려보낸다.

import fs from 'node:fs';
import path from 'node:path';
import { HttpError, sendJson } from './respond.js';

export const CSV_ROWS = 50;
export const TEXT_LIMIT = 256 * 1024;
const CSV_READ_LIMIT = 1024 * 1024;
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const TEXT_EXTS = new Set(['.md', '.txt', '.json', '.jsonl', '.yml', '.yaml', '.py', '.js', '.mjs', '.log', '.tsv', '.html', '.css', '.sh', '.toml', '.ini']);

const notFound = () => new HttpError(404, { error: '없는 파일입니다' });

const inside = (root, p) => {
  const r = path.relative(root, p);
  return r === '' || (r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r));
};

// 과제 폴더 안의 실경로. 밖이거나 없으면 404 — 있는지 없는지를 밖에서 가를 수 없게 같은 답
export function resolveInProject(projectsDir, project, rel = '') {
  let root; let real;
  try { root = fs.realpathSync(path.join(projectsDir, project)); } catch { throw notFound(); }
  const want = String(rel ?? '');
  if (want.includes('\0')) throw notFound();
  try { real = fs.realpathSync(path.resolve(root, want.replace(/^[/\\]+/, ''))); } catch { throw notFound(); }
  if (!inside(root, real)) throw notFound();
  return { root, real, rel: path.relative(root, real).split(path.sep).join('/') };
}

function readHead(file, limit) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(limit);
    const n = fs.readSync(fd, buf, 0, limit, 0);
    return buf.subarray(0, n);
  } finally { fs.closeSync(fd); }
}

// 자른 자리에서 반쪽 난 UTF-8 글자를 떨군다
const decodeHead = (buf, truncated) => {
  const s = buf.toString('utf8').replace(/^﻿/, '');
  return truncated ? s.replace(/�+$/, '') : s;
};

// RFC 4180 꼴 — 따옴표 안의 쉼표 · 줄바꿈 · "" 를 푼다. maxRows 행을 채우면 멈춘다
export function parseCsv(text, maxRows = CSV_ROWS) {
  const rows = [];
  let row = []; let field = ''; let quoted = false; let i = 0;
  const endRow = () => { row.push(field); rows.push(row); row = []; field = ''; };
  while (i < text.length && rows.length < maxRows) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r' && text[i + 1] === '\n') { endRow(); i += 2; continue; }
    if (c === '\n' || c === '\r') { endRow(); i++; continue; }
    field += c; i++;
  }
  const rest = text.slice(i);
  if (rows.length < maxRows && (field !== '' || row.length)) endRow();
  return { rows, more: rows.length >= maxRows && rest.trim() !== '' };
}

export function registerFileRoutes(route, ctx) {
  const project = name => {
    if (!ctx.cockpitDb.agentSession(name)) throw new HttpError(404, { error: `과제가 없습니다: ${name}` });
    return name;
  };

  route('GET', '/api/projects/:name/files', ({ url, params }) => {
    const { real, rel } = resolveInProject(ctx.config.projectsDir, project(params.name), url.searchParams.get('path'));
    if (!fs.statSync(real).isDirectory()) throw notFound();
    const entries = [];
    for (const d of fs.readdirSync(real, { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue;
      let st;
      try { st = fs.statSync(path.join(real, d.name)); } catch { continue; }   // 끊긴 링크
      entries.push({ name: d.name, dir: st.isDirectory(), size: st.isDirectory() ? null : st.size, mtime: st.mtime.toISOString() });
    }
    entries.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    return { path: rel, entries };
  });

  route('GET', '/api/projects/:name/file', ({ req, res, url, params }) => {
    const { real, rel } = resolveInProject(ctx.config.projectsDir, project(params.name), url.searchParams.get('path'));
    const st = fs.statSync(real);
    if (!st.isFile()) throw notFound();
    const ext = path.extname(real).toLowerCase();

    if (IMAGE_TYPES[ext]) {
      res.writeHead(200, { 'content-type': IMAGE_TYPES[ext], 'content-length': st.size, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(real).pipe(res);
      return;
    }
    if (ext === '.csv') {
      const cut = st.size > CSV_READ_LIMIT;
      const { rows, more } = parseCsv(decodeHead(readHead(real, CSV_READ_LIMIT), cut), CSV_ROWS);
      return sendJson(res, 200, { path: rel, kind: 'csv', size: st.size, rows, truncated: more || cut });
    }
    if (TEXT_EXTS.has(ext)) {
      const cut = st.size > TEXT_LIMIT;
      return sendJson(res, 200, { path: rel, kind: 'text', size: st.size, text: decodeHead(readHead(real, TEXT_LIMIT), cut), truncated: cut });
    }
    return { path: rel, kind: 'other', size: st.size };
  });
}
