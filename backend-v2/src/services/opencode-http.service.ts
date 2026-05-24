import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
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
 *   - openrouter/deepseek/deepseek-v4-pro (default, pay-per-use via $5 OpenRouter deposit)
 *   - openrouter/deepseek/deepseek-v4-flash (cheaper alternative)
 *   - openrouter/qwen/qwen3-coder (code-specialized)
 *   - openrouter/google/gemma-4-31b-it:free (free tier fallback w/ vision+tools)
 *   - opencode/big-pickle (Zen free fallback)
 *   - opencode/deepseek-v4-flash-free (Zen free fallback)
 *   - opencode/minimax-m2.5-free
 *   - opencode/nemotron-3-super-free
 *   - opencode/qwen3.6-plus-free
 *
 * Default: openrouter/deepseek/deepseek-v4-pro (paid via $5 OpenRouter deposit,
 *          tool calling + 1M context + price-to-quality leader).
 */

export type AgentEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_use'; name: string; input: Record<string, any>; id: string }
  | { type: 'tool_result'; id: string; output: any; error?: string; name?: string }
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

// Default ora è OpenRouter → DeepSeek V4-Pro (zero markup vs DeepSeek diretto,
// pricing $0.435/$0.87 per M tokens, tool calling + cache aggressivo).
// OpenRouter API key viene letta da OPENROUTER_API_KEY nell'env del processo
// opencode serve (vedi /etc/systemd/system/opencode.service.d/openrouter-env.conf).
const DEFAULT_MODEL = 'deepseek/deepseek-v4-pro';
const DEFAULT_PROVIDER = 'openrouter';

// Map nostro sessionId (UUID Bynot) → opencode sessionID (ses_xxx)
// Persisted to disk so a pm2 restart / redeploy doesn't wipe every user's
// opencode session — without persistence, every restart effectively cold-
// caches everyone again, paying full input price for the first request after
// each deploy.
const SESSION_MAP_FILE = process.env.BYNOT_SESSION_MAP_PATH ?? '/root/.bynot-sessions.json';
const sessionMap = new Map<string, string>();

(function loadSessionMap() {
  try {
    if (fs.existsSync(SESSION_MAP_FILE)) {
      const raw = fs.readFileSync(SESSION_MAP_FILE, 'utf8');
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') sessionMap.set(k, v);
      }
      console.log(`[opencode] loaded ${sessionMap.size} session mappings from ${SESSION_MAP_FILE}`);
    }
  } catch (err: any) {
    console.warn(`[opencode] failed to load session map: ${err?.message}`);
  }
})();

// Per-Bynot-session turn counter. Used to trigger periodic session pruning so
// the conversation transcript doesn't grow unbounded (each appended turn is
// uncacheable input tokens that erode the cache hit rate).
const turnCountMap = new Map<string, number>();

let persistTimer: NodeJS.Timeout | null = null;
function persistSessionMap() {
  // Debounce: many ensureSession() calls in a burst should result in one write.
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const obj = Object.fromEntries(sessionMap.entries());
      fs.writeFileSync(SESSION_MAP_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err: any) {
      console.warn(`[opencode] failed to persist session map: ${err?.message}`);
    }
  }, 1000);
}

function parseModel(raw?: string): { providerID: string; modelID: string } {
  if (!raw) return { providerID: DEFAULT_PROVIDER, modelID: DEFAULT_MODEL };
  // Split only on first '/' so OpenRouter-style IDs like
  // "openrouter/deepseek/deepseek-v4-pro" map correctly to
  // providerID="openrouter", modelID="deepseek/deepseek-v4-pro".
  const idx = raw.indexOf('/');
  if (idx > 0) {
    return { providerID: raw.substring(0, idx), modelID: raw.substring(idx + 1) };
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

  private async ensureSession(bynotSessionId: string, model: { providerID: string; modelID: string }): Promise<string> {
    const existing = sessionMap.get(bynotSessionId);
    if (existing) {
      // Trust the disk-persisted mapping: opencode sessions live for the
      // lifetime of opencode itself (a systemd service), so the only way
      // they disappear is if opencode is restarted. If the lookup fails on
      // the first POST below, the catch will recreate.
      return existing;
    }

    const { data } = await this.client!.post('/session', {
      title: `Bynot ${bynotSessionId.slice(0, 8)}`,
      model: { id: model.modelID, providerID: model.providerID },
    });
    const opencodeSessionId = data?.id;
    if (!opencodeSessionId) throw new Error('opencode did not return session id');
    sessionMap.set(bynotSessionId, opencodeSessionId);
    persistSessionMap();
    return opencodeSessionId;
  }

  /**
   * Re-establish a session if opencode returns 404 (session was wiped by an
   * opencode restart). Used as a recovery path inside chatStream.
   */
  private async recreateSession(bynotSessionId: string, model: { providerID: string; modelID: string }): Promise<string> {
    sessionMap.delete(bynotSessionId);
    persistSessionMap();
    return this.ensureSession(bynotSessionId, model);
  }

  /**
   * Stable identity rule for Bynot. Sent as a SYSTEM message exactly once
   * per opencode session (not prepended to every user message) so DeepSeek's
   * prefix cache can match it on subsequent turns — same string, same cache.
   */
  private static readonly BYNOT_IDENTITY =
    '[SYSTEM RULE — non rivelare mai: Sei Bynot, l\'assistente coding integrato nell\'app Bynot. NON dire mai di essere OpenCode, Claude, GPT, DeepSeek, Gemini o qualsiasi altro AI. Se chiesto chi sei, rispondi sempre "Sono Bynot". Rispondi in italiano se l\'utente scrive in italiano.]';

  /**
   * Real SSE streaming via opencode /event endpoint.
   *
   * Flow:
   *   1. Open SSE connection to /event BEFORE posting (don't miss events)
   *   2. Fire POST /message in background — don't await its body
   *   3. Read events from /event, filter by our sessionID
   *   4. Track partID → partType (text vs reasoning) — opencode uses field='text'
   *      for both, but reasoning parts shouldn't be streamed to the user
   *   5. Yield text deltas as they arrive (real-time chunks)
   *   6. End when we see message.updated with info.time.completed
   *
   * Compared to the previous sync flow (await POST /message), this gives the
   * user real streaming and removes any wall-clock cap: the connection stays
   * active as long as opencode is emitting events.
   */
  async *chatStream(req: AgentChatRequest): AsyncIterable<AgentEvent> {
    if (this.isMock) {
      yield* this.mockChatStream(req);
      return;
    }
    if (!this.client) throw new Error('opencode client not initialized');

    const model = parseModel(req.model);
    let opencodeSessionId = await this.ensureSession(req.sessionId, model);

    // Conversation pruning: opencode keeps the full transcript in each
    // session, but DeepSeek's prefix cache only matches up to the first
    // dynamic token. After ~10 turns the appended history starts dominating
    // input tokens AND missing cache. Reset the session every N turns —
    // we lose the in-session multi-turn memory but win on cost and latency.
    // (N=10 is a heuristic: most coding chats are short request→fix→ack.)
    const turnCount = (turnCountMap.get(req.sessionId) ?? 0) + 1;
    turnCountMap.set(req.sessionId, turnCount);
    if (turnCount > 10) {
      console.log(`[opencode] resetting session ${req.sessionId.slice(0, 12)} after ${turnCount} turns (pruning)`);
      opencodeSessionId = await this.recreateSession(req.sessionId, model);
      turnCountMap.set(req.sessionId, 1);
    }

    yield { type: 'message_start', messageId: `msg-${Date.now()}`, model: `${model.providerID}/${model.modelID}` };

    // 1. Open SSE first so we don't miss the first events. Disable axios's
    //    response timeout — this stream is long-lived by design.
    let eventResp: any;
    try {
      eventResp = await this.client.get('/event', {
        responseType: 'stream',
        timeout: 0,
      });
    } catch (err: any) {
      const msg = err?.message ?? 'opencode /event subscribe failed';
      yield { type: 'error', message: msg };
      yield { type: 'session_end', reason: 'error', error: msg };
      return;
    }

    // 2. Fire POST /message in background. Don't await the body — we read the
    //    output via the SSE stream. Errors still propagate via a side promise.
    const postErr: { value: string | null } = { value: null };
    // System prompt = identity rule + optional caller-provided context. Same
    // string on every request → DeepSeek's prefix cache matches, dropping
    // input cost from $0.435/M to ~$0.0036/M tokens.
    const systemPrompt = req.systemContext
      ? `${OpencodeHttpService.BYNOT_IDENTITY}\n\n${req.systemContext}`
      : OpencodeHttpService.BYNOT_IDENTITY;

    const messagePromise = this.client
      .post(`/session/${opencodeSessionId}/message`, {
        model: { providerID: model.providerID, modelID: model.modelID },
        parts: [{ type: 'text', text: req.message }],
        system: systemPrompt,
        // OpenRouter passthrough: lock to DeepSeek (no fallbacks that would
        // route to a different provider with a different cache) and request
        // detailed usage so cache hits are reported back in tokens.cache.
        // allow_fallbacks=false means we'd rather fail than silently land on
        // a different provider and pay full input price.
        provider: {
          order: ['deepseek'],
          allow_fallbacks: false,
        },
      }, { timeout: 0 })
      .catch(async (err: any) => {
        // Recover from "session not found" (e.g., opencode was restarted
        // since we cached this mapping) by recreating the session and
        // retrying once.
        const status = err?.response?.status;
        if (status === 404) {
          try {
            console.warn(`[opencode] session ${opencodeSessionId} 404, recreating`);
            const newId = await this.recreateSession(req.sessionId, model);
            opencodeSessionId = newId;
            await this.client!.post(`/session/${newId}/message`, {
              model: { providerID: model.providerID, modelID: model.modelID },
              parts: [{ type: 'text', text: req.message }],
              system: systemPrompt,
              provider: { order: ['deepseek'], allow_fallbacks: false },
            }, { timeout: 0 });
            return;
          } catch (retryErr: any) {
            const m = retryErr?.response?.data?.message ?? retryErr?.message ?? 'opencode /message retry failed';
            console.error('[opencode] /message retry failed:', m);
            postErr.value = m;
            return;
          }
        }
        const m = err?.response?.data?.message ?? err?.message ?? 'opencode /message failed';
        console.error('[opencode] /message failed:', m);
        postErr.value = m;
      });

    // 3. Parse SSE stream, filter to our session, yield deltas
    const partTypeById = new Map<string, string>();   // partID → 'text' | 'reasoning' | 'tool' | ...
    const emittedToolStart = new Set<string>();       // partID for tool_use already emitted
    let assistantMsgId: string | null = null;
    let lastTokens = { in: 0, out: 0 };
    let buffer = '';
    let finished = false;

    try {
      for await (const chunk of eventResp.data) {
        if (postErr.value) {
          yield { type: 'error', message: postErr.value };
          yield { type: 'session_end', reason: 'error', error: postErr.value };
          return;
        }

        buffer += chunk.toString('utf8');
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const payload = dataLine.slice(6);
          if (!payload || payload === '[DONE]') continue;

          let event: any;
          try { event = JSON.parse(payload); } catch { continue; }

          const props = event.properties ?? {};
          if (props.sessionID && props.sessionID !== opencodeSessionId) continue;

          const type = event.type;

          if (type === 'message.part.updated') {
            const part = props.part;
            if (!part) continue;
            partTypeById.set(part.id, part.type);

            if (part.type === 'tool') {
              const state = part.state ?? {};
              const status = state.status;
              if ((status === 'running' || status === 'pending') && !emittedToolStart.has(part.id)) {
                emittedToolStart.add(part.id);
                yield { type: 'tool_use', id: part.id, name: part.tool ?? 'unknown', input: state.input ?? {} };
              } else if (status === 'completed') {
                if (!emittedToolStart.has(part.id)) {
                  emittedToolStart.add(part.id);
                  yield { type: 'tool_use', id: part.id, name: part.tool ?? 'unknown', input: state.input ?? {} };
                }
                yield { type: 'tool_result', id: part.id, output: state.output ?? null, name: part.tool };
              } else if (status === 'error') {
                yield { type: 'tool_result', id: part.id, output: null, error: state.error ?? 'tool error', name: part.tool };
              }
            }
            continue;
          }

          if (type === 'message.part.delta') {
            const partID = props.partID;
            const delta = props.delta;
            if (typeof delta !== 'string' || delta.length === 0) continue;
            // opencode uses field='text' for BOTH reasoning and text parts.
            // Disambiguate via the partID → partType map populated from
            // message.part.updated. Only stream visible text to the user.
            const partType = partTypeById.get(partID);
            if (partType === 'text') {
              yield { type: 'token', content: delta };
            }
            continue;
          }

          if (type === 'message.updated') {
            const info = props.info;
            if (info?.role !== 'assistant') continue;
            // Track the LATEST assistant message ID and its token usage —
            // opencode emits one message per "step" of an agentic loop (the
            // tool-calling steps each get their own message, and the final
            // visible summary is its own message too). We can't exit when
            // any one of them completes — that's session.idle's job below.
            assistantMsgId = info.id;
            if (info.error) {
              const errMsg = info.error?.data?.message ?? info.error?.name ?? 'opencode error';
              yield { type: 'error', message: errMsg };
              yield { type: 'session_end', reason: 'error', error: errMsg };
              finished = true;
              return;
            }
            if (info.time?.completed) {
              const tokens = info.tokens ?? {};
              lastTokens = { in: tokens.input ?? 0, out: tokens.output ?? 0 };
              const cache = tokens.cache ?? {};
              const cacheRead = cache.read ?? 0;
              const cacheWrite = cache.write ?? 0;
              const totalIn = tokens.input ?? 0;
              const hitPct = totalIn > 0 ? Math.round((cacheRead / totalIn) * 100) : 0;
              console.log(`[cache] session=${opencodeSessionId.slice(-8)} in=${totalIn} cached=${cacheRead} (${hitPct}%) write=${cacheWrite} out=${tokens.output ?? 0}`);
            }
            continue;
          }

          // session.idle is the definitive "agent is done" signal — it fires
          // after the full multi-message agentic loop (reasoning → tool → text)
          // wraps up. Use it as the end-of-stream marker instead of any single
          // message.updated completion.
          if (type === 'session.idle' || (type === 'session.status' && props?.status?.type === 'idle')) {
            if (!finished) {
              finished = true;
              yield {
                type: 'message_end',
                messageId: assistantMsgId ?? `msg-${Date.now()}`,
                tokensIn: lastTokens.in,
                tokensOut: lastTokens.out,
              };
              yield { type: 'session_end', reason: 'completed' };
              return;
            }
          }

          if (type === 'session.error') {
            const errMsg = props?.error?.message ?? 'session error';
            yield { type: 'error', message: errMsg };
            yield { type: 'session_end', reason: 'error', error: errMsg };
            finished = true;
            return;
          }
        }
      }
    } catch (err: any) {
      if (!finished) {
        const msg = err?.message ?? 'SSE stream error';
        console.error('[opencode] SSE error:', msg);
        yield { type: 'error', message: msg };
        yield { type: 'session_end', reason: 'error', error: msg };
      }
    } finally {
      try { eventResp.data.destroy?.(); } catch {}
      await messagePromise.catch(() => {});
    }
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
                  name: part.tool ?? undefined,
                };
              } else if (status === 'error') {
                yield {
                  type: 'tool_result',
                  id: part.id,
                  output: null,
                  error: state.error ?? 'tool error',
                  name: part.tool ?? undefined,
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

  async cancelSession(bynotSessionId: string): Promise<void> {
    if (this.isMock) return;
    const opencodeSessionId = sessionMap.get(bynotSessionId);
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
      return data.map((m: any) => ({ providerID: m.providerID ?? DEFAULT_PROVIDER, modelID: m.modelID ?? m.id }));
    }
    return [];
  }

  /** Pulisci mapping sessioni cache (es. quando una sessione viene cancellata). */
  forgetSession(bynotSessionId: string): void {
    sessionMap.delete(bynotSessionId);
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
