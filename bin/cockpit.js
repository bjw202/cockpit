#!/usr/bin/env node
// cockpit 명령 하나에 부속 명령 여럿.
//
//   node bin/cockpit.js check [--config <파일>]     설정 검사. 어긋난 키마다 ✗ 한 줄, 하나라도 있으면 exit 1
//
// 설정 파일은 --config 가 없으면 현재 폴더의 cockpit.json 이다.

import path from 'node:path';
import { loadConfig, PATH_KEYS } from '../src/config.js';

export function parseArgs(argv) {
  const pos = []; const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt[k] = true;
      else { opt[k] = next; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}

const configFile = opt => path.resolve(typeof opt.config === 'string' ? opt.config : 'cockpit.json');

function check(opt) {
  const [major] = process.versions.node.split('.').map(Number);
  const [, minor] = process.versions.node.split('.').map(Number);
  let failed = false;
  if (major > 22 || (major === 22 && minor >= 13)) console.log(`✓ node v${process.versions.node} (>= 22.13)`);
  else { console.log(`✗ node v${process.versions.node} — node:sqlite 에 22.13 이상이 필요하다`); failed = true; }

  const { config, errors } = loadConfig(configFile(opt));
  const badKeys = new Set(errors.map(e => e.key));
  for (const e of errors) console.log(`✗ ${e.key} ${e.reason}`);
  for (const key of [...PATH_KEYS, 'claudePath']) {
    if (!badKeys.has(key) && config[key]) console.log(`✓ ${key} ${config[key]}`);
  }
  if (!errors.length) console.log('✓ 경로 공백 없음');
  return failed || errors.length ? 1 : 0;
}

const COMMANDS = { check };

async function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  const cmd = COMMANDS[pos[0]];
  if (!cmd) {
    console.error(`쓰는 법: node bin/cockpit.js <${Object.keys(COMMANDS).join(' | ')}> …`);
    return 1;
  }
  return cmd(opt, pos.slice(1));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('cockpit.js')) {
  main().then(code => { process.exitCode = code; }, e => { console.error('오류: ' + (e && e.message || e)); process.exitCode = 1; });
}
