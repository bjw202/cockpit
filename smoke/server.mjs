// 스모크의 서버 자식 프로세스 — 진짜 CLI(bin/cockpit.js serve)를 띄우고 사람 역할을 HTTP 로 한다.
// 세션 조작은 admin API(POST /api/projects/:name/session/…)로만 한다 — meta 가 대본 재생의 손 걸음(압축 · 끄기 · 켜기)을
// 같은 길로 대신하므로(M3.M 준비), 스모크가 그 길을 먼저 밟는다. SDK 는 이 파일이 아니라 자식 serve 가 싣는다.

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openRuntime } from '../src/runtime.js';
import { createAccount } from '../src/auth/sessions.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BIN = path.join(REPO, 'bin', 'cockpit.js');
export const ADMIN = '김피엘';
export const MEMBER = '김과제';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function until(cond, { timeoutMs = 300_000, pollMs = 1000 } = {}) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(pollMs);
  }
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

// 스크래치(makeScratch 의 d) 에 설정 파일 · 과제 · 계정 둘. 토큰은 쿠키 값 원문
export async function prepareServer(d) {
  const port = await freePort();
  const configFile = path.join(d.root, 'cockpit.json');
  fs.writeFileSync(configFile, JSON.stringify({ ...d.config, host: '127.0.0.1', port }, null, 2));
  const rt = openRuntime(d.config);
  try {
    const opened = rt.manager.openProject({ project: d.project, botDir: d.botDir });
    const tokens = {};
    for (const [username, role] of [[ADMIN, 'admin'], [MEMBER, 'member']]) {
      const acc = await createAccount({ chatDb: rt.chatDb, cockpitDb: rt.cockpitDb, username, password: 'smoke-password', role });
      tokens[username] = rt.cockpitDb.createWebSession(acc.id);
    }
    return { configFile, port, base: `http://127.0.0.1:${port}`, tokens, rooms: { main: opened.main, files: opened.files }, bot: opened.bot };
  } finally {
    await rt.close({ keepState: true });
  }
}

// serve 를 제 프로세스 묶음(detached)으로 띄운다 — kill('SIGKILL') 이 serve 와 그 밑의 Claude CLI 를 한꺼번에 죽인다 (PC 가 꺼진 것처럼)
export async function startServe(configFile, { model, extra = [], logFile } = {}) {
  const args = [BIN, 'serve', '--config', configFile, ...(model ? ['--model', model] : []), ...extra];
  const child = spawn(process.execPath, args, { cwd: REPO, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const lines = [];
  const log = logFile ? fs.createWriteStream(logFile, { flags: 'a' }) : null;
  const take = chunk => { for (const l of String(chunk).split('\n').filter(Boolean)) { lines.push(l); log?.write(`${l}\n`); } };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  const exited = new Promise(r => child.once('exit', (code, signal) => r({ code, signal })));
  const up = await Promise.race([
    until(() => lines.some(l => l.includes('듣는 중')), { timeoutMs: 60_000, pollMs: 100 }),
    exited.then(() => null),
  ]);
  if (!up) throw new Error(`serve 가 뜨지 않았다:\n${lines.join('\n')}`);
  return {
    child, lines, exited,
    kill: signal => { try { process.kill(-child.pid, signal); } catch { /* 이미 죽었다 */ } return exited; },
  };
}

export function httpClient(base, tokens) {
  const call = async (as, method, p, { json, form } = {}) => {
    const headers = { cookie: `md_session=${tokens[as]}` };
    let body;
    if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const r = await fetch(base + p, { method, headers, body });
    const text = await r.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* JSON 이 아니다 */ }
    return { status: r.status, body: parsed };
  };
  const api = {
    call,
    project: async name => (await call(ADMIN, 'GET', '/api/projects')).body?.projects?.find(p => p.name === name) ?? null,
    session: (name, op, qs = '') => call(ADMIN, 'POST', `/api/projects/${encodeURIComponent(name)}/session/${op}${qs}`),
    events: async (name, after = 0) => {
      const out = [];
      for (;;) {
        const { body } = await call(ADMIN, 'GET', `/api/projects/${encodeURIComponent(name)}/events?after=${after}`);
        const got = body?.events ?? [];
        out.push(...got);
        if (got.length < 500) return out;
        after = got.at(-1).id;
      }
    },
    messages: async (roomId, after = 0) => (await call(ADMIN, 'GET', `/api/rooms/${roomId}/messages?after=${after}`)).body?.messages ?? [],
    post: async (roomId, text, as = MEMBER) => {
      const fd = new FormData();
      fd.append('body', text);
      return (await call(as, 'POST', `/api/rooms/${roomId}/messages`, { form: fd })).body?.message ?? null;
    },
    // 세션이 idle 이고 afterEvent 뒤로 result 가 minResults 개 이상
    waitIdleAfter: async (name, afterEvent, { minResults = 1, timeoutMs = 300_000 } = {}) => until(async () => {
      const p = await api.project(name);
      if (p?.session.state === 'error') return 'error';
      if (p?.session.state !== 'idle') return null;
      const results = (await api.events(name, afterEvent)).filter(e => e.type === 'result').length;
      return results >= minResults ? 'idle' : null;
    }, { timeoutMs, pollMs: 1500 }),
  };
  return api;
}

// 서버의 승인 중계에 뜬 카드를 admin 으로 곧바로 허용한다 — 스모크는 판정하지 않고 무엇이 물었는지만 남긴다
export function autoApprove(api, decision = 'allow') {
  const asked = [];
  const seen = new Set();
  let stopped = false;
  (async () => {
    while (!stopped) {
      const { body } = await api.call(ADMIN, 'GET', '/api/permissions?pending=1').catch(() => ({ body: null }));
      for (const req of body?.requests ?? []) {
        if (seen.has(req.tool_use_id)) continue;
        seen.add(req.tool_use_id);
        asked.push(`${req.tool}:${decision}`);
        await api.call(ADMIN, 'POST', `/api/permissions/${encodeURIComponent(req.tool_use_id)}`, { json: { decision } }).catch(() => {});
      }
      await sleep(700);
    }
  })();
  return { asked, stop: () => { stopped = true; } };
}

// 방 둘에서 afterId 뒤의 봇 글
export async function botMessagesAfter(api, rooms, afterId) {
  const out = [];
  for (const room of [rooms.main, rooms.files]) out.push(...(await api.messages(room.id, afterId)).filter(m => m.author_type === 'bot'));
  return out.sort((a, b) => a.id - b.id);
}
