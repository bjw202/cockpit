// 절단 상한 다섯과 절단 원시함수.
// 출처: minidiscord channel/src/truncate.ts (핀 6633f7b) — 타입만 떼고 옮겼다. 규칙을 바꾸지 않는다.
// test/contract/truncate-ts.test.js 가 원본과 같은 출력을 내는지 맞대 본다.

export const MAX_BODY_BYTES = 4000;      // OD-1 알림 본문 조각 · 이력 원소 본문
export const MAX_ATTACHMENTS = 20;       // OD-2 첨부 원소 수
export const MAX_PATH_BYTES = 512;       // OD-3 첨부 경로 하나
export const MAX_HISTORY_BYTES = 16000;  // OD-4 이력 JSON 전체
export const MAX_NAME_BYTES = 256;       // OD-5 작성자 이름

export const SIGIL_OPEN = '⟪';
export const SIGIL_CLOSE = '⟫';
export const SIGIL_OPEN_ESCAPE = '&#x27EA;';
export const SIGIL_CLOSE_ESCAPE = '&#x27EB;';
export const TRUNC_MARKER_HEAD = `${SIGIL_OPEN}잘림: `;
export const TRUNC_MARKER_TAIL = `바이트 생략${SIGIL_CLOSE}`;

export const formatMarker = omittedBytes => `${TRUNC_MARKER_HEAD}${omittedBytes}${TRUNC_MARKER_TAIL}`;

// 사람 유래 조각의 날것 시길은 절단보다 먼저 엔티티로 바꾼다 — 날것 시길은 시스템이 붙인 표시뿐이어야 한다
export const escapeSigils = text => String(text).replaceAll(SIGIL_OPEN, SIGIL_OPEN_ESCAPE).replaceAll(SIGIL_CLOSE, SIGIL_CLOSE_ESCAPE);

// 남은 본문 + 표시 ≤ 예산. 코드포인트 경계에서 자르고, 표시 자리는 가장 긴 표시만큼 먼저 비켜 둔다.
export function truncateToBudget(text, budgetBytes) {
  const escaped = escapeSigils(text);
  const totalBytes = Buffer.byteLength(escaped, 'utf8');
  if (totalBytes <= budgetBytes) return escaped;
  const keptBudget = budgetBytes - Buffer.byteLength(formatMarker(totalBytes), 'utf8');
  let kept = '';
  let keptBytes = 0;
  for (const ch of escaped) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (keptBytes + b > keptBudget) break;
    kept += ch;
    keptBytes += b;
  }
  return kept + formatMarker(totalBytes - keptBytes);
}
