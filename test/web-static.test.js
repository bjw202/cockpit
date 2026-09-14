// 화면 정적 검사 — 사내망 · CDN 없음 · 빌드 없음 (ADR-010 · PRD N3), innerHTML 은 안 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(REPO, 'web');
const webFiles = () => fs.readdirSync(WEB, { recursive: true })
  .map(f => String(f).replaceAll('\\', '/'))
  .filter(f => fs.statSync(path.join(WEB, f)).isFile())
  .map(name => ({ name, text: fs.readFileSync(path.join(WEB, name), 'utf8') }));

// 밖을 가리키는 주소가 실릴 수 있는 자리 — 스킴 없는 //cdn 꼴도 잡는다
const EXTERNAL = [
  /\b(?:src|href|action|poster|srcset)\s*=\s*["']?\s*(?:https?:)?\/\//i,
  /\.(?:src|href)\s*=\s*["'`]\s*(?:https?:)?\/\//i,
  /setAttribute\(\s*["'](?:src|href)["']\s*,\s*["'`]\s*(?:https?:)?\/\//i,
  /url\(\s*["']?\s*(?:https?:)?\/\//i,
  /@import\s+(?:url\()?\s*["']?\s*(?:https?:)?\/\//i,
  /\bimport\s*(?:[\w{}\s,*]*from\s*)?["'](?:https?:)?\/\//,
  /\bimport\(\s*["'`](?:https?:)?\/\//,
  /\b(?:fetch|EventSource)\(\s*["'`]\s*(?:https?:)?\/\//,
];

test('web/ 의 어느 파일에도 http:// · https:// 로 시작하는 외부 src/href 가 없다', () => {
  // 검사가 정말 잡는지 먼저 본다
  for (const bad of ['<script src="https://cdn.example/x.js">', '<link href="//fonts.example/a.css">', "import x from 'https://esm.sh/y'",
    '@import url("https://a/b.css");', "img.src = 'http://x/y.png'", "fetch('https://api.example/')"]) {
    assert.ok(EXTERNAL.some(re => re.test(bad)), `검사가 못 잡는다: ${bad}`);
  }
  const files = webFiles();
  for (const must of ['index.html', 'app.js', 'chat.js', 'markdown.js', 'style.css']) assert.ok(files.some(f => f.name === must), `${must} 가 없다`);
  const hits = files.flatMap(f => EXTERNAL.map(re => re.exec(f.text)).filter(Boolean).map(m => `${f.name}: ${m[0]}`));
  assert.deepEqual(hits, []);
});

test('모든 <script> 가 type=module', () => {
  const html = webFiles().filter(f => f.name.endsWith('.html'));
  assert.ok(html.length >= 1);
  let scripts = 0;
  for (const f of html) {
    for (const m of f.text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      scripts++;
      assert.match(m[1], /\btype\s*=\s*["']module["']/, `${f.name}: ${m[0].slice(0, 80)}`);
      assert.match(m[1], /\bsrc\s*=\s*["'][^"':]+\.js["']/, `${f.name}: 파일로 싣는다 (CSP script-src 'self' — 인라인 스크립트는 막힌다)`);
      assert.equal(m[2].trim(), '', `${f.name}: 인라인 스크립트`);
    }
    assert.equal((f.text.match(/<script\b/gi) ?? []).length, [...f.text.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].length, '닫히지 않은 script');
    assert.doesNotMatch(f.text, /\son\w+\s*=/i, `${f.name}: 인라인 이벤트 처리기`);
    assert.doesNotMatch(f.text, /\sstyle\s*=/i, `${f.name}: 인라인 style (CSP style-src 'self')`);
  }
  assert.ok(scripts >= 1);
});

test('innerHTML 대입이 markdown.js 밖에 없다', () => {
  const HTML_SINKS = /\.(?:innerHTML|outerHTML)\s*\+?=|insertAdjacentHTML\s*\(|document\.write(?:ln)?\s*\(|createContextualFragment\s*\(/;
  const hits = webFiles()
    .filter(f => /\.(?:js|mjs|html)$/.test(f.name) && f.name !== 'markdown.js')
    .filter(f => HTML_SINKS.test(f.text))
    .map(f => `${f.name}: ${HTML_SINKS.exec(f.text)[0]}`);
  assert.deepEqual(hits, []);
});

test('markdown.js 사본은 머리의 출처 핀 · sha256 이 본문과 맞다', () => {
  const text = fs.readFileSync(path.join(WEB, 'markdown.js'), 'utf8');
  const pin = /^\/\/ 출처 핀: minidiscord web\/markdown\.js — 저장소 핀 ([0-9a-f]{7,}), 이 파일이 마지막으로 바뀐 커밋 ([0-9a-f]{7,}) [\d-]+, 원본 sha256 ([0-9a-f]{64})\n(?:\/\/.*\n)*\n/.exec(text);
  assert.ok(pin, '머리에 출처 핀이 없다');
  const body = text.slice(pin[0].length);
  assert.equal(createHash('sha256').update(body).digest('hex'), pin[3], '사본이 원본에서 바뀌었다');
  const sibling = path.resolve(REPO, '..', 'minidiscord', 'web', 'markdown.js');
  if (fs.existsSync(sibling)) {
    const now = createHash('sha256').update(fs.readFileSync(sibling, 'utf8')).digest('hex');
    if (now !== pin[3]) console.log(`알림: 형제 minidiscord 의 markdown.js 가 핀 뒤에 바뀌었다 (${now.slice(0, 12)})`);
  }
});
