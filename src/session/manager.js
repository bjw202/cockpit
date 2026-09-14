// 세션 관리자 — 과제마다 살아 있는 query() 하나를 띄우고 붙든다 (ARCHITECTURE 4.5 · 5절 · ADR-002 · 008).
//
// 하는 것: 과제 열기 · 켜기(resume) · 끄기 · 멈춤 · 압축 걸기 · 사람 글 넣기 · 큐 풀기 · SDK 메시지를 사건으로 접기.
// SDK 는 import 하지 않는다. queryFn · makeMcpServer 를 주입받는다 (진짜는 session/sdk-query.js, 시험은 test/fakes).
//
// 큐를 푸는 규칙: 글이 들어오면 곧바로(idle · working · waiting_approval). 밀린 글을 id 순서대로 모두(상한 20) 사용자 메시지 하나에.
// /compact 만 idle 을 기다렸다가 밀린 글보다 먼저 들어가고, 그 압축 턴 동안 글을 붙잡는다 (meta W2r.1 · ADR-008 바뀐 자리).

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { ChatError } from '../db/chat-db.js';
import { createCockpitTools } from '../mcp/tools.js';
import { wrapChannel, userMessage, CHANNEL_ORIGIN, HUMAN_ORIGIN } from '../envelope/wrap.js';
import { InputStream } from './input-stream.js';
import { buildBotEnv } from './env.js';
import { buildQueryOptions } from './options.js';

export const BATCH_LIMIT = 20;
export const COMPACT_START_TEXT = '문맥을 정리 중입니다. 곧 이어서 합니다.';
export const COMPACT_END_TEXT = '정리가 끝났습니다. 이어서 하려면 말을 걸어 주세요.';
const RUNNING = new Set(['starting', 'idle', 'working', 'waiting_approval']);
const DELIVERABLE = new Set(['idle', 'working', 'waiting_approval']);
const SUMMARY_CHARS = 200;
const STDERR_LINES = 200;

const summarize = v => {
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? null);
  return s.length > SUMMARY_CHARS ? `${s.slice(0, SUMMARY_CHARS)}…` : s;
};

// 머리 경고로 쓰는 SDK 메시지(rate_limit_event · auth_status …)에서 작은 칸만 옮긴다 — 통째로 적지 않는다
const statusFields = m => Object.fromEntries(Object.entries(m)
  .filter(([k, v]) => !['type', 'session_id', 'uuid', 'message'].includes(k) && (v == null || typeof v !== 'object'))
  .map(([k, v]) => [k, typeof v === 'string' ? summarize(v) : v]));

// 승인 중계가 붙기 전(M2)의 기본 — 묻는 것은 전부 거부한다
const denyAll = async ({ toolName }) => ({ behavior: 'deny', message: `승인 중계가 없다 — ${toolName} 거부` });

export class SessionManager extends EventEmitter {
  // origin: 채팅 글에 스탬프할 귀속. null 이면 싣지 않는다 (smoke --no-origin 판)
  constructor({ chatDb, cockpitDb, config, queryFn, makeMcpServer, permissionHandler = denyAll, processEnv = process.env, origin = CHANNEL_ORIGIN, model }) {
    super();
    Object.assign(this, { chatDb, cockpitDb, config, queryFn, makeMcpServer, permissionHandler, processEnv, origin, model });
    this.sessions = new Map();
  }

  // ── 과제 ───────────────────────────────────────────────
  openProject({ project, botName = `prodev-${project}-bot`, botDir }) {
    const opened = this.chatDb.openProject(project, botName);
    this.cockpitDb.createAgentSession({ project, botId: opened.bot.id, botDir: path.resolve(botDir) });
    return opened;
  }

  projectInfo(project) {
    const row = this.cockpitDb.agentSession(project);
    if (!row) throw new ChatError('NO_PROJECT', `과제가 없다: ${project}`, 404);
    return { row, bot: this.chatDb.botById(row.bot_id), rooms: this.chatDb.projectRooms(project) };
  }

  projectOfRoom(roomId) {
    const id = Number(roomId);
    for (const row of this.cockpitDb.agentSessions()) {
      const { main, files } = this.chatDb.projectRooms(row.project);
      if (main?.id === id || files?.id === id) return row.project;
    }
    return null;
  }

  state(project) { return this.sessions.get(project)?.state ?? this.cockpitDb.agentSession(project)?.state ?? null; }
  runningCount() { return [...this.sessions.values()].filter(s => RUNNING.has(s.state)).length; }

  // 조종석 머리의 모델 · 문맥 사용률. 서버를 다시 켜도 보이게 session_events 의 마지막 값에서 푼다
  sessionInfo(project) {
    const model = this.cockpitDb.lastEvents(project, 'init', 10).map(e => e.data.model).find(Boolean) ?? null;
    const ctx = this.cockpitDb.lastEvents(project, 'context', 1)[0]?.data ?? null;
    return { model, context_pct: Number.isFinite(ctx?.percentage) ? ctx.percentage : null };
  }

  // ── 사람 글 ────────────────────────────────────────────
  // userId 또는 username 하나. 글 · 첨부 · 대상은 chat.db 한 트랜잭션, 큐는 그 뒤 cockpit.db (ADR-003 결과)
  postUserMessage({ roomId, userId, username, body, files = [] }) {
    const project = this.projectOfRoom(roomId);
    if (!project) throw new ChatError('NO_ROOM', '방을 찾을 수 없습니다', 404);
    const { bot } = this.projectInfo(project);
    const uid = userId ?? this.chatDb.ensureUser(username).id;
    const { message, targets } = this.chatDb.insertUserMessage({ roomId, userId: uid, body, files, bot });
    for (const t of targets) this.cockpitDb.enqueue(message.id, t.botId, t.delivery);
    this.emit('message', { project, message });
    const s = this.sessions.get(project);
    if (s) this.#kick(s);
    return message;
  }

  // ── 켜기 · 끄기 ────────────────────────────────────────
  async start(project, { resume = true } = {}) {
    const { row, bot, rooms } = this.projectInfo(project);
    const existing = this.sessions.get(project);
    if (existing && RUNNING.has(existing.state)) return existing;
    if (this.runningCount() >= this.config.maxSessions) {
      throw new ChatError('LIMIT', `동시 세션 상한 ${this.config.maxSessions} 에 닿았다 — 다른 과제의 세션을 끄고 켜라`, 409);
    }
    const s = {
      project, bot, rooms, botDir: row.bot_dir, state: 'stopped', sessionId: row.session_id ?? null,
      input: null, q: null, options: null, lastToRoom: null, pendingCompact: false, pendingPermissions: 0,
      compactNoticed: false, closing: false, initialized: false, gotResult: false, stderr: [],
      toolStarted: new Map(), tasks: new Map(),
    };
    s.ready = new Promise(r => { s.resolveReady = r; });
    this.sessions.set(project, s);
    this.#setState(s, 'starting');
    this.#launch(s, resume ? row.session_id : null);
    await s.ready;
    return s;
  }

  // 서버가 다시 켜질 때: stopped 가 아닌 줄을 전부 resume 으로 켠다. 남은 큐는 idle 에 닿으면 풀린다
  async bootResume() {
    const out = [];
    for (const row of this.cockpitDb.agentSessions()) {
      if (row.state === 'stopped') continue;
      try { const s = await this.start(row.project, { resume: true }); out.push({ project: row.project, state: s.state }); }
      catch (e) { out.push({ project: row.project, error: e.message }); }
    }
    return out;
  }

  // 끄기는 언제나 된다: 살아 있는 세션(error 로 멈춘 것 포함)은 닫고, 없으면(재기동 뒤 resume 전 · 이미 꺼짐) 적힌 상태만 stopped 로
  async stop(project) {
    const s = this.sessions.get(project);
    if (!s) {
      this.projectInfo(project);
      if (this.cockpitDb.agentSession(project).state !== 'stopped') {
        this.cockpitDb.setState(project, 'stopped');
        this.emit('state', { project, state: 'stopped' });
      }
      return;
    }
    s.closing = true;
    s.input?.end();
    try { s.q?.close?.(); } catch { /* 이미 끝났다 */ }
    this.#setState(s, 'stopped');
    this.sessions.delete(project);
    this.#event(s, 'command', { command: 'stop' });
  }

  // 서버가 꺼질 때: 세션을 닫되 적힌 상태는 그대로 둔다 — 다음 기동의 bootResume 이 되살린다 (ARCHITECTURE 5.1)
  async release(project) {
    const s = this.sessions.get(project);
    if (!s) return;
    s.closing = true;
    s.input?.end();
    try { s.q?.close?.(); } catch { /* 이미 끝났다 */ }
    this.sessions.delete(project);
  }

  // 큐를 거치지 않는 유일한 조작
  async interrupt(project) {
    const s = this.#running(project);
    this.#event(s, 'command', { command: 'interrupt' });
    await s.q?.interrupt?.();
  }

  // 걸어 두었다가 다음 idle 에 밀린 글보다 먼저 넣는다. 돌려주는 것: 걸어 두었나(true) · 곧바로 넣었나(false)
  compact(project) {
    const s = this.#running(project);
    const queued = s.state !== 'idle';
    s.pendingCompact = true;
    this.#event(s, 'command', { command: '/compact', queued });
    this.#kick(s);
    return queued;
  }

  // 돌고 있는 백그라운드 도우미 — background_tasks_changed 의 마지막 집합에서 ambient(활동 아님)를 뺀 것
  backgroundTasks(project) {
    const s = this.sessions.get(project);
    return s ? [...s.tasks.values()].filter(t => !t.ambient) : [];
  }

  async stopTask(project, taskId) {
    const s = this.#running(project);
    this.#event(s, 'command', { command: 'stop_task', task_id: taskId });
    await s.q?.stopTask?.(taskId);
  }

  // 다시 켜기: 지금 프로세스를 닫고 같은 session_id 로 resume. error 로 멈춘 세션을 되살리는 길이기도 하다
  async restart(project) {
    const s = this.sessions.get(project);
    if (s) {
      s.closing = true;
      s.input?.end();
      try { s.q?.close?.(); } catch { /* 이미 끝났다 */ }
      this.sessions.delete(project);
      this.#event(s, 'command', { command: 'restart' });
    }
    return this.start(project, { resume: true });
  }

  #running(project) {
    const s = this.sessions.get(project);
    if (!s || !RUNNING.has(s.state)) throw new ChatError('NOT_RUNNING', `세션이 꺼져 있다: ${project}`, 409);
    return s;
  }

  // ── SDK 와 잇기 ────────────────────────────────────────
  #launch(s, resumeId) {
    s.input = new InputStream();
    s.initialized = false;
    s.gotResult = false;
    s.toolStarted.clear();
    s.tasks.clear();   // background_tasks_changed 는 CLI 프로세스마다의 값이다 — 새 프로세스면 빈 집합에서 (SDK 주석)
    const tools = createCockpitTools({
      chatDb: this.chatDb, bot: s.bot, rooms: s.rooms,
      projectsDir: this.config.projectsDir, uploadsDir: this.config.uploadsDir,
      getLastToRoom: () => s.lastToRoom,
      onBotMessage: message => this.emit('message', { project: s.project, message }),
    });
    s.options = buildQueryOptions({
      botDir: s.botDir,
      mcpServer: this.makeMcpServer(tools),
      canUseTool: (toolName, input, opts) => this.#canUseTool(s, toolName, input, opts),
      env: buildBotEnv(this.processEnv, { botDir: s.botDir, extraKeys: this.config.extraEnvKeys ?? [] }),
      claudePath: this.config.claudePath,
      resume: resumeId || undefined,
      model: this.model,
      stderr: data => { s.stderr.push(...String(data).split('\n').filter(Boolean)); s.stderr.splice(0, Math.max(0, s.stderr.length - STDERR_LINES)); },
    });
    let q;
    try { q = this.queryFn({ prompt: s.input, options: s.options }); }
    catch (e) { this.#launchFailed(s, resumeId, e); return; }
    s.q = q;
    this.#pump(s, q, resumeId);
  }

  async #pump(s, q, resumeId) {
    try {
      if (typeof q.initializationResult === 'function') {
        const init = await q.initializationResult();
        this.#event(s, 'init', {
          account: { apiKeySource: init?.account?.apiKeySource ?? null, subscriptionType: init?.account?.subscriptionType ?? null },
          commands: (init?.commands ?? []).length, agents: (init?.agents ?? []).map(a => a.name), resumed: !!resumeId,
        });
      }
      if (s.closing || q !== s.q) return;
      s.initialized = true;
      this.#setState(s, 'idle');
      s.resolveReady();
      this.#kick(s);
      for await (const m of q) {
        if (q !== s.q) return;
        this.#onMessage(s, m);
      }
      if (!s.closing && q === s.q) this.#fail(s, new Error('세션이 끝났다 (CLI 프로세스 종료)'));
    } catch (e) {
      if (s.closing || q !== s.q) return;
      if (resumeId && !s.gotResult) { this.#launchFailed(s, resumeId, e); return; }
      this.#fail(s, e);
    }
  }

  // resume 이 실패하면(기록 파일 없음 등) 새 세션으로 켜고 까닭을 남긴다
  #launchFailed(s, resumeId, e) {
    if (!resumeId) { this.#fail(s, e); return; }
    this.#event(s, 'resume_failed', { session_id: resumeId, error: String(e?.message ?? e).split('\n')[0] });
    s.input?.end();
    s.q = null;
    this.#launch(s, null);
  }

  #fail(s, e) {
    this.#event(s, 'error', { error: String(e?.message ?? e).split('\n')[0], stderr: s.stderr.slice(-20) });
    s.input?.end();
    this.#setState(s, 'error');
    s.resolveReady();
  }

  async #canUseTool(s, toolName, input, opts) {
    s.pendingPermissions++;
    this.#setState(s, 'waiting_approval');
    try {
      return await this.permissionHandler({ project: s.project, toolName, input, options: opts, rooms: s.rooms });
    } catch (e) {
      return { behavior: 'deny', message: `승인 중계 오류: ${e.message}` };
    } finally {
      s.pendingPermissions--;
      if (s.pendingPermissions === 0 && s.state === 'waiting_approval') this.#setState(s, 'working');
    }
  }

  // ── 큐 ─────────────────────────────────────────────────
  // 글은 들어오는 즉시 배달한다 — idle 뿐 아니라 working · waiting_approval 중에도. SDK 가 그 턴에 접어 넣는다
  // (옛 채널 플러그인과 같다. prodev orchestrator 가 "한 턴에 여러 방의 @TO" 를 전제한다 — meta W2 반려 W2r.1 · ADR-008).
  // 예외는 /compact 하나: idle 을 기다렸다가 밀린 글보다 먼저 넣고, 그 압축 턴이 끝날 때까지 글을 붙잡는다.
  #kick(s) {
    if (s.closing || !DELIVERABLE.has(s.state)) return;
    if (s.state === 'idle' && s.pendingCompact) {
      s.pendingCompact = false;
      s.compacting = true;
      s.input.push(userMessage('/compact', { origin: this.origin ? HUMAN_ORIGIN : null }));
      this.#setState(s, 'working');
      this.#event(s, 'delivered', { command: '/compact' });
      return;
    }
    if (s.compacting) return;
    const rows = this.cockpitDb.pendingInbox(s.bot.id, BATCH_LIMIT);
    if (!rows.length) return;
    const blocks = [];
    for (const r of rows) {
      const msg = this.chatDb.messageById(r.message_id);
      if (!msg) continue;
      const room = this.chatDb.roomById(msg.room_id);
      if (r.delivery === 'to') s.lastToRoom = msg.room_id;
      blocks.push(wrapChannel({
        chatId: String(msg.room_id), messageId: String(msg.id), delivery: r.delivery,
        sender: msg.author_name, authorType: msg.author_type, roomName: room?.name ?? '',
        body: msg.body, files: this.chatDb.attachmentsOf(msg.id).map(a => a.path),
      }));
    }
    this.cockpitDb.markDelivered(rows.map(r => r.id));
    if (!blocks.length) return;
    s.input.push(userMessage(blocks.join('\n\n'), { origin: this.origin }));
    if (s.state === 'idle') this.#setState(s, 'working');   // waiting_approval 이면 그대로 둔다
    this.#event(s, 'delivered', { message_ids: rows.map(r => r.message_id) });
  }

  // ── SDK 메시지 → 사건 (ARCHITECTURE 5.3) ───────────────
  #onMessage(s, m) {
    if (m.session_id && m.session_id !== s.sessionId) {
      s.sessionId = m.session_id;
      this.cockpitDb.setSessionId(s.project, m.session_id);
    }
    // 턴 도중에 넣은 글을 SDK 가 그 턴에 접지 않고 result 뒤에 새 턴으로 이어 돌 때가 있다 — 그때 큐는 비어 있어 #kick 이 상태를 안 바꾼다.
    // 봇이 다시 말하거나 도구 결과가 오면 일하는 중이다 (meta W2r 17:54 — 즉시 배달 뒤 GET /api/projects 가 idle 로 보였다)
    if (s.state === 'idle' && (m.type === 'assistant' || m.type === 'stream_event' || (m.type === 'user' && Array.isArray(m.message?.content) && m.message.content.some(b => b.type === 'tool_result')))) {
      this.#setState(s, 'working');
    }
    switch (m.type) {
      case 'stream_event':
        this.emit('partial', { project: s.project, event: m.event });   // 살아 있는 화면만. 적지 않는다 (DESIGN V4)
        return;
      case 'assistant':
        for (const b of m.message?.content ?? []) {
          if (b.type !== 'tool_use') continue;
          s.toolStarted.set(b.id, Date.now());
          // file_path 는 요약에서 잘리지 않게 따로 적는다 — 긴 첨부 경로가 200자 요약 밖으로 밀린다 (m1-envelope 에서 봤다)
          this.#event(s, 'tool_use', { id: b.id, name: b.name, input: summarize(b.input), file_path: b.input?.file_path ?? null, parent_tool_use_id: m.parent_tool_use_id ?? null });
        }
        return;
      case 'user':
        for (const b of Array.isArray(m.message?.content) ? m.message.content : []) {
          if (b.type !== 'tool_result') continue;
          const started = s.toolStarted.get(b.tool_use_id);
          s.toolStarted.delete(b.tool_use_id);
          this.#event(s, 'tool_result', {
            tool_use_id: b.tool_use_id, is_error: !!b.is_error, content: summarize(b.content),
            duration_ms: started == null ? null : Date.now() - started, parent_tool_use_id: m.parent_tool_use_id ?? null,
          });
        }
        return;
      case 'result':
        s.gotResult = true;
        s.compacting = false;
        this.cockpitDb.recordResult(s.project, m.total_cost_usd);
        this.#event(s, 'result', { subtype: m.subtype, num_turns: m.num_turns, duration_ms: m.duration_ms, total_cost_usd: m.total_cost_usd, permission_denials: (m.permission_denials ?? []).length });
        if (s.state !== 'stopped' && s.state !== 'error') {
          this.#setState(s, 'idle');
          this.#kick(s);
        }
        this.#contextUsage(s);
        return;
      case 'system':
        return this.#onSystem(s, m);
      default:
        // rate_limit_event · auth_status 는 머리 경고의 재료 (5.3). 그 밖의 모르는 메시지도 이름만은 남긴다
        this.#event(s, 'status', { type: m.type, ...statusFields(m) });
    }
  }

  #onSystem(s, m) {
    switch (m.subtype) {
      case 'status':
        this.#event(s, 'status', { status: m.status ?? null, compact_result: m.compact_result ?? null });
        if (m.status === 'compacting' && !s.compactNoticed) { this.#system(s, COMPACT_START_TEXT); s.compactNoticed = true; }
        return;
      case 'compact_boundary':
        if (!s.compactNoticed) this.#system(s, COMPACT_START_TEXT);
        this.#system(s, COMPACT_END_TEXT);
        s.compactNoticed = false;
        this.#event(s, 'compact', m.compact_metadata ?? {});
        return;
      case 'hook_started':
      case 'hook_response':
        this.#event(s, 'hook', { subtype: m.subtype, hook_event: m.hook_event ?? null, hook_name: m.hook_name ?? null, exit_code: m.exit_code ?? null });
        return;
      case 'init':
        this.#event(s, 'init', { model: m.model ?? null, permissionMode: m.permissionMode ?? null, mcp_servers: m.mcp_servers ?? [] });
        return;
      case 'background_tasks_changed':
        // 수준 신호 — 받을 때마다 집합을 통째로 바꾼다 (SDK 주석: 시작 · 끝 짝을 맞추지 말 것)
        s.tasks = new Map((m.tasks ?? []).map(t => [t.task_id, { task_id: t.task_id, task_type: t.task_type ?? null, description: summarize(t.description ?? ''), ambient: !!t.ambient }]));
        this.#event(s, 'task', { subtype: m.subtype, tasks: [...s.tasks.values()] });
        return;
      default:
        if (String(m.subtype).startsWith('task_')) {
          this.#event(s, 'task', {
            subtype: m.subtype, task_id: m.task_id ?? null, tool_use_id: m.tool_use_id ?? null,
            description: summarize(m.description ?? m.summary ?? m.patch?.description ?? ''),
            status: m.status ?? m.patch?.status ?? null, is_backgrounded: m.is_backgrounded ?? m.patch?.is_backgrounded ?? null,
            subagent_type: m.subagent_type ?? null, last_tool_name: m.last_tool_name ?? null,
          });
        } else this.#event(s, 'system', { subtype: m.subtype });
    }
  }

  // result 뒤마다 문맥 사용률 (5.3 context). 머리 표시일 뿐이라 실패해도 세션을 건드리지 않는다
  async #contextUsage(s) {
    const q = s.q;
    if (typeof q?.getContextUsage !== 'function') return;
    try {
      const u = await q.getContextUsage({ detail: 'summary' });
      if (s.closing || q !== s.q) return;
      const pct = Number.isFinite(u?.percentage) ? u.percentage : (u?.maxTokens ? (100 * u.totalTokens) / u.maxTokens : null);
      this.#event(s, 'context', { percentage: pct, total_tokens: u?.totalTokens ?? null, max_tokens: u?.maxTokens ?? null, model: u?.model ?? null });
    } catch { /* 문맥 사용률을 못 받으면 머리에 빈칸 */ }
  }

  #system(s, text) {
    const message = this.chatDb.insertSystemMessage(s.rooms.main.id, text);
    this.emit('message', { project: s.project, message });
  }

  #event(s, type, data) {
    const id = this.cockpitDb.addEvent(s.project, type, data);
    this.emit('session_event', { project: s.project, id, type, data });
  }

  #setState(s, state) {
    s.state = state;
    this.cockpitDb.setState(s.project, state);
    this.emit('state', { project: s.project, state });
  }
}
