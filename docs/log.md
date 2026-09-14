# 일지 (log)

제작 세션이 마일스톤마다 한 절씩 적는다. 무엇을 했고 · 무엇이 막혔고 · 무엇을 스스로 정했나. 판정은 적지 않는다 (meta 의 것이다).

## 2026-09-14 — D0 문서 · M1 뼈대

**D0 (문서 다섯).** meta 설계 검토 문서 · 실증 다섯 · 결합 재고 · 선행 조사와 prodev · minidiscord 원본을 읽고 PRD · ARCHITECTURE · ADR · TASKS · VERIFICATION 을 썼다(187a96e). meta 관문 D0 조건부 통과. 조건과 답을 반영했다(2dbc703): `fetch_history` 서명 전문 · 답 줄 ✅/⛔ · `/compact` 도 idle 대기 · origin 스탬프 · 봇 이름은 과제를 열 때.

**M1 (뼈대).** 태스크마다 커밋했다: M1.1 8dca4af · M1.2 a13b124 · M1.3 f181f6c · M1.4 2e33ab6 · M1.5 f699232 · M1.6 db36859 · M1.7 dca49c5. `npm test` 62건 실패 0 건너뜀 0.

막힌 것 · 고친 것:
- 시험이 봉투 구멍 하나를 찾았다: `<channel>` 속성에 사람 이름을 그대로 실으면 이름의 `</channel>` 이 봉투를 일찍 닫는다. `<` 도 엔티티로 쓰게 고치고 문서를 고쳤다. meta 에 새 질문으로 올린다.
- "SDK import 는 한 파일" 시험이 자기 제목의 글자에 걸렸다. import 문만 보게 고쳤다.
- 스모크의 `READ_ATTACHMENT` 가 거짓 음성이었다(입력 요약 200자에서 경로가 잘림). 사건에 `file_path` 칸을 두었다.
- `m1-hello` 가 봇 글만 보고 닫아 값이 0 으로 찍혔다. 턴 끝을 기다리게 고쳤다.

스스로 정한 것:
- `engines.node >=22.13` (`node:sqlite` 무플래그).
- 옵션 만들기를 `options.js` 로 갈라 SDK 없이 시험한다.
- `fetch_history` 는 `since_id` 가 있으면 그 뒤의 오래된 것부터 `limit` 개.
- CLI `chat` 은 승인 요청을 전부 거부한다 (M2 의 승인 중계 전까지).
- 스크래치 봇 폴더는 prodev 설정 틀을 채운 사본에서 도구 이름 · `MINIDISCORD_URL` · deny 셋을 바꾼다 (prodev PR 전).
