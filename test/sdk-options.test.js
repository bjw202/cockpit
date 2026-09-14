import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQueryOptions, ALLOWED_TOOLS } from '../src/session/options.js';
import { buildBotEnv, ENV_WHITELIST } from '../src/session/env.js';
import { INSTRUCTIONS } from '../src/envelope/wrap.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEnv = {
  PATH: '/usr/bin', HOME: '/Users/pl', LANG: 'ko_KR.UTF-8', SHELL: '/bin/zsh',
  COCKPIT_SECRET_PROBE: 'must-not-leak', MINIDISCORD_DB: '/d/cockpit.db', AWS_SECRET_ACCESS_KEY: 'x',
};

test('옵션 칸이 설계 5.4 와 같다', () => {
  const env = buildBotEnv(serverEnv, { botDir: '/b/prodev-시험-bot' });
  const canUseTool = async () => ({ behavior: 'deny', message: 'x' });
  const o = buildQueryOptions({ botDir: '/b/prodev-시험-bot', mcpServer: { fake: true }, canUseTool, env, claudePath: '/u/claude' });
  assert.equal(o.permissionMode, 'default');
  assert.deepEqual(o.allowedTools, ['mcp__cockpit__reply', 'mcp__cockpit__fetch_history']);
  assert.deepEqual(ALLOWED_TOOLS, o.allowedTools);
  assert.deepEqual(o.settingSources, ['project', 'local']);
  assert.equal(o.strictMcpConfig, true);
  assert.equal(o.persistSession, true);
  assert.equal(o.includePartialMessages, true);
  assert.equal(o.enableFileCheckpointing, true);
  assert.equal('permissionPrompts' in o, false);
  assert.deepEqual(Object.keys(o.mcpServers), ['cockpit']);
  assert.equal(o.cwd, '/b/prodev-시험-bot');
  assert.equal(o.pathToClaudeCodeExecutable, '/u/claude');
  assert.equal(o.canUseTool, canUseTool);
  assert.deepEqual(o.systemPrompt, { type: 'preset', preset: 'claude_code', append: INSTRUCTIONS, snapshot: true });
  assert.equal('resume' in o, false);
  assert.equal('model' in o, false);
  assert.equal(buildQueryOptions({ botDir: '/b', env, resume: 'sess-1' }).resume, 'sess-1');
});

test('env 에 COCKPIT_SECRET_PROBE 가 없다', () => {
  const env = buildBotEnv(serverEnv, { botDir: '/b/x' });
  assert.equal('COCKPIT_SECRET_PROBE' in env, false);
  assert.equal('MINIDISCORD_DB' in env, false);
  assert.equal(env.PRODEV_BOT_DIR, '/b/x');
  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'LANG', 'PATH', 'PRODEV_BOT_DIR', 'SHELL']);
});

test('env 키가 화이트리스트의 부분집합', () => {
  const all = Object.fromEntries([...ENV_WHITELIST, 'EXTRA_ONE', 'NOPE'].map(k => [k, 'v']));
  const env = buildBotEnv(all, { botDir: '/b', extraKeys: ['EXTRA_ONE'] });
  for (const k of Object.keys(env)) assert.ok([...ENV_WHITELIST, 'EXTRA_ONE', 'PRODEV_BOT_DIR'].includes(k), k);
  assert.equal('NOPE' in env, false);
  // 윈도우는 이름의 대소문자를 가리지 않는다 (Path)
  const win = buildBotEnv({ Path: 'C:\\Windows', SYSTEMROOT: 'C:\\Windows', Secret: 's' }, { botDir: 'C:/b', platform: 'win32' });
  assert.deepEqual(Object.keys(win).sort(), ['PRODEV_BOT_DIR', 'Path', 'SYSTEMROOT']);
});

test('윈도우 키 여섯(USERPROFILE · APPDATA · LOCALAPPDATA · TEMP · SystemRoot · ComSpec)이 실리고 그 밖 키는 안 실린다', () => {
  // DESIGN 6절 · W1.3 이 회사 PC 에서 빼 보며 재는 목록과 맞물린다. 늘리는 것은 설정 extraEnvKeys 로만
  const SIX = ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'SystemRoot', 'ComSpec'];
  const source = {
    USERPROFILE: 'C:\\Users\\pl', APPDATA: 'C:\\Users\\pl\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\pl\\AppData\\Local',
    TEMP: 'C:\\Users\\pl\\AppData\\Local\\Temp', SystemRoot: 'C:\\WINDOWS', ComSpec: 'C:\\WINDOWS\\system32\\cmd.exe',
    Path: 'C:\\WINDOWS\\system32', USERDOMAIN: 'CORP', COMPUTERNAME: 'PL-PC', OneDrive: 'C:\\Users\\pl\\OneDrive', PSModulePath: 'C:\\x',
    ANTHROPIC_API_KEY: 'sk-ant-probe', GITHUB_TOKEN: 'ghp_probe', HTTPS_PROXY: 'http://proxy.corp:8080', COCKPIT_SECRET_PROBE: 'must-not-leak',
  };
  const env = buildBotEnv(source, { botDir: 'C:/cockpit/bots/prodev-수율-bot', platform: 'win32' });
  for (const k of SIX) assert.equal(env[k], source[k], k);
  assert.deepEqual(Object.keys(env).sort(), [...SIX, 'Path', 'PRODEV_BOT_DIR'].sort(), '여섯 + PATH + 봇 폴더 밖은 없다');
  // 윈도우는 이름의 대소문자를 가리지 않는다 — 어느 꼴로 와도 실린다
  const mixed = buildBotEnv({ systemroot: 'C:\\WINDOWS', comspec: 'cmd', temp: 't', AppData: 'a', userprofile: 'u', LocalAppData: 'l', OneDrive: 'o' }, { botDir: 'C:/b', platform: 'win32' });
  assert.deepEqual(Object.keys(mixed).sort(), ['AppData', 'LocalAppData', 'PRODEV_BOT_DIR', 'comspec', 'systemroot', 'temp', 'userprofile'].sort());
  // 맥 · 리눅스는 가린다
  assert.equal('systemroot' in buildBotEnv({ systemroot: 'x' }, { botDir: '/b', platform: 'darwin' }), false);
});

test('bypassPermissions 문자열이 src/ 에 없다', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const hits = walk(path.join(REPO, 'src')).filter(f => /(bypass|acceptEdits|dangerously)/i.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});
