// 봇 세션의 env — 화이트리스트 (ADR-007 · ARCHITECTURE 5.5).
//
// SDK options.env 는 합치기가 아니라 덮어쓰기다. {...process.env} 를 넘기면 서버의 비밀이 봇 세션에 실리고
// 봇은 Bash(node:*) 로 그것을 읽어 방에 쓸 수 있다. 로그인과 실행에 필요한 키만 넘긴다.
// 목록은 meta 실증 5(spike5-full-combo.mjs)의 WHITELIST 와 같다. 늘리는 것은 W1.3 이 잰 결과로만, 설정 extraEnvKeys 로.

export const ENV_WHITELIST = Object.freeze([
  'PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'CLAUDE_CONFIG_DIR',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'SystemRoot', 'ComSpec', 'CLAUDE_CODE_GIT_BASH_PATH',
]);

// 윈도우의 환경변수 이름은 대소문자를 가리지 않는다(Path · PATH). 맥 · 리눅스는 가린다.
export function buildBotEnv(source, { botDir, extraKeys = [], platform = process.platform } = {}) {
  const fold = platform === 'win32' ? k => k.toUpperCase() : k => k;
  const allowed = new Set([...ENV_WHITELIST, ...extraKeys].map(fold));
  const env = {};
  for (const [k, v] of Object.entries(source ?? {})) {
    if (v !== undefined && allowed.has(fold(k))) env[k] = v;
  }
  env.PRODEV_BOT_DIR = botDir;
  return env;
}
