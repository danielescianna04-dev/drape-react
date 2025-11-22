# Migration Guide: Converting to New Architecture

This guide shows step-by-step how to migrate existing code to the new architecture patterns.

## Table of Contents
1. [Converting API Calls to React Query](#converting-api-calls)
2. [Splitting Large Stores](#splitting-large-stores)
3. [Extracting Business Logic to Hooks](#extracting-to-hooks)
4. [Writing Tests](#writing-tests)

---

## Converting API Calls to React Query

### Example: Workstation Management

#### Before (Direct axios in component)
```typescript
// ❌ Old Pattern
import { useState, useEffect } from 'react';
import axios from 'axios';

function WorkstationList() {
  const [workstations, setWorkstations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchWorkstations = async () => {
      setLoading(true);
      try {
        const response = await axios.get('http://192.168.1.18:3000/workstation');
        setWorkstations(response.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkstations();
  }, []);

  const handleCreate = async (name: string) => {
    try {
      await axios.post('http://192.168.1.18:3000/workstation', { name });
      // Manually refetch
      const response = await axios.get('http://192.168.1.18:3000/workstation');
      setWorkstations(response.data);
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <Loading />;
  if (error) return <Error message={error} />;

  return (
    <View>
      {workstations.map(ws => <Item key={ws.id} data={ws} />)}
      <Button onPress={() => handleCreate('New')}>Create</Button>
    </View>
  );
}
```

#### After (React Query)

**Step 1: Create API Service**
```typescript
// services/api/workstationAPI.ts
import { apiService } from './APIService';

export interface Workstation {
  id: string;
  name: string;
  status: string;
}

export class WorkstationAPI {
  private static basePath = '/workstation';

  static async listWorkstations(): Promise<Workstation[]> {
    return apiService.get<Workstation[]>(`${this.basePath}`);
  }

  static async createWorkstation(name: string): Promise<Workstation> {
    return apiService.post<Workstation>(`${this.basePath}`, { name });
  }
}
```

**Step 2: Create React Query Hooks**
```typescript
// hooks/api/useWorkstations.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkstationAPI } from '@/services/api/workstationAPI';

export const workstationKeys = {
  all: ['workstations'] as const,
  list: () => [...workstationKeys.all, 'list'] as const,
};

export const useWorkstations = () => {
  return useQuery({
    queryKey: workstationKeys.list(),
    queryFn: () => WorkstationAPI.listWorkstations(),
  });
};

export const useCreateWorkstation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => WorkstationAPI.createWorkstation(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workstationKeys.list() });
    },
  });
};
```

**Step 3: Use in Component**
```typescript
// ✅ New Pattern
import { useWorkstations, useCreateWorkstation } from '@/hooks/api/useWorkstations';

function WorkstationList() {
  const { data: workstations, isLoading, error } = useWorkstations();
  const createMutation = useCreateWorkstation();

  const handleCreate = async (name: string) => {
    try {
      await createMutation.mutateAsync(name);
    } catch (err) {
      alert(err.message);
    }
  };

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return (
    <View>
      {workstations.map(ws => <Item key={ws.id} data={ws} />)}
      <Button
        onPress={() => handleCreate('New')}
        disabled={createMutation.isPending}
      >
        {createMutation.isPending ? 'Creating...' : 'Create'}
      </Button>
    </View>
  );
}
```

**Benefits:**
- ✅ No manual loading/error state management
- ✅ Automatic caching and refetching
- ✅ No useEffect needed
- ✅ Mutation loading state built-in
- ✅ Base URL centralized in `apiService`

---

## Converting Store-Based API Calls

### Example: Chat History

#### Before (Zustand with API calls)
```typescript
// ❌ Old Pattern
import create from 'zustand';
import axios from 'axios';

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

const useChatStore = create((set, get) => ({
  chats: [] as Chat[],
  isLoading: false,
  error: null,

  fetchChats: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.get('/api/chats');
      set({ chats: response.data, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
    }
  },

  createChat: async (title: string) => {
    try {
      const response = await axios.post('/api/chats', { title });
      set({ chats: [...get().chats, response.data] });
    } catch (error) {
      set({ error: error.message });
    }
  },

  deleteChat: async (id: string) => {
    try {
      await axios.delete(`/api/chats/${id}`);
      set({ chats: get().chats.filter(c => c.id !== id) });
    } catch (error) {
      set({ error: error.message });
    }
  },
}));

// Component usage
function ChatList() {
  const { chats, isLoading, fetchChats } = useChatStore();

  useEffect(() => {
    fetchChats();
  }, []);

  return <View>{/* ... */}</View>;
}
```

#### After (Split: React Query + Zustand)

**Step 1: Create API Service**
```typescript
// services/api/chatAPI.ts
import { apiService } from './APIService';

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

export class ChatAPI {
  private static basePath = '/api/chats';

  static async listChats(): Promise<Chat[]> {
    return apiService.get<Chat[]>(this.basePath);
  }

  static async createChat(title: string): Promise<Chat> {
    return apiService.post<Chat>(this.basePath, { title });
  }

  static async deleteChat(id: string): Promise<void> {
    return apiService.delete(`${this.basePath}/${id}`);
  }
}
```

**Step 2: Create React Query Hooks**
```typescript
// hooks/api/useChats.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChatAPI } from '@/services/api/chatAPI';

const chatKeys = {
  all: ['chats'] as const,
  list: () => [...chatKeys.all, 'list'] as const,
};

export const useChats = () => {
  return useQuery({
    queryKey: chatKeys.list(),
    queryFn: () => ChatAPI.listChats(),
  });
};

export const useCreateChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title: string) => ChatAPI.createChat(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
};

export const useDeleteChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ChatAPI.deleteChat(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
};
```

**Step 3: Zustand for UI State Only**
```typescript
// ✅ New Pattern - UI state only
import create from 'zustand';

interface ChatUIStore {
  activeChatId: string | null;
  sidebarOpen: boolean;
  setActiveChatId: (id: string | null) => void;
  toggleSidebar: () => void;
}

export const useChatUIStore = create<ChatUIStore>((set) => ({
  activeChatId: null,
  sidebarOpen: true,
  setActiveChatId: (id) => set({ activeChatId: id }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
```

**Step 4: Component Usage**
```typescript
// ✅ New Pattern
import { useChats, useCreateChat, useDeleteChat } from '@/hooks/api/useChats';
import { useChatUIStore } from '@/stores/chatUIStore';

function ChatList() {
  // Server state from React Query
  const { data: chats, isLoading } = useChats();
  const createMutation = useCreateChat();
  const deleteMutation = useDeleteChat();

  // UI state from Zustand
  const { activeChatId, setActiveChatId } = useChatUIStore();

  const handleCreate = async () => {
    const newChat = await createMutation.mutateAsync('New Chat');
    setActiveChatId(newChat.id);
  };

  if (isLoading) return <Loading />;

  return (
    <View>
      {chats.map(chat => (
        <ChatItem
          key={chat.id}
          chat={chat}
          isActive={chat.id === activeChatId}
          onPress={() => setActiveChatId(chat.id)}
          onDelete={() => deleteMutation.mutate(chat.id)}
        />
      ))}
      <Button onPress={handleCreate}>New Chat</Button>
    </View>
  );
}
```

---

## Splitting Large Stores

### Example: Terminal Store (450+ lines)

#### Before (Monolithic Store)
```typescript
// ❌ Old Pattern - Everything in one store
const useTerminalStore = create((set, get) => ({
  // Terminal items
  terminalItems: [],
  addTerminalItem: (item) => {...},

  // Chat history
  chatHistory: [],
  loadChatHistory: async () => {...},

  // GitHub state
  githubRepos: [],
  fetchGithubRepos: async () => {...},

  // Workstation state
  workstations: [],
  currentWorkstation: null,
  fetchWorkstations: async () => {...},

  // UI state
  sidebarOpen: false,
  activeTab: null,
  // ... 30+ more actions
}));
```

#### After (Separate Stores)

**1. Terminal Items Store**
```typescript
// stores/terminalStore.ts
import create from 'zustand';

interface TerminalStore {
  items: TerminalItem[];
  addItem: (item: TerminalItem) => void;
  clearItems: () => void;
  removeItemsByType: (type: string) => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({
    items: [...state.items, item]
  })),
  clearItems: () => set({ items: [] }),
  removeItemsByType: (type) => set((state) => ({
    items: state.items.filter(item => item.type !== type)
  })),
}));
```

**2. UI State Store**
```typescript
// stores/uiStore.ts
import create from 'zustand';

interface UIStore {
  sidebarOpen: boolean;
  activeTabId: string | null;
  toggleSidebar: () => void;
  setActiveTab: (id: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  activeTabId: null,
  toggleSidebar: () => set((state) => ({
    sidebarOpen: !state.sidebarOpen
  })),
  setActiveTab: (id) => set({ activeTabId: id }),
}));
```

**3. Server Data via React Query**
```typescript
// No store needed - use React Query hooks
const { data: workstations } = useWorkstations();
const { data: githubRepos } = useGithubRepos();
const { data: chatHistory } = useChats();
```

---

## Extracting Business Logic to Hooks

### Example: Terminal Message Handling

#### Before (Logic in Component)
```typescript
// ❌ Old Pattern - Business logic in component
function Terminal() {
  const addTerminalItem = useTerminalStore((s) => s.addTerminalItem);
  const [input, setInput] = useState('');

  const handleSend = async () => {
    if (!input.trim()) return;

    // Business logic mixed in component
    addTerminalItem({
      type: 'user-input',
      content: input,
      timestamp: Date.now()
    });

    try {
      const response = await axios.post('/api/execute', { command: input });

      addTerminalItem({
        type: 'output',
        content: response.data.output,
        timestamp: Date.now()
      });
    } catch (error) {
      addTerminalItem({
        type: 'error',
        content: error.message,
        timestamp: Date.now()
      });
    }

    setInput('');
  };

  return (
    <View>
      <Input value={input} onChangeText={setInput} />
      <Button onPress={handleSend}>Send</Button>
    </View>
  );
}
```

#### After (Custom Hook)

**Step 1: Create Custom Hook**
```typescript
// hooks/useTerminalCommand.ts
import { useTerminalStore } from '@/stores/terminalStore';
import { useExecuteCommand } from '@/hooks/api/useWorkstations';

export const useTerminalCommand = () => {
  const addItem = useTerminalStore((s) => s.addItem);
  const executeMutation = useExecuteCommand();

  const sendCommand = async (command: string, workstationId: string) => {
    if (!command.trim()) return;

    // Add user input
    addItem({
      type: 'user-input',
      content: command,
      timestamp: Date.now()
    });

    try {
      const result = await executeMutation.mutateAsync({
        id: workstationId,
        command
      });

      addItem({
        type: 'output',
        content: result.output,
        timestamp: Date.now()
      });
    } catch (error) {
      addItem({
        type: 'error',
        content: error.message,
        timestamp: Date.now()
      });
    }
  };

  return {
    sendCommand,
    isExecuting: executeMutation.isPending,
  };
};
```

**Step 2: Use in Component**
```typescript
// ✅ New Pattern - Clean component
function Terminal({ workstationId }: { workstationId: string }) {
  const [input, setInput] = useState('');
  const { sendCommand, isExecuting } = useTerminalCommand();

  const handleSend = async () => {
    await sendCommand(input, workstationId);
    setInput('');
  };

  return (
    <View>
      <Input value={input} onChangeText={setInput} />
      <Button onPress={handleSend} disabled={isExecuting}>
        {isExecuting ? 'Executing...' : 'Send'}
      </Button>
    </View>
  );
}
```

**Benefits:**
- ✅ Component is UI-only
- ✅ Business logic is reusable and testable
- ✅ Easy to test in isolation

---

## Writing Tests

### Testing Custom Hooks

```typescript
// __tests__/hooks/useTerminalCommand.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTerminalCommand } from '@/hooks/useTerminalCommand';
import { useTerminalStore } from '@/stores/terminalStore';

describe('useTerminalCommand', () => {
  beforeEach(() => {
    useTerminalStore.setState({ items: [] });
  });

  it('should add user input to terminal', async () => {
    const { result } = renderHook(() => useTerminalCommand());

    act(() => {
      result.current.sendCommand('ls', 'ws-1');
    });

    const items = useTerminalStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('user-input');
    expect(items[0].content).toBe('ls');
  });

  it('should add output after successful execution', async () => {
    // Mock API response
    vi.mock('@/hooks/api/useWorkstations', () => ({
      useExecuteCommand: () => ({
        mutateAsync: vi.fn().mockResolvedValue({ output: 'file1.txt' }),
        isPending: false,
      }),
    }));

    const { result } = renderHook(() => useTerminalCommand());

    await act(async () => {
      await result.current.sendCommand('ls', 'ws-1');
    });

    const items = useTerminalStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items[1].type).toBe('output');
    expect(items[1].content).toBe('file1.txt');
  });
});
```

### Testing React Query Hooks

```typescript
// __tests__/hooks/api/useWorkstations.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWorkstations } from '@/hooks/api/useWorkstations';
import { WorkstationAPI } from '@/services/api/workstationAPI';

// Create wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useWorkstations', () => {
  it('should fetch workstations', async () => {
    // Mock API
    const mockWorkstations = [
      { id: 'ws-1', name: 'Test WS', status: 'running' }
    ];
    vi.spyOn(WorkstationAPI, 'listWorkstations').mockResolvedValue(mockWorkstations);

    const { result } = renderHook(() => useWorkstations(), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for data
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockWorkstations);
  });
});
```

---

## Checklist for Migration

### For Each API Endpoint:
- [ ] Create API service class method
- [ ] Create React Query hook (useQuery or useMutation)
- [ ] Define query keys
- [ ] Replace component logic
- [ ] Remove from Zustand store
- [ ] Write tests

### For Each Store:
- [ ] Identify server state → Move to React Query
- [ ] Identify UI state → Keep in Zustand
- [ ] Split large stores into focused stores
- [ ] Extract business logic to custom hooks
- [ ] Write tests

### General:
- [ ] Wrap app with `ReactQueryProvider`
- [ ] Set API base URL at startup
- [ ] Update components to use new hooks
- [ ] Remove old API code
- [ ] Update tests

---

## Common Pitfalls

### 1. Don't Mix Server and Client State
```typescript
// ❌ Bad
const store = create((set) => ({
  workstations: [],        // Server state
  activeWorkstationId: '', // UI state
}));

// ✅ Good
const { data: workstations } = useWorkstations(); // Server state
const { activeId } = useUIStore();                // UI state
```

### 2. Don't Store Derived Data
```typescript
// ❌ Bad - storing filtered data
const store = create((set) => ({
  workstations: [],
  runningWorkstations: [],
  fetchWorkstations: async () => {
    const data = await api.get('/workstations');
    set({
      workstations: data,
      runningWorkstations: data.filter(w => w.status === 'running')
    });
  },
}));

// ✅ Good - compute on demand
const { data: workstations } = useWorkstations();
const runningWorkstations = workstations?.filter(w => w.status === 'running');
```

### 3. Don't Forget Query Keys
```typescript
// ❌ Bad - inline query keys
useQuery({ queryKey: ['workstations'], ... });
useQuery({ queryKey: ['workstation', id], ... });

// ✅ Good - centralized query keys
const workstationKeys = {
  all: ['workstations'] as const,
  list: () => [...workstationKeys.all, 'list'] as const,
  detail: (id: string) => [...workstationKeys.all, 'detail', id] as const,
};

useQuery({ queryKey: workstationKeys.list(), ... });
useQuery({ queryKey: workstationKeys.detail(id), ... });
```

---

## Next Steps

1. Start with one feature at a time
2. Migrate high-traffic endpoints first
3. Keep old code working during migration
4. Add tests as you migrate
5. Update documentation

For questions or help, refer to [ARCHITECTURE.md](./ARCHITECTURE.md).
