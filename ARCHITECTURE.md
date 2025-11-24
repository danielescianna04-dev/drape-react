# Drape React - Architettura

Documentazione dell'architettura del progetto Drape React seguendo il pattern **Atomic Design**.

## 📁 Struttura del Progetto

```
src/
├── hooks/                      # Custom React Hooks
│   ├── business/              # Business logic hooks
│   │   ├── useChatState.ts    # Gestione stato chat completo
│   │   └── useEnvVariables.ts # Gestione variabili d'ambiente
│   ├── ui/                    # UI concerns hooks
│   │   └── useContentOffset.ts # Animazioni sidebar
│   └── index.ts               # Export centralizzato
│
├── shared/
│   └── components/
│       ├── atoms/             # Componenti atomici (più piccoli)
│       │   ├── Button.tsx
│       │   ├── IconButton.tsx
│       │   ├── Input.tsx
│       │   ├── StatusBadge.tsx
│       │   ├── TabItem.tsx
│       │   ├── CommandCard.tsx
│       │   ├── MessageBubble.tsx
│       │   └── index.ts
│       │
│       ├── molecules/         # Componenti molecolari (combinazioni)
│       │   ├── BashCommandCard.tsx
│       │   ├── FileEditCard.tsx
│       │   ├── LoadingCard.tsx
│       │   └── index.ts
│       │
│       └── organisms/         # Componenti organism (sezioni complete)
│           ├── PanelHeader.tsx
│           ├── EmptyState.tsx
│           └── index.ts
│
├── features/                  # Feature modules
│   └── terminal/
│       ├── components/        # Feature-specific components
│       ├── context/          # React Context
│       └── ...
│
├── pages/                    # Page-level components
│   └── Chat/
│       └── ChatPage.tsx
│
└── core/                     # Core business logic
    ├── ai/
    ├── github/
    └── tabs/
```

## 🧩 Atomic Design Pattern

### Atoms (Atomi)
I componenti più piccoli e riutilizzabili dell'applicazione.

**Caratteristiche:**
- Puri e presentazionali
- Altamente riutilizzabili
- Nessuna dipendenza da business logic
- Props ben tipizzate con TypeScript
- Documentazione JSDoc completa

**Esempi:**
```typescript
<IconButton
  iconName="settings"
  onPress={handlePress}
  isActive={true}
/>

<Button
  label="Salva"
  variant="primary"
  onPress={handleSave}
/>

<Input
  value={text}
  onChangeText={setText}
  placeholder="Inserisci testo"
/>
```

### Molecules (Molecole)
Combinazioni di atoms che formano componenti funzionali più complessi.

**Caratteristiche:**
- Combinano 2+ atoms
- Aggiungono logica di interazione
- Mantengono stato interno quando necessario
- Riutilizzabili in contesti diversi

**Esempi:**
```typescript
<BashCommandCard
  command="npm install"
  output="Success!"
  hasError={false}
/>

<FileEditCard
  filePath="app.ts"
  diffLines={['+  new line', '-  old line']}
/>

<LoadingCard
  title="Git Clone"
  status="Cloning repository..."
  showDots={true}
/>
```

### Organisms (Organismi)
Sezioni complete dell'interfaccia che combinano molecules, atoms e logica complessa.

**Caratteristiche:**
- Rappresentano sezioni complete dell'UI
- Combinano molecules e atoms
- Possono contenere business logic
- Spesso feature-specific

**Esempi:**
```typescript
<PanelHeader
  title="Impostazioni"
  icon="settings"
  onClose={handleClose}
/>

<EmptyState
  icon="folder-outline"
  title="Nessun file"
  subtitle="Crea il tuo primo file"
  action={<Button label="Crea" />}
/>
```

## 🪝 Custom Hooks

### Business Hooks
Gestiscono la logica di business e lo stato dell'applicazione.

**useChatState**
```typescript
const chatState = useChatState(isCardMode);
// Returns: {
//   input, setInput,
//   isTerminalMode, setIsTerminalMode,
//   selectedModel, setSelectedModel,
//   widgetHeight, scaleAnim, ...
// }
```

**useEnvVariables**
```typescript
const {
  envVars,
  isLoading,
  saveEnvVariables,
  addEnvVariable,
  updateEnvVariable,
} = useEnvVariables(workstationId);
```

### UI Hooks
Gestiscono concerns puramente UI come animazioni e layout.

**useContentOffset**
```typescript
const contentAnimatedStyle = useContentOffset();
// Returns animated style for sidebar-aware content
```

## 📝 Convenzioni di Codice

### Naming
- **Components**: PascalCase (es. `IconButton`, `BashCommandCard`)
- **Hooks**: camelCase con prefisso `use` (es. `useChatState`)
- **Files**: MatchComponentName.tsx (es. `IconButton.tsx`)

### TypeScript
- Tutti i components sono fully typed
- Props interfaces ben definite
- Export types quando necessario
- JSDoc per documentazione

### Documentazione
Ogni componente include:
```typescript
/**
 * Brief description of the component
 * Use case and purpose
 *
 * @example
 * <ComponentName prop1="value" prop2={true} />
 */
```

### Exports
- Index files per export centralizzato
- Named exports (no default exports)
- Re-export types quando necessario

```typescript
// ✅ Corretto
export { IconButton } from './IconButton';
export type { IconButtonProps } from './IconButton';

// ❌ Evitare
export default IconButton;
```

## 🎯 Best Practices

### Separazione Concerns
- **UI vs Business Logic**: Usa hooks separati
- **Presentational vs Container**: Components vs Pages
- **Reusable vs Feature-specific**: Shared vs Features

### Performance
- Memoization con `useMemo` e `useCallback` quando appropriato
- Lazy loading per components pesanti
- Ottimizzazione re-renders con `React.memo`

### Accessibilità
- Tutti i button hanno `accessibilityLabel`
- Ruoli ARIA corretti (`accessibilityRole`)
- Stati accessibili (`accessibilityState`)

### Testing
- Unit tests per hooks di business logic
- Component tests per atoms e molecules
- Integration tests per organisms e pages

## 🔄 Workflow di Sviluppo

### Aggiungere un Nuovo Componente

1. **Atoms**: Inizia sempre dai componenti più piccoli
2. **Molecules**: Combina atoms per funzionalità complesse
3. **Organisms**: Crea sezioni complete dell'UI
4. **Pages**: Assembla organisms per creare pagine

### Refactoring Esistente

1. Identifica codice duplicato
2. Estrai in atom/molecule/organism
3. Aggiungi TypeScript types e JSDoc
4. Testa e valida
5. Sostituisci vecchio codice
6. Commit con messaggio descrittivo

## 📊 Metriche

### Stato Attuale
- **Atoms**: 7 componenti
- **Molecules**: 3 componenti
- **Organisms**: 2 componenti
- **Custom Hooks**: 3 hooks
- **Codice Rimosso**: ~800 linee duplicate
- **Codice Aggiunto**: ~1500 linee riutilizzabili

### Obiettivi
- [ ] Refactoring completo di tutti i panels
- [ ] 100% TypeScript coverage
- [ ] Documentazione completa per tutti i components
- [ ] Suite di tests comprensiva
- [ ] Storybook per component showcase

## 🚀 Prossimi Passi

1. **Fase 2**: Refactoring panels (Settings, Secrets, Preview)
2. **Fase 3**: Ottimizzazione stores e performance
3. **Fase 4**: Testing e documentazione
4. **Fase 5**: Storybook integration

---

**Autori**: Drape Team
**Ultima modifica**: 2025-01-24
