import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../core/terminal/uiStore';

describe('uiStore transient requests', () => {
  beforeEach(() => {
    useUIStore.setState({
      openPreviewRequested: false,
      openPreviewRequestId: 0,
      openGitSheetRequested: false,
      openGitSheetRequestId: 0,
      openGitSheetTab: null,
      openEnvVarsRequested: false,
      openEnvVarsRequestId: 0,
    });
  });

  it('consumes preview requests only once', () => {
    const store = useUIStore.getState();
    store.requestOpenPreview();

    const firstId = useUIStore.getState().consumeOpenPreviewRequest(0);
    expect(firstId).toBe(1);
    expect(useUIStore.getState().openPreviewRequested).toBe(false);

    const secondId = useUIStore.getState().consumeOpenPreviewRequest(firstId);
    expect(secondId).toBe(firstId);
  });

  it('consumes git sheet and env vars requests independently', () => {
    const store = useUIStore.getState();
    store.requestOpenGitSheet('branches');
    store.requestOpenEnvVars();

    const gitRequestId = useUIStore.getState().consumeOpenGitSheetRequest(0);
    expect(gitRequestId).toBe(1);
    expect(useUIStore.getState().openGitSheetRequested).toBe(false);
    expect(useUIStore.getState().openGitSheetTab).toBe('branches');

    const envRequestId = useUIStore.getState().consumeOpenEnvVarsRequest(0);
    expect(envRequestId).toBe(1);
    expect(useUIStore.getState().openEnvVarsRequested).toBe(false);
  });
});
