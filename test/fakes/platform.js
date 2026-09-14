// 플랫폼마다 못 도는 시험 자리 (TASKS M4.1). 건너뜀은 통과로 세지 않는다 — 이름은 docs/as-built.md 4절에 적는다.
//
// 심볼릭 링크: 윈도우는 개발자 모드나 관리자 권한 없이 fs.symlinkSync 가 EPERM 이다 (작업판 WINDOWS.md 8절).
// 그래서 플랫폼 이름이 아니라 이 기계에서 실제로 만들어 보고 가른다 — 개발자 모드를 켠 윈도우는 링크 칸도 돈다.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function probeSymlink() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-link-probe-'));
  try {
    fs.writeFileSync(path.join(dir, 'a'), 'a');
    fs.symlinkSync(path.join(dir, 'a'), path.join(dir, 'b'));
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// COCKPIT_TEST_NO_SYMLINK=1 — 링크를 만드는 기계(맥)에서도 윈도우의 건너뛰는 길을 돌려 본다
export const CAN_SYMLINK = process.env.COCKPIT_TEST_NO_SYMLINK ? false : probeSymlink();
// node:test 의 { skip } 에 그대로 넣는다 — false 면 돈다, 글이면 그 까닭으로 건너뛴다
export const SKIP_NO_SYMLINK = CAN_SYMLINK ? false : '이 기계는 심볼릭 링크를 못 만든다 (윈도우 개발자 모드 꺼짐)';
export const SKIP_WIN32 = process.platform === 'win32' ? '윈도우는 셸 스크립트 가짜 실행 파일을 execFile 로 못 부른다' : false;
