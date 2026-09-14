// 스모크 스크래치 자리 (meta W2r.3). 형제 prodev 의 파일로 만든다 — 없으면 건너뛴다 (건너뜀은 통과로 세지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeScratch, localSettingsDrift, PRODEV } from '../smoke/scratch.mjs';

const skip = fs.existsSync(path.join(PRODEV, 'common', 'settings.template.json')) ? false : `형제 prodev 없음 (${PRODEV})`;
const scratch = () => makeScratch(path.join(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-scratch-'))), 's'), 'smoke');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

test('makeScratch 뒤 <봇 폴더>/../../scripts/find.js 가 실제 파일', { skip }, () => {
  const d = scratch();
  const find = path.join(d.botDir, '..', '..', 'scripts', 'find.js');
  assert.ok(fs.statSync(find).isFile());
  assert.equal(fs.realpathSync(find), fs.realpathSync(path.join(PRODEV, 'scripts', 'find.js')), '실제 prodev 의 find.js 다');
  assert.ok(fs.statSync(path.join(d.botDir, '..', '..', 'common', 'hooks', 'pre-reply.js')).isFile());
  if (fs.existsSync(path.join(PRODEV, 'scripts', 'plot.py'))) assert.ok(fs.existsSync(path.join(d.botDir, '..', '..', 'scripts', 'plot.py')));
  assert.equal(d.botsDir, path.join(d.root, 'prodev', 'bots'));
  assert.equal(d.config.botsDir, d.botsDir, 'cockpit.json 의 botsDir 도 그 bots/');
  assert.equal(path.dirname(d.botDir), d.botsDir);
  assert.ok(fs.existsSync(path.join(d.shim, 'CLAUDE.md')) && fs.existsSync(path.join(d.botDir, 'CLAUDE.md')));
});

test('makeScratch 는 허용 · 거부를 settings.local.json 에, 훅 · env 를 settings.json 에 쓴다', { skip }, () => {
  const d = scratch();
  const settings = readJson(d.settingsFile);
  const local = readJson(d.localSettingsFile);
  assert.equal(settings.permissions, undefined, 'SDK 세션은 settings.json 의 permissions.allow 를 안 읽는다');
  assert.ok(Array.isArray(local.permissions.allow) && local.permissions.allow.length > 0);
  assert.ok(local.permissions.allow.includes('mcp__cockpit__reply'));
  assert.ok(local.permissions.deny.some(r => r.startsWith('Read(') && r.includes('cockpit.db')));
  assert.ok(settings.hooks.PreToolUse.some(h => h.matcher === 'mcp__cockpit__reply'));
  assert.equal(settings.env.MINIDISCORD_URL, undefined);
  assert.equal(settings.env.MINIDISCORD_DB, path.join(d.dataDir, 'chat.db'));
  for (const f of [d.settingsFile, d.localSettingsFile]) assert.ok(!fs.readFileSync(f, 'utf8').includes('mcp__minidiscord-channel__'), f);
  assert.deepEqual(localSettingsDrift(d), { changed: false, added: [] });
  const changed = readJson(d.localSettingsFile);
  changed.permissions.allow.push('Bash(curl --version)');
  fs.writeFileSync(d.localSettingsFile, JSON.stringify(changed));
  assert.deepEqual(localSettingsDrift(d), { changed: true, added: ['allow:Bash(curl --version)'] });
});

test('makeScratch 는 실제 prodev 아래를 스크래치로 쓰지 않는다', { skip }, () => {
  assert.throws(() => makeScratch(path.join(PRODEV, 'bots', '없어야-하는-스크래치'), 'smoke'), /실제 prodev 아래/);
  assert.throws(() => makeScratch(path.join(os.tmpdir(), '공백 있는 자리'), 'smoke'), /공백/);
});
