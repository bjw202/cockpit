# smoke — 진짜 SDK 스모크 (npm test 에 안 섞인다)

진짜 Claude 세션을 띄운다. 값이 들고, 이 기계에 Claude 로그인이 있어야 하며, 모델에 따라 흔들린다. 스크립트는 **판정하지 않고 줄만 낸다.** 판정은 meta 가 사본에서 돌려 센다 (`docs/VERIFICATION.md` 3절).

(v2 · M5) 과제 하나 = 방 하나다. 봇에게 가는 글은 `@TO(봇)` · `@CC(봇)` 이 있는 글뿐이라, 스모크의 모든 글이 봉투를 적는다. 첨부도 같은 방의 `@TO` 글에 올린다.

## 돌리는 법

```
npm ci
node smoke/m1-hello.mjs    <스크래치 폴더> [모델] [--no-origin]
node smoke/m1-envelope.mjs <스크래치 폴더> [모델] [--no-origin]
node smoke/m1-guard.mjs    <스크래치 폴더> [모델] [--no-origin]
node smoke/m2-approval.mjs <스크래치 폴더> [모델]
node smoke/m2-compact.mjs  <스크래치 폴더> [모델] [--no-origin]
node smoke/m3-restart.mjs  <스크래치 폴더> [모델]
node smoke/m4-sessions.mjs <스크래치 폴더> [모델] [--minutes 5]
node smoke/m5-room.mjs     <스크래치 폴더> [모델] [--fail-setup]
```

네 갈래로 돈다:
- `m1-*` — 세션 관리자를 곧바로 쓰고 승인 요청을 전부 허용한다.
- `m2-approval` — 서버를 이 프로세스 안 임시 포트에 띄우고 사람 역할을 HTTP 로 한다. 김과제(member)가 글을 올리고 김피엘(admin)이 카드에 답한다. 승인은 진짜 중계를 거친다.
- `m2-compact` · `m3-restart` · `m4-sessions` — **진짜 CLI `bin/cockpit.js serve` 를 자식 프로세스로** 띄우고(`smoke/server.mjs`), 세션 조작은 admin API(`POST /api/projects/:name/session/{start,compact,stop}`)로만 한다. meta 가 대본의 손 걸음(압축 · 끄기 · 켜기)을 같은 길로 대신하므로 스모크가 먼저 밟는다 (ARCHITECTURE 8.3). 승인 카드가 뜨면 admin 으로 허용하고 `ASKED` 에 남긴다. serve 의 출력은 `<스크래치>/serve.log`.
- `m5-room` (v2) — 역시 진짜 `serve` 자식이다. 다만 과제를 미리 열지 않는다: admin 이 **`POST /api/rooms` 로 방을 만들면 진짜 prodev `setup.js` 가 봇 폴더까지 만든다** (ADR-017). 그 뒤 member 가 봉투 없는 글 둘(하나에 csv)을 올리고 30초 동안 봇 턴이 안 도는지 본 다음, `@TO(봇) 위에 올린 파일 봐 주세요` 로 불러 봇이 `fetch_history` 로 따라잡고 첨부를 읽는지 본다 (ADR-018 · 020). 끝에 방을 보관한다. `--fail-setup` 이면 사본의 `setup.js` 가 봇 폴더를 반쯤 만들고 exit 1 → 502 와 되돌림(새 폴더 · 행 0)만 본다 — 세션은 켜지 않아 값이 들지 않는다.

`m4-sessions` 는 같은 스크래치에 과제 셋(`s1` · `s2` · `s3`, `scratch.mjs` 의 `addScratchProject`)을 두고 셋을 켜 한 번씩 답하게 한 뒤 0~5분 1분마다 serve 와 그 밑 프로세스 나무의 상주 메모리를 적는다 (맥 · 리눅스 `ps`, 윈도우 `Win32_Process.WorkingSetSize`). 윈도우에는 프로세스 묶음 신호가 없어 `server.mjs` 가 `taskkill /T /F` 로 나무째 끈다.

`m3-restart` 는 serve 를 제 프로세스 묶음(detached)으로 띄워 **묶음째 SIGKILL** 한다 — serve 와 그 밑 Claude CLI 가 함께 죽는다(PC 가 꺼진 것처럼). 그 사이 글 둘을 DB 에 넣고 serve 를 다시 띄워 resume · 재배달 · 답을 본 뒤, admin API 로 끄고 켠다.

- `<스크래치 폴더>` 는 **돌릴 때마다 지우고 새로 만든다.** 공백이 없어야 하고, 실제 `prodev/bots/` 아래는 거절한다.
- 모델 기본은 `claude-haiku-4-5-20251001` (값을 줄이려고). 관문에서는 실전 모델을 준다.
- 형제 prodev 자리는 `COCKPIT_PRODEV_DIR`, 없으면 `../prodev`. 윈도우는 `COCKPIT_CLAUDE_PATH` 에 `claude.exe` 절대 경로.
- prodev PR(M5.10, 방 하나 판) 전의 prodev 로 돌리면 하네스 지침이 아직 "files 방" 을 말한다 — 봇의 답 문장이 그 영향을 받을 수 있다. 가지를 주려면 `COCKPIT_PRODEV_DIR=../prodev-wt-cockpit-v2`.

## 스크래치 폴더에 생기는 것 — m1~m4 (`smoke/scratch.mjs` 의 `makeScratch` — SDK 를 안 싣는다)

```
<스크래치>/
  data/chat.db · data/cockpit.db
  uploads/
  projects/smoke/              과제 폴더 (setup.js 의 하위 폴더들 · charter.md 에 PL: 김피엘 · house.md)
  prodev/                      prodev 뿌리 흉내 (meta W2r.3) — 봇이 ../../scripts/find.js 를 찾는 자리
    scripts · common           실제 prodev 의 것으로 심볼릭 링크
    CLAUDE.md · .claude/{skills,agents}   사본 · 링크
    bots/prodev-smoke-bot/     봇 폴더 (cockpit 설정의 botsDir = <스크래치>/prodev/bots)
      CLAUDE.md                prodev/CLAUDE.md 사본
      .claude/settings.json        훅 · env · statusLine · autoCompact
      .claude/settings.local.json  허용 · 거부 (permissions)
      .claude/skills · agents  prodev/.claude/{skills,agents} 심볼릭 링크
  marker-hook.mjs · pretooluse-marker.json   표식 훅과 그 출력
```

**설정이 두 파일인 까닭.** headless/SDK 세션은 프로젝트 `.claude/settings.json` 의 `permissions.allow` 를 읽지 않고, `.claude/settings.local.json` 의 규칙은 먹는다 (meta 가 W2 재생 중에 갈랐다). 그래서 permissions 절만 local 로 떼어 쓴다. prodev 에 `common/settings.local.template.json` 이 있으면(W2.9 뒤) 그것을 채운다.

prodev PR(W2.9) 전의 템플릿이면 사본에서 바꾼다: 도구 이름 `mcp__minidiscord-channel__*` → `mcp__cockpit__*` · `MINIDISCORD_URL` 뺌. 어느 쪽이든 deny 에 `cockpit.db` 의 `Read` · `Edit` · `Write` 를 더한다. `MINIDISCORD_DB` 는 스크래치 `chat.db`. `PRODEV_BOT_DIR` 은 cockpit 이 봇 폴더(스크래치)로 준다 — 훅의 인수인계서가 실제 봇 폴더를 덮지 않는다.

**돌린 뒤 볼 것.** `settings.local.json` 은 스크래치가 쓴 그대로여야 한다 — "이번 세션 허용" 이 봇 폴더에 영구 규칙을 남기지 않는다(meta N7). `m2-approval` 의 `LOCAL_SETTINGS_CHANGED no []` 줄이 그것을 낸다. (W2 판정 지시는 "파일이 없어야 한다" 였지만, 이제 스크래치가 허용 목록을 그 파일에 쓰므로 "바뀌지 않아야 한다" 로 본다.)

## 스크래치 폴더에 생기는 것 — m5-room (`smoke/scratch.mjs` 의 `makeRoomScratch`)

```
<스크래치>/
  prodev/                      prodev 의 **복사본** — scripts · common · .claude · CLAUDE.md (bots · tmp · node_modules · .git 뺌)
    bots/                      처음에는 비어 있다. 방 만들기(진짜 setup.js)가 bots/prodev-smoke-bot/ 을 만든다
  projects/                    처음에는 비어 있다. setup.js 가 projects/smoke/ 를 만든다 (헌장 한 줄은 스모크가 더한다)
  data/ · uploads/ · cockpit.json · serve.log
```

**왜 링크가 아니라 복사인가.** 링크된 `scripts/setup.js` 를 부르면 Node 가 링크를 따라 풀어 `setup.js` 의 저장소 자리가 실제 prodev 가 되고, 봇 폴더가 실제 `prodev/bots/` 에 생긴다. 스모크는 그 자리를 쓰지 않는다. `--fail-setup` 이면 사본의 `scripts/setup.js` 를 대역(봇 폴더를 반쯤 만들고 exit 1)으로 바꾼다.

## 내는 줄

| 스크립트 | 줄 |
|---|---|
| `m1-hello` | `STATE_AFTER_START` · `SESSION_ID` · `SYSTEM_PROMPT` · `ORIGIN` · `BOT_REPLY message_id= room=` · `PRE_REPLY_MARKER` · `ASKED` · `COST_USD` |
| `m1-envelope` | `ORIGIN` · `SESSION_START_HOOK` · `PRE_REPLY_MARKER` · `ROOM_ID`(v2 — 옛 `FILES_ROOM_ID`) · `REPLY_CHAT_ID` · `REPLY_TEXT` · `REPLIED_TO_CC` · `READ_ATTACHMENT` · `ASKED` · `COST_USD` |
| `m1-guard` | `GIVEN_BODY_CHARS` · `TURN_DONE` · `REPLY_CALLS` · `REPLY_ATTEMPT_CHARS` · `ATTEMPTED_OVER_900` · `HOOK_BLOCKED` · `ROOM_MESSAGES_FROM_BOT` · `LONG_BOT_MESSAGES` · `ASKED` · `COST_USD` |
| `m2-approval` | 판마다 `CARD …` · `ANSWER <decision> <status>` · `ROUND <n> …` · 끝에 `REASKED_AFTER_SESSION_ALLOW` · `BASH_RAN_AFTER_SESSION_ALLOW` · `LOCK_MESSAGES` · `ANSWER_MESSAGES <✅> <⛔>` · `ASKED` · `COST_USD` |
| `m2-compact` | `START_API` · `FIRST_REPLY` · `COMPACT_API <status> queued=` · `COMPACTED` · `COMPACT_BOUNDARY` · `SYSTEM_MESSAGES` · `HANDOFF 정상\|못 썼다\|없음` · `HANDOFF_AT scratch\|prodev <경로>\|none` · `FIRST_TEXT_AFTER` · `HOOKS` · `STOP_API` · `ASKED` · `COST_USD` |
| `m4-sessions` | `PLATFORM` · `START_API <과제>` ×3 · `WARM <과제> yes\|no` ×3 · `RSS_MB <분> <서버> <자식 합>` (0~N분) · `CHILD_PROCS <분> <수>` · `STATES` · `STOP_API <과제>` ×3 · `ASKED` · `COST_USD` |
| `m3-restart` | `START_API` · `FIRST_REPLY` · `SESSION_BEFORE` · `KILLED` · `STATE_AFTER_KILL` · `INSERTED <id> <id>` · `SERVE_BOOT` · `RESUMED session_id=<uuid>\|NEW (…)` · `REDELIVERED <N>` · `BOT_REPLIES_AFTER_RESTART <N>` · `STOP_API` · `START_API_AGAIN <status> <state> same_session=yes\|no` · `CONTEXT_PCT` · `ASKED` · `COST_USD` |
| `m5-room` | `ROOM_CREATE_API <status> room= bot= setup_ms=` · `ROOMS_FOR_PROJECT <N>` · `BOT_DIR_SETTINGS_LOCAL yes\|no` · `START_API` · `PLAIN_MESSAGES 2 TARGET_ROWS <N> INBOX_ROWS <N>` · `BOT_TURNS_AFTER_PLAIN <N>` · `DELIVERED_AFTER_PLAIN <N>` · `FETCH_HISTORY_CALLED yes\|no` · `FETCH_HISTORY_HAS_ATTACHMENTS yes\|no` · `READ_ATTACHMENT yes\|no` · `BOT_REPLY message_id= "…"` · `ARCHIVE_API <status> state=` · `COST_USD` · `ASKED` |
| `m5-room --fail-setup` | `ROOM_CREATE_API 502 …` · `SETUP_ERROR` · `SETUP_TAIL` · `ROLLBACK_BOT_DIR_EXISTS yes\|no` · `ROLLBACK_PROJECT_DIR_EXISTS yes\|no` · `ROLLBACK_ROWS <N>` · `ASKED []` |

세션이 죽으면 `ERROR {…}` 한 줄이 더 나온다. `m2-approval` 밖의 스모크는 승인 요청을 전부 허용하고 `ASKED` 에 이름만 적는다. `m2-approval` 의 `ASKED` 는 `도구:behavior` 목록이다. `m5-room` 의 `FETCH_HISTORY_HAS_ATTACHMENTS` 는 봇이 준 입력 그대로 처리기를 다시 돌려 본 값이다 — 사건의 결과 요약이 200자에서 잘리기 때문이다.
