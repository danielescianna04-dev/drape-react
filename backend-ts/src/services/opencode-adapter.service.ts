/**
 * OpenCode Adapter Service
 *
 * Translates OpenCode JSONL output → Drape SSE events.
 * Uses `opencode run --attach --format json` via Docker exec for streaming.
 * The frontend receives the SAME event format as before — zero changes needed.
 */
import Docker from 'dockerode';
import { log } from '../utils/logger';
import { Duplex } from 'stream';

// OpenCode JSON event types (verified by testing on server)
interface OpenCodeEvent {
  type: 'step_start' | 'text' | 'tool_use' | 'step_finish' | 'error';
  timestamp: number;
  sessionID: string;
  part?: {
    type: string;
    text?: string;
    tool?: string;
    callID?: string;
    state?: {
      status: string;
      input: any;
      output: string;
      title: string;
      metadata?: any;
      time?: { start: number; end: number };
    };
    reason?: string;
    cost?: number;
    tokens?: {
      total: number;
      input: number;
      output: number;
      reasoning: number;
      cache?: { read: number; write: number };
    };
  };
  error?: {
    name: string;
    data: { message: string; [key: string]: any };
  };
}

// Drape SSE event (existing format — frontend expects this)
export interface DrapeSSEEvent {
  type: string;
  data?: any;
}

// Model name mapping: Drape UI names → OpenCode provider/model format
const MODEL_MAP: Record<string, string> = {
  'gemini-3-flash': 'google/gemini-3-flash-preview',
  'gemini-3-0-flash': 'google/gemini-3-flash-preview',
  'gemini-3.0-flash': 'google/gemini-3-flash-preview',
  'gemini-3.1-pro': 'google/gemini-3.1-pro-preview',
  'gemini-3-1-pro': 'google/gemini-3.1-pro-preview',
  'gemini-3-0-pro': 'google/gemini-3.1-pro-preview',
  'gemini-3-pro': 'google/gemini-3.1-pro-preview',
  'claude-4-6-sonnet': 'anthropic/claude-sonnet-4-6',
  'claude-4-7-opus': 'anthropic/claude-opus-4-7',
  'claude-opus-4-7': 'anthropic/claude-opus-4-7',
  'claude-4-6-opus': 'anthropic/claude-opus-4-7',
  'gpt-5-4': 'openai/gpt-5.4',
};

export function mapDrapeModelToOpenCode(drapeModel: string): string {
  return MODEL_MAP[drapeModel] || drapeModel;
}

/**
 * Stream an OpenCode response from a Docker container.
 * Executes `opencode run --format json` inside the container,
 * parses each JSONL line, translates to Drape SSE events.
 */
export async function streamOpenCodeFromContainer(
  container: Docker.Container,
  message: string,
  model: string,
  sessionId?: string,
  onEvent: (event: DrapeSSEEvent) => void = () => {},
  onDone: () => void = () => {},
): Promise<void> {
  const openCodeModel = mapDrapeModelToOpenCode(model);

  // Build command
  const cmd = ['opencode', 'run', '--format', 'json', '--model', openCodeModel];
  // Disable thinking/reasoning for Gemini — causes 0 output tokens with default thinking
  if (openCodeModel.startsWith('google/')) {
    cmd.push('--variant', 'none');
  }
  if (sessionId) {
    cmd.push('--session', sessionId, '--continue');
  }
  // NOTE: --attach http://localhost:4096 was removed because opencode serve
  // does NOT forward 'text' events in --format json mode (bug in OpenCode).
  // Without --attach, opencode run calls the API directly and streams correctly.

  // Inject Drape identity — OpenCode's internal system prompt says "I am opencode"
  // so we must override it in the user message for first messages in a session.
  const identityPrefix = '[IMPORTANT SYSTEM RULE: You are Drape AI, the coding assistant built into the Drape app. NEVER say you are OpenCode, Claude, GPT, Gemini or any other AI name. Always identify as Drape AI.]\n\n';
  cmd.push(identityPrefix + message);

  log.info(`[OpenCode] Exec in container: model=${openCodeModel}, session=${sessionId || 'new'}, msg=${message.substring(0, 80)}...`);

  onEvent({ type: 'processing', data: { status: 'starting' } });

  try {
    const exec = await container.exec({
      Cmd: ['sh', '-c', cmd.map(c => c.includes(' ') ? `'${c.replace(/'/g, "'\\''")}'` : c).join(' ')],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      WorkingDir: '/home/coder/project',
      User: '1000:1000',
      Env: [`HOME=/home/coder`],
    });

    const stream = await exec.start({ hijack: true, stdin: false, Tty: false }) as unknown as Duplex;

    let textBuffer = '';
    let frameBuffer = Buffer.alloc(0);
    let iterationCount = 0;
    let totalCost = 0;
    let totalTokens = { input: 0, output: 0 };
    let lastSessionId = '';

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) return;

      try {
        const event: OpenCodeEvent = JSON.parse(trimmed);
        if (event.sessionID) lastSessionId = event.sessionID;

        const drapeEvents = translateEvent(event, iterationCount);
        for (const de of drapeEvents) {
          onEvent(de);
        }

        if (event.type === 'step_start') iterationCount++;
        if (event.type === 'step_finish' && event.part) {
          totalCost += event.part.cost || 0;
          if (event.part.tokens) {
            totalTokens.input += event.part.tokens.input;
            totalTokens.output += event.part.tokens.output;
          }
        }
      } catch {
        // Not valid JSON, skip
      }
    };

    stream.on('data', (rawChunk: Buffer) => {
      // Docker exec multiplexes stdout/stderr with 8-byte headers per frame:
      // [stream_type(1)][padding(3)][size(4 big-endian)][payload(size bytes)]
      // A single 'data' event may contain multiple frames or partial frames,
      // so we must buffer at the byte level and parse frame-by-frame.
      frameBuffer = Buffer.concat([frameBuffer, rawChunk]);

      while (frameBuffer.length >= 8) {
        const streamType = frameBuffer[0];

        // If first byte isn't a valid Docker stream type, treat as raw text
        if (streamType > 2) {
          textBuffer += frameBuffer.toString('utf-8');
          frameBuffer = Buffer.alloc(0);
          break;
        }

        const frameSize = frameBuffer.readUInt32BE(4);

        // Sanity check — frames > 10 MB are likely not real Docker frames
        if (frameSize > 10 * 1024 * 1024) {
          textBuffer += frameBuffer.toString('utf-8');
          frameBuffer = Buffer.alloc(0);
          break;
        }

        // Wait for complete frame
        if (frameBuffer.length < 8 + frameSize) break;

        // Extract payload — only stdout (type 1), skip stderr (type 2)
        if (streamType === 1) {
          textBuffer += frameBuffer.slice(8, 8 + frameSize).toString('utf-8');
        } else if (streamType === 2) {
          const stderr = frameBuffer.slice(8, 8 + frameSize).toString('utf-8').trim();
          if (stderr) log.debug(`[OpenCode] stderr: ${stderr}`);
        }

        frameBuffer = frameBuffer.slice(8 + frameSize);
      }

      // Process complete JSONL lines from accumulated text
      const lines = textBuffer.split('\n');
      textBuffer = lines.pop() || '';

      for (const line of lines) {
        processLine(line);
      }
    });

    await new Promise<void>((resolve) => {
      stream.on('end', () => {
        // Process any remaining text in buffer
        if (textBuffer.trim()) {
          processLine(textBuffer);
        }

        // If no output was generated, emit a fallback message
        if (totalTokens.output === 0 && iterationCount <= 1) {
          onEvent({ type: 'text_delta', data: { text: 'The AI model did not generate a response. Try a more specific prompt, like "Read app/page.tsx and explain what it does".' } });
          log.warn(`[OpenCode] 0 output tokens — model may need a more specific prompt`);
        }

        // Emit final events
        onEvent({
          type: 'usage',
          data: {
            costEur: totalCost,
            tokensUsed: totalTokens,
            contextWindowPercent: 0,
            sessionId: lastSessionId,
          },
        });
        onEvent({ type: 'complete', data: {} });
        onEvent({ type: 'done', data: {} });
        onDone();
        resolve();
      });

      stream.on('error', (err: Error) => {
        log.error(`[OpenCode] Stream error: ${err.message}`);
        onEvent({ type: 'error', data: { message: err.message } });
        onEvent({ type: 'done', data: {} });
        onDone();
        resolve();
      });
    });

  } catch (err: any) {
    log.error(`[OpenCode] Exec error: ${err.message}`);
    onEvent({ type: 'error', data: { message: `OpenCode failed: ${err.message}` } });
    onEvent({ type: 'done', data: {} });
    onDone();
  }
}

// Map OpenCode tool names → Drape tool names (frontend expects these)
const TOOL_NAME_MAP: Record<string, string> = {
  'read': 'read_file',
  'view': 'read_file',
  'write': 'write_file',
  'edit': 'edit_file',
  'bash': 'run_command',
  'glob': 'glob_search',
  'grep': 'grep_search',
  'webfetch': 'web_fetch',
  'fetch': 'web_fetch',
  'multi_edit': 'multi_edit_file',
  'multiedit': 'multi_edit_file',
  'patch': 'patch_file',
  'ls': 'list_directory',
  'websearch': 'web_search',
  'agent': 'sub_agent',
  'todowrite': 'todo_write',
  'todoread': 'todo_read',
  'question': 'user_question',
  'diagnostics': 'diagnostics',
  'sourcegraph': 'code_search',
  'skill': 'skill',
  'lsp': 'lsp',
};

/**
 * Clean OpenCode tool output — remove XML tags, extract useful content.
 */
function cleanToolOutput(tool: string, output: string): string {
  if (!output) return '';

  // For read tool: extract just the file content without XML wrapper
  if (tool === 'read' || tool === 'read_file') {
    const contentMatch = output.match(/<content>([\s\S]*?)<\/content>/);
    if (contentMatch) return contentMatch[1].trim();
    // For directory listings, extract entries
    const entriesMatch = output.match(/<entries>([\s\S]*?)<\/entries>/);
    if (entriesMatch) return entriesMatch[1].trim();
  }

  // For bash: truncate very large outputs
  if (tool === 'bash' || tool === 'run_command') {
    if (output.length > 3000) {
      return output.substring(0, 3000) + '\n\n...[truncated]';
    }
    return output;
  }

  // For fetch/webfetch: truncate large outputs (HTML pages can be 100KB+)
  if (tool === 'fetch' || tool === 'webfetch' || tool === 'web_fetch') {
    const cleaned = output.replace(/<[^>]+>/g, '').trim();
    if (cleaned.length > 2000) {
      return cleaned.substring(0, 2000) + '\n\n...[truncated]';
    }
    return cleaned;
  }

  // Generic: strip XML tags
  return output.replace(/<[^>]+>/g, '').trim();
}

/**
 * Map OpenCode input format to Drape input format.
 */
function mapToolInput(tool: string, input: any): any {
  if (!input) return {};

  switch (tool) {
    case 'read':
      return { file_path: input.filePath || input.path || '', ...input };
    case 'write':
      return { file_path: input.filePath || input.path || '', content: input.content || '', ...input };
    case 'edit':
      return { file_path: input.filePath || input.path || '', ...input };
    case 'bash':
      return { command: input.command || '', description: input.description || '', ...input };
    case 'glob':
      return { pattern: input.pattern || '', ...input };
    case 'grep':
      return { pattern: input.pattern || '', ...input };
    default:
      return input;
  }
}

/**
 * Translate a single OpenCode event to one or more Drape SSE events.
 */
function translateEvent(event: OpenCodeEvent, iteration: number): DrapeSSEEvent[] {
  const events: DrapeSSEEvent[] = [];

  switch (event.type) {
    case 'step_start':
      events.push({ type: 'iteration_start', data: { iteration } });
      break;

    case 'text':
      if (event.part?.text) {
        events.push({ type: 'text_delta', data: { text: event.part.text } });
      }
      break;

    case 'tool_use': {
      const part = event.part;
      if (!part) break;
      const openCodeTool = part.tool || 'unknown';
      const drapeTool = TOOL_NAME_MAP[openCodeTool] || openCodeTool;
      const callID = part.callID || `tool-${Date.now()}`;
      const state = part.state;
      const mappedInput = mapToolInput(openCodeTool, state?.input);

      // Emit tool_start
      events.push({
        type: 'tool_start',
        data: {
          toolId: callID,
          tool: drapeTool,
          input: mappedInput,
        },
      });

      // Emit tool_input
      events.push({
        type: 'tool_input',
        data: {
          toolId: callID,
          tool: drapeTool,
          input: mappedInput,
        },
      });

      // Emit result based on status
      if (state?.status === 'completed') {
        const cleanedOutput = cleanToolOutput(openCodeTool, state.output || '');
        events.push({
          type: 'tool_complete',
          data: {
            toolId: callID,
            tool: drapeTool,
            result: cleanedOutput,
            input: mappedInput,
            title: state.title || '',
          },
        });
      } else if (state?.status === 'error') {
        events.push({
          type: 'tool_error',
          data: {
            toolId: callID,
            tool: drapeTool,
            error: state.output || 'Tool execution failed',
          },
        });
      }
      break;
    }

    case 'step_finish':
      // Per-step usage — we aggregate and emit at stream end
      break;

    case 'error':
      events.push({
        type: 'error',
        data: {
          message: event.error?.data?.message || 'Unknown OpenCode error',
          name: event.error?.name || 'Error',
        },
      });
      break;
  }

  return events;
}
