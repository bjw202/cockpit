# 윈도우에 cockpit 을 세우는 법 (회사 PC)

사람이 회사 PC 에서 차례대로 친다. **걸음마다 확인 명령이 있다 — 확인이 기대와 다르면 거기서 멈추고, 무엇이 어떻게 나왔는지 그대로 meta 에 준다.** 고치는 것은 그다음이다.

작업판 전체의 윈도우 준비(Git for Windows · Python · 줄끝 · 작업판 신뢰)는 작업판 뿌리의 `WINDOWS.md` 가 진실이다. 여기는 cockpit 한 갈래만 적는다.

**명령을 치는 곳.** 모두 **PowerShell 창**이다. 명령은 **한 줄에 하나**다 — 줄 끝 백틱(`` ` ``)으로 이어 쓰지 않는다. 붙여넣기에서 백틱 이어쓰기가 깨진 적이 있다(prodev 윈도우 포팅 bc7d914).

**경로는 공백 없는 절대 경로.** 아래 예는 `C:\work\crew-workspace` (작업판) · `C:\cockpit-data` (데이터)다. 자리를 바꾸면 모든 걸음에서 같이 바꾼다. 봇의 Bash 는 Git Bash 라서 공백 든 경로에서 조용히 깨진다.

한글이 `?` 로 깨져 보이면 그 창에서 먼저 `chcp 65001` 을 한 번 친다.

**(v2) 달라진 것.** 과제는 명령으로 열지 않는다 — 서버를 띄운 뒤 **화면의 `+` 로 방(과제)을 만들면 cockpit 이 prodev `setup.js` 까지 불러 봇 폴더를 만든다.** 방은 과제마다 하나(`prodev-<과제>`)이고, 오른쪽 조종석 판은 접었다 편다.

---

## 걸음

1. **Node 판을 본다.** `node:sqlite` 를 플래그 없이 쓰려면 22.13 이상이어야 한다.
   - 친다: `node -v`
   - 확인: `v22.13.0` 이상 (예 `v24.14.0`). 낮으면 <https://nodejs.org> LTS 를 깔고 창을 새로 연다.

2. **Git Bash 자리를 본다.** 봇 세션의 Bash 도구가 이것을 쓴다.
   - 친다: `(Get-Command bash -ErrorAction SilentlyContinue).Source`
   - 확인: `C:\Program Files\Git\bin\bash.exe` 같은 줄이 나온다. 빈 줄이면 Git for Windows 가 없거나 PATH 밖이다 (작업판 `WINDOWS.md` 3.1). 다른 자리에 깔렸으면 사용자 환경변수 `CLAUDE_CODE_GIT_BASH_PATH` 에 그 `bash.exe` 경로를 넣는다.

3. **Claude Code 를 깔고 로그인한다.** 봇 세션은 이 PC 의 Claude 로그인으로 뜬다.
   - 친다 (없을 때만): `irm https://claude.ai/install.ps1 | iex`
   - 친다: `claude` 로 한 번 켜서 로그인하고 `/exit` 로 나온다.
   - 확인: `claude --version` 이 판 한 줄(예 `2.1.270 (Claude Code)`)을 낸다.
   - 확인: `(Get-Command claude).Source` 가 `claude.exe` **절대 경로**를 낸다 (예 `C:\Users\<이름>\.local\bin\claude.exe`). **이 줄을 적어 둔다 — 6번의 `claudePath` 다.** 윈도우에서는 SDK 가 npm 셸 래퍼를 못 따라가서 이 값이 반드시 있어야 한다.

4. **데이터 자리 둘을 만든다.** `dataDir`(대화 DB 둘) · `uploadsDir`(사람 첨부).
   - 친다: `New-Item -ItemType Directory -Force -Path C:\cockpit-data\uploads | Out-Null`
   - 확인: `Test-Path C:\cockpit-data\uploads` → `True`

5. **cockpit 의존성을 깔고 시험을 돌린다.**
   - 친다: `cd C:\work\crew-workspace\cockpit`
   - 친다: `npm ci`
   - 친다: `npm test 2>&1 | Select-String -Pattern '^ℹ (tests|pass|fail|cancelled|skipped)'`
   - 확인: `ℹ fail 0` · `ℹ cancelled 0`. `ℹ skipped` 가 0 이 아니면 **건너뛴 시험 이름을 적는다** — 윈도우에서 건너뛸 수 있는 시험은 `docs/as-built.md` 4.1 에 이름으로 있다. 그 목록 밖의 건너뜀 · 실패는 전부 meta 에 준다.
   - 친다 (건너뛴 이름 보기): `npm test 2>&1 | Select-String -Pattern 'SKIP'`

6. **설정 한 장(`cockpit.json`)을 쓰고 검사한다.**
   - 친다: `Copy-Item cockpit.example.json cockpit.json`
   - 친다: `notepad cockpit.json` — `prodevDir` = `C:/work/crew-workspace/prodev` · `botsDir` = `C:/work/crew-workspace/prodev/bots` (**반드시 `<prodevDir>/bots`**) · `projectsDir` = `C:/work/crew-workspace/projects` · `uploadsDir` = `C:/cockpit-data/uploads` · `dataDir` = `C:/cockpit-data` · `claudePath` = 3번에서 적은 경로. 슬래시(`/`)로 적어도 된다. JSON 안에서 역슬래시를 쓰면 두 번(`\\`) 쓴다.
   - 확인: `node bin/cockpit.js check --config cockpit.json` 이 **`✗` 줄 없이** 넷을 낸다:
     - `✓ node v… (>= 22.13)`
     - `✓ claudePath <판> — <경로>` (예 `✓ claudePath 2.1.270 (Claude Code) — C:/Users/…/claude.exe`)
     - `✓ 경로 공백 없음`
     - `✓ prodevDir C:/work/crew-workspace/prodev — setup.js 있음`
   - `✗ claudePath 없다` 면 경로 오타, `✗ claudePath 실행이 안 된다` 면 로그인 · 설치를 3번부터 다시 본다. `✗ <키> … 공백` 이면 그 자리를 공백 없는 곳으로 옮긴다. `✗ prodevDir … scripts/setup.js 가 없다` 면 `prodevDir` 오타 — 이대로 두면 10번의 방 만들기가 502 로 실패한다.
   - 회사망이 프록시를 거치면 `extraEnvKeys` 에 `HTTPS_PROXY` · `HTTP_PROXY` · `NO_PROXY` 를 넣는다 (예 `"extraEnvKeys": ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"]`). 봇 세션 env 는 화이트리스트라 이 키들이 기본으로는 안 실린다 — 넣을지는 W1.3 에서 사람이 잰 결과로 정한다 (meta N14).

7. **방(과제)은 화면의 `+` 로 만든다 — setup 까지 한다.** 여기서는 봇 폴더를 손으로 만들지 않는다(v1 의 `setup.js` 걸음은 없어졌다). 10번에서 `+` 를 누르면 과제 폴더 · 봇 폴더 · 설정 두 장이 한꺼번에 생긴다. 이 걸음에서는 v1 에서 쓰던 DB 를 이어 쓸 때만 옛 방을 정리한다.
   - 새로 세우는 자리(`C:\cockpit-data` 가 비어 있다)면 **친 것 없이 8번으로 간다.**
   - v1 의 `chat.db` 를 이어 쓰면 먼저 보기만 한다: `node bin/cockpit.js migrate-v2 --config cockpit.json`
   - 확인: 옛 files 방마다 한 줄, 끝에 `보이기만 했다 — 적용하려면 --apply` (없으면 `보관할 옛 files 방이 없다`).
   - 친다 (옛 방이 있을 때): `node bin/cockpit.js migrate-v2 --apply --config cockpit.json`
   - 확인: `보관 <N>` 한 줄. 다시 보기만 돌리면 그 방들이 `→ 이미 보관` 으로 나온다.

8. **계정 둘을 만든다.** 이름은 과제 헌장(`charter.md`)의 `PL:` 과 글자 그대로.
   - 친다: `node bin/cockpit.js init-admin 김피엘 --config cockpit.json` — 비밀번호(8자 이상)를 화면에 안 보이게 두 번 묻는다.
   - 친다: `node bin/cockpit.js add-user 김과제 --config cockpit.json`
   - 확인: `node bin/cockpit.js session-token 김피엘 --config cockpit.json` 이 64자 한 줄을 낸다.

9. **서버를 띄운다.** 이 창은 켜 둔다. 끌 때는 Ctrl-C — 세션 상태를 그대로 두고 다음 기동에 이어 붙는다.
   - 친다: `node bin/cockpit.js serve --config cockpit.json`
   - 확인: `cockpit 듣는 중 http://127.0.0.1:3000` 줄.
   - 확인 (**새 PowerShell 창**에서): `Invoke-RestMethod http://127.0.0.1:3000/api/health` → `ok` 가 `True`.

10. **브라우저에서 방(과제)을 만든다.** 과제 이름은 예로 `수율개선`.
    - 연다: `http://127.0.0.1:3000` → 김피엘로 들어간다.
    - 누른다: 사이드바 머리의 `+` → 이름 칸에 `수율개선` → 확인.
    - 확인: 사이드바에 방 `prodev-수율개선` 이 생기고 연다. 실패하면 오류 글자(예 `setup 실패: …`)를 그대로 적는다 — 이때 만든 것은 되돌려진다.
    - 확인 (새 PowerShell 창): `Test-Path C:\work\crew-workspace\prodev\bots\prodev-수율개선-bot\.claude\settings.local.json` → `True`
    - 확인: `(Get-Content C:\work\crew-workspace\prodev\bots\prodev-수율개선-bot\.claude\settings.local.json -Raw | ConvertFrom-Json).permissions.allow.Count` → 0 보다 큰 수.
    - **허용 · 거부 목록의 자리는 `settings.local.json` 이다.** SDK 세션은 `settings.json` 의 `permissions.allow` 를 읽지 않는다. 손으로 규칙을 더했으면 setup 이 다시 돌 때 사라진다 (prodev ADR-038).
    - 판을 새로 올린 뒤라도 강력 새로고침(Ctrl+Shift+R)은 필요 없다. 옛 화면이 보이거나 로그인이 안 되면 그 모양을 적는다.

11. **봇 폴더를 한 번 신뢰한다.** 안 하면 봇 세션이 허용 목록을 통째로 무시해 파일을 하나도 못 쓴다 (작업판 `WINDOWS.md` 5.2).
    - 친다 (새 PowerShell 창): `cd C:\work\crew-workspace\prodev\bots\prodev-수율개선-bot`
    - 친다: `claude` — 이 폴더를 신뢰하느냐고 물으면 예, 그다음 `/exit`.
    - 확인: 같은 자리에서 `claude` 를 다시 켜면 신뢰를 묻지 않는다. `/exit` 로 나온다.

12. **브라우저로 판을 눌러 보고 보이는 것을 적는다.**
    - 누른다 · 적는다 (칸마다 **무엇이 보였나** 한두 줄, 안 되면 오류 글자 그대로):
      - **방** — 입력칸에 `@TO(prodev-수율개선-bot) ` 가 채워져 있는가. 봇 칩이 `⚪` 인가.
      - **조종석 판** — 머리의 `조종석` 단추로 판이 접히고 펴지는가. 머리(상태 · 모델 · 계정 · 값 `추정치` · 문맥)가 보이는가. `켜기` 를 누르면 상태가 `켜는 중` → `대기` 로, 봇 칩이 `🟢` 로 바뀌는가.
      - **봇 부르기** — `@TO(prodev-수율개선-bot) 안녕` 을 보내고, 판의 "이번 턴 도구 호출" 에 도구마다 한 줄 요약(예 `reply` · `방 1 · …`)이 판 폭 안에 한 줄로 보이는가. 줄을 누르면 입력 요약이 펼쳐지는가.
      - **판 접기** — 판을 접은 채 새로고침해도 접힌 채인가. 승인이 걸리면 접힌 단추에 `(1)` 같은 수가 붙는가.
      - **사람끼리 글** — 김과제로 들어가 입력칸의 `@TO(…)` 봉투를 **지운다.** 칸이 비었을 때 안내 글자가 `봇에게 가지 않습니다 — 부르려면 @` 인가. 그대로 글과 파일 하나(예 `yield.csv`)를 올리고, 조종석 판에 새 턴이 **안** 생기는가.
      - **따라잡기** — 이어서 `@TO(prodev-수율개선-bot) 위 파일 봐 줘` 를 보낸다. 판에 `fetch_history` 줄이 생기고, 봇 답이 앞의 글 · 파일 내용을 말하는가.
      - **파일** — 판의 파일 접이에서 과제 폴더의 폴더들(`cards/` · `wiki/` …)이 보이고, `charter.md` 를 누르면 글이 보이는가.
    - 적은 것을 meta 에 준다.

---

## 따로 — 자원 계측 (W4 전에 meta 가 청하면)

세션 셋을 켠 채 5분 동안 서버와 그 밑 Claude CLI 프로세스들의 상주 메모리를 1분마다 적는다. 값이 든다(haiku 세 턴). 스크래치 자리를 새로 만들어 쓰므로 실제 봇 폴더 · 과제 폴더를 건드리지 않는다.

- 친다: `node smoke/m4-sessions.mjs C:\cockpit-scratch\m4 claude-haiku-4-5-20251001`
- 확인: `RSS_MB <분> <서버> <자식 합>` 줄이 여섯(0~5분). 출력 전체를 meta 에 준다.
- 형제 prodev 가 `C:\work\crew-workspace\prodev` 가 아니면 먼저 `$env:COCKPIT_PRODEV_DIR = "<prodev 경로>"` 한 줄.
