// 화면의 몸통 — 로그인 · 과제 탭 · 판 셋(채팅 · 조종석 · 파일) · 실시간 (ARCHITECTURE 7절). 프레임워크 · 빌드 · CDN 없음 (ADR-010).
// 글자를 넣는 곳은 textContent 와 markdown.js 뿐이다 (innerHTML 없음 — test/web-static.test.js).

import { defaultComposerText, messageView, renderMessage, roomKind, statusOfState } from './chat.js';
import { applyPermissionEvent, cardView, renderCard } from './card.js';
import { mergeEvents, renderCockpit } from './cockpit.js';
import { fileUrl, isImage, listUrl, renderEntries, renderPreview } from './files.js';
import { PANES, applySessionState, chatItems, renderBoundary, tabsView } from './tabs.js';
import { statusChip } from './chat.js';

const $ = sel => document.querySelector(sel);

const state = {
  me: null,
  projects: [],
  current: null,            // 과제 이름
  pane: 'chat',             // chat | cockpit | files
  room: 'main',             // main | files
  messages: new Map(),      // 방 id → 글 배열 (연 방만)
  status: new Map(),        // 과제 → { status, tool }
  partial: new Map(),       // 과제 → 봇이 지금 쓰는 글자
  events: new Map(),        // 과제 → session_events 배열 (조종석 판을 한 번 연 과제만)
  files: [],                // 보낼 첨부
  dir: '',                  // 파일 판에서 연 폴더
  lastDefault: '',
  stream: null,
  cards: [],                // 걸린 승인 요청 (GET /api/permissions 의 requests 모양)
  cockpitFrame: 0,
};

class ApiError extends Error {
  constructor(status, message, body) { super(message); this.status = status; this.body = body; }
}

async function api(path, { method = 'GET', json, form } = {}) {
  const init = { method, headers: {} };
  if (json !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(json); }
  if (form) init.body = form;
  const r = await fetch(path, init);
  const body = await r.json().catch(() => null);
  if (r.status === 401 && path !== '/api/auth/login') showLogin();
  if (!r.ok) throw new ApiError(r.status, body?.error ?? body?.message ?? `HTTP ${r.status}`, body);
  return body;
}

const currentProject = () => state.projects.find(p => p.name === state.current) ?? null;
const currentRoom = () => currentProject()?.rooms?.[state.room] ?? null;
const projectOfRoom = roomId => state.projects.find(p => p.rooms.main?.id === roomId || p.rooms.files?.id === roomId) ?? null;
const P = name => encodeURIComponent(name);

// ── 들어가기 · 나가기 ─────────────────────────────────────
function showLogin() {
  stopStream();
  state.me = null;
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-form [name=username]').focus();
}

async function enter() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#me').textContent = `${state.me.username} · ${state.me.role}`;
  $('#admin-panel').hidden = state.me.role !== 'admin';
  state.messages.clear();
  state.events.clear();
  renderPanes();
  await loadProjects();
  startStream();
  afterEnter();
}

async function login(ev) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  $('#login-error').textContent = '';
  try {
    const { user } = await api('/api/auth/login', { method: 'POST', json: { username: f.get('username'), password: f.get('password') } });
    state.me = user;
    ev.target.reset();
    await enter();
  } catch (e) {
    $('#login-error').textContent = e.message;
  }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* 이미 끊겼다 */ }
  showLogin();
}

// ── 과제 · 판 ─────────────────────────────────────────────
async function loadProjects(select) {
  const { projects } = await api('/api/projects');
  state.projects = projects;
  for (const p of projects) if (!state.status.has(p.name)) state.status.set(p.name, { status: statusOfState(p.session.state) });
  if (select) state.current = select;
  if (!projects.some(p => p.name === state.current)) state.current = projects[0]?.name ?? null;
  renderTabs();
  await showPane(state.pane);
}

function renderTabs() {
  const nav = $('#tabs');
  nav.replaceChildren();
  for (const t of tabsView(state.projects, state.current, state.status)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tab${t.active ? ' active' : ''}`;
    b.textContent = t.name;
    if (t.chip) {
      const dot = document.createElement('span');
      dot.className = `dot tone-${t.chip.tone}`;
      dot.title = t.chip.text;
      b.append(dot);
    }
    b.addEventListener('click', () => selectProject(t.name));
    nav.append(b);
  }
  if (!state.projects.length) {
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.textContent = state.me?.role === 'admin' ? '열린 과제가 없습니다 — 오른쪽에서 과제를 여세요' : '열린 과제가 없습니다';
    nav.append(empty);
  }
}

async function selectProject(name) {
  if (state.current !== name) state.dir = '';
  state.current = name;
  renderTabs();
  await showPane(state.pane);
}

function renderPanes() {
  const nav = $('#panes');
  nav.replaceChildren(...PANES.map(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.pane = p.id;
    b.textContent = p.label;
    b.addEventListener('click', () => showPane(p.id));
    return b;
  }));
}

async function showPane(pane) {
  state.pane = pane;
  for (const b of document.querySelectorAll('#panes button')) {
    const on = b.dataset.pane === pane;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  }
  for (const p of PANES) $(`#pane-${p.id}`).hidden = p.id !== pane;
  if (pane === 'chat') await openRoom(state.room);
  else if (pane === 'cockpit') await openCockpit();
  else await openDir(state.dir);
}

// ── 채팅 판 ───────────────────────────────────────────────
function renderChip() {
  const el = $('#bot-chip');
  const s = state.current ? state.status.get(state.current) : null;
  const chip = s ? statusChip(s.status, s.tool) : null;
  el.hidden = !chip;
  if (chip) { el.textContent = chip.text; el.title = chip.title; el.className = `chip tone-${chip.tone}`; }
}

function renderPartial() {
  const el = $('#partial');
  const text = state.current ? state.partial.get(state.current) : '';
  el.hidden = !text;
  if (text) el.textContent = `봇이 쓰는 중 … ${text.slice(-240)}`;
}

function setComposerDefault() {
  const body = $('#body');
  const def = defaultComposerText(currentProject(), state.room);
  if (!body.value.trim() || body.value === state.lastDefault) body.value = def;
  state.lastDefault = def;
}

const renderItem = item => (item.kind === 'boundary' ? renderBoundary(item) : renderMessage(messageView(item.message, { me: state.me })));

async function openRoom(kind) {
  state.room = kind;
  for (const b of document.querySelectorAll('.rooms button')) {
    const on = b.dataset.room === kind;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  }
  const room = currentRoom();
  $('#room-name').textContent = room ? room.name : '';
  $('#messages').replaceChildren();
  setComposerDefault();
  renderChip();
  renderPartial();
  if (!room) return;
  if (!state.messages.has(room.id)) {
    const all = [];
    let after = 0;
    for (let page = 0; page < 50; page++) {
      const { messages } = await api(`/api/rooms/${room.id}/messages?after=${after}`);
      all.push(...messages);
      if (messages.length < 200) break;
      after = messages.at(-1).id;
    }
    if (!state.messages.has(room.id)) state.messages.set(room.id, all);
  }
  if (currentRoom()?.id !== room.id) return;   // 받는 사이 다른 방으로 옮겼다
  const list = $('#messages');
  list.replaceChildren(...chatItems(state.messages.get(room.id)).map(renderItem));
  list.scrollTop = list.scrollHeight;
}

function addMessage(message) {
  const project = projectOfRoom(message.room_id);
  if (message.author_type === 'bot' && project) { state.partial.delete(project.name); renderPartial(); }
  const list = state.messages.get(message.room_id);
  if (!list || list.some(m => m.id === message.id)) return;   // 아직 안 연 방은 열 때 받는다
  list.push(message);
  if (state.pane !== 'chat' || currentRoom()?.id !== message.room_id) return;
  const el = $('#messages');
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  el.append(renderItem(chatItems([message])[0]));
  if (atBottom || message.author_user_id === state.me?.id) el.scrollTop = el.scrollHeight;
}

// ── 보내기 · 첨부 ─────────────────────────────────────────
function renderPendingFiles() {
  const ul = $('#pending-files');
  ul.replaceChildren(...state.files.map((f, i) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `${f.name} (${Math.ceil(f.size / 1024)}KB)`;
    const drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'quiet';
    drop.textContent = '빼기';
    drop.addEventListener('click', () => { state.files.splice(i, 1); renderPendingFiles(); });
    li.append(name, drop);
    return li;
  }));
}

function addFiles(list) {
  for (const f of list) {
    // 붙여넣은 그림은 이름이 모두 image.png 라서 겹치지 않게 시각을 붙인다
    const named = f.name && f.name !== 'image.png' ? f : new File([f], `붙여넣기-${Date.now()}.${(f.type.split('/')[1] || 'png')}`, { type: f.type });
    state.files.push(named);
  }
  renderPendingFiles();
}

async function send(ev) {
  ev.preventDefault();
  const room = currentRoom();
  if (!room) return;
  const fd = new FormData();
  fd.append('body', $('#body').value);
  for (const f of state.files) fd.append('files', f, f.name);
  const button = $('#composer button[type=submit]');
  $('#send-error').textContent = '';
  button.disabled = true;
  try {
    const { message } = await api(`/api/rooms/${room.id}/messages`, { method: 'POST', form: fd });
    addMessage(message);
    state.files = [];
    renderPendingFiles();
    $('#file-input').value = '';
    $('#body').value = '';
    setComposerDefault();
  } catch (e) {
    $('#send-error').textContent = e.message;
  } finally {
    button.disabled = false;
    $('#body').focus();
  }
}

async function openProject(ev) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const name = String(f.get('name') ?? '').trim();
  const botName = String(f.get('bot_name') ?? '').trim();
  $('#open-error').textContent = '';
  try {
    await api('/api/projects', { method: 'POST', json: { name, ...(botName ? { bot_name: botName } : {}) } });
    ev.target.reset();
    await loadProjects(name);
  } catch (e) {
    $('#open-error').textContent = e.message;
  }
}

// ── 조종석 판 ─────────────────────────────────────────────
async function openCockpit() {
  const project = currentProject();
  $('#cockpit-error').textContent = '';
  if (!project) { $('#cockpit').replaceChildren(); return; }
  if (!state.events.has(project.name)) {
    let events = [];
    let after = 0;
    for (let page = 0; page < 20; page++) {
      const { events: got } = await api(`/api/projects/${P(project.name)}/events?after=${after}`);
      events = mergeEvents(events, got);
      if (got.length < 500) break;
      after = got.at(-1).id;
    }
    state.events.set(project.name, mergeEvents(events, state.events.get(project.name) ?? []));
  }
  renderCockpitNow();
}

function renderCockpitNow() {
  state.cockpitFrame = 0;
  const project = currentProject();
  if (state.pane !== 'cockpit' || !project) return;
  $('#cockpit').replaceChildren(renderCockpit({ project, events: state.events.get(project.name) ?? [], role: state.me?.role }, document, {
    onSession: (op, button) => sessionOp(project.name, op, button),
    onStopTask: (taskId, button) => stopTask(project.name, taskId, button),
  }));
}

// 사건이 몰려와도 한 프레임에 한 번만 그린다
function scheduleCockpit(name) {
  if (state.pane !== 'cockpit' || name !== state.current || state.cockpitFrame) return;
  state.cockpitFrame = requestAnimationFrame(renderCockpitNow);
}

async function sessionOp(name, op, button) {
  $('#cockpit-error').textContent = '';
  if (button) button.disabled = true;
  const path = `/api/projects/${P(name)}/session/${op}`;
  try {
    try {
      await api(path, { method: 'POST' });
    } catch (e) {
      if (e.status !== 409 || e.body?.code !== 'TASKS_RUNNING') throw e;
      const list = (e.body.tasks ?? []).map(t => `- ${t.task_type ?? '도우미'} · ${t.description}`).join('\n');
      if (!window.confirm(`${e.message}\n${list}\n\n그래도 ${op === 'stop' ? '끌' : '다시 켤'}까요? 도우미의 일은 사라집니다.`)) return;
      await api(`${path}?confirm=1`, { method: 'POST' });
    }
    await loadProjects();
  } catch (e) {
    $('#cockpit-error').textContent = e.message;
  } finally {
    if (button) button.disabled = false;
  }
}

async function stopTask(name, taskId, button) {
  $('#cockpit-error').textContent = '';
  if (button) button.disabled = true;
  try { await api(`/api/projects/${P(name)}/tasks/${encodeURIComponent(taskId)}/stop`, { method: 'POST' }); }
  catch (e) { $('#cockpit-error').textContent = e.message; if (button) button.disabled = false; }
}

function onSessionEvent(d) {
  const list = state.events.get(d.project);
  const project = state.projects.find(p => p.name === d.project);
  if (project && d.type === 'result' && d.data?.total_cost_usd != null) project.session.cost_usd = d.data.total_cost_usd;
  if (project && d.type === 'context') project.session.context_pct = d.data?.percentage ?? null;
  if (!list) return;   // 조종석 판을 아직 안 연 과제는 열 때 받는다
  state.events.set(d.project, mergeEvents(list, [{ id: d.id, at: new Date().toISOString(), type: d.type, data: d.data }]));
  scheduleCockpit(d.project);
}

// ── 파일 판 ───────────────────────────────────────────────
async function openDir(dir) {
  const project = currentProject();
  const tree = $('#files-tree');
  if (!project) { tree.replaceChildren(); return; }
  try {
    const listing = await api(listUrl(project.name, dir));
    if (currentProject()?.name !== project.name) return;
    state.dir = listing.path;
    tree.replaceChildren(renderEntries(listing, document, { onOpenDir: openDir, onOpenFile: openFile }));
  } catch (e) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = e.status === 404 ? '과제 폴더가 없거나 열 수 없는 자리입니다' : e.message;
    tree.replaceChildren(p);
    if (dir) state.dir = '';
  }
}

async function openFile(path) {
  const project = currentProject();
  const box = $('#files-preview');
  if (!project) return;
  try {
    const preview = isImage(path) ? { kind: 'image', path, url: fileUrl(project.name, path) } : await api(fileUrl(project.name, path));
    box.replaceChildren(renderPreview(preview, document));
  } catch (e) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = e.message;
    box.replaceChildren(p);
  }
}

// ── 실시간 ────────────────────────────────────────────────
const streamHandlers = {
  message: d => addMessage(d.message),
  bot_status: d => {
    state.status.set(d.project, d);
    if (d.status !== 'thinking' && d.status !== 'tool') state.partial.delete(d.project);
    renderTabs();
    renderChip();
    renderPartial();
  },
  session_state: d => {
    state.status = applySessionState(state.status, d);
    const project = state.projects.find(p => p.name === d.project);
    if (project) project.session.state = d.state;
    renderTabs();
    renderChip();
    scheduleCockpit(d.project);
  },
  session_event: onSessionEvent,
  partial: d => {
    state.partial.set(d.project, (state.partial.get(d.project) ?? '') + d.text);
    if (d.project === state.current) renderPartial();
  },
  project_opened: () => loadProjects(),
  permission_request: d => { state.cards = applyPermissionEvent(state.cards, 'permission_request', d); renderCards(); },
  permission_resolved: d => { state.cards = applyPermissionEvent(state.cards, 'permission_resolved', d); renderCards(); },
};

function stopStream() {
  state.stream?.close();
  state.stream = null;
}

function startStream() {
  stopStream();
  const es = new EventSource('/api/stream');
  state.stream = es;
  for (const [type, fn] of Object.entries(streamHandlers)) {
    es.addEventListener(type, e => { try { fn(JSON.parse(e.data)); } catch (err) { console.error(type, err); } });
  }
  // 브라우저가 다시 붙을 때는 Last-Event-ID 를 스스로 싣는다. 완전히 닫혔으면(401 등) 로그인을 확인하고 다시 연다
  es.addEventListener('error', () => {
    if (es.readyState !== EventSource.CLOSED || state.stream !== es) return;
    setTimeout(async () => {
      if (state.stream !== es) return;
      try { await api('/api/auth/me'); state.events.clear(); startStream(); } catch { /* showLogin 이 이미 그렸다 */ }
    }, 3000);
  });
}

// ── 승인 카드 ─────────────────────────────────────────────
// 카드는 전원이 보고 단추는 admin 에게만 (web/card.js). 답이 오면 어느 탭에서 답했든 permission_resolved 로 거둔다
function renderCards() {
  const box = $('#cards');
  if (!state.cards.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '걸린 요청이 없습니다';
    box.replaceChildren(empty);
    return;
  }
  box.replaceChildren(...state.cards.map(req => renderCard(cardView(req, { role: state.me?.role }), document, answerCard)));
}

async function answerCard(view, decision, el) {
  const buttons = [...el.querySelectorAll('button')];
  for (const b of buttons) b.disabled = true;
  try {
    await api(`/api/permissions/${encodeURIComponent(view.id)}`, { method: 'POST', json: { decision } });
    state.cards = applyPermissionEvent(state.cards, 'permission_resolved', { tool_use_id: view.id });
    renderCards();
  } catch (e) {
    el.querySelector('.error').textContent = e.message;
    if (e.status === 409) {   // 다른 admin 이 먼저 답했다 — 까닭을 잠깐 보이고 거둔다
      state.cards = applyPermissionEvent(state.cards, 'permission_resolved', { tool_use_id: view.id });
      setTimeout(renderCards, 1500);
    } else {
      for (const b of buttons) b.disabled = false;
    }
  }
}

// 로그인 뒤 — 새로고침 전에 걸려 있던 카드를 되그린다
async function afterEnter() {
  try {
    state.cards = (await api('/api/permissions?pending=1')).requests;
    renderCards();
  } catch { /* 401 이면 showLogin 이 이미 그렸다 */ }
}

// ── 시작 ─────────────────────────────────────────────────
function wire() {
  $('#login-form').addEventListener('submit', login);
  $('#logout').addEventListener('click', logout);
  $('#composer').addEventListener('submit', send);
  $('#open-project').addEventListener('submit', openProject);
  for (const b of document.querySelectorAll('.rooms button')) b.addEventListener('click', () => openRoom(b.dataset.room));
  $('#body').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#composer').requestSubmit(); }
  });
  $('#body').addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  $('#file-input').addEventListener('change', e => addFiles([...e.target.files]));
  const composer = $('#composer');
  composer.addEventListener('dragover', e => { e.preventDefault(); composer.classList.add('drop'); });
  composer.addEventListener('dragleave', () => composer.classList.remove('drop'));
  composer.addEventListener('drop', e => { e.preventDefault(); composer.classList.remove('drop'); addFiles([...(e.dataTransfer?.files ?? [])]); });
}

async function boot() {
  wire();
  try { state.me = await api('/api/auth/me'); } catch (e) { if (e.status !== 401) showLogin(); return; }
  await enter();
}

boot();

export { api, state, roomKind };
