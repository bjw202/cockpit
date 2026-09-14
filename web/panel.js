// 접이식 조종석 판 — 승인 카드 · 조종석 · 파일을 방 화면 오른쪽 한 자리에 (ADR-019 · ARCHITECTURE 7.4).
// DOM 몸통이다. 판단은 순수 함수가 한다: 기본값 · 걸린 수는 glue.js, 카드는 card.js, 조종석은 cockpit.js, 파일은 files.js (v1 에서 그대로).
// 판은 지금 연 방의 과제를 따른다(panelFollow). 사건은 app.js 의 앱 흐름 하나가 넘긴다(panelEvent).
// minidiscord api() 는 상태 코드를 싣지 않으므로 판은 call() 을 따로 쓴다 — 409 TASKS_RUNNING 확인이 상태와 본문을 봐야 한다.
// 글자는 textContent 와 각 조각의 DOM 함수로만 넣는다 (innerHTML 없음 — test/web-static.test.js).

import { applyPermissionEvent, cardView, renderCard } from './card.js';
import { mergeEvents, renderCockpit } from './cockpit.js';
import { fileUrl, isImage, listUrl, renderEntries, renderPreview } from './files.js';
import { panelOpenByDefault, pendingBadge } from './glue.js';

export const STORAGE_KEY = 'cockpit.panel';
const P = name => encodeURIComponent(name);
const $ = id => document.getElementById(id);

const panel = {
  ready: false, role: null, getProjects: () => [], onChanged: async () => {},
  project: null, events: new Map(), cards: [], dir: '', partial: new Map(), frame: 0,
};

async function call(path, { method = 'GET', json } = {}) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (json !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(json); }
  const res = await fetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.error ?? body?.message ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// 사람이 바꾼 접힘은 이 브라우저에만 — 서버에 안 적는다. 막힌 저장소(사생활 창 등)는 기억 없이 기본값
function remembered() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } }
function remember(open) { try { localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed'); } catch { /* 기억 없이 간다 */ } }

const isOpen = () => !$('cockpit-panel').hidden;
const currentProject = () => panel.getProjects().find(p => p.name === panel.project) ?? null;

function setOpen(open, { save = false } = {}) {
  $('cockpit-panel').hidden = !open;
  $('panel-toggle')?.setAttribute('aria-expanded', String(open));
  if (save) remember(open);
  renderBadge();
  if (open) refresh();
}

// 접힌 단추에는 걸린 승인 수(모든 과제), 카드 접이 머리에는 이 과제의 수
function renderBadge() {
  const toggle = $('panel-toggle-count');
  if (toggle) toggle.textContent = isOpen() ? '' : pendingBadge(panel.cards.length);
  const head = $('panel-cards-count');
  if (head) head.textContent = pendingBadge(visibleCards().length);
}

// app.js 가 로그인 뒤 부른다. 두 번 불러도 처리기를 겹쳐 걸지 않는다
export async function initPanel({ role, getProjects, onChanged } = {}) {
  panel.role = role ?? null;
  if (getProjects) panel.getProjects = getProjects;
  if (onChanged) panel.onChanged = onChanged;
  if (!panel.ready) {
    panel.ready = true;
    $('panel-toggle')?.addEventListener('click', () => setOpen(!isOpen(), { save: true }));
    $('panel-files')?.addEventListener('toggle', () => { if ($('panel-files').open) openDir(panel.dir); });
  }
  try { panel.cards = (await call('/api/permissions?pending=1')).requests ?? []; } catch { panel.cards = []; }
  setOpen(panelOpenByDefault(panel.role, remembered()));
  renderCards();
}

// 방을 열면 그 방의 과제로. 같은 과제면 그대로
export function panelFollow(projectName) {
  if (panel.project === projectName) return;
  panel.project = projectName;
  panel.dir = '';
  $('files-preview')?.replaceChildren();
  refresh();
}

function refresh() {
  renderCards();
  renderPartial();
  if (!isOpen()) return;
  openCockpit();
  if ($('panel-files')?.open) openDir(panel.dir);
}

// ── 승인 카드 ─────────────────────────────────────────────
// 카드는 전원이 보고 단추는 admin 에게만 (card.js). 답이 오면 어느 탭에서 답했든 permission_resolved 로 거둔다
const visibleCards = () => (panel.project ? panel.cards.filter(c => c.project === panel.project) : panel.cards);

function renderCards() {
  renderBadge();
  const box = $('cards');
  if (!box) return;
  const cards = visibleCards();
  if (!cards.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '걸린 요청이 없습니다';
    box.replaceChildren(empty);
    return;
  }
  box.replaceChildren(...cards.map(req => renderCard(cardView(req, { role: panel.role }), document, answerCard)));
}

async function answerCard(view, decision, el) {
  const buttons = [...el.querySelectorAll('button')];
  for (const b of buttons) b.disabled = true;
  try {
    await call(`/api/permissions/${encodeURIComponent(view.id)}`, { method: 'POST', json: { decision } });
    panel.cards = applyPermissionEvent(panel.cards, 'permission_resolved', { tool_use_id: view.id });
    renderCards();
  } catch (e) {
    el.querySelector('.error').textContent = e.message;
    if (e.status === 409) {   // 다른 admin 이 먼저 답했다 — 까닭을 잠깐 보이고 거둔다
      panel.cards = applyPermissionEvent(panel.cards, 'permission_resolved', { tool_use_id: view.id });
      setTimeout(renderCards, 1500);
    } else {
      for (const b of buttons) b.disabled = false;
    }
  }
}

// ── 조종석 ────────────────────────────────────────────────
async function openCockpit() {
  const project = currentProject();
  const error = $('cockpit-error');
  if (error) error.textContent = '';
  if (!project) { $('cockpit')?.replaceChildren(); return; }
  try {
    if (!panel.events.has(project.name)) {
      let events = [];
      let after = 0;
      for (let page = 0; page < 20; page++) {
        const { events: got } = await call(`/api/projects/${P(project.name)}/events?after=${after}`);
        events = mergeEvents(events, got);
        if (got.length < 500) break;
        after = got.at(-1).id;
      }
      panel.events.set(project.name, mergeEvents(events, panel.events.get(project.name) ?? []));
    }
  } catch (e) {
    if (error) error.textContent = e.message;
  }
  renderCockpitNow();
}

function renderCockpitNow() {
  panel.frame = 0;
  const project = currentProject();
  if (!isOpen() || !project) return;
  $('cockpit').replaceChildren(renderCockpit({ project, events: panel.events.get(project.name) ?? [], role: panel.role }, document, {
    onSession: (op, button) => sessionOp(project.name, op, button),
    onStopTask: (taskId, button) => stopTask(project.name, taskId, button),
  }));
}

// 사건이 몰려와도 한 프레임에 한 번만 그린다
function scheduleCockpit(name) {
  if (name !== panel.project || panel.frame || !isOpen()) return;
  panel.frame = requestAnimationFrame(renderCockpitNow);
}

async function sessionOp(name, op, button) {
  const error = $('cockpit-error');
  error.textContent = '';
  if (button) button.disabled = true;
  const path = `/api/projects/${P(name)}/session/${op}`;
  try {
    try {
      await call(path, { method: 'POST' });
    } catch (e) {
      if (e.status !== 409 || e.body?.code !== 'TASKS_RUNNING') throw e;
      const list = (e.body.tasks ?? []).map(t => `- ${t.task_type ?? '도우미'} · ${t.description}`).join('\n');
      if (!window.confirm(`${e.message}\n${list}\n\n그래도 ${op === 'stop' ? '끌' : '다시 켤'}까요? 도우미의 일은 사라집니다.`)) return;
      await call(`${path}?confirm=1`, { method: 'POST' });
    }
    await panel.onChanged();
    renderCockpitNow();
  } catch (e) {
    error.textContent = e.message;
  } finally {
    if (button) button.disabled = false;
  }
}

async function stopTask(name, taskId, button) {
  $('cockpit-error').textContent = '';
  if (button) button.disabled = true;
  try { await call(`/api/projects/${P(name)}/tasks/${encodeURIComponent(taskId)}/stop`, { method: 'POST' }); }
  catch (e) { $('cockpit-error').textContent = e.message; if (button) button.disabled = false; }
}

function renderPartial() {
  const el = $('partial');
  if (!el) return;
  const text = panel.project ? panel.partial.get(panel.project) : '';
  el.hidden = !text;
  el.textContent = text ? `봇이 쓰는 중 … ${text.slice(-240)}` : '';
}

// ── 파일 ──────────────────────────────────────────────────
async function openDir(dir) {
  const project = currentProject();
  const tree = $('files-tree');
  if (!tree) return;
  if (!project) { tree.replaceChildren(); return; }
  try {
    const listing = await call(listUrl(project.name, dir));
    if (currentProject()?.name !== project.name) return;
    panel.dir = listing.path;
    tree.replaceChildren(renderEntries(listing, document, { onOpenDir: openDir, onOpenFile: openFile }));
  } catch (e) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = e.status === 404 ? '과제 폴더가 없거나 열 수 없는 자리입니다' : e.message;
    tree.replaceChildren(p);
    if (dir) panel.dir = '';
  }
}

async function openFile(path) {
  const project = currentProject();
  const box = $('files-preview');
  if (!project || !box) return;
  try {
    const preview = isImage(path) ? { kind: 'image', path, url: fileUrl(project.name, path) } : await call(fileUrl(project.name, path));
    box.replaceChildren(renderPreview(preview, document));
  } catch (e) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = e.message;
    box.replaceChildren(p);
  }
}

// ── 사건 — app.js 의 앱 흐름(openAppStream)이 넘긴다 ──────────
export function panelEvent(type, d) {
  switch (type) {
    case 'permission_request':
    case 'permission_resolved':
      panel.cards = applyPermissionEvent(panel.cards, type, d);
      renderCards();
      return;
    case 'session_event': {
      const project = panel.getProjects().find(p => p.name === d.project);
      if (project && d.type === 'result' && d.data?.total_cost_usd != null) project.session.cost_usd = d.data.total_cost_usd;
      if (project && d.type === 'context') project.session.context_pct = d.data?.percentage ?? null;
      if (d.type === 'result') { panel.partial.delete(d.project); renderPartial(); }
      const list = panel.events.get(d.project);
      if (!list) return;   // 조종석을 아직 안 연 과제는 열 때 받는다
      panel.events.set(d.project, mergeEvents(list, [{ id: d.id, at: new Date().toISOString(), type: d.type, data: d.data }]));
      scheduleCockpit(d.project);
      return;
    }
    case 'partial':
      panel.partial.set(d.project, (panel.partial.get(d.project) ?? '') + d.text);
      if (d.project === panel.project) renderPartial();
      return;
    case 'session_state':
      if (d.state !== 'working' && d.state !== 'waiting_approval') { panel.partial.delete(d.project); renderPartial(); }
      scheduleCockpit(d.project);
      return;
    case 'room_created':
    case 'room_archived':
      scheduleCockpit(panel.project);
      return;
    default:
  }
}
