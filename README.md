# cockpit — prodev 봇 세션을 붙들고 사람이 브라우저로 들어와 채팅·진행 열람·승인을 하는 사내망 웹 앱

설계는 `docs/` (PRD · ARCHITECTURE · ADR · TASKS · VERIFICATION), 지금 코드의 모양은 `docs/as-built.md`, 제작 일지는 `docs/log.md`. **윈도우(회사 PC)에 처음 세울 때는 `docs/INSTALL-WINDOWS.md` 를 걸음 순서대로 따른다** — 이 README 는 쓰는 법의 요약이다.

## 필요한 것

- Node 22.13 이상 (`node:sqlite` 를 플래그 없이 쓴다). 네이티브 모듈 · 빌드 · CDN 없음.
- 봇 세션을 켜려면 이 PC 에 Claude 로그인이 있어야 한다.
- 윈도우는 설정 `claudePath` 에 `claude.exe` **절대 경로**가 반드시 있어야 한다 (`(Get-Command claude).Source`). 맥 · 리눅스는 비워 두면 SDK 동봉 CLI 를 쓴다.
- 설정의 경로 넷은 **공백 없는 절대 경로**.
- 봇 폴더는 prodev `scripts/setup.js --project <과제> --cockpit <cockpit.json>` 이 만든다. 허용 · 거부 목록은 봇 폴더의 `.claude/settings.local.json` 에 있다.

## 쓰는 법

### 처음 한 번

맥 · 리눅스 (bash · zsh):

```
npm ci
cp cockpit.example.json cockpit.json
node bin/cockpit.js check --config cockpit.json
node bin/cockpit.js init-admin 김피엘 --config cockpit.json
node bin/cockpit.js add-user 김과제 --config cockpit.json
node bin/cockpit.js open-project worktogether --bot-name prodev-worktogether-비서 --config cockpit.json
```

윈도우 (PowerShell — 명령은 한 줄에 하나, 백틱 이어쓰기 없음):

```powershell
npm ci
Copy-Item cockpit.example.json cockpit.json
notepad cockpit.json
node bin/cockpit.js check --config cockpit.json
node bin/cockpit.js init-admin 김피엘 --config cockpit.json
node bin/cockpit.js add-user 김과제 --config cockpit.json
node bin/cockpit.js open-project worktogether --bot-name prodev-worktogether-비서 --config cockpit.json
```

- `cockpit.json` 의 경로 넷(`botsDir` · `projectsDir` · `uploadsDir` · `dataDir`)을 이 PC 에 맞게 고친다. 윈도우도 슬래시(`C:/…`)로 적어도 된다.
- `check` 는 `✗` 줄이 없어야 한다. `claudePath` 가 있으면 불러서 `✓ claudePath <판>` 을 낸다.
- `init-admin` · `add-user` 는 비밀번호를 화면에 안 보이게 두 번 묻는다(파이프로 주면 첫 줄 하나). 이름은 과제 헌장의 `PL:` 과 글자 그대로.

### 띄우기

맥 · 리눅스:

```
node bin/cockpit.js serve --config cockpit.json
```

윈도우 (PowerShell):

```powershell
node bin/cockpit.js serve --config cockpit.json
```

- `http://127.0.0.1:3000` 에 브라우저로 들어간다. 판 셋(채팅 · 조종석 · 파일). 세션은 admin 이 조종석 판의 `켜기` 로 켠다(`serve --start <과제>` 로 띄우면서 켤 수도 있다).
- 끄기는 Ctrl-C. 세션 상태를 그대로 두고, 다음 `serve` 가 이어 붙는다(resume).
- 사내망에 열려면 설정 `host` 를 `0.0.0.0` 으로 바꾼다 (사람이 정한다).
- 살아 있나: 맥 `curl -s http://127.0.0.1:3000/api/health` · 윈도우 `Invoke-RestMethod http://127.0.0.1:3000/api/health`.

### 설정 예 (`cockpit.json`, 키 풀이는 `docs/ARCHITECTURE.md` 10절)

```json
{
  "botsDir":     "C:/work/crew-workspace/prodev/bots",
  "projectsDir": "C:/work/crew-workspace/projects",
  "uploadsDir":  "C:/cockpit-data/uploads",
  "dataDir":     "C:/cockpit-data",
  "claudePath":  "C:/Users/pl/.local/bin/claude.exe",
  "host": "127.0.0.1", "port": 3000, "maxSessions": 3, "approvalTimeoutMin": 10
}
```

맥이면 경로를 `/Users/<이름>/…` 꼴로 쓰고 `claudePath` 는 빼도 된다.

## 명령

| 명령 | 하는 것 |
|---|---|
| `check` | 노드 판 · 설정 경로 · `claudePath --version` 검사. 어긋나면 `✗` 한 줄씩 · exit 1 |
| `init-admin <이름>` · `add-user <이름> [--role member\|admin]` | 계정 (비밀번호는 표준입력) |
| `session-token <이름> [--days 7]` | 그 계정의 쿠키 `md_session` 값 한 줄 (재생 도구 `prodev/scripts/replay.js` 의 `REPLAY_TOKEN_*` · admin API 호출) |
| `open-project <과제> [--bot-name] [--bot-dir]` | 봇 한 줄 · 방 둘(`prodev-<과제>` · `prodev-<과제>/files`) · 세션 한 줄 |
| `serve [--start <과제>,…] [--model]` | 서버. `--model` · `--no-origin` 은 스모크 · 개발용 |
| `chat <과제> "<글>"` | 서버 없이 글 하나 → 봇 답 하나 (M1 도구, 승인 요청은 전부 거부) |

모든 명령은 `--config <파일>` 을 받는다. 없으면 현재 폴더의 `cockpit.json`.

세션 조작(켜기 · 멈춤 · 압축 · 끄기 · 다시 켜기)은 화면 단추 또는 admin API — 모양은 `docs/ARCHITECTURE.md` 8.3.

## 시험

맥 · 윈도우 같다:

```
npm test
```

- 서버 · SDK · 네트워크 없이 돈다(임시 포트만). 형제 prodev · minidiscord 가 있으면 계약 시험도 돈다 (`COCKPIT_PRODEV_DIR` 로 자리를 바꾼다 — PowerShell 은 `$env:COCKPIT_PRODEV_DIR = "C:/…"` 한 줄 먼저).
- 심볼릭 링크를 못 만드는 기계(윈도우 개발자 모드 꺼짐)에서 건너뛰는 시험은 `docs/as-built.md` 4.1 에 이름으로 있다. 건너뜀은 통과로 세지 않는다.
- 진짜 SDK 스모크는 `smoke/README.md` (`node smoke/m3-restart.mjs <스크래치 폴더> [모델]` 꼴).
