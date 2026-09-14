# cockpit — 설계 결정 기록 (ADR)

한 결정에 한 절. 서식: 상태 · 맥락 · 결정 · 까닭(근거 경로) · 결과. 뒤집으면 지우지 않고 상태를 바꾸고 새 절을 더한다.
근거 경로의 `plans/` 는 `../../meta/prodev-review/plans/2026-09-14-web-cockpit/` 이다.

상태 표기: **확정(사람)** 은 사람이 정한 것, **확정(meta)** 은 meta 설계 검토가 정한 것, **제안** 은 cockpit 제작 세션이 정해 meta 관문을 기다리는 것.

---

## ADR-001 창구는 Agent SDK `query()` 로 연다
**상태** 확정(사람 · meta, 2026-09-14)
**맥락** channels 가 막혔다. 남은 길은 넷이다: 터미널을 웹에 띄우기(ttyd 류) · headless CLI 를 stream-json 으로 직접 조립 · 공식 Remote Control · Agent SDK. 요구는 살아 있는 세션(R0) · 역할별 승인(R6) · 사람 구분 · 대화 저장소 · 사내망 자체 호스팅(R4)이다.
**결정** 서버가 `@anthropic-ai/claude-agent-sdk` 의 `query()` 로 봇 세션을 띄운다. 판(0.3.270 이상)을 `package.json` 에 적는다.
**까닭** 터미널 감싸기는 화면 글자만 오가서 사람 구분 · 승인 게이트 · 대화 저장소가 구조적으로 안 생긴다. headless 직접 조립은 승인 경로가 비문서 플래그(`--permission-prompt-tool=stdio`)에 선다. Remote Control 은 트랜스크립트가 Anthropic 서버에 남고 조직이 끌 수 있다. SDK 는 같은 것을 타입 있는 공식 API 로 주고(`canUseTool` 비동기 · 스트리밍 입력 · `resume`), 이 맥에서 조합 전체가 돌았다 (`plans/DESIGN.md` 3절 · `plans/spike/RESULTS.md` 실증 1~5 · `plans/research/prior-art.md` 4절).
**결과** Claude CLI 를 SDK 가 자식 프로세스로 띄운다. 윈도우는 `pathToClaudeCodeExecutable` 을 반드시 준다. statusline 과 `/login` 은 없다 — 조종석 판이 대신 그리고, 로그인은 PL 이 PC 에서 한 번 한다. 회사 계정에서 도는지는 W1 이 잰다.

## ADR-002 과제 하나 = 살아 있는 `query()` 하나, 그 클라이언트는 서버 하나
**상태** 확정(사람, R0 · R5)
**맥락** 단발 요청형(글마다 세션)은 사람이 기각했다. 브라우저 여럿이 같은 봇에 말한다.
**결정** 과제마다 스트리밍 입력(`prompt: AsyncIterable`)으로 세션 하나를 붙든다. 브라우저는 세션에 직접 닿지 않고 서버의 큐(`bot_inbox`)에 글을 넣는다.
**까닭** 문맥 · 압축 · 훅 · 도우미가 실제 Claude Code 와 같아야 한다. 세션 입력을 한 곳에서만 넣으면 여러 사람이 동시에 넣는 경쟁이 구조로 없어진다 (`plans/DESIGN.md` 4절 읽는 법).
**결과** 동시 세션 상한(기본 3)이 필요하다 (DESIGN V6). 서버가 죽으면 세션도 멈추므로 `resume` 으로 되살린다.

## ADR-003 DB 파일은 둘이다 — 봇이 읽는 `chat.db`, 봇이 못 보는 `cockpit.db`
**상태** 확정(meta, 검토 3차 #31)
**맥락** 하네스 스크립트(`chat.js` · `pre-reply.js` · `places.js`)는 대화 DB 를 직접 연다. 봇 설정은 그 경로를 env 로 싣고 허용 목록에 `Bash(node:*)` 가 있다. minidiscord 판의 DB 에는 대화뿐이었지만 cockpit 은 비밀번호 해시 · 쿠키 세션 · 승인 기록을 갖는다.
**결정** 대화(minidiscord 표 여섯)는 `chat.db`, 계정 · 세션 · 승인 · 큐 · 사건은 `cockpit.db`. 봇에게는 `chat.db` 경로만 준다. 봇 설정 deny 에 `cockpit.db` 를 넣는다(prodev PR). 쓰는 것은 서버뿐이다.
**까닭** 한 파일이면 봇이 해시를 읽고 승인 기록을 고칠 수 있다. 가르면 봇의 정당한 읽기 경로에 비밀이 없다 (`plans/research/design-review-1.md` 3차 #31).
**결과** deny 는 `Bash(node:*)` 스크립트를 못 막는다. 그래서 `cockpit.db` 에는 해시만 둔다(비밀번호 scrypt · 쿠키 SHA-256). 트랜잭션이 두 파일에 걸치는 자리(사람 글 = `chat.db` 의 글 + `cockpit.db` 의 큐)는 `chat.db` 를 먼저 쓰고 큐를 쓴다. 큐 쓰기에서 죽으면 그 글은 봇에게 안 가지만 봇이 켜질 때 `chat.js since` 로 따라잡는다.

## ADR-004 minidiscord 표 여섯을 이름 · 열 그대로 둔다 — 더하는 열도 없다
**상태** 확정(meta) · 열을 더하지 않는 것은 제안
**맥락** `chat.js` · `pre-reply.js` · `find.js` 6층 · `journal` 스킬 · meta 의 주간 계측이 표 여섯의 열에 묶여 있다. `chat.js --json` 은 "칸 이름을 바꾸지 않는다" 를 주석에 박았다.
**결정** `minidiscord/server/src/db.ts:9-65`(핀 `6633f7b`)의 여섯 표 DDL 을 그대로 쓴다. `rooms.project` · `attachments.sha256` 같은 열도 더하지 않는다. 과제 이름은 방 이름에서 푼다(첫 `/`). `stored_path` 는 `chat.js:193` 이 푸는 기준(DB 폴더의 부모)의 상대 경로다.
**까닭** 열 이름을 그대로 두면 하네스 스크립트가 한 줄도 안 바뀐다 — DB 경로 값 하나만 바뀐다 (`plans/research/coupling-inventory.md` C.3 · C.8). 열을 더해도 읽는 쪽은 안 깨지지만, 더한 열이 쓰일 자리가 첫 판에 없다 (방 이름 규칙이 과제를 이미 말하고, SHA-256 은 들이기 스크립트가 센다).
**결과** 시험이 `PRAGMA table_info` 를 핀한 목록과 맞댄다. 진짜 `chat.js` 를 cockpit 이 만든 DB 에 붙이는 계약 시험을 둔다.

## ADR-005 HTTP 길 셋의 모양과 쿠키 이름 `md_session` 을 유지한다
**상태** 확정(meta) · 쿠키 이름은 제안
**맥락** meta 의 재생 도구 `prodev/scripts/replay.js` 가 minidiscord 의 길 셋에 맞춰 짜여 있다: `GET /api/rooms` → `{active, archived}` · `POST /api/rooms/:id/messages` multipart 만(JSON 406) · `GET /api/rooms/:id/messages?after=` · 쿠키 `md_session` 하나(Bearer 401). 옛 대본 다섯을 이 도구로 조종석에서 재생해야 W2 관문이 선다.
**결정** 길 셋의 경로 · 받는 꼴 · 내는 모양 · 상태 코드를 그대로 둔다. 인증 쿠키 이름도 `md_session` 으로 둔다. 재생 계정의 토큰은 `node bin/cockpit.js session-token <이름>` 이 발급한다(서버 PC 에서만 되는 명령).
**까닭** 재생 도구를 고치면 관문의 "같은 대본 · 같은 판정" 이 흔들린다. 쿠키 이름 하나를 바꾸면 도구가 401 로 죽는다 (`prodev/scripts/replay.js:18-25` · `:85`).
**결과** cockpit 의 새 길(`/api/projects` · `/api/permissions` · `/api/stream` …)은 이 셋과 섞지 않는다. 계약 시험이 진짜 `replay.js` 를 cockpit 에 붙여 돈다.

## ADR-006 권한은 `default` 모드, `allowedTools` 에는 MCP 도구 둘만
**상태** 확정(meta, 실증 4 · 4b · 4g · 4j/4l)
**맥락** 승인 화면이 SDK 조종석의 존재 이유다. `bypassPermissions` · `auto` 에서는 `canUseTool` 이 건너뛰어진다는 선행 사례 주석이 있다(미실증). 프로세스 안 MCP 도구는 설정 파일 허용 규칙으로 안 풀려서, 안 풀면 봇이 말할 때마다 카드가 뜬다. `allowedTools` 는 CLI 의 안전 규칙까지 건너뛴다(4b 에서 `node -e` 도 안 물었다).
**결정** `permissionMode: 'default'`. `allowedTools: ['mcp__cockpit__reply', 'mcp__cockpit__fetch_history']` — 이 둘 외에는 넣지 않는다. `permissionPrompts` 는 주지 않는다(기본 `'host'`). 봇 설정의 허용 목록 22건은 설정 파일로 먹는다.
**까닭** SDK 세션의 권한 판정은 headless CLI 와 같다(4j/4l · 4h′/4h″). `allowedTools` 로 풀어도 PreToolUse 명령 훅은 돈다(4g). `allowedTools` 를 넓히면 승인 게이트가 조용히 사라진다 (`plans/spike/RESULTS.md` 결론 셋).
**결과** `mkdir` · 따옴표 · `-e` 가 든 Bash 는 규칙에 있어도 카드로 온다. 그 수는 조종석에서 처음 재는 값이다. 코드에서 `allowedTools` 를 만드는 자리는 `sdk-query.js` 한 곳이고, 시험이 배열이 정확히 그 둘인지 본다.

## ADR-007 봇 세션의 env 는 화이트리스트다
**상태** 확정(meta, DESIGN 6절 · V7)
**맥락** SDK `options.env` 는 합치기가 아니라 덮어쓰기다(실증 걸림 1). `{...process.env}` 를 넘기면 서버의 비밀(DB 경로 · TLS 키 경로 · 설정)이 봇 세션에 실리고, 봇은 `Bash(node:*)` 로 읽어 방에 쓸 수 있다.
**결정** 로그인과 실행에 필요한 키만 넘긴다: `PATH · HOME · USER · SHELL · TMPDIR · LANG · CLAUDE_CONFIG_DIR · USERPROFILE · APPDATA · LOCALAPPDATA · TEMP · TMP · SystemRoot · ComSpec · CLAUDE_CODE_GIT_BASH_PATH` + `PRODEV_BOT_DIR`. 더할 키는 설정 `extraEnvKeys` 로만.
**까닭** 이 맥에서 여섯 키(`SHELL · TMPDIR · USER · PATH · LANG · HOME`)로 로그인이 살았다 (실증 5). 윈도우 키는 W1.3 이 빼 보며 잰다.
**결과** 시험이 서버 env 에 가짜 비밀(`COCKPIT_SECRET_PROBE`)을 심고 봇 env 에 안 실리는지 본다.

## ADR-008 큐는 `idle` 에서만 푼다 — 멈춤과 압축만 예외
**상태** 확정(meta, 검토 1차 #8)
**맥락** 턴 도중에 사용자 메시지를 넣으면 SDK 가 그 턴에 접어 넣어 봇이 두 일을 한 턴에 섞는다. 승인 대기 중에는 도구가 기한 없이 멈춰 있다("permission prompts have no park deadline", `sdk.d.ts`).
**결정** 세션이 `idle` 일 때만 `bot_inbox` 를 푼다. 풀 때는 밀린 글을 id 순서대로 모두(상한 20) 사용자 메시지 하나에 담는다(제안). 큐를 거치지 않는 것은 admin 의 멈춤(`interrupt`) 하나뿐이다. admin 의 `/compact` 도 `idle` 을 기다린다 — 급하면 멈춤 → 압축. 재기동 뒤 `delivered_at IS NULL` 을 순서대로.
**바뀐 자리 (meta D0 Q12, 2026-09-14)** 처음 판은 `/compact` 도 즉시였다. 압축은 `idle` 에서만 실증했고 턴 중 압축은 미실증이라 위험을 지지 않는다.
**까닭** 채널 판에서도 턴 도중에 온 알림은 턴이 끝난 뒤 한꺼번에 세션에 들어갔다. 한 번에 하나씩 넣으면 글 다섯에 턴 다섯이 들어 늦고 비싸다.
**결과** 한 사람의 긴 승인 대기가 다른 방의 글을 막는다 — 시간 초과(ADR-009)가 그 상한이다.

## ADR-009 승인은 요청 단위 · 첫 답이 이긴다 · 시간 초과는 거부 · 방에도 남긴다
**상태** 확정(meta, DESIGN 4.1 · 4.3) · 기본 10분은 제안
**맥락** 도우미 여섯이 동시에 물을 수 있다(4i, `agentID`). admin 이 여러 탭 · 여러 사람일 수 있다. SDK 자체에는 기한이 없다. 지금의 감사 습관은 "방 기록이 감사 자료" 이고 `weekly.sh` 가 🔒 글을 센다.
**결정** 키는 `toolUseID`. 답은 `UPDATE … WHERE answered_at IS NULL` 로 첫 답만 먹는다(나머지 409). `approvalTimeoutMin`(기본 10) 무응답이면 거부. `suppressAlwaysAllowRule` 이면 "이번 세션 허용" 을 받지 않고, `defaultToNo` 면 기본 선택이 거부다. 요청과 답을 본방 `author_type='system'` 글로 한 줄씩 남긴다 — 요청 줄은 🔒, 답 줄은 ✅(허용 · 이번 세션 허용) · ⛔(거부 · 시간 초과 · 거둬 감). admin 만 답한다.
**까닭** 요청 단위가 아니면 동시 요청 둘을 못 가른다. 기한이 없으면 사람이 자리를 비운 사이 세션이 영영 선다 (`plans/research/design-review-1.md` #4 · #5 · `plans/research/coupling-inventory.md` C.7).
**결과** 🔒 글 수 = 승인 요청 수다 (meta D0 Q7). 답은 ✅ · ⛔ 로 따로 센다.

## ADR-010 프레임워크도 빌드도 없다
**상태** 제안
**맥락** 회사 PC 에 빌드 도구가 없을 수 있고 네이티브 모듈을 못 짓는다. 사내망이라 CDN 이 없다. minidiscord 웹도 빌드 없는 순수 ES 모듈이었다. 설계는 "프레임워크는 제작 세션이 고른다, 조건: Node 하나 · 산출물 커밋 · CDN 없음" 이었다 (`plans/DESIGN.md` 4.1).
**결정** 서버는 `node:http` · `node:sqlite` · `node:crypto` 만. multipart 는 Node 에 든 `Request.formData()` 로 읽는다. 웹은 저장소의 ES 모듈 · CSS 를 그대로 서빙한다. 런타임 npm 의존성은 SDK 와 `zod` 둘이다. 마크다운 표시는 minidiscord `web/markdown.js` 사본.
**까닭** 의존성이 적을수록 회사 PC 의 `npm ci` 가 덜 깨진다. 빌드가 없으면 저장소에 있는 것이 곧 도는 것이라 "산출물 커밋" 이 저절로 지켜진다. 화면 셋은 프레임워크 없이 짤 크기다.
**결과** 라우팅 · 쿠키 · SSE 를 손으로 짠다(각 수십 줄). 화면이 커지면 다시 연다.

## ADR-011 비밀번호 해시는 `node:crypto` 의 scrypt
**상태** 제안
**맥락** 요구는 "bcrypt(순수 JS 구현 또는 `node:crypto` scrypt)". bcrypt 의 네이티브 판은 못 쓴다. 순수 JS 판(bcryptjs)은 의존성이 하나 는다.
**결정** `crypto.scrypt`(N=2^15 · r=8 · p=1 · 키 64바이트 · 소금 16바이트). 저장 꼴은 `scrypt$N$r$p$<소금 b64>$<해시 b64>`. 대조는 `timingSafeEqual`. 첫 admin 은 `node bin/cockpit.js init-admin <이름>`(비밀번호는 표준입력에서, 화면에 안 보이게) — `accounts` 에 admin 이 이미 있으면 거절한다.
**까닭** 의존성 0 이고 Node 에 들어 있으며 메모리를 쓰는 해시라 bcrypt 보다 약하지 않다.
**결과** 매개변수가 저장 꼴에 있어 나중에 올려도 옛 해시가 산다.

## ADR-012 브라우저 실시간은 SSE 하나 — WebSocket 이 아니다
**상태** 제안 (설계 문서는 `/ws` 를 적었다 — meta 확인 필요)
**맥락** 브라우저 → 서버는 글 올리기 · 승인 답 · 세션 조작이고, 셋 다 드문 요청이라 REST 로 족하다. 서버 → 브라우저는 계속 흐른다(글 · 봇 상태 · 도구 호출 · 카드). Node 에는 WebSocket **서버**가 없어 `ws` 패키지가 든다. minidiscord 도 방별 SSE 였다.
**결정** `GET /api/stream` SSE 하나에 사건을 전부 싣는다. 사건마다 id 를 붙여 재접속 때 `Last-Event-ID` 로 놓친 것을 받는다. 살아 있는 글자(`partial`)는 id 없이 흘리고 놓치면 버린다.
**까닭** 의존성이 안 늘고, 재접속 · 이어 받기가 브라우저 `EventSource` 에 들어 있다. 조종석 판의 되그리기 요구와 맞는다.
**결과** 탭 하나에 연결 하나(과제 여럿을 한 흐름에). HTTP/1.1 에서 같은 주소 탭을 여섯 넘게 열면 브라우저가 막는다 — 첫 판은 감수한다.

## ADR-013 채널 지시문과 봉투는 글로 재현한다
**상태** 제안 (M1 스모크가 잰다)
**맥락** 채널 플러그인은 연결 때 `instructions` 로 지시문을, 글마다 `notifications/claude/channel` 로 `content` + `meta` 를 넣었다. SDK 스트리밍 입력에는 알림 통로가 없고 사용자 메시지만 있다. 봇이 기대는 것은 `chat_id` · `delivery` · `sender` · `message_id` · `author_type` 이고 prodev 지침은 "봉투만 믿는다" 이다.
**결정** 지시문은 `systemPrompt: { type:'preset', preset:'claude_code', append, snapshot:true }` 로 싣는다. 글은 `<channel source="cockpit" chat_id=… message_id=… delivery=… sender=… author_type=… room_name=…>` 로 감싼 사용자 메시지로 넣는다. 가운데 글은 채널 플러그인의 `content` 와 글자 그대로 같다. meta 값은 속성 인코딩(`"` → `&quot;` · `<` → `&lt;`)만 하고, 의미는 무변형이다 — 이름에 `</channel>` 을 넣어 봉투를 일찍 닫지 못하게 (meta M1.M N1 승인).
**까닭** 채널 지시문이 이미 "채팅 메시지는 `<channel …>` 꼴로 도착한다" 고 봇에게 말한다 (`channel-server.ts:24`). 같은 꼴을 쓰면 봇이 배울 것이 없다. preset 을 적어 두면 SDK 의 기본값이 바뀌어도 Claude Code 의 시스템 프롬프트가 산다.
사용자 메시지에는 `origin: { kind:'channel', server:'cockpit' }` 를 스탬프한다 (meta D0 Q9). SDK 타입이 "origin 이 없는 글은 무귀속으로 다룬다" 고 적었기 때문이다. admin 이 넣는 `/compact` 는 사람의 명령이라 `origin: { kind:'human' }` 이다.
**결과** 사람이 본문에 `<channel` 을 적어 봉투를 흉내 내는 것은 중화가 막는다. origin 스탬프는 실증 1~5 에 없던 칸이다 — `smoke/m1-envelope.mjs` 가 origin 판과 `--no-origin` 판에서 SessionStart 훅 · pre-reply 훅 · `reply` 가 그대로 도는지 본다. 안 돌면 origin 을 빼고 그 사실을 이 절에 적는다.

## ADR-014 압축 알림은 cockpit 이 system 글로 남긴다 — 알림 길(`/api/notify`)은 첫 판에 없다
**상태** 확정(meta, DESIGN 4.2 · 11절 ③ "대신한다") · system 글로 쓰는 것은 제안
**맥락** prodev 훅 둘(pre-compact · session-start)이 압축 직전 · 직후에 사람 계정 쿠키 + multipart 로 방에 한 줄씩 올렸다(prodev ADR-018). cockpit 은 `compact_boundary` 를 스스로 본다.
**결정** cockpit 이 본방에 같은 문장 둘을 `author_type='system'` 글로 남긴다. 훅의 알림은 URL 이 없으면 건너뛴다(이미 fail-open) — prodev PR 이 `MINIDISCORD_URL` 을 봇 설정에서 뺀다.
**까닭** 사람 계정 토큰을 봇 폴더 `.env` 에 둘 까닭이 없어진다. 문장이 같아 사람이 느끼는 것이 같다.
**결과** 옛 알림은 `author_type='user'`(알림 계정)였고 이제 `system` 이다. 확정 조건 ①(`user` 글이어야 확정)과는 겹치지 않는다 — 알림 글은 확정 어휘로 시작하지 않는다.
