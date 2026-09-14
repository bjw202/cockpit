// 화면의 몸통 — 로그인 · 과제 탭 · 방 둘 · 글 · 첨부 · 실시간 (ARCHITECTURE 7절). 프레임워크 · 빌드 · CDN 없음 (ADR-010).
// 글자를 넣는 곳은 textContent 와 markdown.js 뿐이다 (innerHTML 없음 — test/web-static.test.js).

import { defaultComposerText, messageView, renderMessage, roomKind, statusChip, statusOfState } from './chat.js';

const $ = sel => document.querySelector(sel);

const state = {
  me: null,
  projects: [],
  current: null,            // 과제 이름
  room: 'main',             // main | files
  messages: new Map(),      // 방 id → 글 배열 (연 방만)
  status: new Map(),        // 과제 → { status, tool }
  partial: new Map(),       // 과제 → 봇이 지금 쓰는 글자
  files: [],                // 보낼 첨부
  lastDefault: '',
  stream: null,
};

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function api(path, { method = 'GET', json, form } = {}) {
  const init = { method, headers: {} };
  if (json !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(json); }
  if (form) init.body = form;
  const r = await fetch(path, init);
  const body = await r.json().catch(() => null);
  if (r.status === 401 && path !== '/api/auth/login') showLogin();
  if (!r.ok) throw new ApiError(r.status, body?.error ?? body?.message ?? `HTTP ${r.status}`);
  return body;
}

const currentProject = () => state.projects.find(p => p.name === state.current) ?? null;
const currentRoom = () => currentProject()?.rooms?.[state.room] ?? null;
const projectOfRoom = roomId => state.projects.find(p => p.rooms.main?.id === roomId || p.rooms.files?.id === roomId) ?? null;

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

// ── 과제 · 방 ─────────────────────────────────────────────
async function loadProjects(select) {
  const { projects } = await api('/api/projects');
  state.projects = projects;
  for (const p of projects) if (!state.status.has(p.name)) state.status.set(p.name, { status: statusOfState(p.session.state) });
  if (select) state.current = select;
  if (!projects.some(p => p.name === state.current)) state.current = projects[0]?.name ?? null;
  renderTabs();
  await openRoom(state.room);
}

function renderTabs() {
  const nav = $('#tabs');
  nav.replaceChildren();
  for (const p of state.projects) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tab${p.name === state.current ? ' active' : ''}`;
    b.textContent = p.name;
    const chip = statusChip(state.status.get(p.name)?.status);
    if (chip) {
      const dot = document.createElement('span');
      dot.className = `dot tone-${chip.tone}`;
      dot.title = chip.text;
      b.append(dot);
    }
    b.addEventListener('click', () => { state.current = p.name; renderTabs(); openRoom(state.room); });
    nav.append(b);
  }
  if (!state.projects.length) {
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.textContent = state.me?.role === 'admin' ? '열린 과제가 없습니다 — 오른쪽에서 과제를 여세요' : '열린 과제가 없습니다';
    nav.append(empty);
  }
}

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
  list.replaceChildren(...state.messages.get(room.id).map(m => renderMessage(messageView(m, { me: state.me }))));
  list.scrollTop = list.scrollHeight;
}

function addMessage(message) {
  const project = projectOfRoom(message.room_id);
  if (message.author_type === 'bot' && project) { state.partial.delete(project.name); renderPartial(); }
  const list = state.messages.get(message.room_id);
  if (!list || list.some(m => m.id === message.id)) return;   // 아직 안 연 방은 열 때 받는다
  list.push(message);
  if (currentRoom()?.id !== message.room_id) return;
  const el = $('#messages');
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  el.append(renderMessage(messageView(message, { me: state.me })));
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
  partial: d => {
    state.partial.set(d.project, (state.partial.get(d.project) ?? '') + d.text);
    if (d.project === state.current) renderPartial();
  },
  project_opened: () => loadProjects(),
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
      try { await api('/api/auth/me'); startStream(); } catch { /* showLogin 이 이미 그렸다 */ }
    }, 3000);
  });
}

// 로그인 뒤에 더 붙이는 자리 (승인 카드 — M2.6)
function afterEnter() {}

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
