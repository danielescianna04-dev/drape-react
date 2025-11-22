# Drape Architecture Documentation

## Overview

This document describes the architectural patterns and best practices for the Drape React Native application. The architecture follows a feature-based, layered approach with clear separation of concerns.

## Architecture Layers

```
src/
├── features/          # Feature modules (UI + business logic)
├── core/             # Core business logic and state
├── shared/           # Reusable components and utilities
├── services/         # External services (API, analytics, etc.)
├── hooks/            # Custom React hooks
├── providers/        # Context providers
└── types/            # TypeScript type definitions
```

## Phase 1: Foundation (COMPLETED)

### 1. Testing Infrastructure ✅

#### Setup
- **Test Runner**: Vitest with jsdom environment
- **Testing Library**: @testing-library/react + @testing-library/react-native
- **Coverage Target**: 70% (lines, functions, branches, statements)

#### Running Tests
```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
npm run test:ui       # Open Vitest UI
npm run test:coverage # Generate coverage report
```

#### Writing Tests
Tests should be colocated with the code they test or in `src/__tests__/`.

**Example: Store Test**
```typescript
import { renderHook, act } from '@testing-library/react';
import { useTabStore } from '@core/tabs/tabStore';

describe('TabStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useTabStore.setState({ tabs: [], activeTabId: null });
  });

  it('should add a new tab', () => {
    const { result } = renderHook(() => useTabStore());

    act(() => {
      result.current.addTab({ id: '1', type: 'chat', title: 'Test' });
    });

    expect(result.current.tabs).toHaveLength(1);
  });
});
```

**Note**: When using `globals: true` in vitest.config.ts, do NOT import `describe`, `it`, `expect` - they're available globally.

### 2. React Query Setup ✅

React Query (TanStack Query) manages all server state, replacing direct axios calls and manual cache management.

#### Provider Setup

The app should be wrapped with `ReactQueryProvider`:

```typescript
import { ReactQueryProvider } from '@/providers/ReactQueryProvider';

function App() {
  return (
    <ReactQueryProvider>
      {/* Your app */}
    </ReactQueryProvider>
  );
}
```

#### Configuration

Default settings (in `ReactQueryProvider.tsx`):
- **Stale Time**: 5 minutes - Data is fresh for 5 min
- **GC Time**: 10 minutes - Unused data is cached for 10 min
- **Retry**: 2 attempts with exponential backoff
- **Refetch on Window Focus**: Disabled (mobile app)
- **Refetch on Reconnect**: Enabled

### 3. API Service Layer ✅

#### Singleton Pattern

All HTTP requests go through the `APIService` singleton:

```typescript
import { apiService } from '@/services/api';

// Set base URL (usually at app startup)
apiService.setBaseURL('http://192.168.1.18:3000');

// Make requests
const data = await apiService.get('/endpoint');
const result = await apiService.post('/endpoint', { data });
```

#### Feature-Specific APIs

Create API classes for each domain:

```typescript
// services/api/workstationAPI.ts
export class WorkstationAPI {
  private static basePath = '/workstation';

  static async listWorkstations(): Promise<Workstation[]> {
    return apiService.get<Workstation[]>(`${this.basePath}`);
  }

  static async getWorkstation(id: string): Promise<Workstation> {
    return apiService.get<Workstation>(`${this.basePath}/${id}`);
  }
}
```

#### React Query Hooks

Wrap API calls in React Query hooks:

```typescript
// hooks/api/useWorkstations.ts
export const useWorkstations = () => {
  return useQuery({
    queryKey: ['workstations', 'list'],
    queryFn: () => WorkstationAPI.listWorkstations(),
  });
};

export const useCreateWorkstation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params) => WorkstationAPI.createWorkstation(params),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['workstations', 'list'] });
    },
  });
};
```

#### Usage in Components

```typescript
import { useWorkstations, useCreateWorkstation } from '@/hooks/api/useWorkstations';

function WorkstationList() {
  const { data: workstations, isLoading, error } = useWorkstations();
  const createMutation = useCreateWorkstation();

  const handleCreate = async () => {
    await createMutation.mutateAsync({ name: 'New Workstation' });
  };

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return (
    <View>
      {workstations.map(ws => <WorkstationItem key={ws.id} data={ws} />)}
      <Button onPress={handleCreate}>Create</Button>
    </View>
  );
}
```

## Query Key Structure

Use consistent query key patterns:

```typescript
export const workstationKeys = {
  all: ['workstations'] as const,
  lists: () => [...workstationKeys.all, 'list'] as const,
  list: () => [...workstationKeys.lists()] as const,
  details: () => [...workstationKeys.all, 'detail'] as const,
  detail: (id: string) => [...workstationKeys.details(), id] as const,
  files: (id: string) => [...workstationKeys.detail(id), 'files'] as const,
};
```

This enables precise cache invalidation:

```typescript
// Invalidate all workstation queries
queryClient.invalidateQueries({ queryKey: workstationKeys.all });

// Invalidate only workstation lists
queryClient.invalidateQueries({ queryKey: workstationKeys.lists() });

// Invalidate specific workstation
queryClient.invalidateQueries({ queryKey: workstationKeys.detail('ws-1') });
```

## Benefits of React Query

### 1. Automatic Caching
No need to store API responses in Zustand:
```typescript
// ❌ Old way - manual cache in store
const store = create((set) => ({
  workstations: [],
  fetchWorkstations: async () => {
    const data = await axios.get('/workstations');
    set({ workstations: data });
  },
}));

// ✅ New way - React Query handles it
const { data: workstations } = useWorkstations();
```

### 2. Automatic Refetching
```typescript
// Refetches automatically on:
// - Component mount
// - Window refocus (configurable)
// - Network reconnect
// - Time intervals (optional)
```

### 3. Loading and Error States
```typescript
const { data, isLoading, error, isFetching } = useWorkstations();

// isLoading: true on first load
// isFetching: true on background refetch
// error: automatically captured
```

### 4. Optimistic Updates
```typescript
const createMutation = useMutation({
  mutationFn: createWorkstation,
  onMutate: async (newWorkstation) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['workstations'] });

    // Snapshot previous value
    const previous = queryClient.getQueryData(['workstations']);

    // Optimistically update
    queryClient.setQueryData(['workstations'], (old) => [...old, newWorkstation]);

    return { previous };
  },
  onError: (err, variables, context) => {
    // Rollback on error
    queryClient.setQueryData(['workstations'], context.previous);
  },
  onSettled: () => {
    // Always refetch after mutation
    queryClient.invalidateQueries({ queryKey: ['workstations'] });
  },
});
```

## State Management Strategy

### Server State → React Query
- API responses
- Remote data
- Cached data

### Client State → Zustand
- UI state (sidebar open/closed, active tab)
- User preferences
- Local-only data

### Example Split
```typescript
// ❌ Don't store server data in Zustand
const terminalStore = create((set) => ({
  workstations: [],          // ❌ Server data
  isLoading: false,          // ❌ Server state
  fetchWorkstations: async () => {...}, // ❌ API call
}));

// ✅ Use React Query for server data
const { data: workstations } = useWorkstations();

// ✅ Use Zustand for UI state
const uiStore = create((set) => ({
  activeWorkstationId: null,  // ✅ UI state
  sidebarOpen: false,         // ✅ UI state
  setActiveWorkstation: (id) => set({ activeWorkstationId: id }),
}));
```

## Migration Guide

### Step 1: Identify Server Data
Find all data that comes from the API in your stores.

### Step 2: Create API Service
```typescript
// services/api/myAPI.ts
export class MyAPI {
  static async getData(): Promise<Data[]> {
    return apiService.get('/data');
  }
}
```

### Step 3: Create React Query Hook
```typescript
// hooks/api/useMyData.ts
export const useMyData = () => {
  return useQuery({
    queryKey: ['myData'],
    queryFn: () => MyAPI.getData(),
  });
};
```

### Step 4: Replace Store Usage
```typescript
// ❌ Before
const { data, isLoading, fetch } = useMyStore();

useEffect(() => {
  fetch();
}, []);

// ✅ After
const { data, isLoading } = useMyData();
// No useEffect needed - React Query handles it
```

### Step 5: Remove Server State from Store
```typescript
// ❌ Before
const myStore = create((set) => ({
  data: [],
  isLoading: false,
  error: null,
  fetch: async () => {...},
}));

// ✅ After - Keep only UI state
const myStore = create((set) => ({
  selectedId: null,
  viewMode: 'list',
  setSelectedId: (id) => set({ selectedId: id }),
}));
```

## Next Steps

### Phase 2: State Refactoring (Pending)
- Split `terminalStore` (450+ lines) into separate slices
- Extract business logic to custom hooks
- Implement service singletons

### Phase 3: Component Library (Pending)
- Create design tokens (spacing, typography)
- Build base components (Button, Card, Input, Modal)
- Refactor large components

### Phase 4: Testing & Documentation (Pending)
- Achieve 70% test coverage
- Document all patterns
- Create migration guides

## Resources

- [React Query Docs](https://tanstack.com/query/latest)
- [Vitest Docs](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Zustand Docs](https://zustand-demo.pmnd.rs/)
