# cockpit — 만드는 순서 (TASKS)

이 문서는 "다음에 무엇을 하나" 의 유일한 자리다. 마일스톤 넷(M1~M4), 태스크마다 산출물과 **끝 조건**. 끝 조건은 기계가 셀 수 있는 것만 적는다 — 시험 파일 이름 · 시험 이름 · 파일 존재 · 명령 출력.

meta 의 관문과의 짝: **M1 · M2 = W2(서버 뼈대)**, **M3 = W3(조종석 판)**, M4 는 W4(실전) 앞의 설치 · 문서다 (`../../meta/prodev-review/plans/2026-09-14-web-cockpit/TASKS.md`). W1(회사 PC 실증)은 meta 와 사람이 한다.

## 0. 자리 규칙

| 자리 | 하는 것 | 하지 않는 것 |
|---|---|---|
| **meta** (`../meta/`) | 예측 · 채점표를 먼저 적는다 · 관문을 직접 돌려 센다 · 옛 대본 다섯을 재생한다 · prodev PR(W2.9)을 따로 지시한다 | cockpit 을 고치지 않는다 |
| **cockpit** (이 저장소, 제작 세션) | 코드 · 시험 · 스모크 스크립트 · 문서. **마일스톤 끝마다 `docs/as-built.md` 와 `docs/log.md` 를 갱신하고 관문을 청한다** | 예측 · 채점표 · 정답지를 읽지 않는다 (`meta/prodev-review/` 의 `PREDICTIONS.md` · `fixtures/` · `scripts/scoring*` · `runs/`) · 자기 검수표를 채우지 않는다 · `prodev/` · `minidiscord/` 본 체크아웃을 고치지 않는다 |
| **사람** | 회사 계정 · 저장소 이름 · HTTPS 결정 · 회사 PC 에서 돌리기 | |

**순서의 원칙.** 가장 모르는 것부터: 세션 관리자와 봉투(M1)가 먼저, 화면(M2 · M3)은 그 위에. 단위 시험이 되는 것을 먼저 굳힌다.

**공통 끝 조건 (마일스톤마다).** `npm test` 의 요약 줄이 `# fail 0` · `# cancelled 0`. 계약 시험의 건너뜀(`# skipped`)은 통과로 세지 않는다 — meta 는 형제 저장소가 있는 작업판에서 돌린다.

---

## M1 — 뼈대: 저장소 둘 + 세션 관리자 + MCP + 최소 CLI 로 봇과 말 한 번

화면 없이, 명령줄에서 봇 세션 하나와 글이 한 번 오간다.

### M1.1 저장소 뼈대
- 산출: `package.json`(`"type":"module"` · `engines.node ">=22"` · 의존성 `@anthropic-ai/claude-agent-sdk` `^0.3.270` · `zod` · scripts `test: node --test test/` · `smoke`) · `.gitignore`(`node_modules/ · *.db* · data/`) · `cockpit.example.json` · `src/config.js` · `bin/cockpit.js check`
- 끝 조건: `test/config.test.js` 에 시험 넷 — `경로에 공백이 있으면 키 이름과 함께 거절한다` · `상대 경로를 거절한다` · `윈도우에서 claudePath 가 없으면 거절한다`(`process.platform` 주입) · `maxSessions 기본값은 3`. `node bin/cockpit.js check --config cockpit.example.json` 이 없는 경로마다 `✗ <키>` 한 줄을 내고 exit 1

### M1.2 `chat.db`
- 산출: `src/db/chat-db.js` · `src/envelope/mention.js`
- 끝 조건: `test/chat-db.test.js` —
  - `표 여섯의 열이 minidiscord db.ts(6633f7b) 와 같다` (`PRAGMA table_info` 대 핀한 목록, 표마다 열 이름 · 순서)
  - `sessions 와 room_bots 는 만들지 않는다`
  - `봇마다 token 이 다른 uuid 다` (봇 둘 → UNIQUE 위반 없음)
  - `본방 봉투 없는 글은 to 한 줄` · `@TO 는 to · @CC 는 cc` · `같은 봇 TO+CC 는 두 줄` · `파일방 봉투 없는 글은 행 없음` · `모르는 봇 이름은 거절하고 행을 안 남긴다`
  - `stored_path 를 dirname(chat.db)/.. 기준으로 풀면 실제 파일이다`
  - `작성자 이름: user → username · bot → name · system → 시스템`
- 끝 조건(계약): `test/contract/chat-js.test.js` — 형제 `../prodev/scripts/chat.js` 를 `MINIDISCORD_DB=<시험 chat.db>` 로 부른다: `--json 아홉 칸 이름이 같다` · `targets 칸이 prodev-<과제>-bot:to` · `show 의 첨부 path 가 실제 파일`. 형제가 없으면 건너뜀

### M1.3 `cockpit.db`
- 산출: `src/db/cockpit-db.js`
- 끝 조건: `test/cockpit-db.test.js` — `표 여섯이 이름 그대로 있다(accounts · web_sessions · agent_sessions · session_events · permission_requests · bot_inbox)` · `bot_inbox 에서 delivered_at IS NULL 을 id 순으로 꺼낸다` · `permission_requests 첫 답만 먹는다(둘째 UPDATE 는 0행)` · `web_sessions 에 쿠키 원문이 없다`(저장된 값 ≠ 발급 값)

### M1.4 봉투 씌우기 · 절단
- 산출: `src/envelope/truncate.js`(minidiscord channel `truncate.ts` 사본, 출처 핀) · `src/envelope/wrap.js`
- 끝 조건: `test/envelope.test.js` —
  - `가운데 글이 채널 플러그인 content 와 글자 그대로 같다` (to · cc · 첨부 0/1/21 · 이름 300B · 본문 5000B, 기대 문자열은 `channel-server.ts:184-198` 규칙으로 시험 안에 손으로 적는다)
  - `to 에만 안내 줄이 붙는다`
  - `<channel 과 </channel 을 중화한 뒤 자른다`
  - `meta 여섯이 속성으로 바뀌지 않고 실린다` (`"` 는 `&quot;` · `<` 는 `&lt;` 만)
  - `첨부 경로는 절대 경로다`
  - `지시문은 minidiscord INSTRUCTIONS 와 두 자리만 다르다`

### M1.5 MCP 도구 둘
- 산출: `src/mcp/tools.js`
- 끝 조건: `test/mcp-tools.test.js` —
  - `reply: chat_id 가 방 번호면 그 방에 author_type=bot 글` · `chat_id 없으면 마지막 to 방` · `둘 다 없으면 오류 결과(isError)`
  - `reply files: 과제 폴더 뿌리 안은 첨부 · 밖은 조용히 뺀다 · 심볼릭 링크로 밖을 가리키면 뺀다`
  - `reply 결과 content 는 [{type:"text", text:"sent"}]`
  - `fetch_history 결과는 {cursor, messages[{id,at,author,body}]} JSON 한 건` · `빈 이력도 같은 모양(cursor null)` · `16000B 를 넘으면 새것부터 버린다` · `since_id 를 limit 보다 먼저 건다`(OD-9 를 물려받지 않는다)
  - `도구 서명: reply 는 text 만 필수 · fetch_history 는 필수 없음` (zod 모양을 JSON 스키마로 풀어 맞댄다)

### M1.6 세션 관리자 (모의 SDK)
- 산출: `src/session/manager.js` · `input-stream.js` · `env.js` · `sdk-query.js` · `test/fakes/fake-query.js`
- 끝 조건: `test/session-manager.test.js` —
  - `같은 과제에 글 셋 → queryFn 호출 1회`
  - `working 중에 들어온 글도 곧바로 queryFn 입력으로 간다` (W2r.1 에서 바뀜 — 처음 이름은 `working 중에 들어온 글은 result 뒤에 간다`)
  - `idle 에서 밀린 글 셋은 사용자 메시지 하나에 id 순으로`
  - `waiting_approval 중에도 배달` (W2r.1 에서 바뀜 — 처음 이름은 `waiting_approval 중에는 큐를 안 푼다`)
  - `interrupt 는 큐를 거치지 않는다`
  - `/compact 는 idle 을 기다렸다가 밀린 글보다 먼저 들어간다`
  - `채팅 글에는 origin channel/cockpit, /compact 에는 origin human`
  - `넷째 세션은 거절(maxSessions 3)`
  - `재기동: 새 manager 가 stopped 아닌 줄을 resume:session_id 로 켜고 delivered_at IS NULL 을 순서대로 넣는다`
  - `resume 실패면 새 세션으로 켜고 session_events 에 까닭`
  - `compact_boundary → 본방 system 글 둘` (정리 중 · 정리 끝)
  - `stream_event 는 session_events 에 안 적는다`
- 끝 조건: `test/sdk-options.test.js` — `options.js 가 만드는 옵션`(시험 이름 `옵션 칸이 설계 5.4 와 같다` · `env 에 COCKPIT_SECRET_PROBE 가 없다` · `env 키가 화이트리스트의 부분집합` · `bypassPermissions 문자열이 src/ 에 없다`): `permissionMode 'default'` · `allowedTools 는 정확히 mcp__cockpit__reply · mcp__cockpit__fetch_history` · `settingSources ['project','local']` · `strictMcpConfig true` · `persistSession true` · `includePartialMessages true` · `enableFileCheckpointing true` · `permissionPrompts 없음` · `env 에 COCKPIT_SECRET_PROBE 가 없다` · `env 키가 화이트리스트의 부분집합` · `bypassPermissions 문자열이 src/ 에 없다`
- 끝 조건: `test/no-sdk-import.test.js` — `src/session/sdk-query.js 밖의 src/ · test/ 파일은 @anthropic-ai/claude-agent-sdk 를 import 하지 않는다`

### M1.7 최소 CLI 와 첫 스모크
- 산출: `bin/cockpit.js open-project <과제> --bot-dir <폴더>` · `bin/cockpit.js chat <과제> "<글>"`(글 넣기 → 봇 답 기다리기 → 출력) · `smoke/m1-hello.mjs` · `smoke/README.md`(스크래치 봇 폴더 만드는 법: 봇 설정 사본의 matcher 를 `mcp__cockpit__reply` 로)
- 끝 조건(파일): `smoke/m1-hello.mjs` 가 있다. 이 스크립트는 진짜 SDK 로 ① 본방에 `안녕` ② 봇 답을 기다려 ③ 아래 줄을 낸다:
  ```
  SESSION_ID <uuid>
  SYSTEM_PROMPT preset+append
  BOT_REPLY message_id=<N> room=<본방 이름>
  PRE_REPLY_MARKER yes|no
  ASKED <canUseTool 로 온 도구 이름 목록 JSON>
  ```
  M1 의 스모크 판정은 meta 가 돌려 센다 (VERIFICATION 3절). cockpit 은 스크립트만 준다

### M1.M 관문 청하기
- `docs/as-built.md` · `docs/log.md` 갱신, meta 에 명령 줄과 함께 알린다

---

## M2 — 웹 · 계정 · 채팅 판 · 승인 카드

브라우저로 로그인해 방 둘에서 봇과 말하고, admin 이 승인 카드에 답한다. **옛 대본 재생(W2 관문)이 이 마일스톤 뒤에 선다.**

### M2.1 계정
- 산출: `src/auth/password.js` · `src/auth/sessions.js` · `bin/cockpit.js init-admin · add-user · session-token`
- 끝 조건: `test/auth.test.js` — `scrypt 저장 꼴 scrypt$N$r$p$소금$해시` · `틀린 비밀번호 거절(timingSafeEqual)` · `쿠키는 HttpOnly · SameSite=Lax · Path=/` · `만료된 세션은 401` · `init-admin 은 admin 이 있으면 거절` · `users.username 과 accounts 가 한 트랜잭션으로 생긴다` · `session-token 이 낸 값으로 GET /api/rooms 200`

### M2.2 HTTP 뼈대와 길 셋
- 산출: `src/http/server.js` · `routes-rooms.js` · `routes-messages.js` · `multipart.js` · `sse.js` · 정적 서빙
- 끝 조건: `test/http-rooms.test.js` — `쿠키 없으면 401` · `Authorization Bearer 만 있으면 401` · `JSON 본문 POST 는 406` · `GET /api/rooms 는 {active, archived}` · `POST 는 {ok, message:{id,…,author_name,attachments[{id,filename}]}}` · `?after=N 오름차순 최대 200` · `보관 방 409 · 없는 방 404 · 빈 글 400` · `응답 어디에도 stored_path 가 없다` · `첨부 받기는 filename* 헤더` · `정적 파일 경로 탈출(../) 404`
- 끝 조건(계약): `test/contract/replay-js.test.js` — 형제 `../prodev/scripts/replay.js` 를 cockpit(모의 세션 관리자: 글이 오면 봇 글을 하나 넣는다)에 붙여 걸음 셋짜리 대본을 돌린다: `exit 0` · `기록 JSONL 에 bot.message_id 가 셋`. 형제가 없으면 건너뜀

### M2.3 SSE
- 끝 조건: `test/sse.test.js` — `사건마다 id` · `Last-Event-ID 뒤의 사건만 다시 준다` · `partial 은 id 가 없다` · `로그아웃하면 흐름을 닫는다`

### M2.4 승인 중계
- 산출: `src/permissions/relay.js` · `routes-permissions.js`
- 끝 조건: `test/permissions.test.js` —
  - `요청 → permission_requests 한 줄(tool_use_id 키, agent_id)` · `본방 system 글 🔒 요청 한 줄`
  - `도우미 둘이 동시에 물으면 카드 둘, 각각 따로 답한다`
  - `admin 둘이 동시에 답하면 하나 200 · 하나 409`
  - `member 가 답하면 403`
  - `approvalTimeoutMin 이 지나면 deny 와 behavior=timeout`
  - `allow_session 은 updatedPermissions=suggestions` · `suppressAlwaysAllowRule 이면 allow_session 400`
  - `signal abort 면 behavior=cancelled`
  - `답마다 본방 system 글 한 줄(허용 ✅ · 거부와 시간 초과 ⛔, 🔒 는 없다)` · `걸린 요청이 0 이 되면 state working`

### M2.5 채팅 판 (화면)
- 산출: `web/index.html` · `app.js` · `chat.js` · `markdown.js`(minidiscord 사본, 출처 핀) · `style.css`
- 끝 조건: `test/web-static.test.js` — `web/ 의 어느 파일에도 http:// · https:// 로 시작하는 외부 src/href 가 없다` · `모든 <script> 가 type=module` · `innerHTML 대입이 markdown.js 밖에 없다` (정적 검사)
- 끝 조건(화면): `test/web-chat.test.js` — 화면 모듈의 순수 함수(글 → DOM 조각 모양 · 봉투 기본값 · 표식 강조 · 봇 상태 칩 글자)를 DOM 없이 시험한다: `본방 입력칸 기본값은 @TO(<그 과제 봇의 실제 이름>) ` · `[카드] 첫 줄 강조` · `system 🔒 글 모양` · `상태 칩 넷(생각 중 · 도구 실행 중 · 승인 대기 · 꺼짐)`

### M2.6 승인 카드 (화면, 글자만)
- 끝 조건: `test/web-card.test.js` — `title 이 있으면 title, 없으면 displayName` · `suppressAlwaysAllowRule 이면 이번 세션 허용 단추가 없다` · `defaultToNo 면 초점이 거부` · `member 화면에는 단추가 없다` · `permission_resolved 를 받으면 카드를 거둔다`

### M2.7 과제 열기
- 산출: `POST /api/projects` · `GET /api/projects`
- 끝 조건: `test/http-projects.test.js` — `admin 만 연다(member 403)` · `봇 한 줄 · 방 둘(prodev-<과제> · prodev-<과제>/files) · agent_sessions 한 줄` · `같은 이름을 다시 열면 409`

### M2.M 관문 청하기 (W2)
- `docs/as-built.md` · `docs/log.md` 갱신. meta 가 옛 대본 다섯을 재생한다

### W2r — W2 반려 뒤 고침 셋 (meta 지시 `instructions/W2-refix.md`, 2026-09-14)
- W2r.1 큐는 들어오는 즉시 배달(`working` · `waiting_approval` 에서도), `/compact` 만 `idle` 대기. 끝 조건: `test/session-manager.test.js` — `working 중에 들어온 글도 곧바로 queryFn 입력으로 간다` · `waiting_approval 중에도 배달` · `/compact 는 idle 을 기다렸다가 밀린 글보다 먼저 들어간다`
- W2r.2 `agent_sessions.cost_usd` = 마지막 `result.total_cost_usd`(덮어쓰기). 끝 조건: `test/session-manager.test.js` — `result 셋(0.1 · 0.25 · 0.4) 뒤 cost_usd 는 0.4`
- W2r.3 스크래치에 prodev 뿌리 흉내(`<스크래치>/prodev/{scripts,common,CLAUDE.md,.claude}` · `bots/<봇>`). 끝 조건: `test/smoke-scratch.test.js` — `makeScratch 뒤 <봇 폴더>/../../scripts/find.js 가 실제 파일`
- 그리고 prodev PR(W2.9) 하나 · `m2-approval` 재판. meta 가 같은 대본 넷으로 W2 를 재측정한다

---

## M3 — 조종석 판 · 파일 판 · 세션 조작 · 재기동

### M3.0 W2 재측정 뒤 둘 (meta 지시 `instructions/M3.md` 3절, 2026-09-14)
- ① 봇이 일하는 동안 `session.state` 가 `idle` 로 보이던 것. 끝 조건: `test/session-manager.test.js` — `result 뒤에 이어 온 봇 메시지는 state 를 working 으로 되돌린다`
- ② `find.log` · 인수인계서를 봇 폴더에. cockpit 은 봇 env 에 `PRODEV_BOT_DIR` 을 이미 넣는다 — 끝 조건: `test/session-manager.test.js` — `봇 세션 env 의 PRODEV_BOT_DIR 은 그 과제의 봇 폴더`. 새던 자리는 prodev `find.js` 라서 prodev PR(#18)이 고친다

### M3.1 사건 접기와 되그리기
- 산출: 세션 관리자의 사건 접기 · `GET /api/projects/:name/events`
- 끝 조건: `test/events.test.js` — `ARCHITECTURE 5.3 표의 메시지마다 type 이 맞다` · `tool_use 입력 요약은 200자` · `stream_event 0행` · `result 마다 cost_usd 누적` · `after=N 이면 N 뒤만`

### M3.2 조종석 판 (화면)
- 산출: `web/cockpit.js`
- 끝 조건: `test/web-cockpit.test.js` — `이번 턴 도구 목록은 마지막 result 뒤의 tool_use 만` · `is_error tool_result 는 빨강 표시` · `도우미 사건은 parent_tool_use_id 로 묶인다` · `문맥 사용률 백분율` · `값 옆에 "추정치" 글자`

### M3.3 세션 조작
- 산출: `POST /api/projects/:name/session/{start,stop,interrupt,compact,restart}` · `tasks/:taskId/stop`
- 끝 조건: `test/http-session.test.js` — `다섯 길 모두 member 403` · `start 넷째는 409` · `interrupt 는 queryFn.interrupt 1회` · `compact 는 working 이면 걸어 두고 idle 에 넣는다` · `stop 은 백그라운드 도우미가 있으면 목록을 내고 confirm=1 이 있어야 close` · `task stop 은 stopTask(id)`

### M3.4 파일 판
- 산출: `routes-files.js` · `web/files.js`
- 끝 조건: `test/http-files.test.js` — `../ 탈출 404` · `과제 폴더 밖을 가리키는 심볼릭 링크 404` · `csv 는 앞 50행` · `png 는 image/png` · `쓰기 메서드(PUT/POST/DELETE) 405`

### M3.5 과제 탭 · 압축 경계
- 끝 조건: `test/web-tabs.test.js` — `과제마다 탭 하나` · `compact_boundary 는 채팅 판에 경계 한 줄` · `session_state 사건으로 칩이 바뀐다`

### M3.6 재기동 스모크
- 산출: `smoke/m3-restart.mjs` — 진짜 SDK 로 ① 글 하나 → 답 ② 서버 프로세스 강제 종료 ③ 그 사이 글 둘을 DB 에 넣음 ④ 다시 켬 ⑤ 답 둘을 기다린다. 내는 줄:
  ```
  RESUMED session_id=<같은 uuid>|NEW
  REDELIVERED 2
  BOT_REPLIES_AFTER_RESTART <N>
  ```
- 끝 조건(파일): 스크립트가 있다. 판정은 meta
- (M3.M 준비로 더함) 진짜 CLI `serve` 를 자식 프로세스 묶음으로 띄워 묶음째 SIGKILL 하고, 끝에 admin API 로 `stop` · `start` 를 쳐 `STOP_API` · `START_API_AGAIN … same_session=` 을 낸다

### M3.M 준비 — 대본의 손 걸음을 admin API 로 (meta 지시 3절)
- `smoke/m2-compact.mjs` · `smoke/m3-restart.mjs` 가 serve + admin API(`POST /api/projects/:name/session/{start,compact,stop}`)로 돈다. 공용은 `smoke/server.mjs`
- API 모양은 `docs/ARCHITECTURE.md` 8.3. `replay.js` 의 `manual` 걸음(`.manual-<id>.ok`)은 meta 가 길을 치고 파일을 만든다
- 끝 조건(파일): 두 스크립트가 `START_API` · `STOP_API` 줄을 낸다 · ARCHITECTURE 8.3 이 있다

### M3.M 관문 청하기 (W3)

---

## M4 — 윈도우 · 설치 · 문서

### M4.1 윈도우에서 시험
- 끝 조건: 윈도우(PowerShell)에서 `npm test` 요약 `# fail 0`. 윈도우에서만 건너뛰는 시험은 이름을 `docs/as-built.md` 에 적는다(심볼릭 링크 시험 등). 줄 수를 세어 적는다
- (M4 지시) 윈도우 실측은 사람이 회사 PC 에서 돌려 meta 에 준다. cockpit 은 건너뛸 조건을 `test/fakes/platform.js` 로 갈라 두고 이름을 as-built 4.1 에 적는다 — 제작 세션의 보고는 근거가 아니다

### M4.2 설치 명령과 문서
- 산출: `docs/INSTALL-WINDOWS.md` · `bin/cockpit.js check` 가 윈도우에서 `claude --version` 을 `claudePath` 로 불러 판을 낸다
- 끝 조건: `node bin/cockpit.js check` 출력에 `✓ claudePath <판>` · `✓ node <판> (>= 22)` · `✓ 경로 공백 없음` 셋. 문서에 설치 걸음이 번호로 있고 걸음마다 확인 명령이 있다 (`grep -c '^[0-9]\+\. ' docs/INSTALL-WINDOWS.md` ≥ 6)

### M4.3 자원 계측 스크립트
- 산출: `smoke/m4-sessions.mjs` — 세션 셋을 켠 채 5분 동안 서버 · CLI 자식 프로세스의 상주 메모리를 1분마다 적는다. 내는 줄: `RSS_MB <분> <서버> <자식 합>`
- 끝 조건(파일): 스크립트가 있다. 판정(P-W4.d)은 meta

### M4 더함 셋 (meta 지시 `instructions/M4.md` 4절, 2026-09-14)
- ① 끝 조건: `test/sdk-options.test.js` — `윈도우 키 여섯(USERPROFILE · APPDATA · LOCALAPPDATA · TEMP · SystemRoot · ComSpec)이 실리고 그 밖 키는 안 실린다`
- ② 끝 조건(파일): `docs/ARCHITECTURE.md` 5.3 에 "재기동 뒤 값 = 정지 시점 값(바닥) + 새 프로세스 누적" 과 도우미 값 포함 여부 한 줄
- ③ 끝 조건(파일): `README.md` "쓰는 법" 에 맥 · 윈도우(PowerShell) 명령이 나란히

### M4.4 as-built
- 끝 조건: `docs/as-built.md` 에 절 여섯(폴더 나무 · 표 둘 · API · 시험 묶음과 건수 · 설계와 다르게 된 자리 · 알고 두는 것)이 있다

---

## 크기 (제작만, 추정)

M1 4일 · M2 4일 · M3 3일 · M4 2일. 첫 관문(W2) 전에 M1 · M2 가 끝나야 해서 meta 의 "W2 2주" 에 빠듯하다 — meta 검토 1차의 "W2 를 둘로 쪼개라" 와 같은 뜻으로 **M1.M 에서 한 번 멈춘다.**

## 하지 않는 것

- M1.M 전에 화면을 만드는 것 (봉투와 큐가 굳기 전에 화면이 굳으면 화면에 맞춰 규칙을 고치게 된다)
- 진짜 SDK 를 `npm test` 에 넣는 것
- prodev · minidiscord 본 체크아웃을 고치는 것 (사본을 가져올 때는 출처 커밋을 파일 머리에 적는다)
- 자기 관문 판정 · 예측표 읽기
