// 파일 판 — 과제 폴더 읽기 전용 나무 · 미리보기 (ARCHITECTURE 7절). 서버 길은 src/http/routes-files.js.
// 순수 함수는 DOM 없이 시험할 수 있게 두고, DOM 은 doc 을 받아 textContent 로만 채운다. .md 는 markdown.js 로.

import { renderMarkdown } from './markdown.js';

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

export const joinPath = (dir, name) => (dir ? `${dir}/${name}` : name);

// 'inbox/20260914-샤워헤드' → [{label:'과제 폴더', path:''}, {label:'inbox', path:'inbox'}, …]
export function breadcrumbs(p) {
  const parts = String(p ?? '').split('/').filter(Boolean);
  return [{ label: '과제 폴더', path: '' }, ...parts.map((label, i) => ({ label, path: parts.slice(0, i + 1).join('/') }))];
}

export const fileUrl = (project, p) => `/api/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(p)}`;
export const listUrl = (project, p) => `/api/projects/${encodeURIComponent(project)}/files?path=${encodeURIComponent(p ?? '')}`;
export const isImage = name => IMAGE.test(String(name));

export function sizeText(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// ── DOM ────────────────────────────────────────────────────
// handlers: { onOpenDir(path), onOpenFile(path) }
export function renderEntries({ path: dir, entries }, doc, handlers) {
  const box = doc.createElement('div');
  box.className = 'files-list';
  const crumbs = doc.createElement('nav');
  crumbs.className = 'crumbs';
  for (const c of breadcrumbs(dir)) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'quiet';
    b.textContent = c.label;
    b.addEventListener('click', () => handlers.onOpenDir(c.path));
    crumbs.append(b);
  }
  box.append(crumbs);
  const ul = doc.createElement('ul');
  ul.className = 'entries';
  for (const e of entries) {
    const li = doc.createElement('li');
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = `entry ${e.dir ? 'entry-dir' : 'entry-file'}`;
    b.textContent = e.dir ? `${e.name}/` : e.name;
    const p = joinPath(dir, e.name);
    b.addEventListener('click', () => (e.dir ? handlers.onOpenDir(p) : handlers.onOpenFile(p, e)));
    const size = doc.createElement('span');
    size.className = 'entry-size';
    size.textContent = e.dir ? '' : sizeText(e.size);
    li.append(b, size);
    ul.append(li);
  }
  if (!entries.length) {
    const empty = doc.createElement('p');
    empty.className = 'empty';
    empty.textContent = '빈 폴더입니다';
    box.append(empty);
  }
  box.append(ul);
  return box;
}

// preview: GET …/file 의 JSON · 또는 그림이면 { kind:'image', path, url }
export function renderPreview(preview, doc) {
  const box = doc.createElement('div');
  box.className = 'preview';
  const title = doc.createElement('h3');
  title.textContent = preview.path;
  box.append(title);
  const note = text => { const p = doc.createElement('p'); p.className = 'empty'; p.textContent = text; box.append(p); };
  if (preview.kind === 'image') {
    const img = doc.createElement('img');
    img.src = preview.url;
    img.alt = preview.path;
    box.append(img);
  } else if (preview.kind === 'csv') {
    const wrap = doc.createElement('div');
    wrap.className = 'md-table-wrap';
    const table = doc.createElement('table');
    table.className = 'md-table';
    preview.rows.forEach((row, i) => {
      const tr = doc.createElement('tr');
      for (const cell of row) {
        const td = doc.createElement(i === 0 ? 'th' : 'td');
        td.textContent = cell;
        tr.append(td);
      }
      table.append(tr);
    });
    wrap.append(table);
    box.append(wrap);
    if (preview.truncated) note(`앞 ${preview.rows.length}행만 보입니다 (${sizeText(preview.size)})`);
  } else if (preview.kind === 'text') {
    if (/\.md$/i.test(preview.path)) {
      try { box.append(renderMarkdown(preview.text, doc)); } catch { const pre = doc.createElement('pre'); pre.textContent = preview.text; box.append(pre); }
    } else {
      const pre = doc.createElement('pre');
      pre.className = 'md-pre';
      pre.textContent = preview.text;
      box.append(pre);
    }
    if (preview.truncated) note(`앞부분만 보입니다 (${sizeText(preview.size)})`);
  } else {
    note(`미리보기가 없는 파일입니다 · ${sizeText(preview.size)}`);
  }
  return box;
}
