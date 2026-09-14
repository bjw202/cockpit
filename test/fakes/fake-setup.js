// 가짜 setup — 진짜 prodev setup.js 대신 방 만들기(src/rooms/create.js)에 주입한다 (VERIFICATION 2.1 · TASKS M5.3).
//
// makeFakeSetup({ mode, delayMs }) 이 runSetup 과 같은 모양의 함수를 낸다: ({ project, botDir, projectDir, prodevDir, configFile, env }) → { code, timedOut, tail }
//   ok    과제 폴더 · 봇 폴더 · .claude/settings.json · settings.local.json 을 만들고 exit 0
//   fail  아무것도 안 만들고 exit 1 (표준 오류 세 줄)
//   half  봇 폴더와 과제 폴더만 만들고 exit 1 — 반쯤 만들고 죽는 판
//   slow  delayMs 를 기다린 뒤 ok (동시 요청 시험)
// 기록: calls[{ project, botDir, projectDir, prodevDir, configFile, envKeys }]

import fs from 'node:fs';
import path from 'node:path';

export function makeFakeSetup({ mode = 'ok', delayMs = 50 } = {}) {
  const calls = [];
  const run = async ({ project, botDir, projectDir, prodevDir, configFile, env = {} }) => {
    calls.push({ project, botDir, projectDir, prodevDir, configFile, envKeys: Object.keys(env).sort() });
    if (mode === 'slow') await new Promise(r => setTimeout(r, delayMs));
    if (mode === 'fail') return { code: 1, timedOut: false, tail: ['저장소: (가짜)', `과제:   ${project}`, '오류: 조종석 설정이 없다 (가짜 setup)'] };
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(botDir, '.claude'), { recursive: true });
    if (mode === 'half') return { code: 1, timedOut: false, tail: ['① 폴더', '오류: 설정 틀을 못 읽었다 (가짜 setup · 반쯤)'] };
    fs.writeFileSync(path.join(projectDir, 'house.md'), '# 이 과제에서 일하는 방식\n');
    fs.writeFileSync(path.join(botDir, '.claude', 'settings.json'), '{}\n');
    fs.writeFileSync(path.join(botDir, '.claude', 'settings.local.json'), '{ "permissions": {} }\n');
    return { code: 0, timedOut: false, tail: ['① 폴더', '② 설정 파일 두 장 (ADR-038)', '④ 다음 — 조종석에서 과제를 연다'] };
  };
  run.calls = calls;
  return run;
}
