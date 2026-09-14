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

test('bypassPermissions 문자열이 src/ 에 없다', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const hits = walk(path.join(REPO, 'src')).filter(f => /(bypass|acceptEdits|dangerously)/i.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});
