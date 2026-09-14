# 지금 코드가 어떻게 생겼나 (as-built)

설계는 `ARCHITECTURE.md` 다. **여기는 실제로 만들어진 것**을 적는다. 둘이 다르면 5절에 그 자리가 있다.
마일스톤이 끝날 때마다 갱신한다 (`TASKS.md` 0절). 마지막 갱신 2026-09-14, M1(뼈대) 끝 — M1.M 관문 전.

---

## 1. 폴더 나무

```
cockpit/
  README.md · package.json · package-lock.json · .gitignore · cockpit.example.json
  bin/cockpit.js               check · open-project · chat
  src/config.js                설정 읽기 · 경로 검사
  src/runtime.js               저장소 둘 + 세션 관리자 조립 · 봇 답 기다리기
  src/db/chat-db.js            minidiscord 표 여섯 · 글 넣기(봉투 → targets) · 이력
  src/db/cockpit-db.js         조종석 표 여섯 · 큐 · 승인 첫 답 · 쿠키 해시
  src/envelope/mention.js      봉투 파서 (minidiscord mention.ts 사본)
  src/envelope/truncate.js     절단 상한 다섯 (minidiscord truncate.ts 사본)
  src/envelope/wrap.js         <channel> 씌우기 · 지시문 · 사용자 메시지(origin)
  src/mcp/tools.js             reply · fetch_history 처리기와 서명 정의
  src/session/input-stream.js  스트리밍 입력 흐름
  src/session/env.js           env 화이트리스트
  src/session/options.js       query() 옵션
  src/session/sdk-query.js     SDK 를 import 하는 유일한 파일
  src/session/manager.js       세션 관리자
  test/*.test.js               단위 · 모의 SDK 시험 여덟 파일
  test/contract/*.test.js      형제 저장소의 진짜 파일에 붙이는 계약 시험 두 파일
  test/fakes/fake-query.js     모의 SDK
  smoke/                       진짜 SDK 스모크 셋 + lib.mjs + README.md
  docs/                        PRD · ARCHITECTURE · ADR · TASKS · VERIFICATION · as-built(이 파일) · log
```

M2 이후의 것(`src/http/` · `src/auth/` · `src/permissions/` · `web/`)은 아직 없다.

## 2. 명령

| 명령 | 하는 것 | SDK |
|---|---|---|
| `node bin/cockpit.js check [--config]` | 노드 판(≥ 22.13) · 경로 넷(+ claudePath) 검사. 어긋나면 `✗ <키> <까닭>` · exit 1 | 안 싣는다 |
| `node bin/cockpit.js open-project <과제> --bot-dir <폴더> [--bot-name]` | 봇 한 줄 · 방 둘 · 세션 한 줄 | 안 싣는다 |
| `node bin/cockpit.js chat <과제> "<글>" [--room main\|files] [--as] [--timeout] [--model]` | 세션을 켜고(세션 id 가 있으면 resume) 글 하나 → 봇 답 하나를 찍고 끈다. **승인 요청은 전부 거부한다** (M1 에는 승인 중계가 없다) | 싣는다 |

## 3. 시험 묶음 — `npm test` 62건 · 실패 0 · 건너뜀 0 (2026-09-14, 이 맥에서 제작 세션이 돌림)

| 파일 | 건수 | 층 |
|---|---:|---|
| `test/config.test.js` | 5 | A |
| `test/chat-db.test.js` | 12 | A |
| `test/cockpit-db.test.js` | 5 | A |
| `test/envelope.test.js` | 7 | A |
| `test/mcp-tools.test.js` | 10 | A |
| `test/session-manager.test.js` | 13 | B (모의 SDK) |
| `test/sdk-options.test.js` | 4 | A |
| `test/no-sdk-import.test.js` | 1 | A |
| `test/contract/chat-js.test.js` | 3 | C — 형제 `prodev/scripts/chat.js` |
| `test/contract/truncate-ts.test.js` | 2 | C — 형제 `minidiscord/channel/src/truncate.ts` (Node 타입 떼기로 곧바로 import) |

계약 시험은 형제 저장소가 없으면 건너뛴다. 이 작업판에서는 둘 다 돌았다(건너뜀 0).
TASKS 에 적은 시험 이름에 더해 몇 건을 더 넣었다: 설정의 없는 경로 · `state` 여섯 값 · 보관/없는 방/빈 글 · 사용자 메시지 origin · CLI 가 죽을 때 `error`.

## 4. 스모크 — 제작 세션이 개발 중 돌린 것 (판정 아님. M1.M 판정은 meta 가 사본에서 돌린다)

모델 haiku, 스크래치 폴더, 이 맥(Max 계정). 출력 원문은 붙이지 않고 요지만 적는다.

| 스크립트 | 요지 |
|---|---|
| `m1-hello` | 세션 `idle` · `SYSTEM_PROMPT preset+append` · `BOT_REPLY message_id=2 room=prodev-smoke` · `PRE_REPLY_MARKER yes` · `ASKED []` · 값 $0.026 |
| `m1-envelope` (origin 판) | `SESSION_START_HOOK yes` · `PRE_REPLY_MARKER yes` · `REPLY_CHAT_ID 2 = FILES_ROOM_ID 2` · 첫 줄을 그대로 답함 · `REPLIED_TO_CC no` · `READ_ATTACHMENT yes` · `ASKED ["Read"]` |
| `m1-envelope --no-origin` | 위와 같음 (`READ_ATTACHMENT` 판정 고치기 전 판이라 그 칸만 no — 5절) |
| `m1-guard` | `REPLY_CALLS 2` · `HOOK_BLOCKED yes` · `ROOM_MESSAGES_FROM_BOT 1` · `LONG_BOT_MESSAGES 0` |
| CLI `chat` (가드 스모크의 자리에서) | 저장된 세션 id 로 **resume** · 같은 id 유지 · 봇이 앞 턴을 기억해 답함 · `resume_failed` 없음 |

## 5. 설계와 다르게 된 자리

| 무엇 | 왜 |
|---|---|
| `engines.node` 가 `>=22.13` | `node:sqlite` 가 플래그 없이 되는 첫 판. PRD 는 "≥ 22" 로 적었다 |
| `<channel>` 속성에서 `"` 에 더해 `<` 도 엔티티로 쓴다 | M1.4 시험이 찾았다 — 사람 이름에 `</channel>` 을 넣으면 봉투가 일찍 닫힌 것처럼 보였다. 채널 플러그인은 meta 를 구조 데이터로 넘겨 이 탈출이 필요 없었다 (ARCHITECTURE 4.4 · ADR-013 고침) |
| 옵션 만들기가 `sdk-query.js` 가 아니라 `options.js` | 옵션 시험이 SDK 를 import 하지 않게 갈랐다. SDK 를 싣는 파일은 여전히 하나다 |
| `tool_use` 사건에 `file_path` 칸 | 200자 입력 요약에서 긴 첨부 경로가 잘려 스모크가 Read 를 못 알아봤다. 조종석 판에도 쓴다 |
| `fetch_history` 가 `since_id` 가 있으면 그 뒤의 **오래된 것부터** `limit` 개 | OD-9 를 안 물려받게 거르기를 먼저 걸었는데, 최근 것부터 자르면 커서 사이가 비어서 커서로 이어 읽기가 되게 했다 (ARCHITECTURE 4.2) |
| `src/runtime.js` 가 생겼다 | CLI · 스모크 · (M2) 서버가 같은 조립을 쓴다 |

## 6. 알고 두는 것

- `node:sqlite` 가 기동마다 `ExperimentalWarning` 을 낸다. 동작과 무관하다.
- SDK 가 `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` 경고를 낸다 — `allowedTools` 의 MCP 두 도구가 콜백보다 먼저 허용된다는 뜻이고, 그것이 설계다 (ADR-006 · 실증 5 와 같다).
- 스크래치 자리(`/private/tmp/…`)에서 봇이 첨부를 `Read` 할 때 승인 콜백이 왔다(`ASKED ["Read"]`). `uploadsDir` 는 `additionalDirectories` 에 들어 있다. meta 실증 4h″ 가 같은 경로에서 규칙이 안 맞는 것을 봤다 — 실전 경로는 W1.3 이 잰다.
- M1 에는 승인 중계가 없다. 세션 관리자의 기본 `permissionHandler` 는 전부 거부이고, CLI `chat` 도 거부, 스모크는 전부 허용 + 기록이다.
- 세션 관리자는 `initializationResult()` 가 오면 `idle` 로 본다. 진짜 SDK 에서 스트리밍 입력 전에 이것이 오는 것을 스모크 넷이 보였다.
- 두 저장소에 걸친 쓰기(글은 `chat.db`, 큐는 `cockpit.db`)는 원자적이지 않다. 사이에서 죽으면 그 글은 봇에게 안 간다 (ADR-003 결과).
