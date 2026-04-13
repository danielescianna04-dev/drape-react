import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { log } from '../utils/logger';
import { getContextWindowTokens, vercelChatSimple } from './ai-providers';
import type { ChatMessage, ContentBlock } from './ai-provider.service';

interface SummaryState {
  version: number;
  projectId: string;
  summary: string;
  updatedAt: number;
  sourceMessageCount: number;
  sourceHash: string;
}

export interface ConversationOptimizationReport {
  originalEstimatedTokens: number;
  optimizedEstimatedTokens: number;
  savedTokens: number;
  digestedToolResults: number;
  digestedTextBlocks: number;
  summaryUsed: boolean;
  summaryUpdated: boolean;
}

export interface OptimizeConversationOptions {
  projectId: string;
  history: ChatMessage[];
  model: string;
  systemPrompt: string;
}

export interface OptimizeConversationResult {
  optimizedHistory: ChatMessage[];
  canonicalHistory?: ChatMessage[];
  report: ConversationOptimizationReport;
}

const SUMMARY_STATE_VERSION = 1;
const DIGEST_RECENT_MESSAGE_COUNT = 8;
const TOOL_RESULT_MAX_CHARS = 1200;
const TEXT_BLOCK_MAX_CHARS = 3000;
const SUMMARY_TRIGGER_RATIO = 0.78;
const SUMMARY_KEEP_RECENT_RATIO = 0.28;
const SUMMARY_MAX_INPUT_CHARS = 120000;
const SUMMARY_MAX_PERSISTED_CHARS = 12000;

class ConversationOptimizerService {
  private optimizerDir = path.join(config.cacheRoot, 'conversation-optimizer');

  async optimizeForModel({
    projectId,
    history,
    model,
    systemPrompt,
  }: OptimizeConversationOptions): Promise<OptimizeConversationResult> {
    const originalEstimatedTokens = this.estimateTokenCount(history, systemPrompt);
    let digestedToolResults = 0;
    let digestedTextBlocks = 0;
    let optimizedHistory = history.map((message) => ({ ...message }));
    let canonicalHistory: ChatMessage[] | undefined;
    let summaryUsed = false;
    let summaryUpdated = false;

    const digested = this.digestHistory(history, DIGEST_RECENT_MESSAGE_COUNT);
    optimizedHistory = digested.history;
    digestedToolResults = digested.digestedToolResults;
    digestedTextBlocks = digested.digestedTextBlocks;

    const contextWindow = getContextWindowTokens(model);
    const digestedEstimatedTokens = this.estimateTokenCount(optimizedHistory, systemPrompt);

    if (digestedEstimatedTokens > contextWindow * SUMMARY_TRIGGER_RATIO) {
      const summaryResult = await this.summarizeHistory({
        projectId,
        history: optimizedHistory,
        model,
        systemPrompt,
      });

      optimizedHistory = summaryResult.optimizedHistory;
      canonicalHistory = summaryResult.canonicalHistory;
      summaryUsed = summaryResult.summaryUsed;
      summaryUpdated = summaryResult.summaryUpdated;
    }

    const optimizedEstimatedTokens = this.estimateTokenCount(optimizedHistory, systemPrompt);

    return {
      optimizedHistory,
      canonicalHistory,
      report: {
        originalEstimatedTokens,
        optimizedEstimatedTokens,
        savedTokens: Math.max(0, originalEstimatedTokens - optimizedEstimatedTokens),
        digestedToolResults,
        digestedTextBlocks,
        summaryUsed,
        summaryUpdated,
      },
    };
  }

  estimateTokenCount(messages: ChatMessage[], systemPrompt: string): number {
    let charCount = systemPrompt.length;

    for (const message of messages) {
      if (typeof message.content === 'string') {
        charCount += message.content.length;
        continue;
      }

      if (!Array.isArray(message.content)) continue;

      for (const block of message.content) {
        if (block.type === 'text') charCount += block.text.length;
        else if (block.type === 'tool_use') charCount += JSON.stringify(block.input).length + 100;
        else if (block.type === 'tool_result') charCount += typeof block.content === 'string' ? block.content.length : 200;
        else if (block.type === 'image') charCount += 6000;
      }
    }

    return Math.ceil(charCount / 3.5);
  }

  async readProjectSummary(projectId: string): Promise<string | null> {
    const state = await this.readSummaryState(projectId);
    return state?.summary || null;
  }

  private digestHistory(history: ChatMessage[], recentMessageCount: number) {
    const preserveFrom = Math.max(0, history.length - recentMessageCount);
    let digestedToolResults = 0;
    let digestedTextBlocks = 0;

    const optimized = history.map((message, index) => {
      if (index >= preserveFrom) return this.cloneMessage(message);
      if (!Array.isArray(message.content)) return this.digestStringMessage(message, () => { digestedTextBlocks += 1; });

      const blocks = message.content.map((block) => {
        if (block.type === 'tool_result') {
          const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
          if (content.length <= TOOL_RESULT_MAX_CHARS) return block;
          digestedToolResults += 1;
          return {
            ...block,
            content: this.createDigest(content, 'Tool result digest'),
          } as ContentBlock;
        }

        if (block.type === 'text' && block.text.length > TEXT_BLOCK_MAX_CHARS) {
          digestedTextBlocks += 1;
          return {
            ...block,
            text: this.createDigest(block.text, 'Message digest'),
          } as ContentBlock;
        }

        return block;
      });

      return {
        ...message,
        content: blocks,
      };
    });

    return {
      history: optimized,
      digestedToolResults,
      digestedTextBlocks,
    };
  }

  private digestStringMessage(message: ChatMessage, onDigest: () => void): ChatMessage {
    if (typeof message.content !== 'string') return this.cloneMessage(message);
    if (message.content.length <= TEXT_BLOCK_MAX_CHARS) return this.cloneMessage(message);
    onDigest();
    return {
      ...message,
      content: this.createDigest(message.content, 'Message digest'),
    };
  }

  private createDigest(content: string, label: string): string {
    const normalizedLines = content.split('\n');
    const nonEmptyLines = normalizedLines.filter((line) => line.trim().length > 0);
    const previewHead = normalizedLines.slice(0, 8).join('\n').trim();
    const previewTail = normalizedLines.slice(-5).join('\n').trim();
    const sha = crypto.createHash('sha1').update(content).digest('hex').slice(0, 12);

    const sections = [
      `[${label}]`,
      `chars=${content.length}`,
      `lines=${normalizedLines.length}`,
      `nonEmptyLines=${nonEmptyLines.length}`,
      `sha1=${sha}`,
    ];

    const body = [
      sections.join(' '),
      previewHead ? `Head:\n${previewHead}` : '',
      previewTail && previewTail !== previewHead ? `Tail:\n${previewTail}` : '',
    ].filter(Boolean).join('\n\n');

    return body;
  }

  private async summarizeHistory({
    projectId,
    history,
    model,
    systemPrompt,
  }: OptimizeConversationOptions): Promise<{
    optimizedHistory: ChatMessage[];
    canonicalHistory: ChatMessage[];
    summaryUsed: boolean;
    summaryUpdated: boolean;
  }> {
    const contextWindow = getContextWindowTokens(model);
    const keepRecentTokens = Math.floor(contextWindow * SUMMARY_KEEP_RECENT_RATIO);

    let recentTokens = 0;
    let splitIndex = history.length;

    for (let index = history.length - 1; index >= 0; index -= 1) {
      recentTokens += this.estimateTokenCount([history[index]], '');
      if (recentTokens > keepRecentTokens) {
        splitIndex = index + 1;
        break;
      }
    }

    if (splitIndex <= 1) {
      return {
        optimizedHistory: history,
        canonicalHistory: history,
        summaryUsed: false,
        summaryUpdated: false,
      };
    }

    const oldMessages = history.slice(0, splitIndex);
    const recentMessages = history.slice(splitIndex);
    const previousSummary = await this.readSummaryState(projectId);

    const summaryInput = this.buildSummaryInput(previousSummary?.summary || null, oldMessages);
    const sourceHash = crypto.createHash('sha1').update(summaryInput).digest('hex');

    let summaryText = previousSummary?.summary || '';
    let summaryUpdated = false;

    if (!previousSummary || previousSummary.sourceHash !== sourceHash) {
      try {
        summaryText = await this.generateSummary(summaryInput);
        summaryUpdated = true;
        await this.writeSummaryState(projectId, {
          version: SUMMARY_STATE_VERSION,
          projectId,
          summary: summaryText.slice(0, SUMMARY_MAX_PERSISTED_CHARS),
          updatedAt: Date.now(),
          sourceMessageCount: oldMessages.length,
          sourceHash,
        });
      } catch (error: any) {
        log.warn(`[ConversationOptimizer] Summary generation failed for project ${projectId}: ${error.message}`);
        summaryText = previousSummary?.summary || this.createDigest(this.formatMessagesForSummary(oldMessages), 'Conversation digest');
      }
    }

    const summaryMessage: ChatMessage = {
      role: 'user',
      content: [{
        type: 'text',
        text: `[Project conversation memory]\n${summaryText.slice(0, SUMMARY_MAX_PERSISTED_CHARS)}`,
      }],
    };

    const canonicalHistory = [summaryMessage, ...recentMessages];
    const digested = this.digestHistory(canonicalHistory, DIGEST_RECENT_MESSAGE_COUNT);
    const optimizedHistory = digested.history;

    const optimizedEstimatedTokens = this.estimateTokenCount(optimizedHistory, systemPrompt);
    if (optimizedEstimatedTokens > contextWindow * 0.92) {
      const fallbackRecent = recentMessages.slice(Math.max(0, recentMessages.length - 6));
      return {
        optimizedHistory: [summaryMessage, ...fallbackRecent],
        canonicalHistory: [summaryMessage, ...fallbackRecent],
        summaryUsed: true,
        summaryUpdated,
      };
    }

    return {
      optimizedHistory,
      canonicalHistory,
      summaryUsed: true,
      summaryUpdated,
    };
  }

  private buildSummaryInput(previousSummary: string | null, messages: ChatMessage[]): string {
    const summaryParts = [
      previousSummary ? `Existing project conversation memory:\n${previousSummary}` : '',
      'New conversation segment to merge:',
      this.formatMessagesForSummary(messages),
    ].filter(Boolean);

    const fullText = summaryParts.join('\n\n');
    if (fullText.length <= SUMMARY_MAX_INPUT_CHARS) return fullText;
    return fullText.slice(fullText.length - SUMMARY_MAX_INPUT_CHARS);
  }

  private formatMessagesForSummary(messages: ChatMessage[]): string {
    const parts: string[] = [];

    for (const message of messages) {
      const role = message.role.toUpperCase();
      if (typeof message.content === 'string') {
        parts.push(`[${role}] ${message.content}`);
        continue;
      }

      if (!Array.isArray(message.content)) continue;

      const lines: string[] = [];
      for (const block of message.content) {
        if (block.type === 'text') {
          lines.push(block.text);
        } else if (block.type === 'tool_use') {
          lines.push(`[TOOL ${block.name}] ${JSON.stringify(block.input).slice(0, 500)}`);
        } else if (block.type === 'tool_result') {
          const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
          lines.push(`[TOOL RESULT] ${text.slice(0, 800)}`);
        }
      }

      if (lines.length > 0) {
        parts.push(`[${role}] ${lines.join('\n')}`);
      }
    }

    return parts.join('\n\n');
  }

  private async generateSummary(summaryInput: string): Promise<string> {
    const summary = await vercelChatSimple(
      [{ role: 'user', content: summaryInput }],
      'Create a production-grade rolling engineering summary for future agent runs. Keep only durable, high-value context: goals, decisions, files changed, APIs/contracts, unresolved issues, pending follow-ups, and constraints. Remove chatter and duplicate tool output. Be concise but specific. Output plain text only.',
    );

    return summary.trim();
  }

  private async readSummaryState(projectId: string): Promise<SummaryState | null> {
    try {
      const raw = await fs.readFile(this.summaryPath(projectId), 'utf-8');
      const parsed = JSON.parse(raw) as SummaryState;
      if (!parsed?.summary) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeSummaryState(projectId: string, state: SummaryState): Promise<void> {
    await fs.mkdir(this.optimizerDir, { recursive: true });
    await fs.writeFile(this.summaryPath(projectId), JSON.stringify(state), 'utf-8');
  }

  private summaryPath(projectId: string): string {
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.optimizerDir, `${safeProjectId}.json`);
  }

  private cloneMessage(message: ChatMessage): ChatMessage {
    if (typeof message.content === 'string') {
      return { ...message };
    }

    if (!Array.isArray(message.content)) {
      return { ...message };
    }

    return {
      ...message,
      content: message.content.map((block) => ({ ...block })) as ContentBlock[],
    };
  }
}

export const conversationOptimizerService = new ConversationOptimizerService();
