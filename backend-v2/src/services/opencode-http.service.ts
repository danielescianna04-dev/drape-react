import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';

/**
 * opencode HTTP integration — usa il vero protocollo opencode 1.15.5.
 *
 * Flow:
 *   1. POST /session                              → crea opencode session
 *   2. GET  /event (SSE long-lived)                → ascolta stream eventi
 *   3. POST /session/{id}/message                  → invia messaggio utente
 *   4. Filtra eventi per sessionID nostro, traduce in AgentEvent
 *
 * Modelli Zen disponibili (provider="opencode"):
 *   - opencode/big-pickle (premium)
 *   - opencode/deepseek-v4-flash-free
 *   - opencode/minimax-m2.5-free
 *   - opencode/nemotron-3-super-free
 *   - opencode/qwen3.6-plus-free
 *
 * Default: deepseek-v4-flash-free (gratis, performant per code).
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
  systemContext?: string;
  starterId?: string;
}

const DEFAULT_MODEL = 'deepseek-v4-flash-free';
const DEFAULT_PROVIDER = 'opencode';

// Map nostro sessionId (UUID Drape) → opencode sessionID (ses_xxx)
const sessionMap = new Map<string, string>();

function parseModel(raw?: string): { providerID: string; modelID: string } {
  if (!raw) return { providerID: DEFAULT_PROVIDER, modelID: DEFAULT_MODEL };
  if (raw.includes('/')) {
    const [providerID, modelID] = raw.split('/', 2);
    return { providerID, modelID };
  }
  return { providerID: DEFAULT_PROVIDER, modelID: raw };
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
        timeout: 0,
      });
    }
  }

  private async ensureSession(drapeSessionId: string, model: { providerID: string; modelID: string }): Promise<string> {
    const existing = sessionMap.get(drapeSessionId);
    if (existing) return existing;

    const { data } = await this.client!.post('/session', {
      title: `Drape ${drapeSessionId.slice(0, 8)}`,
      model: { id: model.modelID, providerID: model.providerID },
    });
    const opencodeSessionId = data?.id;
    if (!opencodeSessionId) throw new Error('opencode did not return session id');
    sessionMap.set(drapeSessionId, opencodeSessionId);
    return opencodeSessionId;
  }

  /**
   * Sincrono: POST /message ritorna response completo con tutti i parts.
   * Simuliamo streaming spezzando il testo in chunk piccoli.
   *
   * (L'endpoint /event SSE globale esiste ma POST /message è già sincrono — non serve.)
   */
  async *chatStream(req: AgentChatRequest): AsyncIterable<AgentEvent> {
    if (this.isMock) {
      yield* this.mockChatStream(req);
      return;
    }
    if (!this.client) throw new Error('opencode client not initialized');

    const model = parseModel(req.model);

    // 1. Ensure opencode session
    const opencodeSessionId = await this.ensureSession(req.sessionId, model);

    yield { type: 'message_start', messageId: `msg-${Date.now()}`, model: `${model.providerID}/${model.modelID}` };

    // 2. POST /message → ritorna response sincrono con parts completi
    let response: any;
    try {
      const result = await this.client.post(`/session/${opencodeSessionId}/message`, {
        model: { providerID: model.providerID, modelID: model.modelID },
        parts: [{ type: 'text', text: req.message }],
        ...(req.systemContext ? { system: req.systemContext } : {}),
      }, { responseType: 'json' });
      response = result.data;
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'opencode /message failed';
      console.error('[opencode] /message failed:', msg);
      yield { type: 'error', message: msg };
      yield { type: 'session_end', reason: 'error', error: msg };
      return;
    }

    // 3. Parse response.parts: emetti tool_use/tool_result per ToolPart, text streamato a chunk per TextPart
    const info = response?.info ?? {};
    const parts: any[] = response?.parts ?? [];
    const messageId = info.id ?? `msg-${Date.now()}`;

    if (info.error) {
      const errMsg = info.error?.data?.message ?? info.error?.name ?? 'opencode model error';
      yield { type: 'error', message: errMsg };
      yield { type: 'session_end', reason: 'error', error: errMsg };
      return;
    }

    for (const part of parts) {
      if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
        // Streaming simulato: spezza in chunk piccoli per dare l'illusione del flusso
        const text = part.text;
        const chunkSize = 8;
        for (let i = 0; i < text.length; i += chunkSize) {
          yield { type: 'token', content: text.slice(i, i + chunkSize) };
          // micro-delay rimosso per non rallentare (in alternativa: await new Promise(r=>setTimeout(r,5)))
        }
      } else if (part.type === 'tool') {
        const state = part.state ?? {};
        const status = state.status;
        if (status === 'running' || status === 'pending') {
          yield { type: 'tool_use', id: part.id, name: part.tool ?? 'unknown', input: state.input ?? {} };
        } else if (status === 'completed') {
          yield { type: 'tool_use', id: part.id, name: part.tool ?? 'unknown', input: state.input ?? {} };
          yield { type: 'tool_result', id: part.id, output: state.output ?? null };
        } else if (status === 'error') {
          yield { type: 'tool_result', id: part.id, output: null, error: state.error ?? 'tool error' };
        }
      }
      // step-start / step-finish / reasoning: skip
    }

    const tokens = info.tokens ?? {};
    yield { type: 'message_end', messageId, tokensIn: tokens.input ?? 0, tokensOut: tokens.output ?? 0 };
    yield { type: 'session_end', reason: 'completed' };
  }

  // Vecchio path SSE-based (non più usato, mantenuto come riferimento):
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async *_unusedSseFlow(req: AgentChatRequest): AsyncIterable<AgentEvent> {
    if (!this.client) throw new Error('opencode client not initialized');
    const model = parseModel(req.model);
    const opencodeSessionId = await this.ensureSession(req.sessionId, model);
    const eventResp = await this.client.get('/event', { responseType: 'stream' });
    const messagePromise = this.client.post(`/session/${opencodeSessionId}/message`, {
      model: { providerID: model.providerID, modelID: model.modelID },
      parts: [{ type: 'text', text: req.message }],
      ...(req.systemContext ? { system: req.systemContext } : {}),
    }).catch((err: any) => {
      console.error('[opencode] /message failed:', err?.response?.data ?? err?.message);
      throw err;
    });

    yield { type: 'message_start', messageId: `msg-${Date.now()}`, model: `${model.providerID}/${model.modelID}` };

    // 4. Parse SSE stream events
    const emittedTextByPart = new Map<string, number>(); // partID → lastEmittedLength
    let assistantMessageId: string | null = null;
    let completed = false;
    let buffer = '';

    try {
      for await (const chunk of eventResp.data) {
        buffer += chunk.toString('utf8');
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          // SSE format: "data: {...}\n"
          const dataLines = block
            .split('\n')
            .filter((l) => l.startsWith('data: '))
            .map((l) => l.slice(6));
          if (dataLines.length === 0) continue;
          const payload = dataLines.join('\n');
          if (!payload || payload === '[DONE]') continue;

          let event: any;
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }

          const type = event.type;
          const props = event.properties ?? {};

          // Filtra solo eventi della NOSTRA sessione
          const sessionID = props.sessionID;
          if (sessionID && sessionID !== opencodeSessionId) continue;

          // opencode emette `message.part.delta` per stream incrementale del testo
          if (type === 'message.part.delta') {
            const field = props.field;
            const delta = props.delta;
            // Skip reasoning chunks (sono modello che pensa, non testo finale)
            if (field === 'text' && typeof delta === 'string' && delta.length > 0) {
              yield { type: 'token', content: delta };
            }
            continue;
          }

          if (type === 'message.part.updated') {
            const part = props.part;
            if (!part) continue;

            if (part.type === 'text' && part.text) {
              // Fallback: alcuni eventi emettono il testo intero (es. al completamento)
              const previous = emittedTextByPart.get(part.id) ?? 0;
              const fullText: string = part.text;
              if (fullText.length > previous) {
                const delta = fullText.slice(previous);
                emittedTextByPart.set(part.id, fullText.length);
                yield { type: 'token', content: delta };
              }
            } else if (part.type === 'tool') {
              // ToolPart: ha state.status, state.input, state.output
              const state = part.state ?? {};
              const status = state.status;
              if (status === 'running' || status === 'pending') {
                yield {
                  type: 'tool_use',
                  id: part.id,
                  name: part.tool ?? 'unknown',
                  input: state.input ?? {},
                };
              } else if (status === 'completed') {
                yield {
                  type: 'tool_result',
                  id: part.id,
                  output: state.output ?? null,
                };
              } else if (status === 'error') {
                yield {
                  type: 'tool_result',
                  id: part.id,
                  output: null,
                  error: state.error ?? 'tool error',
                };
              }
            }
          } else if (type === 'message.updated') {
            const info = props.info;
            if (info?.role === 'assistant') {
              if (!assistantMessageId) assistantMessageId = info.id;
              // Quando completato, opencode setta time.completed
              if (info.time?.completed && !completed) {
                completed = true;
                const tokens = info.tokens ?? {};
                yield {
                  type: 'message_end',
                  messageId: info.id,
                  tokensIn: tokens.input ?? 0,
                  tokensOut: tokens.output ?? 0,
                };
                yield { type: 'session_end', reason: 'completed' };
                eventResp.data.destroy?.();
                return;
              }
              // Errore opencode
              if (info.error) {
                const errMsg =
                  info.error?.data?.message ?? info.error?.name ?? 'opencode error';
                yield { type: 'error', message: errMsg };
                yield { type: 'session_end', reason: 'error', error: errMsg };
                eventResp.data.destroy?.();
                return;
              }
            }
          } else if (type === 'session.error') {
            const errMsg = props?.error?.message ?? 'session error';
            yield { type: 'error', message: errMsg };
            yield { type: 'session_end', reason: 'error', error: errMsg };
            eventResp.data.destroy?.();
            return;
          }
        }
      }
    } catch (err: any) {
      console.error('[opencode] SSE error:', err?.message);
      yield { type: 'error', message: err?.message ?? 'SSE stream error' };
      yield { type: 'session_end', reason: 'error', error: err?.message };
    } finally {
      try { eventResp.data.destroy?.(); } catch {}
    }

    // Assicura che messagePromise sia stato risolto
    await messagePromise.catch(() => {});
  }

  async cancelSession(drapeSessionId: string): Promise<void> {
    if (this.isMock) return;
    const opencodeSessionId = sessionMap.get(drapeSessionId);
    if (!opencodeSessionId) return;
    await this.client?.post(`/session/${opencodeSessionId}/abort`).catch(() => {});
  }

  async health(): Promise<{ ok: boolean; mock: boolean; error?: string }> {
    if (this.isMock) return { ok: true, mock: true };
    try {
      await this.client?.get('/api/model', { timeout: 5000 });
      return { ok: true, mock: false };
    } catch (err: any) {
      return { ok: false, mock: false, error: err?.message ?? String(err) };
    }
  }

  /** Lista modelli disponibili da opencode. */
  async listModels(): Promise<Array<{ providerID: string; modelID: string }>> {
    if (this.isMock) return [];
    const { data } = await this.client!.get('/api/model');
    if (Array.isArray(data)) {
      return data.map((m: any) => ({ providerID: m.providerID ?? 'opencode', modelID: m.modelID ?? m.id }));
    }
    return [];
  }

  /** Pulisci mapping sessioni cache (es. quando una sessione viene cancellata). */
  forgetSession(drapeSessionId: string): void {
    sessionMap.delete(drapeSessionId);
  }

  private async *mockChatStream(req: AgentChatRequest): AsyncIterable<AgentEvent> {
    const messageId = `mock-${Date.now()}`;
    yield { type: 'message_start', messageId, model: req.model ?? 'mock-model' };
    const reply = `[MOCK opencode] Ricevuto: "${req.message.slice(0, 80)}". opencode non configurato.`;
    for (const ch of reply) {
      yield { type: 'token', content: ch };
      await new Promise((r) => setTimeout(r, 8));
    }
    yield { type: 'message_end', messageId, tokensIn: 10, tokensOut: reply.length };
    yield { type: 'session_end', reason: 'completed' };
  }
}

export const opencodeHttpService = new OpencodeHttpService();
