// 출처 핀: minidiscord web/rich.js — 저장소 핀 6633f7b, 이 파일이 마지막으로 바뀐 커밋 eca2c3d 2026-09-07, 원본 sha256 fb8369eef29a331cde92ce533ffc400451a207ee9644f10d9449fd88bac166b4
/*
 * minidiscord 리치 표면 (SPEC-WEBRICH-001)
 * 첨부 표시·봇 초대 다이얼로그·권한 승인 버튼 — SPEC-WEBCHAT-001 의 장식 훅에 끼울 함수를 공급한다.
 * 계약 표면은 SPEC-WEBSHELL-001 §4.8 — 이 모듈은 state 에 필드를 더하지 않고,
 * 판정 완료 상태는 createRichContext 인스턴스 클로저 안에만 산다 (plan.md §B 2).
 * 서버가 만든 문자열(요청 줄·판정 결과·초대 명령)이 유일하게 결합되는 자리마다 주석으로 근거를 남긴다.
 */

// ── 첨부 ───────────────────────────────────────────────────────────────

// 이미지 확장자 — 서버 응답에 mime 이 없어 파일명이 판정의 유일한 근거다 (REQ-WEBRICH-003, plan.md §D 4).
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

export function isImageFilename(filename) {
  const lower = String(filename).toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

// id 를 십진수 URL 로만 바꾼다 — 유한한 음이 아닌 정수가 아니면 노드를 만들지 않는다 (REQ-WEBRICH-004).
export function attachmentUrl(id) {
  const n = Number(id)
  if (!Number.isInteger(n) || n < 0) return null
  return `/api/attachments/${n}`
}

// 파일명은 공격자가 고르는 값이다 — textContent/alt 로만 넣고 HTML 조립 API 는 전혀 쓰지 않는다 (REQ-WEBRICH-005).
export function buildAttachmentNode(att, doc) {
  const url = attachmentUrl(att.id)
  if (url === null) return null
  if (isImageFilename(att.filename)) {
    const img = doc.createElement('img')
    img.className = 'attachment-image'
    img.src = url
    img.alt = att.filename
    return img
  }
  const a = doc.createElement('a')
  a.className = 'attachment'
  a.href = url
  a.download = att.filename
  a.textContent = `📄 ${att.filename}`
  return a
}

// ── 권한 승인 ──────────────────────────────────────────────────────────

// @MX:ANCHOR: [AUTO] 서버 permissions.ts 가 만드는 시스템 메시지 문구와 글자 단위로 결합한 정규식 둘(REQUEST_LINE_RE·RESOLUTION_RE) — 문구를 바꾸면 여기가 함께 바뀌어야 한다
// @MX:REASON: 이 결합은 import 그래프에 나타나지 않는다. 서버 쪽은 꼬리 «전달하지 못했습니다 (<id>)» 유지를 [HARD] 로 적어 두었고, 어긋나면 승인·거절 버튼이 안 뜨거나 잠기지 않은 채 오류 없이 지나간다
// 요청 줄 템플릿 전체(역참조 포함)와 일치하는 경우만 요청 줄로 인정한다 (REQ-WEBRICH-006·007).
// 브로커(permissions.ts)가 만드는 마지막 줄과 글자 단위로 결합돼 있다 — 템플릿이 바뀌면
// AC-003 이 실물 본문으로 즉시 울며 여기서 드러난다 (plan.md §E 위험 1).
// matchAll 은 정규식을 내부에서 복제하므로 모듈 수준 g 플래그 상태가 새지 않는다.
const REQUEST_LINE_RE = /^승인하려면 "yes ([a-km-z]{5})", 거절하려면 "no \1" 라고 답해주세요\.$/gm

export function permissionRequestId(body) {
  const matches = [...String(body).matchAll(REQUEST_LINE_RE)]
  if (matches.length === 0) return null
  return matches[matches.length - 1][1]   // 마지막 일치 — 오염된 input_preview 가 요청 줄을 흉내 내도 진짜 줄이 이긴다
}

// 판정 결과 세 템플릿에서 ID 를 뽑는다 (REQ-WEBRICH-010). ✅ 승인 전송됨 · ⛔ 거절 전송됨 ·
// ⚠️ … 전달하지 못했습니다 — 이모지는 일치에 쓰지 않고 공통 꼬리만 쓴다 (plan.md §E 위험 2).
//
// 양끝을 문자열 앞뒤에 고정하고 `.` 로만 앞을 채운다. 브로커의 판정 본문은 네 템플릿 모두
// 정확히 한 줄이고, 요청 본문은 '\n' 으로 이어붙인 네 줄이다 — `.` 이 줄바꿈류(\n·\r·U+2028·
// U+2029)를 건너지 못하므로 요청 본문은 어떤 봇 필드에 무엇이 들어 있든 여기에 걸리지 않는다.
// 고정이 없던 0.1.0 은 봇이 input_preview 에 '✅ 승인 전송됨 (…)' 을 적는 것만으로 자기 요청을
// 판정 완료로 위장시켜 승인·거절 버튼을 통째로 지울 수 있었다 (t5 sync 탐침 Q4, 버튼 0개 관측).
const RESOLUTION_RE = /^.*(?:승인 전송됨|거절 전송됨|전달하지 못했습니다) \(([a-km-z]{5})\)$/

export function permissionResolutionId(body) {
  const m = RESOLUTION_RE.exec(String(body))
  return m ? m[1] : null
}

// 서버 PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i 와 글자 단위로 합치하는
// 두 토큰 — 앞뒤 공백 없이 한 칸 띄운다 (REQ-WEBRICH-008).
export function verdictBody(requestId, decision) {
  return `${decision === 'allow' ? 'yes' : 'no'} ${requestId}`
}

export function verdictForm(requestId, decision) {
  const form = new FormData()
  form.append('body', verdictBody(requestId, decision))
  return form
}

// 판정 완료 상태는 이 팩토리의 인스턴스 클로저에만 산다 — 모듈 전역에 두면 방을 옮겨도 남고
// 테스트끼리 샌다 (REQ-WEBRICH-002, plan.md §B 2). openRoom 이 방마다 새로 부른다.
export function createRichContext({ api, doc }) {
  const resolved = new Set()   // 판정이 끝난 request_id
  const pending = new Map()    // request_id → [승인 버튼, 거절 버튼]

  // 이미 그려진 버튼을 잠근다 — 결과가 SSE 로 늦게 오는 경로 (REQ-WEBRICH-010 후도착).
  function lockPending(rid) {
    const buttons = pending.get(rid)
    if (!buttons) return
    for (const b of buttons) b.disabled = true
    pending.delete(rid)
  }

  // 네트워크는 주입된 api 로만 나간다 — 전역 fetch 를 직접 부르지 않는다 (요소 계약).
  function sendVerdict(m, rid, decision) {
    api(`/api/rooms/${m.room_id}/messages`, { method: 'POST', body: verdictForm(rid, decision) })
  }

  return {
    // 동기·void — renderMessage 의 동기 렌더 경로가 부른다. 어떤 봉투에도 정상 반환한다.
    decorate(el, m) {
      // 1) 판정 결과 메시지 — resolved 에 넣고 이미 그려진 버튼을 잠근다 (양방향 모두 이 한 줄에서)
      if (m.author_type === 'system') {
        const doneRid = permissionResolutionId(m.body)
        if (doneRid !== null) {
          resolved.add(doneRid)
          lockPending(doneRid)
        }
      }
      // 2) 첨부 — attachments 항목마다 정확히 하나, 조건을 통과한 노드만 (REQ-WEBRICH-003·004)
      if (Array.isArray(m.attachments)) {
        for (const att of m.attachments) {
          const node = buildAttachmentNode(att, doc)
          if (node !== null) el.appendChild(node)
        }
      }
      // 3) 권한 요청 버튼 — system + 요청 줄 일치만, 이미 끝난 요청은 살아 있는 버튼 없이 (REQ-WEBRICH-010·011)
      if (m.author_type === 'system') {
        const rid = permissionRequestId(m.body)
        if (rid !== null && !resolved.has(rid)) {
          const row = doc.createElement('div')
          row.className = 'verdict-row'
          const yes = doc.createElement('button')
          yes.type = 'button'
          yes.className = 'verdict-yes'
          yes.textContent = '승인'
          const no = doc.createElement('button')
          no.type = 'button'
          no.className = 'verdict-no'
          no.textContent = '거절'
          // 비활성은 클릭 처리의 첫 동작 — 어떤 await 보다 앞선다 (REQ-WEBRICH-009).
          // 가드는 이중 전송의 두 번째 경로(disabled 클릭이 이벤트를 만드는 환경)까지 막는다.
          yes.addEventListener('click', () => {
            if (yes.disabled) return
            yes.disabled = true
            no.disabled = true
            resolved.add(rid)
            pending.delete(rid)
            sendVerdict(m, rid, 'allow')
          })
          no.addEventListener('click', () => {
            if (no.disabled) return
            no.disabled = true
            yes.disabled = true
            resolved.add(rid)
            pending.delete(rid)
            sendVerdict(m, rid, 'deny')
          })
          row.appendChild(yes)
          row.appendChild(no)
          el.appendChild(row)
          if (!pending.has(rid)) pending.set(rid, [])
          pending.get(rid).push(yes, no)
        }
      }
    },
  }
}

// ── 봇 참여 · 등록 명령 ─────────────────────────────────────────────────
// v2 (SPEC-BOTMODEL-001): 초대(방별 토큰)는 없다. 아래 선택 목록은 «참여 추가» 에, 결과 표시 둘은 «봇 등록 명령» 에 쓰인다.
// 함수 이름은 형제 기준이 부르는 계약 표면이라 그대로 둔다.

// 봇 선택 목록 — 항목은 이름만, 클릭이 onPick 으로 봇 객체를 넘긴다 (REQ-WEBRICH-012).
export function buildInviteChoices({ bots, doc, onPick }) {
  const list = doc.createElement('ul')
  list.className = 'invite-choices'
  for (const bot of bots) {
    const item = doc.createElement('li')
    item.className = 'invite-choice'
    item.textContent = bot.name
    item.addEventListener('click', () => onPick(bot))
    list.appendChild(item)
  }
  return list
}

// 등록 응답의 command 문자열을 그대로 textContent 에 넣는다 — 자르거나 다시 조립하지 않는다 (REQ-WEBRICH-012).
// 토큰·명령이 사는 곳은 화면의 DOM 노드가 유일하다 (REQ-WEBRICH-013).
export function applyInviteResult(nodes, res) {
  nodes.commandEl.textContent = res.command
  nodes.resultEl.hidden = false
}

// 다이얼로그가 닫힐 때 부른다 — 평문 토큰이 페이지 수명 내내 DOM 에 남지 않게 (REQ-WEBRICH-015).
export function clearInviteResult(nodes) {
  nodes.commandEl.textContent = ''
  nodes.resultEl.hidden = true
}

// 클립보드 복사 — 부재(비보안 오리진)와 거부를 모두 잡아 false 로 돌리고 onFail 로 알린다 (REQ-WEBRICH-014).
// 조용한 성공의 척은 없다: 실패는 반드시 호출자에게 보인다.
export async function copyText(text, deps) {
  const clip = deps.nav?.clipboard
  if (!clip || typeof clip.writeText !== 'function') {
    deps.onFail(new Error('클립보드를 사용할 수 없습니다'))
    return false
  }
  try {
    await clip.writeText(text)
    return true
  } catch (err) {
    deps.onFail(err)
    return false
  }
}
