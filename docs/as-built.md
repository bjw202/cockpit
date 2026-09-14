# 지금 코드가 어떻게 생겼나 (as-built)

설계는 `ARCHITECTURE.md` 다. **여기는 실제로 만들어진 것**을 적는다. 둘이 다르면 5절에 그 자리가 있다.
마일스톤이 끝날 때마다 갱신한다 (`TASKS.md` 0절). 마지막 갱신 2026-09-15, **M5 끝(M5.0~M5.11, v2 회차 — minidiscord 화면 · 방 하나 · 방 만들기 = 봇 생성 · 접이식 판)**. 절 여섯: 폴더 나무 · 표 둘 · API · 시험 묶음과 건수 · 설계와 다르게 된 자리 · 알고 두는 것 (TASKS M4.4). 4.3 대체된 시험 이름 짝 · 4.4 minidiscord 기준 짝은 M5 에서 더했다 (meta M5 지시 3절 ③).

---

## 1. 폴더 나무

```
cockpit/
  README.md · package.json · package-lock.json · .gitignore · cockpit.example.json (v2: prodevDir)
  bin/cockpit.js               check · open-project(v2: 방 만들기 처리기 · --no-setup) · chat · init-admin · add-user · session-token · serve · migrate-v2(v2)
  src/config.js                설정 읽기 · 경로 검사 · (v2) prodevDir 짐작 · botsDir 짝
  src/runtime.js               저장소 둘 + 승인 중계 + 세션 관리자 조립 · 봇 답 기다리기
  src/db/chat-db.js            minidiscord 표 여섯 · 방 하나(v2) · 봉투 → targets · 이력 · 첨부 · archiveRoom · removeOpened
  src/db/cockpit-db.js         조종석 표 여섯 · 계정 · 쿠키 해시 · 큐 · 승인 첫 답 · 사건
  src/envelope/mention.js      봉투 파서 (minidiscord mention.ts 사본)
  src/envelope/truncate.js     절단 상한 다섯 (minidiscord truncate.ts 사본)
  src/envelope/wrap.js         <channel> 씌우기 · 지시문 · 사용자 메시지(origin)
  src/mcp/tools.js             reply · fetch_history(v2: attachments 칸 · 옛 방 읽기만)
  src/rooms/create.js          (v2) 방 만들기 = 봇 생성 · 이름 규칙 · 중복 · 잠금 · 되돌림 · setupEnv (M5.3)
  src/rooms/setup-runner.js    (v2) prodev setup.js 자식 프로세스 · 60초 · 마지막 20줄 (M5.3)
  src/rooms/migrate.js         (v2) 옛 files 방 찾기 · 보이기 · 보관 · 기동 경고 (M5.0)
  src/session/input-stream.js · env.js · options.js · sdk-query.js(SDK 를 import 하는 유일한 파일)
  src/session/manager.js       세션 관리자 — 큐 · 상태 · 사건 접기 · 끄기 · 다시 켜기 · 도우미 멈춤
  src/auth/password.js · sessions.js
  src/http/server.js · respond.js · multipart.js · sse.js
  src/http/routes-auth.js · routes-messages.js · routes-permissions.js · routes-session.js · routes-files.js
  src/http/routes-rooms.js     GET /api/rooms · (v2) POST /api/rooms · POST /api/rooms/:id/archive
  src/http/routes-projects.js  GET /api/projects(rooms:{main, legacy_files}) · POST /api/projects(같은 처리기) · events
  src/permissions/relay.js
  web/index.html · app.js · rich.js · style.css · design-tokens.css   (v2) minidiscord 6633f7b 사본 — 머리에 출처 핀 (M5.5~M5.7)
  web/boot.js                  (v2) 켜기 두 줄 — 인라인 스크립트가 CSP 에 막혀서
  web/glue.js                  (v2) 잇는 순수 함수 — 방 봇 칩 · 방 거르기 · 봇 상태 · 미리 채움 · 안내 글자 · 판 기본값 · 걸린 수
  web/panel.js                 (v2) 접이식 조종석 판 — 카드 · 조종석 · 파일 (DOM 몸통)
  web/card.js · cockpit.js · files.js   v1 에서 남는 순수 함수와 DOM 조각 (판이 쓴다)
  web/markdown.js              minidiscord 사본 (저장소 핀 dfa33c3 — 6633f7b 안에서도 같은 sha256)
  (v1 web/chat.js · web/tabs.js 는 M5.8 에서 지웠다)
  test/*.test.js               스물다섯 파일 · test/contract/*.test.js 네 파일 (4.1)
  test/fakes/fake-query.js · http-world.js(v2: runSetup · configFile) · platform.js · fake-setup.js(v2)
  test/fixtures/minidiscord-web.json   (v2) 원본 다섯 파일 sha256 · 줄 수 · 마지막 커밋 · app.js 최상위 함수 지문
  smoke/                       스모크 여덟(m1 셋 · m2 둘 · m3-restart · m4-sessions · m5-room) + lib.mjs + scratch.mjs(v2: makeRoomScratch) + server.mjs + README.md
  docs/                        PRD · ARCHITECTURE · ADR · TASKS · VERIFICATION · INSTALL-WINDOWS · as-built(이 파일) · log
```

## 2. 표 둘

저장소는 SQLite 파일 둘이다(`<dataDir>/chat.db` · `<dataDir>/cockpit.db`, `node:sqlite`, WAL). 쓰는 것은 서버뿐이고, 봇은 `chat.db` 만 `chat.js` 로 읽기 전용으로 연다. **v2 에서 표 · 열은 한 칸도 안 바뀌었다.**

### 2.1 `chat.db` — minidiscord 표 여섯, 열 그대로 (`src/db/chat-db.js` · 시험 `표 여섯의 열이 minidiscord db.ts(6633f7b) 와 같다`)

| 표 | 열 | cockpit 이 채우는 법 |
|---|---|---|
| `users` | `id · username · created_at` | 계정을 만들 때 한 줄 (`accounts` 와 한 트랜잭션). 이름은 charter 의 `PL:` 과 글자 그대로 |
| `rooms` | `id · name · status · created_at · archived_at` | **(v2) 방을 만들 때 하나: `prodev-<과제>`.** 보관은 `status='archived'`. 옛 `prodev-<과제>/files` 는 `migrate-v2 --apply` 가 보관한다 |
| `bots` | `id · name · description · token · role · created_at` | 방마다 한 줄. token 은 봇마다 다른 uuid(쓰이지 않음) · role `orchestrator` |
| `messages` | `id · room_id · author_type · author_user_id · author_bot_id · body · created_at` | 사람 글 · 봇 `reply` · system 글(🔒 ✅ ⛔ · 압축 두 줄) |
| `attachments` | `id · message_id · filename · stored_path · size · mime` | `stored_path` = `dirname(chat.db)/..` 기준 상대 경로 |
| `message_targets` | `message_id · bot_id · delivery` | 봉투 파싱 결과. **(v2) 봉투 없는 글은 행 없음** |

`sessions` · `room_bots` 는 만들지 않는다.

### 2.2 `cockpit.db` — 조종석 표 여섯 (`src/db/cockpit-db.js`)

| 표 | 열 | 쓰는 곳 |
|---|---|---|
| `accounts` | `user_id · role(admin/member) · pw_hash(scrypt$N$r$p$소금$해시) · created_at` | 계정 |
| `web_sessions` | `token_hash(쿠키의 SHA-256) · user_id · created_at · expires_at` | 쿠키 — 원문은 없다 |
| `agent_sessions` | `project · bot_id · bot_dir · session_id · state · started_at · last_result_at · cost_usd` | 세션 관리자 · 재기동. `cost_usd` = 켤 때 값(바닥) + 이 프로세스의 마지막 `total_cost_usd`. (v2) 방을 보관해도 줄은 남고 state 가 `stopped` |
| `session_events` | `id · project · at · type · json` | 조종석 판 되그리기 (3.3 의 type 표) |
| `permission_requests` | `tool_use_id · agent_id · project · tool · input_json · card_json · asked_at · answered_by · behavior · answered_at` | 승인 중계 · 첫 답만 |
| `bot_inbox` | `id · message_id · bot_id · delivery · queued_at · delivered_at` | 큐. (v2) 봉투 없는 글은 행 없음 |

## 3. API — 명령과 길

### 3.1 명령

| 명령 | 하는 것 | SDK |
|---|---|---|
| `node bin/cockpit.js check [--config]` | 노드 판 · 경로 넷(+ claudePath) 검사 · `claudePath --version`. (v2) `prodevDir` 를 적었으면 `✓ prodevDir <경로> — setup.js 있음` 또는 `✗`, botsDir 의 부모로 짐작했으면 `· prodevDir <경로> (botsDir 의 부모) — setup.js 있음|없음 — 방 만들기가 502` (실패로 안 센다) | 안 싣는다 |
| `node bin/cockpit.js open-project <과제> [--no-setup] [--bot-dir] [--bot-name]` | **(v2) `POST /api/rooms` 와 같은 처리기.** 기본은 prodev `setup.js` 를 불러 봇 폴더까지, `--no-setup` 은 건너뛴다(스모크 스크래치 · 옛 봇 이름 재생). 출력 `과제 <과제> · 봇 <이름> (id N) · 방 prodev-<과제> (id N) · 봇 폴더 <경로>[ (setup 건너뜀)]`. 실패는 `✗ <까닭>` + setup 마지막 줄들 · exit 1 | 안 싣는다 |
| `node bin/cockpit.js migrate-v2 [--apply]` | (v2) 과제마다 `prodev-<과제>/files  id=N  글 N  첨부 N  큐 미배달 N  → 보관|이미 보관`. 보이기만 하면 끝 줄 `보이기만 했다 — 적용하려면 --apply`, `--apply` 면 끝 줄 `보관 <N>` | 안 싣는다 |
| `node bin/cockpit.js chat <과제> "<글>" [--as] [--timeout] [--model]` | 세션을 켜고 글 하나 → 봇 답 하나. (v2) `--room` 없음 — 봇에게 가려면 글에 `@TO(<봇>)` | 싣는다 |
| `node bin/cockpit.js init-admin <이름>` · `add-user <이름> [--role]` · `session-token <이름> [--days]` | M2 그대로 | 안 싣는다 |
| `node bin/cockpit.js serve [--start] [--model] [--no-origin]` | M3 그대로 + (v2) 활성 옛 files 방이 있으면 듣기 시작한 뒤 `! 옛 files 방 <N> 개 — migrate-v2 --apply 를 돌린다` 한 줄 · 서버 ctx 에 설정 파일 경로(방 만들기가 setup 에 넘긴다) | 싣는다 |

### 3.2 HTTP 길 (지금 있는 것)

| 길 | 누가 | 모양 |
|---|---|---|
| `GET /api/health` | 누구나 | `{ ok:true }` |
| `POST /api/auth/login` · `logout` · `GET /api/auth/me` | 누구나 · 쿠키 · 로그인 | M2 그대로 (`me` 는 `{id, username, role}`) |
| `GET/POST /api/accounts` · `POST /api/accounts/:id/password` | admin | M2 그대로 |
| `GET /api/rooms` | 로그인 | `{active, archived}` — minidiscord 와 같다 |
| **`POST /api/rooms`** | admin | (v2) JSON `{name: <과제>}`(앞뒤 공백 뺌) → 201 `{id, name, status, created_at, archived_at, project, bot:{id,name}}` · 400 이름 규칙(`prodev-` 로 시작 포함) · 403 member · 409 과제 · 방 · 봇 · 봇 폴더 · 만드는 중 · 502 `{error:'setup 실패: <첫 줄>', setup_tail[, left]}` · 500 `{error:'저장 실패: <첫 줄>'[, left]}` · SSE `room_created {project, room, bot}` |
| **`POST /api/rooms/:id/archive`** | admin | (v2) 본방이면 도우미 확인(409 `TASKS_RUNNING` → `?confirm=1`) · 걸린 승인 거둬 감 · 세션 끄기 → `archived` · 200 `{ok, id, status:'archived'}` · 404 · 409 이미 보관 · SSE `room_archived {project, room}` |
| `POST /api/rooms/:id/messages` · `GET …?after=` · `GET /api/attachments/:id` | 로그인 | M2 그대로 |
| `GET /api/stream` | 로그인 | SSE. 사건 `message` · `bot_status` · `session_state` · `session_event` · `partial`(id 없음) · `permission_request` · `permission_resolved` · (v2) `room_created`(옛 `project_opened`) · `room_archived` |
| `GET /api/permissions?pending=1` · `POST /api/permissions/:id` | 로그인 · admin | M2 그대로 |
| `GET /api/projects` | 로그인 | `{projects:[{name, bot, rooms:{main, legacy_files}, session:{…}}]}` — (v2) `legacy_files` 는 옛 방 또는 `null` |
| `POST /api/projects` | admin | (v2) `POST /api/rooms` 와 같은 처리기 · 응답은 과제 모양(201) · `bot_dir` 검사(절대 · botsDir 안) 400 은 그대로 |
| `GET /api/projects/:name/events` · 세션 조작 여섯 · 파일 판 둘 | 로그인 · admin | M3 그대로 |
| `/api/bots` · `/api/bots/:id` · `/api/rooms/:id/bots` | — | (v2) 없다 — 404 (시험이 본다) |
| 그 밖의 `GET /…` | 누구나 | `web/` 정적 서빙 · 실경로 봉인 · CSP `script-src 'self'` · `img-src 'self' blob: data:` |

### 3.3 사건(`session_events.type`)이 싣는 칸

M3.1 판 그대로 (v2 에서 안 바뀜): `tool_use` · `tool_result` · `hook` · `task` · `status` · `compact` · `result` · `context` · `init` · `delivered` · `command` · `resume_failed` · `error` · `system`. (v2) 봉투 없는 글은 `delivered` 사건을 안 만든다.

### 3.4 (v2) 화면 — 옮긴 파일과 고친 자리

| 파일 | 원본(6633f7b) | cockpit | 핀 줄 |
|---|---|---|---|
| `design-tokens.css` | 59줄 · 토큰 34 · 마지막 커밋 edd982e 2026-08-26 | 머리 한 줄만 더함 | `/* 출처 핀: … */` 1줄 |
| `rich.js` | 214줄 · eca2c3d 2026-09-07 | 머리 한 줄만 더함 | `// 출처 핀: …` 1줄 |
| `style.css` | 965줄 · a44ecf8 2026-09-11 | 머리 한 줄 + 원본 965줄 + 끝에 cockpit 판 덩이 | 1줄 |
| `index.html` | 117줄 · e31dfba 2026-09-11 | `<!DOCTYPE html>` 뒤에 핀 두 줄 · 7.3 자리(제목 · boot.js · 비밀번호 · 봇 칸 · 봇 다이얼로그 · 판 단추 · `<aside>`) | 2줄 |
| `app.js` | 1231줄 · a44ecf8 2026-09-11 | 핀 두 줄 · 원본과 달라진 최상위 함수: 바뀜 여덟(`initApp · login · logout · onComposerInput · openRoom · refreshRoomBots · renderRooms · sendMessage`) · 지움 열하나(`createBot · deleteBot · hideInviteError · initInvite · inviteNodes · loadBots · openStream · pickParticipant · renderBots · showInviteError · showRegistration`) · 더함 둘(`loadProjects · openAppStream`) — ARCHITECTURE 7.3 표와 글자 그대로 (시험이 센다) | 2줄 |

만드는 법: 스크래치 `port-web.mjs <cockpit> m57` 이 `git -C ../minidiscord show 6633f7b:web/<파일>` 로 원본을 읽어 매번 새로 만든다. 저장소에 스크립트는 없다 — 결과와 원본 지문(`test/fixtures/minidiscord-web.json`)만 있다. 핀을 올릴 때는 같은 방식으로 다시 뜨고 지문을 바꾼다.

## 4. 시험 묶음과 건수

### 4.1 `npm test` — 215건 · 실패 0 · 건너뜀 0 (2026-09-15 M6, 이 맥 · Node 24.12.0 · 형제 `../prodev` = 1e02367, 제작 세션이 직접 돌렸다)

M5 판은 206건(`COCKPIT_PRODEV_DIR=../prodev-wt-cockpit-v2` 로도 206 · 0 · 0). M6 에서 아홉을 더했다: N17 정적 시험 하나(web-static) · N16 재검증 하나(http-rooms) · `toolSummary` 일곱(web-glue).

| 파일 | 건수 | 층 |
|---|---:|---|
| `test/auth.test.js` | 8 | A (+ 임시 포트 HTTP · CLI 자식) |
| `test/chat-db.test.js` | 13 | A — (v2) 방 하나 · 봉투 없음 · legacy_files |
| `test/check.test.js` | 2 | A (CLI 자식) |
| `test/cockpit-db.test.js` | 5 | A |
| `test/config.test.js` | 7 | A — (v2) prodevDir 둘 |
| `test/envelope.test.js` | 7 | A |
| `test/events.test.js` | 5 | B + HTTP |
| `test/http-files.test.js` | 6 | A |
| `test/http-projects.test.js` | 3 | A — (v2) 방 하나 · 가짜 setup |
| `test/http-rooms.test.js` | 12 | A — (M6) N16 재검증 |
| `test/http-session.test.js` | 7 | B |
| `test/mcp-tools.test.js` | 16 | A — (v2) 첨부 칸 여섯 |
| `test/migrate.test.js` | 4 | A (+ CLI 자식 · serve 자식) — (v2) M5.0 |
| `test/no-sdk-import.test.js` | 1 | A |
| `test/permissions.test.js` | 12 | B |
| `test/rooms-archive.test.js` | 6 | B — (v2) M5.4 |
| `test/rooms-create.test.js` | 11 | A (가짜 setup · 임시 포트 · CLI 자식) — (v2) M5.3 |
| `test/sdk-options.test.js` | 5 | A |
| `test/session-manager.test.js` | 19 | B — (v2) 봉투 없는 글 둘 |
| `test/smoke-scratch.test.js` | 5 | A — (v2) makeRoomScratch 하나 |
| `test/sse.test.js` | 4 | A |
| `test/web-card.test.js` | 5 | A (판이 쓰는 순수 함수) |
| `test/web-cockpit.test.js` | 7 | A (판이 쓰는 순수 함수) |
| `test/web-glue.test.js` | 17 | A — (v2) M5.6 여덟 · M5.7 둘 · (M6) toolSummary 일곱 |
| `test/web-static.test.js` | 15 | A (정적 검사 · 원본 지문) — (v2) M5.5 · M5.6 · M5.7 · (M6) N17 |
| `test/contract/chat-js.test.js` | 4 | C — (v2) 봉투 없는 글 targets |
| `test/contract/replay-js.test.js` | 5 | C — (v2) 방 하나 판 |
| `test/contract/setup-js.test.js` | 2 | C — (v2) prodev 복사본에서 진짜 setup.js |
| `test/contract/truncate-ts.test.js` | 2 | C |

TASKS M5 끝 조건의 시험 이름은 모두 글자 그대로 있다. TASKS 에 없는 것을 더한 것: 없음 (M5 는 끝 조건 이름대로 썼다).

**윈도우에서 건너뛸 수 있는 시험 (M4.1)** — 조건은 M4 판 그대로다: `과제 폴더 밖을 가리키는 심볼릭 링크 404`(통째) · win32 의 `check — claudePath 를 불러 판을 낸다`(통째) · `reply files: …` · `정적 파일 경로 탈출(../) 404` · `폴더 한 층 목록 — …`(링크 칸만) · `smoke-scratch` · `test/contract/*` (형제가 없으면 통째 — v2 의 `setup-js` 도 같다). **(v2) 새 시험의 윈도우 조건**: `rooms-create` 의 CLI 자식은 셸 없이 `process.execPath` 로 부른다 · `migrate` 의 serve 자식을 `SIGKILL` 로 끄는데 윈도우에서 신호 이름은 무시되고 프로세스가 끝난다 · `makeRoomScratch` 는 `fs.cpSync(dereference)` 라 링크를 만들지 않는다. 윈도우 실측은 없다.

### 4.2 스모크 — 제작 세션이 개발 중 돌린 것 (판정 아님)

**M6 판** (2026-09-15, 이 맥 · haiku · 스크래치 · `COCKPIT_PRODEV_DIR` = prodev `origin/main` a64e1f3(PR #19 머지 뒤)를 스크래치에 `git archive` 로 푼 자리 — 본 체크아웃 `../prodev` 는 아직 1e02367):

| 스크립트 | 요지 |
|---|---|
| `m5-room` | `ROOM_CREATE_API 201 room=prodev-smoke bot=prodev-smoke-bot setup_ms=65` · `ROOMS_FOR_PROJECT 1` · `BOT_DIR_SETTINGS_LOCAL yes` · `START_API 200 idle` · **`PLAIN_MESSAGES 2 TARGET_ROWS 0 INBOX_ROWS 0`** · **`BOT_TURNS_AFTER_PLAIN 0`** · `DELIVERED_AFTER_PLAIN 0` · **`FETCH_HISTORY_CALLED yes`** · **`FETCH_HISTORY_HAS_ATTACHMENTS yes`** · **`READ_ATTACHMENT yes`** · `BOT_REPLY message_id=4 "파일 첫 줄은 \"lot,yield\" 입니다. …"` · `ARCHIVE_API 200 state=stopped` · $0.0414 · `ASKED []` · exit 0 |
| `m3-restart` | `START_API 200 idle` · `KILLED signal=SIGKILL` · `INSERTED 3 4 pending=2` · `SERVE_BOOT ["resume smoke → working"]` · `RESUMED session_id=<같은 uuid>` · `REDELIVERED 2` · `BOT_REPLIES_AFTER_RESTART 2 ["첫째 받음","둘째 받음"]` · `STOP_API 200 stopped` · `START_API_AGAIN 200 idle same_session=yes` · `CONTEXT_PCT 14` · $0.0402 · `ASKED []` · exit 0 |

값 합 약 $0.08. 돌리기 전 · 뒤 실제 `prodev/bots` 목록이 같다(`diff` 로 직접 대조). N16 확인: 임시 `serve` 에 `curl -I /app.js` → `200` · `etag: W/"ed42-1a0a06b0c93"` · `last-modified` · `cache-control: no-cache`, 같은 etag 로 `If-None-Match` → `304`.

**M5 판** (2026-09-15, 이 맥 · haiku · 스크래치 · 기본 `../prodev` = 1e02367 — PR #19 전 하네스):

| 스크립트 | 요지 |
|---|---|
| `m5-room` | `ROOM_CREATE_API 201 room=prodev-smoke bot=prodev-smoke-bot setup_ms=68` · `ROOMS_FOR_PROJECT 1` · `BOT_DIR_SETTINGS_LOCAL yes` · `START_API 200 idle` · **`PLAIN_MESSAGES 2 TARGET_ROWS 0 INBOX_ROWS 0`** · **`BOT_TURNS_AFTER_PLAIN 0`** · `DELIVERED_AFTER_PLAIN 0` · **`FETCH_HISTORY_CALLED yes`** · **`FETCH_HISTORY_HAS_ATTACHMENTS yes`** · **`READ_ATTACHMENT yes`** · `BOT_REPLY message_id=4 "파일의 첫 줄은 다음과 같습니다: **lot,yield** …"` · `ARCHIVE_API 200 state=stopped` · $0.0402 · `ASKED []` · exit 0 |
| `m5-room --fail-setup` | `ROOM_CREATE_API 502 room=none bot=none setup_ms=39` · `SETUP_ERROR "setup 실패: 오류: 스모크 --fail-setup 대역 — 일부러 exit 1"` · `SETUP_TAIL [2줄]` · **`ROLLBACK_BOT_DIR_EXISTS no`** · **`ROLLBACK_PROJECT_DIR_EXISTS no`** · **`ROLLBACK_ROWS 0`** · `ASKED []` |
| `m1-hello` | `STATE_AFTER_START idle` · `SYSTEM_PROMPT preset+append` · `ORIGIN channel` · `BOT_REPLY message_id=2 room=prodev-smoke` · `PRE_REPLY_MARKER yes` · `ASKED []` · $0.0337 · exit 0 |
| `m1-envelope` (방 하나 판) | `SESSION_START_HOOK yes` · `PRE_REPLY_MARKER yes` · `ROOM_ID 1` · `REPLY_CHAT_ID 1` · `REPLY_TEXT "샤워헤드 교체일은 9월 3일이다"` · `REPLIED_TO_CC no` · `READ_ATTACHMENT yes` · $0.0204 · exit 0 |
| `m2-compact` | `START_API 200 idle` · `COMPACT_API 200 queued=false` · `COMPACTED yes` · `COMPACT_BOUNDARY pre=25750 trigger=manual`(post 2045) · `SYSTEM_MESSAGES 2` · `HANDOFF 정상` · `HANDOFF_AT scratch` · `STOP_API 200 stopped` · $0.0671 · exit 0 |
| `m3-restart` | `START_API 200 idle` · `KILLED signal=SIGKILL` · `INSERTED 3 4 pending=2` · `RESUMED session_id=<같은 uuid>` · `REDELIVERED 2` · `BOT_REPLIES_AFTER_RESTART 2 ["첫째 받음","둘째 받음"]` · `STOP_API 200 stopped` · `START_API_AGAIN 200 idle same_session=yes` · `CONTEXT_PCT 13` · $0.0399 · exit 0 |

값 합 약 $0.20. 돌리기 전 · 뒤 실제 `prodev/bots` 목록이 같다(직접 대조).

M1~M4 판의 요지는 git 이력의 이 파일 M4 판에 있다 (`git show 59f3523:docs/as-built.md` 4.2). `m2-approval` · `m1-guard` · `m4-sessions` 는 M5 에서 다시 안 돌렸다 — 봉투를 이미 적은 스크립트다.

### 4.3 (v2) 대체된 시험 이름 짝

| 옛 이름 (파일) | 새 이름 (파일) | 까닭 |
|---|---|---|
| `본방 봉투 없는 글은 to 한 줄` (chat-db) | `봉투 없는 글은 행 없음(어느 방이든)` (chat-db) | ADR-018 |
| `파일방 봉투 없는 글은 행 없음` (chat-db) | 위와 같음 | ADR-015 — 파일방이 없다 |
| `봇 한 줄 · 방 둘(prodev-<과제> · prodev-<과제>/files) · agent_sessions 한 줄` (http-projects) | `봇 한 줄 · 방 하나(prodev-<과제>) · agent_sessions 한 줄` (http-projects) | ADR-015 |
| `걸음 셋짜리 대본: exit 0 · 기록 JSONL 에 bot.message_id 가 셋` (contract/replay-js) | `걸음 셋짜리 대본(방 하나): exit 0 · 기록 JSONL 에 bot.message_id 가 셋` | 대본 걸음이 전부 본방 · `@TO` |
| `첨부가 이름 그대로 올라간다` (contract/replay-js) | `첨부가 이름 그대로 올라간다(본방)` | 같음 |
| `innerHTML 대입이 markdown.js 밖에 없다` (web-static) | `innerHTML 대입은 markdown.js 밖에서 빈 문자열뿐` (web-static) | minidiscord app.js 가 목록을 `innerHTML = ''` 로 비운다 |
| `본방 입력칸 기본값은 @TO(<그 과제 봇의 실제 이름>) ` (web-chat, 지움) | `composerDefault 는 @TO(<봇 이름>) ` · `보관 방은 미리 채우지 않는다` (web-glue) | ADR-018 미리 채움은 glue.js |
| `[카드] 첫 줄 강조` (web-chat, 지움) | 없음 | ADR-016 결과 — minidiscord 화면에 없는 v1 장식은 채팅에서 뺐다 |
| `system 🔒 글 모양` (web-chat, 지움) | `rich.js 는 cockpit 🔒 요청 줄에 승인 단추를 그리지 않는다` (web-glue) | 🔒 줄은 minidiscord renderMessage 가 system 글로 그린다(원본 그대로) |
| `상태 칩 넷(생각 중 · 도구 실행 중 · 승인 대기 · 꺼짐)` (web-chat, 지움) | `botMark: thinking · tool · approval → working, idle · stopped · error → idle` · `online 은 idle · working · waiting_approval · starting 이면 참` (web-glue) | minidiscord 봇 칩(🟢/⚪ · 입력 중…)으로 바뀌었다 |
| `글 보기 — 첨부 받기 주소 · 내 글 · 시각` (web-chat, 지움) | `messageForRoom: 다른 방 글은 null` (web-glue) + `rich.js 는 머리 줄을 빼면 원본 sha256 과 같다` (web-static) | 첨부 장식 · 시각 표기는 minidiscord rich.js · renderMessage 원본 |
| `과제마다 탭 하나` (web-tabs, 지움) | `roomBotsOf: 방의 봇 하나를 [{bot_id, bot_name, online}] 로` (web-glue) | 과제 탭 → 방 목록 사이드바(renderRooms 원본 + 보관 조건 한 줄) |
| `compact_boundary 는 채팅 판에 경계 한 줄` (web-tabs, 지움) | 없음 — 압축 system 글 두 줄은 방에 그대로 (`compact_boundary → 본방 system 글 둘`, session-manager) | 경계 줄 장식은 채팅에서 뺐다 (ADR-016 결과) |
| `session_state 사건으로 칩이 바뀐다` (web-tabs, 지움) | `online 은 idle · working · waiting_approval · starting 이면 참` (web-glue) | 칩 재료가 과제 목록의 세션 상태 |

이름은 그대로이고 내용이 바뀐 것: `targets 칸이 <봇 이름>:to`(contract/chat-js — `@TO` 글로) · `@TO 는 to · @CC 는 cc`(chat-db — 본방에서) · 봇 배달을 기대하던 옛 시험 글 스무 곳 남짓(`session-manager` · `events` · `http-session` 의 `say` · `permissions` 준비)에 `@TO(<봇>)` 를 붙였다.

### 4.4 (v2) 고친 자리 ↔ minidiscord 기준 ↔ cockpit 시험 (meta M5 지시 3절 ③)

minidiscord 화면은 jsdom 시험(형제 SPEC 의 수용 기준)으로 덮여 있었다. cockpit 은 jsdom 을 안 들인다(PRD N4). 그래서 **고친 자리**는 아래 시험이 재고, **안 고친 자리**는 원본과의 동일성(파일 sha256 · 최상위 함수 지문)이 옛 기준을 대신한다 — 원본과 글자가 같으면 원본 시험이 본 행동도 같다.

| 고친 자리 (ARCHITECTURE 7.3) | 닿는 minidiscord 기준 (6633f7b) | cockpit 에서 재는 시험 |
|---|---|---|
| `index.html` 켜기 스크립트 → `boot.js` | (기준 목록 밖 — SPEC-WEBSHELL 의 부트스트랩) | `인라인 script 가 없다(CSP script-src self)` · `모든 <script> 가 type=module` |
| 로그인 비밀번호 칸 · `login(username, password)` · `initApp` 로그인 뒤 `loadMe` | AC-WEBUI-012 계정 바와 살아 있는 로그아웃 · AC-WEBUI-013 `GET /api/auth/me` 는 세션을 되비춘다 · AC-WEBUI-014 이름이 새로고침을 넘긴다 | `로그인 폼에 type=password 칸 하나` · auth `쿠키는 HttpOnly · SameSite=Lax · Path=/` · `session-token 이 낸 값으로 GET /api/rooms 200` · `app.js 에서 원본과 본문이 달라진 최상위 함수는 ARCHITECTURE 7.3 표의 것뿐`(`renderAccountBar` · `loadMe` 원본 그대로) |
| 사이드바 봇 칸 · 봇 참여 단추 · 봇 다이얼로그 · `loadBots · renderBots · createBot · deleteBot` · 리치 초대 여섯 지움 | AC-WEBUI-005 사이드바의 나머지(보관된 방 · 현재 방 · 조용해진 생성 버튼) — 봇 등록 버튼 부분은 R13 으로 뺐다 | `web/ 어느 파일에도 /api/bots 가 없다` · rooms-archive `/api/bots · /api/rooms/:id/bots 는 404` · 함수 비교(지운 열하나) |
| `initApp` 새 방 단추 admin 만 · `renderRooms` 보관 아이콘 admin 만 | AC-WEBUI-001 방 행 세 조각과 이름 분해 · AC-WEBUI-002 꼬리는 줄지 않는다 · AC-WEBUI-003 행 높이 · AC-WEBUI-004 보관 컨트롤은 키보드로 닿는다 — 방 행 조립(`roomNameSpans` · `splitRoomName`)은 원본 그대로, 보관 아이콘은 member 화면에 안 붙는다(5절) | 함수 비교(`renderRooms` 는 조건 한 줄 · `roomNameSpans` · `splitRoomName` 원본 그대로) · rooms-create `member 는 403` · rooms-archive `member 403` |
| `refreshRoomBots` — 칩 · 자동완성 재료를 과제 목록에서 | AC-WEBACNAV-001~008 (배지 · 선택 · 감김 · Escape · IME · 멘션 불가 행 · 마우스 · CSS 토큰) — 소비하는 `onComposerKeyDown` · `acItems` · `applySelection` · `commitSelected` · `moveSelection` · `commitMention` · `renderRoomBots` 는 원본 그대로 | `roomBotsOf: 방의 봇 하나를 [{bot_id, bot_name, online}] 로` · `online 은 idle · working · waiting_approval · starting 이면 참` · 함수 비교 |
| `openRoom` 1 · 9단계 · `openStream` → `openAppStream` | (기준 목록 밖 — SPEC-WEBCHAT 의 스트림) · AC-WEBUI-006 메시지 세 직계 자식 · AC-WEBUI-007 아바타 색 · AC-WEBUI-008 봇 배지 · AC-WEBUI-009 이어짐 행 — `renderMessage` · `sameTurn` · `avatarColorClass` · `displayTime` 원본 그대로 | `messageForRoom: 다른 방 글은 null` · `botMark: …` · sse `사건마다 id` 등 넷 · 함수 비교 |
| `sendMessage` · `onComposerInput` — 미리 채움 · 안내 글자 | AC-WEBUI-010 작성기는 한 덩어리 · AC-WEBUI-011 보낼 것이 없을 때의 보내기 버튼(미리 채운 뒤 `refreshSendState` 를 부른다) | `composerDefault 는 @TO(<봇 이름>) ` · `composerHint: 봉투가 없으면 …` · `보관 방은 미리 채우지 않는다` · 함수 비교(`refreshSendState` 원본 그대로) |
| `#panel-toggle` · `#cockpit-panel` · `style.css` 끝 판 덩이 | AC-WEBACNAV-008 "CSS 는 토큰만 쓴다" 와 같은 규칙 · AC-WEBUI-015 금지 목록은 기준선으로 잰다 · AC-WEBUI-016 계약문이 코드에 되쓰였다 | `index.html 에 #cockpit-panel 하나 · #panel-toggle 하나` · `style.css 의 cockpit 덩이는 색을 var(--md-…) 로만 쓴다(# 색 · rgb( · hsl( 없음)` · `panelOpenByDefault: …` · `pendingBadge: …` |
| **안 고친 파일** `design-tokens.css` · `rich.js` · `markdown.js` · `style.css` 원본 구간 · `app.js` 의 안 고친 함수 전부 | AC-WEBMD-001~016 (마크다운 렌더 · URL 스킴 · 폴백 · 입력 상한 · CSS 계약 · 모듈 표면 · 회귀) · AC-WEBMD2-001~008 (본문 `@TO`/`@CC` 배지) · AC-WEBATT-001~013 (붙여넣기 · 캡쳐 이름 · 끌어놓기 · 썸네일 · 객체 URL 수명 · 비회귀) · 토큰 34 | **sha256 동일성**: `design-tokens.css 는 머리 줄을 빼면 원본 sha256 과 같고 --md- 토큰이 34` · `rich.js 는 머리 줄을 빼면 원본 sha256 과 같다` · `style.css 의 원본 구간(머리 줄 뒤 965줄)은 원본 sha256 과 같다` · `markdown.js 사본은 머리의 출처 핀 · sha256 이 본문과 맞다` · **함수 지문**: `app.js 에서 원본과 본문이 달라진 최상위 함수는 ARCHITECTURE 7.3 표의 것뿐` — `onComposerPaste` · `onComposerDrop` · `renderPickedFiles` · `thumbUrl` · `revokeThumbUrl` · `installDocumentDropGuard` 등 WEBATT 가 재던 함수가 원본 지문 그대로임을 센다 |

## 5. 설계와 다르게 된 자리

M1~M4 판의 줄은 그대로 유효하다(`git show 59f3523:docs/as-built.md` 5절 — engines ≥ 22.13 · `<` 엔티티 · options.js · respond.js · card.js/tabs.js · project_opened · 406 봉투 · 415 · 거절 첨부 지움 · SSE id · serve --start · manager.release · cancelStale · session-token 규칙 · member bot_dir · defaultToNo 단추 · W2r.1~3 · N7 · M3.0 · M3.1 · M3.3 · M3.4 · M3.5 · M3.6 · M4.1~M4.3). 아래는 M5 에서 더해진 것이다.

| 무엇 | 왜 |
|---|---|
| **(M5.0)** `prodevDir` 를 안 적으면 `botsDir` 의 부모로 짐작하고(`prodevDirDerived`), 짝 검사(`botsDir` = `<prodevDir>/bots`)는 **적었을 때만** 한다 · `check` 는 짐작한 자리면 `·` 한 줄로 알리고 실패로 안 센다 | M4 판 설정 · 시험 설정에는 `prodevDir` 가 없다. 짐작한 자리까지 짝을 요구하면 옛 설정이 기동을 못 한다 |
| **(M5.0)** serve 의 옛 files 방 경고는 듣기 시작한 **뒤**에 낸다 · `migrate-v2` 는 이미 보관된 방도 `→ 이미 보관` 줄로 보인다 | 경고가 기동을 늦추지 않게 · 두 번 돌렸을 때 무엇이 남았는지 보이게 |
| **(M5.2)** `attachments` 의 잘림 원소는 `{ filename: '⟪잘림: N개 생략⟫', path: '' }` | 설계는 "한 원소" 까지만 적었다 — 칸 이름을 유지해 봇이 같은 꼴로 읽게 |
| **(M5.3)** 이름 규칙(`projectNameProblem` · `botNameProblem` · `defaultBotDir`)을 `src/rooms/create.js` 로 옮기고 `routes-projects.js` 가 다시 내보낸다 | 방 만들기 처리기가 HTTP · CLI 둘에서 불린다 — 길 파일과 서로 import 하지 않게 |
| **(M5.3)** `POST /api/rooms` 는 `name` 의 앞뒤 공백을 뺀다 · 같은 이름 동시 요청은 `chat.db` 연결마다 잠금 하나(409 `과제를 만드는 중입니다`) · 되돌림에서 못 지운 경로는 응답 `left` 와 서버 로그 한 줄 | 설계 4.6 의 "잠금 하나" 를 구체화 |
| **(M5.3)** setup 성공의 판정은 exit 0 **그리고** `<봇 폴더>/.claude/settings.local.json` 이 있다 · 502 의 첫 줄은 setup 출력의 `오류:` 줄, 없으면 마지막 줄 | setup 이 0 으로 끝나도 폴더가 엉뚱한 자리에 생기면 세션이 못 뜬다 |
| **(M5.3)** setup 자식 env 는 봇 세션 화이트리스트 + `extraEnvKeys` 에서 `PRODEV_BOT_DIR` 을 뺀 것(`setupEnv`) · 서버 쪽 원천은 세션 관리자의 `processEnv` | ARCHITECTURE 5.5 끝 줄 |
| **(M5.3)** `chatDb.removeOpened` 는 방에 글이 있으면 지우지 않고 던진다 | 되돌림이 사람 글을 지우는 일이 없게 — 새로 만든 방에는 글이 없다 |
| **(M5.3)** CLI `open-project` 의 기본이 setup 이다 — 옛 걸음(`open-project <과제> --bot-dir`)은 이제 `--no-setup` 을 붙인다 | ADR-017 — 방 만들기 처리기 하나 |
| **(M5.4)** 보관은 그 방이 과제의 **본방**일 때만 세션을 끈다 · 보관 뒤 `agent_sessions` 줄 · 봇 폴더 · 과제 폴더는 그대로 | 활성으로 남은 옛 files 방을 보관할 때 세션을 건드리지 않게 · 되살리기는 첫 판에 없다 |
| **(M5.5)** **7.3 표의 일부(로그인 비밀번호 · 봇 칸 · 봇 다이얼로그 · `loadProjects`)가 M5.5 커밋에 먼저 들어갔다** · SSE · 칩 · 미리 채움은 M5.6 | M5.5 끝 조건(`/api/bots` 0 · 비밀번호 칸)이 그것을 요구했다 |
| **(M5.5)** 화면 사본을 저장소 밖 생성 스크립트(`port-web.mjs`)로 만든다 · 원본 지문은 `test/fixtures/minidiscord-web.json` · `index.html` 핀 줄은 `<!DOCTYPE html>` **뒤** · `app.js` · `index.html` 은 핀 두 줄(둘째 줄 "7.3 표의 자리를 고쳤다") | 원본에서 매번 새로 떠 "고친 자리만 다르다" 를 지킨다 · DOCTYPE 앞 주석을 피한다 · ARCHITECTURE 12 끝 둘째 줄 |
| **(M5.6)** `app.js` 새 최상위 함수는 `loadProjects` · `openAppStream` 둘뿐 — 미리 채움 · 역할 단추 · 판 켜기는 이미 바뀌는 `openRoom` · `sendMessage` · `initApp` 안에 | 7.3 표 밖의 함수를 늘리지 않는다 |
| **(M5.6)** `openAppStream` 이 먼저 `initChat()` 을 부른다 · 재연결 백필은 그때 연 방의 커서 · `bot_status` 는 지금 연 방의 과제일 때만 칩에 | 뒤에 부르는 `initChat` 이 `state.sse` 를 null 로 덮지 않게 · 흐름이 하나라 방 번호를 흐름에 묶어 둘 수 없다 |
| **(M5.7)** 판은 minidiscord `api()` 대신 자기 `call()`(상태 코드 · 본문) · 판의 승인 카드는 **지금 연 방의 과제 것만**(방을 안 열었으면 전체), 접힌 단추의 수는 전체 · 파일 목록은 파일 접이가 열릴 때만 받는다 | 409 `TASKS_RUNNING` 확인 · 방 화면에 딴 과제 카드가 섞이지 않게 · 판을 펼 때 요청을 줄인다 |
| **(M5.9)** `m5-room` 은 prodev 를 **복사한** 자리(`makeRoomScratch`)에서 돈다 · `FETCH_HISTORY_HAS_ATTACHMENTS` 는 봇이 준 입력 그대로 처리기를 다시 돌려 본 값 · `m1-envelope` 의 `FILES_ROOM_ID` → `ROOM_ID` | 링크 자리에서 setup.js 를 부르면 실제 prodev/bots 에 봇 폴더가 생긴다 · 사건의 결과 요약이 200자에서 잘린다 |
| **(M5.10, prodev)** 확정 조건 ② 를 바꾸자 fixture E-0006 이 **④ 에서** 막히게 됐다 — 사례 이름을 사실대로 고치고 조건 ② 시험 둘(fixture DB 사본)을 더했다 · 끝 조건 grep 을 맞추려고 `CLAUDE.md` 이력 줄을 "방을 둘로 줄임 (ADR-039 로 하나가 됨)" 으로 | PR #19 본문에 적었다 |
| **(M6 N16)** 정적 파일은 `cache-control: no-cache` 에 `etag`(`W/"<크기 16진>-<mtime ms 16진>"`) · `last-modified` 를 싣고, `If-None-Match` 가 같으면 `304` · 파일 이름에 판 번호는 안 붙였다 | 옮긴 파일 다섯의 원본 지문(`app.js` import · `index.html` 경로)을 건드리지 않는다. `no-cache` 는 M2.2 부터 있었지만 재검증 기준이 없었다 — v1 → v2 에서 옛 `app.js` 가 쓰인 정확한 경로는 브라우저로 재현하지 않았다(6절) |
| **(M6 N17)** 옛 격자 `auto auto 1fr` → `minmax(0, 1fr) auto` + 격자 자식 `min-width:0` · 요약은 `details.tool-more` 가 `grid-column: 1 / -1` 로 제 줄을 차지하고 그 `summary.tool-input` 이 `nowrap` · `ellipsis`, 누르면 `pre.tool-raw`(서버 입력 요약 200자, `pre-wrap`) · `title` 에 전문 | **원인**: `grid-column` 이 안 먹은 것이 아니라 옛 `.tool-input` 에 `grid-column` 이 없었다. 띄어쓸 자리가 없는 긴 이름(`mcp__cockpit__fetch_history`)이 `auto` 칸을 max-content 로 먹고, `1fr` 칸의 요약(`overflow-wrap:anywhere` 라 min-content 가 한 글자)이 몇 글자 폭까지 눌렸다 — 짧은 이름(`Bash`) 줄은 멀쩡했다. 헤드리스 Chrome 280px 판에 옛 CSS(d41b0da) · 새 CSS 로 같은 줄 셋을 그려 확인했다 |
| **(M6 N17)** `glue.toolSummary(name, input, project?)` 의 셋째 인자 · Bash 경로는 **끝 세 마디**(폴더 둘 · 파일) · `chat_id` 가 없으면 `마지막 방` · `Task` 는 `Agent` 와 같게 · 잘린 JSON(200자 + `…`)은 앞부분에서 칸을 찾는다 | 지시의 "과제 폴더 기준 상대 경로" 에 과제 이름이 있어야 한다 · 지시는 "마지막 두 마디" 라 적고 예는 `design/v2/ARCHITECTURE.md`(세 마디) — 예를 따랐다 · 서버 `summarize` 가 입력을 200자에서 자른다 |

## 6. 알고 두는 것

- **화면은 사람이 이 맥에서 한 번 눌러 봤다** (M5.M Q3, `~/cockpit-try-v2`: 로그인 · 방 만들기 · 켜기 · 봇 부르기 · 도구 호출 표시) — 관문 칸이 아니라 기록이다. 거기서 나온 결함 둘이 N16 · N17 이다. 자동완성 · 붙여넣기 · 사람끼리 글 · 따라잡기는 INSTALL-WINDOWS 12번에서 사람이 본다. **M6 의 N17 새 줄(details · 줄임표)은 헤드리스 Chrome 정적 그림으로만 봤고 cockpit 서버에 붙은 화면에서는 안 눌렀다.**
- **N16 은 재현하지 않았다.** v1 도 `no-cache` 를 보냈는데 옛 `app.js` 가 쓰였다 — `etag` 재검증으로 막히리라 보지만, 사람이 판을 한 번 더 올려 강력 새로고침 없이 되는지 봐야 확정이다.
- **member 화면에는 보관 아이콘이 없다.** minidiscord AC-WEBUI-004(보관 컨트롤은 키보드로 닿는다)는 admin 화면에서만 성립한다.
- **`m5-room` 은 PR #19 전 하네스로 돌렸다.** 봇이 `fetch_history` 로 따라잡은 것은 cockpit 지시문("부르면 fetch_history 로 놓친 대화를 먼저 확인") 덕일 수 있다 — orchestrator 의 새 "따라잡는 길" 절은 아직 안 실렸다. PR 뒤 판은 meta 의 R8 이 잰다.
- **방 만들기의 setup 은 이 맥에서 68ms**(`git init` 포함, 대역 판 39ms). 회사 PC · 윈도우의 60초 상한은 모른다.
- **되돌림은 요청 전에 있던 과제 폴더 안에 새로 생긴 `house.md` · `.gitignore` 를 가려내지 않는다** (ARCHITECTURE 4.6).
- **활성 옛 files 방이 있어도 serve 는 뜬다** — 경고 한 줄뿐. `migrate-v2 --apply` 를 사람이 돌린다.
- **화면 사본의 원본 지문은 핀과 함께 움직인다.** minidiscord 핀을 올리면 `port-web.mjs` 로 다시 뜨고 `test/fixtures/minidiscord-web.json` 을 바꿔야 정적 시험이 초록이다 — 스크립트는 스크래치에 있어 저장소에 없다 (다시 만들 규칙은 3.4).
- M1~M4 의 알고 두는 것은 그대로다: 윈도우 실측 없음 · 봇 env 에 프록시 키 없음(extraEnvKeys) · `total_cost_usd` 는 프로세스마다 · headless 세션은 `settings.json` 의 `permissions.allow` 를 안 읽음 · 카드 `title` 이 null 일 때 `displayName` · 문맥 사용률 0~100 · SSE 흐름은 쿠키 만료로 안 닫힘 · 로그인 시도 제한 없음 · multipart 는 메모리에 모음 · csv 미리보기 UTF-8 만 · PreCompact 훅이 hook 사건으로 안 보임 · 두 파일에 걸친 트랜잭션 · `node:sqlite` 실험 경고 · 스크래치 첨부 `Read` 콜백(M1 N2).
