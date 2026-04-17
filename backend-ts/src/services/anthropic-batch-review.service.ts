import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { log } from '../utils/logger';
import { fileService } from './file.service';
import { aiProviderService } from './ai-provider.service';
import { appendRuntimeAction } from './build-report.service';
import { calculateAIBatchCostEur } from './ai-pricing.service';
import { metricsService } from './metrics.service';

const REVIEW_FILE_PATH = '.drape/anthropic-batch-review.json';

type BatchReviewStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

interface BatchReviewRecord {
  projectId: string;
  status: BatchReviewStatus;
  batchId?: string;
  customId?: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  summary?: string;
  likelyRootCause?: string;
  nextFixes?: string[];
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  costEur?: number;
}

function getAnthropicBatchClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  return new Anthropic({ apiKey: config.anthropicApiKey });
}

async function readBatchReview(projectId: string): Promise<BatchReviewRecord | null> {
  try {
    const result = await fileService.readFile(projectId, REVIEW_FILE_PATH);
    if (!result.success || !result.data?.content) return null;
    return JSON.parse(result.data.content) as BatchReviewRecord;
  } catch {
    return null;
  }
}

async function writeBatchReview(projectId: string, record: BatchReviewRecord): Promise<void> {
  await fileService.writeFile(projectId, REVIEW_FILE_PATH, JSON.stringify(record, null, 2));
}

function extractMessageText(message: any): string {
  const content = Array.isArray(message?.content) ? message.content : [];
  return content
    .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
    .map((block: any) => block.text)
    .join('\n')
    .trim();
}

function parseBatchReviewResponse(text: string): Pick<BatchReviewRecord, 'summary' | 'likelyRootCause' | 'nextFixes'> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;

  try {
    const parsed = JSON.parse(objectMatch[0]);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      likelyRootCause: typeof parsed.likelyRootCause === 'string' ? parsed.likelyRootCause.trim() : '',
      nextFixes: Array.isArray(parsed.nextFixes)
        ? parsed.nextFixes.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 5)
        : [],
    };
  } catch {
    return null;
  }
}

async function buildFailureReviewPrompt(projectId: string): Promise<string> {
  const [buildReportResult, verificationReportResult] = await Promise.all([
    fileService.readFile(projectId, '.drape/build-report.json').catch(() => null),
    fileService.readFile(projectId, '.drape/verification-report.json').catch(() => null),
  ]);

  let buildSummary = '';
  let verificationSummary = '';

  try {
    const parsed = buildReportResult?.success && buildReportResult.data?.content
      ? JSON.parse(buildReportResult.data.content)
      : null;
    if (parsed?.summary) {
      buildSummary = JSON.stringify({
        technology: parsed.technology,
        complexity: parsed.summary.projectComplexity,
        generationCostEur: parsed.summary.aiGenerationCostEur,
        verifyCostEur: parsed.summary.aiVerifyCostEur,
        filesGenerated: parsed.summary.filesGenerated,
        generatedFiles: parsed.summary.generatedFiles?.slice?.(0, 12) || [],
        creationPrompt: parsed.summary.creationPrompt || '',
        creationAnswers: parsed.summary.creationAnswers || {},
      }, null, 2);
    }
  } catch {}

  try {
    const parsed = verificationReportResult?.success && verificationReportResult.data?.content
      ? JSON.parse(verificationReportResult.data.content)
      : null;
    const attempts = Array.isArray(parsed?.backendVerification?.attempts)
      ? parsed.backendVerification.attempts.slice(-2)
      : [];
    verificationSummary = JSON.stringify({
      status: parsed?.status || 'unknown',
      attempts: attempts.map((attempt: any) => ({
        errors: Array.isArray(attempt?.errors) ? attempt.errors.slice(0, 8) : [],
        fixes: attempt?.fixes || [],
        metadata: attempt?.metadata || {},
      })),
    }, null, 2);
  } catch {}

  return [
    'Analyze this failed app generation and produce a compact remediation brief.',
    'Return JSON only with this shape:',
    '{"summary":"...", "likelyRootCause":"...", "nextFixes":["...", "..."]}',
    'Rules:',
    '- Be specific and concise.',
    '- Focus only on the highest-value next fixes.',
    '- Do not mention tooling or token budgets.',
    '- nextFixes must be 1 to 5 concrete actions.',
    buildSummary ? `BUILD REPORT SUMMARY:\n${buildSummary}` : '',
    verificationSummary ? `VERIFICATION SUMMARY:\n${verificationSummary}` : '',
  ].filter(Boolean).join('\n\n');
}

export async function enqueueBatchFailureReview(projectId: string): Promise<BatchReviewRecord | null> {
  if (!config.projectBatchFailureReviewEnabled) return null;

  const client = getAnthropicBatchClient();
  if (!client) return null;

  const existing = await readBatchReview(projectId);
  if (existing && ['queued', 'in_progress', 'completed'].includes(existing.status)) {
    return existing;
  }

  const requestedModel = config.projectBatchFailureReviewModel;
  const resolvedModel = aiProviderService.getModelConfig(requestedModel)?.modelId || requestedModel;
  const customId = `failure-review-${projectId}-${Date.now()}`;
  const prompt = await buildFailureReviewPrompt(projectId);

  const batch = await client.beta.messages.batches.create({
    requests: [
      {
        custom_id: customId,
        params: {
          model: resolvedModel,
          max_tokens: config.projectBatchFailureReviewMaxTokens,
          messages: [{ role: 'user', content: prompt }],
          cache_control: {
            type: 'ephemeral',
            ...(config.projectOpusPromptCacheTtl === '1h' ? { ttl: '1h' } : {}),
          },
          ...(resolvedModel === 'claude-opus-4-7'
            ? {
                thinking: { type: 'adaptive' },
                output_config: { effort: 'medium' },
              }
            : {}),
        } as any,
      },
    ],
  });

  const record: BatchReviewRecord = {
    projectId,
    status: 'queued',
    batchId: batch.id,
    customId,
    model: requestedModel,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeBatchReview(projectId, record);
  await appendRuntimeAction(projectId, 'verify', 'Queued discounted async failure review', {
    status: 'running',
    details: `Queued Anthropic Batch API review via ${requestedModel}`,
    metadata: { batchId: batch.id, model: requestedModel },
  }).catch(() => {});
  return record;
}

export async function refreshBatchFailureReview(projectId: string): Promise<BatchReviewRecord | null> {
  const client = getAnthropicBatchClient();
  if (!client) return null;

  const existing = await readBatchReview(projectId);
  if (!existing?.batchId || existing.status === 'completed' || existing.status === 'failed') {
    return existing;
  }

  const batch = await client.beta.messages.batches.retrieve(existing.batchId);
  if (batch.processing_status !== 'ended') {
    const nextRecord: BatchReviewRecord = {
      ...existing,
      status: 'in_progress',
      updatedAt: new Date().toISOString(),
    };
    await writeBatchReview(projectId, nextRecord);
    return nextRecord;
  }

  let matchedResult: any = null;
  const decoder = await client.beta.messages.batches.results(existing.batchId);
  for await (const line of decoder as AsyncIterable<any>) {
    if (line?.custom_id === existing.customId) {
      matchedResult = line;
      break;
    }
  }

  if (!matchedResult || matchedResult.result?.type !== 'succeeded') {
    const failedRecord: BatchReviewRecord = {
      ...existing,
      status: 'failed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: matchedResult?.result?.error?.message || 'Batch review failed',
    };
    await writeBatchReview(projectId, failedRecord);
    await appendRuntimeAction(projectId, 'verify', 'Discounted async failure review failed', {
      status: 'failed',
      error: failedRecord.error,
      metadata: { batchId: existing.batchId, model: existing.model },
    }).catch(() => {});
    return failedRecord;
  }

  const message = matchedResult.result.message;
  const text = extractMessageText(message);
  const parsed = parseBatchReviewResponse(text);
  const usage = message?.usage || {};
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const cachedTokens = Number(usage.cache_read_input_tokens || 0);
  const costEur = calculateAIBatchCostEur(existing.model, inputTokens, outputTokens, cachedTokens);

  const completedRecord: BatchReviewRecord = {
    ...existing,
    status: 'completed',
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    summary: parsed?.summary || text.slice(0, 280),
    likelyRootCause: parsed?.likelyRootCause || '',
    nextFixes: parsed?.nextFixes || [],
    inputTokens,
    outputTokens,
    costEur,
  };

  await writeBatchReview(projectId, completedRecord);
  metricsService.trackAIUsage({
    userId: 'batch-review',
    projectId,
    phase: 'other',
    model: existing.model,
    inputTokens,
    outputTokens,
    cachedTokens,
    costEur,
  });
  await appendRuntimeAction(projectId, 'verify', 'Discounted async failure review completed', {
    status: 'completed',
    details: completedRecord.summary,
    metadata: {
      batchId: existing.batchId,
      model: existing.model,
      nextFixes: completedRecord.nextFixes,
      likelyRootCause: completedRecord.likelyRootCause,
      costEur,
    },
  }).catch(() => {});
  return completedRecord;
}
