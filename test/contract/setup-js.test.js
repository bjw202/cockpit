// 계약 시험 — 형제 저장소 prodev 의 진짜 scripts/setup.js 를 방 만들기가 부르는 명령 줄 그대로 부른다 (ARCHITECTURE 11절 · VERIFICATION 2.2).
//
// 본 체크아웃의 bots/ 에 봇 폴더가 생기지 않게 prodev 의 scripts · common · CLAUDE.md · .claude 를 임시 폴더로 **복사**한 사본에서 돈다.
// 계약: node <prodevDir>/scripts/setup.js --project <과제> --cockpit <설정 파일> 이 exit 0 이면
//       <prodevDir>/bots/prodev-<과제>-bot/.claude/settings.local.json 이 있다. exit 1 이면 방 만들기가 502 와 되돌림.
// 형제가 없으면 건너뛴다 (건너뜀은 통과로 세지 않는다).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSetup } from '../../src/rooms/setup-runner.js';
import { createRoom, setupEnv } from '../../src/rooms/create.js';
import { openRuntime } from '../../src/runtime.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRODEV = process.env.COCKPIT_PRODEV_DIR || path.resolve(REPO, '..', 'prodev');
const SETUP = path.join(PRODEV, 'scripts', 'setup.js');
const skip = fs.existsSync(SETUP) ? false : `형제 prodev 없음 (${SETUP})`;

function copyProdev(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-setupjs-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prodevDir = path.join(root, 'prodev');
  const skipNames = new Set(['node_modules', '.git', 'bots', 'tmp']);
  for (const sub of ['scripts', 'common', '.claude']) {
    const src = path.join(PRODEV, sub);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(prodevDir, sub), { recursive: true, filter: s => !skipNames.has(path.basename(s)) });
  }
  fs.copyFileSync(path.join(PRODEV, 'CLAUDE.md'), path.join(prodevDir, 'CLAUDE.md'));
  const config = {
    prodevDir, botsDir: path.join(prodevDir, 'bots'), projectsDir: path.join(root, 'projects'),
    uploadsDir: path.join(root, 'uploads'), dataDir: path.join(root, 'data'), maxSessions: 3, extraEnvKeys: [],
  };
  for (const k of ['botsDir', 'projectsDir', 'uploadsDir', 'dataDir']) fs.mkdirSync(config[k], { recursive: true });
  const configFile = path.join(root, 'cockpit.json');
  fs.writeFileSync(configFile, JSON.stringify(config));
  return { root, prodevDir, config, configFile };
}

test('임시 prodev 사본에서 setup.js --project 를 부르면 bots/prodev-<과제>-bot/.claude/settings.local.json 이 생긴다', { skip }, async t => {
  const c = copyProdev(t);
  const out = await runSetup({ prodevDir: c.prodevDir, project: '계약', configFile: c.configFile, env: setupEnv(process.env) });
  assert.equal(out.code, 0, out.tail.join('\n'));
  const botDir = path.join(c.prodevDir, 'bots', 'prodev-계약-bot');
  assert.ok(fs.existsSync(path.join(botDir, '.claude', 'settings.local.json')));
  assert.ok(fs.existsSync(path.join(botDir, '.claude', 'settings.json')));
  assert.ok(fs.existsSync(path.join(c.config.projectsDir, '계약')), '과제 폴더도 만든다');
  assert.ok(out.tail.length > 0 && out.tail.length <= 20);
});

test('setup.js 가 exit 1 이면 createRoom 이 502 와 되돌림', { skip }, async t => {
  const c = copyProdev(t);
  const rt = openRuntime(c.config);
  t.after(() => rt.close());
  const ctx = { ...rt, config: c.config, configFile: path.join(c.root, '없는-설정.json') };   // setup 이 "조종석 설정이 없다" 로 exit 1
  await assert.rejects(() => createRoom(ctx, { project: '계약' }), e => {
    assert.equal(e.status, 502);
    assert.match(e.body.error, /^setup 실패: 오류: 조종석 설정이 없다/);
    assert.ok(e.body.setup_tail.length > 0);
    return true;
  });
  assert.equal(fs.existsSync(path.join(c.prodevDir, 'bots', 'prodev-계약-bot')), false);
  assert.equal(rt.chatDb.roomByName('prodev-계약'), undefined);
  assert.equal(rt.cockpitDb.agentSessions().length, 0);
});
