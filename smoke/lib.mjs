// 스모크 공용 — 스크래치 자리를 세우고 진짜 SDK 로 세션 관리자를 띄운다.
//
// 스크래치 봇 폴더는 meta 실증과 같은 방법이다: prodev 의 settings.template.json 을 스크래치 경로로 채운 사본
// + CLAUDE.md 사본 + .claude/{skills,agents} 심볼릭 링크. 실제 prodev/bots/ 는 절대 cwd 로 쓰지 않는다.
// prodev PR(W2.9) 전이라 사본에서 도구 이름을 mcp__cockpit__ 으로 바꾸고, MINIDISCORD_URL 을 빼고,
// deny 에 cockpit.db 를 넣는다 (ARCHITECTURE 11절). PreToolUse 에 표식 훅 하나를 더한다 (훅이 걸렸는지 보려고).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRuntime, waitForBotMessage, waitUntil } from '../src/runtime.js';
import { sdkBinding } from '../src/session/sdk-query.js';
import { CHANNEL_ORIGIN } from '../src/envelope/wrap.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRODEV = process.env.COCKPIT_PRODEV_DIR || path.resolve(REPO, '..', 'prodev');
export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export function parseSmokeArgs(argv, usage) {
  const flags = new Set(argv.filter(a => a.startsWith('--')));
  const pos = argv.filter(a => !a.startsWith('--'));
  if (!pos[0]) { console.error(usage); process.exit(1); }
  return { root: path.resolve(pos[0]), model: pos[1] || DEFAULT_MODEL, noOrigin: flags.has('--no-origin') };
}

const pat = p => '//' + p.replace(/\\/g, '/').replace(/^\//, '');   // Claude Code 권한 패턴 (prodev setup.js 와 같다)
const esc = s => s.replace(/\\/g, '\\\\');

export function makeScratch(root, project) {
  if (/\s/.test(root)) throw new Error(`스크래치 경로에 공백이 있다: ${root}`);
  if (path.resolve(root).startsWith(path.join(PRODEV, 'bots'))) throw new Error('실제 prodev/bots/ 아래는 쓰지 않는다');
  const botName = `prodev-${project}-bot`;
  const d = {
    root, project, botName,
    dataDir: path.join(root, 'data'), uploadsDir: path.join(root, 'uploads'),
    projectsDir: path.join(root, 'projects'), botsDir: path.join(root, 'bots'),
  };
  d.projectDir = path.join(d.projectsDir, project);
  d.botDir = path.join(d.botsDir, botName);
  d.marker = path.join(root, 'pretooluse-marker.json');
  fs.rmSync(root, { recursive: true, force: true });
  for (const p of [d.dataDir, d.uploadsDir, d.projectDir, d.botDir]) fs.mkdirSync(p, { recursive: true });

  // 과제 폴더 — setup.js 가 만드는 자리들 + 결재 대조용 헌장 한 줄
  for (const sub of ['cards', 'wiki', 'inbox', 'journal', 'threads', 'research', 'patent', 'paper', 'report', 'tmp', 'analysis', 'templates']) {
    fs.mkdirSync(path.join(d.projectDir, sub), { recursive: true });
  }
  fs.writeFileSync(path.join(d.projectDir, 'charter.md'), `# 헌장 (스모크)\n\nPL: 김피엘\n`);
  fs.writeFileSync(path.join(d.projectDir, 'house.md'), '# 이 과제에서 일하는 방식\n\n### 하지 말 것\n(아직 없다)\n');

  // 표식 훅 — stdin JSON 을 파일로 남긴다. sh 대신 node 라 윈도우에서도 돈다
  const markerHook = path.join(root, 'marker-hook.mjs');
  fs.writeFileSync(markerHook, `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(d.marker)}, fs.readFileSync(0, 'utf8'));\n`);

  const tpl = fs.readFileSync(path.join(PRODEV, 'common', 'settings.template.json'), 'utf8');
  const settings = JSON.parse(tpl
    .replace(/\{\{PROJECT\}\}/g, pat(d.projectDir))
    .replace(/\{\{BOT\}\}/g, pat(d.botDir))
    .replace(/\{\{PRODEV\}\}/g, pat(PRODEV))
    .replace(/\{\{HOOKS\}\}/g, esc(path.join(PRODEV, 'common', 'hooks')))
    .replace(/\{\{PROJECT_DIR\}\}/g, esc(d.projectDir))
    .replace(/\{\{UPLOADS_DIR\}\}/g, esc(d.uploadsDir))
    .replace(/\{\{PRODEV_DIR\}\}/g, esc(PRODEV))
    .replace(/\{\{BOT_NAME\}\}/g, botName)
    .replace(/\{\{DB\}\}/g, esc(path.join(d.dataDir, 'chat.db')))
    .replace(/\{\{GIT_BASH\}\}/g, esc(process.env.CLAUDE_CODE_GIT_BASH_PATH || 'C:\\Program Files\\Git\\bin\\bash.exe'))
    .replace(/\{\{URL\}\}/g, '')
    .replace(/\{\{STATUSLINE\}\}/g, esc(path.join(PRODEV, 'common', 'statusline.sh')))
    .replace(/\{\{PATH\}\}/g, esc(process.env.PATH || ''))
    .replace('"{{AUTOCOMPACT}}"', '650000')
    .replaceAll('mcp__minidiscord-channel__', 'mcp__cockpit__'));
  delete settings.env.MINIDISCORD_URL;
  const cockpitDb = path.join(d.dataDir, 'cockpit.db');
  settings.permissions.deny.push(`Read(${pat(cockpitDb)})`, `Edit(${pat(cockpitDb)})`, `Write(${pat(cockpitDb)})`);
  settings.hooks.PreToolUse.push({ matcher: 'mcp__cockpit__reply', hooks: [{ type: 'command', command: `node ${esc(markerHook)}` }] });
  fs.mkdirSync(path.join(d.botDir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(d.botDir, '.claude', 'settings.json'), JSON.stringify(settings, null, 2) + '\n');

  fs.copyFileSync(path.join(PRODEV, 'CLAUDE.md'), path.join(d.botDir, 'CLAUDE.md'));
  for (const sub of ['skills', 'agents']) {
    const src = path.join(PRODEV, '.claude', sub);
    if (fs.existsSync(src)) fs.symlinkSync(src, path.join(d.botDir, '.claude', sub), 'dir');
  }

  d.config = {
    botsDir: d.botsDir, projectsDir: d.projectsDir, uploadsDir: d.uploadsDir, dataDir: d.dataDir,
    claudePath: process.env.COCKPIT_CLAUDE_PATH || null, maxSessions: 3, approvalTimeoutMin: 10, extraEnvKeys: [],
  };
  return d;
}

// 승인 요청은 전부 허용하고 기록한다 (스모크는 판정하지 않는다 — 무엇이 물었는지만 낸다)
export function startRuntime(d, { model, noOrigin }) {
  const asked = [];
  const rt = openRuntime(d.config, {
    binding: sdkBinding, model, origin: noOrigin ? null : CHANNEL_ORIGIN,
    permissionHandler: async ({ toolName, input }) => { asked.push(toolName); return { behavior: 'allow', updatedInput: input }; },
  });
  const opened = rt.manager.openProject({ project: d.project, botDir: d.botDir });
  return { rt, asked, ...opened };
}

export const events = (rt, project) => rt.cockpitDb.eventsAfter(project, 0, 100000);
export const resultCount = (rt, project) => events(rt, project).filter(e => e.type === 'result').length;
export const markerSaysReply = marker => {
  try { return JSON.parse(fs.readFileSync(marker, 'utf8')).tool_name === 'mcp__cockpit__reply'; } catch { return false; }
};
export { waitForBotMessage, waitUntil };
