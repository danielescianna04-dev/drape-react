import type { PreviewPhase } from './types';

type PreviewServerStatus = 'checking' | 'running' | 'stopped';

interface DerivePreviewPhaseParams {
  sessionExpired: boolean;
  serverStatus: PreviewServerStatus;
  hasRequiredEnvVars: boolean;
  hasPreviewError: boolean;
  isFixing: boolean;
  previewCapability: 'web' | 'console' | 'unsupported';
  webViewReady: boolean;
}

export const derivePreviewPhase = ({
  sessionExpired,
  serverStatus,
  hasRequiredEnvVars,
  hasPreviewError,
  isFixing,
  previewCapability,
  webViewReady,
}: DerivePreviewPhaseParams): PreviewPhase => {
  if (sessionExpired) return 'session_expired';
  if (serverStatus === 'stopped' && hasRequiredEnvVars) return 'preflight_env';
  if (serverStatus === 'stopped' && hasPreviewError && isFixing) return 'fixing';
  if (serverStatus === 'stopped' && hasPreviewError) return 'fatal_error';
  if (serverStatus === 'checking') return 'starting';
  if (serverStatus === 'running' && previewCapability === 'console') return 'ready';
  if (serverStatus === 'running' && webViewReady) return 'ready';
  if (serverStatus === 'running') return 'loading_webview';
  return 'idle';
};
