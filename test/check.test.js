// check 명령 (TASKS M4.2) — 진짜 CLI 를 자식 프로세스로 부른다. 설정 검사 함수 자체는 test/config.test.js 가 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SKIP_WIN32 } from './fakes/platform.js';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cockpit.js');

function world(over = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-check-')));
  const config = { maxSessions: 3 };
  for (const k of ['botsDir', 'projectsDir', 'uploadsDir', 'dataDir']) {
    config[k] = path.join(dir, k);
    fs.mkdirSync(config[k], { recursive: true });
  }
  const file = path.join(dir, 'cockpit.json');
  const write = extra => fs.writeFileSync(file, JSON.stringify({ ...config, ...over, ...extra }));
  write();
  const run = () => spawnSync(process.execPath, [CLI, 'check', '--config', file], { encoding: 'utf8' });
  return { dir, file, write, run };
}
const lines = out => out.split(/\r?\n/).filter(Boolean);

test('check — 공백 든 경로와 없는 claudePath 는 ✗ 한 줄씩 · exit 1', () => {
  const w = world();
  const spaced = path.join(w.dir, 'my data');
  fs.mkdirSync(spaced);
  w.write({ dataDir: spaced, claudePath: path.join(w.dir, '없는자리', 'claude.exe') });
  const r = w.run();
  assert.notEqual(r.status, 0);
  const bad = lines(r.stdout).filter(l => l.startsWith('✗'));
  assert.equal(bad.length, 2, r.stdout);
  assert.match(bad.find(l => l.includes('dataDir')), /^✗ dataDir .*공백/);
  assert.match(bad.find(l => l.includes('claudePath')), /^✗ claudePath 없다: /);
  assert.ok(!r.stdout.includes('✓ 경로 공백 없음'));
  assert.ok(!r.stdout.includes('✓ claudePath'), '없는 claudePath 를 부르지 않는다');
});

test('check — claudePath 를 불러 판을 낸다 (✓ claudePath <판>)', { skip: SKIP_WIN32 }, () => {
  const w = world();
  const fake = path.join(w.dir, 'claude');
  fs.writeFileSync(fake, '#!/bin/sh\necho "2.1.270 (Claude Code)"\n', { mode: 0o755 });
  w.write({ claudePath: fake });
  const ok = w.run();
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /^✓ node v\d+\.\d+\.\d+ \(>= 22/m);
  assert.match(ok.stdout, /^✓ claudePath 2\.1\.270 \(Claude Code\) — /m);
  assert.match(ok.stdout, /^✓ 경로 공백 없음$/m);

  fs.writeFileSync(fake, '#!/bin/sh\necho "로그인 필요" >&2\nexit 3\n', { mode: 0o755 });
  const broken = w.run();
  assert.equal(broken.status, 1);
  assert.match(broken.stdout, /^✗ claudePath 실행이 안 된다 \(--version\)/m, '있는데 안 돌면 ✗');
});
