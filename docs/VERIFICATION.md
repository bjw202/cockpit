# cockpit — 검수 (VERIFICATION)

**v2 회차 (2026-09-14 저녁).** 층 나누기 · 누가 쓰고 누가 세는지는 그대로다. 더한 것: 2절 표의 M5 줄 · 2.2 계약 `setup.js` · 3절 `smoke/m5-room.mjs` · **4.1 M5.M — 옛 대본 다섯 v2 + 새 대본 R8** · 5절 M5.M 줄 · 6절 v2 줄 · **7절 검수가 안 하는 것**. 근거는 `ADR.md` ADR-015~020 · `TASKS.md` M5.

## 1. 층을 나눈다

cockpit 의 절반은 **정해진 입력에 정해진 출력**이다(봉투 · 표 · 큐 · 승인 규칙 · HTTP 모양). 나머지 절반은 **진짜 Claude 세션이 끼어야 보이는 것**이다(하네스가 실리나 · 훅이 걸리나 · 봇이 `reply` 를 부르나 · 압축 뒤 이어지나). 앞은 단위 시험이 잡고, 뒤는 스모크와 대본이 잡는다.

| 층 | 무엇 | 방법 | 누가 쓰나 · 누가 세나 |
|---|---|---|---|
| **A 단위** | 저장소 · 봉투 · 절단 · 도구 처리기 · 승인 규칙 · 계정 · HTTP 모양 · 화면 순수 함수 · (v2) 방 만들기 되돌림(가짜 setup) · 화면 사본 핀 | `node --test` · fixture | cockpit 이 쓰고 meta 가 돌려 센다 |
| **B 모의 SDK** | 세션 관리자의 상태 · 큐 · 재기동 · 사건 접기 · 승인 대기 · (v2) 봉투 없는 글이 세션을 안 깨움 | 가짜 `queryFn`(대본대로 메시지를 내고 `canUseTool` 을 부른다) | cockpit 이 쓰고 meta 가 센다 |
| **C 계약** | 형제 저장소 prodev 의 진짜 `chat.js` · `replay.js` · (v2) `setup.js` 가 cockpit 에 붙어 도나 | 자식 프로세스로 부른다 | cockpit 이 쓰고 meta 가 형제가 있는 작업판에서 센다 |
| **D 진짜 SDK 스모크** | 옵션 조합 · 하네스 실림 · 훅 · `reply` · 승인 콜백 · 압축 · 재기동 · (v2) 방 만들기 · 사람끼리 글 · 따라잡기 | `smoke/*.mjs` (값이 든다) | cockpit 이 쓰고 **meta(또는 사람)가 돌린다** |
| **E 대본 재생** | 옛 대본 다섯(R1~R5)을 조종석으로 · (v2) 그 v2 판 + 새 대본 R8 | meta 의 `replay.js` · 채점표 | **meta 만** (cockpit 은 대본 · 채점표를 안 본다) |

`npm test` 는 A · B · C 만 돈다. **서버를 띄우지 않고(시험이 임시 포트에 스스로 띄웠다 닫는 것은 된다) · SDK 를 부르지 않고 · 네트워크에 안 나간다.** 이것 자체를 시험이 본다 (`test/no-sdk-import.test.js`).

---

## 2. A · B · C 층 — `npm test` 목록

파일마다 시험 이름은 `TASKS.md` 의 끝 조건에 글자 그대로 있다. 여기는 무엇을 덮는지만.

| 파일 | 마일스톤 | 덮는 것 | 층 |
|---|---|---|---|
| `test/config.test.js` | M1 · M5.0 | 경로 공백 · 상대 경로 · 윈도우 claudePath · 기본값 · (v2) `prodevDir` 기본 · `botsDir` 짝 | A |
| `test/chat-db.test.js` | M1 · M5.1 | 표 여섯 열 핀 · token uuid · 봉투 → targets · stored_path 기준 · 작성자 이름 · (v2) 봉투 없음 → 행 없음 · 방 하나 · `legacy_files` | A |
| `test/cockpit-db.test.js` | M1 | 표 여섯 · 큐 순서 · 첫 답 · 쿠키 원문 없음 | A |
| `test/envelope.test.js` | M1 | 채널 content 글자 일치 · 안내 줄 · 중화 뒤 절단 · meta 무변형 · 지시문 두 자리 | A |
| `test/mcp-tools.test.js` | M1 · M5.2 | reply 방 세 겹 · 첨부 봉인 · fetch_history 모양 · 새것부터 버림 · OD-9 · 서명 · (v2) `attachments` 칸 · v1 바이트 일치 · 20 상한 · 옛 방 읽기만 | A |
| `test/session-manager.test.js` | M1 · M5.1 | 세션 하나 · 즉시 배달 · 묶어 넣기 · 승인 대기 · 상한 · 재기동 · resume 실패 · 압축 system 글 · stream_event 안 적음 · (v2) 봉투 없는 글 셋 → 입력 0 | B |
| `test/sdk-options.test.js` | M1 | 옵션 열한 칸 · allowedTools 둘 · env 화이트리스트 · bypass 없음 | A |
| `test/no-sdk-import.test.js` | M1 | SDK import 는 한 파일 | A |
| `test/contract/chat-js.test.js` | M1 · M5.1 | `chat.js --json` 아홉 칸 · targets · show 첨부 경로 · (v2) 봉투 없는 글 targets 빈 칸 | C |
| `test/auth.test.js` | M2 | scrypt · 쿠키 속성 · 만료 · init-admin · session-token | A |
| `test/http-rooms.test.js` | M2 | 길 셋 모양 · 401/406/404/409/400 · stored_path 안 냄 | A |
| `test/contract/replay-js.test.js` | M2 · M5.1 | 진짜 replay.js 가 cockpit 에 붙어 exit 0 · (v2) 방 하나 판 | C |
| `test/sse.test.js` | M2 | id · Last-Event-ID · partial | A |
| `test/permissions.test.js` | M2 | 요청 키 · 도우미 둘 · 동시 답 · member 403 · 시간 초과 · allow_session · 두 깃발 · abort · 🔒 글 | B |
| `test/web-static.test.js` | M2 · M5.5~M5.7 | 외부 URL 0 · type=module · innerHTML 자리 · markdown.js 핀 · (v2) 토큰 파일 sha256 · 토큰 34 · rich.js sha256 · style.css 원본 구간 · 머리 핀 · 인라인 script 0 · `/api/bots` 0 · 비밀번호 칸 · app.js 고친 함수 = 7.3 표 · 판 요소 · 판 CSS 토큰만 | A |
| ~~`test/web-chat.test.js` · `test/web-tabs.test.js`~~ | M2 · M3 → **M5.8 에서 지움** | 대체 → `test/web-glue.test.js` | — |
| `test/web-glue.test.js` | M5.6 · M5.7 | (v2) 방 봇 칩 재료 · 방 거르기 · 봇 상태 바꾸기 · 안내 글자(미리 채움 시험은 2026-09-15 지움 → web-static) · 판 기본값 · 걸린 수 · rich.js 단추 안 그림 | A |
| `test/web-card.test.js` | M2 | 화면 순수 함수 (v2 접이식 판이 그대로 쓴다) | A |
| `test/http-projects.test.js` | M2 · M5.3 | 과제 열기 · (v2) 방 하나 | A |
| `test/events.test.js` · `test/web-cockpit.test.js` | M3 | 사건 접기 · 조종석 판 (v2 접이식 판이 그대로 쓴다) | A · B |
| `test/http-session.test.js` | M3 | 세션 조작 다섯 · 권한 | B |
| `test/http-files.test.js` | M3 | 경로 봉인 · 미리보기 · 읽기 전용 | A |
| `test/check.test.js` | M4 | `check` 의 ✗ 줄 · `claudePath --version` | A |
| `test/migrate.test.js` | M5.0 | (v2) 보이기만 · `--apply` 보관 · 행 수 그대로 · 두 번 같음 · serve 경고 | A |
| `test/rooms-create.test.js` | M5.3 | (v2) 성공 · setup 실패 · 반쯤 죽음 · cockpit.db 실패 되돌림 · 있던 과제 폴더 보존 · 409 넷 · 동시 요청 · 이름 400 · member 403 · 같은 처리기 · setup env | A (가짜 setup · 임시 포트) |
| `test/rooms-archive.test.js` | M5.4 | (v2) 보관 · TASKS_RUNNING · 409 · 승인 거둬 감 · member 403 · 봇 길 404 | B |
| `test/contract/setup-js.test.js` | M5.3 | (v2) 진짜 `setup.js --project` 가 설정 두 장을 만든다 · exit 1 이면 되돌림 | C |

### 2.1 모의 SDK 의 규격 (`test/fakes/fake-query.js`)

진짜 SDK 가 아니라 **SDK 와 같은 모양의 함수**다. 세션 관리자는 `queryFn({ prompt, options })` 을 주입받으므로 시험은 이것을 넘긴다.

- 대본: 사용자 메시지가 들어올 때마다 낼 SDK 메시지 목록(`system/init` · `assistant(tool_use)` · `user(tool_result)` · `task_*` · `system/status` · `compact_boundary` · `result` …). 걸음에 `canUse: { toolName, input, toolUseID, agentID, … }` 가 있으면 `options.canUseTool` 을 부르고 답이 올 때까지 다음 메시지를 멈춘다.
- 걸음에 `callTool: 'reply', args` 가 있으면 cockpit MCP 처리기를 직접 부른다 (진짜 CLI 가 도구를 부르는 자리).
- 기록: 받은 사용자 메시지 전부 · `interrupt()` · `close()` · `stopTask()` 호출 수 · 받은 `options`.
- `resume` 옵션이 오면 대본의 `resumable: false` 에 따라 오류를 던질 수 있다 (resume 실패 시험).
- 모의 SDK 가 **못 보이는 것**: 진짜 훅이 걸리나 · 모델이 `<channel>` 글을 봉투로 읽나 · 권한 판정이 설정 파일로 먹나 · (v2) 봇이 "위 파일 봐 줘" 에 `fetch_history` 를 부르나. 그것은 D · E 층이다.

**(v2) 가짜 setup (`test/fakes/fake-setup.js`).** `runSetup({ project, prodevDir, configFile })` 과 같은 모양. 모드 넷: `ok`(과제 폴더 · 봇 폴더 · `.claude/settings.json` · `settings.local.json` 을 만들고 exit 0) · `fail`(아무것도 안 만들고 exit 1, 표준 오류 세 줄) · `half`(봇 폴더만 만들고 exit 1) · `slow`(상한 시험용). 기록: 부른 수 · 받은 인자 · 받은 env 키.

### 2.2 계약 시험의 규격

- 형제 자리: 환경변수 `COCKPIT_PRODEV_DIR`, 없으면 `../prodev`. 거기에 스크립트가 없으면 `t.skip('형제 prodev 없음')`.
- 형제 저장소를 **읽기만** 한다. 임시 폴더에 cockpit 이 만든 `chat.db` 를 두고 `MINIDISCORD_DB` 로 가리킨다.
- `replay.js` 는 임시 대본(걸음 셋) · 임시 기록 경로 · `REPLAY_TOKEN_PL` · `REPLAY_TOKEN_MEMBER`(= `session-token` 이 낸 값) · `--base http://127.0.0.1:<임시 포트>` 로 부른다. (v2) 대본의 방은 본방 하나다.
- prodev PR(W2.9) 전과 뒤 모두 돌아야 한다 — `chat.js` · `replay.js` 는 그 PR 이 안 고치는 파일이다. (v2) M5.10 PR 도 이 둘을 안 고친다.
- **(v2) `setup.js` 계약.** 형제 prodev 의 `scripts/` · `common/` · `CLAUDE.md` · `.claude/` 를 임시 폴더로 **복사**한 사본(`smoke/scratch.mjs` 와 같은 배치)에서 부른다 — 본 체크아웃의 `bots/` 에 봇 폴더가 생기지 않게. 임시 `cockpit.json` 의 `prodevDir` · `botsDir` · `projectsDir` · `dataDir` · `uploadsDir` 는 모두 임시 폴더 안. 사본에서 `git init` 이 필요하면 시험이 먼저 한다.

### 2.3 meta 가 세는 법

```
npm test 2>&1 | grep -E '^ℹ (tests|pass|fail|cancelled|skipped)'
```

Node 24 의 기본 보고 꼴은 요약 줄을 `ℹ tests N` · `ℹ pass N` · `ℹ fail 0` · `ℹ cancelled 0` · `ℹ skipped N` 으로 낸다. TAP 꼴(`# tests N` …)이 필요하면 `node --test --test-reporter=tap "test/**/*.test.js"` 로 같은 묶음을 돌린다. **`skipped` 가 0 이 아니면 C 층을 못 잰 것**이고 통과로 세지 않는다. 시험 수를 늘려 채우는 것을 막으려고 기준은 건수가 아니라 **2절 표의 파일이 있고 TASKS 끝 조건의 시험 이름이 출력에 있는가**다:

```
npm test 2>&1 | grep '^✔'                  # 통과한 시험 이름들 — TASKS 끝 조건의 이름과 맞댄다
npm test 2>&1 | grep '^✖'                  # 비어야 한다
```

(v2) 이름을 바꾸거나 지운 시험은 as-built 의 "대체된 시험 이름" 짝 표로 맞댄다 — 옛 이름이 출력에 없고 새 이름이 있어야 한다.

---

## 3. D 층 — 진짜 SDK 스모크 (`smoke/`)

진짜 Claude 세션을 띄우므로 값이 들고, 로그인이 필요하며, 모델에 따라 흔들린다. `npm test` 에 안 섞는다. cockpit 은 스크립트와 스크래치 봇 폴더 만드는 법(`smoke/README.md`)을 주고, **meta 또는 사람이 돌려 출력 원문을 `runs/` 에 붙인다.**

공통: 봇 폴더는 스크래치(`PRODEV_BOT_DIR` 도 스크래치) — 실증 3 에서 실제 봇 폴더의 인수인계서를 덮은 일이 있었다. 모델은 인자로 받는다(값을 줄이려면 haiku, 관문은 실전 모델). 스크립트는 판정하지 않고 아래 줄만 낸다. (v2) 모든 스크립트가 방 하나 판으로 돈다 — 첨부는 본방 `@TO` 글에 올린다.

| 스크립트 | 마일스톤 | 무엇을 하나 | 내는 줄 | 보는 것 |
|---|---|---|---|---|
| `smoke/m1-hello.mjs` | M1 | cockpit 세션 관리자 + 진짜 SDK 로 본방 `안녕` → 답 | `SESSION_ID` · `SYSTEM_PROMPT` · `BOT_REPLY message_id= room=` · `PRE_REPLY_MARKER yes|no` · `ASKED […]` | 하네스가 실리고 · 봇이 `mcp__cockpit__reply` 를 부르고 · pre-reply 표식이 생기고 · `reply` 가 콜백으로 안 오고(ASKED 에 없음) · `chat.js tail` 에 봇 글. (v2) 글에 `@TO(<봇>)` 을 붙인다 |
| `smoke/m1-envelope.mjs` | M1 (M5.1 에서 고침) | `@CC` 글 하나 뒤 `@TO` 글 하나, ~~파일방에~~ (v2) 본방 `@TO` 글에 첨부 하나. `--no-origin` 이면 origin 스탬프 없이 | `ORIGIN channel|none` · `SESSION_START_HOOK yes|no` · `PRE_REPLY_MARKER yes|no` · `REPLY_CHAT_ID <N>` · `REPLIED_TO_CC yes|no` · `READ_ATTACHMENT yes|no` | `<channel>` 글 꼴로 봇이 `chat_id` 를 되돌리고 · `cc` 에 답하지 않고 · 첨부 절대 경로를 `Read` 하나 · origin 을 스탬프해도 훅 둘과 `reply` 가 도나 (ADR-013 의 확인) |
| `smoke/m1-guard.mjs` | M1 (M2 에서 고침) | 스크립트가 한글 1000자 본문을 직접 주고 "그대로 reply 로 보내라" (M1.M 에서 "1200자를 써라" 는 haiku · sonnet 둘 다 900자를 안 넘겨 판정 불가였다 — meta M2 지시 3절) | `GIVEN_BODY_CHARS 1000` · `REPLY_ATTEMPT_CHARS [<시도마다 글자 수>]` · `ATTEMPTED_OVER_900 yes|no` · `HOOK_BLOCKED yes|no` · `ROOM_MESSAGES_FROM_BOT <N>` · `LONG_BOT_MESSAGES <N>` | 900자를 넘긴 시도가 있고 · 훅이 막고 · 방에 900자 넘는 봇 글 0 (F7). `ATTEMPTED_OVER_900 no` 면 판정 불가 — 막는 논리는 prodev `hooks.test.js` 가 잡는다 |
| `smoke/m2-approval.mjs` | M2 | 서버를 임시 포트에 띄우고 HTTP 로: 김과제(member)가 봇에게 `curl --version` 을 네 번 시키고, 김피엘(admin)이 거부 · 허용 · 이번 세션 허용으로 답한 뒤 넷째 판에 다시 묻는지 본다 (meta M2 지시 4절 2항) | 판마다 `CARD tool_use_id= tool= title= displayName= description= suppressAlwaysAllowRule= defaultToNo= suggestions=` · `ANSWER <decision> <status>` · `ROUND <n> …` · 끝에 `REASKED_AFTER_SESSION_ALLOW <N>` · `BASH_RAN_AFTER_SESSION_ALLOW yes|no` · `LOCK_MESSAGES <N>` · `ANSWER_MESSAGES <✅ 수> <⛔ 수>` | 승인 중계 왕복 · 🔒 글 셋 · ✅ 둘 · ⛔ 하나 · 이번 세션 허용 뒤 재요청 0 |
| `smoke/m2-compact.mjs` | M2 (M3 에서 serve + admin API 로) | 진짜 `serve` 를 자식으로 띄우고 admin API 로 켜기 → 글 → 압축 → 글 → 끄기 (실증 5 의 말 셋 · 대본 s3 자리) | `START_API` · `COMPACT_API <status> queued=` · `COMPACTED yes|no` · `COMPACT_BOUNDARY pre= trigger= {compact_metadata}` · `SYSTEM_MESSAGES <N>` · `HANDOFF 정상|못 썼다|없음` · `HANDOFF_AT scratch|prodev …|none` · `FIRST_TEXT_AFTER <앞 40자>` · `HOOKS […]` · `STOP_API` | 압축 · system 글 둘 · 인수인계서가 스크래치 봇 폴더에 · 압축 뒤 첫 답 · admin API 가 손 걸음을 대신한다 |
| `smoke/m3-restart.mjs` | M3 | TASKS M3.6: `serve` 묶음째 SIGKILL → 그 사이 글 둘 → 다시 띄움 → 답 둘, 끝에 admin API 로 끄기 · 켜기 (대본 s5 · s11 자리) | `RESUMED session_id=<uuid>|NEW` · `REDELIVERED <N>` · `BOT_REPLIES_AFTER_RESTART <N>` · `STOP_API` · `START_API_AGAIN … same_session=yes|no` | 재기동 되살림 · 놓친 글 · 끄고 켜도 같은 세션. (v2) 그 사이 넣는 글 둘은 `@TO` 글 |
| `smoke/m4-sessions.mjs` | M4 | 진짜 `serve` 를 자식으로 띄우고 admin API 로 과제 셋을 켜 한 번씩 답하게 한 뒤, 0~5분 1분마다 serve 와 그 밑 프로세스 나무의 상주 메모리 (맥 · 리눅스 `ps` · 윈도우 `Win32_Process.WorkingSetSize`) | `PLATFORM` · `START_API <과제>` 셋 · `WARM <과제>` 셋 · `RSS_MB <분> <서버> <자식 합>` 여섯 · `CHILD_PROCS <분> <수>` 여섯 · `STATES` · `STOP_API` 셋 | 상주 메모리 (P-W4.d, 회사 PC 판이 근거) |
| **`smoke/m5-room.mjs`** | **M5.9** | (v2) 스크래치 prodev 사본 위 진짜 `serve` 로: admin 방 만들기(진짜 `setup.js`) → 켜기 → member 봉투 없는 글 둘(하나에 csv) → 30초 → member `@TO(<봇>) 위에 올린 파일 봐 주세요` → 답 → admin 보관. `--fail-setup` 판은 되돌림만 | `ROOM_CREATE_API <status> room= bot= setup_ms=` · `ROOMS_FOR_PROJECT <N>` · `START_API` · `PLAIN_MESSAGES 2 TARGET_ROWS <N> INBOX_ROWS <N>` · `BOT_TURNS_AFTER_PLAIN <N>` · `FETCH_HISTORY_CALLED yes|no` · `FETCH_HISTORY_HAS_ATTACHMENTS yes|no` · `READ_ATTACHMENT yes|no` · `BOT_REPLY message_id=` · `ARCHIVE_API <status> state=` · `ASKED […]` · (`--fail-setup`) `ROOM_CREATE_API 502` · `ROLLBACK_BOT_DIR_EXISTS yes|no` · `ROLLBACK_ROWS <N>` | 방 만들기가 봇 폴더까지 만들고(`ROOMS_FOR_PROJECT 1`) · 사람끼리 글이 봇 턴을 안 만들고(`TARGET_ROWS 0` · `BOT_TURNS_AFTER_PLAIN 0`) · 부르면 `fetch_history` 로 첨부까지 끌어와 읽고 · 보관이 세션을 끄고 · setup 실패면 흔적 0 |

스모크가 **못 보는 것**: 회사 계정 · 회사 PC · 윈도우 env 키(W1 이 잰다) · 실전 과제의 판단 품질(E 층) · (v2) 화면을 사람이 눌렀을 때의 느낌.

---

## 4. E 층 — 옛 대본 다섯 재생 (meta 가 한다)

- 대본 다섯(R1~R5)과 채점표는 meta 가 쥐고, cockpit 세션은 보지 않는다.
- 장치: meta 가 cockpit 을 띄우고 `session-token` 으로 PL · 과제원 토큰을 받아 `prodev/scripts/replay.js` 로 재생한다. cockpit 이 보장하는 것은 **길 셋의 모양(ADR-005)과 계약 시험이 초록이라는 것**뿐이다.
- 조종석이 새로 재게 되는 칸(재기동 · 승인 · 놓친 글)은 meta 의 채점표 몫이다. cockpit 이 도울 수 있는 것은 기록이다: `permission_requests` · `session_events` · 방의 🔒 글 · `agent_sessions.session_id`. meta 는 `chat.db` · `cockpit.db` 사본(`.db` · `-wal` · `-shm` 셋)을 읽기 전용으로 열어 센다.

### 4.1 (v2) M5.M — 옛 대본 다섯의 v2 판 + 새 대본 R8 (새 기준선)

- **대본은 meta 가 고친다.** 옛 대본 다섯을 방 하나 판(파일방에 올리던 걸음을 본방 `@TO` 글로)으로 바꾼 것과 새 대본 R8(**사람끼리 글 · 따라잡기** — 과제원 둘이 봉투 없이 이야기하고 파일을 올린 뒤, 한 사람이 봇을 불러 "위 내용 · 위 파일" 로 진행을 청한다)을 meta 가 쓴다. cockpit 세션은 대본 · 채점표 · 예측을 안 본다. **옛 판정과 비교하지 않는다 — 새 기준선이다** (`DIRECTION-v2.md` 2.3).
- **재생 전 조건 (cockpit 이 알린다).** ① M5 의 `npm test` 요약 `fail 0` · `skipped 0` ② prodev PR(M5.10)이 머지됐거나 재생이 그 가지(`COCKPIT_PRODEV_DIR`)에서 돈다 — 안 들어가면 확정 조건 ②(같은 과제의 `/files` 방)가 본방의 "확정" 을 막는다 ③ 재생용 방은 옛 봇 이름(`prodev-worktogether-비서` 꼴)이라 `node bin/cockpit.js open-project <과제> --no-setup --bot-name <이름> --bot-dir <스크래치 봇 폴더>` 로 연다(스크래치 봇 폴더는 `smoke/scratch.mjs` 방법). 새 이름으로 여는 판은 `POST /api/rooms`(진짜 setup)로 연다 ④ 이미 v1 로 연 `chat.db` 를 이어 쓰면 먼저 `migrate-v2 --apply`.
- **cockpit 이 R8 에 대해 남기는 기록** (meta 가 세는 재료 — 판정 기준은 meta 의 것):

| 무엇 | 어디서 센다 |
|---|---|
| 봉투 없는 사람 글이 봇에게 간 수 | `chat.db`: 봉투 없는 글의 `message_targets` 행 · `cockpit.db`: 그 `message_id` 의 `bot_inbox` 행 (둘 다 0 이어야 규칙대로) |
| 사람끼리 글 사이에 봇 턴이 돈 수 | `cockpit.db session_events`: 그 구간의 `delivered` 사건 · `result` 사건 |
| 봇이 따라잡기에 부른 도구 | `session_events type='tool_use'` 의 `name = mcp__cockpit__fetch_history` · 그 `input`(since_id · chat_id) |
| 따라잡기 결과에 첨부가 실렸나 | 같은 사건 짝 `tool_result` 의 `content` 앞 200자(요약) — 전문은 안 적는다. 필요하면 `chat.db` 로 같은 질의를 다시 돌린다 |
| 봇이 끌어온 첨부를 읽었나 | `session_events type='tool_use'` 의 `name = Read` · `file_path` 가 `uploadsDir` 아래 |
| 방 수 · 옛 방 | `GET /api/rooms` · `GET /api/projects` 의 `rooms.legacy_files` |

- 화면(minidiscord 사본 · 접이식 판)의 쓸 만함은 E 층이 못 잰다 — 사람이 회사 PC 설치 때 눌러 본다(M3.M N13 과 같은 자리).

## 5. 관문마다 cockpit 이 내는 것

| 관문 | cockpit 이 알리는 명령 줄 | 함께 갱신하는 파일 |
|---|---|---|
| M1.M | `npm test` · `node bin/cockpit.js check --config <설정>` · `node smoke/m1-hello.mjs <스크래치 봇 폴더> <모델>` · `node smoke/m1-envelope.mjs …` · `node smoke/m1-guard.mjs …` | `docs/as-built.md` · `docs/log.md` |
| M2.M (= W2) | 위 + `node smoke/m2-approval.mjs …` · `node smoke/m2-compact.mjs …` · `node bin/cockpit.js serve` 와 `session-token` 걸음 | 같음 |
| M3.M (= W3) | 위 + `node smoke/m3-restart.mjs …` | 같음 |
| M4 | 윈도우의 `npm test` · `check` · `smoke/m4-sessions.mjs` | 같음 + `docs/INSTALL-WINDOWS.md` |
| **D0-v2** | (문서만) 커밋 목록 · 새 ADR 번호 · 새 질문 | `docs/` 다섯 · `docs/log.md` |
| **M5.M (v2)** | `npm test` · `COCKPIT_PRODEV_DIR=<PR 가지> npm test` · `node bin/cockpit.js check --config <설정>`(✓ prodevDir 줄) · `node bin/cockpit.js migrate-v2 --config <v1 스크래치 설정>` 과 `--apply` · `node smoke/m5-room.mjs <스크래치> <모델>` · `node smoke/m5-room.mjs <스크래치> <모델> --fail-setup` · 옛 스모크 다섯의 방 하나 판 · 재생용 `open-project --no-setup --bot-name` 걸음 · prodev PR 번호 | 같음 + `smoke/README.md` |

절차는 prodev 와 같다: cockpit 이 "끝났다" 와 명령 줄을 알린다 → meta 가 **직접 돌려** 출력을 `runs/` 에 남긴다 → 표를 채운다 → 통과/반려와 빗나간 줄 → cockpit 이 고치고 다시.

## 6. 검수가 못 보는 것 (솔직하게)

- **회사 계정에서 도는가.** 이 맥은 Max 계정이다. W1 이 먼저다 — 거기서 막히면 cockpit 을 만들 까닭이 달라진다.
- **윈도우 env 키 · Git Bash 경로 · `claudePath` 없는 판.** 스모크는 이 맥에서 돈다. W1.3 · W1.4 와 M4.1 이 나눠 맡는다.
- **`cockpit.db` 를 봇이 `Bash(node:*)` 로 여는 것.** deny 는 벽이 아니다(ARCHITECTURE 3.3). 단위 시험으로 못 잡는다. meta 의 P-W3.6 자리다.
- **모델이 `<channel>` 글을 봉투로 믿는가.** `m1-envelope` 한 판은 한 모델 한 번이다. 흔들림은 대본(E)이 여러 번 돌 때 보인다.
- **사람이 승인에 지치는가.** `default` 모드의 카드 수는 조종석에서 처음 재는 값이다 (DESIGN V2).
- **화면이 쓸 만한가.** 화면 시험은 순수 함수와 정적 검사뿐이다. 브라우저에서 눌러 보는 것은 사람 시험의 메모로만 남는다.
- **동시 세션 셋의 자원.** M4 계측은 5분이다. 실전(W4)의 며칠은 모른다.
- (v2) **옮긴 화면의 DOM 몸통.** minidiscord 에서는 jsdom 시험이 `app.js` 를 덮었지만 cockpit 은 그 시험을 옮기지 않는다(의존성 0). cockpit 이 기계로 보는 것은 "원본에서 달라진 함수가 7.3 표의 것뿐" 과 잇는 순수 함수까지다. 방 전환 · 자동완성 · 붙여넣기가 cockpit 서버에 붙어 실제로 도는지는 사람이 눌러 본다.
- (v2) **"디자인을 살렸나" 의 절반.** 토큰 파일 · `rich.js` · `style.css` 원본 구간의 sha256 은 기계가 센다. 접이식 판이 minidiscord 화면 옆에서 어색하지 않은지는 사람 눈이다.
- (v2) **사람이 봉투를 지우고 봇을 부른 줄 아는 일.** 규칙대로면 봇이 조용하다. 몇 번 헷갈리는지는 W4 실전이 잰다.
- (v2) **따라잡기의 판단 품질.** cockpit 은 `fetch_history` 결과에 첨부를 싣는 데까지다. "위 내용" 을 어디서부터 읽고 파일 여럿을 어떤 순서로 들이는지는 prodev 스킬과 모델이다 — R8 대본이 잰다.
- (v2) **회사 PC 에서 방 만들기가 60초 안에 끝나나.** `setup.js` 의 `git init` · 파일 쓰기 · 윈도우 경로. 이 맥의 `setup_ms` 는 근거가 아니다.

## 7. 검수가 안 하는 것 (v2 갱신)

- cockpit 세션이 자기 관문 판정을 하는 것 · 예측표 · 채점표 · 대본을 읽는 것
- 옛 대본 판정(W2 · W3)과 v2 판정을 같은 줄에 놓고 비교하는 것 — v2 는 새 기준선이다
- 봇 없는 방 · 봇 배정 · 봇 등록 화면 검수 (R13 — 만들지 않는다)
- 옛 files 방의 글이 본방으로 옮겨졌는지 보는 것 (옮기지 않는다 — 보관만 셈)
- 첨부를 브라우저 안에서 여는 것 · 딥링크 (받기만)
- jsdom · 브라우저 자동화로 화면을 돌리는 것 (의존성 0 · M3.M N13 결정 그대로)
- `weekly.sh` 의 "카드 없는 첨부" 계측 기준을 cockpit 검수에 넣는 것 (meta 몫)
- 윈도우 실측을 이 맥에서 흉내 내는 것 (M4 그대로)
