import { describe, it, expect } from 'vitest';
import {
  classifyPreviewError,
  isTransientPreviewError,
  isRecoverableError,
} from '../../features/terminal/preview/errors/previewErrorClassifier';

describe('classifyPreviewError', () => {
  it('classifies "process.env.NEXT_PUBLIC_API" as missing_env', () => {
    const err = classifyPreviewError(
      'process.env.NEXT_PUBLIC_API is not defined',
      'webview',
    );
    expect(err.kind).toBe('missing_env');
  });

  it('classifies "Module not found" as build_failure', () => {
    const err = classifyPreviewError('Module not found: react-dom', 'webview');
    expect(err.kind).toBe('build_failure');
  });

  it('classifies "Uncaught TypeError" as runtime_failure', () => {
    const err = classifyPreviewError(
      'Uncaught TypeError: Cannot read properties of undefined',
      'webview',
    );
    expect(err.kind).toBe('runtime_failure');
  });

  it('classifies "Connection refused" as server_unreachable', () => {
    const err = classifyPreviewError('Connection refused on port 3000', 'health');
    expect(err.kind).toBe('server_unreachable');
  });

  it('classifies "403 Forbidden" as session_expired', () => {
    const err = classifyPreviewError('403 Forbidden', 'health');
    expect(err.kind).toBe('session_expired');
  });

  it('classifies "token expired" as session_expired', () => {
    const err = classifyPreviewError('token expired please re-auth', 'health');
    expect(err.kind).toBe('session_expired');
  });

  it('classifies "Authentication required" / missing token as missing_token', () => {
    const err = classifyPreviewError('Preview access token required', 'health');
    expect(err.kind).toBe('missing_token');
  });

  it('classifies "Endpoint not found" as transient_proxy', () => {
    const err = classifyPreviewError('Endpoint not found', 'health');
    expect(err.kind).toBe('transient_proxy');
  });
});

describe('isTransientPreviewError', () => {
  it('returns true for proxy errors', () => {
    expect(isTransientPreviewError('Endpoint not found')).toBe(true);
    expect(isTransientPreviewError('429 Too many requests')).toBe(true);
  });

  it('returns false for non-proxy errors', () => {
    expect(isTransientPreviewError('Module not found')).toBe(false);
  });
});

describe('isRecoverableError', () => {
  it('returns true for build_failure (recoverable)', () => {
    expect(
      isRecoverableError({ kind: 'build_failure', message: 'err', recoverable: true }),
    ).toBe(true);
  });

  it('returns false for session_expired (not recoverable)', () => {
    expect(
      isRecoverableError({ kind: 'session_expired', message: 'err', recoverable: false }),
    ).toBe(false);
  });
});
