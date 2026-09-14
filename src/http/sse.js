// SSE 허브 — 브라우저 실시간은 GET /api/stream 하나에 사건을 전부 싣는다 (ADR-012 · ARCHITECTURE 8.2).
//
// 사건: message · bot_status · session_event · session_state · permission_request · permission_resolved · partial.
// partial(살아 있는 글자) 밖의 사건은 id 를 붙이고 최근 BUFFER_SIZE 개를 메모리에 들고 있다가,
// 다시 붙는 브라우저가 Last-Event-ID 를 주면 그 뒤의 것만 다시 보낸다. partial 은 id 없이 흘리고 놓치면 버린다.
// id 는 허브가 생긴 시각(ms)에서 시작해 1씩 는다 — 서버를 다시 켜도 옛 id 보다 커서 새 사건을 놓치지 않는다.
// 조종석 판의 턴 단위 기록은 이 버퍼가 아니라 session_events 표에서 되그린다 (M3).

import { hashToken } from '../db/cockpit-db.js';

export const BUFFER_SIZE = 1000;
export const HEARTBEAT_MS = 25_000;

const frameOf = (event, data, id) => `${id != null ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export class SseHub {
  constructor({ bufferSize = BUFFER_SIZE, heartbeatMs = HEARTBEAT_MS, startId = Date.now() } = {}) {
    this.bufferSize = bufferSize;
    this.lastId = startId;
    this.buffer = [];
    this.clients = new Set();
    // 사내 프록시가 조용한 연결을 끊지 않게 주석 한 줄씩
    this.timer = setInterval(() => { for (const c of this.clients) c.res.write(': ping\n\n'); }, heartbeatMs);
    this.timer.unref();
  }

  publish(event, data) {
    const id = ++this.lastId;
    const frame = frameOf(event, data, id);
    this.buffer.push({ id, frame });
    if (this.buffer.length > this.bufferSize) this.buffer.shift();
    for (const c of this.clients) c.res.write(frame);
    return id;
  }

  publishPartial(data) {
    const frame = frameOf('partial', data, null);
    for (const c of this.clients) c.res.write(frame);
  }

  // token: 이 흐름을 연 쿠키 값 — 로그아웃하면 그 흐름만 닫는다. 원문은 들고 있지 않는다
  subscribe(res, { token, user, lastEventId }) {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write(': connected\n\n');
    const last = Number(lastEventId);
    if (lastEventId != null && lastEventId !== '' && Number.isFinite(last)) {
      for (const f of this.buffer) if (f.id > last) res.write(f.frame);
    }
    const client = { res, tokenHash: hashToken(token), userId: user?.id ?? null };
    this.clients.add(client);
    res.on('close', () => this.clients.delete(client));
    return client;
  }

  closeToken(token) {
    const h = hashToken(token);
    for (const c of [...this.clients]) {
      if (c.tokenHash === h) { this.clients.delete(c); c.res.end(); }
    }
  }

  closeAll() {
    for (const c of [...this.clients]) c.res.end();
    this.clients.clear();
    clearInterval(this.timer);
  }
}

// 봇 상태 칩의 재료 (화면 web/chat.js 의 statusChip 이 글자로 바꾼다)
export function botStatusOfState(state) {
  return { working: 'thinking', waiting_approval: 'approval', stopped: 'off', error: 'off', idle: 'idle', starting: 'starting' }[state] ?? 'off';
}

// 세션 관리자 · 승인 중계의 사건을 허브로 잇는다. 한 서버에 한 번
export function connectHub(hub, { manager, relay } = {}) {
  manager?.on('message', ({ project, message }) => hub.publish('message', { project, message }));
  manager?.on('state', ({ project, state }) => {
    hub.publish('session_state', { project, state });
    hub.publish('bot_status', { project, status: botStatusOfState(state) });
  });
  manager?.on('session_event', ({ project, id, type, data }) => {
    hub.publish('session_event', { project, id, type, data });
    if (type === 'tool_use') hub.publish('bot_status', { project, status: 'tool', tool: data?.name ?? null });
    else if (type === 'tool_result') hub.publish('bot_status', { project, status: 'thinking' });
  });
  // stream_event 를 통째로 흘리지 않는다 — 글자 조각만
  manager?.on('partial', ({ project, event }) => {
    const text = event?.type === 'content_block_delta' && event.delta?.type === 'text_delta' ? event.delta.text : null;
    if (text) hub.publishPartial({ project, text });
  });
  relay?.on('message', ({ project, message }) => hub.publish('message', { project, message }));
  relay?.on('permission_request', data => hub.publish('permission_request', data));
  relay?.on('permission_resolved', data => hub.publish('permission_resolved', data));
}
