// 계약 시험 — src/envelope/truncate.js 가 원본 minidiscord channel/src/truncate.ts 와 같은 출력을 내는가.
// 원본은 형제 저장소에서 읽기만 한다. Node 의 타입 떼기(22.18+ · 23.6+)로 .ts 를 곧바로 import 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as mine from '../../src/envelope/truncate.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MD = process.env.COCKPIT_MINIDISCORD_DIR || path.resolve(REPO, '..', 'minidiscord');
const TS = path.join(MD, 'channel', 'src', 'truncate.ts');

let theirs = null; let why = false;
if (!fs.existsSync(TS)) why = `형제 minidiscord 없음 (${TS})`;
else {
  try { theirs = await import(pathToFileURL(TS).href); }
  catch (e) { why = `truncate.ts 를 import 못 했다 (Node ${process.versions.node}): ${String(e.message).split('\n')[0]}`; }
}

test('상한 다섯이 원본과 같다', { skip: why }, () => {
  for (const k of ['MAX_BODY_BYTES', 'MAX_ATTACHMENTS', 'MAX_PATH_BYTES', 'MAX_HISTORY_BYTES', 'MAX_NAME_BYTES']) assert.equal(mine[k], theirs[k], k);
});

test('truncateToBudget 이 원본과 같은 출력을 낸다', { skip: why }, () => {
  const inputs = ['', 'abc', 'x'.repeat(4000), 'x'.repeat(4001), '가'.repeat(1500), '😀'.repeat(1100), '⟪잘림⟫'.repeat(700), 'a⟪b⟫c'];
  for (const s of inputs) for (const budget of [256, 512, 4000]) {
    assert.equal(mine.truncateToBudget(s, budget), theirs.truncateToBudget(s, budget), `len=${s.length} budget=${budget}`);
  }
});
