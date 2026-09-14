# cockpit — prodev 봇 세션을 붙들고 사람이 브라우저로 들어와 채팅·진행 열람·승인을 하는 사내망 웹 앱

설계는 `docs/` (PRD · ARCHITECTURE · ADR · TASKS · VERIFICATION), 지금 코드의 모양은 `docs/as-built.md`, 제작 일지는 `docs/log.md`. **윈도우(회사 PC)에 처음 세울 때는 `docs/INSTALL-WINDOWS.md` 를 걸음 순서대로 따른다** — 이 README 는 쓰는 법의 요약이다.

## 필요한 것

- Node 22.13 이상 (`node:sqlite` 를 플래그 없이 쓴다). 네이티브 모듈 · 빌드 · CDN 없음.
- 봇 세션을 켜려면 이 PC 에 Claude 로그인이 있어야 한다.
- 윈도우는 설정 `claudePath` 에 `claude.exe` **절대 경로**가 반드시 있어야 한다 (`(Get-Command claude).Source`). 맥 · 리눅스는 비워 두면 SDK 동봉 CLI 를 쓴다.
- 설정의 경로(`prodevDir` · `botsDir` · `projectsDir` · `uploadsDir` · `dataDir`)는 **공백 없는 절대 경로**. `botsDir` 는 `<prodevDir>/bots` 다.
- (v2) 방(과제)은 **화면의 `+` 로 만든다.** 방을 만들면 cockpit 이 prodev `scripts/setup.js` 를 불러 과제 폴더 · 봇 폴더(`<botsDir>/prodev-<과제>-bot`)까지 만든다. 허용 · 거부 목록은 봇 폴더의 `.claude/settings.local.json` 에 있다.

## 쓰는 법

맥 · 리눅스(bash · zsh)와 윈도우(PowerShell)를 나란히 적는다. PowerShell 은 명령을 한 줄에 하나 — 백틱 이어쓰기를 쓰지 않는다.

### 처음 한 번

| 걸음 | 맥 · 리눅스 | 윈도우 (PowerShell) |
|---|---|---|
| 의존성 | `npm ci` | `npm ci` |
| 설정 한 장 | `cp cockpit.example.json cockpit.json` | `Copy-Item cockpit.example.json cockpit.json` |
| 설정 고치기 | 편집기로 `cockpit.json` | `notepad cockpit.json` |
| 검사 | `node bin/cockpit.js check --config cockpit.json` | `node bin/cockpit.js check --config cockpit.json` |
| admin 계정 | `node bin/cockpit.js init-admin 김피엘 --config cockpit.json` | `node bin/cockpit.js init-admin 김피엘 --config cockpit.json` |
| member 계정 | `node bin/cockpit.js add-user 김과제 --config cockpit.json` | `node bin/cockpit.js add-user 김과제 --config cockpit.json` |
| (v1 DB 를 이어 쓸 때만) 옛 files 방 보관 | `node bin/cockpit.js migrate-v2 --apply --config cockpit.json` | `node bin/cockpit.js migrate-v2 --apply --config cockpit.json` |

- `cockpit.json` 의 경로를 이 PC 에 맞게 고친다. 윈도우도 슬래시(`C:/…`)로 적어도 된다.
- `check` 는 `✗` 줄이 없어야 한다. `claudePath` 가 있으면 불러서 `✓ claudePath <판>` 을, `prodevDir` 를 적었으면 `✓ prodevDir … — setup.js 있음` 을 낸다.
- `init-admin` · `add-user` 는 비밀번호를 화면에 안 보이게 두 번 묻는다(파이프로 주면 첫 줄 하나). 이름은 과제 헌장의 `PL:` 과 글자 그대로.
- `migrate-v2` 는 `--apply` 없이 돌리면 보관할 방을 보이기만 한다. 새로 세우는 자리(빈 `dataDir`)에서는 필요 없다.
- 과제는 여기서 열지 않는다 — 서버를 띄운 뒤 화면의 `+` 로 만든다(아래).

### 띄우기 · 방 만들기

| 걸음 | 맥 · 리눅스 | 윈도우 (PowerShell) |
|---|---|---|
| 서버 | `node bin/cockpit.js serve --config cockpit.json` | `node bin/cockpit.js serve --config cockpit.json` |
| 살아 있나 | `curl -s http://127.0.0.1:3000/api/health` | `Invoke-RestMethod http://127.0.0.1:3000/api/health` |

- `http://127.0.0.1:3000` 에 브라우저로 들어가 admin 으로 로그인한다.
- **사이드바의 `+` → 과제 이름**(예 `수율개선`). 방 `prodev-수율개선` 과 봇 `prodev-수율개선-bot` 이 생기고, 그 뒤에서 setup 이 봇 폴더를 만든다. setup 이 실패하면 오류 줄이 뜨고 만든 것을 되돌린다.
- 새 봇 폴더에서 `claude` 를 한 번 켜 폴더를 신뢰한다 (`docs/INSTALL-WINDOWS.md` 11번).
- 오른쪽 조종석 판(머리의 판 단추로 접고 편다)에서 admin 이 `켜기` 로 세션을 켠다. `serve --start <과제>` 로 띄우면서 켤 수도 있다.
- 방의 글: 입력칸에 `@TO(prodev-<과제>-bot) ` 가 미리 채워진다. **봉투(`@TO` · `@CC`)를 지우고 보내면 사람끼리 글** — 봇에게 안 간다. 나중에 `@TO(봇) 위 파일 봐 줘` 로 부르면 봇이 대화 · 첨부를 따라잡는다.
- 끄기는 Ctrl-C. 세션 상태를 그대로 두고, 다음 `serve` 가 이어 붙는다(resume).
- 사내망에 열려면 설정 `host` 를 `0.0.0.0` 으로 바꾼다 (사람이 정한다).
- 판을 새로 올려도 강력 새로고침은 필요 없다 — 정적 파일은 `etag` 로 재검증한다. 올리는 걸음(`git pull --ff-only` 둘 · `npm ci` · serve 다시 띄우기)은 `docs/INSTALL-WINDOWS.md` 의 "판 올리기" 절.

### 설정 예 (`cockpit.json`, 키 풀이는 `docs/ARCHITECTURE.md` 10절)

```json
{
  "prodevDir":   "C:/work/crew-workspace/prodev",
  "botsDir":     "C:/work/crew-workspace/prodev/bots",
  "projectsDir": "C:/work/crew-workspace/projects",
  "uploadsDir":  "C:/cockpit-data/uploads",
  "dataDir":     "C:/cockpit-data",
  "claudePath":  "C:/Users/pl/.local/bin/claude.exe",
  "host": "127.0.0.1", "port": 3000, "maxSessions": 3, "approvalTimeoutMin": 10
}
```

맥이면 경로를 `/Users/<이름>/…` 꼴로 쓰고 `claudePath` 는 빼도 된다. `prodevDir` 를 빼면 `botsDir` 의 부모로 짐작한다(`check` 가 `·` 한 줄로 알린다).

## 명령

| 명령 | 하는 것 |
|---|---|
| `check` | 노드 판 · 설정 경로 · `prodevDir` 의 `setup.js` · `claudePath --version` 검사. 어긋나면 `✗` 한 줄씩 · exit 1 |
| `init-admin <이름>` · `add-user <이름> [--role member\|admin]` | 계정 (비밀번호는 표준입력) |
| `session-token <이름> [--days 7]` | 그 계정의 쿠키 `md_session` 값 한 줄 (재생 도구 `prodev/scripts/replay.js` 의 `REPLAY_TOKEN_*` · admin API 호출) |
| `serve [--start <과제>,…] [--model]` | 서버. `--model` · `--no-origin` 은 스모크 · 개발용 |
| `migrate-v2 [--apply]` | (v2) v1 DB 의 옛 files 방을 보관한다. `--apply` 없으면 보이기만 |
| `open-project <과제> [--no-setup] [--bot-name] [--bot-dir]` | 화면 `+` 와 같은 일(방 하나 · 봇 한 줄 · setup). **사람은 화면 `+` 를 쓴다.** CLI 는 스모크 · 재생용이고, `--no-setup` 은 setup 을 건너뛰어 이미 있는 봇 폴더(스크래치 · 옛 봇 이름)를 잇는다 |
| `chat <과제> "<글>"` | 서버 없이 글 하나 → 봇 답 하나 (M1 도구, 승인 요청은 전부 거부) |

모든 명령은 `--config <파일>` 을 받는다. 없으면 현재 폴더의 `cockpit.json`.

세션 조작(켜기 · 멈춤 · 압축 · 끄기 · 다시 켜기)은 조종석 판 단추 또는 admin API — 모양은 `docs/ARCHITECTURE.md` 8.3.

## 시험

맥 · 윈도우 같다:

```
npm test
```

- 서버 · SDK · 네트워크 없이 돈다(임시 포트만). 형제 prodev · minidiscord 가 있으면 계약 시험도 돈다 (`COCKPIT_PRODEV_DIR` 로 자리를 바꾼다 — 맥은 `COCKPIT_PRODEV_DIR=/… npm test`, PowerShell 은 `$env:COCKPIT_PRODEV_DIR = "C:/…"` 한 줄 먼저).
- 심볼릭 링크를 못 만드는 기계(윈도우 개발자 모드 꺼짐)에서 건너뛰는 시험은 `docs/as-built.md` 4.1 에 이름으로 있다. 건너뜀은 통과로 세지 않는다.
- 진짜 SDK 스모크는 `smoke/README.md` (`node smoke/m5-room.mjs <스크래치 폴더> [모델]` 꼴).
