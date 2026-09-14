// 출처 핀: minidiscord web/markdown.js — 저장소 핀 dfa33c3, 이 파일이 마지막으로 바뀐 커밋 b374dc8 2026-09-11, 원본 sha256 6db7e2c1728e369db14bf846327a222c5faf9f885c10417fb7dec7ef3305e28f
// 아래는 원본을 한 글자도 안 바꾼 사본이다. 고칠 일은 minidiscord 에서 하고 다시 옮긴다 (ARCHITECTURE 7절 · ADR-010).
// cockpit 화면에서 마크다운을 DOM 으로 바꾸는 유일한 자리다 — innerHTML 을 쓰지 않는다 (test/web-static.test.js).

/*
 * minidiscord 웹 마크다운 렌더러 (SPEC-WEBMD-001)
 *
 * 바닐라 ES 모듈 — 외부 라이브러리 없이 브라우저가 직접 읽는다. 안전 설계 요지:
 *   - HTML 조립 API(innerHTML 등)를 전혀 쓰지 않고 createElement + textContent 로만
 *     노드를 만든다 (REQ-WEBMD-005)
 *   - createElement 에 넘기는 태그 이름은 항상 문자열 리터럴이다 — 입력 유래 문자열이
 *     태그 이름·속성 이름으로 흘러갈 구멍을 구조적으로 닫는다 (REQ-WEBMD-005)
 *   - 인라인 스캐너는 문자 단위 단일 패스 — 닫는 마커를 못 찾으면 즉시 리터럴로
 *     떨어지고 되돌아가지 않는다. 적대적 입력('*'.repeat(10000))이 선형 시간에
 *     끝나는 이유다 (REQ-WEBMD-013)
 *
 * 파이프라인: normalizeSource → parseBlocks(순수 AST) → buildBlock(DOM) → renderInline
 *
 * @MX:NOTE — 모듈 계약·안전 설계의 근거는 SPEC-WEBMD-001 (`.moai/specs/SPEC-WEBMD-001/spec.md`).
 *   요구사항 번호(REQ-WEBMD-*)는 그 본문이 소유한다 — 문구를 고칠 때 SPEC 본문과 함께 볼 것.
 */

// ── 상한 (REQ-WEBMD-013) ─────────────────────────────────────────────
// 성능 최적화가 아니라 적대적 입력 방어다. 초과분은 버리거나 문단·리터럴로 떨어뜨린다.
const MAX_SOURCE_LENGTH = 20000
const MAX_BLOCK_DEPTH = 6
const MAX_INLINE_DEPTH = 4
const MAX_TABLE_COLS = 50
const MAX_TABLE_ROWS = 500
// 잘림 표시 — 상한에 걸린 입력이 조용히 끝나지 않게 본문 안에 흔적을 남긴다
const TRUNCATION_NOTICE = '\n\n(입력이 20,000자를 넘어 잘렸습니다)'

// 링크 라벨이 «URL 처럼 생겼다» 판별 술어 — REQ-WEBMD-008 이 정규식으로 못박은 그대로다.
// 첫 갈래는 스킴이 붙은 라벨, 둘째 갈래는 스킴 없는 호스트 형태(good.example/settings)를 잡는다.
const URL_LIKE_LABEL_RE = /^\s*(https?:\/\/|[a-z0-9-]+(\.[a-z0-9-]+)+(?=[:\/?#]|\s*$))/i
// 라벨 안의 방향 제어 문자(LRE·LRO·RLE·RLO·PDF·LRI·RLI·FSI·PDI) — 치환 대상 (REQ-WEBMD-008)
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069]/g
// safeHref 1단계 사전 정제 — 제어문자·보이지 않는 공백·BOM·방향 제어 (REQ-WEBMD-006).
// 브라우저는 스킴 안의 TAB/LF/CR 을 무시하므로 정제가 판정보다 먼저 와야 한다.
const HREF_SANITIZE_RE = /[\u0000-\u001F\u007F-\u009F\u00A0\u1680\u180E\u2000-\u200F\u202A-\u202F\u205F\u2060-\u2069\u3000\uFEFF]/g

// 멘션 이름 한 글자 멈춤 판정 — 이름은 (·)·공백이 없는 한 글자 이상 (REQ-WEBMD2-003).
// test 로만 쓰므로 /g 를 붙이지 않는다(lastIndex 상태가 생긴다).
// @MX:NOTE: [AUTO] 멘션 토큰(@TO/@CC)의 자격 문법은 서버 라우팅 문법(server/src/mention.ts MENTION_RE)과 1:1 이다 —
//   표시 전용 길이 상한·«줄 시작» 제한을 덧대면 «라우팅은 되고 배지는 안 뜌» 괴리가 생긴다 (SPEC-WEBMD-002 REQ-WEBMD2-003).
const MENTION_NAME_STOP_RE = /[()\s]/

// ── URL 스킴 세 겹 검사 (REQ-WEBMD-006) ──────────────────────────────
// @MX:ANCHOR: [AUTO] 신뢰 경계 밖 문자열이 a.href 로 흘러가는 유일한 관문 — 렌더러의 모든 링크가 이 판정에 산다
// @MX:REASON: 정제→화이트리스트→URL 파서 순서를 바꾸면 java<TAB>script: 류가 순진한 접두 검사를 통과한다. 이 순서 자체가 계약이다 (REQ-WEBMD-006)
export function safeHref(raw) {
  // 1) 사전 정제 — 제어문자와 보이지 않는 공백·BOM·방향 제어 문자를 제거한다
  const cleaned = String(raw).replace(HREF_SANITIZE_RE, '')
  // 2) 화이트리스트 — http(s) 절대 URL 만. 상대·프로토콜 상대·조각도 전부 거부
  if (!/^https?:\/\//.test(cleaned)) return null
  // 3) URL 파서 재확인 — 파서가 거부하거나 프로토콜이 어긋나면 거부
  try {
    const u = new URL(cleaned)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

// 코드블록 언어 토큰 검증 (REQ-WEBMD-009) — 첫 공백 구분 단어만 취해 검사한다.
// 검증이 없으면 공격자가 기존 앱 클래스를 얻고, 빈/공백 토큰은 classList 에서
// DOMException 을 던져 렌더 전체가 폴백으로 떨어진다.
export function codeLangToken(info) {
  if (typeof info !== 'string') return null
  const first = info.trim().split(/\s+/)[0] ?? ''
  if (!/^[A-Za-z0-9][A-Za-z0-9+#._-]{0,19}$/.test(first)) return null
  return first.toLowerCase()
}

// ── 문자열 → 줄 배열 ─────────────────────────────────────────────────
// 입력 길이 상한 — 잘라내고 잘림 표시를 남긴다 (REQ-WEBMD-013)
function normalizeSource(src) {
  let text = String(src ?? '')
  if (text.length > MAX_SOURCE_LENGTH) text = text.slice(0, MAX_SOURCE_LENGTH) + TRUNCATION_NOTICE
  return text.replace(/\r\n?/g, '\n').split('\n')
}

// ── 블록 스캐너 — 시도 순서가 곧 우선순위다 (plan §B.2) ────────────────
// 각 스캐너는 (lines, i, depth) → { node, next } | null. node 는 순수 객체다.

// 1) 펜스 — 반드시 최우선. 코드 안의 #·|·- 가 제목·표·수평선으로 오독되지 않게 한다
function scanFence(lines, i) {
  if (!lines[i].startsWith('```')) return null
  const info = lines[i].slice(3).trim()
  const content = []
  let j = i + 1
  while (j < lines.length && !lines[j].startsWith('```')) {
    content.push(lines[j])
    j++
  }
  // 미닫힘 펜스는 입력 끝에서 자동 종료된다 — 뒤 내용을 삼키지 않는다
  return { node: { type: 'fence', info: info === '' ? undefined : info, code: content.join('\n') }, next: Math.min(j + 1, lines.length) }
}

// 한 행을 셀 배열로 — 앞뒤 바깥 파이프는 무시하고 가운데 | 로만 나눈다
function splitRow(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map(c => c.trim())
}

// 구분 행 — |:---|:---:|---:| 모양. 이것이 있어야 표로 인정한다 (1줄 lookahead)
function isDelimiterRow(line) {
  if (!line.includes('|')) return false
  const cells = splitRow(line)
  return cells.length > 0 && cells.every(c => /^:?-{3,}:?$/.test(c))
}

// 2) 표 — 다음 줄이 구분 행일 때만 표다. | 를 쓴 평범한 문장이 표가 되지 않게 하는 절
function scanTable(lines, i) {
  if (!lines[i].includes('|')) return null
  if (i + 1 >= lines.length || !isDelimiterRow(lines[i + 1])) return null
  const header = splitRow(lines[i]).slice(0, MAX_TABLE_COLS)
  const align = splitRow(lines[i + 1]).slice(0, MAX_TABLE_COLS).map(c => {
    const l = c.startsWith(':')
    const r = c.endsWith(':')
    return l && r ? 'center' : l ? 'left' : r ? 'right' : null
  })
  const rows = []
  let j = i + 2
  while (j < lines.length && lines[j].trim() !== '' && lines[j].includes('|') && !lines[j].startsWith('```')) {
    if (rows.length < MAX_TABLE_ROWS) rows.push(splitRow(lines[j]).slice(0, MAX_TABLE_COLS))
    j++
  }
  return { node: { type: 'table', header, align, rows }, next: j }
}

// 3) 제목 — #~###### + 공백. 7개(#######)는 맞지 않아 문단으로 흘러간다
function scanHeading(lines, i) {
  const m = /^(#{1,6})\s+(.*)$/.exec(lines[i])
  if (m === null) return null
  return { node: { type: 'h', level: m[1].length, text: m[2] }, next: i + 1 }
}

// 4) 수평선 — --- (3개 이상). setext 를 지원하지 않으므로 --- 는 항상 수평선이다
function scanHr(lines, i) {
  if (!/^-{3,}\s*$/.test(lines[i])) return null
  return { node: { type: 'hr' }, next: i + 1 }
}

// 5) 인용 — > 접두를 한 겹 벗겨 다시 블록 파서로 넘긴다 (접두 제거 후 재귀)
function scanQuote(lines, i, depth) {
  if (!lines[i].startsWith('>')) return null
  const inner = []
  let j = i
  while (j < lines.length && lines[j].startsWith('>')) {
    inner.push(lines[j].replace(/^> ?/, ''))
    j++
  }
  return { node: { type: 'quote', blocks: parseBlocks(inner, depth + 1) }, next: j }
}

// 6) 목록 — 들여쓰기 2칸 이상은 현재 항목의 하위 블록으로 모아 재귀한다.
// 중첩과 항목 안 코드블록이 이 재귀에서 자연히 따라온다 (REQ-WEBMD-003)
function scanList(lines, i, depth) {
  const firstB = /^[-*+]\s+(.*)$/.exec(lines[i])
  const firstO = /^(\d{1,9})[.)]\s+(.*)$/.exec(lines[i])
  if (firstB === null && firstO === null) return null
  const ordered = firstO !== null
  const items = []
  let current = null
  let j = i
  while (j < lines.length) {
    const line = lines[j]
    if (line.trim() === '') break                        // 빈 줄은 목록을 끝낸다
    if (/^\s{2,}/.test(line)) {
      if (current === null) break
      current.sub.push(line.replace(/^\s+/, ''))
      j++
      continue
    }
    const b = /^[-*+]\s+(.*)$/.exec(line)
    const o = /^(\d{1,9})[.)]\s+(.*)$/.exec(line)
    const marker = ordered ? o : b
    if (marker === null) break                           // 종류가 바뀌면 목록을 끝낸다
    // 텍스트 그룹 자리는 종류가 가른다 — 번호 목록은 [2](번호가 [1]), 불릿은 [1] 이다
    current = { text: ordered ? marker[2] : marker[1], sub: [] }
    items.push(current)
    j++
  }
  if (items.length === 0) return null
  return {
    node: {
      type: 'list',
      ordered,
      start: ordered ? Number(firstO[1]) : undefined,
      items: items.map(it => ({ text: it.text, blocks: it.sub.length > 0 ? parseBlocks(it.sub, depth + 1) : [] })),
    },
    next: j,
  }
}

// 문단이 흡수하지 않아야 할 줄 — 블록 시작 문양
function startsBlock(line, lines, j) {
  if (line.startsWith('```')) return true
  if (/^#{1,6}\s/.test(line)) return true
  if (/^-{3,}\s*$/.test(line)) return true
  if (line.startsWith('>')) return true
  if (/^[-*+]\s/.test(line)) return true
  if (/^\d{1,9}[.)]\s/.test(line)) return true
  // 표 후보 — 지금 줄에 | 가 있고 다음 줄이 구분 행이면 문단이 먹지 않는다
  if (line.includes('|') && j + 1 < lines.length && isDelimiterRow(lines[j + 1])) return true
  return false
}

// 7) 문단 — 폴백. 항상 성공한다 — 어떤 줄도 미아가 되지 않는다
function scanParagraph(lines, i) {
  const parts = [lines[i]]
  let j = i + 1
  while (j < lines.length && lines[j].trim() !== '' && !startsBlock(lines[j], lines, j)) {
    parts.push(lines[j])
    j++
  }
  return { node: { type: 'p', text: parts.join('\n') }, next: j }
}

// ── 블록 파서 — 순수 객체 AST 를 돌려준다 ─────────────────────────────
// DOM 이 없으므로 테스트가 파서만 단언할 수 있다 (plan §B.1). 파서 상태는 인자로만
// 흐른다 — 모듈 수준 상태가 없어 호출마다 완전히 초기화된다 (REQ-WEBMD-012).
// depth > 상한이면 남은 줄을 문단으로 처리한다 — 중첩 폭탄 방어 (REQ-WEBMD-013).
export function parseBlocks(lines, depth = 0) {
  const blocks = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].trim() === '') { i++; continue }
    if (depth > MAX_BLOCK_DEPTH) {
      blocks.push({ type: 'p', text: lines.slice(i).join('\n') })
      break
    }
    const scanned = scanFence(lines, i) ??
      scanTable(lines, i) ??
      scanHeading(lines, i) ??
      scanHr(lines, i) ??
      scanQuote(lines, i, depth) ??
      scanList(lines, i, depth) ??
      scanParagraph(lines, i)
    blocks.push(scanned.node)
    // 미아 방지 — 스캐너가 진행하지 못하면 한 줄이라도 전진한다
    i = scanned.next > i ? scanned.next : i + 1
  }
  return blocks
}

// ── AST → DOM ────────────────────────────────────────────────────────
// createElement 에 넘기는 태그 이름은 아래 전체에서 문자열 리터럴뿐이다 (REQ-WEBMD-005).
// 'h' + level 같은 조립은 쓰지 않는다 — switch 의 각 case 가 리터럴을 직접 넘긴다.

function buildBlocks(blocks, doc, depth) {
  const frag = doc.createDocumentFragment()
  for (const b of blocks) frag.appendChild(buildBlock(b, doc, depth))
  return frag
}

function buildBlock(b, doc, depth) {
  switch (b.type) {
    case 'p': {
      const p = doc.createElement('p')
      p.className = 'md-p'
      appendInlineLines(p, b.text, doc, 0)
      return p
    }
    case 'h': {
      let h
      switch (b.level) {
        case 1: h = doc.createElement('h1'); break
        case 2: h = doc.createElement('h2'); break
        case 3: h = doc.createElement('h3'); break
        case 4: h = doc.createElement('h4'); break
        case 5: h = doc.createElement('h5'); break
        default: h = doc.createElement('h6')
      }
      h.className = 'md-h'
      appendInlineLines(h, b.text, doc, 0)
      return h
    }
    case 'fence':
      return buildFence(b, doc)
    case 'hr': {
      const hr = doc.createElement('hr')
      hr.className = 'md-hr'
      return hr
    }
    case 'quote': {
      const q = doc.createElement('blockquote')
      q.className = 'md-quote'
      q.appendChild(buildBlocks(b.blocks, doc, depth + 1))
      return q
    }
    case 'list':
      return buildList(b, doc, depth)
    case 'table':
      return buildTable(b, doc)
    default:
      return doc.createDocumentFragment()
  }
}

// 펜스 코드블록 — pre.md-pre > code (+검증된 언어 토큰 클래스·라벨)
function buildFence(b, doc) {
  const pre = doc.createElement('pre')
  pre.className = 'md-pre'
  const code = doc.createElement('code')
  const token = codeLangToken(b.info)
  if (token !== null) {
    // 고정 접두사로만 클래스를 만든다 — 토큰이 기존 앱 클래스를 얻을 수 없다 (REQ-WEBMD-009)
    code.className = 'md-lang-' + token
  }
  // 코드 본문은 원문 그대로 — 안에서는 #·|·- 도 아무것도 해석하지 않는다 (REQ-WEBMD-003)
  code.textContent = b.code
  pre.appendChild(code)
  if (token !== null) {
    // 언어 라벨 — CSS .md-code-lang 이 우상단 절대배치한다
    const label = doc.createElement('span')
    label.className = 'md-code-lang'
    label.textContent = token
    pre.appendChild(label)
  }
  return pre
}

function buildList(b, doc, depth) {
  let list
  if (b.ordered) {
    list = doc.createElement('ol')
    list.className = 'md-ol'
    // IDL 속성 반영 — getAttribute('start') 로 읽힌다. 입력은 스캐너의 숫자 정규화를 지난다
    list.start = Number.isFinite(b.start) ? b.start : 1
  } else {
    list = doc.createElement('ul')
    list.className = 'md-ul'
  }
  for (const item of b.items) {
    const li = doc.createElement('li')
    li.className = 'md-li'
    appendInlineLines(li, item.text, doc, 0)
    for (const child of item.blocks) li.appendChild(buildBlock(child, doc, depth + 1))
    list.appendChild(li)
  }
  return list
}

function buildTable(b, doc) {
  const wrap = doc.createElement('div')
  wrap.className = 'md-table-wrap'
  const table = doc.createElement('table')
  table.className = 'md-table'
  const thead = doc.createElement('thead')
  const headRow = doc.createElement('tr')
  b.header.forEach((cell, idx) => {
    const th = doc.createElement('th')
    // 왼쪽 정렬은 기본값이라 클래스를 붙이지 않는다 — center·right 만 고정 접미 클래스
    if (b.align[idx] === 'center') th.className = 'md-al-center'
    else if (b.align[idx] === 'right') th.className = 'md-al-right'
    th.appendChild(renderInline(cell, doc, 0))
    headRow.appendChild(th)
  })
  thead.appendChild(headRow)
  table.appendChild(thead)
  const tbody = doc.createElement('tbody')
  for (const row of b.rows) {
    const tr = doc.createElement('tr')
    for (const cell of row) {
      const td = doc.createElement('td')
      td.appendChild(renderInline(cell, doc, 0))
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  wrap.appendChild(table)
  return wrap
}

// ── 인라인 — 문자 단위 단일 패스 (plan §B.3) ─────────────────────────
// 우선순위: 코드스팬(최상위) → 링크 → 자동링크 → 취소선 → 굵게 → 기울임.
// 굵게가 기울임보다 앞이어야 ** 를 *+* 로 잘못 읽지 않는다.
// 닫는 구분자를 못 찾으면 즉시 리터럴로 떨어진다 — 되돌아가 다른 조합을 시도하지
// 않는다. 백트래킹 폭발이 없는 이유이며 적대적 입력이 선형 시간에 끝나는 이유다.
// @MX:ANCHOR: [AUTO] 인라인 문법 전부(강조·코드스팬·링크·자동링크·취소선)의 단일 관문 — 블록 빌더 전체가 이 함수로 리프 텍스트를 만든다
// @MX:REASON: 우선순위 순서와 «즉시 리터럴화» 가 렌더 결과를 결정한다. 순서를 바꾸면 코드스팬 우위(REQ-WEBMD-003)와 선형 시간(REQ-WEBMD-013)이 함께 깨진다
export function renderInline(text, doc, depth = 0) {
  const frag = doc.createDocumentFragment()
  const src = String(text)
  // 인라인 재귀 상한 초과 — 남은 텍스트를 리터럴로 둔다 (REQ-WEBMD-013)
  if (depth > MAX_INLINE_DEPTH) {
    frag.appendChild(doc.createTextNode(src))
    return frag
  }
  const push = s => { if (s !== '') frag.appendChild(doc.createTextNode(s)) }
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '`') {
      const close = src.indexOf('`', i + 1)
      if (close === -1) { push(ch); i++; continue }          // 못 닫으면 즉시 리터럴
      const code = doc.createElement('code')
      code.className = 'md-code'
      code.textContent = src.slice(i + 1, close)
      frag.appendChild(code)
      i = close + 1
      continue
    }
    if (ch === '!' && src[i + 1] === '[') {
      // ![alt](url) 이미지 문법은 지원하지 않는다 — ! 뒤가 링크로 새는 것도 금지다 (REQ-WEBMD-004)
      const link = matchLink(src, i + 1)
      if (link !== null) {
        push(src.slice(i, link.end))                          // 원문 전체가 텍스트다
        i = link.end
        continue
      }
      push(ch)
      i++
      continue
    }
    if (ch === '[') {
      const link = matchLink(src, i)
      if (link === null) { push(ch); i++; continue }
      const href = safeHref(link.href)
      if (href === null) {
        // 죽은 링크를 만들지도, 조용히 삼키지도 않는다 — 원문을 텍스트로 남긴다 (REQ-WEBMD-006)
        push(src.slice(i, link.end))
        i = link.end
        continue
      }
      frag.appendChild(buildAnchor(link.label, href, doc, depth, false))
      i = link.end
      continue
    }
    if (ch === '~' && src.startsWith('~~', i)) {
      const close = src.indexOf('~~', i + 2)
      if (close === -1) { push('~~'); i += 2; continue }
      const del = doc.createElement('s')
      del.appendChild(renderInline(src.slice(i + 2, close), doc, depth + 1))
      frag.appendChild(del)
      i = close + 2
      continue
    }
    if (ch === '*') {
      if (src.startsWith('**', i)) {
        const close = src.indexOf('**', i + 2)
        if (close === -1) { push('**'); i += 2; continue }
        const strong = doc.createElement('strong')
        strong.appendChild(renderInline(src.slice(i + 2, close), doc, depth + 1))
        frag.appendChild(strong)
        i = close + 2
        continue
      }
      const close = src.indexOf('*', i + 1)
      if (close === -1) { push(ch); i++; continue }
      const em = doc.createElement('em')
      em.appendChild(renderInline(src.slice(i + 1, close), doc, depth + 1))
      frag.appendChild(em)
      i = close + 1
      continue
    }
    // 자동링크 — http(s):// 로 시작하는 연속 실행. 라벨 == href 이므로 힌트가 없다 (REQ-WEBMD-008)
    if (src.startsWith('http://', i) || src.startsWith('https://', i)) {
      const m = /^https?:\/\/[^\s<>]+/i.exec(src.slice(i))
      if (m !== null) {
        const href = safeHref(m[0])
        if (href !== null) {
          frag.appendChild(buildAnchor(m[0], href, doc, depth, true))
          i += m[0].length
          continue
        }
      }
    }
    // 멘션 토큰 — @TO(이름)/@CC(이름). 자격 문법은 서버 라우팅 문법과 같다:
    // 대문자 TO/CC 만, 이름은 (·)·공백 없는 한 글자 이상 (REQ-WEBMD2-003).
    // 각 자리에서 고정 문법 한 번만 시도하고 실패(소문자·빈 이름·공백·괄호·미닫힘)하면
    // 한 글자 리터럴로 떨어진다 — 되돌아가는 시도가 없다 (REQ-WEBMD2-005·008).
    // 이름 스캔이 '(' 를 멈춤 글자로 삼는 덕에 '@TO(x@TO(x…' 폭탄에서 스캔 구간이
    // 서로 겹치지 않아 전체가 선형이다. @ 는 기존 어떤 인라인 마커도 아니어서
    // 분기를 스캔 말미에 두어도 기존 우선순위(코드스팬 최상위 등)를 흔들지 않는다.
    if (ch === '@') {
      const kind = src.startsWith('@TO(', i) ? 'to' : src.startsWith('@CC(', i) ? 'cc' : null
      if (kind !== null) {
        let k = i + 4
        while (k < src.length && !MENTION_NAME_STOP_RE.test(src[k])) k++
        if (k > i + 4 && src[k] === ')') {
          // 종류 칩 + 이름 텍스트 — createElement·className·textContent 로만 조립하고
          // className 의 종류 값은 고정 리터럴 'to'/'cc' 뿐이다 (REQ-WEBMD2-007)
          const chip = doc.createElement('span')
          chip.className = 'md-mention ' + kind
          chip.textContent = kind === 'to' ? 'TO' : 'CC'
          frag.appendChild(chip)
          push(src.slice(i + 4, k))      // 이름은 다시 인라인 문법으로 해석하지 않는다 (REQ-WEBMD2-001)
          i = k + 1
          continue
        }
      }
    }
    push(ch)
    i++
  }
  return frag
}

// [텍스트](url) 매칭 — 라벨은 첫 ] 까지, url 은 괄호 균형이 맞을 때까지.
// 되돌아가는 시도가 없다 — 못 찾으면 null (호출부가 한 글자 리터럴로 떨어뜨린다)
function matchLink(src, start) {
  let j = start + 1
  while (j < src.length && src[j] !== ']') j++
  if (j >= src.length) return null
  const label = src.slice(start + 1, j)
  if (src[j + 1] !== '(') return null
  let k = j + 2
  let paren = 1
  while (k < src.length) {
    const c = src[k]
    if (c === '(') paren++
    else if (c === ')') {
      paren--
      if (paren === 0) break
    } else if (/\s/.test(c)) {
      return null                       // url 에 공백이 있으면 링크가 아니다
    }
    k++
  }
  if (k >= src.length) return null
  return { label, href: src.slice(j + 2, k), end: k + 1 }
}

// 앵커 조립 — 속성은 화이트리스트 리터럴뿐이고 rel 은 두 토큰을 모두 갖는다 (REQ-WEBMD-007).
// noopener 가 없으면 새 탭이 window.opener 로 원본 창을 조작하는 탭내빙이 열린다.
function buildAnchor(label, href, doc, depth, isAutolink) {
  const frag = doc.createDocumentFragment()
  const a = doc.createElement('a')
  a.setAttribute('href', href)
  a.setAttribute('rel', 'noopener noreferrer')
  a.setAttribute('target', '_blank')
  a.setAttribute('title', href)
  // 라벨은 마커를 다시 해석하지 않는 텍스트 노드다 — 링크 안에 링크가 중첩되는 것을
  // 구조적으로 막고(HTML 에서 a 는 a 를 품지 못한다), 라벨 안의 방향 제어 문자는
  // 치환 문자로 바꾼다 — 라벨에만 적용한다 (REQ-WEBMD-008)
  a.appendChild(doc.createTextNode(String(label).replace(BIDI_RE, '\uFFFD')))
  frag.appendChild(a)
  if (!isAutolink) {
    const hint = hostHintSpan(label, href, doc)
    if (hint !== null) frag.appendChild(hint)
  }
  return frag
}

// 라벨 위장 표시 — 라벨이 URL 처럼 생겼는데 호스트가 href 와 다르면 진짜 호스트를 드러낸다.
// 판별 술어와 호스트 비교 방법은 REQ-WEBMD-008 이 못박은 그대로다.
function hostHintSpan(label, href, doc) {
  const m = URL_LIKE_LABEL_RE.exec(label)
  if (m === null) return null           // URL 형이 아닌 평범한 문장 — 힌트를 붙이지 않는다
  let hrefHost = null
  try { hrefHost = new URL(href).host } catch { return null }
  let labelHost = null
  try {
    const trimmed = label.trim()
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed
    labelHost = new URL(candidate).host
  } catch {
    labelHost = null                    // 라벨을 파싱하지 못하면 표시하는 쪽으로 떨어진다 — fail-loud
  }
  if (labelHost !== null && labelHost === hrefHost) return null   // 같은 호스트 — 힌트 없다
  const span = doc.createElement('span')
  span.className = 'md-link-host'
  span.textContent = '(' + hrefHost + ')'
  return span
}

// 문단 안의 단일 개행은 하드 브레이크다 — GFM 이 아니라 채팅 관례다.
// Enter 한 번이 무시되면 사용자는 버그로 인식한다 (REQ-WEBMD-010).
function appendInlineLines(el, text, doc, depth) {
  const segs = String(text).split('\n')
  for (let k = 0; k < segs.length; k++) {
    if (k > 0) el.appendChild(doc.createElement('br'))
    el.appendChild(renderInline(segs[k], doc, depth))
  }
}

// ── 진입점 ───────────────────────────────────────────────────────────
// 문자열 → DocumentFragment. 인자로 받은 원문 문자열과 doc 를 변형하지 않고,
// 만든 노드는 반환하는 fragment 안에만 들어간다 — doc 의 기존 트리를 직접 붙이지
// 않는다 (REQ-WEBMD-012). 블록 사이에 텍스트 노드를 만들지 않는다 (REQ-WEBMD-010).
// @MX:ANCHOR: [AUTO] 모듈 유일 진입점 — renderMessage(이력 루프·SSE 수신의 동기 경로)가 이 함수 하나로 본문을 그린다
// @MX:REASON: 호출부는 이 함수를 try/catch 로 감싸 폴백한다(REQ-WEBMD-011) — 이 함수가 던지는 예외는 «예상 못한 입력» 신호이며 폴백 계약의 절반이다
export function renderMarkdown(src, doc = document) {
  const lines = normalizeSource(src)
  const blocks = parseBlocks(lines, 0)
  return buildBlocks(blocks, doc, 0)
}
