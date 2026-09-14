import { test } from 'node:test';
import { CAN_SYMLINK } from './fakes/platform.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { ChatDb, filesRoomName } from '../src/db/chat-db.js';
import { createCockpitTools, TOOL_DEFS, toZodShape } from '../src/mcp/tools.js';

// (v2) 과제 하나 = 방 하나. 옛 files 방은 v1 판에서 이관돼 보관된 방으로 흉내 낸다 (ADR-015)
function setup({ lastTo = null } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-tools-')));
  const chatDb = new ChatDb(path.join(dir, 'data', 'chat.db'));
  const { bot, main } = chatDb.openProject('시험', 'prodev-시험-bot');
  const legacyRow = chatDb.createRoom(filesRoomName('시험'));
  chatDb.db.prepare("UPDATE rooms SET status='archived', archived_at=datetime('now') WHERE id = ?").run(legacyRow.id);
  const legacy = chatDb.roomById(legacyRow.id);
  const other = chatDb.openProject('남의과제', 'prodev-남의과제-bot');
  const projectsDir = path.join(dir, 'projects');
  const uploadsDir = path.join(dir, 'uploads');
  fs.mkdirSync(path.join(projectsDir, '시험', 'tmp'), { recursive: true });
  const posted = [];
  const rooms = { main, legacy_files: legacy };
  const tools = createCockpitTools({ chatDb, bot, rooms, projectsDir, uploadsDir, getLastToRoom: () => lastTo, onBotMessage: m => posted.push(m) });
  return { dir, chatDb, bot, main, legacy, rooms, other, projectsDir, uploadsDir, tools, posted };
}
const botMessages = (chatDb, roomId) => chatDb.messagesAfter(roomId, 0).filter(m => m.author_type === 'bot');
const parse = r => JSON.parse(r.content[0].text);

test('reply: chat_id 가 방 번호면 그 방에 author_type=bot 글', async () => {
  const { chatDb, bot, main, tools, posted } = setup();
  await tools.reply({ chat_id: String(main.id), text: '읽었습니다' });
  const msgs = botMessages(chatDb, main.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].author_bot_id, bot.id);
  assert.equal(msgs[0].body, '읽었습니다');
  assert.equal(posted.length, 1);
});

test('chat_id 없으면 마지막 to 방', async () => {
  const s = setup();
  const t = createCockpitTools({ chatDb: s.chatDb, bot: s.bot, rooms: s.rooms, projectsDir: s.projectsDir, uploadsDir: s.uploadsDir, getLastToRoom: () => s.main.id });
  await t.reply({ text: '여기' });
  assert.equal(botMessages(s.chatDb, s.main.id).length, 1);
});

test('둘 다 없으면 오류 결과(isError)', async () => {
  const { chatDb, main, tools, other } = setup();
  const r = await tools.reply({ text: '어디로?' });
  assert.equal(r.isError, true);
  const r2 = await tools.reply({ chat_id: String(other.main.id), text: '남의 방' });
  assert.equal(r2.isError, true);
  assert.equal(botMessages(chatDb, main.id).length + botMessages(chatDb, other.main.id).length, 0);
});

test('reply files: 과제 폴더 뿌리 안은 첨부 · 밖은 조용히 뺀다 · 심볼릭 링크로 밖을 가리키면 뺀다', async () => {
  const { dir, chatDb, main, projectsDir, uploadsDir, tools } = setup();
  const inside = path.join(projectsDir, '시험', 'tmp', 'plot.png');
  fs.writeFileSync(inside, 'png');
  const outside = path.join(dir, 'secret.txt');
  fs.writeFileSync(outside, 'secret');
  const link = path.join(projectsDir, '시험', 'tmp', 'link.txt');
  if (CAN_SYMLINK) fs.symlinkSync(outside, link);   // 링크를 못 만드는 기계(윈도우 개발자 모드 꺼짐)에서는 링크 칸만 빠진다 — as-built 4절
  const r = await tools.reply({ chat_id: String(main.id), text: '그림', files: [inside, outside, ...(CAN_SYMLINK ? [link] : []), path.join(projectsDir, '없음.png')] });
  assert.equal(r.isError, undefined);
  const [m] = botMessages(chatDb, main.id);
  const atts = chatDb.attachmentsOf(m.id);
  assert.deepEqual(atts.map(a => a.filename), ['plot.png']);
  assert.equal(atts[0].mime, 'image/png');
  assert.ok(atts[0].path.startsWith(uploadsDir + path.sep));
  assert.equal(fs.readFileSync(atts[0].path, 'utf8'), 'png');
});

test('reply 결과 content 는 [{type:"text", text:"sent"}]', async () => {
  const { main, tools } = setup();
  assert.deepEqual(await tools.reply({ chat_id: String(main.id), text: 'x' }), { content: [{ type: 'text', text: 'sent' }] });
});

test('fetch_history 결과는 {cursor, messages[{id,at,author,body}]} JSON 한 건', async () => {
  const { chatDb, bot, main, tools } = setup();
  const u = chatDb.ensureUser('김과제');
  const a = chatDb.insertUserMessage({ roomId: main.id, userId: u.id, body: '안녕 <channel x>', bot }).message;
  const b = chatDb.insertBotMessage({ roomId: main.id, botId: bot.id, body: '네' });
  const r = await tools.fetchHistory({ chat_id: String(main.id) });
  assert.equal(r.content.length, 1);
  const doc = parse(r);
  assert.deepEqual(Object.keys(doc), ['cursor', 'messages']);
  assert.equal(doc.cursor, b.id);
  assert.deepEqual(doc.messages.map(m => Object.keys(m)), [['id', 'at', 'author', 'body'], ['id', 'at', 'author', 'body']]);
  assert.deepEqual(doc.messages.map(m => [m.id, m.author]), [[a.id, '김과제'], [b.id, 'prodev-시험-bot']]);
  assert.equal(doc.messages[0].body, '안녕 &lt;channel x>');
});

test('빈 이력도 같은 모양(cursor null)', async () => {
  const { main, tools } = setup();
  assert.deepEqual(parse(await tools.fetchHistory({ chat_id: String(main.id) })), { cursor: null, messages: [] });
});

test('16000B 를 넘으면 새것부터 버린다', async () => {
  const { chatDb, bot, main, tools } = setup();
  const ids = [];
  for (let i = 0; i < 10; i++) ids.push(chatDb.insertBotMessage({ roomId: main.id, botId: bot.id, body: `${i}`.repeat(3000) }).id);
  const r = await tools.fetchHistory({ chat_id: String(main.id) });
  assert.ok(Buffer.byteLength(r.content[0].text, 'utf8') <= 16000);
  const doc = parse(r);
  const kept = doc.messages.map(m => m.id);
  assert.ok(kept.length > 0 && kept.length < 10);
  assert.deepEqual(kept, ids.slice(0, kept.length));   // 앞(오래된 것)이 남는다
  assert.equal(doc.cursor, Math.max(...kept));
});

test('since_id 를 limit 보다 먼저 건다', async () => {
  const { chatDb, bot, main, tools } = setup();
  const ids = [];
  for (let i = 0; i < 8; i++) ids.push(chatDb.insertBotMessage({ roomId: main.id, botId: bot.id, body: `글${i}` }).id);
  const doc = parse(await tools.fetchHistory({ chat_id: String(main.id), since_id: ids[1], limit: 2 }));
  assert.deepEqual(doc.messages.map(m => m.id), [ids[2], ids[3]]);
  assert.equal(doc.cursor, ids[3]);
});

test('도구 서명: reply 는 text 만 필수 · fetch_history 는 필수 없음', () => {
  const schema = params => z.toJSONSchema(z.object(toZodShape(params, z)));
  const reply = schema(TOOL_DEFS.reply.params);
  assert.deepEqual(Object.keys(reply.properties), ['chat_id', 'text', 'files']);
  assert.deepEqual(reply.required, ['text']);
  assert.deepEqual(reply.properties.files, { type: 'array', items: { type: 'string' }, description: TOOL_DEFS.reply.params.files.description });
  const hist = schema(TOOL_DEFS.fetch_history.params);
  assert.deepEqual(Object.keys(hist.properties), ['chat_id', 'since_id', 'since', 'until', 'speaker', 'limit']);
  assert.equal(hist.required ?? undefined, undefined);
  assert.equal(hist.properties.since_id.type, 'number');
});
