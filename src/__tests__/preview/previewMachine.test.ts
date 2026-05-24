import { describe, it, expect } from 'vitest';
import {
  previewReducer,
  INITIAL_PREVIEW_STATE,
} from '../../features/terminal/preview/previewMachine';
import type { PreviewState, PreviewEvent } from '../../features/terminal/preview/previewMachine.types';

function dispatch(state: PreviewState, event: PreviewEvent): PreviewState {
  return previewReducer(state, event);
}

describe('previewReducer', () => {
  it('initial state is idle', () => {
    expect(INITIAL_PREVIEW_STATE.phase).toBe('idle');
  });

  it('START_REQUESTED transitions idle -> starting', () => {
    const next = dispatch(INITIAL_PREVIEW_STATE, {
      type: 'START_REQUESTED',
      projectId: 'proj-1',
    });
    expect(next.phase).toBe('starting');
    expect(next.projectId).toBe('proj-1');
  });

  it('STARTUP_STEP updates step/progress/message while staying in starting', () => {
    const starting: PreviewState = {
      ...INITIAL_PREVIEW_STATE,
      phase: 'starting',
      projectId: 'proj-1',
    };
    const next = dispatch(starting, {
      type: 'STARTUP_STEP',
      step: 'installing',
      progress: 60,
      message: 'Installing dependencies...',
    });
    expect(next.phase).toBe('starting');
    expect(next.currentStep).toBe('installing');
    expect(next.progress).toBe(60);
    expect(next.displayedMessage).toBe('Installing dependencies...');
  });

  it('HEALTH_OK transitions starting -> loading_webview with url', () => {
    const starting: PreviewState = {
      ...INITIAL_PREVIEW_STATE,
      phase: 'starting',
      projectId: 'proj-1',
    };
    const next = dispatch(starting, {
      type: 'HEALTH_OK',
      url: 'https://proj-1.bynot.it',
    });
    expect(next.phase).toBe('loading_webview');
    expect(next.previewUrl).toBe('https://proj-1.bynot.it');
  });

  it('WEBVIEW_READY transitions loading_webview -> ready', () => {
    const loading: PreviewState = {
      ...INITIAL_PREVIEW_STATE,
      phase: 'loading_webview',
      previewUrl: 'https://proj-1.bynot.it',
    };
    const next = dispatch(loading, { type: 'WEBVIEW_READY' });
    expect(next.phase).toBe('ready');
    expect(next.webViewReady).toBe(true);
    expect(next.progress).toBe(100);
  });

  it('WEBVIEW_BUILD_ERROR transitions loading_webview -> fixing (first attempt)', () => {
    const loading: PreviewState = {
      ...INITIAL_PREVIEW_STATE,
      phase: 'loading_webview',
      autoFix: { active: false, attempt: 0, maxAttempts: 3, statusMessage: null },
    };
    const next = dispatch(loading, {
      type: 'WEBVIEW_BUILD_ERROR',
      message: 'Module not found',
    });
    expect(next.phase).toBe('fixing');
    expect(next.autoFix.active).toBe(true);
    expect(next.autoFix.attempt).toBe(1);
    expect(next.error?.kind).toBe('build_failure');
  });

  it('AUTOFIX_SUCCEEDED transitions fixing -> loading_webview', () => {
    const fixing: PreviewState = {
      ...INITIAL_PREVIEW_STATE,
      phase: 'fixing',
      error: { kind: 'build_failure', message: 'err', recoverable: true },
      autoFix: { active: true, attempt: 1, maxAttempts: 3, statusMessage: 'fixing...' },
    };
    const next = dispatch(fixing, { type: 'AUTOFIX_SUCCEEDED' });
    expect(next.phase).toBe('loading_webview');
    expect(next.error).toBeNull();
    expect(next.autoFix.active).toBe(false);
  });

  it('AUTOFIX_FAILED with max attempts -> fatal_error', () => {
    const fixing: PreviewState = {
      ...INITIAL_PREVIEW_STATE,
      phase: 'fixing',
      error: { kind: 'build_failure', message: 'err', recoverable: true },
      autoFix: { active: true, attempt: 3, maxAttempts: 3, statusMessage: 'fixing...' },
    };
    const next = dispatch(fixing, {
      type: 'AUTOFIX_FAILED',
      message: 'Could not fix',
    });
    expect(next.phase).toBe('fatal_error');
    expect(next.error?.recoverable).toBe(false);
  });

  it('SESSION_EXPIRED from any phase -> session_expired', () => {
    const ready: PreviewState = { ...INITIAL_PREVIEW_STATE, phase: 'ready' };
    const next = dispatch(ready, {
      type: 'SESSION_EXPIRED',
      message: 'Token expired',
    });
    expect(next.phase).toBe('session_expired');
    expect(next.sessionExpiredMessage).toBe('Token expired');
  });

  it('FATAL_ERROR from any phase -> fatal_error', () => {
    const starting: PreviewState = { ...INITIAL_PREVIEW_STATE, phase: 'starting' };
    const next = dispatch(starting, {
      type: 'FATAL_ERROR',
      error: { kind: 'unknown', message: 'boom', recoverable: false },
    });
    expect(next.phase).toBe('fatal_error');
    expect(next.error?.message).toBe('boom');
  });

  it('RETRY_REQUESTED from fatal_error -> starting', () => {
    const fatal: PreviewState = {
      ...INITIAL_PREVIEW_STATE,
      phase: 'fatal_error',
      projectId: 'proj-1',
      error: { kind: 'build_failure', message: 'err', recoverable: false },
    };
    const next = dispatch(fatal, { type: 'RETRY_REQUESTED' });
    expect(next.phase).toBe('starting');
    expect(next.projectId).toBe('proj-1');
  });

  it('STOP_REQUESTED from any phase -> idle', () => {
    const ready: PreviewState = {
      ...INITIAL_PREVIEW_STATE,
      phase: 'ready',
      viewportMode: 'desktop',
    };
    const next = dispatch(ready, { type: 'STOP_REQUESTED' });
    expect(next.phase).toBe('idle');
    expect(next.viewportMode).toBe('desktop'); // preserved
  });

  it('RESET returns to initial state', () => {
    const ready: PreviewState = {
      ...INITIAL_PREVIEW_STATE,
      phase: 'ready',
      projectId: 'proj-1',
      previewUrl: 'https://x.bynot.it',
    };
    const next = dispatch(ready, { type: 'RESET' });
    expect(next).toEqual(INITIAL_PREVIEW_STATE);
  });

  it('PREFLIGHT_ENV_MISSING transitions starting -> preflight_env with vars', () => {
    const starting: PreviewState = {
      ...INITIAL_PREVIEW_STATE,
      phase: 'starting',
    };
    const vars = [{ key: 'API_KEY', required: true }];
    const next = dispatch(starting, {
      type: 'PREFLIGHT_ENV_MISSING',
      vars,
    });
    expect(next.phase).toBe('preflight_env');
    expect(next.envVarsRequired).toEqual(vars);
  });
});
