// 모의 SDK — 진짜 SDK 가 아니라 SDK 와 같은 모양의 queryFn (VERIFICATION 2.1).
//
// makeFakeQueryFn({ turns, resumable }) 이 queryFn 을 낸다. 사용자 메시지가 하나 들어올 때마다 대본의 한 턴을 돈다.
// 턴은 걸음의 배열이다:
//   { msg: {…SDK 메시지…} }            그대로 낸다 (session_id 는 채운다)
//   { result: true, cost }               result 메시지를 낸다
//   { canUse: { toolName, input, toolUseID, agentID, … } }   options.canUseTool 을 부르고 답을 기다린다
//   { callTool: 'reply' | 'fetchHistory', args }             cockpit 도구 처리기를 곧바로 부른다
//   { wait: Promise }                    시험이 풀어 줄 때까지 멈춘다
//   { throw: '까닭' }                    CLI 가 죽은 것처럼 던진다
// turns 가 함수면 (userMessage, index, fake) => 걸음 배열. 대본이 모자라면 result 하나로 끝낸다.
// makeMcpServer 는 시험이 `handlers => ({ handlers })` 로 준다 — 그래서 options.mcpServers.cockpit.handlers 가 처리기다.

export function makeFakeQueryFn({ turns = [], resumable = true, init = {} } = {}) {
  const calls = [];
  const queryFn = ({ prompt, options }) => {
    const fake = new FakeQuery({ prompt, options, turns, resumable, init, n: calls.length + 1 });
    calls.push(fake);
    return fake;
  };
  queryFn.calls = calls;
  return queryFn;
}

class FakeQuery {
  constructor({ prompt, options, turns, resumable, init, n }) {
    Object.assign(this, { prompt, options, turns, resumable, init });
    this.sessionId = options.resume ?? `sess-${n}`;
    this.received = [];
    this.answers = [];
    this.interrupts = 0;
    this.closed = false;
    this.stopped = [];
    this.abort = new AbortController();
  }

  async initializationResult() {
    if (this.options.resume && !this.resumable) throw new Error(`No conversation found with session ID: ${this.options.resume}`);
    return { account: { apiKeySource: 'none', subscriptionType: 'Claude Max' }, commands: [{ name: 'find' }], agents: [{ name: 'reviewer' }], models: [], ...this.init };
  }

  async interrupt() { this.interrupts++; }
  async stopTask(id) { this.stopped.push(id); }
  close() { this.closed = true; this.abort.abort(); }

  // 진짜 SDK 처럼 입력은 턴과 따로 곧바로 받는다 — 턴 도중에 들어온 사용자 메시지도 received 에 바로 쌓인다.
  // 턴 도중에 들어온 글은 그 턴에 접는다: 그 글의 걸음(result 빼고)을 이어 돌고 result 는 한 번만 낸다.
  async *[Symbol.asyncIterator]() {
    yield { type: 'system', subtype: 'init', session_id: this.sessionId, model: 'fake', permissionMode: this.options.permissionMode };
    const inbox = [];
    let ended = false;
    let wake = () => {};
    (async () => {
      try {
        for await (const um of this.prompt) { this.received.push(um); inbox.push(um); wake(); }
      } finally { ended = true; wake(); }
    })();
    let i = 0;
    const stepsFor = um => (typeof this.turns === 'function' ? this.turns(um, i++, this) : (this.turns[i++] ?? [{ result: true }]));

    for (;;) {
      while (!inbox.length && !ended && !this.closed) await new Promise(r => { wake = r; });
      if (this.closed || !inbox.length) return;
      const queue = [...stepsFor(inbox.shift())];
      while (queue.length) {
        const st = queue.shift();
        if (this.closed) return;
        if (st.result && inbox.length) {
          for (const more of inbox.splice(0)) queue.push(...stepsFor(more).filter(x => !x.result));
          queue.push(st);
          continue;
        }
        if (st.wait) await st.wait;
        if (st.throw) throw new Error(st.throw);
        if (st.canUse) {
          const { toolName, input = {}, ...rest } = st.canUse;
          this.answers.push(await this.options.canUseTool(toolName, input, { signal: this.abort.signal, requestId: `req-${this.answers.length}`, ...rest }));
          continue;
        }
        if (st.callTool) { await this.options.mcpServers.cockpit.handlers[st.callTool](st.args ?? {}); continue; }
        if (st.msg) yield { session_id: this.sessionId, ...st.msg };
        if (st.result) yield { type: 'result', subtype: 'success', session_id: this.sessionId, total_cost_usd: st.cost ?? 0.01, num_turns: 1, duration_ms: 5 };
      }
    }
  }
}

// 시험이 턴을 붙잡았다 풀려고 쓴다
export function deferred() {
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

// 조건이 참이 될 때까지 이벤트 루프를 돌린다
export async function waitFor(cond, { timeoutMs = 2000, what = '조건' } = {}) {
  const end = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`기다림 초과: ${what}`);
    await new Promise(r => setTimeout(r, 2));
  }
}
