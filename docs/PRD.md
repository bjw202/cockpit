# cockpit — 제품 요구사항 (PRD)

작성 2026-09-14 (cockpit 제작 세션). 자리: 이 문서는 cockpit 저장소의 것이다. 설계의 뿌리는 `../../meta/prodev-review/plans/2026-09-14-web-cockpit/` 의 `DESIGN.md` · `AS-IS-TO-BE.md` · `TASKS.md` · `spike/RESULTS.md` · `research/coupling-inventory.md` 이고, 여기에는 **요구만** 옮겼다. 구조는 `ARCHITECTURE.md`, 결정의 까닭은 `ADR.md`, 만드는 순서는 `TASKS.md`, 검수는 `VERIFICATION.md`.

**v2 회차 (2026-09-14 저녁, 사람 결정).** 뿌리에 `../../meta/prodev-review/plans/2026-09-14-cockpit-후속/AS-IS-TO-BE-v2.md`(요구 R9~R14)와 `DIRECTION-v2.md` 가 더해졌다. 한 줄: **속은 cockpit, 겉은 minidiscord. 방 하나 = 과제 하나 = 전용 봇 하나. files 방은 없다. 디자인 토큰은 그대로.** 바뀐 요구 줄에는 옛 글을 남기고 "대체됨 → ADR-0xx" 를 붙였다. 새 결정은 ADR-015~020.

## 1. 한 줄

**웹 앱 하나(cockpit)가 방마다 실제 Claude Code 세션(prodev 봇)을 하나씩 띄워 붙들고, 사람은 사내망 브라우저로 들어와 minidiscord 와 같은 화면에서 서로 말하고 봇을 불러 일을 시키고, 봇이 일하는 과정을 오른쪽 접이식 판에서 보고, PL 이 승인한다. 봇이 보는 세계는 minidiscord 판과 같다.**

## 2. 왜 만드나

- 회사가 Claude Code 의 **channels**(채팅 서버가 세션을 깨우는 통로)를 막았다. minidiscord 방 + 채널 플러그인 창구는 회사에서 못 쓴다.
- `claude -p` · Agent SDK · MCP 는 회사 PC 에서 돈다 (사람 확인, DESIGN R1). 그래서 **창구를 서버 프로세스 안으로 옮긴다.** 서버가 SDK 로 세션을 직접 띄우고, 봇의 `reply` 도구도 서버 프로세스 안에 둔다.
- 사람이 minidiscord 를 **대체**하기로 정했다 (DESIGN R3). cockpit 이 방 · 글 · 첨부 · 계정을 직접 가진다. **v2 에서 "대체" 의 뜻이 좁혀졌다: 서버는 새로(cockpit), 화면은 minidiscord 것을 옮긴다** (R9 · ADR-016). 사람이 조종석을 처음 눌러 보고 "UI 가 별로다" 라 했고, "디스코드 UI 디자인을 계승했으니 디자인을 잘 살려라" 를 얹었다.
- 하네스(prodev)는 최소로만 고친다 (R7). 봇의 기억은 여전히 과제 폴더의 파일이다. **v2 의 files 방 제거는 하네스 11곳을 건드린다** — R7 과 부딪히지만 사람이 그래도 하기로 했고, prodev PR 하나로 한다 (ARCHITECTURE 11절).

## 3. 누가 쓰나 — 사용자 둘

| 역할 | 누구 | 할 수 있는 것 | 못 하는 것 |
|---|---|---|---|
| **admin** | PL (과제 리더). 회사 PC 의 주인이고 Claude 로그인도 PL 계정 하나다 | 채팅 · 첨부 · 진행 열람 · **승인 카드에 답하기** · **세션 조작**(켜기 · 끄기 · 멈춤 · 압축 · 다시 켜기 · 도우미 멈춤) · 계정 만들기 · **방 만들기(= 과제 열기 · 봇 생성)** · **방 보관** | — |
| **member** | 과제원 | 채팅 · 첨부 올리기 · 받기 · 봇 부르기(`@TO` · `@CC`) · 진행 열람(접이식 판을 펴서 읽기) | 승인 · 세션 조작 · 계정 관리 · 방 만들기 · 보관 |
| (봇) | prodev 봇 세션. 방 하나에 하나 | `reply` · `fetch_history` 두 도구로 제 방에 말하고 읽는다. 과제 폴더에 쓴다 | cockpit 계정 · 승인 기록에 닿기 · 다른 과제의 방 |

헌장 · 와꾸 · 발송 결재는 지금처럼 **방의 글**로 한다. 결재자 대조는 prodev 훅이 `users.username` 과 `charter.md` 의 `PL:` 을 글자 그대로 맞대는 것이다. 그래서 PL 의 cockpit 계정 이름은 헌장의 PL 이름과 같아야 한다.

## 4. 요구사항

용어 풀이 (이 문서에서 처음 쓰는 것):
- **봉투** — 사람 글 머리의 `@TO(봇)` · `@CC(봇)`. 누구에게 답을 청하는지(`to`) 참고로 알리는지(`cc`)를 적는다.
- **meta 여섯** — 봇에게 가는 글에 붙는 속성 `chat_id · message_id · delivery · sender · author_type · room_name`. `chat_id` 는 방 번호다.
- **큐** — 봇에게 아직 안 간 글의 줄. `cockpit.db` 의 `bot_inbox` 표다.
- **승인 카드** — 봇이 허용 목록 밖의 도구를 쓰려 할 때 admin 브라우저에 뜨는 묻는 칸.
- **조종석 판** — 봇이 지금 무엇을 하는지(도구 호출 · 도우미 · 훅 · 값 · 문맥) 보여 주는 화면.
- **접이식 판** (v2) — 방 화면 오른쪽에 붙은 판 하나. 승인 카드 · 조종석 · 파일을 위에서부터 담고, 단추 하나로 통째로 접고 편다.
- **따라잡기** (v2) — 봇이 부르지 않은 사이에 오간 글과 첨부를, 사람이 "위 내용 봐 줘" 하고 부를 때 `fetch_history` 로 끌어와 읽는 것.
- **디자인 토큰** (v2) — minidiscord `web/design-tokens.css` 의 CSS 변수 34개(`--md-*`, 색 · 글꼴 · 간격 · 모서리 · 너비).

### 4.1 기능 (F)

| # | 요구 | 어떻게 확인하나 |
|---|---|---|
| F1 | 과제 하나 = 봇 세션 하나 = **살아 있는** `query()` 하나. 글이 올 때마다 새 세션을 띄우지 않는다 (R0) | 같은 과제에 글 셋을 넣으면 `agent_sessions.session_id` 가 하나다 |
| F2 | **(v2) 방 하나 = 과제 하나 = 전용 봇 하나.** 방 이름 `prodev-<과제>`, 봇 이름 기본 `prodev-<과제>-bot`. 첨부도 그 방에 올린다. 옛 파일방 `prodev-<과제>/files` 는 `migrate-v2` 가 보관으로 돌리고 글은 그대로 둔다 (R10 · ADR-015). ~~v1: 과제 하나 = 방 둘: 본방 `prodev-<과제>` · 파일방 `prodev-<과제>/files`. 이름의 첫 `/` 가 갈래다~~ — **대체됨 → ADR-015** | 방을 만든 뒤 `GET /api/rooms` 의 `active` 에 그 과제 이름으로 시작하는 방이 **하나**, `/` 든 이름이 0 · `migrate-v2 --apply` 뒤 옛 files 방은 `archived` 에 있고 글 수가 이관 전과 같다 |
| F3 | **(v2) 봇에게 가는 글은 `@TO(봇)` · `@CC(봇)` 이 있는 글뿐이다.** 봉투 없는 글은 어느 방에서도 `message_targets` · `bot_inbox` 행이 없다(사람끼리). 방의 봇이 아닌 이름은 400 그대로 (R11 · ADR-018). ~~v1: 본방에서 봉투 없는 글은 그 과제 봇에게 `to` 로 넣는다~~ — **대체됨 → ADR-018**. 사람 글을 저장할 때 봉투를 파싱해 `message_targets` 행을 넣는 것 · 봇 이름은 방을 만들 때 정하는 것 · 별칭 없음은 그대로 | `chat.js --json` 의 `targets` 칸이 봉투 있는 글은 `<봇 이름>:to` · 없는 글은 빈 칸 · 모의 SDK 시험: 봉투 없는 글 셋 뒤 `queryFn` 입력 0 |
| F4 | 봇에게 가는 글은 채널 플러그인과 같은 꼴이다: `[<이름>] <본문>` + 첨부가 있으면 `(첨부 파일 경로: <절대경로>, …)` + `to` 이면 안내 줄 + meta 여섯 | 봉투 씌우기 단위 시험이 채널 플러그인의 문자열과 글자 그대로 같다 |
| F5 | 도구 둘을 채널 플러그인과 같은 **입력** 서명으로 준다: `reply(chat_id?, text, files?)` · `fetch_history(chat_id?, since_id?, since?, until?, speaker?, limit?)`. 전체 이름은 `mcp__cockpit__reply` · `mcp__cockpit__fetch_history`. (v2) 결과 JSON 의 모양은 F20 | 도구 서명 시험 · 진짜 SDK 스모크에서 봇이 `mcp__cockpit__reply` 를 부른다 |
| F6 | 절단 상한 다섯이 채널 플러그인과 같다 (본문 4000B · 첨부 20 · 경로 512B · 이력 16000B · 이름 256B). 중화 뒤에 자르고, 이력은 새것부터 버린다 | 절단 시험 |
| F7 | 봇의 `reply` 는 prodev 의 pre-reply 훅을 거친 뒤에만 방에 `author_type='bot'` 글로 남는다. 훅이 막으면 글이 안 남는다 | 스모크: 901자 `reply` → 방에 글 0 |
| F8 | 사람 글은 들어오는 즉시 세션에 넣는다 — `idle` 뿐 아니라 `working` · `waiting_approval` 중에도(SDK 가 그 턴에 접어 넣는다, 옛 채널과 같다). 예외는 admin 의 `/compact` 하나: `idle` 을 기다렸다가 넣고, 그 압축 턴 동안은 글을 붙잡는다. 멈춤(`interrupt`)은 곧바로 (meta W2 반려 W2r.1 — D0 Q12 의 "idle 에서만" 을 되돌렸다) | 모의 SDK 시험: working · waiting_approval 중에 들어온 글이 곧바로 입력으로 가고, `/compact` 는 result 뒤에 간다 |
| F9 | 서버가 죽었다 살아나면 `agent_sessions.session_id` 로 `resume` 하고, `bot_inbox` 에서 `delivered_at IS NULL` 인 글을 id 순서대로 다시 넣는다 | 재기동 시험(모의) · 재기동 대본(진짜, meta) |
| F10 | 허용 목록 밖 도구는 승인 카드로 온다. 카드는 admin 에게만 버튼이 있다. 요청 키는 `toolUseID`, 도우미 안의 요청은 `agentID` 도 적는다. **요청마다 첫 답이 이긴다.** N분(기본 10) 무응답이면 거부 | 승인 중계 시험 (도우미 둘 동시 · 두 admin 동시 답 · 시간 초과) |
| F11 | 카드는 SDK 가 준 `title · displayName · description` 을 그대로 쓴다. "이번 세션 허용" 버튼은 `suppressAlwaysAllowRule` 이면 숨기고, `defaultToNo` 면 기본 선택을 거부에 둔다 | 카드 그리기 시험 |
| F12 | 승인 요청과 답을 그 방에 `author_type='system'` 글 한 줄씩으로도 남긴다. 요청 줄만 🔒, 답 줄은 ✅(허용 · 이번 세션 허용) · ⛔(거부 · 시간 초과) — `weekly` 의 🔒 수 = 요청 수 (meta D0 Q7) | `chat.js search 🔒` 가 요청만 낸다 |
| F13 | 로그인한 사람만 들어온다. 로컬 계정 · 비밀번호 해시 · `HttpOnly SameSite=Lax` 쿠키. 첫 admin 은 명령 한 줄로 만든다. (v2) 옮긴 로그인 화면에 비밀번호 칸을 더한다 | 계정 시험 · `node bin/cockpit.js init-admin` · 정적 시험: `web/index.html` 로그인 폼에 `type="password"` 칸 하나 |
| F14 | HTTP 길 셋은 minidiscord 와 같은 모양이다: `GET /api/rooms` · `POST /api/rooms/:id/messages`(multipart 만) · `GET /api/rooms/:id/messages?after=` — meta 의 `prodev/scripts/replay.js` 가 고치지 않고 돈다 | 계약 시험: 진짜 `replay.js` 를 cockpit 에 붙여 돌린다 (v2 방 하나 판) |
| F15 | **(v2) 화면은 minidiscord 화면을 옮긴 것이다** — 방 목록 사이드바 · 아바타 메시지 · 작성기 한 덩어리 · 계정 바 · 본문 마크다운 · `@TO` `@CC` 칩 · `@` 자동완성(항목은 `TO` 만, 2026-09-15 ADR-016 덧붙임) · 붙여넣기 · 끌어놓기 · 썸네일 · UTC 표기 · 히스토리 끝까지 · SSE 백필. 옮기는 파일 다섯(`index.html` · `app.js` · `rich.js` · `style.css` · `design-tokens.css`)은 머리에 출처 커밋 · sha256. **디자인 토큰 34 의 값은 바꾸지 않는다.** 더하는 것은 오른쪽 접이식 판(F21)뿐이다 — ~~작성기의 `@TO(봇)` 미리 채움~~은 2026-09-15 사람 결정으로 되돌렸다(입력칸은 비어 있고 `@` 로 부른다, ADR-018 상태) (R9 · ADR-016). ~~v1: 화면 셋: 채팅 판(방 둘 · 첨부 · 봇 상태 · 압축 경계) · 조종석 판 · 파일 판~~ — **대체됨 → ADR-016 · ADR-019** | 정적 시험: `web/design-tokens.css` 의 sha256 이 머리에 적힌 원본 sha256 과 같고 `--md-` 변수가 34 · `rich.js` 도 원본 sha256 과 같다 · ~~화면 순수 함수 시험(`web/glue.js`): 방을 열면 작성기 기본값이 `@TO(<그 방 봇 이름>) `~~ → 정적 시험: `openRoom` · `sendMessage` 가 입력칸을 `@TO(` 로 채우지 않는다 · 자동완성 항목은 `TO` 하나 |
| F16 | 압축이 일어나면 그 방에 "문맥을 정리 중입니다. 곧 이어서 합니다." · "정리가 끝났습니다. 이어서 하려면 말을 걸어 주세요." 를 cockpit 이 system 글로 남긴다 (훅의 알림 POST 를 대신한다) | 모의 SDK: `compact_boundary` → system 글 2 |
| F17 | 봇이 첨부로 넘긴 파일은 과제 폴더 뿌리 안일 때만 방 첨부가 된다(실경로로 대조). 밖이면 조용히 뺀다 | 첨부 봉인 시험 |
| F18 | 파일 판은 읽기만 한다. 과제 폴더 밖 경로(`..` · 심볼릭 링크 탈출)는 404 | 경로 봉인 시험 |
| F19 | **(v2) 방 만들기가 봇을 만든다.** admin 이 방을 만들면(`POST /api/rooms {name: <과제>}`) 한 요청이 prodev `setup.js` 로 과제 폴더 · 봇 폴더 · 설정 두 장을 만들고, `chat.db` 에 봇 · 방, `cockpit.db` 에 세션 줄(`stopped`)을 넣는다. **어느 걸음에서 실패하면 그 요청이 새로 만든 폴더 · 행을 되돌리고** 요청 전에 있던 과제 폴더는 두고 까닭을 낸다. member 는 403. 같은 이름 409 (R10 · ADR-017) | HTTP 시험(가짜 setup 주입): 성공 → 봇 폴더 · 방 하나 · 세션 줄 · `201` · setup 실패 → `502` 와 새 폴더 0 · 행 0 · `cockpit.db` 쓰기 실패 → `chat.db` 행 0 · 봇 폴더 없음 · 계약 시험: 형제 `prodev/scripts/setup.js` 를 임시 prodev 사본에서 불러 `bots/prodev-<과제>-bot/.claude/settings.local.json` 이 생긴다 |
| F20 | **(v2) `fetch_history` 결과에 첨부를 싣는다.** 첨부가 있는 글에만 `attachments: [{ filename, path }]`(절대 경로, 봉투와 같은 값). 이름 256B · 경로 512B · 글마다 20개, 16000B 상한은 칸을 더한 JSON 전체에. 첨부 없는 이력은 v1 과 바이트까지 같다. 제 과제의 옛 files 방(보관)도 읽기는 된다 (R11 · ADR-020) | 도구 시험: 첨부 둘 달린 글 → `attachments` 둘 · `path` 가 실제 파일 · 첨부 없는 글에는 칸이 없다 · 21개 → 20 + 잘림 표시 · 넘치면 새것부터 버린다 · 보관된 옛 files 방 `chat_id` 로 읽기 되고 `reply` 는 오류 |
| F21 | **(v2) 승인 카드 · 조종석 · 파일 판은 방 화면 오른쪽 접이식 판 하나에.** 판은 지금 연 방의 과제를 따른다. **member 는 접힘이 기본, admin 은 펼침이 기본.** 사람이 바꾼 접힘은 그 브라우저에만 기억. 승인 요청 · 답은 채팅의 🔒 · ✅ · ⛔ 줄에도 그대로 (R12 · ADR-019) | 화면 순수 함수 시험: `panelOpenByDefault('member')` 는 `false` · `'admin'` 은 `true` · 기억한 값이 있으면 그것 · 승인 요청이 걸린 수가 접힌 단추 글자에 붙는다 · 정적 시험: `index.html` 에 `#cockpit-panel` 하나 · 판 CSS 가 `var(--md-…)` 밖의 색 값을 안 쓴다 |
| F22 | **(v2) 방 보관.** admin 이 방을 보관하면(`POST /api/rooms/:id/archive`) 그 방의 세션을 끄고 방을 `archived` 로 둔다. 보관 방에 글을 쓰면 409 (minidiscord 와 같다). member 403 | HTTP 시험: 보관 → `agent_sessions.state` `stopped` · `GET /api/rooms` 의 `archived` 에 있음 · 글 POST 409 · 두 번째 보관 409 |
| F23 | **(v2) 봇 없는 방 · 봇 배정 화면은 첫 판에 없다.** 방은 언제나 봇 하나를 갖는다. `/api/bots` · `/api/rooms/:id/bots` 는 없다 (R13) | 정적 시험: `web/` 어느 파일에도 `/api/bots` 문자열이 없다 · HTTP 시험: 두 길 404 |

### 4.2 비기능 (N)

| # | 요구 | 값 |
|---|---|---|
| N1 | 실행 | Node ≥ 22.13(`node:sqlite` 무플래그 첫 판) 한 프로세스(`node bin/cockpit.js serve`). **네이티브 모듈 0** — 회사 PC 에 빌드 도구가 없다 |
| N2 | 저장소 | `node:sqlite` 파일 둘. `chat.db`(minidiscord 표 여섯, 이름 · 열 그대로, 봇은 읽기만) · `cockpit.db`(표 여섯, 봇 설정에서 deny) |
| N3 | 웹 | 빌드 없음. 순수 ES 모듈과 CSS 를 저장소에 둔 그대로 서빙. **외부 CDN 0** (사내망). (v2) 옮긴 minidiscord 화면도 같은 조건이다 |
| N4 | 의존성 | 런타임 npm 의존성은 `@anthropic-ai/claude-agent-sdk`(≥ 0.3.270) 와 그 도구 스키마용 `zod` 둘. (v2) 옮긴 화면 때문에 jsdom 등 시험 의존성도 늘리지 않는다 |
| N5 | 윈도우 우선 | PowerShell + Git Bash. 설정의 경로에 공백이 있으면 기동하지 않는다. 윈도우에서는 `claudePath`(→ `pathToClaudeCodeExecutable`)가 없으면 기동하지 않는다. (v2) `prodevDir` 도 같은 경로 검사를 받고, `botsDir` 가 `<prodevDir>/bots` 가 아니면 기동하지 않는다 |
| N6 | 동시 세션 | 상한 3 (설정값). 넷째를 켜려 하면 거절하고 까닭을 말한다 (DESIGN V6). 방을 만드는 것은 세션을 켜지 않는다 |
| N7 | 봇 세션의 env | 화이트리스트만 넘긴다. `{...process.env}` 금지 (DESIGN 6절 · V7) |
| N8 | 권한 | `permissionMode 'default'` 만. `bypassPermissions` · `auto` 금지. `allowedTools` 는 MCP 도구 둘만 |
| N9 | 시험 | `npm test` 는 서버 · SDK · 네트워크 없이 돈다. 진짜 SDK 를 부르는 것은 `smoke/` 에만 있고 `npm test` 에 안 섞인다 |
| N10 | 조종석 스트림 | 부분 메시지(`stream_event`)는 저장하지 않는다. `session_events` 는 턴 단위로 접어 적는다 (DESIGN V4) |
| N11 | 이름 | 제품명 · 화면 · 문서 제목에 "Claude Code" 를 쓰지 않는다 (Anthropic 정책). 이름은 cockpit. (v2) 옮긴 화면의 제목 · 로그인 머리 글자도 cockpit |
| N12 | 바깥 | cockpit 자체는 사내망 밖으로 아무것도 안 보낸다. 밖으로 나가는 것은 봇 세션(Claude CLI)뿐이다 |
| N13 | (v2) 디자인 | minidiscord 디자인 토큰 34 의 이름 · 값을 바꾸지 않는다. cockpit 이 더하는 CSS 는 `style.css` 끝 한 덩이이고 색 · 글꼴 · 간격은 토큰 변수로만 쓴다 |

## 5. 첫 판 범위

**한다**: F1~F23 · N1~N13 · 방 목록(방 여럿 = 세션 여럿) · 재기동 되살림 · 윈도우 설치 문서 · 첫 admin 명령 · (v2) 옛 files 방 이관 명령.

**안 한다** (DESIGN 12절 · TASKS "하지 않는 것"):
- 서비스 등록(NSSM · 예약 작업) — PL 의 PowerShell 창 하나로 띄운다
- diff 창 · 대화 되감기(fork). 파일 되감기(`rewindFiles`)는 체크포인트만 켜 두고 화면은 2판
- 범용 화면 (prodev 가 아닌 하네스를 위한 화면). `agent_sessions` 한 줄이 세션 정의라는 자리만 열어 둔다
- SSO · 모바일 최적화
- Codex 등 다른 CLI · 봇 여럿의 협업 · 봇끼리의 대화
- 되먹임 차단(봇 글 연속 N개면 `to` 를 `cc` 로 내리기) — 봇이 하나라 첫 판에서는 안 둔다
- `/login` — Claude 로그인은 PL 이 회사 PC 터미널에서 한 번 한다
- (v2) **봇 없는 방(잡담 · 공지) · 방에 봇 배정 · 봇 등록 · 봇 지우기 화면** (R13) — minidiscord 의 `/api/bots` · `/api/rooms/:id/bots` 와 사이드바 "봇" 칸 · "봇 참여" 단추는 옮기지 않는다
- (v2) **올라오는 첨부를 봇이 족족 읽기** — 부른 글의 첨부와 따라잡기뿐 (ADR-020)
- (v2) 옛 files 방의 글을 본방으로 **옮기거나 합치기** — 보관만 한다 (ADR-015)
- (v2) minidiscord 화면에 없던 v1 채팅 장식(`[카드]` · `[발송]` 첫 줄 강조 · 압축 경계 줄 · 살아 있는 글자 표시)을 채팅에 되살리기
- (v2) 첨부를 브라우저 안에서 열기 · 딥링크 — 받기만 (후속 README 3.1, 사람이 닫음)

## 6. 성공의 정의

제작이 끝났다는 말은 `VERIFICATION.md` 의 표를 **meta 가 직접 돌려** 채우고, meta 의 관문 W2 · W3 이 통과했을 때다. **v2 는 D0-v2(문서) → M5.M(옛 대본 다섯의 v2 판 + 새 대본 R8 재생, 새 기준선)** 이 그 관문이다. cockpit 세션은 자기 검수표를 채우지 않고, 예측표 · 채점표 · 정답지를 읽지 않는다.
