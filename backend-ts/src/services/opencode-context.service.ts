import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { log } from '../utils/logger';
import { readMemory } from './memory.service';
import { vercelChatSimple } from './ai-providers';

interface PreviewContext {
  elementSummary?: string;
  language?: string;
}

interface OpenCodeTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ToolEventDigest {
  tool: string;
  content: string;
}

interface OpenCodeSessionState {
  version: number;
  projectId: string;
  userId: string;
  activeSessionId: string;
  rollingSummary: string;
  recentTurns: OpenCodeTurn[];
  approxPromptTokens: number;
  updatedAt: number;
}

export interface OpenCodePrepareResult {
  sessionId: string;
  prompt: string;
  usedSummary: boolean;
  rotatedSession: boolean;
  historicalContextTokens: number;
  injectedMemoryTokens: number;
}

const STATE_VERSION = 1;
const SESSION_TOKEN_ROTATE_THRESHOLD = 90000;
const SESSION_TURN_ROTATE_THRESHOLD = 24;
const MAX_RECENT_TURNS = 10;
const SUMMARY_INPUT_MAX_CHARS = 40000;
const SUMMARY_OUTPUT_MAX_CHARS = 8000;

class OpenCodeContextService {
  private readonly stateDir = path.join(config.cacheRoot, 'opencode-context');

  async prepareRun(params: {
    projectId: string;
    userId: string;
    prompt: string;
    previewContext?: PreviewContext;
  }): Promise<OpenCodePrepareResult> {
    const state = await this.readState(params.projectId, params.userId);
    const activeState = state || this.createEmptyState(params.projectId, params.userId);
    const basePrompt = this.buildPromptWithPreviewContext(params.prompt, params.previewContext);
    const shouldRotate =
      !state ||
      activeState.approxPromptTokens >= SESSION_TOKEN_ROTATE_THRESHOLD ||
      activeState.recentTurns.length >= SESSION_TURN_ROTATE_THRESHOLD;

    if (!shouldRotate) {
      return {
        sessionId: activeState.activeSessionId,
        prompt: basePrompt,
        usedSummary: false,
        rotatedSession: false,
        historicalContextTokens: activeState.approxPromptTokens,
        injectedMemoryTokens: 0,
      };
    }

    const sessionId = this.createSessionId(params.projectId);
    const projectMemory = await readMemory(params.projectId);
    const memoryBlock = this.buildMemoryBlock(projectMemory, activeState.rollingSummary);
    const prompt = memoryBlock
      ? `${memoryBlock}\n\n[Current user request]\n${basePrompt}`
      : basePrompt;
    const injectedMemoryTokens = memoryBlock ? this.estimateTokens(memoryBlock) : 0;

    await this.writeState(params.projectId, params.userId, {
      ...activeState,
      activeSessionId: sessionId,
      updatedAt: Date.now(),
    });

    return {
      sessionId,
      prompt,
      usedSummary: Boolean(memoryBlock),
      rotatedSession: true,
      historicalContextTokens: activeState.approxPromptTokens,
      injectedMemoryTokens,
    };
  }

  async finalizeRun(params: {
    projectId: string;
    userId: string;
    sessionId: string;
    prompt: string;
    assistantText: string;
    toolEvents?: ToolEventDigest[];
    inputTokens: number;
  }): Promise<void> {
    const assistantDigest = this.buildAssistantDigest(params.assistantText, params.toolEvents || []);
    const state = await this.readState(params.projectId, params.userId) || this.createEmptyState(params.projectId, params.userId);
    const nextTurns = [
      ...state.recentTurns,
      { role: 'user' as const, content: params.prompt, timestamp: Date.now() },
      { role: 'assistant' as const, content: assistantDigest || '(no response)', timestamp: Date.now() },
    ];

    let rollingSummary = state.rollingSummary;
    let recentTurns = nextTurns;
    let approxPromptTokens = state.approxPromptTokens + Math.max(0, params.inputTokens);

    if (recentTurns.length > MAX_RECENT_TURNS) {
      const olderTurns = recentTurns.slice(0, recentTurns.length - MAX_RECENT_TURNS);
      recentTurns = recentTurns.slice(recentTurns.length - MAX_RECENT_TURNS);
      rollingSummary = await this.mergeSummary(rollingSummary, olderTurns);
      approxPromptTokens = this.estimateTokens(rollingSummary) + this.estimateTokensForTurns(recentTurns);
    }

    await this.writeState(params.projectId, params.userId, {
      version: STATE_VERSION,
      projectId: params.projectId,
      userId: params.userId,
      activeSessionId: params.sessionId,
      rollingSummary,
      recentTurns,
      approxPromptTokens,
      updatedAt: Date.now(),
    });
  }

  private buildPromptWithPreviewContext(prompt: string, previewContext?: PreviewContext): string {
    if (!previewContext?.elementSummary) return prompt;

    const lang = previewContext.language === 'it' ? 'it' : 'en';
    const contextPrefix = lang === 'it'
      ? `L'utente sta guardando la preview del sito e ha selezionato questo elemento: ${previewContext.elementSummary}\nLa sua richiesta è: `
      : `The user is viewing the site preview and selected this element: ${previewContext.elementSummary}\nTheir request is: `;

    return contextPrefix + prompt;
  }

  private buildMemoryBlock(projectMemory: string | null, rollingSummary: string): string {
    const parts: string[] = [];

    if (projectMemory?.trim()) {
      parts.push(`[Project memory]\n${projectMemory.trim().slice(0, 4000)}`);
    }

    if (rollingSummary.trim()) {
      parts.push(`[Conversation memory]\n${rollingSummary.trim().slice(0, SUMMARY_OUTPUT_MAX_CHARS)}`);
    }

    return parts.join('\n\n');
  }

  private buildAssistantDigest(assistantText: string, toolEvents: ToolEventDigest[]): string {
    const parts: string[] = [];

    const normalizedAssistant = assistantText.trim();
    if (normalizedAssistant) {
      const trimmedAssistant = normalizedAssistant.length > 2500
        ? `${normalizedAssistant.slice(0, 2500)}\n...[assistant truncated]`
        : normalizedAssistant;
      parts.push(trimmedAssistant);
    }

    if (toolEvents.length > 0) {
      const digests = toolEvents
        .slice(-8)
        .map((toolEvent) => this.digestToolEvent(toolEvent.tool, toolEvent.content))
        .filter(Boolean);

      if (digests.length > 0) {
        parts.push('[Tool digests]');
        parts.push(digests.join('\n\n'));
      }
    }

    return parts.join('\n\n').trim();
  }

  private digestToolEvent(tool: string, content: string): string {
    const normalized = content.trim();
    if (!normalized) return `[${tool}] empty output`;

    const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
    const head = lines.slice(0, 6).join('\n');
    const hash = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 10);

    if (tool === 'read_file') {
      return `[${tool}] lines=${lines.length} sha1=${hash}\n${head}`;
    }

    if (tool === 'run_command') {
      const errorLines = lines.filter((line) => /error|failed|exception/i.test(line)).slice(0, 5);
      if (errorLines.length > 0) {
        return `[${tool}] errors=${errorLines.length} sha1=${hash}\n${errorLines.join('\n')}`;
      }
      return `[${tool}] lines=${lines.length} sha1=${hash}\n${head}`;
    }

    if (tool === 'web_fetch') {
      const plainText = normalized.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return `[${tool}] chars=${plainText.length} sha1=${hash}\n${plainText.slice(0, 500)}`;
    }

    if (tool === 'grep_search' || tool === 'glob_search' || tool === 'list_directory') {
      return `[${tool}] items=${lines.length} sha1=${hash}\n${head}`;
    }

    return `[${tool}] chars=${normalized.length} lines=${lines.length} sha1=${hash}\n${head}`;
  }

  private async mergeSummary(existingSummary: string, olderTurns: OpenCodeTurn[]): Promise<string> {
    const transcript = olderTurns
      .map((turn) => `[${turn.role.toUpperCase()}] ${turn.content}`)
      .join('\n\n');

    const mergedInput = [
      existingSummary ? `Existing summary:\n${existingSummary}` : '',
      'Conversation segment to merge:',
      transcript,
    ].filter(Boolean).join('\n\n');

    const trimmedInput = mergedInput.length > SUMMARY_INPUT_MAX_CHARS
      ? mergedInput.slice(mergedInput.length - SUMMARY_INPUT_MAX_CHARS)
      : mergedInput;

    try {
      const summary = await vercelChatSimple(
        [{ role: 'user', content: trimmedInput }],
        'Create a compact rolling summary for future coding-agent turns. Keep only durable facts, decisions, changed files, constraints, open issues, and explicit user intent. Remove filler. Output plain text only.',
      );
      return summary.trim().slice(0, SUMMARY_OUTPUT_MAX_CHARS);
    } catch (error: any) {
      log.warn(`[OpenCodeContext] Summary merge failed: ${error.message}`);
      const fallback = [existingSummary, transcript].filter(Boolean).join('\n\n');
      return fallback.slice(fallback.length - SUMMARY_OUTPUT_MAX_CHARS);
    }
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  private estimateTokensForTurns(turns: OpenCodeTurn[]): number {
    return turns.reduce((sum, turn) => sum + this.estimateTokens(turn.content), 0);
  }

  private createSessionId(projectId: string): string {
    const salt = crypto.randomBytes(4).toString('hex');
    return `project-${projectId}-${Date.now()}-${salt}`;
  }

  private createEmptyState(projectId: string, userId: string): OpenCodeSessionState {
    return {
      version: STATE_VERSION,
      projectId,
      userId,
      activeSessionId: this.createSessionId(projectId),
      rollingSummary: '',
      recentTurns: [],
      approxPromptTokens: 0,
      updatedAt: Date.now(),
    };
  }

  private async readState(projectId: string, userId: string): Promise<OpenCodeSessionState | null> {
    try {
      const raw = await fs.readFile(this.statePath(projectId, userId), 'utf-8');
      return JSON.parse(raw) as OpenCodeSessionState;
    } catch {
      return null;
    }
  }

  private async writeState(projectId: string, userId: string, state: OpenCodeSessionState): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true });
    await fs.writeFile(this.statePath(projectId, userId), JSON.stringify(state), 'utf-8');
  }

  private statePath(projectId: string, userId: string): string {
    const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.stateDir, `${safeProject}_${safeUser}.json`);
  }
}

export const opencodeContextService = new OpenCodeContextService();
