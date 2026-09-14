# smoke — 진짜 SDK 스모크 (npm test 에 안 섞인다)

진짜 Claude 세션을 띄운다. 값이 들고, 이 기계에 Claude 로그인이 있어야 하며, 모델에 따라 흔들린다. 스크립트는 **판정하지 않고 줄만 낸다.** 판정은 meta 가 사본에서 돌려 센다 (`docs/VERIFICATION.md` 3절).

## 돌리는 법

```
npm ci
node smoke/m1-hello.mjs    <스크래치 폴더> [모델] [--no-origin]
node smoke/m1-envelope.mjs <스크래치 폴더> [모델] [--no-origin]
node smoke/m1-guard.mjs    <스크래치 폴더> [모델] [--no-origin]
node smoke/m2-approval.mjs <스크래치 폴더> [모델]
node smoke/m2-compact.mjs  <스크래치 폴더> [모델] [--no-origin]
```

`m2-approval` 만 서버(임시 포트)를 띄우고 사람 역할을 HTTP 로 한다 — 김과제(member)가 글을 올리고 김피엘(admin)이 카드에 답한다. 승인은 진짜 중계를 거친다. 나머지는 세션 관리자를 곧바로 쓰고 승인 요청을 전부 허용한다.

- `<스크래치 폴더>` 는 **돌릴 때마다 지우고 새로 만든다.** 공백이 없어야 하고, 실제 `prodev/bots/` 아래는 거절한다.
- 모델 기본은 `claude-haiku-4-5-20251001` (값을 줄이려고). 관문에서는 실전 모델을 준다.
- 형제 prodev 자리는 `COCKPIT_PRODEV_DIR`, 없으면 `../prodev`. 윈도우는 `COCKPIT_CLAUDE_PATH` 에 `claude.exe` 절대 경로.

## 스크래치 폴더에 생기는 것 (`smoke/lib.mjs` 의 `makeScratch`)

```
<스크래치>/
  data/chat.db · data/cockpit.db
  uploads/
  projects/smoke/            과제 폴더 (setup.js 의 하위 폴더들 · charter.md 에 PL: 김피엘 · house.md)
  bots/prodev-smoke-bot/     봇 폴더 — 실증과 같은 방법
    CLAUDE.md                prodev/CLAUDE.md 사본
    .claude/settings.json    prodev/common/settings.template.json 을 스크래치 경로로 채운 사본
    .claude/skills · agents  prodev/.claude/{skills,agents} 심볼릭 링크
  marker-hook.mjs · pretooluse-marker.json   표식 훅과 그 출력
```

prodev PR(W2.9) 전이라 설정 사본에서 셋을 바꾼다: 도구 이름 `mcp__minidiscord-channel__*` → `mcp__cockpit__*` · `MINIDISCORD_URL` 뺌 · deny 에 `cockpit.db` 의 `Read` · `Edit` · `Write`. `MINIDISCORD_DB` 는 스크래치 `chat.db`. `PRODEV_BOT_DIR` 은 cockpit 이 봇 폴더(스크래치)로 준다 — 훅의 인수인계서가 실제 봇 폴더를 덮지 않는다.

## 내는 줄

| 스크립트 | 줄 |
|---|---|
| `m1-hello` | `STATE_AFTER_START` · `SESSION_ID` · `SYSTEM_PROMPT` · `ORIGIN` · `BOT_REPLY message_id= room=` · `PRE_REPLY_MARKER` · `ASKED` · `COST_USD` |
| `m1-envelope` | `ORIGIN` · `SESSION_START_HOOK` · `PRE_REPLY_MARKER` · `FILES_ROOM_ID` · `REPLY_CHAT_ID` · `REPLY_TEXT` · `REPLIED_TO_CC` · `READ_ATTACHMENT` · `ASKED` · `COST_USD` |
| `m1-guard` | `GIVEN_BODY_CHARS` · `TURN_DONE` · `REPLY_CALLS` · `REPLY_ATTEMPT_CHARS` · `ATTEMPTED_OVER_900` · `HOOK_BLOCKED` · `ROOM_MESSAGES_FROM_BOT` · `LONG_BOT_MESSAGES` · `ASKED` · `COST_USD` |
| `m2-approval` | 판마다 `CARD …` · `ANSWER <decision> <status>` · `ROUND <n> …` · 끝에 `REASKED_AFTER_SESSION_ALLOW` · `BASH_RAN_AFTER_SESSION_ALLOW` · `LOCK_MESSAGES` · `ANSWER_MESSAGES <✅> <⛔>` · `ASKED` · `COST_USD` |
| `m2-compact` | `FIRST_REPLY` · `COMPACTED` · `COMPACT_BOUNDARY` · `SYSTEM_MESSAGES` · `HANDOFF 정상\|못 썼다\|없음` · `FIRST_TEXT_AFTER` · `HOOKS` · `ASKED` · `COST_USD` |

세션이 죽으면 `ERROR {…}` 한 줄이 더 나온다. `m2-approval` 밖의 스모크는 승인 요청을 전부 허용하고 `ASKED` 에 이름만 적는다. `m2-approval` 의 `ASKED` 는 `도구:behavior` 목록이다.
