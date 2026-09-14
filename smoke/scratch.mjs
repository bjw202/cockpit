// 스모크 스크래치 자리 — SDK 를 싣지 않는다 (test/smoke-scratch.test.js 가 곧바로 부른다. meta 도 재생 자리를 이것으로 만든다).
//
// 실전 배치를 흉내 낸다 (meta W2r.3): 봇 폴더가 prodev 뿌리 아래 bots/<봇> 에 있어야 orchestrator 가 말하는
// "봇 폴더에서 돌 때는 ../../scripts/" (find.js · plot.py …)가 산다. 그래서
//   <스크래치>/prodev/                  prodev 뿌리 흉내
//     scripts → 실제 prodev/scripts     심볼릭 링크 (윈도우는 junction)
//     common  → 실제 prodev/common      심볼릭 링크 (윈도우는 junction)
//     CLAUDE.md                          사본
//     .claude/{skills,agents}            실제 prodev 로 링크
//     bots/<봇>/                         봇 폴더 (cockpit.json 의 botsDir = <스크래치>/prodev/bots)
//   <스크래치>/projects/<과제>/  data/  uploads/
//
// 과제가 여럿이면(m4-sessions 의 세션 셋) addScratchProject 로 같은 자리에 과제 · 봇 폴더를 더한다.
//
// 설정은 두 파일로 쓴다 (meta W2 판정 · prodev W2.9): 허용 · 거부(permissions)는 .claude/settings.local.json,
// 훅 · env · statusLine · autoCompact 는 .claude/settings.json. headless/SDK 세션은 settings.json 의 permissions.allow 를
// 읽지 않고 settings.local.json 의 것은 먹는다. prodev 에 common/settings.local.template.json 이 있으면(W2.9 뒤) 그것을,
// 없으면(W2.9 전) settings.template.json 의 permissions 절을 떼어 쓴다.
// W2.9 전 템플릿이면 도구 이름 mcp__minidiscord-channel__ → mcp__cockpit__ · MINIDISCORD_URL 뺌. 어느 쪽이든 deny 에 cockpit.db 셋.
// PreToolUse 에 표식 훅 하나를 더한다 (훅이 걸렸는지 보려고).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRODEV = process.env.COCKPIT_PRODEV_DIR || path.resolve(REPO, '..', 'prodev');
export const PROJECT_SUBDIRS = Object.freeze(['cards', 'wiki', 'inbox', 'journal', 'threads', 'research', 'patent', 'paper', 'report', 'tmp', 'analysis', 'templates']);

const pat = p => '//' + p.replace(/\\/g, '/').replace(/^\//, '');   // Claude Code 권한 패턴 (prodev setup.js 와 같다)
const esc = s => s.replace(/\\/g, '\\\\');
// 윈도우는 폴더 링크를 junction 으로 — 개발자 모드 · 관리자 권한 없이 만들어진다 (M4.1)
const LINK_DIR = process.platform === 'win32' ? 'junction' : 'dir';

const inside = (root, p) => {
  const r = path.relative(root, p);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

// 첫 과제의 칸(project · botName · botDir · projectDir · settingsFile · localSettingsFile · localSettingsBaseline)은 d 에도 그대로 싣는다 —
// m1~m3 스모크가 d.botDir 들을 쓴다. 모든 과제는 d.bots 에 있다.
export function makeScratch(rootIn, project, { botName = `prodev-${project}-bot`, prodev = PRODEV } = {}) {
  const root = path.resolve(rootIn);
  if (/\s/.test(root)) throw new Error(`스크래치 경로에 공백이 있다: ${root}`);
  const realProdev = fs.existsSync(prodev) ? fs.realpathSync(prodev) : path.resolve(prodev);
  if (inside(path.resolve(prodev), root) || inside(realProdev, root)) throw new Error(`실제 prodev 아래는 스크래치로 쓰지 않는다: ${root}`);

  const shim = path.join(root, 'prodev');
  const d = {
    root, prodev: realProdev, shim,
    dataDir: path.join(root, 'data'), uploadsDir: path.join(root, 'uploads'),
    projectsDir: path.join(root, 'projects'), botsDir: path.join(shim, 'bots'),
    marker: path.join(root, 'pretooluse-marker.json'), markerHook: path.join(root, 'marker-hook.mjs'),
    bots: [],
  };

  fs.rmSync(root, { recursive: true, force: true });
  for (const p of [d.dataDir, d.uploadsDir, d.projectsDir, d.botsDir, path.join(shim, '.claude')]) fs.mkdirSync(p, { recursive: true });

  // prodev 뿌리 흉내
  for (const sub of ['scripts', 'common']) fs.symlinkSync(path.join(realProdev, sub), path.join(shim, sub), LINK_DIR);
  fs.copyFileSync(path.join(realProdev, 'CLAUDE.md'), path.join(shim, 'CLAUDE.md'));
  for (const sub of ['skills', 'agents']) {
    const src = path.join(realProdev, '.claude', sub);
    if (fs.existsSync(src)) fs.symlinkSync(src, path.join(shim, '.claude', sub), LINK_DIR);
  }

  // 표식 훅 — stdin JSON 을 파일로 남긴다. sh 대신 node 라 윈도우에서도 돈다
  fs.writeFileSync(d.markerHook, `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(d.marker)}, fs.readFileSync(0, 'utf8'));\n`);

  d.config = {
    botsDir: d.botsDir, projectsDir: d.projectsDir, uploadsDir: d.uploadsDir, dataDir: d.dataDir,
    claudePath: process.env.COCKPIT_CLAUDE_PATH || null, maxSessions: 3, approvalTimeoutMin: 10, extraEnvKeys: [],
  };
  const first = addScratchProject(d, project, { botName });
  for (const k of ['project', 'botName', 'projectDir', 'botDir', 'settingsFile', 'localSettingsFile', 'localSettingsBaseline']) d[k] = first[k];
  return d;
}

// 같은 스크래치에 과제 폴더 하나 · 봇 폴더 하나 · 설정 두 장을 더한다. 돌려주는 것은 그 과제의 칸들
export function addScratchProject(d, project, { botName = `prodev-${project}-bot` } = {}) {
  const b = { project, botName, projectDir: path.join(d.projectsDir, project), botDir: path.join(d.botsDir, botName) };
  b.settingsFile = path.join(b.botDir, '.claude', 'settings.json');
  b.localSettingsFile = path.join(b.botDir, '.claude', 'settings.local.json');
  for (const p of [b.projectDir, path.join(b.botDir, '.claude')]) fs.mkdirSync(p, { recursive: true });

  // 과제 폴더 — setup.js 가 만드는 자리들 + 결재 대조용 헌장 한 줄
  for (const sub of PROJECT_SUBDIRS) fs.mkdirSync(path.join(b.projectDir, sub), { recursive: true });
  fs.writeFileSync(path.join(b.projectDir, 'charter.md'), '# 헌장 (스모크)\n\nPL: 김피엘\n');
  fs.writeFileSync(path.join(b.projectDir, 'house.md'), '# 이 과제에서 일하는 방식\n\n### 하지 말 것\n(아직 없다)\n');

  fs.copyFileSync(path.join(d.prodev, 'CLAUDE.md'), path.join(b.botDir, 'CLAUDE.md'));
  for (const sub of ['skills', 'agents']) {
    const src = path.join(d.prodev, '.claude', sub);
    if (fs.existsSync(src)) fs.symlinkSync(src, path.join(b.botDir, '.claude', sub), LINK_DIR);
  }

  const fill = text => JSON.parse(text
    .replace(/\{\{PROJECT\}\}/g, pat(b.projectDir))
    .replace(/\{\{BOT\}\}/g, pat(b.botDir))
    .replace(/\{\{PRODEV\}\}/g, pat(d.shim))
    .replace(/\{\{HOOKS\}\}/g, esc(path.join(d.shim, 'common', 'hooks')))
    .replace(/\{\{PROJECT_DIR\}\}/g, esc(b.projectDir))
    .replace(/\{\{UPLOADS_DIR\}\}/g, esc(d.uploadsDir))
    .replace(/\{\{PRODEV_DIR\}\}/g, esc(d.shim))
    .replace(/\{\{BOT_NAME\}\}/g, botName)
    .replace(/\{\{DB\}\}/g, esc(path.join(d.dataDir, 'chat.db')))
    .replace(/\{\{GIT_BASH\}\}/g, esc(process.env.CLAUDE_CODE_GIT_BASH_PATH || 'C:\\Program Files\\Git\\bin\\bash.exe'))
    .replace(/\{\{URL\}\}/g, '')
    .replace(/\{\{STATUSLINE\}\}/g, esc(path.join(d.shim, 'common', 'statusline.sh')))
    .replace(/\{\{PATH\}\}/g, esc(process.env.PATH || ''))
    .replace('"{{AUTOCOMPACT}}"', '650000')
    .replaceAll('mcp__minidiscord-channel__', 'mcp__cockpit__'));

  const settings = fill(fs.readFileSync(path.join(d.prodev, 'common', 'settings.template.json'), 'utf8'));
  const localTemplate = path.join(d.prodev, 'common', 'settings.local.template.json');
  const local = fs.existsSync(localTemplate) ? fill(fs.readFileSync(localTemplate, 'utf8')) : { permissions: settings.permissions ?? {} };
  delete settings.permissions;
  if (settings.env) delete settings.env.MINIDISCORD_URL;

  const perms = local.permissions;
  const cockpitDb = path.join(d.dataDir, 'cockpit.db');
  perms.deny = [...(perms.deny ?? []), `Read(${pat(cockpitDb)})`, `Edit(${pat(cockpitDb)})`, `Write(${pat(cockpitDb)})`];
  // 링크를 따라 풀린 실제 prodev 경로로 읽을 때도 작업 폴더 밖이 되지 않게
  perms.additionalDirectories = [...new Set([...(perms.additionalDirectories ?? []), d.prodev])];

  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];
  settings.hooks.PreToolUse.push({ matcher: 'mcp__cockpit__reply', hooks: [{ type: 'command', command: `node ${esc(d.markerHook)}` }] });

  fs.writeFileSync(b.settingsFile, JSON.stringify(settings, null, 2) + '\n');
  fs.writeFileSync(b.localSettingsFile, JSON.stringify(local, null, 2) + '\n');
  b.localSettingsBaseline = fs.readFileSync(b.localSettingsFile, 'utf8');
  d.bots.push(b);
  return b;
}

// (v2 · M5.9) 방 만들기 스모크의 자리 — prodev 를 링크가 아니라 **복사**한다 (smoke/m5-room.mjs).
// 링크된 scripts/setup.js 를 부르면 Node 가 링크를 따라 풀어 PRODEV 가 실제 저장소가 되고, 봇 폴더가 실제 prodev/bots 에 생긴다 (prodev/bots 금지).
// 과제 폴더 · 봇 폴더 · 설정 두 장은 여기서 만들지 않는다 — 방 만들기(POST /api/rooms)가 진짜 setup.js 로 만든다.
//   <스크래치>/prodev/{scripts,common,.claude,CLAUDE.md}   복사본 (bots · tmp · node_modules · .git 뺌)
//   <스크래치>/{data,uploads,projects}   · <스크래치>/prodev/bots (빈 폴더)
// failSetup: 사본의 scripts/setup.js 를 "봇 폴더를 반쯤 만들고 exit 1" 하는 대역으로 바꾼다 — 502 · 되돌림 갈래
export const FAIL_SETUP_JS = `// 스모크 --fail-setup 대역 (smoke/scratch.mjs makeRoomScratch) — 봇 폴더를 반쯤 만들고 exit 1
const fs = require('fs');
const path = require('path');
const i = process.argv.indexOf('--project');
const project = i >= 0 ? process.argv[i + 1] : 'unknown';
fs.mkdirSync(path.join(__dirname, '..', 'bots', 'prodev-' + project + '-bot', '.claude'), { recursive: true });
console.log('① 폴더 (대역 — 반쯤 만들고 죽는다)');
console.error('오류: 스모크 --fail-setup 대역 — 일부러 exit 1');
process.exit(1);
`;

export function makeRoomScratch(rootIn, { prodev = PRODEV, failSetup = false } = {}) {
  const root = path.resolve(rootIn);
  if (/\s/.test(root)) throw new Error(`스크래치 경로에 공백이 있다: ${root}`);
  const realProdev = fs.realpathSync(prodev);
  if (inside(path.resolve(prodev), root) || inside(realProdev, root)) throw new Error(`실제 prodev 아래는 스크래치로 쓰지 않는다: ${root}`);
  fs.rmSync(root, { recursive: true, force: true });
  const prodevDir = path.join(root, 'prodev');
  const d = {
    root, prodev: realProdev, prodevDir, botsDir: path.join(prodevDir, 'bots'),
    dataDir: path.join(root, 'data'), uploadsDir: path.join(root, 'uploads'), projectsDir: path.join(root, 'projects'),
  };
  const skip = new Set(['node_modules', '.git', 'bots', 'tmp']);
  for (const sub of ['scripts', 'common', '.claude']) {
    const src = path.join(realProdev, sub);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(prodevDir, sub), { recursive: true, dereference: true, filter: s => !skip.has(path.basename(s)) });
  }
  fs.copyFileSync(path.join(realProdev, 'CLAUDE.md'), path.join(prodevDir, 'CLAUDE.md'));
  for (const p of [d.botsDir, d.dataDir, d.uploadsDir, d.projectsDir]) fs.mkdirSync(p, { recursive: true });
  if (failSetup) fs.writeFileSync(path.join(prodevDir, 'scripts', 'setup.js'), FAIL_SETUP_JS);
  d.config = {
    prodevDir, botsDir: d.botsDir, projectsDir: d.projectsDir, uploadsDir: d.uploadsDir, dataDir: d.dataDir,
    claudePath: process.env.COCKPIT_CLAUDE_PATH || null, maxSessions: 3, approvalTimeoutMin: 10, extraEnvKeys: [],
  };
  return d;
}

// 스모크 뒤 settings.local.json 이 스크래치가 쓴 그대로인지 — 봇이나 승인 답이 규칙을 더했으면 그 차이를 낸다 (d 또는 addScratchProject 의 칸)
export function localSettingsDrift(d) {
  let now;
  try { now = fs.readFileSync(d.localSettingsFile, 'utf8'); } catch { return { changed: true, added: ['(파일이 사라졌다)'] }; }
  if (now === d.localSettingsBaseline) return { changed: false, added: [] };
  const before = JSON.parse(d.localSettingsBaseline).permissions ?? {};
  const after = JSON.parse(now).permissions ?? {};
  const added = [];
  for (const key of ['allow', 'deny', 'ask', 'additionalDirectories']) {
    for (const rule of after[key] ?? []) if (!(before[key] ?? []).includes(rule)) added.push(`${key}:${rule}`);
  }
  return { changed: true, added };
}
