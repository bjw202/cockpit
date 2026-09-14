# 지금 코드가 어떻게 생겼나 (as-built)

설계는 `ARCHITECTURE.md` 다. **여기는 실제로 만들어진 것**을 적는다. 둘이 다르면 5절에 그 자리가 있다.
마일스톤이 끝날 때마다 갱신한다 (`TASKS.md` 0절). 마지막 갱신 2026-09-14, M2(웹 · 계정 · 채팅 판 · 승인 카드) 끝 — M2.M(= W2) 관문 전.

---

## 1. 폴더 나무

```
cockpit/
  README.md · package.json · package-lock.json · .gitignore · cockpit.example.json
  bin/cockpit.js               check · open-project · chat · init-admin · add-user · session-token · serve
  src/config.js                설정 읽기 · 경로 검사
  src/runtime.js               저장소 둘 + 승인 중계 + 세션 관리자 조립 · 봇 답 기다리기
  src/db/chat-db.js            minidiscord 표 여섯 · 글 넣기(봉투 → targets) · 이력 · 첨부
  src/db/cockpit-db.js         조종석 표 여섯 · 계정 · 쿠키 해시 · 큐 · 승인 첫 답
  src/envelope/mention.js      봉투 파서 (minidiscord mention.ts 사본)
  src/envelope/truncate.js     절단 상한 다섯 (minidiscord truncate.ts 사본)
  src/envelope/wrap.js         <channel> 씌우기 · 지시문 · 사용자 메시지(origin)
  src/mcp/tools.js             reply · fetch_history 처리기와 서명 정의
  src/session/input-stream.js  스트리밍 입력 흐름
  src/session/env.js           env 화이트리스트
  src/session/options.js       query() 옵션
  src/session/sdk-query.js     SDK 를 import 하는 유일한 파일
  src/session/manager.js       세션 관리자 (release: 상태를 둔 채 닫기)
  src/auth/password.js         scrypt 해시 · 대조                                  (M2.1)
  src/auth/sessions.js         이름 규칙 · 계정 만들기 · 로그인 · 쿠키 · session-token (M2.1)
  src/http/server.js           node:http · 길 표 · 인증 수준 · Origin · 정적 서빙 · /api/health · /api/stream (M2.2 · M2.3)
  src/http/respond.js          HttpError · JSON 응답 · JSON 본문 읽기              (M2.2)
  src/http/routes-auth.js      로그인 · 로그아웃 · 나 · 계정(admin)                (M2.2)
  src/http/routes-rooms.js     GET /api/rooms                                     (M2.2)
  src/http/routes-messages.js  글 길 둘 · 첨부 받기                                (M2.2)
  src/http/multipart.js        Request.formData() 로 multipart                    (M2.2)
  src/http/sse.js              SSE 허브 · 세션 관리자 · 중계 사건 잇기             (M2.3)
  src/permissions/relay.js     승인 중계                                          (M2.4)
  src/http/routes-permissions.js  승인 목록 · 답                                   (M2.4)
  src/http/routes-projects.js  과제 목록 · 열기 · 이름 규칙                        (M2.7)
  web/index.html · app.js      화면 한 장 · 몸통(로그인 · 탭 · 방 · 글 · 첨부 · SSE · 카드) (M2.5 · M2.6)
  web/chat.js · card.js        채팅 판 · 승인 카드의 순수 함수와 DOM 조각          (M2.5 · M2.6)
  web/markdown.js              minidiscord 사본 (머리에 출처 핀 · sha256)          (M2.5)
  web/style.css
  test/*.test.js               단위 · 모의 SDK · HTTP(임시 포트) · 화면 순수 함수 시험 열여섯 파일
  test/contract/*.test.js      형제 저장소의 진짜 파일에 붙이는 계약 시험 세 파일
  test/fakes/fake-query.js     모의 SDK
  test/fakes/http-world.js     임시 폴더 · 설정 · 저장소 · 모의 SDK · 임시 포트 서버
  smoke/                       진짜 SDK 스모크 다섯 + lib.mjs + README.md
  docs/                        PRD · ARCHITECTURE · ADR · TASKS · VERIFICATION · as-built(이 파일) · log
```

M3 이후의 것(조종석 판 `web/cockpit.js` · 파일 판 · 세션 조작 길 · `GET /api/projects/:name/events`)은 아직 없다.

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
| `node bin/cockpit.js serve [--start <과제>[,…]] [--model <모델>]` | 서버를 띄운다. 앞 프로세스의 답 없는 승인 요청을 거둬 감으로 닫고 · `stopped` 아닌 세션을 resume · `--start` 과제를 켠다. Ctrl-C 는 세션 상태를 그대로 두고 닫는다 | 싣는다 |

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
| `GET /api/projects` | 로그인 | `{projects:[{name, bot, rooms:{main,files}, session:{state, session_id, cost_usd, last_result_at, model:null, context_pct:null}}]}` · admin 에게만 `bot_dir` · `bot_dir_exists` |
| `POST /api/projects` | admin | JSON `{name, bot_name?, bot_dir?}` → 201 같은 모양 · 409 같은 이름(과제 · 방 · 봇) · 400 이름 규칙 · bot_dir 이 botsDir 밖 |
| 그 밖의 `GET /…` | 누구나 | `web/` 정적 서빙 · 실경로 봉인(`../` · 심볼릭 링크 탈출 404) · `content-security-policy: default-src 'self' …` |

공통: 쿠키 `md_session` 하나만 본다(Bearer 401). GET · HEAD 밖의 요청은 `Origin` 머리가 있으면 `Host` 와 같아야 한다(403). JSON 길은 `content-type: application/json` 만(415).

## 3. 시험 묶음 — `npm test` 118건 · 실패 0 · 건너뜀 0 (2026-09-14, 이 맥 · Node 24.12.0, 제작 세션이 돌림)

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
| `test/auth.test.js` | 8 | A (+ 임시 포트 HTTP 한 건 · CLI 자식 프로세스) |
| `test/http-rooms.test.js` | 11 | A (임시 포트 HTTP) |
| `test/sse.test.js` | 4 | A (임시 포트 HTTP) |
| `test/permissions.test.js` | 11 | B (모의 SDK 의 canUseTool 자리 + HTTP 답) |
| `test/http-projects.test.js` | 3 | A (임시 포트 HTTP) |
| `test/web-static.test.js` | 4 | A (정적 검사) |
| `test/web-chat.test.js` | 5 | A (화면 순수 함수) |
| `test/web-card.test.js` | 5 | A (화면 순수 함수) |
| `test/contract/chat-js.test.js` | 3 | C — 형제 `prodev/scripts/chat.js` |
| `test/contract/truncate-ts.test.js` | 2 | C — 형제 `minidiscord/channel/src/truncate.ts` |
| `test/contract/replay-js.test.js` | 5 | C — 형제 `prodev/scripts/replay.js` 를 cockpit 서버(모의 SDK 봇)에 붙인다 |

TASKS 에 적은 시험 이름은 모두 이 이름 그대로 있다 (TASKS M2 절의 끝 조건 이름을 `npm test` 통과 줄과 스크립트로 맞댔다). TASKS 에 없는 시험 넷을 더했다: `다른 출처의 POST 는 403 · 없는 길은 404 · health 는 로그인 없이`(http-rooms) · `markdown.js 사본은 머리의 출처 핀 · sha256 이 본문과 맞다`(web-static) · `글 보기 — 첨부 받기 주소 · 내 글 · 시각`(web-chat) · `session-token 은 계정이 있어야 낸다 — 한 줄 · 쿠키로 풀린다`(auth).

**replay 계약 시험의 뜻.** meta M2 지시 4절 1항("prodev `test/server/replay.test.js` 의 가짜 서버 시험이 cockpit 서버에 대해서도 초록")을 이렇게 옮겼다: 가짜 서버 자리에 cockpit 서버를 세우고, 봇은 모의 SDK 가 큐에서 받은 `<channel>` 덩이를 보고 cockpit 의 `reply` 처리기를 부른다. 토큰은 `bin/cockpit.js session-token` 이 낸다. 옮긴 시나리오는 서버 계약이 걸린 넷(걸음 셋 · else · 첨부 이름 · 방 없음/토큰 틀림 exit 1) + TASKS 의 `걸음 셋짜리 대본: exit 0 · 기록 JSONL 에 bot.message_id 가 셋`. 대본 검사 · sleep · manual 은 replay.js 혼자의 일이라 뺐다.

## 4. 스모크 — 제작 세션이 개발 중 돌린 것 (판정 아님. M2.M 판정은 meta 가 사본에서 돌린다)

모델 haiku(`claude-haiku-4-5-20251001`), 스크래치 폴더, 이 맥(Max 계정). 출력 원문은 붙이지 않고 요지만.

| 스크립트 | 요지 |
|---|---|
| `m1-hello` · `m1-envelope` | M1 에서 돌린 그대로 (M2 에서 다시 안 돌림) |
| `m1-guard` (1000자 직접 판) | `GIVEN_BODY_CHARS 1000` · `REPLY_CALLS 2` · `REPLY_ATTEMPT_CHARS [947,31]` · `ATTEMPTED_OVER_900 yes` · `HOOK_BLOCKED yes` · `ROOM_MESSAGES_FROM_BOT 1` · `LONG_BOT_MESSAGES 0` · 값 $0.063 |
| `m2-approval` | 판 1 거부 `ANSWER deny 200` → 봇 "거부됨" · 판 2 `ANSWER allow 200` → curl 첫 줄 · 판 3 `ANSWER allow_session 200` · 판 4 `REASKED_AFTER_SESSION_ALLOW 0` · `BASH_RAN_AFTER_SESSION_ALLOW yes` · `LOCK_MESSAGES 3` · `ANSWER_MESSAGES 2 1` · 카드 `title=null displayName="Bash" description="Check curl version" suggestions=[{addRules … destination:"localSettings"}]` · 값 $0.185 |
| `m2-compact` | `COMPACTED yes` · `COMPACT_BOUNDARY pre=24657 trigger=manual`(post_tokens 1776) · `SYSTEM_MESSAGES 2` · `HANDOFF 정상` · `FIRST_TEXT_AFTER "현재 방의 이름이 prodev-smoke임을 확인해 드렸습니다."` · `HOOKS` 에 SessionStart 둘(켜짐 · 압축 뒤) · 값 $0.073 |
| `serve` (진짜 CLI, 세션 없이) | 스크래치 설정으로 `check` → `open-project worktogether --bot-name prodev-worktogether-비서` → `init-admin` · `add-user` · `session-token` → `serve` 에 curl: health · rooms · multipart POST(첨부 · 봉투) · list · 첨부 받기 머리 · JSON 406 · 정적 파일 여섯 200 · `/../package.json` 404 · 로그인 → Ctrl-C exit 0 · `agent_sessions.state` 그대로 |

## 5. 설계와 다르게 된 자리

| 무엇 | 왜 |
|---|---|
| `engines.node` 가 `>=22.13` | M1 — `node:sqlite` 가 플래그 없이 되는 첫 판 (meta N3 승인, PRD 반영) |
| `<channel>` 속성에서 `"` 에 더해 `<` 도 엔티티로 | M1.4 시험이 찾았다 (meta N1 승인, ADR-013 반영) |
| 옵션 만들기가 `options.js` · `tool_use` 사건에 `file_path` 칸 · `fetch_history` 의 since_id 규칙 · `src/runtime.js` | M1 (as-built M1 판 그대로) |
| `src/http/respond.js` 가 생겼다 | 길들이 같이 쓰는 오류 · JSON 응답. server.js 와 길 파일이 서로 import 하지 않게 갈랐다 |
| `web/card.js` 가 생겼다 (ARCHITECTURE 7절 목록에 없음) | 카드 순수 함수를 `web-card.test.js` 가 DOM 없이 본다. M3 의 `cockpit.js` 가 같은 조각을 쓴다 |
| SSE 사건 `project_opened` 를 더했다 | 다른 탭 · 다른 사람 화면이 과제 탭을 새로 받게 |
| multipart 아닌 본문의 406 봉투가 `{statusCode, code:'FST_INVALID_MULTIPART_CONTENT_TYPE', error, message}` | minidiscord(Fastify)가 내던 모양 그대로. replay.js 는 상태 코드만 보지만 모양도 맞췄다 |
| JSON 길에 JSON 아닌 본문이면 415 | ARCHITECTURE 8절 "application/json 만" 의 상태 코드를 정했다 |
| 거절된 글(400 · 404 …)의 첨부 파일을 지운다 | minidiscord 는 남겼다(plan.md §D 6번이 수용한 위험). cockpit 은 지운다 |
| SSE id 는 허브가 생긴 시각(ms)에서 시작 · 버퍼 1000 · 메모리만 | 서버를 다시 켜면 버퍼가 비어 그 사이 사건은 다시 못 준다. 채팅 글은 `?after=` 로, 조종석 판은 M3 events 길로 되그린다 |
| `serve --start <과제>` · `--model` | 세션 조작 길(M3.3) 전에 세션을 켜는 길이 없어서 — W2 재생 때 meta 가 쓴다. `--model` 은 스모크 · 개발용 |
| 서버를 끌 때 세션을 `stopped` 로 적지 않는다 (`manager.release` · `rt.close({keepState})`) | ARCHITECTURE 5.1 "서버가 꺼질 때는 적힌 값을 그대로 두고" — M1 의 `close()` 는 `stop()` 이라 다음 기동이 resume 을 못 했다 |
| `serve` 가 앞 프로세스의 답 없는 승인 요청을 `cancelled` 로 닫는다 (본방 ⛔ 줄 한 줄씩) | 그 요청의 SDK 쪽은 프로세스와 함께 사라졌다. 카드가 영영 걸려 있지 않게 |
| `session-token` 은 계정(`accounts`)이 있어야 낸다 | 쿠키로 들어온 사람의 역할(admin/member)을 accounts 에서 푼다. 재생 계정도 `init-admin` · `add-user` 로 먼저 만든다 |
| 비밀번호 최소 8자 · 이름 규칙은 minidiscord `auth.ts` 그대로(32자 · 제어문자 · 앞뒤 공백) | 설계에 길이가 없었다 |
| 비밀번호를 바꾸면 그 사람의 쿠키 세션을 모두 지운다 | 설계에 없던 칸 |
| 쿠키에 `Max-Age=604800`(7일), `tls` 면 `Secure` | 설계는 속성 셋만 적었다 |
| 과제 이름에 `/` · `\` · 괄호 · 공백 · 제어문자 금지, 봇 이름에 괄호 · 공백 · 제어문자 금지 | 과제 이름은 방 이름 갈래(첫 `/`)에, 봇 이름은 봉투 정규식 `[^()\s]+` 에 실린다 |
| `GET /api/projects` 가 member 에게 `bot_dir` 을 싣지 않는다 | 서버 경로다 |
| 커밋 순서가 M2.7 → M2.5 → M2.6 | 화면이 과제 목록 · 봇 이름을 `GET /api/projects` 에서 받는다 |
| 카드에서 `defaultToNo` 면 **거부 단추를 맨 앞에** 둔다 — 카드가 뜰 때 초점을 옮기지는 않는다 | 사람이 입력칸에 쓰는 중에 카드가 초점을 뺏으면 Enter 가 엉뚱한 곳에 간다. 카드에 들어온 첫 Tab · Enter 가 거부가 되게 했다 |
| M1 의 CLI `chat` 은 승인 요청을 전부 거부하는 채로 둔다 | 명령줄 도구다. 서버(`serve`) 의 기본 처리기가 중계다 |

## 6. 알고 두는 것

- **"이번 세션 허용" 이 봇 폴더에 영구 규칙을 쓴다.** `m2-approval` 판 3 에서 SDK 가 준 `suggestions` 의 `destination` 이 `localSettings` 였고, 그대로 `updatedPermissions` 로 돌려주자 스크래치 봇 폴더에 `.claude/settings.local.json` 이 생겼다: `{"permissions":{"allow":["Bash(curl --version)"]}}`. 이름은 "이번 세션" 인데 세션이 끝나도 남는다. meta N7 답 (나)에 따라 돌려줄 때 `destination` 을 전부 `session` 으로 바꿔 넣는다 (M2.M 뒤 커밋 · ADR-009 바뀐 자리 · 시험 `allow_session 의 updatedPermissions 는 전부 destination=session`). W2 판정 사본(f22af98)에는 들어 있지 않다.
- SDK 가 카드 `title` 을 **null** 로 줬다(haiku · Bash). 카드는 `displayName`("Bash") 을 쓴다.
- 화면은 **브라우저에서 눌러 보지 않았다.** 확인한 것은 순수 함수 시험 · 정적 검사 · 진짜 서버가 파일 여섯을 200 과 CSP 로 내는 것 · 모듈 문법 검사(`node --check`)까지다.
- SSE 흐름은 연 뒤에 쿠키가 만료돼도 스스로 닫지 않는다. 로그아웃은 닫는다.
- 로그인 시도 횟수 제한이 없다. 사내망 · 계정 수 몇이라 첫 판은 두지 않았다.
- `Request.formData()` 는 본문을 메모리에 모은다. 요청 하나 상한 200MB · 파일 하나 100MB.
- 세션을 켜는 길은 지금 `serve` 의 resume · `--start` 와 CLI `chat` 뿐이다. 화면의 세션 조작 단추는 M3.3.
- `m2-compact` 에서 PreCompact 훅은 `hook` 사건으로 보이지 않았다(SessionStart 둘만). 인수인계서 파일은 생겼다 — 실증 3 걸림 3 과 같은 결(PreToolUse 도 `hook_started` 를 안 낸다).
- 계정 만들기는 두 파일에 걸친다. SQL 트랜잭션 하나로 못 묶어 chat.db 트랜잭션을 연 채 accounts 를 넣고 실패하면 둘 다 되돌린다. 글 넣기(chat.db → 큐)의 비원자성은 M1 그대로다 (ADR-003 결과).
- `node:sqlite` 의 `ExperimentalWarning` · SDK 의 `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` 경고는 M1 그대로다.
- 스크래치 자리(`/private/tmp/…`)에서 첨부 `Read` 가 콜백으로 오는 것(M1 N2)은 고치지 않았다 — meta W1.3 몫.
