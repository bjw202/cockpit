# 윈도우에 cockpit 을 세우는 법 (회사 PC)

사람이 회사 PC 에서 차례대로 친다. **걸음마다 확인 명령이 있다 — 확인이 기대와 다르면 거기서 멈추고, 무엇이 어떻게 나왔는지 그대로 meta 에 준다.** 고치는 것은 그다음이다.

작업판 전체의 윈도우 준비(Git for Windows · Python · 줄끝 · 작업판 신뢰)는 작업판 뿌리의 `WINDOWS.md` 가 진실이다. 여기는 cockpit 한 갈래만 적는다.

**명령을 치는 곳.** 모두 **PowerShell 창**이다. 명령은 **한 줄에 하나**다 — 줄 끝 백틱(`` ` ``)으로 이어 쓰지 않는다. 붙여넣기에서 백틱 이어쓰기가 깨진 적이 있다(prodev 윈도우 포팅 bc7d914).

**경로는 공백 없는 절대 경로.** 아래 예는 `C:\work\crew-workspace` (작업판) · `C:\cockpit-data` (데이터)다. 자리를 바꾸면 모든 걸음에서 같이 바꾼다. 봇의 Bash 는 Git Bash 라서 공백 든 경로에서 조용히 깨진다.

한글이 `?` 로 깨져 보이면 그 창에서 먼저 `chcp 65001` 을 한 번 친다.

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
   - 친다: `notepad cockpit.json` — `botsDir` = `C:/work/crew-workspace/prodev/bots` · `projectsDir` = `C:/work/crew-workspace/projects` · `uploadsDir` = `C:/cockpit-data/uploads` · `dataDir` = `C:/cockpit-data` · `claudePath` = 3번에서 적은 경로. 슬래시(`/`)로 적어도 된다. JSON 안에서 역슬래시를 쓰면 두 번(`\\`) 쓴다.
   - 확인: `node bin/cockpit.js check --config cockpit.json` 이 **`✗` 줄 없이** 셋을 낸다:
     - `✓ node v… (>= 22.13)`
     - `✓ claudePath <판> — <경로>` (예 `✓ claudePath 2.1.270 (Claude Code) — C:/Users/…/claude.exe`)
     - `✓ 경로 공백 없음`
   - `✗ claudePath 없다` 면 경로 오타, `✗ claudePath 실행이 안 된다` 면 로그인 · 설치를 3번부터 다시 본다. `✗ <키> … 공백` 이면 그 자리를 공백 없는 곳으로 옮긴다.

7. **봇 폴더를 만든다 (prodev `setup.js`).** 과제 폴더 · 봇 폴더 · 설정 두 장이 생긴다. 과제 이름은 예로 `수율개선`.
   - 친다: `node C:\work\crew-workspace\prodev\scripts\setup.js --project 수율개선 --cockpit C:\work\crew-workspace\cockpit\cockpit.json`
   - 확인: 출력에 `씀  bots/prodev-수율개선-bot/.claude/settings.local.json  (허용 N건 · 거부 N건 · 바깥 폴더 N개)` 줄이 있다.
   - 확인: `Test-Path C:\work\crew-workspace\prodev\bots\prodev-수율개선-bot\.claude\settings.local.json` → `True`
   - 확인: `(Get-Content C:\work\crew-workspace\prodev\bots\prodev-수율개선-bot\.claude\settings.local.json -Raw | ConvertFrom-Json).permissions.allow.Count` → 7번 출력의 허용 건수와 같다.
   - **허용 · 거부 목록의 자리는 `settings.local.json` 이다.** SDK 세션은 `settings.json` 의 `permissions.allow` 를 읽지 않는다. 손으로 규칙을 더했으면 `setup.js` 를 다시 돌릴 때 사라진다 (prodev ADR-038).

8. **봇 폴더를 한 번 신뢰한다.** 안 하면 봇 세션이 허용 목록을 통째로 무시해 파일을 하나도 못 쓴다 (작업판 `WINDOWS.md` 5.2).
   - 친다: `cd C:\work\crew-workspace\prodev\bots\prodev-수율개선-bot`
   - 친다: `claude` — 이 폴더를 신뢰하느냐고 물으면 예, 그다음 `/exit`.
   - 확인: 같은 자리에서 `claude` 를 다시 켜면 신뢰를 묻지 않는다. `/exit` 로 나오고 `cd C:\work\crew-workspace\cockpit` 로 돌아온다.

9. **계정 둘을 만든다.** 이름은 과제 헌장(`charter.md`)의 `PL:` 과 글자 그대로.
   - 친다: `node bin/cockpit.js init-admin 김피엘 --config cockpit.json` — 비밀번호(8자 이상)를 화면에 안 보이게 두 번 묻는다.
   - 친다: `node bin/cockpit.js add-user 김과제 --config cockpit.json`
   - 확인: `node bin/cockpit.js session-token 김피엘 --config cockpit.json` 이 64자 한 줄을 낸다.

10. **과제를 연다.** 봇 한 줄 · 방 둘 · 세션 한 줄.
    - 친다: `node bin/cockpit.js open-project 수율개선 --config cockpit.json`
    - 확인: `과제 수율개선 · 봇 prodev-수율개선-bot (id …) · 본방 prodev-수율개선 (id …) · 파일방 prodev-수율개선/files (id …)` 한 줄.

11. **서버를 띄운다.** 이 창은 켜 둔다. 끌 때는 Ctrl-C — 세션 상태를 그대로 두고 다음 기동에 이어 붙는다.
    - 친다: `node bin/cockpit.js serve --config cockpit.json`
    - 확인: `cockpit 듣는 중 http://127.0.0.1:3000` 줄.
    - 확인 (**새 PowerShell 창**에서): `Invoke-RestMethod http://127.0.0.1:3000/api/health` → `ok` 가 `True`.

12. **브라우저로 열어 판 셋을 눌러 보고 보이는 것을 적는다.** 화면은 이 걸음에서 처음 사람 눈으로 본다 (meta N13).
    - 연다: `http://127.0.0.1:3000` → 김피엘로 들어간다.
    - 누른다 · 적는다 (칸마다 **무엇이 보였나** 한두 줄, 안 되면 오류 글자 그대로):
      - **과제 탭** — `수율개선` 탭이 하나 보이는가. 채팅 판에 본방 · 파일방이 있고 입력칸에 `@TO(prodev-수율개선-bot) ` 가 채워져 있는가.
      - **조종석 판** — 머리(상태 · 모델 · 계정 · 값 `추정치` · 문맥)가 보이는가. `켜기` 를 누르면 상태가 `켜는 중` → `대기` 로 바뀌는가. 본방에 `@TO(prodev-수율개선-bot) 안녕` 을 보내고 조종석 판에 도구 호출 줄이 생기는가.
      - **파일 판** — 과제 폴더의 폴더들(`cards/` · `wiki/` …)이 보이고, `charter.md` 를 누르면 글이 보이는가.
    - 적은 것을 meta 에 준다.

---

## 따로 — 자원 계측 (W4 전에 meta 가 청하면)

세션 셋을 켠 채 5분 동안 서버와 그 밑 Claude CLI 프로세스들의 상주 메모리를 1분마다 적는다. 값이 든다(haiku 세 턴). 스크래치 자리를 새로 만들어 쓰므로 실제 봇 폴더 · 과제 폴더를 건드리지 않는다.

- 친다: `node smoke/m4-sessions.mjs C:\cockpit-scratch\m4 claude-haiku-4-5-20251001`
- 확인: `RSS_MB <분> <서버> <자식 합>` 줄이 여섯(0~5분). 출력 전체를 meta 에 준다.
- 형제 prodev 가 `C:\work\crew-workspace\prodev` 가 아니면 먼저 `$env:COCKPIT_PRODEV_DIR = "<prodev 경로>"` 한 줄.
