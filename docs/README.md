# Drape Documentation

Welcome to the Drape architecture documentation. This folder contains comprehensive guides for understanding and working with the application architecture.

## Quick Start

### For New Developers
1. Start with [ARCHITECTURE.md](./ARCHITECTURE.md) - Understand the overall architecture
2. Review [PHASE1_SUMMARY.md](./PHASE1_SUMMARY.md) - See what's been built
3. Check example code in `src/hooks/api/useWorkstations.ts`

### For Migration Tasks
1. Read [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
2. Follow the step-by-step examples
3. Use the migration checklist

## Document Index

### 📘 [ARCHITECTURE.md](./ARCHITECTURE.md)
**Purpose**: Complete architecture reference
**Contents**:
- Architecture layers explanation
- Testing infrastructure guide
- React Query setup and patterns
- API service layer documentation
- State management strategy
- Best practices and benefits

**Read this when**:
- Starting a new feature
- Understanding design decisions
- Looking for patterns to follow

---

### 📗 [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
**Purpose**: Step-by-step migration instructions
**Contents**:
- Converting axios calls to React Query
- Splitting large stores
- Extracting business logic to hooks
- Testing patterns with examples
- Common pitfalls and solutions
- Migration checklist

**Read this when**:
- Refactoring existing code
- Moving API calls to React Query
- Need before/after code examples

---

### 📙 [PHASE1_SUMMARY.md](./PHASE1_SUMMARY.md)
**Purpose**: Phase 1 completion report
**Contents**:
- What was accomplished
- Files created/modified
- Test results
- Metrics and improvements
- Next steps for Phase 2

**Read this when**:
- Understanding what's already done
- Planning Phase 2 work
- Reviewing progress

---

## Key Patterns at a Glance

### Making an API Call

```typescript
// 1. Create API service
export class MyAPI {
  static async getData(): Promise<Data[]> {
    return apiService.get('/api/data');
  }
}

// 2. Create React Query hook
export const useMyData = () => {
  return useQuery({
    queryKey: ['myData'],
    queryFn: () => MyAPI.getData(),
  });
};

// 3. Use in component
function MyComponent() {
  const { data, isLoading } = useMyData();

  if (isLoading) return <Loading />;
  return <View>{data.map(...)}</View>;
}
```

### Writing a Test

```typescript
describe('MyStore', () => {
  beforeEach(() => {
    useMyStore.setState({ /* initial state */ });
  });

  it('should do something', () => {
    const { result } = renderHook(() => useMyStore());

    act(() => {
      result.current.doSomething();
    });

    expect(result.current.state).toBe(expected);
  });
});
```

### Creating a Custom Hook

```typescript
export const useMyFeature = () => {
  const myQuery = useMyData();
  const myMutation = useMyMutation();
  const store = useMyStore();

  const doSomething = async (input: string) => {
    // Business logic here
    await myMutation.mutateAsync(input);
  };

  return {
    data: myQuery.data,
    isLoading: myQuery.isLoading,
    doSomething,
  };
};
```

---

## Project Structure

```
src/
├── features/          # Feature modules
│   ├── terminal/      # Terminal feature
│   └── ...
├── core/              # Core business logic
│   ├── tabs/          # Tab management
│   └── terminal/      # Terminal store
├── shared/            # Reusable components
│   ├── components/    # UI components
│   └── theme/         # Theme & colors
├── services/          # External services
│   └── api/           # API service layer ✨ NEW
│       ├── APIService.ts
│       ├── workstationAPI.ts
│       └── index.ts
├── hooks/             # Custom hooks
│   └── api/           # React Query hooks ✨ NEW
│       └── useWorkstations.ts
├── providers/         # Context providers ✨ NEW
│   └── ReactQueryProvider.tsx
└── __tests__/         # Tests ✨ NEW
    ├── setup.ts
    └── examples/
```

---

## Testing Commands

```bash
# Run all tests once
npm test

# Run tests in watch mode (development)
npm run test:watch

# Open Vitest UI (visual test runner)
npm run test:ui

# Generate coverage report
npm run test:coverage
```

---

## Current Status

### ✅ Phase 1: Foundation (COMPLETED)
- Testing infrastructure
- React Query setup
- API service layer
- Example patterns
- Documentation

### 🔄 Phase 2: State Refactoring (PENDING)
- Split terminalStore
- Migrate to React Query
- Extract business logic
- Custom hooks

### ⏳ Phase 3: Component Library (PENDING)
- Design tokens
- Base components
- Refactor large components

### ⏳ Phase 4: Testing & Polish (PENDING)
- 70% test coverage
- Performance optimization
- Final documentation

---

## Resources

### Internal
- [Example API Hooks](../src/hooks/api/useWorkstations.ts)
- [Example Tests](../src/__tests__/examples/)
- [API Service](../src/services/api/APIService.ts)

### External
- [React Query Docs](https://tanstack.com/query/latest)
- [Vitest Docs](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Zustand Docs](https://zustand-demo.pmnd.rs/)

---

## Getting Help

1. **Check documentation first**: Most questions are answered in ARCHITECTURE.md or MIGRATION_GUIDE.md
2. **Review examples**: Look at existing code in `hooks/api/` and `__tests__/examples/`
3. **Follow patterns**: Use established patterns for consistency

---

## Contributing

When adding new features:
1. Follow patterns in ARCHITECTURE.md
2. Write tests
3. Update documentation if needed
4. Keep API services and hooks separate

When refactoring:
1. Follow MIGRATION_GUIDE.md
2. Write tests first (TDD)
3. Keep old code working during migration
4. Update one feature at a time

---

## Changelog

### 2025-11-22 - Phase 1 Complete
- ✅ Testing infrastructure setup
- ✅ React Query integration
- ✅ API service layer
- ✅ Example hooks and tests
- ✅ Comprehensive documentation

---

Last Updated: 2025-11-22
