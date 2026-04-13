/**
 * usePreviewPreflight — env vars check before starting preview.
 * Detects missing variables, opens env vars tab when needed,
 * normalizes env-related errors.
 */
import { useState, useRef } from 'react';
import i18next from 'i18next';
import { getAuthHeaders } from '../../../../core/api/getAuthToken';
import { useTabStore } from '../../../../core/tabs/tabStore';
import { useUIStore } from '../../../../core/terminal/uiStore';
import {
  extractMissingEnvVars as centralExtractMissingEnvVars,
  isEnvRelatedError as centralIsEnvRelatedError,
  extractStartupErrorFromBody as centralExtractStartupErrorKind,
} from '../errors';

// ── Types ────────────────────────────────────────────────────

export interface PreviewPreflightParams {
  apiUrl: string;
  currentWorkstationId: string | undefined;
  onClose: () => void;
  t: (key: string, opts?: any) => string;
  /** Callback from startup hook to clear transition animation */
  clearStartTransition: () => void;
}

export interface PreviewPreflightReturn {
  requiredEnvVars: Array<{ key: string; defaultValue: string; description: string; required: boolean }> | null;
  setRequiredEnvVars: React.Dispatch<React.SetStateAction<Array<{ key: string; defaultValue: string; description: string; required: boolean }> | null>>;
  envVarValues: Record<string, string>;
  setEnvVarValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  isSavingEnv: boolean;
  skipEnvErrorRedirectRef: React.MutableRefObject<boolean>;
  preflightEnvCheck: () => Promise<boolean>;
  handleSaveEnvVars: (handleStartServer: () => Promise<void>) => Promise<void>;
  extractMissingEnvVars: (input: string) => string[];
  applyMissingEnvVarsFromMessage: (message: string) => boolean;
  extractStartupErrorFromBody: (bodyText: string) => string | null;
  isEnvRelatedError: (msg: string) => boolean;
  redirectToEnvVarsWithError: (errorMessage: string) => void;
  checkAndSetSkipPreflight: () => boolean;
}

export function usePreviewPreflight({
  apiUrl,
  currentWorkstationId,
  onClose,
  t,
  clearStartTransition,
}: PreviewPreflightParams): PreviewPreflightReturn {

  const [requiredEnvVars, setRequiredEnvVars] = useState<Array<{
    key: string; defaultValue: string; description: string; required: boolean;
  }> | null>(null);
  const [envVarValues, setEnvVarValues] = useState<Record<string, string>>({});
  const [isSavingEnv, setIsSavingEnv] = useState(false);

  // When "Start Anyway" is used, skip env error redirects for this session
  const skipEnvErrorRedirectRef = useRef(false);

  // ── Extraction helpers ───────────────────────────────────────

  const extractMissingEnvVars = centralExtractMissingEnvVars;

  const applyMissingEnvVarsFromMessage = (message: string): boolean => {
    const missing = extractMissingEnvVars(message);
    if (missing.length === 0) return false;
    setRequiredEnvVars(
      missing.map((key) => ({ key, defaultValue: '', description: '', required: true })),
    );
    setEnvVarValues((prev) => {
      const next = { ...prev };
      for (const key of missing) {
        if (next[key] === undefined) next[key] = '';
      }
      return next;
    });
    return true;
  };

  const extractStartupErrorFromBody = (bodyText: string): string | null => {
    if (!bodyText) return null;
    const kind = centralExtractStartupErrorKind(bodyText);
    if (!kind) return null;
    if (kind === 'missing_env') {
      const vars = extractMissingEnvVars(bodyText);
      if (vars.length > 0) {
        return i18next.t('terminal:preview.missingEnvVarsWithList', { vars: vars.map(v => `\u2022 ${v}`).join('\n') });
      }
      return i18next.t('terminal:preview.missingEnvVars');
    }
    if (kind === 'build_failure') {
      const lower = bodyText.toLowerCase();
      if (lower.includes('cannot find module') || lower.includes('module_not_found')) {
        return i18next.t('terminal:preview.moduleNotFound');
      }
      return i18next.t('terminal:preview.compileError');
    }
    return null;
  };

  const isEnvRelatedError = centralIsEnvRelatedError;

  const redirectToEnvVarsWithError = (errorMessage: string) => {
    if (skipEnvErrorRedirectRef.current) return;
    onClose();
    clearStartTransition();
    const existingEnvTab = useTabStore.getState().tabs.find((tab) => tab.id === 'env-vars');
    const existingMissingVars = existingEnvTab?.data?.missingVars;
    useTabStore.getState().addTab({
      id: 'env-vars',
      type: 'envVars' as any,
      title: 'Environment Variables',
      data: {
        runtimeError: errorMessage,
        fromPreview: true,
        ...(existingMissingVars ? { missingVars: existingMissingVars } : {}),
      },
    });
  };

  // ── Pre-flight check ─────────────────────────────────────────

  const preflightEnvCheck = async (): Promise<boolean> => {
    if (!currentWorkstationId) return true;
    try {
      const authHeaders = await getAuthHeaders();
      const [analyzeRes, envRes] = await Promise.all([
        fetch(`${apiUrl}/fly/project/${currentWorkstationId}/env/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
        }),
        fetch(`${apiUrl}/fly/project/${currentWorkstationId}/env`, {
          headers: authHeaders,
        }),
      ]);
      if (!analyzeRes.ok) return true;
      const analyzeData = await analyzeRes.json();
      const required: Array<{ key: string; value?: string }> = analyzeData.variables || [];
      if (required.length === 0) return true;

      const envData = envRes.ok ? await envRes.json() : { variables: [] };
      const existing = new Set((envData.variables || []).map((v: any) => v.key));
      const missing = required.filter((v) => !existing.has(v.key));
      if (missing.length === 0) return true;

      onClose();
      useTabStore.getState().addTab({
        id: 'env-vars',
        type: 'envVars' as any,
        title: 'Environment Variables',
        data: {
          missingVars: missing.map((v) => ({ key: v.key, value: v.value || '' })),
          fromPreview: true,
        },
      });
      return false;
    } catch {
      return true;
    }
  };

  // ── Skip preflight check ─────────────────────────────────────

  /** Returns true if preflight should be skipped ("Start Anyway" flow) */
  const checkAndSetSkipPreflight = (): boolean => {
    if (useUIStore.getState().skipNextPreflight) {
      useUIStore.getState().setSkipNextPreflight(false);
      skipEnvErrorRedirectRef.current = true;
      return true;
    }
    skipEnvErrorRedirectRef.current = false;
    return false;
  };

  // ── Save env vars and restart ────────────────────────────────

  const handleSaveEnvVars = async (handleStartServer: () => Promise<void>) => {
    if (!currentWorkstationId) return;
    setIsSavingEnv(true);
    try {
      const envAuthHeaders = await getAuthHeaders();
      const variables = Object.entries(envVarValues)
        .filter(([key]) => key.trim().length > 0)
        .map(([key, value]) => ({ key, value, isSecret: false }));

      const response = await fetch(`${apiUrl}/fly/project/${currentWorkstationId}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...envAuthHeaders },
        body: JSON.stringify({ variables }),
      });
      if (!response.ok) throw new Error(t('terminal:preview.saveError'));
      setRequiredEnvVars(null);
      setEnvVarValues({});
      handleStartServer();
    } catch (_error: any) {
      // error logged by caller
    } finally {
      setIsSavingEnv(false);
    }
  };

  return {
    requiredEnvVars,
    setRequiredEnvVars,
    envVarValues,
    setEnvVarValues,
    isSavingEnv,
    skipEnvErrorRedirectRef,
    preflightEnvCheck,
    handleSaveEnvVars,
    extractMissingEnvVars,
    applyMissingEnvVarsFromMessage,
    extractStartupErrorFromBody,
    isEnvRelatedError,
    redirectToEnvVarsWithError,
    checkAndSetSkipPreflight,
  };
}
