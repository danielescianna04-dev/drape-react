import type { Response } from 'express';

export type AgentMode = 'fast' | 'plan' | 'execute';

/** Known SSE event types sent to the client */
export type AgentSseEventType =
  | 'processing'
  | 'text_delta'
  | 'tool_start'
  | 'tool_complete'
  | 'plan'
  | 'plan_update'
  | 'heartbeat'
  | 'error'
  | 'done'
  | 'thinking'
  | 'status';

/** Payload shape for all SSE events */
export interface AgentSsePayload {
  type: string;
  [key: string]: unknown;
}

/** Callback signature for writing SSE events — used across all agent services */
export type WriteSseEventFn = (eventType: AgentSseEventType | string, payload: AgentSsePayload) => void;

interface SetupAgentSseParams {
  res: Response;
  onDisconnect: () => void;
}

export interface AgentSseController {
  writeEvent: (
    eventType: AgentSseEventType | string,
    payload: AgentSsePayload,
    options?: { countAsActivity?: boolean },
  ) => boolean;
  cleanup: () => void;
}

export const getAgentModeFromPath = (path: string): AgentMode => {
  if (path.includes('/run/plan')) return 'plan';
  if (path.includes('/run/execute')) return 'execute';
  return 'fast';
};

export const setupAgentSse = ({
  res,
  onDisconnect,
}: SetupAgentSseParams): AgentSseController => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.socket?.setNoDelay(true);
  res.socket?.setKeepAlive(true, 10000);
  res.write(': connected\n\n');

  let lastPayloadEventAt = Date.now();
  const waitingMessages = [
    'Preparazione risposta...',
    'Il modello sta analizzando il contesto...',
    'Generazione del codice in corso...',
    'Elaborazione di una risposta complessa...',
    'Il modello sta ragionando...',
    'Scrittura del codice...',
    'Quasi pronto...',
    'Ancora in elaborazione...',
  ];

  const writeEvent = (
    eventType: AgentSseEventType | string,
    payload: AgentSsePayload,
    options: { countAsActivity?: boolean } = {},
  ): boolean => {
    if (res.writableEnded) return false;
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    if (options.countAsActivity !== false) {
      lastPayloadEventAt = Date.now();
    }
    return true;
  };

  const keepAliveInterval = setInterval(() => {
    if (res.writableEnded) return;

    res.write(': keepalive\n\n');

    const silenceMs = Date.now() - lastPayloadEventAt;
    if (silenceMs < 2000) return;

    const elapsedSec = Math.floor(silenceMs / 1000);
    const msgIndex = Math.floor(elapsedSec / 5) % waitingMessages.length;
    const message = `${waitingMessages[msgIndex]} (${elapsedSec}s)`;
    writeEvent('heartbeat', {
      type: 'heartbeat',
      status: 'alive',
      message,
      elapsedSec,
      silenceMs,
    }, { countAsActivity: false });
  }, 1000);

  const cleanup = () => {
    clearInterval(keepAliveInterval);
    if (!res.writableEnded) {
      res.end();
    }
  };

  res.on('close', () => {
    onDisconnect();
    cleanup();
  });

  return {
    writeEvent,
    cleanup,
  };
};
