// @TO(봇) / @CC(봇) 봉투 파서 — 순수 함수.
// 출처: minidiscord server/src/mention.ts (핀 6633f7b). 정규식 하나가 봉투 문법 전체다 —
// 대문자 TO/CC 만, 봇 이름은 괄호 · 공백 없는 연속 문자, 등장 순서 유지, 중복 제거 없음
// (같은 봇이 TO 와 CC 에 함께 있으면 항목 둘 → message_targets 두 행).
const MENTION_RE = /@(TO|CC)\(([^()\s]+)\)/g;

export function parseMentions(body) {
  const out = [];
  for (const m of String(body ?? '').matchAll(MENTION_RE)) {
    out.push({ bot: m[2], delivery: m[1].toLowerCase() });
  }
  return out;
}
