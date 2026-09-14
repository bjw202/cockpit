// 화면 정적 검사 — 사내망 · CDN 없음 · 빌드 없음 (ADR-010 · PRD N3) · (v2) minidiscord 화면 사본의 핀과 디자인 토큰 (ADR-016 · PRD N13).
// 원본 지문은 test/fixtures/minidiscord-web.json (minidiscord 6633f7b) — 형제 저장소 없이 맞댄다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(REPO, 'web');
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'test', 'fixtures', 'minidiscord-web.json'), 'utf8'));
const webFiles = () => fs.readdirSync(WEB, { recursive: true })
  .map(f => String(f).replaceAll('\\', '/'))
  .filter(f => fs.statSync(path.join(WEB, f)).isFile())
  .map(name => ({ name, text: fs.readFileSync(path.join(WEB, name), 'utf8') }));
const read = f => fs.readFileSync(path.join(WEB, f), 'utf8');
const sha = s => createHash('sha256').update(s).digest('hex');
const afterFirstLine = s => s.slice(s.indexOf('\n') + 1);
const COPIED = ['index.html', 'app.js', 'rich.js', 'style.css', 'design-tokens.css'];

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
  for (const must of [...COPIED, 'boot.js', 'markdown.js']) assert.ok(files.some(f => f.name === must), `${must} 가 없다`);
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
    }
    assert.doesNotMatch(f.text, /\son\w+\s*=/i, `${f.name}: 인라인 이벤트 처리기`);
    assert.doesNotMatch(f.text, /\sstyle\s*=/i, `${f.name}: 인라인 style (CSP style-src 'self')`);
  }
  assert.ok(scripts >= 1);
});

test('인라인 script 가 없다(CSP script-src self)', () => {
  for (const f of webFiles().filter(x => x.name.endsWith('.html'))) {
    const tags = [...f.text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.equal((f.text.match(/<script\b/gi) ?? []).length, tags.length, `${f.name}: 닫히지 않은 script`);
    for (const m of tags) {
      assert.match(m[1], /\bsrc\s*=\s*["'][^"':]+\.js["']/, `${f.name}: 파일로 싣는다 — 인라인 스크립트는 막힌다`);
      assert.equal(m[2].trim(), '', `${f.name}: 인라인 스크립트 본문`);
    }
    assert.doesNotMatch(f.text, /javascript:/i, `${f.name}: javascript: 주소`);
  }
});

// (v2) 옛 이름 `innerHTML 대입이 markdown.js 밖에 없다` 를 대체한다 — minidiscord app.js 가 목록을 innerHTML = '' 로 비운다
test('innerHTML 대입은 markdown.js 밖에서 빈 문자열뿐', () => {
  const SINKS = /\.(?:innerHTML|outerHTML)\s*\+?=[^\n]*|insertAdjacentHTML\s*\(|document\.write(?:ln)?\s*\(|createContextualFragment\s*\(/g;
  const EMPTY = /^\.innerHTML\s*=\s*(?:''|"")/;
  const hits = webFiles()
    .filter(f => /\.(?:js|mjs|html)$/.test(f.name) && f.name !== 'markdown.js')
    .flatMap(f => [...f.text.matchAll(SINKS)].map(m => ({ name: f.name, sink: m[0] })))
    .filter(h => !EMPTY.test(h.sink))
    .map(h => `${h.name}: ${h.sink.slice(0, 60)}`);
  assert.deepEqual(hits, []);
  assert.ok(/\.innerHTML = ''/.test(read('app.js')), '사본의 비우기 자리가 그대로 있다 (검사가 비어 있는 파일을 보는 것이 아니다)');
});

test('markdown.js 사본은 머리의 출처 핀 · sha256 이 본문과 맞다', () => {
  const text = read('markdown.js');
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

test('design-tokens.css 는 머리 줄을 빼면 원본 sha256 과 같고 --md- 토큰이 34', () => {
  const body = afterFirstLine(read('design-tokens.css'));
  assert.equal(sha(body), FIX.files['design-tokens.css'].sha256, '토큰 파일이 원본에서 바뀌었다');
  const names = [...body.matchAll(/^\s*(--md-[a-z0-9-]+)\s*:/gm)].map(m => m[1]);
  assert.equal(names.length, 34);
  assert.equal(new Set(names).size, 34, '같은 토큰이 두 번 정의되지 않았다');
});

test('rich.js 는 머리 줄을 빼면 원본 sha256 과 같다', () => {
  assert.equal(sha(afterFirstLine(read('rich.js'))), FIX.files['rich.js'].sha256);
});

test('style.css 의 원본 구간(머리 줄 뒤 965줄)은 원본 sha256 과 같다', () => {
  const { lines, sha256 } = FIX.files['style.css'];
  assert.equal(lines, 965);
  const segment = `${read('style.css').split('\n').slice(1, 1 + lines).join('\n')}\n`;
  assert.equal(sha(segment), sha256, 'style.css 원본 구간이 바뀌었다 — cockpit 덩이는 끝에만 더한다');
});

test('옮긴 파일 다섯의 머리에 저장소 핀 · 마지막 커밋 · sha256 이 있다', () => {
  for (const f of COPIED) {
    const head = read(f).split('\n').slice(0, 3).join('\n');
    const re = new RegExp(`출처 핀: minidiscord web/${f.replace('.', '\\.')} — 저장소 핀 ([0-9a-f]{7,}), 이 파일이 마지막으로 바뀐 커밋 ([0-9a-f]{7,} \\d{4}-\\d{2}-\\d{2}), 원본 sha256 ([0-9a-f]{64})`);
    const m = re.exec(head);
    assert.ok(m, `${f}: 머리에 핀 줄이 없다`);
    assert.equal(m[1], FIX.pin, f);
    assert.equal(m[2], FIX.files[f].last, f);
    assert.equal(m[3], FIX.files[f].sha256, f);
  }
});

test('web/ 어느 파일에도 /api/bots 가 없다', () => {
  assert.deepEqual(webFiles().filter(f => f.text.includes('/api/bots')).map(f => f.name), []);
});

// 최상위 함수 — 줄 머리의 [export] [async] function 이름( 부터 다음 '}' 한 줄까지 (scratchpad port-web.mjs 가 원본 지문을 같은 자르기로 적었다)
function topFunctions(src) {
  const lines = src.split('\n');
  const out = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:export )?(?:async )?function (\w+)\s*\(/.exec(lines[i]);
    if (!m) continue;
    let j = i;
    while (j < lines.length && lines[j] !== '}') j++;
    out.set(m[1], lines.slice(i, j + 1).join('\n'));
    i = j;
  }
  return out;
}

// ARCHITECTURE 7.3 표 — 이 밖의 함수를 고치면 여기서 빨갛다
const TABLE_7_3 = {
  changed: ['initApp', 'login', 'logout', 'onComposerInput', 'openRoom', 'refreshRoomBots', 'renderRooms', 'sendMessage'],
  removed: ['createBot', 'deleteBot', 'hideInviteError', 'initInvite', 'inviteNodes', 'loadBots', 'openStream', 'pickParticipant', 'renderBots', 'showInviteError', 'showRegistration'],
  added: ['loadProjects', 'openAppStream'],
};

test('app.js 에서 원본과 본문이 달라진 최상위 함수는 ARCHITECTURE 7.3 표의 것뿐', () => {
  const now = topFunctions(read('app.js'));
  const before = FIX.appFunctions;
  assert.ok(Object.keys(before).length > 50, '원본 지문이 비어 있지 않다');
  const changed = [...now].filter(([n, text]) => n in before && sha(text) !== before[n]).map(([n]) => n).sort();
  const removed = Object.keys(before).filter(n => !now.has(n)).sort();
  const added = [...now.keys()].filter(n => !(n in before)).sort();
  assert.deepEqual({ changed, removed, added }, TABLE_7_3);
});

test('로그인 폼에 type=password 칸 하나', () => {
  const form = /<form id="login-form">([\s\S]*?)<\/form>/.exec(read('index.html'));
  assert.ok(form, '로그인 폼이 없다');
  assert.equal([...form[1].matchAll(/<input\b[^>]*type="password"[^>]*>/g)].length, 1);
  assert.match(form[1], /id="login-password"/);
});
