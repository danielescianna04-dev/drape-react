import { describe, expect, it } from 'vitest';
import { derivePreviewPhase } from '../../features/terminal/preview/derivePreviewPhase';

describe('derivePreviewPhase', () => {
  it('prioritizes session expired over other states', () => {
    expect(derivePreviewPhase({
      sessionExpired: true,
      serverStatus: 'running',
      hasRequiredEnvVars: false,
      hasPreviewError: false,
      isFixing: false,
      previewCapability: 'web',
      webViewReady: true,
    })).toBe('session_expired');
  });

  it('returns fixing and fatal error phases for stopped previews with errors', () => {
    expect(derivePreviewPhase({
      sessionExpired: false,
      serverStatus: 'stopped',
      hasRequiredEnvVars: false,
      hasPreviewError: true,
      isFixing: true,
      previewCapability: 'web',
      webViewReady: false,
    })).toBe('fixing');

    expect(derivePreviewPhase({
      sessionExpired: false,
      serverStatus: 'stopped',
      hasRequiredEnvVars: false,
      hasPreviewError: true,
      isFixing: false,
      previewCapability: 'web',
      webViewReady: false,
    })).toBe('fatal_error');
  });

  it('treats running console previews and ready webviews as ready', () => {
    expect(derivePreviewPhase({
      sessionExpired: false,
      serverStatus: 'running',
      hasRequiredEnvVars: false,
      hasPreviewError: false,
      isFixing: false,
      previewCapability: 'console',
      webViewReady: false,
    })).toBe('ready');

    expect(derivePreviewPhase({
      sessionExpired: false,
      serverStatus: 'running',
      hasRequiredEnvVars: false,
      hasPreviewError: false,
      isFixing: false,
      previewCapability: 'web',
      webViewReady: true,
    })).toBe('ready');
  });
});
