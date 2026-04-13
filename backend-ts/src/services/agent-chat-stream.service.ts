import Docker from 'dockerode';
import { metricsService } from './metrics.service';
import { streamOpenCodeFromContainer } from './opencode-adapter.service';
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
  isClientConnected: () => boolean;
  writeSseEvent: (eventType: string, payload: { type: string; [key: string]: unknown }) => void;
}

export async function runAgentChatStream({
  container,
  projectId,
  userId,
  prompt,
  model,
  previewContext,
  isClientConnected,
  writeSseEvent,
}: RunAgentChatStreamParams) {
  const fullPrompt = buildAgentPromptWithPreviewContext(prompt, previewContext);
  const usedModel = model || 'gemini-3-flash';
  const sessionId = `project-${projectId}`;

  const streamToClient = (event: any) => {
    if (!isClientConnected()) return;
    const eventType = event.type || 'message';
    writeSseEvent(eventType, event.data || event);

    if (event.type === 'usage' && event.data) {
      const { costEur, tokensUsed } = event.data;
      metricsService.trackAIUsage({
        userId,
        model: usedModel,
        inputTokens: tokensUsed?.input || 0,
        outputTokens: tokensUsed?.output || 0,
        costEur: costEur || 0,
      });
      log.info(`[Agent] Usage tracked: model=${usedModel}, input=${tokensUsed?.input || 0}, output=${tokensUsed?.output || 0}, cost=${costEur || 0}`);
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
}
