# cockpit — 검수 (VERIFICATION)

## 1. 층을 나눈다

cockpit 의 절반은 **정해진 입력에 정해진 출력**이다(봉투 · 표 · 큐 · 승인 규칙 · HTTP 모양). 나머지 절반은 **진짜 Claude 세션이 끼어야 보이는 것**이다(하네스가 실리나 · 훅이 걸리나 · 봇이 `reply` 를 부르나 · 압축 뒤 이어지나). 앞은 단위 시험이 잡고, 뒤는 스모크와 대본이 잡는다.

| 층 | 무엇 | 방법 | 누가 쓰나 · 누가 세나 |
|---|---|---|---|
| **A 단위** | 저장소 · 봉투 · 절단 · 도구 처리기 · 승인 규칙 · 계정 · HTTP 모양 · 화면 순수 함수 | `node --test` · fixture | cockpit 이 쓰고 meta 가 돌려 센다 |
| **B 모의 SDK** | 세션 관리자의 상태 · 큐 · 재기동 · 사건 접기 · 승인 대기 | 가짜 `queryFn`(대본대로 메시지를 내고 `canUseTool` 을 부른다) | cockpit 이 쓰고 meta 가 센다 |
| **C 계약** | 형제 저장소 prodev 의 진짜 `chat.js` · `replay.js` 가 cockpit 에 붙어 도나 | 자식 프로세스로 부른다 | cockpit 이 쓰고 meta 가 형제가 있는 작업판에서 센다 |
| **D 진짜 SDK 스모크** | 옵션 조합 · 하네스 실림 · 훅 · `reply` · 승인 콜백 · 압축 · 재기동 | `smoke/*.mjs` (값이 든다) | cockpit 이 쓰고 **meta(또는 사람)가 돌린다** |
| **E 대본 재생** | 옛 대본 다섯(R1~R5)을 조종석으로 | meta 의 `replay.js` · 채점표 | **meta 만** (cockpit 은 대본 · 채점표를 안 본다) |

`npm test` 는 A · B · C 만 돈다. **서버를 띄우지 않고(시험이 임시 포트에 스스로 띄웠다 닫는 것은 된다) · SDK 를 부르지 않고 · 네트워크에 안 나간다.** 이것 자체를 시험이 본다 (`test/no-sdk-import.test.js`).

---

## 2. A · B · C 층 — `npm test` 목록

파일마다 시험 이름은 `TASKS.md` 의 끝 조건에 글자 그대로 있다. 여기는 무엇을 덮는지만.

| 파일 | 마일스톤 | 덮는 것 | 층 |
|---|---|---|---|
| `test/config.test.js` | M1 | 경로 공백 · 상대 경로 · 윈도우 claudePath · 기본값 | A |
| `test/chat-db.test.js` | M1 | 표 여섯 열 핀 · token uuid · 봉투 → targets 여섯 경우 · stored_path 기준 · 작성자 이름 | A |
| `test/cockpit-db.test.js` | M1 | 표 여섯 · 큐 순서 · 첫 답 · 쿠키 원문 없음 | A |
| `test/envelope.test.js` | M1 | 채널 content 글자 일치 · 안내 줄 · 중화 뒤 절단 · meta 무변형 · 지시문 두 자리 | A |
| `test/mcp-tools.test.js` | M1 | reply 방 세 겹 · 첨부 봉인 · fetch_history 모양 · 새것부터 버림 · OD-9 · 서명 | A |
| `test/session-manager.test.js` | M1 | 세션 하나 · idle 규칙 · 묶어 넣기 · 승인 대기 · 즉시 둘 · 상한 · 재기동 · resume 실패 · 압축 system 글 · stream_event 안 적음 | B |
| `test/sdk-options.test.js` | M1 | 옵션 열한 칸 · allowedTools 둘 · env 화이트리스트 · bypass 없음 | A |
| `test/no-sdk-import.test.js` | M1 | SDK import 는 한 파일 | A |
| `test/contract/chat-js.test.js` | M1 | `chat.js --json` 아홉 칸 · targets · show 첨부 경로 | C |
| `test/auth.test.js` | M2 | scrypt · 쿠키 속성 · 만료 · init-admin · session-token | A |
| `test/http-rooms.test.js` | M2 | 길 셋 모양 · 401/406/404/409/400 · stored_path 안 냄 | A |
| `test/contract/replay-js.test.js` | M2 | 진짜 replay.js 가 cockpit 에 붙어 exit 0 | C |
| `test/sse.test.js` | M2 | id · Last-Event-ID · partial | A |
| `test/permissions.test.js` | M2 | 요청 키 · 도우미 둘 · 동시 답 · member 403 · 시간 초과 · allow_session · 두 깃발 · abort · 🔒 글 | B |
| `test/web-static.test.js` | M2 | 외부 URL 0 · type=module · innerHTML 자리 | A |
| `test/web-chat.test.js` · `test/web-card.test.js` | M2 | 화면 순수 함수 | A |
| `test/http-projects.test.js` | M2 | 과제 열기 | A |
| `test/events.test.js` · `test/web-cockpit.test.js` · `test/web-tabs.test.js` | M3 | 사건 접기 · 조종석 판 · 탭 | A · B |
| `test/http-session.test.js` | M3 | 세션 조작 다섯 · 권한 | B |
| `test/http-files.test.js` | M3 | 경로 봉인 · 미리보기 · 읽기 전용 | A |

### 2.1 모의 SDK 의 규격 (`test/fakes/fake-query.js`)

진짜 SDK 가 아니라 **SDK 와 같은 모양의 함수**다. 세션 관리자는 `queryFn({ prompt, options })` 을 주입받으므로 시험은 이것을 넘긴다.

- 대본: 사용자 메시지가 들어올 때마다 낼 SDK 메시지 목록(`system/init` · `assistant(tool_use)` · `user(tool_result)` · `task_*` · `system/status` · `compact_boundary` · `result` …). 걸음에 `canUse: { toolName, input, toolUseID, agentID, … }` 가 있으면 `options.canUseTool` 을 부르고 답이 올 때까지 다음 메시지를 멈춘다.
- 걸음에 `callTool: 'reply', args` 가 있으면 cockpit MCP 처리기를 직접 부른다 (진짜 CLI 가 도구를 부르는 자리).
- 기록: 받은 사용자 메시지 전부 · `interrupt()` · `close()` · `stopTask()` 호출 수 · 받은 `options`.
- `resume` 옵션이 오면 대본의 `resumable: false` 에 따라 오류를 던질 수 있다 (resume 실패 시험).
- 모의 SDK 가 **못 보이는 것**: 진짜 훅이 걸리나 · 모델이 `<channel>` 글을 봉투로 읽나 · 권한 판정이 설정 파일로 먹나. 그것은 D 층이다.

### 2.2 계약 시험의 규격

- 형제 자리: 환경변수 `COCKPIT_PRODEV_DIR`, 없으면 `../prodev`. 거기에 스크립트가 없으면 `t.skip('형제 prodev 없음')`.
- 형제 저장소를 **읽기만** 한다. 임시 폴더에 cockpit 이 만든 `chat.db` 를 두고 `MINIDISCORD_DB` 로 가리킨다.
- `replay.js` 는 임시 대본(걸음 셋) · 임시 기록 경로 · `REPLAY_TOKEN_PL` · `REPLAY_TOKEN_MEMBER`(= `session-token` 이 낸 값) · `--base http://127.0.0.1:<임시 포트>` 로 부른다.
- prodev PR(W2.9) 전과 뒤 모두 돌아야 한다 — `chat.js` · `replay.js` 는 그 PR 이 안 고치는 파일이다.

### 2.3 meta 가 세는 법

```
npm test 2>&1 | grep -E '^ℹ (tests|pass|fail|cancelled|skipped)'
```

Node 24 의 기본 보고 꼴은 요약 줄을 `ℹ tests N` · `ℹ pass N` · `ℹ fail 0` · `ℹ cancelled 0` · `ℹ skipped N` 으로 낸다. TAP 꼴(`# tests N` …)이 필요하면 `node --test --test-reporter=tap "test/**/*.test.js"` 로 같은 묶음을 돌린다. **`skipped` 가 0 이 아니면 C 층을 못 잰 것**이고 통과로 세지 않는다. 시험 수를 늘려 채우는 것을 막으려고 기준은 건수가 아니라 **2절 표의 파일이 있고 TASKS 끝 조건의 시험 이름이 출력에 있는가**다:

```
npm test 2>&1 | grep '^✔'                  # 통과한 시험 이름들 — TASKS 끝 조건의 이름과 맞댄다
npm test 2>&1 | grep '^✖'                  # 비어야 한다
```

---

## 3. D 층 — 진짜 SDK 스모크 (`smoke/`)

진짜 Claude 세션을 띄우므로 값이 들고, 로그인이 필요하며, 모델에 따라 흔들린다. `npm test` 에 안 섞는다. cockpit 은 스크립트와 스크래치 봇 폴더 만드는 법(`smoke/README.md`)을 주고, **meta 또는 사람이 돌려 출력 원문을 `runs/` 에 붙인다.**

공통: 봇 폴더는 스크래치(`PRODEV_BOT_DIR` 도 스크래치) — 실증 3 에서 실제 봇 폴더의 인수인계서를 덮은 일이 있었다. 모델은 인자로 받는다(값을 줄이려면 haiku, 관문은 실전 모델). 스크립트는 판정하지 않고 아래 줄만 낸다.

| 스크립트 | 마일스톤 | 무엇을 하나 | 내는 줄 | 보는 것 |
|---|---|---|---|---|
| `smoke/m1-hello.mjs` | M1 | cockpit 세션 관리자 + 진짜 SDK 로 본방 `안녕` → 답 | `SESSION_ID` · `SYSTEM_PROMPT` · `BOT_REPLY message_id= room=` · `PRE_REPLY_MARKER yes|no` · `ASKED […]` | 하네스가 실리고 · 봇이 `mcp__cockpit__reply` 를 부르고 · pre-reply 표식이 생기고 · `reply` 가 콜백으로 안 오고(ASKED 에 없음) · `chat.js tail` 에 봇 글 |
| `smoke/m1-envelope.mjs` | M1 | `@CC` 글 하나 뒤 `@TO` 글 하나, 파일방에 첨부 하나. `--no-origin` 이면 origin 스탬프 없이 | `ORIGIN channel|none` · `SESSION_START_HOOK yes|no` · `PRE_REPLY_MARKER yes|no` · `REPLY_CHAT_ID <N>` · `REPLIED_TO_CC yes|no` · `READ_ATTACHMENT yes|no` | `<channel>` 글 꼴로 봇이 `chat_id` 를 되돌리고 · `cc` 에 답하지 않고 · 첨부 절대 경로를 `Read` 하나 · origin 을 스탬프해도 훅 둘과 `reply` 가 도나 (ADR-013 의 확인) |
| `smoke/m1-guard.mjs` | M1 (M2 에서 고침) | 스크립트가 한글 1000자 본문을 직접 주고 "그대로 reply 로 보내라" (M1.M 에서 "1200자를 써라" 는 haiku · sonnet 둘 다 900자를 안 넘겨 판정 불가였다 — meta M2 지시 3절) | `GIVEN_BODY_CHARS 1000` · `REPLY_ATTEMPT_CHARS [<시도마다 글자 수>]` · `ATTEMPTED_OVER_900 yes|no` · `HOOK_BLOCKED yes|no` · `ROOM_MESSAGES_FROM_BOT <N>` · `LONG_BOT_MESSAGES <N>` | 900자를 넘긴 시도가 있고 · 훅이 막고 · 방에 900자 넘는 봇 글 0 (F7). `ATTEMPTED_OVER_900 no` 면 판정 불가 — 막는 논리는 prodev `hooks.test.js` 가 잡는다 |
| `smoke/m2-approval.mjs` | M2 | 서버를 임시 포트에 띄우고 HTTP 로: 김과제(member)가 봇에게 `curl --version` 을 네 번 시키고, 김피엘(admin)이 거부 · 허용 · 이번 세션 허용으로 답한 뒤 넷째 판에 다시 묻는지 본다 (meta M2 지시 4절 2항) | 판마다 `CARD tool_use_id= tool= title= displayName= description= suppressAlwaysAllowRule= defaultToNo= suggestions=` · `ANSWER <decision> <status>` · `ROUND <n> …` · 끝에 `REASKED_AFTER_SESSION_ALLOW <N>` · `BASH_RAN_AFTER_SESSION_ALLOW yes|no` · `LOCK_MESSAGES <N>` · `ANSWER_MESSAGES <✅ 수> <⛔ 수>` | 승인 중계 왕복 · 🔒 글 셋 · ✅ 둘 · ⛔ 하나 · 이번 세션 허용 뒤 재요청 0 |
| `smoke/m2-compact.mjs` | M2 (M3 에서 serve + admin API 로) | 진짜 `serve` 를 자식으로 띄우고 admin API 로 켜기 → 글 → 압축 → 글 → 끄기 (실증 5 의 말 셋 · 대본 s3 자리) | `START_API` · `COMPACT_API <status> queued=` · `COMPACTED yes|no` · `COMPACT_BOUNDARY pre= trigger= {compact_metadata}` · `SYSTEM_MESSAGES <N>` · `HANDOFF 정상|못 썼다|없음` · `HANDOFF_AT scratch|prodev …|none` · `FIRST_TEXT_AFTER <앞 40자>` · `HOOKS […]` · `STOP_API` | 압축 · system 글 둘 · 인수인계서가 스크래치 봇 폴더에 · 압축 뒤 첫 답 · admin API 가 손 걸음을 대신한다 |
| `smoke/m3-restart.mjs` | M3 | TASKS M3.6: `serve` 묶음째 SIGKILL → 그 사이 글 둘 → 다시 띄움 → 답 둘, 끝에 admin API 로 끄기 · 켜기 (대본 s5 · s11 자리) | `RESUMED session_id=<uuid>|NEW` · `REDELIVERED <N>` · `BOT_REPLIES_AFTER_RESTART <N>` · `STOP_API` · `START_API_AGAIN … same_session=yes|no` | 재기동 되살림 · 놓친 글 · 끄고 켜도 같은 세션 |
| `smoke/m4-sessions.mjs` | M4 | 세션 셋 5분 | `RSS_MB` 줄 여섯 | 상주 메모리 |

스모크가 **못 보는 것**: 회사 계정 · 회사 PC · 윈도우 env 키(W1 이 잰다) · 실전 과제의 판단 품질(E 층).

---

## 4. E 층 — 옛 대본 다섯 재생 (meta 가 한다)

- 대본 다섯(R1~R5)과 채점표는 meta 가 쥐고, cockpit 세션은 보지 않는다.
- 장치: meta 가 cockpit 을 띄우고 `session-token` 으로 PL · 과제원 토큰을 받아 `prodev/scripts/replay.js` 로 재생한다. cockpit 이 보장하는 것은 **길 셋의 모양(ADR-005)과 계약 시험이 초록이라는 것**뿐이다.
- 조종석이 새로 재게 되는 칸(재기동 · 승인 · 놓친 글)은 meta 의 채점표 몫이다. cockpit 이 도울 수 있는 것은 기록이다: `permission_requests` · `session_events` · 본방 🔒 글 · `agent_sessions.session_id`. meta 는 `chat.db` · `cockpit.db` 사본(`.db` · `-wal` · `-shm` 셋)을 읽기 전용으로 열어 센다.

## 5. 관문마다 cockpit 이 내는 것

| 관문 | cockpit 이 알리는 명령 줄 | 함께 갱신하는 파일 |
|---|---|---|
| M1.M | `npm test` · `node bin/cockpit.js check --config <설정>` · `node smoke/m1-hello.mjs <스크래치 봇 폴더> <모델>` · `node smoke/m1-envelope.mjs …` · `node smoke/m1-guard.mjs …` | `docs/as-built.md` · `docs/log.md` |
| M2.M (= W2) | 위 + `node smoke/m2-approval.mjs …` · `node smoke/m2-compact.mjs …` · `node bin/cockpit.js serve` 와 `session-token` 걸음 | 같음 |
| M3.M (= W3) | 위 + `node smoke/m3-restart.mjs …` | 같음 |
| M4 | 윈도우의 `npm test` · `check` · `smoke/m4-sessions.mjs` | 같음 + `docs/INSTALL-WINDOWS.md` |

절차는 prodev 와 같다: cockpit 이 "끝났다" 와 명령 줄을 알린다 → meta 가 **직접 돌려** 출력을 `runs/` 에 남긴다 → 표를 채운다 → 통과/반려와 빗나간 줄 → cockpit 이 고치고 다시.

## 6. 검수가 못 보는 것 (솔직하게)

- **회사 계정에서 도는가.** 이 맥은 Max 계정이다. W1 이 먼저다 — 거기서 막히면 cockpit 을 만들 까닭이 달라진다.
- **윈도우 env 키 · Git Bash 경로 · `claudePath` 없는 판.** 스모크는 이 맥에서 돈다. W1.3 · W1.4 와 M4.1 이 나눠 맡는다.
- **`cockpit.db` 를 봇이 `Bash(node:*)` 로 여는 것.** deny 는 벽이 아니다(ARCHITECTURE 3.3). 단위 시험으로 못 잡는다. meta 의 P-W3.6 자리다.
- **모델이 `<channel>` 글을 봉투로 믿는가.** `m1-envelope` 한 판은 한 모델 한 번이다. 흔들림은 대본(E)이 여러 번 돌 때 보인다.
- **사람이 승인에 지치는가.** `default` 모드의 카드 수는 조종석에서 처음 재는 값이다 (DESIGN V2).
- **화면이 쓸 만한가.** 화면 시험은 순수 함수와 정적 검사뿐이다. 브라우저에서 눌러 보는 것은 사람 시험의 메모로만 남는다.
- **동시 세션 셋의 자원.** M4 계측은 5분이다. 실전(W4)의 며칠은 모른다.
