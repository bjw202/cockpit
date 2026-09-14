import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// import 문(정적 from · 동적 import())만 본다. 설명 글에 이름이 나오는 것은 import 가 아니다
const IMPORT_SDK = new RegExp(String.raw`(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]@anthropic-ai/claude-agent-sdk['"]`);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

test('src/session/sdk-query.js 밖의 src/ · test/ 파일은 @anthropic-ai/claude-agent-sdk 를 import 하지 않는다', () => {
  const files = [...walk(path.join(REPO, 'src')), ...walk(path.join(REPO, 'test'))].filter(f => /\.(m?js|ts)$/.test(f));
  const hits = files.filter(f => IMPORT_SDK.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(REPO, f));
  assert.deepEqual(hits, [path.join('src', 'session', 'sdk-query.js')]);
});
