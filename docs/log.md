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
