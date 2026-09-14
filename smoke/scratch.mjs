// 스모크 스크래치 자리 — SDK 를 싣지 않는다 (test/smoke-scratch.test.js 가 곧바로 부른다. meta 도 재생 자리를 이것으로 만든다).
//
// 실전 배치를 흉내 낸다 (meta W2r.3): 봇 폴더가 prodev 뿌리 아래 bots/<봇> 에 있어야 orchestrator 가 말하는
// "봇 폴더에서 돌 때는 ../../scripts/" (find.js · plot.py …)가 산다. 그래서
//   <스크래치>/prodev/                  prodev 뿌리 흉내
//     scripts → 실제 prodev/scripts     심볼릭 링크
//     common  → 실제 prodev/common      심볼릭 링크
//     CLAUDE.md                          사본
//     .claude/{skills,agents}            실제 prodev 로 링크
//     bots/<봇>/                         봇 폴더 (cockpit.json 의 botsDir = <스크래치>/prodev/bots)
//   <스크래치>/projects/<과제>/  data/  uploads/
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

const inside = (root, p) => {
  const r = path.relative(root, p);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

export function makeScratch(rootIn, project, { botName = `prodev-${project}-bot`, prodev = PRODEV } = {}) {
  const root = path.resolve(rootIn);
  if (/\s/.test(root)) throw new Error(`스크래치 경로에 공백이 있다: ${root}`);
  const realProdev = fs.existsSync(prodev) ? fs.realpathSync(prodev) : path.resolve(prodev);
  if (inside(path.resolve(prodev), root) || inside(realProdev, root)) throw new Error(`실제 prodev 아래는 스크래치로 쓰지 않는다: ${root}`);

  const shim = path.join(root, 'prodev');
  const d = {
    root, project, botName, prodev: realProdev, shim,
    dataDir: path.join(root, 'data'), uploadsDir: path.join(root, 'uploads'),
    projectsDir: path.join(root, 'projects'), botsDir: path.join(shim, 'bots'),
  };
  d.projectDir = path.join(d.projectsDir, project);
  d.botDir = path.join(d.botsDir, botName);
  d.marker = path.join(root, 'pretooluse-marker.json');
  d.settingsFile = path.join(d.botDir, '.claude', 'settings.json');
  d.localSettingsFile = path.join(d.botDir, '.claude', 'settings.local.json');

  fs.rmSync(root, { recursive: true, force: true });
  for (const p of [d.dataDir, d.uploadsDir, d.projectDir, path.join(d.botDir, '.claude'), path.join(shim, '.claude')]) fs.mkdirSync(p, { recursive: true });

  // 과제 폴더 — setup.js 가 만드는 자리들 + 결재 대조용 헌장 한 줄
  for (const sub of PROJECT_SUBDIRS) fs.mkdirSync(path.join(d.projectDir, sub), { recursive: true });
  fs.writeFileSync(path.join(d.projectDir, 'charter.md'), '# 헌장 (스모크)\n\nPL: 김피엘\n');
  fs.writeFileSync(path.join(d.projectDir, 'house.md'), '# 이 과제에서 일하는 방식\n\n### 하지 말 것\n(아직 없다)\n');

  // prodev 뿌리 흉내
  for (const sub of ['scripts', 'common']) fs.symlinkSync(path.join(realProdev, sub), path.join(shim, sub), 'dir');
  fs.copyFileSync(path.join(realProdev, 'CLAUDE.md'), path.join(shim, 'CLAUDE.md'));
  fs.copyFileSync(path.join(realProdev, 'CLAUDE.md'), path.join(d.botDir, 'CLAUDE.md'));
  for (const sub of ['skills', 'agents']) {
    const src = path.join(realProdev, '.claude', sub);
    if (!fs.existsSync(src)) continue;
    fs.symlinkSync(src, path.join(shim, '.claude', sub), 'dir');
    fs.symlinkSync(src, path.join(d.botDir, '.claude', sub), 'dir');
  }

  // 표식 훅 — stdin JSON 을 파일로 남긴다. sh 대신 node 라 윈도우에서도 돈다
  const markerHook = path.join(root, 'marker-hook.mjs');
  fs.writeFileSync(markerHook, `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(d.marker)}, fs.readFileSync(0, 'utf8'));\n`);

  const fill = text => JSON.parse(text
    .replace(/\{\{PROJECT\}\}/g, pat(d.projectDir))
    .replace(/\{\{BOT\}\}/g, pat(d.botDir))
    .replace(/\{\{PRODEV\}\}/g, pat(shim))
    .replace(/\{\{HOOKS\}\}/g, esc(path.join(shim, 'common', 'hooks')))
    .replace(/\{\{PROJECT_DIR\}\}/g, esc(d.projectDir))
    .replace(/\{\{UPLOADS_DIR\}\}/g, esc(d.uploadsDir))
    .replace(/\{\{PRODEV_DIR\}\}/g, esc(shim))
    .replace(/\{\{BOT_NAME\}\}/g, botName)
    .replace(/\{\{DB\}\}/g, esc(path.join(d.dataDir, 'chat.db')))
    .replace(/\{\{GIT_BASH\}\}/g, esc(process.env.CLAUDE_CODE_GIT_BASH_PATH || 'C:\\Program Files\\Git\\bin\\bash.exe'))
    .replace(/\{\{URL\}\}/g, '')
    .replace(/\{\{STATUSLINE\}\}/g, esc(path.join(shim, 'common', 'statusline.sh')))
    .replace(/\{\{PATH\}\}/g, esc(process.env.PATH || ''))
    .replace('"{{AUTOCOMPACT}}"', '650000')
    .replaceAll('mcp__minidiscord-channel__', 'mcp__cockpit__'));

  const settings = fill(fs.readFileSync(path.join(realProdev, 'common', 'settings.template.json'), 'utf8'));
  const localTemplate = path.join(realProdev, 'common', 'settings.local.template.json');
  const local = fs.existsSync(localTemplate) ? fill(fs.readFileSync(localTemplate, 'utf8')) : { permissions: settings.permissions ?? {} };
  delete settings.permissions;
  if (settings.env) delete settings.env.MINIDISCORD_URL;

  const perms = local.permissions;
  const cockpitDb = path.join(d.dataDir, 'cockpit.db');
  perms.deny = [...(perms.deny ?? []), `Read(${pat(cockpitDb)})`, `Edit(${pat(cockpitDb)})`, `Write(${pat(cockpitDb)})`];
  // 링크를 따라 풀린 실제 prodev 경로로 읽을 때도 작업 폴더 밖이 되지 않게
  perms.additionalDirectories = [...new Set([...(perms.additionalDirectories ?? []), realProdev])];

  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];
  settings.hooks.PreToolUse.push({ matcher: 'mcp__cockpit__reply', hooks: [{ type: 'command', command: `node ${esc(markerHook)}` }] });

  fs.writeFileSync(d.settingsFile, JSON.stringify(settings, null, 2) + '\n');
  fs.writeFileSync(d.localSettingsFile, JSON.stringify(local, null, 2) + '\n');
  d.localSettingsBaseline = fs.readFileSync(d.localSettingsFile, 'utf8');

  d.config = {
    botsDir: d.botsDir, projectsDir: d.projectsDir, uploadsDir: d.uploadsDir, dataDir: d.dataDir,
    claudePath: process.env.COCKPIT_CLAUDE_PATH || null, maxSessions: 3, approvalTimeoutMin: 10, extraEnvKeys: [],
  };
  return d;
}

// 스모크 뒤 settings.local.json 이 스크래치가 쓴 그대로인지 — 봇이나 승인 답이 규칙을 더했으면 그 차이를 낸다
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
