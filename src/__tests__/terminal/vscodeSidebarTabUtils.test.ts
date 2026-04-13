import { describe, expect, it, vi } from 'vitest';
import { getSidebarPreviewPath, openOrCreateSidebarTab } from '../../features/terminal/components/vscodeSidebarTabUtils';

describe('vscodeSidebarTabUtils', () => {
  it('opens an existing tab instead of creating a duplicate', () => {
    const setActiveTab = vi.fn();
    const addTab = vi.fn();

    openOrCreateSidebarTab({
      tabs: [{ id: 'preview', type: 'preview', title: 'Preview', data: {} } as any],
      setActiveTab,
      addTab,
      id: 'preview',
      type: 'preview',
      title: 'Preview',
    });

    expect(setActiveTab).toHaveBeenCalledWith('preview');
    expect(addTab).not.toHaveBeenCalled();
  });

  it('creates a tab when it does not exist', () => {
    const setActiveTab = vi.fn();
    const addTab = vi.fn();

    openOrCreateSidebarTab({
      tabs: [],
      setActiveTab,
      addTab,
      id: 'shell',
      type: 'shell' as any,
      title: 'Logs',
    });

    expect(addTab).toHaveBeenCalledWith({
      id: 'shell',
      type: 'shell',
      title: 'Logs',
      data: {},
    });
  });

  it('extracts the project-relative preview path', () => {
    expect(getSidebarPreviewPath('https://example.com/preview/project-1/dashboard')).toBe('/dashboard');
    expect(getSidebarPreviewPath('https://example.com/preview/project-1', '/last')).toBe('/last');
  });
});
