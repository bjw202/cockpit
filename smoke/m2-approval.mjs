// 스모크 m2-approval — 승인 중계 왕복 (VERIFICATION 3절 · meta M2 지시 4절 2항).
//   node smoke/m2-approval.mjs <스크래치 폴더> [모델]
//
// 서버를 임시 포트에 띄우고 사람 둘을 HTTP 로 한다: 김과제(member)가 본방에 글을 올리고, 김피엘(admin)이 카드에 답한다.
// 봇에게 네 번 같은 일(Bash 로 curl --version)을 시킨다:
//   1회 거부 · 2회 허용 · 3회 이번 세션 허용 · 4회 — 같은 도구 재요청이 0 인가
// 한 판 안에서 카드가 더 오면 그 판의 답을 되풀이한다 (4회에 오는 카드는 거부).
// 내는 줄: ROUND · CARD · ANSWER · REASKED_AFTER_SESSION_ALLOW · BASH_RAN_AFTER_SESSION_ALLOW · LOCK_MESSAGES · ANSWER_MESSAGES · ASKED · COST_USD
// 판정하지 않는다.

import { makeScratch, localSettingsDrift, DEFAULT_MODEL, events, resultCount } from './lib.mjs';
import { openRuntime } from '../src/runtime.js';
import { sdkBinding } from '../src/session/sdk-query.js';
import { createServer } from '../src/http/server.js';
import { createAccount } from '../src/auth/sessions.js';

const argv = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!argv[0]) { console.error('쓰는 법: node smoke/m2-approval.mjs <스크래치 폴더> [모델]'); process.exit(1); }
const model = argv[1] || DEFAULT_MODEL;
const d = makeScratch(argv[0], 'smoke');
const rt = openRuntime(d.config, { binding: sdkBinding, model });
const server = createServer({ ...rt, config: d.config });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const tokens = {};
for (const [username, role] of [['김피엘', 'admin'], ['김과제', 'member']]) {
  const acc = await createAccount({ chatDb: rt.chatDb, cockpitDb: rt.cockpitDb, username, password: 'smoke-password', role });
  tokens[username] = rt.cockpitDb.createWebSession(acc.id);
}
const call = async (as, p, init = {}) => {
  const r = await fetch(base + p, { ...init, headers: { cookie: `md_session=${tokens[as]}`, ...(init.headers ?? {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const { main } = rt.manager.openProject({ project: d.project, botDir: d.botDir });
let code = 0;
try {
  await rt.manager.start(d.project, { resume: false });
  const ask = `@TO(${d.botName}) 시험이다. Bash 도구로 \`curl --version\` 을 딱 한 번 실행하고, 결과 첫 줄을 reply 로 알려라. `
    + '거부되면 "거부됨" 이라고만 reply 하고 다른 방법으로 다시 시도하지 마라.';
  const rounds = [['1', 'deny'], ['2', 'allow'], ['3', 'allow_session'], ['4', null]];
  let reasked = 0;
  let bashRanInLast = false;

  for (const [n, decision] of rounds) {
    const eventsBefore = events(rt, d.project).at(-1)?.id ?? 0;
    const results = resultCount(rt, d.project);
    const seen = new Set(rt.cockpitDb.recentPermissions(1000).map(r => r.tool_use_id));
    const fd = new FormData();
    fd.append('body', ask);
    await call('김과제', `/api/rooms/${main.id}/messages`, { method: 'POST', body: fd });

    let cards = 0;
    const end = Date.now() + 240_000;
    while (Date.now() < end) {
      const { body } = await call('김피엘', '/api/permissions?pending=1');
      for (const req of body?.requests ?? []) {
        if (seen.has(req.tool_use_id)) continue;
        seen.add(req.tool_use_id);
        cards++;
        const c = req.card;
        if (cards === 1) {
          console.log(`CARD round=${n} tool_use_id=${req.tool_use_id} tool=${req.tool} title=${JSON.stringify(c.title ?? null)} displayName=${JSON.stringify(c.displayName ?? null)} `
            + `description=${JSON.stringify(c.description ?? null)} suppressAlwaysAllowRule=${!!c.suppressAlwaysAllowRule} defaultToNo=${!!c.defaultToNo} suggestions=${JSON.stringify(c.suggestions ?? [])} input=${req.input}`);
        }
        let answer = decision ?? 'deny';
        if (answer === 'allow_session' && c.suppressAlwaysAllowRule) { console.log(`ANSWER allow_session SKIPPED suppressAlwaysAllowRule — allow 로 답한다`); answer = 'allow'; }
        const r = await call('김피엘', `/api/permissions/${encodeURIComponent(req.tool_use_id)}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: answer, ...(answer === 'deny' ? { reason: '스모크 거부' } : {}) }),
        });
        if (cards === 1 || decision === null) console.log(`ANSWER ${answer} ${r.status}${cards > 1 ? ` (판 안의 ${cards}번째 카드)` : ''}`);
      }
      if (resultCount(rt, d.project) > results && rt.manager.state(d.project) === 'idle') break;
      await new Promise(r => setTimeout(r, 500));
    }
    const turnEvents = events(rt, d.project).filter(e => e.id > eventsBefore);
    const bash = turnEvents.filter(e => e.type === 'tool_use' && e.data.name === 'Bash');
    const botReply = rt.chatDb.messagesAfter(main.id, 0).filter(m => m.author_type === 'bot').at(-1);
    console.log(`ROUND ${n} decision=${decision ?? '(재요청 보기)'} cards=${cards} bash_tool_uses=${bash.length} turn_done=${resultCount(rt, d.project) > results ? 'yes' : 'no'} last_bot_reply=${JSON.stringify((botReply?.body ?? '').slice(0, 80))}`);
    if (decision === null) { reasked = cards; bashRanInLast = bash.length > 0; }
    if (resultCount(rt, d.project) <= results) code = 1;
  }

  const sys = rt.chatDb.messagesAfter(main.id, 0).filter(m => m.author_type === 'system').map(m => m.body);
  // 이번 세션 허용은 destination=session 이라 봇 폴더 설정 파일을 바꾸지 않아야 한다 (meta N7 · W2-refix 4절)
  const drift = localSettingsDrift(d);
  console.log(`LOCAL_SETTINGS_CHANGED ${drift.changed ? 'yes' : 'no'} ${JSON.stringify(drift.added)}`);
  console.log(`REASKED_AFTER_SESSION_ALLOW ${reasked}`);
  console.log(`BASH_RAN_AFTER_SESSION_ALLOW ${bashRanInLast ? 'yes' : 'no'}`);
  console.log(`LOCK_MESSAGES ${sys.filter(b => b.startsWith('🔒')).length}`);
  console.log(`ANSWER_MESSAGES ${sys.filter(b => b.startsWith('✅')).length} ${sys.filter(b => b.startsWith('⛔')).length}`);
  console.log(`ASKED ${JSON.stringify(rt.cockpitDb.recentPermissions(1000).reverse().map(r => `${r.tool}:${r.behavior}`))}`);
  const err = events(rt, d.project).find(e => e.type === 'error');
  if (err) { console.log(`ERROR ${JSON.stringify(err.data)}`); code = 1; }
  console.log(`COST_USD ${rt.cockpitDb.agentSession(d.project).cost_usd.toFixed(4)}`);
} finally {
  server.closeAllConnections();
  server.close();
  await rt.close();
}
process.exit(code);
