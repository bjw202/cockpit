// 스모크 공용 — 스크래치 자리(smoke/scratch.mjs)를 세우고 진짜 SDK 로 세션 관리자를 띄운다.
// 실제 prodev/bots/ 는 절대 cwd 로 쓰지 않는다. 스크래치 배치와 설정 두 파일의 까닭은 scratch.mjs 머리에.

import fs from 'node:fs';
import path from 'node:path';
import { openRuntime, waitForBotMessage, waitUntil } from '../src/runtime.js';
import { sdkBinding } from '../src/session/sdk-query.js';
import { CHANNEL_ORIGIN } from '../src/envelope/wrap.js';

export { PRODEV, makeScratch, localSettingsDrift } from './scratch.mjs';
export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export function parseSmokeArgs(argv, usage) {
  const flags = new Set(argv.filter(a => a.startsWith('--')));
  const pos = argv.filter(a => !a.startsWith('--'));
  if (!pos[0]) { console.error(usage); process.exit(1); }
  return { root: path.resolve(pos[0]), model: pos[1] || DEFAULT_MODEL, noOrigin: flags.has('--no-origin') };
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
