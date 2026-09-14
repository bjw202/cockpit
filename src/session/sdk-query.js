// SDK 를 import 하는 유일한 파일 (ARCHITECTURE 2절). 나머지는 이 파일이 내는 queryFn · makeMcpServer 를 주입받는다.
// test/no-sdk-import.test.js 가 이 규칙을 본다.

import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { SERVER_NAME, TOOL_DEFS, toZodShape } from '../mcp/tools.js';

// handlers: createCockpitTools() 가 낸 { reply, fetchHistory }
export function makeMcpServer(handlers) {
  return createSdkMcpServer({
    name: SERVER_NAME,
    version: '0.1.0',
    tools: [
      tool('reply', TOOL_DEFS.reply.description, toZodShape(TOOL_DEFS.reply.params, z), args => handlers.reply(args)),
      tool('fetch_history', TOOL_DEFS.fetch_history.description, toZodShape(TOOL_DEFS.fetch_history.params, z), args => handlers.fetchHistory(args)),
    ],
  });
}

export const queryFn = ({ prompt, options }) => query({ prompt, options });

export const sdkBinding = Object.freeze({ queryFn, makeMcpServer });
