/**
 * usePreviewSession — manages per-project preview identity:
 * preview URL, access token, machine ID, and persistence through uiStore.
 */
import { useState, useRef, useMemo, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────

export interface PreviewSessionParams {
  projectId: string | undefined;
  previewUrl: string;
  globalServerUrl: string | null;
  globalFlyMachineId: string | null;
  projectMachineIds: Record<string, string>;
  projectPreviewUrls: Record<string, string>;
  projectPreviewTokens: Record<string, string>;
  setPreviewServerUrl: (url: string | null, projectId?: string) => void;
  setPreviewAccessToken: (token: string | null, projectId?: string) => void;
  setGlobalFlyMachineId: (id: string | null, projectId?: string) => void;
  clearProjectPreviewSession: (projectId: string) => void;
  currentWorkstationId: string | undefined;
}

export interface PreviewSessionReturn {
  currentPreviewUrl: string;
  setCurrentPreviewUrl: (url: string) => void;
  setCurrentPreviewUrlLocal: React.Dispatch<React.SetStateAction<string>>;
  previewAccessToken: string | null;
  updatePreviewAccessToken: (token: string | null, targetProjectId?: string) => void;
  previewAccessTokenRef: React.MutableRefObject<string | null>;
  effectivePreviewAccessToken: string | null;
  flyMachineIdRef: React.MutableRefObject<string | null>;
  withPreviewToken: (url: string, tokenOverride?: string | null) => string;
  getInitialPreviewUrl: () => string;
  clearPendingRelease: (targetProjectId?: string | null) => void;
}

// Module-level timers for pending releases (survives re-renders)
const pendingReleaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function usePreviewSession({
  projectId,
  previewUrl,
  globalServerUrl,
  globalFlyMachineId,
  projectMachineIds,
  projectPreviewUrls,
  projectPreviewTokens,
  setPreviewServerUrl,
  setPreviewAccessToken,
  setGlobalFlyMachineId,
  clearProjectPreviewSession,
  currentWorkstationId,
}: PreviewSessionParams): PreviewSessionReturn {

  // ---- Access token ----
  const [previewAccessTokenState, setPreviewAccessTokenLocal] = useState<string | null>(
    projectId ? (projectPreviewTokens[projectId] || null) : null,
  );
  const previewAccessTokenRef = useRef<string | null>(
    projectId ? (projectPreviewTokens[projectId] || null) : null,
  );

  // ---- Machine ID ----
  const flyMachineIdRef = useRef<string | null>(globalFlyMachineId);

  // ---- Token helper ----
  const withPreviewToken = (url: string, tokenOverride?: string | null): string => {
    if (!url) return url;
    const token = tokenOverride ?? previewAccessTokenRef.current;
    if (!token) return url;
    try {
      const parsed = new URL(url);
      const isSubdomainPreview =
        parsed.hostname.endsWith('.bynot.it') &&
        !['www.bynot.it', 'dev.bynot.it', 'api.bynot.it', 'bynot.it'].includes(parsed.hostname);
      const isPathPreview = parsed.pathname.startsWith('/preview/');
      if (!isSubdomainPreview && !isPathPreview) return url;
      if (isPathPreview && parsed.pathname.match(/^\/preview\/[^/]+$/)) {
        parsed.pathname += '/';
      }
      parsed.searchParams.set('pt', token);
      return parsed.toString();
    } catch {
      return url;
    }
  };

  // ---- URL helpers ----
  const getInitialPreviewUrl = (): string => {
    const projectSpecificUrl = projectId ? projectPreviewUrls[projectId] : null;
    const globalBelongsToProject =
      globalServerUrl &&
      projectId &&
      (globalServerUrl.includes(`/preview/${projectId}`) || globalServerUrl.includes(`${projectId}.bynot.it`));
    let url = projectSpecificUrl || (globalBelongsToProject ? globalServerUrl : null) || previewUrl || '';
    if (!url.includes('localhost:3000') && url) {
      try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/^\/preview\/([^/]+)/);
        if (match) {
          const projId = match[1];
          url = `https://${projId}.bynot.it/`;
        } else if (projectId && (parsed.hostname === 'bynot.it' || parsed.hostname === 'dev.bynot.it')) {
          url = `https://${projectId}.bynot.it/`;
        }
      } catch {}
    }
    return url;
  };

  // ---- Current URL state ----
  const [currentPreviewUrl, setCurrentPreviewUrlLocal] = useState(getInitialPreviewUrl());

  const setCurrentPreviewUrl = (url: string) => {
    const secured = withPreviewToken(url);
    setCurrentPreviewUrlLocal(secured);
    setPreviewServerUrl(secured, currentWorkstationId);
  };

  // ---- Token update (also re-secures current URL) ----
  const updatePreviewAccessToken = (token: string | null, targetProjectId?: string) => {
    const pid = targetProjectId || currentWorkstationId;
    setPreviewAccessTokenLocal(token);
    previewAccessTokenRef.current = token;
    setPreviewAccessToken(token, pid);
    if (currentPreviewUrl) {
      const secured = withPreviewToken(currentPreviewUrl, token);
      setCurrentPreviewUrlLocal(secured);
      setPreviewServerUrl(secured, pid);
    }
  };

  // ---- Effective token (state OR from URL query) ----
  const previewTokenFromUrl = useMemo(() => {
    if (!currentPreviewUrl) return null;
    try {
      return new URL(currentPreviewUrl).searchParams.get('pt');
    } catch {
      return null;
    }
  }, [currentPreviewUrl]);
  const effectivePreviewAccessToken = previewAccessTokenState || previewTokenFromUrl;

  // ---- Pending release timers ----
  const clearPendingRelease = (targetProjectId?: string | null) => {
    if (!targetProjectId) return;
    const timer = pendingReleaseTimers.get(targetProjectId);
    if (timer) {
      clearTimeout(timer);
      pendingReleaseTimers.delete(targetProjectId);
    }
  };

  // ---- Sync token when project / tokens change ----
  useEffect(() => {
    const token = projectId ? (projectPreviewTokens[projectId] || null) : null;
    setPreviewAccessTokenLocal(token);
    previewAccessTokenRef.current = token;
  }, [projectId, projectPreviewTokens]);

  return {
    currentPreviewUrl,
    setCurrentPreviewUrl,
    setCurrentPreviewUrlLocal,
    previewAccessToken: previewAccessTokenState,
    updatePreviewAccessToken,
    previewAccessTokenRef,
    effectivePreviewAccessToken,
    flyMachineIdRef,
    withPreviewToken,
    getInitialPreviewUrl,
    clearPendingRelease,
  };
}
