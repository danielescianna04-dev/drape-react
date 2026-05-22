/**
 * Agent chat stream — v2 (Vercel AI SDK UI Message Stream protocol).
 *
 * Wraps the existing OpenCode adapter and translates its Drape-style events
 * into the AI SDK protocol so the React Native client can drive the chat with
 * `useChat` from `@ai-sdk/react`.
 *
 * The legacy v1 service (`agent-chat-stream.service.ts`) is untouched; this
 * runs in parallel under `POST /agent/v2/chat` until the migration is complete.
 */
import Docker from 'dockerode';
import { metricsService } from './metrics.service';
import { streamOpenCodeFromContainer, type DrapeSSEEvent } from './opencode-adapter.service';
import { opencodeContextService } from './opencode-context.service';
import { loadConversation, saveConversation } from './conversation-store';
import type { ChatMessage } from './ai-provider.service';
import { log } from '../utils/logger';
import { buildAgentPromptWithPreviewContext } from './agent-chat-stream.service';
import type { AiSdkStreamHandle } from './ai-sdk-stream';
import { CLIENT_RESOLVED_TOOLS } from './ai-sdk-stream';
import { findPendingQuestionForSession } from './opencode-http-client';

interface PreviewContext {
  elementSummary?: string;
  language?: string;
}

interface RunAgentChatStreamV2Params {
  container: Docker.Container;
  projectId: string;
  userId: string;
  prompt: string;
  model: string;
  previewContext?: PreviewContext;
  skillBody?: string | null;
  skillSlash?: string | null;
  stream: AiSdkStreamHandle;
}

function applySkillToPrompt(prompt: string, skillBody?: string | null): string {
  if (!skillBody) return prompt;
  return `## Active Skill\n\n${skillBody.trim()}\n\n---\n\n[User request]\n${prompt}`;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function runAgentChatStreamV2({
  container,
  projectId,
  userId,
  prompt,
  model,
  previewContext,
  skillBody,
  skillSlash,
  stream,
}: RunAgentChatStreamV2Params) {
  const startedAt = Date.now();
  const usedModel = model || 'gemini-3-flash';
  const promptWithSkill = applySkillToPrompt(prompt, skillBody);
  if (skillSlash) {
    log.info(`[Agent/v2] Applying skill /${skillSlash} for project ${projectId} (${(skillBody || '').length} chars)`);
  }

  const preparedRun = await opencodeContextService.prepareRun({
    projectId,
    userId,
    prompt: promptWithSkill,
    previewContext,
  });
  const fullPrompt = preparedRun.prompt;
  const sessionId = preparedRun.sessionId;
  const promptForState = buildAgentPromptWithPreviewContext(prompt, previewContext);

  // Per-message bookkeeping for persistence + metrics
  let finalAssistantText = '';
  let lastInputTokens = 0;
  let lastOutputTokens = 0;
  let lastCostEur = 0;
  const toolTranscript: string[] = [];
  const toolDigests: Array<{ tool: string; content: string }> = [];

  // AI SDK protocol bookkeeping
  const messageId = newId('msg');
  let textBlockId: string | null = null;
  const knownTools = new Map<string, { tool: string; input: unknown }>();

  stream.writePart({ type: 'start', messageId });
  stream.writePart({ type: 'start-step' });

  const openTextBlock = () => {
    if (textBlockId) return;
    textBlockId = newId('txt');
    stream.writePart({ type: 'text-start', id: textBlockId });
  };
  const closeTextBlock = () => {
    if (!textBlockId) return;
    stream.writePart({ type: 'text-end', id: textBlockId });
    textBlockId = null;
  };

  const translate = (event: DrapeSSEEvent) => {
    if (stream.isClosed()) return;

    switch (event.type) {
      case 'text_delta': {
        const text = event.data?.text || '';
        if (!text) return;
        finalAssistantText += text;
        openTextBlock();
        stream.writePart({ type: 'text-delta', id: textBlockId!, delta: text });
        return;
      }

      case 'tool_start': {
        const toolCallId: string = event.data?.toolId || newId('call');
        const toolName: string = event.data?.tool || 'unknown';
        closeTextBlock();
        knownTools.set(toolCallId, { tool: toolName, input: event.data?.input });
        stream.writePart({ type: 'tool-input-start', toolCallId, toolName });
        return;
      }

      case 'tool_input': {
        const toolCallId: string = event.data?.toolId;
        const toolName: string = event.data?.tool || 'unknown';
        if (!toolCallId) return;
        const tracked = knownTools.get(toolCallId);
        if (tracked) tracked.input = event.data?.input;

        const baseInput = event.data?.input ?? {};
        stream.writePart({
          type: 'tool-input-available',
          toolCallId,
          toolName,
          input: baseInput,
        });

        // For client-resolved tools (e.g. user_question) we additionally emit
        // a custom data-part carrying the opencode requestID so the client can
        // post the answer back. Lookup is async (opencode HTTP) — at this
        // point opencode is paused waiting for the answer so no further events
        // arrive, ordering is safe.
        if (CLIENT_RESOLVED_TOOLS.has(toolName)) {
          findPendingQuestionForSession(sessionId)
            .then((pending) => {
              if (pending?.requestID && !stream.isClosed()) {
                stream.writePart({
                  type: 'data-question-meta',
                  data: { toolCallId, requestID: pending.requestID, sessionID: sessionId },
                });
              }
            })
            .catch((err) => log.warn(`[Agent/v2] question lookup failed: ${err?.message || err}`));
        }
        return;
      }

      case 'tool_complete': {
        const toolCallId: string = event.data?.toolId;
        const toolName: string = event.data?.tool || 'unknown';
        if (!toolCallId) return;
        const rawResult = typeof event.data?.result === 'string' ? event.data.result : '';
        const compactResult = rawResult.length > 1200 ? `${rawResult.slice(0, 1200)}\n...[truncated]` : rawResult;
        toolTranscript.push(`[Tool ${toolName}]\n${compactResult}`.trim());
        toolDigests.push({ tool: String(toolName), content: rawResult || compactResult });

        // For client-resolved tools (e.g. user_question) opencode reports
        // "completed" when the answer eventually comes back — by that point
        // the client has already provided output via addToolOutput, so we
        // don't re-emit tool-output-available here.
        if (CLIENT_RESOLVED_TOOLS.has(toolName)) return;

        stream.writePart({
          type: 'tool-output-available',
          toolCallId,
          output: { result: rawResult, title: event.data?.title || '' },
        });
        return;
      }

      case 'tool_error': {
        const toolCallId: string = event.data?.toolId;
        const errorText = event.data?.error || 'Tool execution failed';
        const toolName: string = event.data?.tool || 'unknown';
        if (!toolCallId) return;
        toolTranscript.push(`[Tool ${toolName} error]\n${String(errorText)}`);
        toolDigests.push({ tool: String(toolName), content: `Error: ${String(errorText)}` });
        stream.writePart({ type: 'tool-output-error', toolCallId, errorText: String(errorText) });
        return;
      }

      case 'usage': {
        const { costEur, tokensUsed } = event.data || {};
        lastInputTokens = tokensUsed?.input || 0;
        lastOutputTokens = tokensUsed?.output || 0;
        lastCostEur = costEur || 0;
        metricsService.trackAIUsage({
          userId,
          model: usedModel,
          phase: 'other',
          inputTokens: lastInputTokens,
          outputTokens: lastOutputTokens,
          costEur: lastCostEur,
        });
        stream.writePart({
          type: 'data-usage',
          data: { costEur: lastCostEur, inputTokens: lastInputTokens, outputTokens: lastOutputTokens, model: usedModel },
        });
        return;
      }

      case 'error': {
        const errText = event.data?.message || 'Stream error';
        stream.writePart({ type: 'error', errorText: String(errText) });
        return;
      }

      // iteration_start / processing / complete / done — purely informational;
      // the AI SDK protocol doesn't have a 1:1 equivalent. Skip.
      default:
        return;
    }
  };

  try {
    await streamOpenCodeFromContainer(
      container,
      fullPrompt,
      usedModel,
      sessionId,
      translate,
      () => {},
    );
  } catch (err: any) {
    log.error(`[Agent/v2] OpenCode stream error: ${err?.message || err}`);
    stream.writePart({ type: 'error', errorText: err?.message || 'Stream failed' });
  }

  closeTextBlock();
  stream.writePart({ type: 'finish-step' });
  stream.writePart({ type: 'finish' });
  stream.end();

  // Persistence (mirrors v1 service)
  try {
    await opencodeContextService.finalizeRun({
      projectId,
      userId,
      sessionId,
      prompt: promptForState,
      assistantText: [finalAssistantText.trim(), ...toolTranscript].filter(Boolean).join('\n\n'),
      toolEvents: toolDigests,
      inputTokens: lastInputTokens,
    });

    const existingConversation = await loadConversation(projectId, userId);
    const previousMessages = existingConversation?.messages || [];
    const appendedMessages: ChatMessage[] = [
      ...previousMessages,
      { role: 'user', content: promptForState },
      {
        role: 'assistant',
        content: [finalAssistantText.trim(), ...toolTranscript].filter(Boolean).join('\n\n') || '(no response)',
      },
    ];
    await saveConversation(
      projectId,
      userId,
      usedModel,
      appendedMessages.slice(-60),
      {
        input: (existingConversation?.totalTokens.input || 0) + lastInputTokens,
        output: (existingConversation?.totalTokens.output || 0) + lastOutputTokens,
      },
      (existingConversation?.totalCostEur || 0) + lastCostEur,
    );

    metricsService.trackOperation({
      operation: 'opencode_context_run_v2',
      durationMs: Date.now() - startedAt,
      success: true,
      metadata: { projectId, model: usedModel, sessionId, inputTokens: lastInputTokens, outputTokens: lastOutputTokens },
    });
  } catch (err: any) {
    log.warn(`[Agent/v2] persistence failed: ${err?.message || err}`);
  }
}
