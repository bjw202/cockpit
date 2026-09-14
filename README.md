# cockpit — prodev 봇 세션을 붙들고 사람이 브라우저로 들어와 채팅·진행 열람·승인을 하는 사내망 웹 앱

설계는 `docs/` (PRD · ARCHITECTURE · ADR · TASKS · VERIFICATION), 지금 코드의 모양은 `docs/as-built.md`, 제작 일지는 `docs/log.md`.

## 필요한 것

- Node 22.13 이상 (`node:sqlite` 를 플래그 없이 쓴다). 네이티브 모듈 · 빌드 · CDN 없음.
- 봇 세션을 켜려면 이 PC 에 Claude 로그인이 있어야 한다. 윈도우는 설정 `claudePath` 에 `claude.exe` 절대 경로.

## 처음 한 번

```
npm ci
cp cockpit.example.json cockpit.json      # 경로 넷을 이 PC 에 맞게 고친다 (공백 없는 절대 경로)
node bin/cockpit.js check                 # ✗ 줄이 없어야 한다
echo '<비밀번호>' | node bin/cockpit.js init-admin 김피엘     # 이름은 charter 의 PL: 과 글자 그대로
echo '<비밀번호>' | node bin/cockpit.js add-user 김과제
node bin/cockpit.js open-project worktogether --bot-name prodev-worktogether-비서
```

터미널에서 `init-admin` · `add-user` 를 파이프 없이 치면 비밀번호를 화면에 안 보이게 두 번 묻는다.

## 띄우기

```
node bin/cockpit.js serve --config cockpit.json --start worktogether
```

`http://127.0.0.1:3000` 에 브라우저로 들어간다. Ctrl-C 로 끄면 세션 상태를 그대로 두고, 다음 `serve` 가 resume 한다.
사내망에 열려면 설정 `host` 를 `0.0.0.0` 으로 바꾼다 (사람이 정한다).

설정 예 (`cockpit.json`, 키 풀이는 `docs/ARCHITECTURE.md` 10절):

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

## 명령

| 명령 | 하는 것 |
|---|---|
| `check` | 노드 판 · 설정 경로 검사 |
| `init-admin <이름>` · `add-user <이름> [--role member\|admin]` | 계정 (비밀번호는 표준입력) |
| `session-token <이름> [--days 7]` | 그 계정의 쿠키 `md_session` 값 한 줄 (재생 도구 `prodev/scripts/replay.js` 의 `REPLAY_TOKEN_*`) |
| `open-project <과제> [--bot-name] [--bot-dir]` | 봇 한 줄 · 방 둘(`prodev-<과제>` · `prodev-<과제>/files`) · 세션 한 줄 |
| `serve [--start <과제>,…] [--model]` | 서버. `--model` 은 스모크 · 개발용 |
| `chat <과제> "<글>"` | 서버 없이 글 하나 → 봇 답 하나 (M1 도구, 승인 요청은 전부 거부) |

모든 명령은 `--config <파일>` 을 받는다. 없으면 현재 폴더의 `cockpit.json`.

## 시험

```
npm test                         # 서버 · SDK · 네트워크 없이 (임시 포트만). 형제 prodev · minidiscord 가 있으면 계약 시험도 돈다
node smoke/m2-approval.mjs <스크래치 폴더> [모델]   # 진짜 SDK — smoke/README.md
```
