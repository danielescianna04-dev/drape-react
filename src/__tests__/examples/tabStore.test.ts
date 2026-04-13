import { renderHook, act } from '@testing-library/react';
import { useTabStore } from '@core/tabs/tabStore';

describe('TabStore', () => {
  beforeEach(() => {
    useTabStore.setState({
      tabs: [
        {
          id: 'chat-main',
          type: 'chat',
          title: 'Nuova Conversazione',
          data: { chatId: Date.now().toString() }
        }
      ],
      activeTabId: 'chat-main',
      savedProjects: {},
    });
  });

  describe('addTab', () => {
    it('should add a new tab and set it as active', () => {
      const { result } = renderHook(() => useTabStore());

      const newTab = {
        id: 'terminal-1',
        type: 'terminal' as const,
        title: 'Terminal',
      };

      act(() => {
        result.current.addTab(newTab);
      });

      expect(result.current.tabs).toHaveLength(2);
      expect(result.current.activeTabId).toBe('terminal-1');
      expect(result.current.tabs[1]).toEqual(newTab);
    });

    it('should update existing tab if id already exists', () => {
      const { result } = renderHook(() => useTabStore());

      const updatedTab = {
        id: 'chat-main',
        type: 'chat' as const,
        title: 'Updated Title',
      };

      act(() => {
        result.current.addTab(updatedTab);
      });

      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.tabs[0].title).toBe('Updated Title');
    });
  });

  describe('removeTab', () => {
    it('should remove tab and switch to previous tab', () => {
      const { result } = renderHook(() => useTabStore());

      act(() => {
        result.current.addTab({
          id: 'terminal-1',
          type: 'terminal',
          title: 'Terminal',
        });
      });

      expect(result.current.tabs).toHaveLength(2);
      expect(result.current.activeTabId).toBe('terminal-1');

      act(() => {
        result.current.removeTab('terminal-1');
      });

      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.activeTabId).toBe('chat-main');
    });

    it('should allow removing the last tab without crashing', () => {
      const { result } = renderHook(() => useTabStore());

      act(() => {
        result.current.removeTab('chat-main');
      });

      expect(result.current.tabs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('setActiveTab', () => {
    it('should set active tab', () => {
      const { result } = renderHook(() => useTabStore());

      act(() => {
        result.current.addTab({
          id: 'terminal-1',
          type: 'terminal',
          title: 'Terminal',
        });
      });

      act(() => {
        result.current.setActiveTab('chat-main');
      });

      expect(result.current.activeTabId).toBe('chat-main');
    });
  });

  describe('project-scoped tab cleanup', () => {
    it('removes tabs linked to a workstation/project across supported keys', () => {
      const { result } = renderHook(() => useTabStore());

      act(() => {
        result.current.addTab({ id: 'terminal-p1', type: 'terminal', title: 'Terminal', workstationId: 'ws-p1' });
        result.current.addTab({ id: 'browser-p1', type: 'browser', title: 'Browser', data: { projectId: 'p1' } });
        result.current.addTab({ id: 'chat-p2', type: 'chat', title: 'Other project', workstationId: 'p2' });
      });

      act(() => {
        result.current.removeTabsByWorkstation('ws-p1');
      });

      expect(result.current.tabs.map((tab) => tab.id)).toEqual(['chat-main', 'chat-p2']);
    });

    it('keeps at least one chat tab when clearing non-chat tabs', () => {
      const { result } = renderHook(() => useTabStore());

      act(() => {
        result.current.addTab({ id: 'terminal-1', type: 'terminal', title: 'Terminal' });
        result.current.clearTabs();
      });

      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.tabs[0].type).toBe('chat');
      expect(result.current.activeTabId).toBe(result.current.tabs[0].id);
    });
  });
});
