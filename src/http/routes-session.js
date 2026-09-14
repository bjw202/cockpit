// 세션 조작 길 (ARCHITECTURE 5.2 · 8.2) — admin 만. 본문은 받지 않는다(와도 흘려보낸다).
//   POST /api/projects/:name/session/start                → 200 { ok, project, state, session_id } · 409 상한 · 502 못 켬(state error)
//   POST /api/projects/:name/session/stop[?confirm=1]     → 200 { ok, project, state:'stopped' }
//                                                           · 409 { error, code:'TASKS_RUNNING', tasks } — 백그라운드 도우미가 돌고 confirm 이 없으면
//   POST /api/projects/:name/session/interrupt            → 200 { ok, project, state } · 409 꺼져 있음
//   POST /api/projects/:name/session/compact              → 200 { ok, project, state, queued } — working 이면 걸어 두고 다음 idle 에
//   POST /api/projects/:name/session/restart[?confirm=1]  → 200 { ok, project, state, session_id, resumed } · 409 TASKS_RUNNING
//   POST /api/projects/:name/tasks/:taskId/stop           → 200 { ok, project, task_id } · 409 꺼져 있음
// 없는 과제는 모두 404. 멈춤 · 끄기 · 다시 켜기는 그 과제의 걸린 승인 요청을 거둬 감으로 닫는다 (ARCHITECTURE 5.2 멈춤).
// meta 의 대본 재생이 손 걸음(압축 · 끄기 · 켜기)을 이 길로 대신한다 (M3.M 준비 · ARCHITECTURE 8.3).

import { HttpError } from './respond.js';

export function registerSessionRoutes(route, ctx) {
  const project = (req, name) => {
    req.resume();
    if (!ctx.cockpitDb.agentSession(name)) throw new HttpError(404, { error: `과제가 없습니다: ${name}` });
    return name;
  };
  const view = (name, extra = {}) => ({ ok: true, project: name, state: ctx.manager.state(name), session_id: ctx.cockpitDb.agentSession(name)?.session_id ?? null, ...extra });
  const confirmed = url => ['1', 'true', 'yes'].includes(String(url.searchParams.get('confirm') ?? '').toLowerCase());
  const guardTasks = (name, url) => {
    const tasks = ctx.manager.backgroundTasks(name);
    if (tasks.length && !confirmed(url)) {
      throw new HttpError(409, { error: `백그라운드 도우미 ${tasks.length}개가 돌고 있습니다 — 확인하려면 confirm=1`, code: 'TASKS_RUNNING', tasks });
    }
  };
  const started = (name, s, extra) => {
    if (s.state === 'error') {
      const err = ctx.cockpitDb.lastEvents(name, 'error', 1)[0]?.data?.error ?? '세션을 못 켰습니다';
      throw new HttpError(502, { error: err, state: 'error' });
    }
    return view(name, extra);
  };

  route('POST', '/api/projects/:name/session/start', async ({ req, params }) => {
    const name = project(req, params.name);
    return started(name, await ctx.manager.start(name, { resume: true }));
  }, { auth: 'admin' });

  route('POST', '/api/projects/:name/session/stop', async ({ req, url, params }) => {
    const name = project(req, params.name);
    guardTasks(name, url);
    ctx.relay?.cancelProject(name);
    await ctx.manager.stop(name);
    return view(name);
  }, { auth: 'admin' });

  route('POST', '/api/projects/:name/session/interrupt', async ({ req, params }) => {
    const name = project(req, params.name);
    await ctx.manager.interrupt(name);
    ctx.relay?.cancelProject(name);
    return view(name);
  }, { auth: 'admin' });

  route('POST', '/api/projects/:name/session/compact', ({ req, params }) => {
    const name = project(req, params.name);
    const queued = ctx.manager.compact(name);
    return view(name, { queued });
  }, { auth: 'admin' });

  route('POST', '/api/projects/:name/session/restart', async ({ req, url, params }) => {
    const name = project(req, params.name);
    guardTasks(name, url);
    ctx.relay?.cancelProject(name);
    const before = ctx.cockpitDb.agentSession(name).session_id;
    const s = await ctx.manager.restart(name);
    return started(name, s, { resumed: before != null && ctx.cockpitDb.agentSession(name).session_id === before });
  }, { auth: 'admin' });

  route('POST', '/api/projects/:name/tasks/:taskId/stop', async ({ req, params }) => {
    const name = project(req, params.name);
    await ctx.manager.stopTask(name, params.taskId);
    return { ok: true, project: name, task_id: params.taskId };
  }, { auth: 'admin' });
}
