import { describe, it, expect } from 'vitest';
import {
  shouldAutoFix,
  getRecoveryAction,
  getFatalErrorCTAs,
} from '../../features/terminal/preview/previewRecoveryPolicy';
import type { PreviewError } from '../../features/terminal/preview/previewMachine.types';

const buildError = (kind: PreviewError['kind'], recoverable = true): PreviewError => ({
  kind,
  message: 'test error',
  recoverable,
});

describe('shouldAutoFix', () => {
  it('returns true for build_failure attempt 0', () => {
    expect(shouldAutoFix(buildError('build_failure'), 0)).toBe(true);
  });

  it('returns false for build_failure attempt 3 (max)', () => {
    expect(shouldAutoFix(buildError('build_failure'), 3)).toBe(false);
  });

  it('returns false for missing_env (always)', () => {
    expect(shouldAutoFix(buildError('missing_env'), 0)).toBe(false);
  });
});

describe('getRecoveryAction', () => {
  it('returns autofix for recoverable build errors', () => {
    expect(getRecoveryAction(buildError('build_failure', true))).toBe('autofix');
  });

  it('returns show_env for missing env', () => {
    expect(getRecoveryAction(buildError('missing_env'))).toBe('show_env');
  });

  it('returns retry for session_expired', () => {
    expect(getRecoveryAction(buildError('session_expired', false))).toBe('retry');
  });
});

describe('getFatalErrorCTAs', () => {
  it('includes env button for missing_env errors', () => {
    const ctas = getFatalErrorCTAs(buildError('missing_env'));
    expect(ctas.some((c) => c.action === 'open_env')).toBe(true);
  });

  it('includes send_to_chat for build_failure', () => {
    const ctas = getFatalErrorCTAs(buildError('build_failure'));
    expect(ctas.some((c) => c.action === 'send_to_chat')).toBe(true);
  });

  it('includes restart for session_expired', () => {
    const ctas = getFatalErrorCTAs(buildError('session_expired'));
    expect(ctas.some((c) => c.action === 'restart')).toBe(true);
  });
});
