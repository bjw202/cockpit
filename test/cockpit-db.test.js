import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CockpitDb, hashToken } from '../src/db/cockpit-db.js';

const fresh = () => new CockpitDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-cdb-')), 'cockpit.db'));

test('표 여섯이 이름 그대로 있다(accounts · web_sessions · agent_sessions · session_events · permission_requests · bot_inbox)', () => {
  const db = fresh();
  const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  assert.deepEqual(tables, ['accounts', 'agent_sessions', 'bot_inbox', 'permission_requests', 'session_events', 'web_sessions']);
  const cols = t => db.db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  assert.deepEqual(cols('agent_sessions'), ['project', 'bot_id', 'bot_dir', 'session_id', 'state', 'started_at', 'last_result_at', 'cost_usd']);
  assert.deepEqual(cols('bot_inbox'), ['id', 'message_id', 'bot_id', 'delivery', 'queued_at', 'delivered_at']);
  assert.deepEqual(cols('permission_requests'),
    ['tool_use_id', 'agent_id', 'project', 'tool', 'input_json', 'card_json', 'asked_at', 'answered_by', 'behavior', 'answered_at']);
});

test('bot_inbox 에서 delivered_at IS NULL 을 id 순으로 꺼낸다', () => {
  const db = fresh();
  db.enqueue(11, 1, 'to'); db.enqueue(12, 2, 'to'); db.enqueue(13, 1, 'cc'); db.enqueue(14, 1, 'to');
  const first = db.pendingInbox(1);
  assert.deepEqual(first.map(r => r.message_id), [11, 13, 14]);
  db.markDelivered([first[0].id]);
  assert.deepEqual(db.pendingInbox(1).map(r => [r.message_id, r.delivery]), [[13, 'cc'], [14, 'to']]);
  assert.deepEqual(db.pendingInbox(1, 1).map(r => r.message_id), [13]);
});

test('permission_requests 첫 답만 먹는다(둘째 UPDATE 는 0행)', () => {
  const db = fresh();
  db.insertPermission({ toolUseId: 'toolu_1', agentId: 'a416', project: '시험', tool: 'Bash', input: { command: 'curl --version' }, card: { title: 't' } });
  assert.equal(db.answerPermission('toolu_1', { behavior: 'allow', answeredBy: '김피엘' }), true);
  assert.equal(db.answerPermission('toolu_1', { behavior: 'deny', answeredBy: '박피엘' }), false);
  const row = db.permission('toolu_1');
  assert.equal(row.behavior, 'allow');
  assert.equal(row.answered_by, '김피엘');
  assert.equal(row.agent_id, 'a416');
  assert.equal(db.pendingPermissions('시험').length, 0);
});

test('web_sessions 에 쿠키 원문이 없다', () => {
  const db = fresh();
  const token = db.createWebSession(7);
  const stored = db.db.prepare('SELECT token_hash FROM web_sessions').all().map(r => r.token_hash);
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0], token);
  assert.equal(stored[0], hashToken(token));
  assert.equal(db.webSessionUserId(token), 7);
  assert.equal(db.webSessionUserId(token, { now: Date.now() + 8 * 24 * 3600 * 1000 }), null);   // 만료
});

test('agent_sessions 의 state 는 여섯 값만 받는다', () => {
  const db = fresh();
  db.createAgentSession({ project: '시험', botId: 1, botDir: '/b/prodev-시험-bot' });
  assert.equal(db.agentSession('시험').state, 'stopped');
  db.setState('시험', 'waiting_approval');
  assert.throws(() => db.setState('시험', 'sleeping'));
  db.recordResult('시험', 0.05); db.recordResult('시험', 0.03);
  assert.ok(Math.abs(db.agentSession('시험').cost_usd - 0.08) < 1e-9);
});
