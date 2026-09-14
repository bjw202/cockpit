// prodev setup.js 를 자식 프로세스로 부른다 — 방 만들기의 ① 걸음 (ARCHITECTURE 4.6 · ADR-017).
//
// 같은 일을 cockpit 이 다시 짜지 않는다: 봇 설정의 진실(허용 · deny · 훅 배선)은 prodev 한 곳에 남는다.
// 명령 줄이 계약이다: node <prodevDir>/scripts/setup.js --project <과제> --cockpit <설정 파일>.
// exit 0 이면 <prodevDir>/bots/prodev-<과제>-bot/.claude/settings.local.json 이 있어야 한다 — 확인은 부르는 쪽(create.js)이 한다.
// env 는 부르는 쪽이 화이트리스트로 만들어 넘긴다. 이 파일은 process.env 를 통째로 넘기지 않는다 (ADR-007).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const SETUP_TIMEOUT_MS = 60_000;
export const TAIL_LINES = 20;

export const setupScript = prodevDir => path.join(prodevDir, 'scripts', 'setup.js');

// 돌려주는 것: { code, timedOut, tail:[표준 출력 · 오류의 마지막 20줄] }. 던지지 않는다
export function runSetup({ prodevDir, project, configFile, env, timeoutMs = SETUP_TIMEOUT_MS }) {
  const script = setupScript(prodevDir);
  if (!fs.existsSync(script)) return Promise.resolve({ code: 1, timedOut: false, tail: [`setup.js 가 없다: ${script}`] });
  return new Promise(resolve => {
    const lines = [];
    const take = chunk => {
      for (const l of String(chunk).split(/\r?\n/)) if (l) lines.push(l);
      if (lines.length > 400) lines.splice(0, lines.length - 400);
    };
    let child;
    try {
      child = spawn(process.execPath, [script, '--project', project, '--cockpit', configFile],
        { cwd: prodevDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ code: 1, timedOut: false, tail: [String(e.message).split('\n')[0]] });
      return;
    }
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    let timedOut = false;
    let done = false;
    const finish = out => { if (!done) { done = true; clearTimeout(timer); resolve(out); } };
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch { /* 이미 끝났다 */ } }, timeoutMs);
    child.on('error', e => finish({ code: 1, timedOut, tail: [...lines, String(e.message).split('\n')[0]].slice(-TAIL_LINES) }));
    child.on('close', code => finish({
      code: timedOut ? 1 : code ?? 1, timedOut,
      tail: [...lines, ...(timedOut ? [`시간 초과 ${timeoutMs}ms`] : [])].slice(-TAIL_LINES),
    }));
  });
}

// 실패 응답의 첫 줄 — setup 이 내는 "오류: …" 줄이 있으면 그것, 없으면 마지막 줄
export function setupErrorLine(tail = []) {
  return tail.find(l => /^오류[:：]/.test(l)) ?? tail.at(-1) ?? '(출력 없음)';
}
