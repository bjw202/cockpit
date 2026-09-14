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

## 2026-09-14 — M1.M 통과 · M2 지시 (새 세션이 여기서 시작한다)

**M1.M 통과** (meta 기록 `meta/prodev-review/runs/2026-09-14-cockpit-M1M.md`). meta 가 사본에서 돌림: `npm test` 62/62 · 계약 5건 돎 · PRAGMA 열 순서 일치 · SDK import 한 파일 · m1-hello ○ · m1-envelope ○ · m1-guard 는 haiku · sonnet 둘 다 900자를 안 넘겨 **판정 불가**(훅은 표식으로 확인).

**질문 답**: N1 속성 `<` 탈출 승인(ADR-013 문구 반영함) · N2 uploads Read 콜백은 meta W1.3 몫, cockpit 은 안 고침 · N3 engines ≥ 22.13 승인(PRD 반영함) · N4 · N5 · N6 승인.

**M1 잔여 (M2 중에 함께)**: `smoke/m1-guard.mjs` 를 바꿔 스모크가 1000자 본문을 **직접 주고** "이 글을 그대로 reply 로 보내라" 로 한 번 더. 그래도 안 넘기면 as-built 스모크 표에 "모델이 지침을 지켜 재현 불가 — 막는 논리는 prodev hooks.test.js 가 잡는다" 로 적고 접는다.

**M2 진행 규칙** (M1 과 같음: 태스크 단위 커밋 · 첫 줄에 태스크 번호 · `npm test` 는 서버 · SDK · 네트워크 없이 · 스모크는 스크래치 + haiku + `prodev/bots` 금지 · 형제 본 체크아웃은 읽기만 · meta 의 예측 · 채점표 · fixtures · runs 안 읽음) + 셋:
1. **M2.M 은 곧 W2 관문**이다. meta 가 옛 대본 다섯을 `prodev/scripts/replay.js` 로 cockpit 서버에 재생한다. M2 끝에 되어야 하는 것: `node bin/cockpit.js serve --config <설정>` 으로 서버가 뜬다 · `node bin/cockpit.js session-token <이름>` 이 `md_session` 값을 낸다 · 길 셋(`GET /api/rooms` · `POST /api/rooms/:id/messages` multipart · `GET /api/rooms/:id/messages?after=`)이 minidiscord 와 같은 응답 모양 · `open-project` 가 방 둘을 만든다. 계약은 `prodev/scripts/replay.js:18-25, 85-124` 와 `prodev/test/server/replay.test.js` — **그 가짜 서버 시험이 cockpit 서버에 대해서도 초록이게** 계약 시험으로 넣는다.
2. 승인 카드(M2.4)는 SDK 가 준 `title · displayName · description · suggestions · suppressAlwaysAllowRule · defaultToNo` 를 그대로 쓴다. `smoke/m2-approval.mjs` 는 admin 거부 한 번 · 허용 한 번 · "이번 세션 허용" 한 번(같은 도구 재요청이 0 인지)까지.
3. 화면은 프레임워크 · 빌드 · CDN 없이. minidiscord `web/markdown.js` 사본은 머리에 출처 핀.

**M2 끝 보고 꼴**: 커밋 · `npm test` 요약 · 스모크 · 문서 변경 · 질문 + 서버 띄우는 명령 한 줄과 설정 예시.
