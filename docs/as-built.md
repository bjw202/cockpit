# 지금 코드가 어떻게 생겼나 (as-built)

설계는 `ARCHITECTURE.md` 다. **여기는 실제로 만들어진 것**을 적는다. 둘이 다르면 5절에 그 자리가 있다.
마일스톤이 끝날 때마다 갱신한다 (`TASKS.md` 0절). 마지막 갱신 2026-09-14, M3 끝(M3.0~M3.6 · M3.M 준비) — W3 관문 전.

---

## 1. 폴더 나무

```
cockpit/
  README.md · package.json · package-lock.json · .gitignore · cockpit.example.json
  bin/cockpit.js               check · open-project · chat · init-admin · add-user · session-token · serve
  src/config.js                설정 읽기 · 경로 검사
  src/runtime.js               저장소 둘 + 승인 중계 + 세션 관리자 조립 · 봇 답 기다리기
  src/db/chat-db.js            minidiscord 표 여섯 · 글 넣기(봉투 → targets) · 이력 · 첨부
  src/db/cockpit-db.js         조종석 표 여섯 · 계정 · 쿠키 해시 · 큐 · 승인 첫 답 · 사건(lastEvents)
  src/envelope/mention.js      봉투 파서 (minidiscord mention.ts 사본)
  src/envelope/truncate.js     절단 상한 다섯 (minidiscord truncate.ts 사본)
  src/envelope/wrap.js         <channel> 씌우기 · 지시문 · 사용자 메시지(origin)
  src/mcp/tools.js             reply · fetch_history 처리기와 서명 정의
  src/session/input-stream.js  스트리밍 입력 흐름
  src/session/env.js           env 화이트리스트
  src/session/options.js       query() 옵션
  src/session/sdk-query.js     SDK 를 import 하는 유일한 파일
  src/session/manager.js       세션 관리자 — 큐 · 상태 · 사건 접기 · 도우미 집합 · 문맥 사용률 · 끄기 · 다시 켜기 · 도우미 멈춤
  src/auth/password.js         scrypt 해시 · 대조                                  (M2.1)
  src/auth/sessions.js         이름 규칙 · 계정 만들기 · 로그인 · 쿠키 · session-token (M2.1)
  src/http/server.js           node:http · 길 표 · 인증 수준 · Origin · 정적 서빙 · /api/health · /api/stream (M2.2 · M2.3)
  src/http/respond.js          HttpError · JSON 응답 · JSON 본문 읽기              (M2.2)
  src/http/routes-auth.js      로그인 · 로그아웃 · 나 · 계정(admin)                (M2.2)
  src/http/routes-rooms.js     GET /api/rooms                                     (M2.2)
  src/http/routes-messages.js  글 길 둘 · 첨부 받기                                (M2.2)
  src/http/multipart.js        Request.formData() 로 multipart                    (M2.2)
  src/http/sse.js              SSE 허브 · 세션 관리자 · 중계 사건 잇기             (M2.3)
  src/permissions/relay.js     승인 중계 · 과제의 걸린 요청 거둬 감(cancelProject) (M2.4 · M3.3)
  src/http/routes-permissions.js  승인 목록 · 답                                   (M2.4)
  src/http/routes-projects.js  과제 목록 · 열기 · 이름 규칙 · 사건 되그리기 길      (M2.7 · M3.1)
  src/http/routes-session.js   세션 조작 다섯 · 도우미 멈춤                        (M3.3)
  src/http/routes-files.js     파일 판 — 폴더 목록 · 미리보기 · 실경로 봉인 · csv   (M3.4)
  web/index.html · app.js      화면 한 장 · 몸통(로그인 · 탭 · 판 셋 · 방 · 글 · 첨부 · SSE · 카드 · 조종석 · 파일) (M2.5 · M2.6 · M3.5)
  web/chat.js · card.js        채팅 판 · 승인 카드의 순수 함수와 DOM 조각          (M2.5 · M2.6)
  web/cockpit.js               조종석 판의 순수 함수와 DOM 조각                    (M3.2)
  web/files.js                 파일 판의 DOM 조각 (길 주소 · 빵 부스러기 · 미리보기) (M3.4 화면)
  web/tabs.js                  과제 탭 · 판 셋 · 압축 경계                         (M3.5)
  web/markdown.js              minidiscord 사본 (머리에 출처 핀 · sha256)          (M2.5)
  web/style.css
  test/*.test.js               단위 · 모의 SDK · HTTP(임시 포트) · 화면 순수 함수 · 스크래치 시험 스물두 파일
  test/contract/*.test.js      형제 저장소의 진짜 파일에 붙이는 계약 시험 세 파일
  test/fakes/fake-query.js     모의 SDK (getContextUsage · stopTask · interrupt · close 기록)
  test/fakes/http-world.js     임시 폴더 · 설정 · 저장소 · 모의 SDK · 임시 포트 서버
  smoke/                       진짜 SDK 스모크 여섯 + lib.mjs + scratch.mjs(스크래치 자리) + server.mjs(serve 자식 · admin API · 자동 허용, M3) + README.md
  docs/                        PRD · ARCHITECTURE · ADR · TASKS · VERIFICATION · as-built(이 파일) · log
```

## 2. 명령과 길

### 2.1 명령

| 명령 | 하는 것 | SDK |
|---|---|---|
| `node bin/cockpit.js check [--config]` | 노드 판(≥ 22.13) · 경로 넷(+ claudePath) 검사. 어긋나면 `✗ <키> <까닭>` · exit 1 | 안 싣는다 |
| `node bin/cockpit.js open-project <과제> [--bot-dir] [--bot-name]` | 봇 한 줄 · 방 둘 · 세션 한 줄. 봇 폴더 기본 `<botsDir>/prodev-<과제>-bot`, 봇 이름 기본 `prodev-<과제>-bot` | 안 싣는다 |
| `node bin/cockpit.js chat <과제> "<글>" [--room main\|files] [--as] [--timeout] [--model]` | 세션을 켜고(있으면 resume) 글 하나 → 봇 답 하나. 승인 요청은 전부 거부 (M1 도구, 그대로 둠) | 싣는다 |
| `node bin/cockpit.js init-admin <이름>` | 첫 admin. 비밀번호는 표준입력(터미널이면 안 보이게 두 번 · 파이프면 첫 줄). admin 이 있으면 exit 1 | 안 싣는다 |
| `node bin/cockpit.js add-user <이름> [--role member\|admin]` | 계정 하나 더. 비밀번호는 위와 같이 | 안 싣는다 |
| `node bin/cockpit.js session-token <이름> [--days 7]` | 그 계정의 `md_session` 값 한 줄. 계정이 없으면 exit 1 | 안 싣는다 |
| `node bin/cockpit.js serve [--start <과제>[,…]] [--model <모델>] [--no-origin]` | 서버를 띄운다. 앞 프로세스의 답 없는 승인 요청을 거둬 감으로 닫고 · `stopped` 아닌 세션을 resume · `--start` 과제를 켠다. Ctrl-C 는 세션 상태를 그대로 두고 닫는다. `--no-origin` 은 스모크용(M3 에서 `m2-compact` 가 씀) | 싣는다 |

### 2.2 HTTP 길 (지금 있는 것)

| 길 | 누가 | 모양 |
|---|---|---|
| `GET /api/health` | 누구나 | `{ ok:true }` |
| `POST /api/auth/login` | 누구나 | JSON `{username,password}` → `Set-Cookie: md_session=…; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` · `{ok, user}` · 틀리면 401 |
| `POST /api/auth/logout` · `GET /api/auth/me` | 쿠키 · 로그인 | 쿠키 지움 + 그 쿠키의 SSE 흐름 닫음 · `{id, username, role}` |
| `GET /api/accounts` · `POST /api/accounts` · `POST /api/accounts/:id/password` | admin | 목록 · 만들기(201) · 비밀번호 바꾸기(그 사람의 쿠키 전부 끊음) |
| `GET /api/rooms` | 로그인 | `{active, archived}` — minidiscord 와 같다 |
| `POST /api/rooms/:id/messages` | 로그인 | multipart 만. 404 → 409 → 406 → 400 순. `{ok, message:{id, room_id, author_type, author_user_id, author_bot_id, body, created_at, author_name, attachments:[{id,filename}]}}` |
| `GET /api/rooms/:id/messages?after=N` | 로그인 | `{messages}` id 오름차순 최대 200. 없는 방 · 숫자 아닌 after 는 빈 배열 |
| `GET /api/attachments/:id` | 로그인 | 파일 · `content-disposition: attachment; filename*=UTF-8''…` · 업로드 폴더 밖이면 404 `{message}` |
| `GET /api/stream` | 로그인 | SSE. 사건 `message` · `bot_status` · `session_state` · `session_event` · `partial`(id 없음) · `permission_request` · `permission_resolved` · `project_opened`. `Last-Event-ID` 로 이어 받기 |
| `GET /api/permissions?pending=1` | 로그인 | `{requests:[{tool_use_id, project, tool, agent_id, asked_at, card, input(500자), behavior, answered_by, answered_at}]}`. pending 이 없으면 최근 100 |
| `POST /api/permissions/:toolUseId` | admin | JSON `{decision, reason?}` → 200 · 400(모르는 decision · suppress 인데 allow_session) · 403 member · 404 · 409 이미 답 |
| `GET /api/projects` | 로그인 | `{projects:[{name, bot, rooms:{main,files}, session:{state, session_id, cost_usd, last_result_at, model, context_pct}}]}` · admin 에게만 `bot_dir` · `bot_dir_exists`. `model` · `context_pct` 는 `session_events` 의 마지막 `init` · `context` (M3.1) |
| `POST /api/projects` | admin | JSON `{name, bot_name?, bot_dir?}` → 201 같은 모양 · 409 같은 이름(과제 · 방 · 봇) · 400 이름 규칙 · bot_dir 이 botsDir 밖 |
| `GET /api/projects/:name/events?after=N` | 로그인 | `{events:[{id, at, type, data}]}` 오름차순 최대 500 · 없는 과제 404 (M3.1) |
| `POST /api/projects/:name/session/{start,stop,interrupt,compact,restart}` · `POST /api/projects/:name/tasks/:taskId/stop` | admin | 모양은 ARCHITECTURE 8.3 그대로 (M3.3) |
| `GET /api/projects/:name/files?path=` · `GET /api/projects/:name/file?path=` | 로그인 | `{path, entries}` · 미리보기(글 · csv 50행 · 그림 바이트 · other). 과제 폴더 밖 404 · 쓰기 메서드 405 (M3.4) |
| 그 밖의 `GET /…` | 누구나 | `web/` 정적 서빙 · 실경로 봉인(`../` · 심볼릭 링크 탈출 404) · `content-security-policy: default-src 'self' …` |

공통: 쿠키 `md_session` 하나만 본다(Bearer 401). GET · HEAD 밖의 요청은 `Origin` 머리가 있으면 `Host` 와 같아야 한다(403). JSON 길은 `content-type: application/json` 만(415). 길은 맞는데 메서드가 틀리면 405.

### 2.3 사건(`session_events.type`)이 싣는 칸 — M3.1

| type | data |
|---|---|
| `tool_use` | `id · name · input(200자) · file_path · parent_tool_use_id` |
| `tool_result` | `tool_use_id · is_error · content(200자) · duration_ms(tool_use 부터, 모르면 null) · parent_tool_use_id` |
| `hook` | `subtype(hook_started/hook_response) · hook_event · hook_name · exit_code` |
| `task` | `task_*` 는 `subtype · task_id · tool_use_id · description · status · is_backgrounded · subagent_type · last_tool_name`, `background_tasks_changed` 는 `subtype · tasks:[{task_id, task_type, description, ambient}]` |
| `status` | `system/status` 는 `status · compact_result`, 그 밖의 SDK 메시지(`rate_limit_event` · `auth_status` …)는 `type` + 객체 아닌 작은 칸 |
| `compact` | `compact_metadata` 그대로 |
| `result` | `subtype · num_turns · duration_ms · total_cost_usd · permission_denials(수)` |
| `context` | `percentage · total_tokens · max_tokens · model` — result 뒤마다 `getContextUsage({detail:'summary'})` |
| `init` | 둘: `initializationResult` 의 `account · commands(수) · agents · resumed`, `system/init` 의 `model · permissionMode · mcp_servers` |
| `delivered` · `command` · `resume_failed` · `error` · `system` | 조종석이 적는 것 (배달한 글 번호 · admin 조작 · 되살림 실패 · 세션 오류 · 모르는 system) |

## 3. 시험 묶음 — `npm test` 154건 · 실패 0 · 건너뜀 0 (2026-09-14, 이 맥 · Node 24.12.0, 제작 세션이 돌림 · `COCKPIT_PRODEV_DIR=../prodev-wt-cockpit`)

| 파일 | 건수 | 층 |
|---|---:|---|
| `test/config.test.js` | 5 | A |
| `test/chat-db.test.js` | 12 | A |
| `test/cockpit-db.test.js` | 5 | A |
| `test/envelope.test.js` | 7 | A |
| `test/mcp-tools.test.js` | 10 | A |
| `test/session-manager.test.js` | 17 | B (모의 SDK) — M3.0 에서 둘 · M3.6 발견(값 바닥)에서 하나 더함 |
| `test/sdk-options.test.js` | 4 | A |
| `test/no-sdk-import.test.js` | 1 | A |
| `test/auth.test.js` | 8 | A (+ 임시 포트 HTTP 한 건 · CLI 자식 프로세스) |
| `test/http-rooms.test.js` | 11 | A (임시 포트 HTTP) |
| `test/sse.test.js` | 4 | A (임시 포트 HTTP) |
| `test/permissions.test.js` | 12 | B (모의 SDK 의 canUseTool 자리 + HTTP 답) |
| `test/http-projects.test.js` | 3 | A (임시 포트 HTTP) |
| `test/events.test.js` | 5 | B (모의 SDK) + HTTP — M3.1 |
| `test/http-session.test.js` | 7 | B (모의 SDK + HTTP) — M3.3 |
| `test/http-files.test.js` | 6 | A (임시 포트 HTTP · 심볼릭 링크) — M3.4 |
| `test/web-static.test.js` | 4 | A (정적 검사 — M3 의 새 화면 파일 셋도 이 검사 안에) |
| `test/web-chat.test.js` | 5 | A (화면 순수 함수) |
| `test/web-card.test.js` | 5 | A (화면 순수 함수) |
| `test/web-cockpit.test.js` | 7 | A (화면 순수 함수) — M3.2 |
| `test/web-tabs.test.js` | 3 | A (화면 순수 함수) — M3.5 |
| `test/smoke-scratch.test.js` | 3 | A — 형제 prodev 의 파일로 스크래치를 만든다(없으면 건너뜀) |
| `test/contract/chat-js.test.js` | 3 | C — 형제 `prodev/scripts/chat.js` |
| `test/contract/truncate-ts.test.js` | 2 | C — 형제 `minidiscord/channel/src/truncate.ts` |
| `test/contract/replay-js.test.js` | 5 | C — 형제 `prodev/scripts/replay.js` 를 cockpit 서버(모의 SDK 봇)에 붙인다 |

TASKS M3 절의 끝 조건 시험 이름은 모두 글자 그대로 있다. TASKS 에 없는 시험을 더한 것: `폴더 한 층 목록 — 폴더 먼저 · 점 이름 뺌 · member 도 본다`(http-files) · `restart 는 같은 session_id 로 resume 한다`(http-session) · `세션 조작 단추는 admin 에게만 · 상태마다 켤 것만` · `백그라운드 도우미 목록 — …`(web-cockpit).

**`result 마다 cost_usd 누적` 의 뜻.** TASKS 이름은 M3 설계 때의 "더한다" 였지만 W2r.2 에서 값은 덮어쓰기로 바뀌었다. 시험은 "SDK 가 준 누적값을 행마다 그대로 적고 `agent_sessions.cost_usd` 는 마지막 누적값" 을 본다 — 이름은 TASKS 그대로 두었다.

## 4. 스모크 — 제작 세션이 개발 중 돌린 것 (판정 아님. 판정은 meta 가 사본에서 돌린다)

모델 haiku(`claude-haiku-4-5-20251001`), 스크래치 폴더(세션 임시 폴더 아래), 이 맥(Max 계정), `COCKPIT_PRODEV_DIR=../prodev-wt-cockpit`(prodev PR #18 가지 `cockpit-m3`). 출력 원문은 붙이지 않고 요지만.

| 스크립트 | 요지 |
|---|---|
| `m1-*` · `m2-approval` | M2 · W2r 에서 돌린 그대로 (M3 에서 다시 안 돌림) |
| `m2-compact` (serve + admin API, M3) — 첫 판 | `START_API 200 idle` · `COMPACT_API 200 queued=false` · `COMPACTED yes` · `COMPACT_BOUNDARY pre=25846 trigger=manual`(post 2024) · `SYSTEM_MESSAGES 2` · `HANDOFF 정상` · **`HANDOFF_AT scratch`** · `HOOKS` 에 SessionStart 둘 · `STOP_API 200 stopped` · `ASKED []` · 값 $0.0799 |
| `m2-compact` — 재판 (끝의 기다림 고침 뒤) | `START_API 200 idle` · `COMPACT_API 200 queued=false` · `COMPACTED yes` · `COMPACT_BOUNDARY pre=25718 trigger=manual`(post 2064) · `SYSTEM_MESSAGES 2` · `HANDOFF 정상` · `HANDOFF_AT scratch` · `FIRST_TEXT_AFTER "이 과제의 이름인 스모크(smoke)를 알려드렸습니다."` · `STOP_API 200 stopped` · `ASKED []` · 값 $0.0544 · exit 0 |
| `m3-restart` (M3.6) — 첫 판 (값 바닥 고침 전) | `START_API 200 idle` · `KILLED signal=SIGKILL` · `STATE_AFTER_KILL idle` · `INSERTED 3 4 pending=2` · `RESUMED session_id=c9d0881c-…`(같은 uuid) · `REDELIVERED 2` · `BOT_REPLIES_AFTER_RESTART 2 ["첫째 받음.","둘째 받음."]` · `STOP_API 200 stopped` · `START_API_AGAIN 200 idle same_session=yes` · `CONTEXT_PCT 13` · `ASKED []` · 값 **$0.0102** — 앞 프로세스 $0.0319 를 잃었다 (6절) |
| `m3-restart` — 재판 (값 바닥 · SERVE_BOOT 줄 고침 뒤) | `START_API 200 idle` · `FIRST_REPLY message_id=2` · `KILLED signal=SIGKILL` · `STATE_AFTER_KILL idle` · `INSERTED 3 4 pending=2` · `SERVE_BOOT ["resume smoke → working"]` · **`RESUMED session_id=5c46ebc3-…`(같은 uuid)** · **`REDELIVERED 2`** · **`BOT_REPLIES_AFTER_RESTART 2 ["첫째 받음","둘째 받음"]`** · `STOP_API 200 stopped` · **`START_API_AGAIN 200 idle same_session=yes`** · `CONTEXT_PCT 13 model=claude-haiku-4-5-20251001` · `ASKED []` · 값 $0.0231 = 스크래치 `result` 두 행 $0.0135935 + $0.0095309 · exit 0 |

## 5. 설계와 다르게 된 자리

| 무엇 | 왜 |
|---|---|
| `engines.node` 가 `>=22.13` | M1 — `node:sqlite` 가 플래그 없이 되는 첫 판 (meta N3 승인, PRD 반영) |
| `<channel>` 속성에서 `"` 에 더해 `<` 도 엔티티로 | M1.4 시험이 찾았다 (meta N1 승인, ADR-013 반영) |
| 옵션 만들기가 `options.js` · `tool_use` 사건에 `file_path` 칸 · `fetch_history` 의 since_id 규칙 · `src/runtime.js` | M1 (as-built M1 판 그대로) |
| `src/http/respond.js` 가 생겼다 | 길들이 같이 쓰는 오류 · JSON 응답. server.js 와 길 파일이 서로 import 하지 않게 갈랐다 |
| `web/card.js` · `web/tabs.js` 가 생겼다 (ARCHITECTURE 7절 목록에 없음) | 카드 · 탭의 순수 함수를 DOM 없이 시험한다 |
| SSE 사건 `project_opened` 를 더했다 | 다른 탭 · 다른 사람 화면이 과제 탭을 새로 받게 |
| multipart 아닌 본문의 406 봉투가 `{statusCode, code:'FST_INVALID_MULTIPART_CONTENT_TYPE', error, message}` | minidiscord(Fastify)가 내던 모양 그대로 |
| JSON 길에 JSON 아닌 본문이면 415 | ARCHITECTURE 8절 "application/json 만" 의 상태 코드를 정했다 |
| 거절된 글(400 · 404 …)의 첨부 파일을 지운다 | minidiscord 는 남겼다. cockpit 은 지운다 |
| SSE id 는 허브가 생긴 시각(ms)에서 시작 · 버퍼 1000 · 메모리만 | 서버를 다시 켜면 버퍼가 빈다. 채팅 글은 `?after=` 로, 조종석 판은 events 길로 되그린다 (M3.1 로 닫힘) |
| `serve --start <과제>` · `--model` · (M3) `--no-origin` | 세션 조작 길 전의 켜는 길 · 스모크 · 개발용 |
| 서버를 끌 때 세션을 `stopped` 로 적지 않는다 (`manager.release`) | ARCHITECTURE 5.1 |
| `serve` 가 앞 프로세스의 답 없는 승인 요청을 `cancelled` 로 닫는다 | 그 요청의 SDK 쪽은 프로세스와 함께 사라졌다 |
| `session-token` 은 계정(`accounts`)이 있어야 낸다 · 비밀번호 최소 8자 · 쿠키 7일 · 비밀번호를 바꾸면 쿠키 전부 끊음 · 이름 규칙 | M2 (as-built M2 판 그대로) |
| `GET /api/projects` 가 member 에게 `bot_dir` 을 싣지 않는다 | 서버 경로다 |
| 카드에서 `defaultToNo` 면 거부 단추를 맨 앞에, 초점은 옮기지 않는다 | 입력 중에 초점을 뺏지 않는다 |
| **(W2r.1)** 글은 `idle` · `working` · `waiting_approval` 에서 곧바로 배달, `/compact` 만 `idle` 대기 · 그 압축 턴 동안 글을 붙잡는다 | meta W2 반려 (ADR-008 되돌림 절) |
| **(W2r.2)** `agent_sessions.cost_usd` = 마지막 `result.total_cost_usd` (덮어쓰기) | SDK 값은 누적값 |
| **(M3.6 발견)** 덮어쓰기 위에 **켤 때 적힌 값(바닥)** 을 얹는다: `cost_usd = 켤 때의 cost_usd + 이 프로세스의 result.total_cost_usd`. `result` 사건 행에는 SDK 값 그대로 | SDK 누적값은 CLI 프로세스마다 0 에서 다시 쌓인다. `m3-restart` 스크래치에서 앞 프로세스 $0.0319 가 resume 뒤 $0.0102 로 덮였다. meta 확인 필요 — W2r.2 의 뜻(더하지 않는다)은 한 프로세스 안에서 그대로 |
| **(W2r.3)** 스크래치 봇 폴더를 `<스크래치>/prodev/bots/<봇>` 에 · permissions 는 `settings.local.json` | 봇이 `../../scripts/find.js` 를 찾게 |
| **(N7)** "이번 세션 허용" 은 `destination` 을 전부 `session` 으로 | ADR-009 바뀐 자리 |
| **(M3.0)** `idle` 에서 `assistant` · `stream_event` · `tool_result` 가 오면 `working` 으로 적는다 | 턴 도중 넣은 글을 SDK 가 result 뒤 새 턴으로 이어 돌면 큐가 비어 상태가 안 바뀌었다 (meta W2r 17:54) |
| **(M3.3)** 끄기 확인의 도우미 목록은 `background_tasks_changed` 의 마지막 집합(`ambient` 뺌) | ARCHITECTURE 5.2 는 `backgroundTasks()` 목록이라 적었지만 그 SDK 호출은 목록이 아니라 앞 작업을 뒤로 보내는 호출이다. 5.2 를 고쳤다 |
| **(M3.3)** 확인은 `?confirm=1`, 도우미가 돌면 409 `TASKS_RUNNING` 과 목록 · `restart` 도 같은 확인 | 설계는 "목록을 먼저 보이고 확인 뒤" 까지만 적었다 |
| **(M3.3)** `stop` 은 언제나 200 (error 로 멈춘 세션 · 이미 꺼진 줄도) · `start` 가 못 켜면 502 | 대본 재생이 끄기를 칠 때 상태를 먼저 묻지 않게 |
| **(M3.3)** 멈춤 · 끄기 · 다시 켜기가 그 과제의 걸린 승인 요청을 조종석 쪽에서도 거둬 감으로 닫는다 (`relay.cancelProject`) | SDK 가 signal 로 거두는지를 기다리지 않는다. 먼저 거뒀으면 둘째는 0행이라 줄이 겹치지 않는다 |
| **(M3.1)** `tool_result.duration_ms` 는 조종석이 `tool_use` 를 받은 때부터 잰다 | SDK 메시지에 걸린 시간 칸이 없다 |
| **(M3.4)** 파일 판은 점으로 시작하는 이름을 목록에서 뺀다 · 글 미리보기 앞 256KB · csv 는 앞 1MB 를 읽어 50행 | 설계에 없던 칸 (`.git` 을 안 보이게) |
| **(M3.5)** 압축 끝 system 글을 채팅 판 경계 한 줄로 그린다. "정리 중" 글은 그대로 | 경계를 `compact` 사건이 아니라 방 글에서 그리면 새로고침 · 다른 사람 화면에서도 같은 자리에 선다 |
| **(M3.6)** `m3-restart` 끝에 admin API 로 끄기 · 켜기를 더했다 · `m2-compact` 를 serve + admin API 로 옮겼다 | meta M3 지시 3절 M3.M 준비 |

## 6. 알고 두는 것

- **SDK 의 `total_cost_usd` 는 CLI 프로세스마다의 누적이다.** `m3-restart` 첫 판 스크래치 `session_events`: `result` 19번 $0.0319(num_turns 3) → 재기동 뒤 `result` 36번 $0.0102, `agent_sessions.cost_usd` $0.0102. 켤 때 적힌 값을 바닥으로 얹게 고쳤다(5절). 조종석 값이 청구와 맞는지는 여전히 meta 의 `cost.js` 대조가 가를 자리다 (값은 추정치).
- **headless/SDK 세션은 프로젝트 `.claude/settings.json` 의 `permissions.allow` 를 읽지 않는다** (meta W2). `settings.local.json` 의 규칙은 먹는다.
- **`PRODEV_BOT_DIR` 은 cockpit 이 M1 부터 넣고 있었다.** W2r 에서 `find.log` 가 worktree 의 `bots/` 로 간 것은 prodev `find.js` 가 그 키를 안 보고 `<__dirname>/../bots/<PRODEV_BOT>` 를 썼기 때문이다(스크래치의 `scripts/` 는 링크라 실제 저장소 쪽이 된다). prodev PR #18 이 고친다. 인수인계서는 훅의 `places.js` 가 그 키를 먼저 보아 M2 `m2-compact` 부터 스크래치에 생겼고, M3 `HANDOFF_AT scratch` 로 한 번 더 봤다.
- SDK 가 카드 `title` 을 **null** 로 줬다(haiku · Bash). 카드는 `displayName`("Bash") 을 쓴다.
- 화면은 **브라우저에서 눌러 보지 않았다.** 확인한 것은 순수 함수 시험 · 정적 검사 · `node --check` 까지다. 조종석 판 · 파일 판 · 판 셋 전환은 M3 에서 새로 이은 몸통(`app.js`)이라, 사람이 한 번 눌러 보기 전에는 모른다.
- 문맥 사용률 `percentage` 는 0~100 눈금으로 온다 (`m3-restart` `CONTEXT_PCT 13` — haiku 첫 턴들).
- `background_tasks_changed` 는 CLI 프로세스마다의 값이라 켤 때마다 빈 집합에서 시작한다. 조종석 화면도 `init` 사건(resumed 칸이 있는 것)에서 비운다.
- SSE 흐름은 연 뒤에 쿠키가 만료돼도 스스로 닫지 않는다. 로그아웃은 닫는다.
- 로그인 시도 횟수 제한이 없다.
- `Request.formData()` 는 본문을 메모리에 모은다. 요청 하나 상한 200MB · 파일 하나 100MB.
- 파일 판 csv 는 UTF-8 로만 읽는다 (회사 PC 의 cp949 csv 는 글자가 깨져 보일 수 있다 — 미리보기뿐이고 원본은 안 건드린다).
- `m2-compact` 에서 PreCompact 훅은 `hook` 사건으로 보이지 않았다(SessionStart 둘만). 인수인계서 파일은 생겼다.
- 계정 만들기는 두 파일에 걸친다 · 글 넣기(chat.db → 큐)의 비원자성은 M1 그대로다 (ADR-003 결과).
- `node:sqlite` 의 `ExperimentalWarning` · SDK 의 `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` 경고는 M1 그대로다.
- 스크래치 자리(`/private/tmp/…`)에서 첨부 `Read` 가 콜백으로 오는 것(M1 N2)은 고치지 않았다 — meta W1.3 몫.
