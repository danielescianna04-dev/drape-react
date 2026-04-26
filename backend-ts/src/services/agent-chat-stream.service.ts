import Docker from 'dockerode';
import { metricsService } from './metrics.service';
import { streamOpenCodeFromContainer } from './opencode-adapter.service';
import { opencodeContextService } from './opencode-context.service';
import { loadConversation, saveConversation } from './conversation-store';
import type { ChatMessage } from './ai-provider.service';
import { log } from '../utils/logger';

interface PreviewContext {
  elementSummary?: string;
  language?: string;
}

export function buildAgentPromptWithPreviewContext(prompt: string, previewContext?: PreviewContext) {
  if (!previewContext?.elementSummary) return prompt;

  const lang = previewContext.language === 'it' ? 'it' : 'en';
  const contextPrefix = lang === 'it'
    ? `L'utente sta guardando la preview del sito e ha selezionato questo elemento: ${previewContext.elementSummary}\nLa sua richiesta è: `
    : `The user is viewing the site preview and selected this element: ${previewContext.elementSummary}\nTheir request is: `;
  return contextPrefix + prompt;
}

interface RunAgentChatStreamParams {
  container: Docker.Container;
  projectId: string;
  userId: string;
  prompt: string;
  model: string;
  previewContext?: PreviewContext;
  /** Markdown body of the active /skill, prepended to the prompt for this turn. */
  skillBody?: string | null;
  /** Slash name of the active skill (used in logs only). */
  skillSlash?: string | null;
  isClientConnected: () => boolean;
  writeSseEvent: (eventType: string, payload: { type: string; [key: string]: unknown }) => void;
}

/** Prepend the active /skill instructions to the user prompt. */
function applySkillToPrompt(prompt: string, skillBody?: string | null): string {
  if (!skillBody) return prompt;
  return `## Active Skill\n\n${skillBody.trim()}\n\n---\n\n[User request]\n${prompt}`;
}

export async function runAgentChatStream({
  container,
  projectId,
  userId,
  prompt,
  model,
  previewContext,
  skillBody,
  skillSlash,
  isClientConnected,
  writeSseEvent,
}: RunAgentChatStreamParams) {
  const startedAt = Date.now();
  const usedModel = model || 'gemini-3-flash';
  const promptWithSkill = applySkillToPrompt(prompt, skillBody);
  if (skillSlash) {
    log.info(`[Agent/chat] Applying skill /${skillSlash} for project ${projectId} (${(skillBody || '').length} chars)`);
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
  let finalAssistantText = '';
  let lastInputTokens = 0;
  let lastOutputTokens = 0;
  let lastCostEur = 0;
  const toolTranscript: string[] = [];
  const toolDigests: Array<{ tool: string; content: string }> = [];

  const streamToClient = (event: any) => {
    const eventType = event.type || 'message';
    const payload = event.data || event;

    if (event.type === 'text_delta') {
      const textChunk = typeof event.data?.text === 'string'
        ? event.data.text
        : typeof event.text === 'string'
          ? event.text
          : '';
      if (textChunk) {
        finalAssistantText += textChunk;
      }
    }

    if (event.type === 'tool_complete') {
      const toolName = event.data?.tool || event.tool || 'tool';
      const rawResult = typeof event.data?.result === 'string'
        ? event.data.result
        : typeof event.result === 'string'
          ? event.result
          : '';
      const compactResult = rawResult.length > 1200
        ? `${rawResult.slice(0, 1200)}\n...[truncated]`
        : rawResult;
      toolTranscript.push(`[Tool ${toolName}]\n${compactResult}`.trim());
      toolDigests.push({ tool: String(toolName), content: rawResult || compactResult });
    }

    if (event.type === 'tool_error') {
      const toolName = event.data?.tool || event.tool || 'tool';
      const errorText = event.data?.error || event.error || 'Tool execution failed';
      toolTranscript.push(`[Tool ${toolName} error]\n${String(errorText)}`);
      toolDigests.push({ tool: String(toolName), content: `Error: ${String(errorText)}` });
    }

    if (event.type === 'usage' && event.data) {
      const { costEur, tokensUsed } = event.data;
      lastInputTokens = tokensUsed?.input || 0;
      lastOutputTokens = tokensUsed?.output || 0;
      lastCostEur = costEur || 0;
      metricsService.trackAIUsage({
        userId,
        model: usedModel,
        phase: 'other',
        inputTokens: tokensUsed?.input || 0,
        outputTokens: tokensUsed?.output || 0,
        costEur: costEur || 0,
      });
      log.info(`[Agent] Usage tracked: model=${usedModel}, input=${tokensUsed?.input || 0}, output=${tokensUsed?.output || 0}, cost=${costEur || 0}`);
    }

    if (isClientConnected()) {
      writeSseEvent(eventType, payload);
    }
  };

  await streamOpenCodeFromContainer(
    container,
    fullPrompt,
    usedModel,
    sessionId,
    streamToClient,
    () => {},
  );

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
    operation: 'opencode_context_run',
    durationMs: Date.now() - startedAt,
    success: true,
    metadata: {
      projectId,
      model: usedModel,
      rotatedSession: preparedRun.rotatedSession,
      usedSummary: preparedRun.usedSummary,
      historicalContextTokens: preparedRun.historicalContextTokens,
      injectedMemoryTokens: preparedRun.injectedMemoryTokens,
      sessionId,
      inputTokens: lastInputTokens,
      outputTokens: lastOutputTokens,
      toolEvents: toolTranscript.length,
      transcriptChars: finalAssistantText.length,
    },
  });

  metricsService.trackOpenCodeOptimization({
    userId,
    projectId,
    model: usedModel,
    sessionId,
    rotatedSession: preparedRun.rotatedSession,
    usedSummary: preparedRun.usedSummary,
    historicalContextTokens: preparedRun.historicalContextTokens,
    injectedMemoryTokens: preparedRun.injectedMemoryTokens,
    actualInputTokens: lastInputTokens,
    actualOutputTokens: lastOutputTokens,
    toolEvents: toolTranscript.length,
    transcriptChars: finalAssistantText.length,
  });
}
