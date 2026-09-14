// SDK 스트리밍 입력(prompt: AsyncIterable<SDKUserMessage>)의 한 흐름. 세션 관리자만 push 한다 —
// 세션 입력을 한 곳에서만 넣어 여러 사람이 동시에 넣는 경쟁을 구조로 없앤다 (ADR-002).
export class InputStream {
  #queue = [];
  #waiters = [];
  #ended = false;

  push(message) {
    if (this.#ended) throw new Error('입력 흐름이 이미 끝났다');
    const w = this.#waiters.shift();
    if (w) w({ value: message, done: false });
    else this.#queue.push(message);
  }

  end() {
    this.#ended = true;
    for (const w of this.#waiters.splice(0)) w({ value: undefined, done: true });
  }

  get ended() { return this.#ended; }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.#queue.length) return Promise.resolve({ value: this.#queue.shift(), done: false });
        if (this.#ended) return Promise.resolve({ value: undefined, done: true });
        return new Promise(r => this.#waiters.push(r));
      },
      return: () => { this.end(); return Promise.resolve({ value: undefined, done: true }); },
    };
  }
}
