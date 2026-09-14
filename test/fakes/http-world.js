// HTTP 시험의 자리 — 임시 폴더 · 설정 파일 · 저장소 둘 · 모의 SDK 세션 관리자 · 임시 포트의 서버.
// 시험이 스스로 띄웠다 닫는다 (VERIFICATION 1절 — 네트워크는 127.0.0.1 임시 포트뿐).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { openRuntime } from '../../src/runtime.js';
import { createServer } from '../../src/http/server.js';
import { createAccount } from '../../src/auth/sessions.js';
import { makeFakeQueryFn } from './fake-query.js';
import { makeFakeSetup } from './fake-setup.js';

// runSetup: 방 만들기(POST /api/rooms · /api/projects)가 부르는 setup — 기본은 가짜 ok (진짜 prodev setup.js 는 계약 시험만)
export async function httpWorld({ turns, webDir, config: extra = {}, runtime = {}, runSetup = makeFakeSetup() } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-http-')));
  const config = { maxSessions: 3, approvalTimeoutMin: 10, extraEnvKeys: [], host: '127.0.0.1', port: 3000, claudePath: null, tls: null };
  for (const k of ['botsDir', 'projectsDir', 'uploadsDir', 'dataDir']) {
    config[k] = path.join(dir, k);
    fs.mkdirSync(config[k], { recursive: true });
  }
  Object.assign(config, extra);
  const configFile = path.join(dir, 'cockpit.json');
  fs.writeFileSync(configFile, JSON.stringify(config));

  const queryFn = makeFakeQueryFn({ turns });
  const rt = openRuntime(config, { binding: { queryFn, makeMcpServer: handlers => ({ handlers }) }, processEnv: { PATH: '/bin', HOME: '/h' }, ...runtime });
  const server = createServer({ ...rt, config, configFile, runSetup, webDir });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokens = {};

  const w = {
    ...rt, dir, config, configFile, queryFn, runSetup, rt, server, base, tokens,
    async user(username, role = 'member', password = 'password-1234') {
      const acc = await createAccount({ chatDb: rt.chatDb, cockpitDb: rt.cockpitDb, username, password, role });
      tokens[username] = rt.cockpitDb.createWebSession(acc.id);
      return acc;
    },
    open(project = '시험', botName) {
      const name = botName ?? `prodev-${project}-bot`;
      const botDir = path.join(config.botsDir, name);
      fs.mkdirSync(botDir, { recursive: true });
      return rt.manager.openProject({ project, botDir, botName: name });
    },
    // as: 계정 이름(tokens 에서 찾는다) · 날 토큰 · null(쿠키 없음)
    fetch(as, p, init = {}) {
      const cookie = as ? { cookie: `md_session=${tokens[as] ?? as}` } : {};
      return fetch(base + p, { ...init, headers: { ...cookie, ...(init.headers ?? {}) } });
    },
    async json(as, p, init) {
      const r = await w.fetch(as, p, init);
      const text = await r.text();
      let body = null;
      try { body = JSON.parse(text); } catch { /* JSON 이 아니다 */ }
      return { status: r.status, body, text, headers: r.headers };
    },
    // fetch 는 주소의 ../ 를 먼저 접는다. 날 경로를 그대로 보내야 하는 시험이 쓴다
    raw(p, headers = {}) {
      return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: server.address().port, path: p, headers }, r => {
          let text = '';
          r.setEncoding('utf8');
          r.on('data', c => { text += c; });
          r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, text }));
        });
        req.on('error', reject);
      });
    },
    async close() {
      server.closeAllConnections();
      await new Promise(r => server.close(r));
      await rt.close();
    },
  };
  return w;
}
