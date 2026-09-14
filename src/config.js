// 설정 한 장(cockpit.json)을 읽고 검사한다. 기동과 `cockpit check` 가 같은 함수를 쓴다 (ARCHITECTURE 10절).
//
// 경로마다 넷을 본다: 절대 경로 · 공백 없음 · 있음 · (uploadsDir · dataDir 은) 쓸 수 있음.
// 공백을 막는 까닭: 봇의 Bash 는 윈도우에서 Git Bash 이고, 공백 든 경로에서 조용히 깨진다 (DESIGN 7절).
// 윈도우에서 claudePath 를 요구하는 까닭: SDK 가 raw spawn 을 써서 npm 셸 래퍼를 못 따라간다 (DESIGN 2.2).

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = Object.freeze({
  claudePath: null,
  maxSessions: 3,
  host: '127.0.0.1',
  port: 3000,
  approvalTimeoutMin: 10,
  extraEnvKeys: [],
  tls: null,
});

export const PATH_KEYS = ['botsDir', 'projectsDir', 'uploadsDir', 'dataDir'];
const WRITABLE_KEYS = new Set(['uploadsDir', 'dataDir']);

function defaultWritable(p) {
  try { fs.accessSync(p, fs.constants.W_OK); return true; } catch { return false; }
}

// raw: 파일에서 읽은 객체. 돌려주는 것: { config(기본값을 채운 것), errors: [{ key, reason }] }
export function validateConfig(raw, { platform = process.platform, exists = p => fs.existsSync(p), writable = defaultWritable } = {}) {
  const P = platform === 'win32' ? path.win32 : path.posix;
  const config = { ...DEFAULTS, ...(raw || {}) };
  const errors = [];
  const bad = (key, reason) => { errors.push({ key, reason }); return false; };

  const checkPath = (key, value, mustWrite) => {
    if (typeof value !== 'string' || value === '') return bad(key, '값이 없다');
    if (!P.isAbsolute(value)) return bad(key, `절대 경로가 아니다: ${value}`);
    if (/\s/.test(value)) return bad(key, `경로에 공백이 있다 (Git Bash 가 깨진다): ${value}`);
    if (!exists(value)) return bad(key, `없다: ${value}`);
    if (mustWrite && !writable(value)) return bad(key, `쓸 수 없다: ${value}`);
    return true;
  };

  for (const key of PATH_KEYS) checkPath(key, config[key], WRITABLE_KEYS.has(key));

  if (config.claudePath) checkPath('claudePath', config.claudePath, false);
  else if (platform === 'win32') bad('claudePath', '윈도우에서는 반드시 준다 (pathToClaudeCodeExecutable)');

  if (!Number.isInteger(config.maxSessions) || config.maxSessions < 1) bad('maxSessions', `1 이상의 정수여야 한다: ${config.maxSessions}`);
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) bad('port', `포트가 아니다: ${config.port}`);
  if (!(config.approvalTimeoutMin > 0)) bad('approvalTimeoutMin', `0 보다 커야 한다: ${config.approvalTimeoutMin}`);
  if (!Array.isArray(config.extraEnvKeys) || config.extraEnvKeys.some(k => typeof k !== 'string')) bad('extraEnvKeys', '문자열 배열이어야 한다');
  if (config.tls) {
    checkPath('tls.cert', config.tls.cert, false);
    checkPath('tls.key', config.tls.key, false);
  }
  return { config, errors };
}

export function loadConfig(file, opts) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { config: { ...DEFAULTS }, errors: [{ key: '(파일)', reason: `설정을 못 읽었다: ${file} — ${String(e.message).split('\n')[0]}` }] };
  }
  return validateConfig(raw, opts);
}
