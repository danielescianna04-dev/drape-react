/**
 * useAgentChat — Vercel AI SDK v6 powered chat hook.
 *
 * Wraps `useChat` from `@ai-sdk/react` and points it at our `/agent/v2/chat`
 * route which speaks the AI SDK UI Message Stream protocol. Auth and the
 * project context are injected via a custom fetch.
 *
 * The legacy `useAgentStream` is unchanged — both hooks can coexist while we
 * migrate the chat surface incrementally.
 */
import { useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import { config } from '../../config/config';
import { getAuthToken } from '../api/getAuthToken';

export interface UseAgentChatOptions {
  projectId: string;
  model?: string;
  previewContext?: { elementSummary?: string; language?: string };
}

export function useAgentChat({ projectId, model, previewContext }: UseAgentChatOptions) {
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: `${config.apiUrl}/agent/v2/chat`,
      // Inject auth + project metadata on every request.
      fetch: (async (input: any, init: any = {}) => {
        const token = await getAuthToken();
        const headers = new Headers(init.headers || {});
        if (token) headers.set('Authorization', `Bearer ${token}`);
        headers.set('Content-Type', 'application/json');

        // The AI SDK transport posts { messages, id, trigger, ... }.
        // We splice in the fields our backend needs.
        let bodyObj: any = {};
        if (init.body) {
          try { bodyObj = JSON.parse(init.body as string); } catch { bodyObj = {}; }
        }
        bodyObj.projectId = projectId;
        if (model) bodyObj.model = model;
        if (previewContext) bodyObj.previewContext = previewContext;

        return expoFetch(input, {
          ...init,
          headers,
          body: JSON.stringify(bodyObj),
        }) as unknown as Response;
      }) as any,
    });
  }, [projectId, model, previewContext]);

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  return chat;
}

/** Post a free-text answer to an opencode `question` tool that the agent paused
 *  on. `requestID` is the opencode `que_xxx` id, exposed by the backend as a
 *  `data-question-meta` part on the stream. */
export async function postQuestionAnswer(params: {
  projectId: string;
  requestID: string;
  answer: string;
}): Promise<void> {
  const token = await getAuthToken();
  const res = await expoFetch(`${config.apiUrl}/agent/v2/answer-question`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  } as any);
  if (!(res as any).ok) {
    let detail = '';
    try { detail = await (res as any).text(); } catch { /* ignore */ }
    throw new Error(`answer-question failed (${(res as any).status}): ${detail.slice(0, 200)}`);
  }
}
