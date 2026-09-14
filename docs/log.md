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

## 2026-09-14 — M2 웹 · 계정 · 채팅 판 · 승인 카드 (M2.M = W2 관문 전)

새 세션이 M2.md 를 읽고 이어받았다. 태스크마다 커밋했다: M2.1 a32d53d · M2.2 3bae270 · M2.3 1973929 · M2.4 fbdb821 · M2.7 7415076 · 스모크와 M1 잔여 a3a8a9e · M2.5 a534882 · M2.6 cf7e310. `npm test` 118건 실패 0 건너뜀 0. TASKS M2 절의 끝 조건 시험 이름 38개를 통과 줄과 스크립트로 맞대 못 찾은 것 0.

W2 관문에 필요하다고 한 넷: `serve --config` 로 서버가 뜬다 · `session-token` 이 `md_session` 값을 낸다 · 길 셋이 minidiscord 모양이다 · `open-project` 가 방 둘을 만든다. 진짜 `prodev/scripts/replay.js` 를 cockpit 서버에 붙인 계약 시험(`test/contract/replay-js.test.js`) 다섯이 초록이다. 진짜 CLI 로 스크래치 설정에서 `check → open-project → init-admin · add-user → session-token → serve` 를 돌리고 curl 로 길을 찔러 봤다 (as-built 4절).

막힌 것 · 고친 것:
- 스크래치 serve 에 curl `-F 'body=@TO(…)'` 로 올린 글이 빈 응답이었다 — curl 이 `@` 를 파일 올리기로 읽은 것이다. `--form-string` 으로 다시 찔러 200 을 봤다. 서버 쪽 고칠 것은 없었다.
- 시험의 날 경로 요청이 한글 경로(`/없는.js`)에서 Node 클라이언트 오류를 냈다. 경로를 인코딩했다.
- M1 의 `rt.close()` 가 세션을 `stopped` 로 적어, 서버를 껐다 켜면 resume 대상이 없었다. `manager.release` 를 두어 상태를 그대로 두고 닫는다.
- 카드 DOM 의 오류 줄이 빈 글이라 안 만들어졌다. 따로 만들었다.
- `m1-guard` 를 1000자 직접 판으로 바꿔 haiku 로 돌렸더니 봇이 947자 reply 를 시도했고 훅이 막았다 (`ATTEMPTED_OVER_900 yes` · `HOOK_BLOCKED yes` · 긴 봇 글 0). M1 잔여의 "재현 불가" 기록은 필요 없게 됐다.

스스로 정한 것 (as-built 5절에 까닭):
- `serve --start <과제>` 를 두었다 — 세션 조작 길(M3.3) 전에 W2 재생에서 세션을 켤 길이 필요하다.
- `session-token` 은 계정이 있어야 낸다. 재생 계정도 `init-admin` · `add-user` 로 먼저 만든다.
- 커밋 순서를 M2.7 → M2.5 → M2.6 으로 — 화면이 `GET /api/projects` 에 기댄다.
- 거절된 글의 첨부 파일은 지운다(minidiscord 는 남겼다). JSON 길의 틀린 content-type 은 415. SSE 사건 `project_opened` 를 더했다.
- 카드는 `defaultToNo` 면 거부 단추를 맨 앞에 두고, 뜰 때 초점을 옮기지 않는다.
- `web/card.js` · `src/http/respond.js` 두 파일을 설계 목록 밖에 더했다.

새 질문 (meta 에):
- **N7 "이번 세션 허용" 이 영구 규칙을 쓴다.** `m2-approval` 판 3 에서 SDK `suggestions` 의 `destination` 이 `localSettings` 였고, 설계대로 그대로 돌려주자 봇 폴더 `.claude/settings.local.json` 에 `Bash(curl --version)` 허용이 남았다. 고를 길: (가) 그대로 두고 단추 이름을 "이 봇에 늘 허용" 으로 · (나) 돌려줄 때 `destination` 을 `session` 으로 바꿔 이름대로 · (다) 단추를 빼기. 제작 세션의 권고는 (나). 답이 올 때까지 코드는 설계 그대로다. 실제 봇 폴더로 재생할 때 이 단추를 누르면 그 폴더에 규칙이 남는다.
- **N8 W2 재생의 봇 폴더.** prodev PR(W2.9) 전의 실제 `prodev/bots/` 설정은 도구 이름이 `mcp__minidiscord-channel__*` 라 pre-reply 훅 matcher 가 cockpit 의 `reply` 에 안 걸린다. 재생을 W2.9 뒤에 하는지, 스모크처럼 설정 사본(`smoke/lib.mjs` `makeScratch` 방법)으로 하는지 정해 주기를 바란다.
- **N9 `serve --start` 로 세션을 켜는 것**이 W2 에 괜찮은가 (M3.3 전의 임시 길).
- **N10 ADR-012 (SSE 하나)** 는 아직 "제안 · meta 확인 필요" 다. M2.3 을 그대로 만들었다.

**M2.M 뒤 (W2 재생 중, meta 알림 — 기록만, 코드는 판정 뒤 M3 지시로)**: N7 답 (나)를 b7b6263 으로 넣었다. meta 가 재생 중에 가른 사실: headless/SDK 세션은 프로젝트 `.claude/settings.json` 의 `permissions.allow` 를 읽지 않고(Bash 접두 · Edit/Write 경로 · `Write(**)` 모두 거부), 같은 규칙을 `.claude/settings.local.json` 에 두면 먹는다. 훅 · env 는 `settings.json` 에서도 실린다. 그래서 prodev 허용 목록 22건(setup.js 가 settings.json 에 씀)이 조종석에서 안 먹고, W2 재생의 과제 폴더 Read · Write 가 카드로 왔으며, M1 N2(uploads Read 콜백)도 같은 원인이다. 실증 4e · 4j 의 "규칙이 먹는다" 는 규칙 없이도 통과하는 안전 명령을 본 것이었다. 고칠 자리는 prodev PR(W2.9: 허용 · 거부를 settings.local.json 에). cockpit 쪽(`smoke/lib.mjs` makeScratch · `check` 가 그 파일을 보기)은 판정 뒤 지시를 기다린다. 덧: M2 `m2-approval` 판 4 에서 재요청이 0 이었던 것은 판 3 의 답이 바로 그 `settings.local.json` 에 규칙을 써서였을 수도 있다 — b7b6263 뒤(session 으로 돌려줌)에도 재요청 0 인지는 다시 재야 한다.

## 2026-09-14 — W2 반려 · 고침 셋(W2r) · prodev PR #17 (W2 재측정 전)

**W2 판정 반려** (meta 기록). cockpit 자체 열 칸은 전부 ○, 옛 대본 재생 21/33(옛 관문 26/33). 지시 `instructions/W2-refix.md`. 답: N7 (나) · N8 스크래치 사본으로 재생 · N9 괜찮음 · N10 ADR-012 채택.

커밋: N7 · N10 b7b6263 · W2r.1 df5e76a · W2r.3 1ca9db1 · W2r.2 1c60e03. `npm test` 123건 실패 0 건너뜀 0.
- W2r.1 큐: 글은 `idle` · `working` · `waiting_approval` 에서 곧바로 배달, `/compact` 만 `idle` 대기. 압축 턴 동안은 글을 붙잡는다(제작 세션이 정함 — 턴 중 압축은 미실증이라). 모의 SDK 도 턴 도중의 글을 그 턴에 접게 고쳤다. 재기동 시험은 "턴 도중 글이 큐에 남는다" 에 기대고 있어, 서버가 죽은 뒤 글을 넣게 바꿨다.
- W2r.2 값: 덮어쓰기.
- W2r.3 스크래치: `smoke/scratch.mjs`(SDK 없음)로 갈라 `<스크래치>/prodev/bots/<봇>` 배치. permissions 는 `settings.local.json`. prodev 에 `settings.local.template.json` 이 있으면 그것을 쓴다 — PR #17 worktree 로 `COCKPIT_PRODEV_DIR` 를 돌려 스크래치 · 계약 시험이 도는 것을 봤다.
- `m2-approval` 재판: `LOCAL_SETTINGS_CHANGED no []` · `REASKED_AFTER_SESSION_ALLOW 0` · `BASH_RAN_AFTER_SESSION_ALLOW yes`. 지시의 "settings.local.json 이 없어야 한다" 는 스크래치(와 PR 뒤 setup.js)가 그 파일에 허용 목록을 쓰므로 "스모크 동안 바뀌지 않아야 한다" 로 옮겼다 (smoke/README).

**prodev PR #17** (`cockpit-w2`, worktree `../prodev-wt-cockpit/`, 제작 세션의 도우미가 만들었다): 권한은 `settings.local.template.json` → `settings.local.json` · 도구 이름 `mcp__cockpit__*` · `.mcp.json` 안 만듦 · 토큰 없앰 · `MINIDISCORD_URL` 빈 값 · `setup.js` 가 `cockpit.json`(`--cockpit` → `COCKPIT_CONFIG` → `<루트>/cockpit/cockpit.json`)에서 `chat.db` · `cockpit.db` · `uploadsDir` 를 읽음 · deny 에 cockpit.db 셋과 `settings.local.json` Edit · `rooms`/`archive` 는 cockpit 안내 뒤 exit 1 · `cron` 지움 · charter/close 스킬이 없는 명령을 안 부르게 · ADR-038 · launch 4절. 그 worktree 에서 `npm test` 140/140 · `test:server` 18/18 (133 · 25 에서 달라진 까닭은 PR 본문).

새 질문: 없음. 알릴 것 — PR 뒤 `setup.js` 를 다시 돌리면 `settings.local.json` 을 통째로 덮어써 손으로 더한 규칙이 사라진다(ADR-038 에 적힘).

알고 두는 것: 화면은 브라우저에서 눌러 보지 않았다 (순수 함수 · 정적 검사 · 서버가 파일을 내는 것까지). `m2-compact` 에서 PreCompact 훅은 hook 사건으로 안 보였지만 인수인계서는 생겼다. 스모크 값 합 약 $0.32 (haiku 셋).

**세션 끝 (2026-09-14, W2r)**: W2 재측정 조건부 통과(meta — cockpit 10/10 · 옛 대본 넷 27/33 · PR #17 검수 통과, 머지는 사람). 이 세션의 마지막 상태는 cockpit 커밋 5293a4b · 작업 트리 깨끗 · prodev PR #17 열림(머지 전). 다음 세션은 `meta/prodev-review/plans/2026-09-14-web-cockpit/instructions/M3.md` 부터 읽는다.

## 2026-09-14 — M3 조종석 판 · 파일 판 · 세션 조작 · 재기동 (W3 관문 전)

새 세션이 `instructions/M3.md` 를 읽고 이어받았다. 그 6절대로 prodev PR #17 은 머지됐지만(origin/main ac3ecc9) 본 체크아웃이 안 당겨져 있어 스크래치 · 계약 시험은 `COCKPIT_PRODEV_DIR=../prodev-wt-cockpit` 로 돌렸다.

커밋: M3.0 21f73ca · M3.1 22cada0 · M3.4 4c893ad · M3.3 b794f21 · M3.2 bdd6a77 · M3.5 c273740 · M3.6 발견(값 바닥) ea0de0d · M3.6 스모크 · M3.M 준비 d0c1aa5 · 문서(이 절). `npm test` 154건 실패 0 건너뜀 0. prodev 두 번째 PR **#18** (`cockpit-m3`, worktree `../prodev-wt-cockpit/`).

- **M3.0 ①** 즉시 배달 뒤 `idle` 로 보이던 것: 턴 도중 넣은 글을 SDK 가 result 뒤 새 턴으로 이어 돌면 큐가 비어 상태가 안 바뀌었다. `idle` 에서 `assistant` · `stream_event` · `tool_result` 가 오면 `working`.
- **M3.0 ②** `PRODEV_BOT_DIR` 은 cockpit 이 M1 부터 봇 env 에 넣고 있었다(시험을 세션 관리자 층에 하나 더). 새던 자리는 prodev `find.js` — `<__dirname>/../bots/<PRODEV_BOT>/find.log` 라 링크된 `scripts/` 에서 worktree 로 갔다. PR #18 이 `PRODEV_FIND_LOG > PRODEV_BOT_DIR > <repo>/bots/<PRODEV_BOT>` 로 고친다. 인수인계서는 훅 `places.js` 가 그 키를 먼저 보아 스크래치에 생긴다(`m2-compact` `HANDOFF_AT scratch`).
- **M3.0 ③** `smoke/README` 의 `LOCAL_SETTINGS_CHANGED no` 는 그대로 두었다.
- **M3.1** 사건 칸을 채웠다(걸린 시간 · 도우미 집합 · 문맥 사용률 · 경고) · `GET /api/projects/:name/events` · 머리 두 칸(`model` · `context_pct`).
- **M3.3** 다섯 길 + 도우미 멈춤. 설계 5.2 의 "`backgroundTasks()` 목록" 은 SDK 에서 목록이 아니라 앞 작업을 뒤로 보내는 호출이었다 — 목록은 `background_tasks_changed` 의 마지막 집합으로, 확인은 `?confirm=1` · 409 `TASKS_RUNNING`. ARCHITECTURE 5.2 를 고쳤다.
- **M3.4** 파일 판 길 두 개와 화면 조각. **M3.2 · M3.5** 조종석 판 · 탭 · 판 셋 · 압축 경계, `app.js` 에 이었다.
- **M3.6** `smoke/m3-restart.mjs` — serve 를 자식 프로세스 묶음으로 띄워 묶음째 SIGKILL.
- **M3.M 준비** `m2-compact` · `m3-restart` 가 serve + admin API 로 돈다(`smoke/server.mjs`). API 모양은 ARCHITECTURE 8.3.

막힌 것 · 고친 것:
- 시험 셋이 내 기대값 실수로 처음에 빨갛다(사건 순번 · 바이트 크기) — 시험을 고쳤다. 코드 쪽 고칠 것은 없었다.
- 스모크 재판 하나가 셸 작업 폴더가 `crew-workspace` 로 돌아가 `MODULE_NOT_FOUND` 로 곧바로 끝났다(세션을 안 띄움). 절대 경로로 다시 돌렸다.
- **값이 프로세스마다 누적이었다.** `m3-restart` 첫 판에서 `COST_USD 0.0102` 가 너무 작아 스크래치 `session_events` 를 열었다: 앞 프로세스 `result` $0.0319(3턴) → resume 뒤 새 프로세스 `result` $0.0102, `agent_sessions.cost_usd` $0.0102. SDK `total_cost_usd` 는 CLI 프로세스마다 0 에서 다시 쌓인다. 켤 때 적힌 값을 바닥으로 얹게 고쳤다(ea0de0d, 시험 `CLI 프로세스가 바뀌어도 cost_usd 는 앞 프로세스 값 위에 쌓인다`). **meta 확인 필요** — W2r.2 규칙은 한 프로세스 안에서 그대로다.

스모크 (haiku · 스크래치 · 판정 아님, 요지는 as-built 4절 — 두 스크립트 모두 두 판씩, 재판은 커밋 d0c1aa5 판):
- `m3-restart` 재판: `RESUMED session_id=<같은 uuid>` · `REDELIVERED 2` · `BOT_REPLIES_AFTER_RESTART 2` · `STOP_API 200 stopped` · `START_API_AGAIN 200 idle same_session=yes` · `CONTEXT_PCT 13` · 값 $0.0231 (스크래치 `result` 두 행 $0.0135935 + $0.0095309 와 같다 — 값 바닥이 먹는다) · exit 0.
- `m2-compact` (serve + admin API) 재판: `COMPACT_API 200 queued=false` · `COMPACTED yes` · `SYSTEM_MESSAGES 2` · `HANDOFF 정상` · `HANDOFF_AT scratch` · `STOP_API 200 stopped` · 값 $0.0544 · exit 0.
- 스모크 값 합 약 $0.17 (haiku 넷).

스스로 정한 것 (as-built 5절에 까닭): `stop` 은 언제나 200 · `start` 못 켜면 502 · 멈춤 · 끄기 · 다시 켜기가 조종석 쪽에서도 걸린 승인 요청을 거둬 감 · `duration_ms` 는 조종석이 잰다 · 파일 판은 점 이름을 뺀다 · 압축 경계는 방 글에서 그린다 · `serve --no-origin`.

새 질문 (meta 에):
- **N11 값 바닥.** 위 고침(켤 때 적힌 값 + 프로세스 누적)이 meta 의 값 계측 뜻과 맞는가. 맞지 않으면 되돌리고 "프로세스마다 누적" 을 as-built 에 걸림으로만 둔다.
- **N12 prodev PR #18** 머지 전에는 W3 재생 스크래치의 `COCKPIT_PRODEV_DIR` 을 `../prodev-wt-cockpit`(가지 `cockpit-m3`)로 둘지. worktree 가 이제 #17 가지가 아니라 #18 가지다.
- **N13 화면 확인.** 조종석 판 · 파일 판은 브라우저에서 눌러 보지 않았다. W3 채점표에 화면 칸이 있으면 사람이 한 번 눌러 볼 자리가 필요하다.

## 2026-09-14 — M4 윈도우 · 설치 · 문서 (M3.M 통과 뒤)

**M3.M 통과** (meta: cockpit 열 칸 전부 ○ · R5 8/9 · 승인 재측정 R2+R4 합 4). 답: N11 값 바닥 인정(ARCHITECTURE 5.3 에 한 줄 + 도우미 값 포함 여부) · N12 PR #18 검수 통과, 이 절 도중에 머지됨(origin/main 1e02367, 본 체크아웃 당겨짐) — 그 뒤 스크래치 · 시험은 기본 `../prodev` · N13 화면은 사람이 회사 PC 설치 때 눌러 본다(설치 문서 마지막 걸음), 브라우저 스모크는 넣지 않음.

커밋: M4.1 6ac834c · 더함① ecd65bc · M4.2 3a32bdd · M4.3 c618c56 · 더함②③ f370c84 · 문서(이 절). `npm test` 158건 실패 0 건너뜀 0 (기본 `../prodev`, 직접 실행).

- **M4.1** 윈도우 건너뜀은 심볼릭 링크를 그 기계에서 만들어 보고 가른다(`test/fakes/platform.js`). 통째로 건너뜀 둘(`과제 폴더 밖을 가리키는 심볼릭 링크 404` · win32 의 `check — claudePath 를 불러 판을 낸다`), 링크 칸만 빠짐 셋 — 이름은 as-built 4.1. `COCKPIT_TEST_NO_SYMLINK=1` 로 이 맥에서 그 길을 돌려 157 중 156 통과 · 1 건너뜀 · 실패 0. 스크래치 폴더 링크는 윈도우에서 junction. **윈도우 실측은 사람이 회사 PC 에서.**
- **M4.2** `check` 가 `claudePath --version` 을 불러 `✓ claudePath <판> — <경로>`. `docs/INSTALL-WINDOWS.md` 번호 걸음 12 (`grep -c '^[0-9]\+\. '` = 12) · 걸음마다 확인 명령 · PowerShell 한 줄 · 마지막 걸음 브라우저 판 셋.
- **M4.3** `smoke/m4-sessions.mjs` — 이 맥 haiku 판: `RSS_MB` 0~5분 서버 58.2~84.1MB · 자식 합 477.2~832.8MB(자식 셋) · 값 $0.0906 · exit 0.
- **더함** ① 윈도우 env 키 여섯 시험 ② ARCHITECTURE 5.3 값 한 줄 — SDK 0.3.270 형 정의상 `total_cost_usd` 는 도우미(Task 서브에이전트) · 사이드체인 · 압축을 포함, 파이프라인 밖 호출(권한 분류기 등)은 뺀다(형 정의를 읽은 것, 실측 아님) ③ README 쓰는 법 맥 · 윈도우.
- **M4.4** as-built 를 절 여섯(폴더 나무 · 표 둘 · API · 시험 묶음과 건수 · 설계와 다르게 된 자리 · 알고 두는 것)으로. `tool_use` 입력 요약 "200자 뒤 줄임표 한 자" 를 적음(meta M3.M 3절).
- 공용 스모크 도우미를 고친 뒤 `m3-restart` 를 기본 `../prodev` 로 다시 돌림: 같은 세션 resume · 재배달 2 · 답 2 · 끄고 켜도 같은 세션 · exit 0.

스스로 정한 것: 링크가 전부가 아닌 시험은 통째로 건너뛰지 않고 링크 칸만 뺀다 · `check` 는 claudePath 가 없으면(맥) `·` 한 줄 · `server.mjs` 가 윈도우에서 `taskkill /T /F`.

새 질문 (meta 에):
- **N14 프록시 env.** 화이트리스트에 `HTTPS_PROXY` · `HTTP_PROXY` · `NO_PROXY` 가 없다(M4 시험이 그것을 못 박았다). 회사망이 프록시를 거쳐야 Claude 에 닿으면 봇 세션이 못 뜬다. W1.3 결과로 `extraEnvKeys` 에 넣을지, 기본 목록에 넣을지.
- **N15 `m4-sessions` 의 윈도우 갈래**(`powershell.exe Get-CimInstance` · `taskkill`)는 문법만 봤다. 회사 PC 판이 첫 실행이다.

## 2026-09-14 — M4.M 맥 조건부 통과 · 윈도우 실측 대기

**M4.M 맥 조건부 통과** (meta: 맥에서 되는 여덟 칸 전부 ○ — 사본 `npm test` 158/158 · `check` 네 설정 · INSTALL-WINDOWS 걸음 12 · m4-sessions 서버 최대 91 MB · 자식 셋 최대 824 MB · env 키 · as-built 절 여섯 · 문서 정합 · 값 주석). 윈도우 실측 넷(`npm test` · `check` · `m1-hello` · `m3-restart`)은 사람이 회사 PC 에서 돌려 meta 에 준다 — 그것이 오기 전에는 M4 가 닫히지 않는다.

답: **N14** 프록시 env 는 지금 고치지 않는다 — INSTALL-WINDOWS 6번에 `extraEnvKeys` 한 줄만 넣었다(문서만). **N15** 회사 PC 첫 실행에서 깨지면 사람이 출력을 meta 에 주고 meta 가 지시로 넘긴다.

하지 않은 것 (지시대로): 윈도우 실측을 흉내 내지 않았다 · 브라우저 스모크를 만들지 않았다 · `../prodev-wt-cockpit` 을 지우지 않았다(사람이 정리).

**세션 끝 상태 (2026-09-14)**
- 마지막 커밋: 이 절과 INSTALL-WINDOWS 한 줄을 넣은 docs 커밋 (그 앞 코드 · 문서 커밋은 59f3523). 작업 트리 깨끗. `npm test` 158/158 (기본 `../prodev` = 1e02367).
- 형제: prodev PR #17 · #18 머지됨. `../prodev-wt-cockpit` 은 가지 `cockpit-m3` 로 남아 있다(쓰지 않음).
- 이 세션은 여기서 멈춘다. **다음 제작 지시는 사람의 회사 PC 결과가 온 뒤다.**
- 다음 세션이 읽을 파일: meta 가 새로 주는 `meta/prodev-review/plans/2026-09-14-web-cockpit/instructions/` 의 다음 지시문 → 이 파일(`docs/log.md`)의 M3 · M4 절 → `docs/as-built.md`(절 여섯, 4.1 윈도우 건너뜀 표) → `docs/TASKS.md` M4 절 → `docs/INSTALL-WINDOWS.md`(회사 PC 결과를 대조할 걸음).

## 2026-09-14 저녁 — v2 회차 D0-v2 문서 개정 (속은 cockpit, 겉은 minidiscord)

**무엇이 정해졌나 (사람).** 속은 cockpit, 겉은 minidiscord 화면(디자인 토큰 그대로). 방 하나 = 과제 하나 = 전용 봇 하나, files 방은 없다. 봇에게 가는 글은 `@TO` · `@CC` 뿐, 첨부는 부른 글의 것만 + 따라잡기, 조종석은 오른쪽 접이식 판(member 접힘 · admin 펼침), 봇 없는 방은 첫 판에 없다. 지시 `meta/prodev-review/plans/2026-09-14-web-cockpit/instructions/D0-v2.md`, 요구는 같은 `plans/` 의 `2026-09-14-cockpit-후속/AS-IS-TO-BE-v2.md`(R9~R14) · `DIRECTION-v2.md`. 이 회차는 **문서 다섯과 이 파일만** 고친다 — 코드 · 시험 · 스모크 · prodev · minidiscord 는 안 건드렸다(읽기만). `as-built.md` 는 코드 뒤라 안 고쳤다.

**읽은 것.** 지시문 · AS-IS-TO-BE-v2 · DIRECTION-v2 · 후속 README(3.2 · 3.3 · 3.5 맞물림) · 문서 다섯 · as-built. 실물 대조: minidiscord `web/`(`app.js` 의 `/api/` 호출 14곳 · `rich.js` · `index.html` · `style.css` 머리 · 토큰 34) · minidiscord 서버 길(`routes-rooms.ts` · `routes-events.ts` · `targets.ts`) · cockpit `chat-db.js` · `tools.js` · `routes-projects.js` · `server.js` CSP · prodev `setup.js`(봇 이름 · 자리) · 하네스 11곳의 줄. meta 의 예측(`PREDICTIONS-v2.md`) · 채점표 · fixtures · runs 는 읽지 않았다.

**커밋** (ADR 먼저, 본문은 그 다음 — 지시 2절 순서):
- d4f71d5 ADR-015~020 · ADR-005 · 010 에 "일부 대체됨"
- 3dcae38 PRD — F2 · F3 · F15 를 v2 로(옛 글에 대체됨) · F19~F23 · N13
- 8b29c3b ARCHITECTURE — 4.3 · 4.6 방 만들기와 되돌림 · 4.7 이관 · 7 화면 · 8.4 길 15 · 11.1 prodev 고칠 자리 11
- 이 절을 넣은 docs 커밋 — TASKS M5 · VERIFICATION M5.M · log

**새 ADR 여섯.** ADR-015 방 하나(옛 files 방은 보관으로 이관) · ADR-016 화면 계승(minidiscord `web/` 다섯 파일 사본, 토큰 · `rich.js` 무변경) · ADR-017 방 만들기 = 봇 생성(`POST /api/rooms` 가 prodev `setup.js` 를 자식 프로세스로 부르고 실패하면 새로 만든 것만 되돌림) · ADR-018 `@` 규칙(봉투 없음 → 안 감 · 작성기 `@TO(봇)` 미리 채움) · ADR-019 접이식 조종석 판 · ADR-020 첨부 읽는 때(봉투는 그대로 · `fetch_history` 결과에 `attachments` 칸). v1 에서 뒤집히는 결정은 cockpit ADR 절로는 ADR-005 · 010 의 일부뿐이었다 — 나머지(방 둘 · 본방 봉투 없음 `to` · 화면 셋)는 PRD · ARCHITECTURE 본문에 있어 그 자리에 "대체됨" 을 붙였다.

**찾은 것 · 막힌 것.**
- **출처 sha `6633f7b` 가 minidiscord 저장소에 없다.** 지시문과 v1 문서 · 코드 주석이 이 번호를 핀으로 적었는데, 오늘 `git -C ../minidiscord log --all` 에도 crew-workspace 저장소에도 없다. minidiscord `HEAD` 는 `dfa33c3`, `web/` 다섯 파일의 마지막 변경은 `a44ecf8`(2026-09-11), v1 `markdown.js` 사본의 저장소 핀은 `dfa33c3`. ARCHITECTURE 7.1 에 사실과 기본값(옮기는 날 HEAD)을 적고 질문으로 올린다(Q1).
- **minidiscord `index.html` 의 인라인 스크립트는 cockpit CSP(`script-src 'self'`, `server.js:30`)에 막힌다.** 켜기 한 줄을 `web/boot.js` 로 옮기는 것을 7.3 고치는 자리에 넣었다. 작성기 썸네일의 `blob:` 은 `img-src` 에 있어 된다.
- **minidiscord `app.js` 는 목록을 `innerHTML = ''` 로 비운다(대입 여섯 곳, 모두 빈 문자열 — grep 한 아홉 줄 중 셋은 주석).** v1 정적 시험 `innerHTML 대입이 markdown.js 밖에 없다` 는 그대로 두면 사본에서 빨갛다 — M5.5 에서 "빈 문자열뿐" 으로 바꾸는 끝 조건을 적었다.
- **minidiscord `rich.js` 의 채팅 줄 승인 단추**는 minidiscord 브로커의 `승인하려면 "yes <id>"…` 줄에만 붙는다. cockpit 🔒 줄과 꼴이 달라 안 그려진다 — 파일을 안 고치고 시험 하나로 못 박기로 했다.
- **DIRECTION 2.3 의 `find.js` · `index.js` "방 이름 갈래"** 는 오늘 grep 으로 코드가 안 보인다(`files.md` 는 `inbox/*/files.md` 사이드카 이름). 11.1 9번에 "고칠 것이 없을 수 있다 — PR 에서 다시 대조" 로 적고 질문으로 올린다(Q2).
- `weekly.sh` 는 prodev 가 아니라 `meta/prodev-review/scripts/tools/` 에 있다 — 11.1 11번에 meta 몫으로 적었다.

**스스로 정한 것 (ADR 에 "제안" 으로 표시).**
- `POST /api/rooms {name}` 의 `name` 은 **과제 이름**, 방 이름은 `prodev-<name>` (방 이름 규칙 = 결합 재고 C.8 하드 계약). `prodev-` 로 시작하면 400.
- 방 만들기는 `setup.js` 를 **자식 프로세스로 부른다**(같은 일을 cockpit 이 다시 짜지 않는다 — 봇 설정의 진실을 prodev 한 곳에). 상한 60초. 되돌림은 요청이 새로 만든 폴더 · 행만, 요청 전에 있던 과제 폴더는 안 지운다.
- 설정 키 `prodevDir` 를 더하고 `botsDir` = `<prodevDir>/bots` 가 아니면 기동하지 않는다 — `setup.js` 가 봇 폴더를 자기 저장소 `bots/` 에 만들기 때문(`setup.js:316`).
- `POST /api/projects` · CLI `open-project` 는 없애지 않고 같은 처리기로(`--no-setup` 은 스모크 · 옛 봇 이름 재생용).
- 옛 files 방은 **보관**(옮기지도 합치지도 않음 — 카드 `source_msgs` · `confirmed_at` 이 글 번호에 묶여 있다). `migrate-v2` 명령, `serve` 는 경고만 하고 뜬다. `fetch_history` 는 옛 방을 읽을 수 있다.
- 방 봇 칩 · 자동완성의 재료는 `/api/rooms/:id/bots` 를 더하지 않고 `GET /api/projects` 에서 같은 모양으로 만든다(R13).
- `fetch_history` 입력 서명은 그대로, 결과의 `attachments` 는 첨부 있는 글에만(글만 있는 이력은 v1 과 바이트까지 같게).
- 옮긴 `app.js` 의 DOM 몸통은 jsdom 없이 — 잇는 판단을 `web/glue.js` 순수 함수로 빼고, "원본과 달라진 함수가 7.3 표의 것뿐" 을 정적 비교로 센다.
- SSE 사건 `project_opened` 를 `room_created` 로 이름을 바꾸고 `room_archived` 를 더한다.

**새 질문 (meta 에).**
- **Q1 출처 핀.** 옮기는 화면 파일 다섯의 "저장소 핀" 을 무엇으로 적나. 지시의 `6633f7b` 는 minidiscord 저장소에서 못 찾았다. 기본값은 옮기는 날의 minidiscord `HEAD`(오늘 `dfa33c3`) + 파일마다 마지막 변경 커밋(오늘 `a44ecf8`) + 원본 sha256. v1 문서 · 코드 주석의 `6633f7b`(`db.ts` · `channel-server.ts` 등)도 같은 번호라, 그것이 다른 저장소 · 옛 이력의 번호인지 알려 주면 주석을 맞춘다(코드는 M5 에서).
- **Q2 prodev 11곳의 9번.** `scripts/find.js` · `index.js` 에서 "방 이름 갈래" 코드를 오늘 grep(`roomParts` · `/files` · `갈래`)으로 못 찾았다. DIRECTION 2.3 이 가리킨 줄이 따로 있으면 알려 주기를 바란다. 없으면 PR 에서 "고칠 것 없음" 으로 적어 10곳이 된다.

**세션 끝 상태 (2026-09-14 저녁, D0-v2)**
- 작업 트리: 이 절의 커밋 뒤 깨끗. 코드 · 시험은 안 건드렸다 — `npm test` 는 이 회차에 돌리지 않았다(M4 판 158/158 그대로일 것, 추정).
- 다음: meta 의 D0-v2 판정 → 통과면 M5 지시. 다음 세션이 읽을 파일: 그 지시문 → 이 절 → `docs/ADR.md` ADR-015~020 → `docs/ARCHITECTURE.md` 4.6 · 7 · 8.4 · 11.1 → `docs/TASKS.md` M5 → `docs/VERIFICATION.md` 4.1.

## 2026-09-15 — M5 minidiscord 화면 · 방 하나 · 방 만들기 = 봇 생성 · 접이식 판 (M5.M 관문 전)

**D0-v2 통과** (meta: 열여섯 중 열다섯 ○ · 필수 여섯 ○). 돌려보낸 칸 하나 — as-built 에 "고친 자리 ↔ minidiscord 기준 ↔ cockpit 시험" 짝 표 (as-built 4.4 에 넣었다). 지시 `instructions/M5.md`. 답: **Q1** `6633f7b` 는 minidiscord `origin/main`(PR #10) — 이 맥 체크아웃이 뒤처져 있었고 meta 가 fetch 해 두었다. 사본은 `git archive`/`git show 6633f7b` 로 떴다. **Q2** find.js · index.js 는 고칠 것 없음, prodev 고칠 자리는 10곳.

**커밋** (태스크마다 하나, `npm test` 는 커밋마다 초록을 보고 넣었다):
- 81515e2 M5.0 설정 · 옛 files 방 이관 (164)
- bf1f158 M5.1 방 하나 · 봉투 규칙 (168)
- acfd4be M5.2 fetch_history 첨부 · 옛 방 읽기 (174)
- e87718e M5.3 방 만들기 = 봇 생성 · 되돌림 (187)
- 9ca2e43 M5.4 방 보관 · 봇 길 없음 (193)
- 8bc69fb M5.5 화면 옮기기 — 사본 다섯 (200)
- 291a7e8 M5.6 화면 잇기 — glue.js · app.js 7.3 자리 (209)
- 5c4aa11 M5.7 접이식 조종석 판 (213)
- 2926067 M5.8 v1 화면 파일 정리 (205 — 지운 시험 여덟만큼 줄었다)
- b1ca6e1 M5.9 스모크 v2 — m5-room · makeRoomScratch (206)
- 이 절 · as-built 를 넣은 docs 커밋 (M5.11)
- prodev **PR #19** (`cockpit-v2`, worktree `../prodev-wt-cockpit-v2/`, 커밋 9db7cac) — ADR-039

**`npm test`** 206건 · 실패 0 · 건너뜀 0 (기본 `../prodev` = 1e02367, 직접 실행). `COCKPIT_PRODEV_DIR=../prodev-wt-cockpit-v2 npm test` 도 206 · 0 · 0. prodev worktree `npm test` 144/144 · `test:server` 18/18 · 끝 조건 grep 0줄.

**스모크 여섯** (이 맥 · haiku · 스크래치 · 기본 `../prodev` = PR #19 전, 판정 아님 — 요지):
- `m5-room`: `ROOM_CREATE_API 201 room=prodev-smoke bot=prodev-smoke-bot setup_ms=68` · `ROOMS_FOR_PROJECT 1` · `BOT_DIR_SETTINGS_LOCAL yes` · `START_API 200 idle` · `PLAIN_MESSAGES 2 TARGET_ROWS 0 INBOX_ROWS 0` · `BOT_TURNS_AFTER_PLAIN 0` · `DELIVERED_AFTER_PLAIN 0` · `FETCH_HISTORY_CALLED yes` · `FETCH_HISTORY_HAS_ATTACHMENTS yes` · `READ_ATTACHMENT yes` · `BOT_REPLY message_id=4 "파일의 첫 줄은 다음과 같습니다: **lot,yield** …"` · `ARCHIVE_API 200 state=stopped` · `COST_USD 0.0402` · `ASKED []` · exit 0
- `m5-room --fail-setup`: `ROOM_CREATE_API 502` · `SETUP_ERROR "setup 실패: 오류: 스모크 --fail-setup 대역 — 일부러 exit 1"` · `ROLLBACK_BOT_DIR_EXISTS no` · `ROLLBACK_PROJECT_DIR_EXISTS no` · `ROLLBACK_ROWS 0` · `ASKED []`
- `m1-hello`: `STATE_AFTER_START idle` · `SYSTEM_PROMPT preset+append` · `BOT_REPLY message_id=2 room=prodev-smoke` · `PRE_REPLY_MARKER yes` · `ASKED []` · $0.0337 · exit 0
- `m1-envelope` (방 하나 판): `SESSION_START_HOOK yes` · `PRE_REPLY_MARKER yes` · `ROOM_ID 1` · `REPLY_CHAT_ID 1` · `REPLIED_TO_CC no` · `READ_ATTACHMENT yes` · $0.0204 · exit 0
- `m2-compact`: `COMPACT_API 200 queued=false` · `COMPACTED yes` · `SYSTEM_MESSAGES 2` · `HANDOFF 정상` · `HANDOFF_AT scratch` · `STOP_API 200 stopped` · $0.0671 · exit 0
- `m3-restart`: `RESUMED session_id=<같은 uuid>` · `REDELIVERED 2` · `BOT_REPLIES_AFTER_RESTART 2` · `START_API_AGAIN 200 idle same_session=yes` · $0.0399 · exit 0
- 값 합 약 $0.20. 돌리기 전 · 뒤의 실제 `prodev/bots` 목록이 같다 (직접 대조).

**막힌 것 · 고친 것.**
- 이관 시험이 CLI 자식에서 셋 빨갛다 — 시험 설정의 `port: 0` 이 설정 검사(1~65535)에 걸렸다. 빈 포트를 골라 쓰게 시험을 고쳤다.
- M5.1 에서 옛 시험 글 스무 곳 남짓이 봉투 없이 봇 배달을 기대했다. `@TO` 를 붙이는 치환이 이미 봉투가 있던 글 둘에 하나를 더 붙여 "`@CC` 참고" 가 to+cc 가 됐다 — 두 시험을 원래 봉투로 되돌렸다.
- `http-projects` 가 `bot_dir_exists: false` 를 기대했다 — 과제 열기가 이제 setup(시험은 가짜)으로 봇 폴더를 만든다. 기대값을 v2 로.
- **스크래치의 `scripts/` 는 실제 prodev 로 가는 링크라**, 거기서 `setup.js` 를 부르면 Node 가 링크를 따라 풀어 봇 폴더가 실제 `prodev/bots/` 에 생긴다. `m5-room` 은 prodev 를 **복사한** 자리(`makeRoomScratch`)에서 돈다. 계약 시험 `setup-js` 도 복사본.
- minidiscord `index.html` 의 인라인 스크립트는 cockpit CSP 에 막힌다 — `web/boot.js` (D0-v2 에서 예고한 대로).
- prodev: 확정 조건 ② 를 바꾸자 fixture E-0006 이 여전히 막혔지만 **까닭이 ④ 로 바뀌었다** (확정 글 #10 이 같은 과제 본방). 조건 ② 를 재는 시험이 사라진 셈이라, fixture DB 사본에서 글을 옮겨 "같은 과제 본방 통과 · 다른 과제 방 막음" 시험 둘을 더하고 사례 이름을 사실대로 고쳤다.

**스스로 정한 것 (as-built 5절에 까닭).**
- 화면 사본은 스크래치 생성 스크립트(`port-web.mjs`)가 원본에서 매번 새로 만든다 — 함수 단위 치환이 정확히 한 번 맞아야 한다. 원본 지문(파일 sha256 · app.js 최상위 함수 지문)은 `test/fixtures/minidiscord-web.json` 에 두어 형제 저장소 없이 시험한다.
- **M5.5 커밋에 7.3 표의 일부(로그인 비밀번호 · 봇 칸 · 봇 다이얼로그)가 먼저 들어갔다** — M5.5 끝 조건(`/api/bots` 0 · 비밀번호 칸)이 그것을 요구했다. SSE · 칩 · 미리 채움은 M5.6.
- `app.js` 에 새 최상위 함수는 `loadProjects` · `openAppStream` 둘뿐 — 미리 채움 · 역할 단추는 이미 바뀌는 함수(`openRoom` · `sendMessage` · `initApp`) 안에 넣었다.
- 판은 minidiscord `api()`(상태 코드 없음) 대신 자기 `call()` 을 쓴다 — 409 `TASKS_RUNNING` 확인 때문. 판의 승인 카드는 지금 연 방의 과제 것만, 접힌 단추의 수는 전체.
- 방 만들기: 이름 규칙을 `src/rooms/create.js` 로 옮겨 `routes-projects` 가 다시 내보낸다 · 같은 이름 동시 요청은 `chat.db` 연결마다 잠금 하나 · 되돌림에서 못 지운 경로는 `left` 로 · CLI `open-project` 는 이제 기본이 setup(스모크 · 옛 봇 이름 재생은 `--no-setup`).
- `check` 는 `prodevDir` 를 짐작한 자리면 `·` 한 줄(실패 아님), 적어 준 자리에 `setup.js` 가 없으면 `✗`.
- 보관 길은 과제의 **본방**일 때만 세션을 끈다 — 활성으로 남은 옛 files 방을 보관할 때 세션을 건드리지 않게.

**재생 전 조건 (VERIFICATION 4.1 ①~③).** ① 위 `npm test` 206 · 0 · 0 ② prodev PR #19 머지 뒤, 또는 `COCKPIT_PRODEV_DIR=../prodev-wt-cockpit-v2` — 안 들어가면 확정 조건 ② 가 본방의 "확정" 을 막는다 ③ 옛 봇 이름 재생은 `node bin/cockpit.js open-project <과제> --no-setup --bot-name <이름> --bot-dir <스크래치 봇 폴더>`, 새 이름은 `POST /api/rooms`(진짜 setup) ④ v1 로 연 `chat.db` 를 이어 쓰면 먼저 `migrate-v2 --apply`.

**새 질문 (meta 에).**
- **Q3 화면 눌러 보기.** v2 는 화면이 바뀐 회차인데 기계가 보는 것은 정적 검사 · 순수 함수 · "원본에서 달라진 함수가 7.3 표뿐" 까지다. 브라우저에서 방 만들기 · 방 전환 · 자동완성 · 붙여넣기 · 판 접기를 사람이 한 번 눌러 볼 자리를 M5.M 에 둘지 (M3.M N13 은 회사 PC 설치 때로 미뤘다).
- **Q4 M5.M 재생의 봇 폴더.** 옛 대본의 봇 이름(`prodev-worktogether-비서`)은 setup 이 못 만든다. W2 처럼 스크래치 봇 폴더 + `open-project --no-setup` 으로 할지, 대본 v2 를 `prodev-<과제>-bot` 이름으로 바꿔 `POST /api/rooms`(진짜 setup) 로 할지.

**세션 끝 상태 (2026-09-15, M5)**
- cockpit 작업 트리: M5.11 docs 커밋 뒤 깨끗. prodev worktree `../prodev-wt-cockpit-v2` 는 가지 `cockpit-v2`(PR #19 열림, 머지 전). `../prodev-wt-cockpit`(cockpit-m3)은 쓰지 않음.
- 다음 세션이 읽을 파일: meta 의 M5.M 판정 · 다음 지시 → 이 절 → `docs/as-built.md`(4.3 대체된 시험 짝 · 4.4 minidiscord 기준 짝 · 5절) → `docs/TASKS.md` M5 → `smoke/README.md` m5-room.

## 2026-09-15 — M6 실전 준비 · N16 캐시 · N17 도구 호출 한 줄 · 설치 문서 v2 · prodev PR #20 (M5.M 통과 뒤)

**M5.M 통과** (meta: cockpit 열두 칸 ○ · 옛 대본 다섯 v2 합 36/42 새 기준선 · R8 8/8 · 승인 합 8 · PR #19 검수 통과 → 머지됨 a64e1f3). 지시 `instructions/M6.md`(작업 중 3.1 절이 더해졌다 — N17 을 도구별 사람 말 한 줄로). 답: **Q3** 사람이 이 맥 `~/cockpit-try-v2` 에서 눌러 봤다(기록, 관문 칸 아님) — 결함 둘 N16 · N17. **Q4** 대본 v2 봇 이름을 `prodev-<과제>-bot` 으로, `POST /api/rooms` 길로 재생했다 — `--no-setup` 옛 길은 더 안 쓴다.

**커밋** (태스크마다 하나, 커밋마다 `npm test` 초록):
- 2016584 M6.1 N17 격자 — `.tool` 을 `minmax(0,1fr) auto` · 요약 제 줄 (208)
- d277b2b M6.2 N16 정적 파일 `etag` · `last-modified` · `304` (208)
- 8a79247 M6.3 N17 3.1 — `glue.toolSummary` · `toolLabel` · `details` 한 줄 · 줄임표 · 펼침 (215)
- caed8d2 M6.4 INSTALL-WINDOWS v2 (번호 걸음 12 · 명령 안 백틱 이어쓰기 0)
- 4fc50b2 M6.5 README 쓰는 법 v2
- 이 절 · as-built 를 넣은 docs 커밋 (M6.6)
- prodev **PR #20** (`cockpit-v2b`, origin/main a64e1f3 기준, worktree `../prodev-wt-cockpit-v2`) — 1c57bc1 intake 가 카드 번호를 밝힌 **같은 글에서** 확정을 청한다 · 266c455 journal 이 방 하나 판에서도 "방마다 마지막 글" · "카드 없는 첨부" 절을 남긴다. prodev `npm test` 146 · `test:server` 18 (작업 에이전트가 직접 실행). 머지는 사람.

**`npm test`** 215건 · 실패 0 · 건너뜀 0 (직접 실행). 새 시험 둘(N16 · N17 정적)은 서버 · CSS 만 옛 판으로 되돌리면 빨갛게 떨어지는 것을 먼저 봤다.

**N16 확인** 임시 `serve` 에 `curl -I /app.js`: `HTTP/1.1 200` · `etag: W/"ed42-1a0a06b0c93"` · `last-modified: Mon, 14 Sep 2026 14:56:05 GMT` · `cache-control: no-cache` · 같은 etag 로 `If-None-Match` → `304`.

**스모크 둘** (이 맥 · haiku · 스크래치 · prodev = a64e1f3 을 스크래치에 `git archive` 로 푼 자리, 판정 아님): `m5-room` exit 0 · `PLAIN_MESSAGES 2 TARGET_ROWS 0` · `BOT_TURNS_AFTER_PLAIN 0` · `FETCH_HISTORY_HAS_ATTACHMENTS yes` · `READ_ATTACHMENT yes` · $0.0414. `m3-restart` exit 0 · `RESUMED` 같은 uuid · `REDELIVERED 2` · `START_API_AGAIN … same_session=yes` · $0.0402. 실제 `prodev/bots` 목록 전후 같음. 전문 요지는 as-built 4.2.

**막힌 것 · 알아낸 것.**
- **N17 원인은 `grid-column` 이 안 먹은 게 아니었다.** 옛 `.tool-input` 에는 `grid-column` 이 없었고, 격자 `auto auto 1fr` 에서 띄어쓸 자리 없는 긴 이름(`mcp__cockpit__fetch_history`)이 `auto` 칸을 제 폭만큼 먹어 `1fr` 칸의 요약이 몇 글자 폭으로 눌렸다(`overflow-wrap:anywhere` 라 한 글자까지). 짧은 `Bash` 줄은 멀쩡 — 사람이 본 "어떤 카드만" 과 같다. 헤드리스 Chrome 280px 에 옛 · 새 CSS 로 그려 봤다.
- **N16 은 재현하지 않았다.** v1 도 `no-cache` 는 보냈다(M2.2 부터) — 재검증 기준이 없었을 뿐이다. `etag` 로 막히리라 보지만 사람이 판을 한 번 더 올려 봐야 확정이다.
- 본 체크아웃 `../prodev` 는 아직 1e02367(PR #19 전)이다. 읽기만 하므로 당기지 않았고, 스모크는 머지된 판을 스크래치에 풀어 돌렸다.
- 첫 시험에서 `w.raw` 의 둘째 인자가 머리 그대로인 것을 몰라 한 번 빨갛다.

**스스로 정한 것 (as-built 5절에 까닭).** 파일 이름 판 번호 대신 `etag` · `toolSummary` 셋째 인자(과제 이름) · Bash 경로 끝 **세** 마디(지시 문장은 "두 마디", 예는 세 마디 — 예를 따름) · `chat_id` 없으면 `마지막 방` · `Task` = `Agent`.

**prodev ③ 조사 (고치지 않음).** `design/v2/ARCHITECTURE.md` 를 가리키는 지침 글은 `.claude/skills/intake/SKILL.md:88` 하나 — 저장소 기준 경로라 과제 폴더에서 도는 봇에게는 안 열리고(추정), 지금 판은 v3 인데 v2 를 가리킨다. 나머지는 코드 주석(`common/hooks/session-start.js:5` · `pre-reply.js:7` · `scripts/index.js:7,149` · `find.js:6,24` · `chat.js:17` · `setup.js:204` 등)이 이름만 적는다. `CLAUDE.md` · `.claude/agents` 에는 없다. 조건 ④ 의 실제 모양(`pre-reply.js:116-121`): 확정 글 번호가 카드 `source_msgs` 최대보다 뒤 **그리고** 같은 방에서 확정 바로 앞 봇 글 하나에 카드 번호.

**새 질문 (meta 에).**
- **Q5 N16 확인 자리.** 재현을 못 했다. 사람이 `~/cockpit-try-v2` 에 M6 판을 올리고 강력 새로고침 없이 로그인되는지 한 번 볼지.
- **Q6 intake 의 v2 경로.** ③ 에서 `SKILL.md:88` 이 `design/v2/ARCHITECTURE.md` 를 저장소 기준으로 가리킨다 — 봇이 `find` 로 찾아 나서는 원인 후보. 고칠지 · 어느 판을 가리킬지 정해 달라.
- **Q7 본 체크아웃 당기기.** `../prodev` 가 1e02367 이다. 실전 전에 사람이 `git pull` 할 자리를 INSTALL 에 넣을지(회사 PC 는 새 클론이라 해당 없을 수 있다).

**세션 끝 상태 (2026-09-15, M6)**
- cockpit 작업 트리: M6.6 docs 커밋 뒤 깨끗. prodev worktree `../prodev-wt-cockpit-v2` 는 가지 `cockpit-v2b`(PR #20 열림, 머지 전).
- 다음 세션이 읽을 파일: meta 의 M6 판정 → 이 절 → `docs/as-built.md` 4.2 M6 판 · 5절 M6 줄 · 6절 → `docs/INSTALL-WINDOWS.md`.

## 2026-09-15 — M6.M 통과 뒤 마무리 (after-M6) · 멈춤

**M6.M 통과 8/8** (meta: N16 은 `~/cockpit-try-v2` 를 M6 판으로 다시 띄워 `curl -I` 로 etag · 304 실측). prodev PR #20 은 사람이 먼저 머지했다(8f0870b, meta 사후 검수 통과) — 본 체크아웃 `../prodev` 도 8f0870b. 지시 `instructions/after-M6.md`. 답: **Q5** 사람이 보통 새로고침으로 새 도구 요약이 보이는지 본다(cockpit 할 일 없음) · **Q6** 고친다 · **Q7** 설치 걸음이 아니라 INSTALL 끝 "판 올리기" 절.

- 98a2650 M6.7 INSTALL "판 올리기" 절 — 서버 끄기 · `git pull --ff-only`(cockpit · prodev) · `npm ci` · (봇 설정이 바뀌었을 때만) `setup.js` 다시 — `settings.local.json` 이 덮인다(ADR-038) · serve 다시(resume) · 보통 새로고침(etag). README 한 줄.
- prodev **PR #21** (`cockpit-v2c`, origin/main 8f0870b 기준) 76ed833 — `intake/SKILL.md:93` 의 `design/v2/ARCHITECTURE.md` 5.1 경로를 지우고 카드 규격(머리말 칸 열여섯 · 절 여섯의 차례)을 본문 한 줄로. 시험 한 건: `.claude/skills/**` 에 `design/v[0-9]/` 0 · intake 에 차례 두 줄(옛 SKILL.md 로 되돌리면 실패하는 것을 봤다). prodev `npm test` 147 · `test:server` 18 · 실패 0 (직접 실행). **머지는 meta 검수 뒤 사람.** 스킬 전체에서 `design/v숫자/` 는 그 한 곳뿐이었다.
- cockpit `npm test` 는 이 마무리에서 코드가 안 바뀌어 다시 돌리지 않았다(M6 끝 215 · 0 · 0).

**세션 끝 상태 (2026-09-15, after-M6 — 멈춤)**
- cockpit 작업 트리: 이 절 커밋 뒤 깨끗. prodev worktree `../prodev-wt-cockpit-v2` 는 가지 `cockpit-v2c`(PR #21 열림, 머지 전).
- **다음 지시는 사람의 회사 PC 실증(W1) 결과가 온 뒤다.** 그때 읽을 파일: meta 의 다음 지시 → 이 절 → M6 절 → `docs/INSTALL-WINDOWS.md`(12걸음 · 판 올리기).
