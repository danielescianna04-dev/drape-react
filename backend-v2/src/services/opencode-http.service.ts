import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';

/**
 * opencode HTTP integration.
 *
 * opencode espone un server HTTP (`opencode serve`) con API per:
 * - inviare prompt e ricevere stream di eventi
 * - gestire sessioni stateful
 * - eseguire tool (file ops, ecc.)
 *
 * In v2 il backend Drape NON spawna opencode locale dentro a Docker.
 * Lo proxa via HTTP a un'istanza opencode che gira come servizio sullo stesso VPS
 * (o eventualmente remoto).
 *
 * Se OPENCODE_API_URL non è settato, il service usa un mock che logga e ritorna
 * eventi placeholder — utile per sviluppo prima che opencode sia online.
 */

export type AgentEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_use'; name: string; input: Record<string, any>; id: string }
  | { type: 'tool_result'; id: string; output: any; error?: string }
  | { type: 'message_start'; messageId: string; model: string }
  | { type: 'message_end'; messageId: string; tokensIn: number; tokensOut: number }
  | { type: 'session_end'; reason: 'completed' | 'cancelled' | 'error'; error?: string }
  | { type: 'error'; message: string };

export interface AgentChatRequest {
  sessionId: string;
  message: string;
  model?: string;
  appwriteCredentials?: {
    endpoint: string;
    projectId: string;
    databaseId: string;
  };
  /** Context aggiuntivo iniettato nel system prompt (es. lista file progetto) */
  systemContext?: string;
  /** Starter template scelto dall'utente (todo, blog, ecc.) */
  starterId?: string;
}

export class OpencodeHttpService {
  private client: AxiosInstance | null = null;
  private isMock: boolean;

  constructor() {
    this.isMock = !env.OPENCODE_API_URL;
    if (env.OPENCODE_API_URL) {
      this.client = axios.create({
        baseURL: env.OPENCODE_API_URL,
        headers: env.OPENCODE_API_KEY ? { Authorization: `Bearer ${env.OPENCODE_API_KEY}` } : {},
        responseType: 'stream',
        timeout: 0, // SSE: no timeout
      });
    }
  }

  /**
   * Inizia/continua una sessione agent con un nuovo prompt.
   * Ritorna AsyncIterable di eventi (per SSE streaming verso il client).
   */
  async *chatStream(req: AgentChatRequest): AsyncIterable<AgentEvent> {
    if (this.isMock) {
      yield* this.mockChatStream(req);
      return;
    }

    if (!this.client) throw new Error('opencode client not initialized');

    const response = await this.client.post('/sessions/chat', {
      sessionId: req.sessionId,
      message: req.message,
      model: req.model,
      context: {
        appwrite: req.appwriteCredentials,
        systemContext: req.systemContext,
        starterId: req.starterId,
      },
    });

    // Parse SSE response stream
    let buffer = '';
    for await (const chunk of response.data) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;
        try {
          const event = JSON.parse(payload) as AgentEvent;
          yield event;
        } catch (e) {
          console.warn('[opencode] failed to parse event:', payload);
        }
      }
    }
  }

  /**
   * Cancella una sessione attiva.
   */
  async cancelSession(sessionId: string): Promise<void> {
    if (this.isMock) return;
    await this.client?.post(`/sessions/${sessionId}/cancel`);
  }

  /**
   * Health check del server opencode.
   */
  async health(): Promise<{ ok: boolean; mock: boolean; error?: string }> {
    if (this.isMock) return { ok: true, mock: true };
    try {
      await this.client?.get('/health', { responseType: 'json', timeout: 5000 } as any);
      return { ok: true, mock: false };
    } catch (err: any) {
      return { ok: false, mock: false, error: err?.message ?? String(err) };
    }
  }

  /**
   * Mock per sviluppo: simula uno stream con risposta placeholder.
   */
  private async *mockChatStream(req: AgentChatRequest): AsyncIterable<AgentEvent> {
    const messageId = `mock-${Date.now()}`;
    yield { type: 'message_start', messageId, model: req.model ?? 'mock-model' };

    const reply = `[MOCK opencode] Ricevuto: "${req.message.slice(0, 80)}${
      req.message.length > 80 ? '...' : ''
    }". Opencode non è ancora connesso (OPENCODE_API_URL non impostato).`;

    for (const ch of reply) {
      yield { type: 'token', content: ch };
      await new Promise((r) => setTimeout(r, 8));
    }

    yield { type: 'message_end', messageId, tokensIn: 10, tokensOut: reply.length };
    yield { type: 'session_end', reason: 'completed' };
  }
}

export const opencodeHttpService = new OpencodeHttpService();
