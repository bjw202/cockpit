// query() 옵션을 만드는 한 자리 (ARCHITECTURE 5.4). SDK 를 import 하지 않는다 — 시험이 이 함수를 곧바로 본다.
// 실제로 SDK 에 넘기는 것은 session/sdk-query.js 다.

import { SERVER_NAME, TOOL_NAMES } from '../mcp/tools.js';
import { INSTRUCTIONS } from '../envelope/wrap.js';

// allowedTools 에는 프로세스 안 MCP 도구 둘만 (ADR-006). allowedTools 는 CLI 의 안전 규칙까지 건너뛰므로
// 이 목록이 넓어지면 승인 게이트가 조용히 사라진다 (meta 실증 4b).
export const ALLOWED_TOOLS = Object.freeze([TOOL_NAMES.reply, TOOL_NAMES.fetch_history]);

export function buildQueryOptions({ botDir, mcpServer, canUseTool, env, claudePath, resume, model, stderr }) {
  const options = {
    cwd: botDir,
    settingSources: ['project', 'local'],
    strictMcpConfig: true,
    mcpServers: { [SERVER_NAME]: mcpServer },
    permissionMode: 'default',
    allowedTools: [...ALLOWED_TOOLS],
    canUseTool,
    persistSession: true,
    env,
    includePartialMessages: true,
    enableFileCheckpointing: true,
    // 스파이크 조합에 없던 칸이다 (ADR-013). 기본값이 바뀌어도 Claude Code 의 시스템 프롬프트가 살게 적어 둔다
    systemPrompt: { type: 'preset', preset: 'claude_code', append: INSTRUCTIONS, snapshot: true },
  };
  if (claudePath) options.pathToClaudeCodeExecutable = claudePath;
  if (resume) options.resume = resume;
  if (model) options.model = model;   // 스모크 · 개발용. 서버는 주지 않는다 — 봇 설정과 계정 기본을 따른다
  if (stderr) options.stderr = stderr;
  return options;
}
