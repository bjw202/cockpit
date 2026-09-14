// 조립 한 자리 — 설정에서 저장소 둘과 세션 관리자를 세운다. CLI(bin/cockpit.js) · 스모크 · (M2) 서버가 같이 쓴다.

import path from 'node:path';
import { ChatDb } from './db/chat-db.js';
import { CockpitDb } from './db/cockpit-db.js';
import { SessionManager } from './session/manager.js';
import { CHANNEL_ORIGIN } from './envelope/wrap.js';

export const chatDbFile = config => path.join(config.dataDir, 'chat.db');
export const cockpitDbFile = config => path.join(config.dataDir, 'cockpit.db');

// binding: { queryFn, makeMcpServer } — 진짜는 session/sdk-query.js 의 sdkBinding
export function openRuntime(config, { binding = {}, permissionHandler, model, origin = CHANNEL_ORIGIN, processEnv = process.env } = {}) {
  const chatDb = new ChatDb(chatDbFile(config));
  const cockpitDb = new CockpitDb(cockpitDbFile(config));
  const manager = new SessionManager({
    chatDb, cockpitDb, config, queryFn: binding.queryFn, makeMcpServer: binding.makeMcpServer,
    ...(permissionHandler ? { permissionHandler } : {}), model, origin, processEnv,
  });
  // keepState: 서버가 꺼질 때 — 세션을 닫되 적힌 상태를 그대로 두어 다음 기동이 resume 한다 (ARCHITECTURE 5.1)
  const close = async ({ keepState = false } = {}) => {
    for (const project of [...manager.sessions.keys()]) {
      try { await (keepState ? manager.release(project) : manager.stop(project)); } catch { /* 이미 꺼졌다 */ }
    }
    chatDb.close();
    cockpitDb.close();
  };
  return { chatDb, cockpitDb, manager, close };
}

// 그 과제의 방에 afterId 뒤로 봇 글이 올 때까지. 세션이 error 가 되거나 시간이 넘으면 null
export async function waitForBotMessage(manager, project, afterId, { timeoutMs = 300000, pollMs = 500 } = {}) {
  const { main, files } = manager.chatDb.projectRooms(project);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    for (const room of [main, files]) {
      const hit = manager.chatDb.messagesAfter(room.id, afterId).find(m => m.author_type === 'bot');
      if (hit) return hit;
    }
    if (manager.state(project) === 'error') return null;
    await new Promise(r => setTimeout(r, pollMs));
  }
  return null;
}

export async function waitUntil(cond, { timeoutMs = 300000, pollMs = 250 } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise(r => setTimeout(r, pollMs));
  }
  return false;
}
