// 출처 핀: minidiscord web/app.js — 저장소 핀 6633f7b, 이 파일이 마지막으로 바뀐 커밋 a44ecf8 2026-09-11, 원본 sha256 a951b3c51ac9acd7d65041f968894652444cce42f3a353d315d7101710609395
// cockpit 이 ARCHITECTURE 7.3 표의 자리를 고쳤다 — 위 sha256 은 고치기 전 원본의 것이다. 원본과 달라진 최상위 함수는 test/web-static.test.js 가 센다.
/*
 * minidiscord 웹 셸 로직 (SPEC-WEBSHELL-001) + 채팅 화면 (SPEC-WEBCHAT-001)
 *
 * 이 파일은 카드 t5 의 세 SPEC 이 결합하는 계약 표면이다 — SPEC-WEBSHELL-001 §4.8 의 여섯 계약이
 * 모듈 형식·state 확장·export 집합·요소 소유권·토큰 경로·네트워크 호출 동결을 정한다.
 * 형제 SPEC(SPEC-WEBCHAT-001·SPEC-WEBRICH-001)은 자기 필드와 자기 함수를 자기 초기화
 * 코드에서 더한다. 웹 셸 부분은 채팅 내부를 만지지 않고, 채팅 부분(파일 끝 블록)은
 * 셸의 아홉 함수 본문에 손대지 않는다.
 */

// @MX:WARN: [AUTO] 파일이 약 700줄로 상한 500 을 넘는다 — 그러나 세 SPEC(WEBSHELL·WEBCHAT·WEBRICH)이 이 한 파일을 계약 표면으로 결합해 있어, 분할은 SPEC-WEBSHELL-001 §4.8 계약(export 집합·아홉 함수 본문 동결) 개정 없이는 할 수 없다
// @MX:REASON: 리팩터링 대상이 아니라 계약 표면이다 — 함수를 옮기면 형제 SPEC 의 수용 기준이 깨진다. 줄 수 경고를 근거로 쪼개지 말 것
// ── 상태 ───────────────────────────────────────────────────────────────
// 재대입되지 않는 모듈 수준 객체. 이 SPEC 이 초기화하는 것은 세 필드뿐이고,
// 그 밖의 필드는 그것을 쓰는 형제 SPEC 이 스스로 선언·초기화한다 (§4.8 계약 2).
export const state = {
  rooms: { active: [], archived: [] },
  bots: [],
  currentRoomId: null,
}

// document.getElementById 축약 — 형제 SPEC 둘이 의존 표면으로 적은 이름이다 (§4.8 계약 3).
export function $(id) {
  return document.getElementById(id)
}

// ── fetch 래퍼 ─────────────────────────────────────────────────────────
// 직렬화·쿠키 동반·오류 변환·401 처리를 한 곳에 모은다 (REQ-WEBSHELL-006·007).
export async function api(path, opts = {}) {
  const init = { credentials: 'same-origin', ...opts }
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    init.headers = { ...(init.headers ?? {}), 'content-type': 'application/json' }
    init.body = JSON.stringify(init.body)
  }
  const res = await fetch(path, init)
  if (!res.ok) {
    // 응답 본문의 error 필드가 오류 문구가 되고, 없으면 상태 코드로 만든다
    let message = `HTTP ${res.status}`
    try {
      const data = await res.json()
      if (data && typeof data.error === 'string') message = data.error
    } catch { /* 본문이 JSON 이 아니면 폴백 문구를 그대로 쓴다 */ }
    // 보호 경로의 401 → 인증 뷰로 되돌린다. /auth/ 경로는 입력값과 오류 문구가
    // 함께 사라지지 않도록 화면을 건드리지 않는다 (REQ-WEBSHELL-007).
    if (res.status === 401 && !path.includes('/auth/')) showAuth()
    throw new Error(message)
  }
  return res.json()
}

// ── 화면 전환 ─────────────────────────────────────────────────────────
export function showAuth() {
  $('auth-view').hidden = false
  $('main-view').hidden = true
}

export function showMain() {
  $('auth-view').hidden = true
  $('main-view').hidden = false
}

// ── 방 목록 ───────────────────────────────────────────────────────────
// 방 행은 # + 앞머리 + 꼬리 세 span 이고 보관 버튼은 활성 방에만 있다.
// 이 구조와 클래스 이름은 SPEC-WEBUI-001 §5.1 — 꼬리는 줄이지 않는다 (줄어드는 것은 앞머리뿐).
export function renderRooms() {
  const roomList = $('room-list')
  roomList.innerHTML = ''
  for (const room of state.rooms.active) {
    const item = document.createElement('li')
    item.className = 'room-item'
    if (room.id === state.currentRoomId) item.classList.add('active')
    item.append(...roomNameSpans(room.name))
    const archiveBtn = document.createElement('button')
    archiveBtn.type = 'button'
    archiveBtn.className = 'archive-btn'
    // 아이콘만 남으므로 접근 가능한 이름을 속성으로 갖는다 (REQ-WEBUI-003).
    // 감춤은 opacity 로만 한다 — DOM·탭 순서에는 늘 있다.
    archiveBtn.setAttribute('aria-label', '방 보관')
    archiveBtn.title = '방 보관'
    archiveBtn.appendChild(svgIcon(16, ['M3 8l1.5-4h15L21 8', 'M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8', 'M10 12h4']))
    // 버튼 클릭이 방 열기까지 전파되지 않게 한다
    archiveBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      archiveRoom(room.id)
    })
    if (state.user?.role === 'admin') item.appendChild(archiveBtn)   // (cockpit) 보관은 admin 만 (F22)
    item.addEventListener('click', () => openRoom(room.id))
    roomList.appendChild(item)
  }

  const archivedList = $('archived-list')
  archivedList.innerHTML = ''
  for (const room of state.rooms.archived) {
    const item = document.createElement('li')
    item.className = 'room-item'
    item.append(...roomNameSpans(room.name))
    item.addEventListener('click', () => openRoom(room.id))
    archivedList.appendChild(item)
  }
}

// 방 이름 분해 — 앞머리는 마지막 '/' 까지(포함), 꼬리는 나머지(구별되는 부분). '/' 가 없으면
// 앞머리가 빈 문자열이고, 그렇게 나눈 꼬리가 빈 문자열이면(이름이 '/' 로 끝날 때) 나누지 않고
// 이름 전체를 꼬리로 둔다 — 구별되는 부분이 하나도 안 보이는 행을 만들지 않기 위해서다 (REQ-WEBUI-001).
function splitRoomName(name) {
  const i = name.lastIndexOf('/')
  if (i === -1) return { prefix: '', tail: name }
  const tail = name.slice(i + 1)
  if (tail === '') return { prefix: '', tail: name }
  return { prefix: name.slice(0, i + 1), tail }
}

// 방 행의 세 span — 앞머리가 빈 문자열이어도 DOM 에 만든다. 구조가 이름에 따라 달라지면
// 그 구조에 기대는 시험이 입력에 따라 붉어졌다 푸르렀다 한다. 세 span 의 문자열은 전부
// textContent 로만 넣는다 — 방 이름은 다른 사용자가 등록할 수 있는 신뢰 경계 밖 문자열이다.
function roomNameSpans(name) {
  const { prefix, tail } = splitRoomName(name)
  const hash = document.createElement('span')
  hash.className = 'room-hash'
  hash.textContent = '#'
  const pre = document.createElement('span')
  pre.className = 'room-prefix'
  pre.textContent = prefix
  const tailSpan = document.createElement('span')
  tailSpan.className = 'room-name'
  tailSpan.textContent = tail
  return [hash, pre, tailSpan]
}

// 인라인 SVG 아이콘 — createElementNS 로만 만든다. web/ 의 어느 .js 도 innerHTML 에 빈
// 문자열 외의 값을 넣을 수 없다(SPEC-WEBMD-010 REQ-WEBMD-005) — 마크업 파싱 API 금지가
// 사용자 문자열 없는 정적 아이콘에도 그대로 걸린다. 색 리터럴 없이 currentColor 로 그린다(REQ-WEBUI-016).
function svgIcon(size, paths) {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('d', d)
    svg.appendChild(p)
  }
  return svg
}

export async function loadRooms() {
  state.rooms = await api('/api/rooms')
  renderRooms()
}

// (cockpit) 봇 목록 대신 과제 목록 — 방마다 전용 봇 하나라 방 봇 칩 · 자동완성 · 판이 이것을 읽는다 (R13 · ARCHITECTURE 7.3)
export async function loadProjects() {
  const { projects } = await api('/api/projects')
  state.projects = projects
}

// ── 인증 ───────────────────────────────────────────────────────────────
// (cockpit) 이름과 비밀번호로 들어온다 — 계정은 admin 이 만든다 (ADR-011 · F13).
// 실패 시 #auth-error 에 서버 문구를 띄우고 되던진다 — 화면은 인증 뷰에 머문다 (REQ-WEBSHELL-008).
export async function login(username, password) {
  try {
    await api('/api/auth/login', { method: 'POST', body: { username, password } })
  } catch (err) {
    const el = $('auth-error')
    el.textContent = err instanceof Error ? err.message : String(err)
    el.hidden = false
    throw err
  }
  showMain()
  // 로그인 자체는 성공했지만 이어지는 목록 적재가 401 로 막히는 경우가 있다 — 브라우저가
  // 쿠키 저장을 거부하면 Set-Cookie 가 무시돼 보호 경로(rooms·bots)가 401 이 되고, api() 의
  // 401 처리가 인증 뷰로 되돌려 놓지만 어디에도 문구가 없어 무반응처럼 보인다. 이 구간의
  // 실패는 세션 유지 실패 문구로 보인다 (카드 t32 §D — «성공해도 메시지가 없어 디버깅 불가»).
  // 인증 실패(위 catch, 서버 401 문구)와 겹치지 않게 로딩 구간만 별도로 처리한다.
  try {
    await loadRooms()
    await loadProjects()
  } catch (err) {
    const el = $('auth-error')
    el.textContent = '로그인은 됐지만 세션을 유지하지 못했습니다 — 브라우저 쿠키 설정을 확인하세요'
    el.hidden = false
    throw err
  }
}

// 서버 세션을 끊고 state 세 필드를 초기값으로 되돌린 뒤 인증 뷰로 간다 (REQ-WEBSHELL-012).
export async function logout() {
  await api('/api/auth/logout', { method: 'POST' })
  state.rooms = { active: [], archived: [] }
  state.projects = []
  state.currentRoomId = null
  if (state.sse) { state.sse.close(); state.sse = null }   // (cockpit) 앱 흐름 하나를 닫는다 (ADR-012)
  showAuth()
}

// ── 계정 바의 «현재 사용자 이름» 출처 (SPEC-WEBUI-001 §4.5) ──────────────
// 읽기 전용 라우트 하나가 이름의 유일한 출처다(REQ-WEBUI-014). login() 이 받은 문자열로
// state.user 를 직접 채우는 지름길은 쓰지 않는다 — login() 에는 id 가 없어 반쯤 빈 모양이
// 되고, 출처가 둘이 되면 복구 경로와 로그인 경로가 어긋날 수 있다. 이 함수는 계약 6 의
// 아홉 함수 밖이다 — 호출은 initApp() 안에만 산다.
export async function loadMe() {
  state.user = await api('/api/auth/me')
  renderAccountBar()
}

// 계정 바 렌더 — state.user 가 없으면 빈 칸으로 둔다. 아바타는 이름 첫 글자(REQ-WEBUI-012).
function renderAccountBar() {
  const bar = document.querySelector('#sidebar .account-bar')
  if (!bar) return
  const name = state.user?.username ?? ''
  const avatar = bar.querySelector('.account-avatar')
  const nameEl = bar.querySelector('.account-name')
  if (avatar) avatar.textContent = [...name][0] ?? ''
  if (nameEl) nameEl.textContent = name
}

// ── 방·봇 생성/보관 액션 ──────────────────────────────────────────────
// 서버 오류를 삼키지 않고 #error-toast 에 문구를 띄운다 (REQ-WEBSHELL-010, plan.md §D 4번).
// 이 다섯 액션 함수의 네트워크 호출 순서와 개수는 고정이다 (§4.8 계약 6).
export async function createRoom(name) {
  try {
    await api('/api/rooms', { method: 'POST', body: { name } })
  } catch (err) {
    toastError(err)
    return
  }
  await loadRooms()
}

export async function archiveRoom(id) {
  try {
    await api(`/api/rooms/${id}/archive`, { method: 'POST' })
  } catch (err) {
    toastError(err)
    return
  }
  await loadRooms()
}

function toastError(err) {
  const toast = $('error-toast')
  toast.textContent = err instanceof Error ? err.message : String(err)
  // 성공 토스트의 4초 자동 숨김 창 안에 오류가 나면 성공 클래스가 남아 오류 문구가
  // 성공색으로 보인다 — 거둔다 (카드 t32 §D 잔여 수리).
  toast.classList.remove('toast-success')
  toast.hidden = false
}

// ── 방 열기 ──────────────────────────────────────────────────────────
// 이름과 시그니처는 웹 셸 SPEC 이 확정했고 본체는 채팅 SPEC 이 채운다 (§4.8 계약 3).
// 단계 순서는 REQ-WEBCHAT-002 의 0~9 단계 그대로다 — initChat 이 어떤 단계보다 먼저다.
export async function openRoom(id) {
  // 0단계 — 채팅 전용 state 필드를 만들고 작성기 핸들러를 건다
  initChat()
  // 1단계 — (cockpit) 스트림은 방마다 열고 닫지 않는다. 로그인 뒤 앱 흐름 하나가 열려 있다 (openAppStream · ADR-012)
  // 2단계 — 이전 방의 stale 타이머를 전부 해제하고 working·stale 표시를 비운다
  for (const key of Object.keys(state.staleTimers)) {
    clearTimeout(state.staleTimers[key])
    delete state.staleTimers[key]
  }
  state.workingBots.clear()
  state.staleBots.clear()
  // 3단계 — 방 세대를 올리고 이번 방의 세대를 지역 변수에 잡아 둔다
  state.roomGeneration += 1
  const generation = state.roomGeneration
  // 3-1단계 — 등록된 장식 팩토리가 있으면 이 방 전용 컨텍스트를 새로 만든다
  roomDecorator = decoratorFactory ? decoratorFactory({ api, doc: document }) : null
  // 4단계 — 현재 방을 갱신하고 사이드바를 다시 그린다
  state.currentRoomId = id
  renderRooms()
  // 5단계 — 제목과 메시지 목록을 이 방의 것으로 초기화한다.
  // 방을 찾지 못하면 방 번호를 쓴다 — "# undefined" 를 화면에 보내지 않는다.
  const room = [...state.rooms.active, ...state.rooms.archived].find(r => r.id === id)
  $('room-title').textContent = `# ${room ? room.name : id}`
  $('messages').innerHTML = ''
  lastRenderedMsg = null   // 턴 그룹핑 기준점도 새 방에서 다시 산다
  hideAutocomplete()
  // 6단계 — 과거 대화를 받아 순서대로 그린다. 서버는 한 번에 최대 200건만 준다
  // (routes-messages.ts REQ-MSG-011) — 한 번만 부르면 가장 오래된 200건에서 끊기고, 그 뒤
  // 구간은 SSE 로도 오지 않아 DB 에는 있는데 화면에서만 사라진다. 그래서 응답이 꽉 차 있으면
  // 마지막 id 를 커서로 삼아 다 받을 때까지 이어 받는다. 서버의 LIMIT 은 올리지 않는다 —
  // 상한을 키우는 방식은 방이 커질수록 같은 결함이 다시 난다.
  const PAGE = 200        // 서버 LIMIT 과 같은 값. 서버가 더 적게 주면 첫 쪽에서 멈추고, 더 주면 한 번 더 부른다
  let cursor = 0          // 마지막으로 그린 메시지의 id. 첫 요청은 커서 없이 보낸다(after=0 과 같은 뜻)
  for (;;) {
    const page = await api(`/api/rooms/${id}/messages${cursor ? `?after=${cursor}` : ''}`)
    if (generation !== state.roomGeneration) return   // 늦게 도착한 응답은 버린다 (REQ-WEBCHAT-014)
    for (const m of page.messages) renderMessage(m)
    if (page.messages.length === 0) break
    cursor = page.messages[page.messages.length - 1].id   // id 는 오름차순이라 커서는 반드시 오른다 — 무한 반복이 없다
    if (page.messages.length < PAGE) break
  }
  // 초기 로드가 그린 마지막 id 를 재연결 백필의 커서로 세운다 (REQ-WEBCHAT-008).
  // 0 으로 두면 재연결이 after=0 으로 나가 앞 200건을 다시 그린다.
  state.lastEventId = cursor
  // 7단계 — 맨 아래로 스크롤한다
  scrollMessages()
  // 8단계 — 초대 목록을 받아 캐시하고 봇 칩을 그린다
  await refreshRoomBots()
  // 9단계 — (cockpit) 작성기에 @TO(봇) 을 미리 채운다 — 지우면 사람끼리의 글 (ADR-018) · 판이 이 방의 과제를 따른다 (ADR-019)
  if (generation !== state.roomGeneration) return
  const project = projectOfRoom(state.projects, id)
  const fill = prefillValue({ value: $('msg-input').value, bot: project?.bot, archived: room?.status === 'archived' })
  if (fill !== null) { $('msg-input').value = fill; refreshSendState() }
  $('msg-input').placeholder = composerHint($('msg-input').value)
  panelFollow(project?.name ?? null)
}

// ── 이름 입력 다이얼로그 ──────────────────────────────────────────────
// returnValue 는 다이얼로그가 닫힐 때 정해지므로 close 이벤트에서 읽는다 (plan.md §D 3번).
// addEventListener 는 쌓이므로 { once: true } 로 각 호출의 리스너가 한 번만 살게 한다.
export function promptText(label) {
  const dialog = $('prompt-dialog')
  $('prompt-label').textContent = label
  $('prompt-input').value = ''
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok' ? $('prompt-input').value.trim() : null)
    }, { once: true })
    dialog.showModal()
  })
}

// ── 부트스트랩 ─────────────────────────────────────────────────────────
// index.html 의 인라인 모듈 스크립트가 부른다. 폼 핸들러를 걸고
// 살아 있는 세션이 있는지 한 번 물어본 뒤 화면을 정한다 (REQ-WEBSHELL-008).
export function initApp() {
  // 계정 바가 쓸 사용자 필드를 스스로 선언·초기화한다 (§4.8 계약 2, SPEC-WEBUI-001 REQ-WEBUI-014)
  state.user = null
  state.projects = []   // (cockpit) 봇 목록 대신 과제 목록 (ARCHITECTURE 7.3)
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await login($('login-username').value.trim(), $('login-password').value)
      $('login-password').value = ''
      // 로그인 성공 뒤 이름 · 역할을 되묻는다 — 역할이 있어야 보관 아이콘 · 방 만들기 단추를 가른다
      await loadMe()
      renderRooms()
      $('new-room-btn').hidden = state.user?.role !== 'admin'   // (cockpit) 방 만들기 = 봇 생성은 admin 만 (ADR-017)
      openAppStream()
      initPanel({ role: state.user?.role, getProjects: () => state.projects, onChanged: async () => { await loadProjects(); await refreshRoomBots() } })
    } catch { /* login 이 이미 #auth-error 를 채웠다 */ }
  })
  $('new-room-btn').addEventListener('click', async () => {
    const name = await promptText('새 방(과제) 이름')
    if (name) await createRoom(name)
  })
  $('logout-btn').addEventListener('click', () => { logout() })

  // 세션이 살아 있으면 메인 화면으로, 아니면 인증 화면으로. (cockpit) 이름 · 역할을 먼저 받는다 — 방 목록의 보관 아이콘이 역할을 본다
  loadMe()
    .then(() => loadRooms())
    .then(() => loadProjects())
    .then(() => {
        $('new-room-btn').hidden = state.user?.role !== 'admin'   // (cockpit) 방 만들기 = 봇 생성은 admin 만 (ADR-017)
        openAppStream()
        initPanel({ role: state.user?.role, getProjects: () => state.projects, onChanged: async () => { await loadProjects(); await refreshRoomBots() } })
      showMain()
    })
    .catch(() => showAuth())
}

// ══ 채팅 화면 (SPEC-WEBCHAT-001) ══════════════════════════════════════
// 이 블록부터는 채팅 SPEC 의 영역이다. 웹 셸의 여덟 함수(api·login·logout·
// loadRooms·loadBots·createRoom·archiveRoom·createBot) 본문은 건드리지 않는다(§4.8 계약 6).

// 장식 팩토리 — SPEC-WEBRICH-001 이 모듈 최상위에서 등록한다 (배선 계약, spec.md §4.6).
// 등록이 없으면 roomDecorator 는 null 이고 renderMessage 는 훅을 부르지 않는다.
let decoratorFactory = null
let roomDecorator = null
let chatReady = false

// 채팅 전용 state 필드 일곱 개는 이 함수가 만든다 — 형제 웹 셸은 세 필드만 초기화한다(§4.8 계약 2).
// openRoom 의 0단계에서 불리며 멱등이다: 두 번째 호출은 아무것도 덮어쓰지 않는다.
// 덮어쓰면 방 세대가 리셋돼 늦은 응답 격리(REQ-WEBCHAT-014)가 깨진다.
export function initChat() {
  if (chatReady) return
  state.sse = null
  state.workingBots = new Set()
  state.staleTimers = {}
  state.staleBots = new Set()
  state.lastEventId = 0
  state.roomBots = []
  state.roomGeneration = 0
  // 작성기 이벤트 핸들러 — 한 번만 건다 (REQ-WEBCHAT-016)
  const composer = $('msg-input')
  composer.addEventListener('input', onComposerInput)
  composer.addEventListener('keydown', onComposerKeyDown)
  // 캡쳐 붙여넣기 — 초점이 있는 편집 요소에서 발화하므로 입력칸에 건다 (SPEC-WEBATTACH-001 D5).
  // document 에 걸면 자동완성 목록·메시지 본문의 붙여넣기까지 가로채 요청 범위를 넘는다.
  composer.addEventListener('paste', onComposerPaste)
  // 끌어놓기 — 받는 자리는 작성기 영역뿐이다 (운영자 결정 D1). 요소 수준 청취자는 body 교체마다
  // 요소가 새로 만들어지므로 쌓일 대상이 없다 — 쌓이는 것은 문서 수준뿐이고 그쪽은 표지가 막는다.
  const box = $('composer-box')
  box.addEventListener('dragenter', onComposerDragEnter)
  box.addEventListener('dragover', onComposerDragOver)
  box.addEventListener('dragleave', onComposerDragLeave)
  box.addEventListener('drop', onComposerDrop)
  installDocumentDropGuard()
  // 첨부 선택 표시 — 무엇이 함께 나갈지 보이지 않으면 사용자는 첨부 여부를 알 수 없다 (카드 t32 D-7)
  $('file-input').addEventListener('change', onFilePicked)
  $('send-btn').addEventListener('click', () => { sendMessage() })
  // index.html 이 실은 aria-disabled 초기값을 실제 상태로 확정한다 — 이 호출이 없으면
  // 화면상 옳아 보이면서 상태와 표시가 영원히 어긋난다 (REQ-WEBUI-011 [HARD], 감사 F12)
  refreshSendState()
  chatReady = true
}

// 장식 팩토리를 등록한다. 방을 열 때마다 factory({ api, doc }) 를 새로 불러
// 그 방 전용 컨텍스트를 만든다 — 방 국소 상태가 방을 넘어가지 않게 한다.
export function registerMessageDecorator(factory) {
  decoratorFactory = factory
}

// ── 렌더 ─────────────────────────────────────────────────────────────
// div.message.<author_type> > (span.msg-avatar, div.msg-head, div.msg-body)
// SPEC-WEBUI-001 §5.2 — 직계 자식 셋. 그리드 2열 배치이며 감싸는 컨테이너를 넣지 않는다.
// 시각은 .msg-time 클래스로 지목한다 (봇 메시지에서는 .bot-badge 가 먼저 온다).
// 사용자·봇·시스템이 만든 문자열은 전부 textContent 로만 넣는다 (REQ-WEBCHAT-004).

// 턴 그룹핑 — 같은 사람의 연속 메시지를 한 뭉치로 보기 위한 기준점(마지막으로 그린 메시지).
// 방을 열어 #messages 를 비울 때 null 로 되돌린다 (openRoom 5단계).
let lastRenderedMsg = null

// 같은 턴인가 — 작성자 신원이 같고 5분 안의 연속이면 한 뭉치로 본다(디스코드 관례). 시스템
// 서버 시각 파싱 — 서버는 created_at 을 SQLite `datetime('now')` 로 만들어 «UTC» 를
// 'YYYY-MM-DD HH:MM:SS' 로 준다. 이 문자열에는 시간대 표기가 없어 브라우저가 «로컬 시각» 으로
// 해석하므로, 표기를 붙여 UTC 로 못박는다. 이미 표기가 붙어 있으면(Z 또는 ±HH:MM) 그대로 쓴다.
// 읽지 못하면 NaN 을 돌려 부르는 쪽이 실패 방향을 고르게 한다 — 조용히 지금 시각으로 때우지 않는다.
function parseServerTime(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return NaN
  const iso = s.replace(' ', 'T')
  return Date.parse(/[Zz]$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
}

// 화면에 찍을 시각 — 저장된 UTC 값을 그대로 두고 «(UTC)» 표기만 붙인다 (2026-09-09 운영자
// 결정). 보는 사람의 시간대로 옮기면 화면·DB·봇 이력이 저마다 다른 기준을 쓰게 돼 어느 쪽이
// 기준인지 헷갈린다 — 기준 하나로 통일하고 그 기준을 화면에 밝히는 쪽을 택했다.
// 표기를 붙이지 않는 경우 둘: UTC 가 아닌 오프셋(+09:00 등)이 붙어 온 값과 읽지 못하는 값이다.
// 틀린 기준을 붙이는 것은 아무것도 안 붙이는 것보다 나쁘고, 읽지 못한 값은 원문이 그대로 보여야 한다.
function displayTime(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (/[+-]\d\d:?\d\d$/.test(s)) return s
  return Number.isFinite(parseServerTime(s)) ? `${s} (UTC)` : s
}

// 메시지는 승인·상태 전이 하나하나가 눈에 띄어야 하므로 묶지 않고, 시각 파싱에 실패하면
// 실패 방향인 «다른 턴» 으로 본다 (2026-09-09 운영자 결정: 말풍선 대신 그룹핑으로 턴을 구분).
function sameTurn(a, b) {
  if (!a || !b) return false
  if (a.author_type !== b.author_type) return false
  if ((a.author_name ?? '') !== (b.author_name ?? '')) return false
  if (a.author_type === 'bot' && (a.author_bot_id ?? 0) !== (b.author_bot_id ?? 0)) return false
  if (a.author_type === 'system') return false
  const ta = parseServerTime(a.created_at)
  const tb = parseServerTime(b.created_at)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false
  return Math.abs(tb - ta) <= 5 * 60 * 1000
}

// 아바타 색 — 작성자마다 고정된 다섯 역할색 순환 (REQ-WEBUI-006). 봇은 author_bot_id,
// 사람은 author_user_id 를 키로 쓴다. 사람의 키가 없을 때 이름 코드 단위 합으로 갈라뜨린다 —
// 키가 undefined 면 모든 사람이 같은 색이 되어 «개인을 가른다»는 목적이 조용히 무너진다.
// system 은 색 클래스를 붙이지 않는다(CSS 가 패널 배경·흐린 글자로 그린다).
function avatarColorClass(m) {
  if (m.author_type === 'bot') return `avatar-color-${((m.author_bot_id ?? 0) % 5) + 1}`
  if (m.author_type === 'user') {
    const key = m.author_user_id ?? [...(m.author_name ?? '')].reduce((h, c) => (h + c.codePointAt(0)) % 5, 0)
    return `avatar-color-${(key % 5) + 1}`
  }
  return null
}

// @MX:ANCHOR: [AUTO] 메시지 렌더의 세 갈래 — 커서 이어받기 루프 · SSE 실시간 수신 · 재연결 따라잡기 — 가 모두 이 함수로 그린다 (fan_in 3)
// @MX:REASON: .message 의 직계 자식 구조는 SPEC-WEBUI-001 §5.2 가 개정한 계약 — 래퍼 컨테이너를 끼우면 형제 시험(web-chat·web-markdown)의 자손 단언이 깨진다
export function renderMessage(m, prev = lastRenderedMsg) {
  const wrap = document.createElement('div')
  wrap.className = `message ${m.author_type}`
  // 같은 턴이면 머리글을 CSS 로만 숨긴다(.turn-cont) — 머리글은 DOM 에 남아 화면낭독기와
  // 구조 시험(web-chat.test.ts)이 기대하는 계약을 지킨다
  if (sameTurn(prev, m)) wrap.classList.add('turn-cont')

  // 아바타 기둥 — 작성자 이름 첫 글자 하나(REQ-WEBUI-005). .msg-head/.msg-body 와 함께
  // .message 의 직계 자식 셋을 이룬다(SPEC-WEBUI-001 §5.2). 감싸는 컨테이너는 넣지 않는다.
  const avatar = document.createElement('span')
  avatar.className = 'msg-avatar'
  avatar.textContent = [...(m.author_name ?? '')][0] ?? ''
  const avatarColor = avatarColorClass(m)
  if (avatarColor) avatar.classList.add(avatarColor)

  const head = document.createElement('div')
  head.className = 'msg-head'
  const author = document.createElement('strong')
  author.textContent = m.author_name ?? ''
  // 봇 작성자는 author_bot_id 로 --md-role-color-1..5 를 순환 배정받는다 (design DNA §1)
  if (m.author_type === 'bot') {
    author.classList.add(`bot-color-${((m.author_bot_id ?? 0) % 5) + 1}`)
  }
  const time = document.createElement('span')
  time.className = 'msg-time'
  time.textContent = displayTime(m.created_at)
  head.appendChild(author)
  // 봇 배지 — 색각 이상·저대비에서도 봇을 가르는, 색에 기대지 않는 두 번째 단서(REQ-WEBUI-007).
  // .msg-time 보다 앞에 온다 — 시각은 .msg-time 클래스로 지목한다(§5.2)
  if (m.author_type === 'bot') {
    const badge = document.createElement('span')
    badge.className = 'bot-badge'
    badge.textContent = 'BOT'
    head.appendChild(badge)
  }
  head.appendChild(time)

  const body = document.createElement('div')
  body.className = 'msg-body'
  // 본문만 마크다운으로 그린다 (REQ-WEBMD-002). 작성자 이름·시각·봇 이름·방 이름은
  // 여전히 textContent 전용이다 — 마크다운은 .msg-body 안쪽에서만 산다.
  // 렌더가 던지면 원문 텍스트로 되돌린다 (REQ-WEBMD-011): renderMessage 는 이력 루프(:265)와
  // SSE 수신(:445·:466)의 동기 경로라, 여기서 예외가 나가면 메시지 한 개가 아니라 그 뒤 전부가 사라진다.
  // 조용히 삼키지는 않는다 — md-fallback 클래스와 console.warn 으로 흔적을 남긴다.
  const raw = m.body ?? ''
  try {
    body.appendChild(renderMarkdown(raw, document))
  } catch (err) {
    body.textContent = raw
    body.classList.add('md-fallback')
    console.warn('markdown 렌더 실패 — 원문 텍스트로 되돌림', err)
  }

  wrap.appendChild(avatar)
  wrap.appendChild(head)
  wrap.appendChild(body)

  // 장식 훅 — 붙이기 직전에 정확히 한 번 (REQ-WEBCHAT-003). 등록이 없으면 부르지 않고,
  // 훅이 던지면 삼키지 않는다. m.attachments 는 훅 안에서만 소비된다.
  if (roomDecorator) roomDecorator.decorate(wrap, m)

  $('messages').appendChild(wrap)
  lastRenderedMsg = m
}

// (cockpit) 방 봇 칩 · 자동완성의 재료 — /api/rooms/:id/bots 대신 과제 목록에서 같은 모양 [{bot_id, bot_name, online}] 을 만든다 (R13).
// 방을 열 때(openRoom 8단계)와 참여를 더한 뒤에만 부른다 — 키 입력마다 부르지 않는다 (REQ-WEBCHAT-009).
// 응답 반영 직전에 방 세대를 검사한다.
export async function refreshRoomBots() {
  state.roomBots = roomBotsOf(state.projects, state.currentRoomId)
  renderRoomBots()
}

// 봇 칩 — 캐시만 읽는다(네트워크 없음). 🟢/⚪ 는 online 여부, (입력 중…)/(응답 없음?) 는
// working/stale 표시이고 stale 이 working 보다 우선한다 (REQ-WEBCHAT-006).
function renderRoomBots() {
  const box = $('room-bots')
  box.innerHTML = ''
  for (const bot of state.roomBots) {
    const key = `${state.currentRoomId}:${bot.bot_id}`
    const chip = document.createElement('span')
    chip.className = `bot-chip${bot.online ? '' : ' offline'}`
    chip.textContent = `${bot.online ? '🟢' : '⚪'} ${bot.bot_name}`
    if (state.staleBots.has(key)) chip.textContent += ' (응답 없음?)'
    else if (state.workingBots.has(key)) chip.textContent += ' (입력 중…)'
    box.appendChild(chip)
  }
}

function scrollMessages() {
  const box = $('messages')
  box.scrollTop = box.scrollHeight
}

function hideAutocomplete() {
  $('autocomplete').hidden = true
  acIndex = 0   // 숨기면 옛 선택 위치는 뜻이 없다 (REQ-WEBACNAV-001)
}

// (cockpit) 실시간 — 방마다가 아니라 로그인 뒤 GET /api/stream 하나를 연다 (ADR-012 · ARCHITECTURE 7.3).
// message 는 { project, message } 로 온다 — 지금 연 방의 글만 그린다. bot_status 는 { project, status } 를 working/idle 로 바꿔 칩에 넘긴다.
// 재연결 백필은 minidiscord 그대로 REST 커서(?after=)다.
function openAppStream() {
  initChat()   // 채팅 state 필드를 먼저 만든다 — 뒤에 부르는 initChat 이 state.sse 를 null 로 덮지 않게
  if (state.sse) return
  const es = new EventSource('/api/stream')
  state.sse = es
  let hadError = false
  const on = (type, fn) => es.addEventListener(type, (e) => {
    let data
    try { data = JSON.parse(e.data) } catch { return }
    Promise.resolve(fn(data)).catch(err => console.warn(`cockpit 사건 ${type}`, err))
  })
  on('message', (d) => {
    const m = messageForRoom(d, state.currentRoomId)
    if (!m) return
    renderMessage(m)
    scrollMessages()
    state.lastEventId = m.id
  })
  on('bot_status', (d) => {
    const project = state.projects.find(p => p.name === d.project)
    if (project?.bot && project.rooms?.main?.id === state.currentRoomId) markBotStatus(project.bot.id, botMark(d.status))
  })
  on('session_state', async (d) => {
    const project = state.projects.find(p => p.name === d.project)
    if (project) project.session.state = d.state
    await refreshRoomBots()
    panelEvent('session_state', d)
  })
  for (const type of ['room_created', 'room_archived']) {
    on(type, async (d) => {
      await loadRooms()
      await loadProjects()
      await refreshRoomBots()
      panelEvent(type, d)
    })
  }
  for (const type of ['permission_request', 'permission_resolved', 'session_event', 'partial']) on(type, d => panelEvent(type, d))
  es.addEventListener('error', () => { hadError = true })
  // 첫 연결이 아니라 error 뒤의 재연결이면 끊긴 사이의 글을 커서로 백필한다 (REQ-WEBCHAT-008 그대로)
  es.addEventListener('open', async () => {
    if (!hadError) return
    hadError = false
    const id = state.currentRoomId
    const generation = state.roomGeneration
    if (id === null) return
    const { messages } = await api(`/api/rooms/${id}/messages?after=${state.lastEventId}`)
    if (generation !== state.roomGeneration) return
    for (const m of messages) {
      renderMessage(m)
      state.lastEventId = m.id
    }
    scrollMessages()
  })
}

// bot_status 처리 — working: 표시 + 5분 타이머, idle: 둘 다 해제 (REQ-WEBCHAT-006).
// 5분 판정은 브라우저가 한다. 서버는 stale 이라는 상태를 발행하지 않는다.
function markBotStatus(botId, botState) {
  const key = `${state.currentRoomId}:${botId}`
  if (botState === 'working') {
    state.workingBots.add(key)
    state.staleBots.delete(key)
    clearTimeout(state.staleTimers[key])
    state.staleTimers[key] = setTimeout(() => {
      delete state.staleTimers[key]
      state.staleBots.add(key)
      renderRoomBots()   // 캐시만 다시 그린다 — 만료 시점에 네트워크를 치지 않는다
    }, 300_000)
  } else if (botState === 'idle') {
    state.workingBots.delete(key)
    state.staleBots.delete(key)
    clearTimeout(state.staleTimers[key])
    delete state.staleTimers[key]
  }
  renderRoomBots()
}

// ── @ 자동완성 ───────────────────────────────────────────────────────
// 커서 앞 문자열에서 멘션 토큰을 뽑는 정규식과, 서버 파서가 해석할 수 있는 이름의
// 문자 집합. 둘 다 server/src/mention.ts 의 MENTION_RE 왌 맞춘다 — 파서를 고치지 않고
// UI 가 맞춘다 (REQ-WEBCHAT-010·011, plan.md §B).
const MENTION_TOKEN_RE = /(^|\s)@([^\s(]*)$/
const MENTIONABLE_RE = /^[^()\s]+$/
// 키보드 선택 상태 — 선택 가능한 항목(.ac-item:not(.disabled))들 사이의 인덱스 하나.
// 렌더 끝과 숨김에서 0 으로 되돌린다 (REQ-WEBACNAV-001, plan.md §B.1).
let acIndex = 0

// 커서 앞의 미완성 멘션 낱말. 없으면 null.
function currentMentionToken() {
  const box = $('msg-input')
  const caret = box.selectionStart ?? box.value.length
  const m = box.value.slice(0, caret).match(MENTION_TOKEN_RE)
  return m ? m[2] : null
}

// input 이벤트 — 캐시된 초대 목록만 읽는다. 키 입력마다 네트워크를 치지 않는다 (REQ-WEBCHAT-009).
function onComposerInput() {
  // 보내기 상태 갱신이 먼저다 — 아래에 조기 return 이 있어도 매 입력에서 돌아야 한다 (REQ-WEBUI-011)
  refreshSendState()
  $('msg-input').placeholder = composerHint($('msg-input').value)   // (cockpit) 봉투가 없으면 봇에게 안 간다고 알린다 (ADR-018)
  const token = currentMentionToken()
  if (token === null) { hideAutocomplete(); return }
  const prefix = token.toLowerCase()
  const box = $('autocomplete')
  box.innerHTML = ''
  acIndex = 0   // 후보 집합이 바뀌면 옛 인덱스는 뜻이 없다 (REQ-WEBACNAV-001)
  box.setAttribute('role', 'listbox')   // index.html 은 고치지 않는다 — role 은 렌더가 붙인다 (REQ-WEBACNAV-002)
  const matched = state.roomBots.filter(b => b.bot_name.toLowerCase().startsWith(prefix))
  if (matched.length === 0) { hideAutocomplete(); return }
  for (const bot of matched) {
    if (!MENTIONABLE_RE.test(bot.bot_name)) {
      // 서버 파서가 해석하지 못하는 이름(공백·괄호 포함)은 완성해 주지 않는다 (REQ-WEBCHAT-011).
      // 완성된 멘션이 조용히 아무 봇에게도 전달되지 않는 마지막 조각이 여기서 끊긴다.
      const item = document.createElement('div')
      item.className = 'ac-item disabled'
      item.setAttribute('aria-disabled', 'true')
      item.textContent = `${bot.bot_name} — 멘션할 수 없는 이름(공백·괄호 포함)`
      box.appendChild(item)
      continue
    }
    for (const kind of ['TO', 'CC']) {
      const item = document.createElement('div')
      item.className = 'ac-item'
      item.setAttribute('role', 'option')
      item.dataset.kind = kind
      // 배지가 앞, 이름은 텍스트 노드로 뒤 — textContent 는 여전히 'TO pm' 이라 기존
      // AC-WEBCHAT-010 의 startsWith 탐색이 그대로 맞고, innerHTML 은 쓰지 않는다 (REQ-WEBACNAV-002).
      const badge = document.createElement('span')
      badge.className = `ac-kind ${kind.toLowerCase()}`
      badge.textContent = kind
      item.appendChild(badge)
      item.appendChild(document.createTextNode(` ${bot.bot_name}`))
      item.addEventListener('click', () => commitMention(kind, bot.bot_name))
      // 마우스 강조와 키보드 강조가 다른 항목을 가리키면 Enter 가 어느 쪽을 고르는지 알 수 없다 (REQ-WEBACNAV-001)
      item.addEventListener('mouseenter', () => {
        acIndex = acItems().indexOf(item)
        applySelection()
      })
      box.appendChild(item)
    }
  }
  applySelection()
  box.hidden = false
}

// 선택 가능한 항목들 — 멘션 불가 행은 결코 선택 상태가 되지 않는다 (REQ-WEBACNAV-002).
function acItems() {
  return Array.from($('autocomplete').querySelectorAll('.ac-item:not(.disabled)'))
}

// acIndex 를 DOM 에 반영한다 — selected 클래스와 aria-selected 를 함께 토글한다.
function applySelection() {
  acItems().forEach((item, i) => {
    const on = i === acIndex
    item.classList.toggle('selected', on)
    item.setAttribute('aria-selected', on ? 'true' : 'false')
  })
}

// 선택된 항목을 확정한다 — Enter 와 Tab 의 공통 경로. 「첫 항목」이 아니라 「선택된 항목」이며,
// 선택 가능한 항목이 없으면 키가 삼켜진 채 드롭다운이 남지 않도록 닫기만 한다 (REQ-WEBACNAV-004).
function commitSelected() {
  const pick = acItems()[acIndex] ?? acItems()[0]
  if (pick) pick.click()
  else hideAutocomplete()
}

// 선택을 delta 만큼 옮긴다. 끝에서는 감긴다 (REQ-WEBACNAV-003).
function moveSelection(delta) {
  const n = acItems().length
  if (n === 0) return
  acIndex = (acIndex + delta + n) % n
  applySelection()
  // jsdom 에는 scrollIntoView 가 없다 — 옵셔널 호출 (plan.md §F)
  acItems()[acIndex].scrollIntoView?.({ block: 'nearest' })
}

// 후보 확정 — 커서 앞의 미완성 토큰을 완성된 멘션 문자열로 바꾼다.
// 삽입 형태 '@TO(이름) ' / '@CC(이름) ' 는 서버 파서의 문법 그 자체다 (REQ-WEBCHAT-010).
function commitMention(kind, name) {
  const box = $('msg-input')
  const caret = box.selectionStart ?? box.value.length
  const before = box.value.slice(0, caret)
  const after = box.value.slice(box.selectionEnd ?? box.value.length)
  const replaced = before.replace(/@([^\s(]*)$/, `@${kind}(${name}) `)
  box.value = replaced + after
  box.selectionStart = box.selectionEnd = replaced.length
  hideAutocomplete()
  box.focus()
}

// keydown — 드롭다운이 보이는 동안 Enter 는 전송이 아니다 (REQ-WEBCHAT-012).
// '@pm' 까지 치고 Enter 를 누른 사용자는 완성을 기대하지, 깨진 멘션 전송을 기대하지 않는다.
function onComposerKeyDown(e) {
  // 드롭다운이 열려 있는 동안만 방향키·Esc·Tab 을 가로챈다. 닫혀 있으면 아래 첫 줄로 흘러가
  // 아무것도 하지 않는다 — 커서 이동·포커스 이동은 브라우저 몫이다 (REQ-WEBACNAV-006).
  const ac = $('autocomplete')
  if (!ac.hidden && ['ArrowDown', 'ArrowUp', 'Escape', 'Tab'].includes(e.key)) {
    // [HARD] 조합 중의 return 은 preventDefault 보다 앞이어야 한다 — 아래 Enter 경로와 같은
    // 순서다. 조합 중의 방향키를 가로채면 한글 조합이 깨진다 (REQ-WEBACNAV-007).
    if (e.isComposing || e.keyCode === 229) return
    e.preventDefault()
    if (e.key === 'Escape') { hideAutocomplete(); return }   // 입력값·커서는 그대로 (REQ-WEBACNAV-005)
    // Tab 은 Shift 여부와 무관 — 열린 동안 포커스 이동은 어느 방향이든 가로챈다 (REQ-WEBACNAV-004)
    if (e.key === 'Tab') { commitSelected(); return }
    moveSelection(e.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (e.key !== 'Enter' || e.shiftKey) return
  // 한글·일본어 등 조합 중의 Enter 는 전송이 아니라 조합 확정이다 (카드 t32 결함 D-6).
  // 여기서 전송하면 조합 중 글자를 포함한 본문이 나간 뒤 입력창이 비워지고, 확정된
  // 마지막 글자가 빈 칸에 들어가 뒤따르는 진짜 Enter 가 그 한 글자를 또 보낸다.
  // keyCode 229 는 isComposing 을 싣지 않는 구형 IME 경로의 같은 신호다.
  // [HARD] 이 return 은 preventDefault 보다 앞이어야 한다 — 뒤에 두면 조합 확정 자체가
  // 막혀 한글 입력이 깨진다.
  if (e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  if (!ac.hidden) { commitSelected(); return }
  sendMessage()
}

// ── 전송 ─────────────────────────────────────────────────────────────
// FormData 에 body 하나를 담아 POST 를 정확히 한 번 (REQ-WEBCHAT-013).
// POST 응답의 message 는 그리지 않는다 — 서버가 같은 것을 SSE 로도 발행하므로
// 응답을 그리면 자기 메시지가 두 번 보인다. 실패하면 화면 요소로 알리고 입력을 복원한다.
export async function sendMessage() {
  const box = $('msg-input')
  // 보낼 목록은 picker 가 아니라 pickedFiles 가 소유한다 — ✕ 로 하나를 뺀 결과가 여기 담긴다
  const files = pickedFiles.slice()
  const body = box.value
  // 본문도 파일도 없을 때만 아무것도 하지 않는다 — 파일만 보내는 것은 서버가 받는다
  // (routes-messages.ts REQ-MSG-005: body 도 파일도 없으면 400)
  if (!body.trim() && files.length === 0) return
  box.value = ''
  hideAutocomplete()
  const form = new FormData()
  // [HARD] 파일이 아닌 파트는 서버가 전부 body 로 이어 붙인다 — 텍스트 파트는 정확히 하나여야 한다
  form.append('body', body)
  // 필드명은 서버가 가리지 않는다 (part.type === 'file' 로만 판정) — 'file' 은 읽는 사람을 위한 이름이다
  for (const f of files) form.append('file', f)
  try {
    await api(`/api/rooms/${state.currentRoomId}/messages`, { method: 'POST', body: form })
    clearPickedFiles()  // 성공했을 때만 비운다 — 실패하면 선택이 남아 다시 보내기로 그대로 나간다
    // (cockpit) 보낸 뒤 입력칸이 비었으면 @TO(봇) 을 다시 채운다 (ADR-018)
    const fill = prefillValue({ value: box.value, bot: projectOfRoom(state.projects, state.currentRoomId)?.bot, archived: false })
    if (fill !== null) { box.value = fill; refreshSendState() }
  } catch (err) {
    notifyError(err)
    // 그 사이 사용자가 다음 메시지를 치고 있을 수 있다 — 빈 칸일 때만 되살린다 (plan.md §D 9번)
    if (box.value === '') box.value = body
  }
}

// 함께 보낼 파일 목록. picker.files 는 항목 하나만 빼는 수단이 없으므로(읽기 전용 FileList)
// «무엇이 나갈지» 의 단일 출처는 이 배열이고, picker 는 고르는 창구로만 쓴다.
let pickedFiles = []

// 공용 편입 경로 — 고르기·붙여넣기·끌어놓기 셋이 전부 여기로 들어온다 (SPEC-WEBATTACH-001).
// 새 전송 경로를 만들지 않는 이유가 이것이다: 배열에 들어오기만 하면 sendMessage() 가 이미 싣는다.
// dedupe 를 끄는 자리는 붙여넣기 하나뿐이다 — 사람이 두 번 누른 것은 두 번 넣겠다는 뜻이고,
// 클립보드 File 은 붙일 때마다 lastModified 가 새로 찍혀 isSameFile 판정 자체가 우연에 맡겨진다 (D7).
function addPickedFiles(files, { dedupe = true } = {}) {
  for (const f of files) {
    if (dedupe && pickedFiles.some(p => isSameFile(p, f))) continue
    pickedFiles.push(f)
  }
  renderPickedFiles()
}

// 새로 고른 파일을 목록에 잇는다. 두 번에 나눠 골라도 쌓이고, 같은 파일은 두 번 담지 않는다.
function onFilePicked() {
  const picker = $('file-input')
  const files = Array.from(picker.files ?? [])
  // 같은 파일을 다시 고를 수 있게 창구를 비운다 — 비우지 않으면 change 가 다시 오지 않는다
  picker.value = ''
  addPickedFiles(files)
}

// 이름·크기·수정시각이 모두 같으면 같은 파일로 본다 — File 객체는 고를 때마다 새로 생긴다
function isSameFile(a, b) {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
}

// ── 붙여넣기·끌어놓기 (SPEC-WEBATTACH-001) ────────────────────────────
// clipboardData 도 dataTransfer 도 같은 모양(files / items / types)을 쓰므로 읽는 함수는 하나다.
// [HARD] instanceof DragEvent·ClipboardEvent 로 판정하지 않는다 — jsdom 에 그 생성자가 없어
// 시험에서 영원히 거짓이 되고, 브라우저에서만 도는 분기는 관측할 방법이 없다 (plan.md §B-1).
function filesFromTransfer(dt) {
  if (!dt) return []
  const direct = Array.from(dt.files ?? [])
  if (direct.length > 0) return direct
  // files 가 비어 있어도 items 에 파일이 실려 오는 경로가 있다 (일부 브라우저의 클립보드)
  return Array.from(dt.items ?? [])
    .filter(i => i && i.kind === 'file')
    .map(i => i.getAsFile())
    .filter(Boolean)
}

// 「이 끌기가 파일을 실었는가」 — 규약상 파일이 있으면 types 에 'Files' 가 들어 있다.
// 파일이 아닌 끌기(글자 끌어놓기 등)는 이 판정 하나로 전부 통과시킨다 (REQ-WEBATT-009).
function transferHasFiles(dt) {
  if (!dt) return false
  return Array.from(dt.types ?? []).includes('Files')
}

// 클립보드 항목의 MIME 에서 확장자를 뽑는다. 근거 없이 붙이면 서버가 확장자로 MIME 을 정하므로
// (routes-messages.ts MIME 표) 내려받기와 보낸 뒤 표시가 함께 어긋난다.
function extensionForMime(type) {
  const sub = String(type || '').split('/')[1] || 'bin'
  return sub === 'jpeg' ? 'jpg' : sub
}

// 붙여넣은 캡쳐에 쓸 만한 이름이 없는가 — 비었거나 브라우저 기본값(image.png 류)이면 참.
function hasNoUsableName(name) {
  const n = String(name || '')
  if (n === '') return true
  const dot = n.lastIndexOf('.')
  return (dot > 0 ? n.slice(0, dot) : n).toLowerCase() === 'image'
}

// 스크린샷-YYYYMMDD-HHMMSS.<ext> — 현지 시각이다(운영자 결정 D2). UTC 로 찍으면 사람이
// 자기 화면을 캡쳐한 시각과 이름이 어긋난다.
function captureName(ext) {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `스크린샷-${stamp}.${ext}`
}

// 이미 쓰인 이름이면 확장자 앞에 -2, -3 … 을 붙인다. 적용 범위는 «붙여넣기로 들어오는 항목» 뿐이다
// (D7) — 고르기 경로는 isSameFile 만 보고 이름을 보지 않으며 그 동작은 바뀌지 않는다(REQ-WEBATT-014).
function uniqueName(name, taken) {
  if (!taken.has(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`
    if (!taken.has(candidate)) return candidate
  }
}

// 붙여넣기 — 파일 항목이 없으면 손대지 않는다(평문 붙여넣기는 지금과 똑같이 작동한다, REQ-WEBATT-004).
// 운영체제·조합키를 가리지 않는다: macOS 의 Cmd+V 와 Windows 의 Ctrl+V 는 같은 paste 를 만든다.
function onComposerPaste(e) {
  const files = filesFromTransfer(e.clipboardData)
  if (files.length === 0) return
  e.preventDefault()
  // 이름은 «항목 자체» 가 가져야 한다 — 칩 라벨·alt·전송 파트 이름 셋이 같은 문자열이어야 하고
  // sendMessage() 는 pickedFiles 를 그대로 싣기 때문이다(REQ-WEBATT-002). 그래서 File 을 다시 만든다.
  const taken = new Set(pickedFiles.map(f => f.name))
  const named = files.map(f => {
    const base = hasNoUsableName(f.name) ? captureName(extensionForMime(f.type)) : f.name
    const name = uniqueName(base, taken)
    taken.add(name)
    return name === f.name ? f : new File([f], name, { type: f.type, lastModified: f.lastModified })
  })
  addPickedFiles(named, { dedupe: false })
}

// 끌기가 드롭 영역 «안» 에 몇 겹으로 들어와 있는가. dragleave 는 자식 요소를 지날 때마다
// 발화하므로, 깊이 없이 바로 표시를 끄면 끌기가 입력칸 위를 지날 때마다 깜빡인다.
let dragDepth = 0

function markDropTarget(on) {
  const box = $('composer-box')
  if (!box) return
  box.classList.toggle('drop-target', on)
}

function onComposerDragEnter(e) {
  if (!transferHasFiles(e.dataTransfer)) return
  e.preventDefault()
  dragDepth++
  markDropTarget(true)
}

function onComposerDragOver(e) {
  if (!transferHasFiles(e.dataTransfer)) return
  // [HARD] dragover 의 기본 동작을 막아야 이 요소가 유효한 드롭 대상이 된다 — 막지 않으면
  // 브라우저가 탐색을 수행하고 drop 은 애초에 발화하지 않는다 (HTML DnD 규약).
  e.preventDefault()
}

function onComposerDragLeave(e) {
  if (!transferHasFiles(e.dataTransfer)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) markDropTarget(false)
}

function onComposerDrop(e) {
  if (!transferHasFiles(e.dataTransfer)) return
  e.preventDefault()
  // 떨구면 dragleave 가 오지 않는 경로가 있다 — 깊이는 세지 말고 0 으로 강제한다
  dragDepth = 0
  markDropTarget(false)
  // 종류를 가리지 않는다 (운영자 지시: 드래그앤드롭은 모든 파일)
  addPickedFiles(filesFromTransfer(e.dataTransfer))
}

// 문서 가드 — 드롭 영역 «밖» 에 파일을 떨구면 브라우저가 그 파일로 페이지를 통째로 넘겨
// 쓰던 본문·메시지 목록·SSE 연결이 사라진다. 세 이벤트의 기본 동작만 막고 목록은 건드리지
// 않는다: 「받지 않음」이지 「받음」이 아니다 (D6). 파일이 아닌 끌기는 손대지 않는다.
function guardFileDrag(e) {
  if (!transferHasFiles(e.dataTransfer)) return
  e.preventDefault()
}

// [HARD] 1회성은 «문서 자신이 지니는 표지» 로 보장한다 (D10). 모듈 수준 플래그(chatReady)는
// 모듈이 다시 적재되면 false 로 돌아가는데 document 노드는 그대로 살아 있어, 플래그만 믿으면
// 적재할 때마다 청취자가 하나씩 쌓인다 (spec.md §1.1 실측).
function installDocumentDropGuard() {
  const root = document.documentElement
  if (!root || root.dataset.webattachGuard === '1') return
  root.dataset.webattachGuard = '1'
  // 청취자 이름을 변수로 도는 이유: 이 세 종류는 아래 작성기 배선이 이미 글자로 한 번씩 쓰고 있고,
  // 「원문에 각 1회」라는 비회귀 기준(AC-WEBATT-013)이 그 횟수를 센다.
  for (const type of ['dragenter', 'dragover', 'drop']) document.addEventListener(type, guardFileDrag)
}

// 파일 → 객체 URL. [HARD] renderPickedFiles() 는 변화마다 목록 전체를 다시 그리므로,
// 그릴 때마다 만들면 지운 만큼이 아니라 «그린 횟수만큼» 샌다. 그래서 파일당 한 번만 만들고
// 여기 붙들어 둔다. 회수 자리는 둘이다 — ✕ 와 clearPickedFiles(). 하나만 두면 나머지가 샌다.
const objectUrls = new Map()

// 무엇을 이미지로 보는가: MIME 또는 확장자 (D8). 둘의 합집합인 이유는 근거가 서로 다르기
// 때문이다 — 붙여넣은 캡쳐는 type 이 권위 있고, 끌어온 파일은 플랫폼에 따라 type 이 빈
// 문자열이라 확장자가 유일한 근거가 된다.
function isImageFile(f) {
  return (typeof f.type === 'string' && f.type.startsWith('image/')) || isImageFilename(f.name)
}

// 썸네일에 쓸 URL. 못 만드는 환경이면 null 을 돌려주고 부르는 쪽이 이름 칩으로 되돌린다.
// [HARD] 여기서 던지면 renderPickedFiles() 가 통째로 무너져 사용자가 무엇이 나갈지 볼 수도
// ✕ 로 뺄 수도 없게 된다 — 그리기 경로는 어떤 이유로도 던지지 않는다 (REQ-WEBATT-012).
function thumbUrl(f) {
  if (objectUrls.has(f)) return objectUrls.get(f)
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  let url = null
  try {
    url = URL.createObjectURL(f)
  } catch {
    return null
  }
  objectUrls.set(f, url)
  return url
}

function revokeThumbUrl(f) {
  const url = objectUrls.get(f)
  if (!url) return
  objectUrls.delete(f)
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}

// 고른 파일을 칩 한 줄로 보인다. 이름은 textContent·alt 로만 넣는다 — 파일명은 사용자 입력이라
// innerHTML 로 넣으면 그대로 마크업이 된다(REQ-WEBCHAT-003 과 같은 이유).
function renderPickedFiles() {
  const box = $('file-chosen')
  box.textContent = ''
  for (const f of pickedFiles) {
    // 이미지면 이름 칩 대신 썸네일 칩. URL 을 못 만들면 이름 칩으로 되돌아간다.
    const url = isImageFile(f) ? thumbUrl(f) : null
    const chip = document.createElement('span')
    if (url) {
      // [D9] 썸네일 칩에는 .file-chip 을 달지 않는다 — 달면 기존 chipNames() 헬퍼가
      // 이미지 항목을 빈 이름으로 읽어 그 헬퍼의 의미가 조용히 바뀐다.
      chip.className = 'file-chip-image'
      const img = document.createElement('img')
      img.className = 'file-chip-thumb'
      img.src = url
      img.alt = f.name
      chip.appendChild(img)
    } else {
      chip.className = 'file-chip'
      // 📎 는 옆의 첨부 버튼이 이미 달고 있다 — 칩마다 되풀이하지 않고 이름만 둔다
      chip.append(f.name)
    }
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'file-chip-remove'
    remove.setAttribute('aria-label', `${f.name} 첨부 제거`)
    remove.textContent = '✕'
    // 인덱스가 아니라 파일 자체로 지운다 — 다시 그리는 사이 인덱스는 어긋날 수 있다
    remove.addEventListener('click', () => {
      revokeThumbUrl(f)
      pickedFiles = pickedFiles.filter(p => p !== f)
      renderPickedFiles()
    })
    chip.appendChild(remove)
    box.appendChild(chip)
  }
  // 첨부 목록이 다시 그려질 때마다 보내기 상태도 함께 (REQ-WEBUI-011)
  refreshSendState()
}

// 선택을 통째로 비운다. 전송에 성공했을 때만 부른다.
function clearPickedFiles() {
  // 회수의 두 번째 자리. 전송 «실패» 경로에는 이것이 없다 — 실패하면 선택이 화면에 남으므로
  // 거기서 회수하면 남은 썸네일이 죽은 URL 을 가리킨다.
  for (const f of pickedFiles) revokeThumbUrl(f)
  pickedFiles = []
  $('file-input').value = ''
  renderPickedFiles()
  // 전송 성공으로 선택이 비워질 때 — renderPickedFiles 와 별개의 네 자리 중 하나다 (REQ-WEBUI-011)
  refreshSendState()
}

// 보낼 것이 있는가 — sendMessage 의 빈 전송 가드(!body.trim() && files.length === 0)와 같은 기준.
// 이것은 표시일 뿐 차단이 아니다: aria-disabled 만 뒤집고 disabled 속성은 끝까지 쓰지 않는다
// (REQ-WEBUI-011). disabled 는 버튼을 탭 순서에서 빼 «왜 안 보내지»를 확인할 대상 자체를 지운다.
function refreshSendState() {
  const send = $('send-btn')
  if (!send) return
  const input = $('msg-input')
  const has = ((input?.value ?? '').trim().length > 0) || pickedFiles.length > 0
  send.setAttribute('aria-disabled', has ? 'false' : 'true')
}

// 전송 실패 알림 — alert 대신 화면 안의 요소로 낸다. jsdom 이 alert 를 던지지 않고
// 브라우저를 멈추지도 않으며, 무엇보다 테스트에서 관측 가능하다.
function notifyError(err) {
  const toast = $('error-toast')
  toast.textContent = err instanceof Error ? err.message : String(err)
  toast.hidden = false
}

// ══ 리치 표면 (SPEC-WEBRICH-001) ═══════════════════════════════════════
// 이 SPEC 이 app.js 에 더하는 것은 이 블록 전부다 — renderMessage 본체는 한 줄도
// 건드리지 않는다 (REQ-WEBRICH-002). 모듈 최상위가 배선의 자리다.
// isImageFilename 은 SPEC-WEBRICH-001 이 이미 export 한다 — 작성기의 미리보기 판정과
// 보낸 뒤의 표시 판정이 같은 자를 쓰도록, 새 판정 함수를 만들지 않고 이름 하나를 더 가져온다.
import { createRichContext, isImageFilename } from './rich.js'   // (cockpit) 봇 참여 · 등록 명령 다이얼로그는 옮기지 않는다 (R13)
import { botMark, composerHint, messageForRoom, prefillValue, projectOfRoom, roomBotsOf } from './glue.js'   // (cockpit) 잇는 순수 함수 (ARCHITECTURE 7.3)
import { initPanel, panelEvent, panelFollow } from './panel.js'   // (cockpit) 접이식 조종석 판 (ADR-019)
import { renderMarkdown } from './markdown.js'

// 배선 계약 (spec.md REQ-WEBRICH-002) — 방을 열 때마다 openRoom 3-1단계가
// factory({ api, doc }) 를 불러 그 방 전용 컨텍스트를 새로 만든다. 넘기는 값은 팩토리
// createRichContext 그 자체이지 호출 결과(.decorate)가 아니다 — 결과를 넘기면 그 방의
// 컨텍스트가 undefined 가 되어 첨부와 권한 버튼이 아무 오류 없이 영원히 안 뜬다 (감사 MF-9).
registerMessageDecorator(createRichContext)
