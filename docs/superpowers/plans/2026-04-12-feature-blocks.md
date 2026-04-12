# Feature Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create pre-wired, functional UI component blocks across all 6 template stacks so the AI composes working elements instead of writing them from scratch — reducing dead buttons from ~15% to ~3-5%.

**Architecture:** Each template gets a `blocks/` directory with self-contained, functional components (LikeButton, AddToCartButton, ShareButton, etc.) plus an AppProvider context for shared state. Blocks use existing SafeButton/SafeLink, Tailwind classes, and toast notifications. The AI generation prompt is updated to reference these blocks.

**Tech Stack:** React 19, Next.js 15 (App Router), Vue 3.5 (Composition API), Astro 5 (React islands), Expo SDK 52 (React Native), HTML5 (vanilla JS). Tailwind CSS for web stacks, StyleSheet for Expo.

---

## File Structure

### React (`backend-ts/templates/react/`)
```
src/
├── context/
│   └── AppProvider.tsx          # Global state: cart, favorites, notifications
├── components/
│   └── blocks/
│       ├── LikeButton.tsx       # Toggle heart + toast
│       ├── AddToCartButton.tsx   # Add to cart context + toast
│       ├── ShareButton.tsx      # Copy link + toast
│       ├── QuantitySelector.tsx # +/- counter
│       ├── DeleteButton.tsx     # Remove from list + toast
│       ├── RatingStars.tsx      # Click to rate
│       ├── SearchBar.tsx        # Live filter input
│       ├── FilterChips.tsx      # Toggle filter chips
│       └── ToggleSwitch.tsx     # On/off switch
```

### Next.js (`backend-ts/templates/nextjs/`)
```
app/
├── context/
│   └── AppProvider.tsx          # 'use client' + global state
├── components/
│   └── blocks/
│       ├── LikeButton.tsx       # 'use client' + toggle heart
│       ├── AddToCartButton.tsx   # 'use client' + cart context
│       ├── ShareButton.tsx      # 'use client' + copy link
│       ├── QuantitySelector.tsx # 'use client' + counter
│       ├── DeleteButton.tsx     # 'use client' + remove
│       ├── RatingStars.tsx      # 'use client' + rating
│       ├── SearchBar.tsx        # 'use client' + filter
│       ├── FilterChips.tsx      # 'use client' + chips
│       └── ToggleSwitch.tsx     # 'use client' + switch
```

### Vue (`backend-ts/templates/vue/`)
```
src/
├── composables/
│   └── useAppStore.ts           # Composable: cart, favorites state
├── components/
│   └── blocks/
│       ├── LikeButton.vue
│       ├── AddToCartButton.vue
│       ├── ShareButton.vue
│       ├── QuantitySelector.vue
│       ├── DeleteButton.vue
│       ├── RatingStars.vue
│       ├── SearchBar.vue
│       ├── FilterChips.vue
│       └── ToggleSwitch.vue
```

### Astro (`backend-ts/templates/astro/`)
```
src/
├── components/
│   └── blocks/
│       ├── LikeButton.tsx       # React island (self-contained state)
│       ├── ShareButton.tsx
│       ├── QuantitySelector.tsx
│       ├── RatingStars.tsx
│       ├── SearchBar.tsx
│       ├── FilterChips.tsx
│       └── ToggleSwitch.tsx
```
Note: No AppProvider for Astro — islands are isolated. No AddToCartButton/DeleteButton (require shared context). Blocks use local useState.

### Expo (`backend-ts/templates/expo/`)
```
components/
├── AppProvider.tsx               # Global state for React Native
└── blocks/
    ├── LikeButton.tsx
    ├── AddToCartButton.tsx
    ├── ShareButton.tsx
    ├── QuantitySelector.tsx
    ├── DeleteButton.tsx
    ├── RatingStars.tsx
    ├── SearchBar.tsx
    ├── FilterChips.tsx
    └── ToggleSwitch.tsx
```

### HTML (`backend-ts/templates/html/`)
```
blocks.js                         # All blocks as vanilla JS functions
```
Note: Single file with factory functions for each block type. No context — each block manages its own DOM state. Uses textContent for text, createElement for structure (no innerHTML for security).

---

## Task 1: React AppProvider

**Files:**
- Create: `backend-ts/templates/react/src/context/AppProvider.tsx`

- [ ] **Step 1: Create AppProvider with cart, favorites, and toast integration**

```tsx
// backend-ts/templates/react/src/context/AppProvider.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import toast from 'react-hot-toast';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  quantity: number;
}

interface AppContextType {
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, 'quantity'>) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const addToCart = useCallback((item: Omit<CartItem, 'quantity'>) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        toast.success(`Updated ${item.name} quantity`);
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      toast.success(`${item.name} added to cart`);
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => {
      const item = prev.find(i => i.id === id);
      if (item) toast.success(`${item.name} removed from cart`);
      return prev.filter(i => i.id !== id);
    });
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(i => i.id !== id));
      return;
    }
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity } : i));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    toast.success('Cart cleared');
  }, []);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      if (prev.includes(id)) {
        toast.success('Removed from favorites');
        return prev.filter(i => i !== id);
      }
      toast.success('Added to favorites');
      return [...prev, id];
    });
  }, []);

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  return (
    <AppContext.Provider value={{
      cart, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount,
      favorites, toggleFavorite, isFavorite,
    }}>
      {children}
    </AppContext.Provider>
  );
}
```

- [ ] **Step 2: Verify file created**

Run: `head -5 backend-ts/templates/react/src/context/AppProvider.tsx`

- [ ] **Step 3: Commit**

```bash
git add backend-ts/templates/react/src/context/AppProvider.tsx
git commit -m "feat: add AppProvider context for React template — cart, favorites, toast"
```

---

## Task 2: React Feature Blocks

**Files:**
- Create: `backend-ts/templates/react/src/components/blocks/LikeButton.tsx`
- Create: `backend-ts/templates/react/src/components/blocks/AddToCartButton.tsx`
- Create: `backend-ts/templates/react/src/components/blocks/ShareButton.tsx`
- Create: `backend-ts/templates/react/src/components/blocks/QuantitySelector.tsx`
- Create: `backend-ts/templates/react/src/components/blocks/DeleteButton.tsx`
- Create: `backend-ts/templates/react/src/components/blocks/RatingStars.tsx`
- Create: `backend-ts/templates/react/src/components/blocks/SearchBar.tsx`
- Create: `backend-ts/templates/react/src/components/blocks/FilterChips.tsx`
- Create: `backend-ts/templates/react/src/components/blocks/ToggleSwitch.tsx`

- [ ] **Step 1: Create LikeButton**

```tsx
// backend-ts/templates/react/src/components/blocks/LikeButton.tsx
import { useState } from 'react';
import { FiHeart } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface LikeButtonProps {
  itemId: string;
  initialLiked?: boolean;
  onToggle?: (liked: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  initialCount?: number;
  className?: string;
}

export function LikeButton({
  itemId, initialLiked = false, onToggle, size = 'md',
  showCount = false, initialCount = 0, className,
}: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';
  const buttonSize = size === 'sm' ? 'p-1.5' : size === 'lg' ? 'p-3' : 'p-2';

  const handleToggle = () => {
    const next = !liked;
    setLiked(next);
    setCount(prev => next ? prev + 1 : Math.max(0, prev - 1));
    toast.success(next ? 'Added to favorites' : 'Removed from favorites');
    onToggle?.(next);
  };

  return (
    <button
      onClick={handleToggle}
      className={cn('rounded-full transition-all duration-200 hover:scale-110 active:scale-95', buttonSize, className)}
      aria-label={liked ? 'Remove from favorites' : 'Add to favorites'}
    >
      <FiHeart className={cn(iconSize, 'transition-colors duration-200', liked ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-red-400')} />
      {showCount && <span className="text-xs text-gray-500 ml-1">{count}</span>}
    </button>
  );
}
```

- [ ] **Step 2: Create AddToCartButton**

```tsx
// backend-ts/templates/react/src/components/blocks/AddToCartButton.tsx
import { FiShoppingCart, FiCheck } from 'react-icons/fi';
import { useApp } from '@/context/AppProvider';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface AddToCartButtonProps {
  item: { id: string; name: string; price: number; image?: string };
  variant?: 'primary' | 'outline' | 'icon';
  className?: string;
}

export function AddToCartButton({ item, variant = 'primary', className }: AddToCartButtonProps) {
  const { addToCart, cart } = useApp();
  const [justAdded, setJustAdded] = useState(false);
  const inCart = cart.some(i => i.id === item.id);

  const handleAdd = () => {
    addToCart(item);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  if (variant === 'icon') {
    return (
      <button onClick={handleAdd} className={cn('p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-95', justAdded ? 'bg-green-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700', className)} aria-label={`Add ${item.name} to cart`}>
        {justAdded ? <FiCheck className="w-5 h-5" /> : <FiShoppingCart className="w-5 h-5" />}
      </button>
    );
  }

  return (
    <button onClick={handleAdd} className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 active:scale-95', variant === 'outline' ? 'border border-gray-300 hover:bg-gray-50 text-gray-700' : justAdded ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:opacity-90', className)}>
      {justAdded ? <FiCheck className="w-4 h-4" /> : <FiShoppingCart className="w-4 h-4" />}
      {justAdded ? 'Added!' : inCart ? 'Add another' : 'Add to cart'}
    </button>
  );
}
```

- [ ] **Step 3: Create ShareButton**

```tsx
// backend-ts/templates/react/src/components/blocks/ShareButton.tsx
import { FiShare2, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface ShareButtonProps {
  url?: string;
  title?: string;
  variant?: 'icon' | 'button';
  className?: string;
}

export function ShareButton({ url, title, variant = 'icon', className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = url || window.location.href;
    const shareTitle = title || document.title;
    if (navigator.share) {
      try { await navigator.share({ title: shareTitle, url: shareUrl }); toast.success('Shared!'); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (variant === 'button') {
    return (
      <button onClick={handleShare} className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 active:scale-95 border border-gray-300 hover:bg-gray-50 text-gray-700', className)}>
        {copied ? <FiCheck className="w-4 h-4" /> : <FiShare2 className="w-4 h-4" />}
        {copied ? 'Copied!' : 'Share'}
      </button>
    );
  }

  return (
    <button onClick={handleShare} className={cn('p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-95 hover:bg-gray-100', className)} aria-label="Share">
      {copied ? <FiCheck className="w-5 h-5 text-green-500" /> : <FiShare2 className="w-5 h-5 text-gray-500" />}
    </button>
  );
}
```

- [ ] **Step 4: Create QuantitySelector**

```tsx
// backend-ts/templates/react/src/components/blocks/QuantitySelector.tsx
import { FiMinus, FiPlus } from 'react-icons/fi';
import { cn } from '@/lib/utils';

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

export function QuantitySelector({ value, onChange, min = 0, max = 99, className }: QuantitySelectorProps) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-lg border border-gray-200', className)}>
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="p-2 hover:bg-gray-100 rounded-l-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Decrease quantity">
        <FiMinus className="w-4 h-4" />
      </button>
      <span className="w-10 text-center text-sm font-medium tabular-nums">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="p-2 hover:bg-gray-100 rounded-r-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Increase quantity">
        <FiPlus className="w-4 h-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Create DeleteButton**

```tsx
// backend-ts/templates/react/src/components/blocks/DeleteButton.tsx
import { FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface DeleteButtonProps {
  onDelete: () => void;
  label?: string;
  confirmMessage?: string;
  variant?: 'icon' | 'button';
  className?: string;
}

export function DeleteButton({ onDelete, label = 'Delete', confirmMessage, variant = 'icon', className }: DeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);

  const handleClick = () => {
    if (confirmMessage && !confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    onDelete();
    setConfirming(false);
    toast.success('Deleted');
  };

  if (variant === 'button') {
    return (
      <button onClick={handleClick} className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 active:scale-95', confirming ? 'bg-red-500 text-white' : 'border border-red-200 text-red-600 hover:bg-red-50', className)}>
        <FiTrash2 className="w-4 h-4" />
        {confirming ? 'Confirm?' : label}
      </button>
    );
  }

  return (
    <button onClick={handleClick} className={cn('p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-95', confirming ? 'bg-red-500 text-white' : 'hover:bg-red-50 text-red-400 hover:text-red-600', className)} aria-label={confirming ? 'Confirm delete' : label}>
      <FiTrash2 className="w-5 h-5" />
    </button>
  );
}
```

- [ ] **Step 6: Create RatingStars**

```tsx
// backend-ts/templates/react/src/components/blocks/RatingStars.tsx
import { FiStar } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface RatingStarsProps {
  initialRating?: number;
  maxStars?: number;
  onRate?: (rating: number) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function RatingStars({ initialRating = 0, maxStars = 5, onRate, readOnly = false, size = 'md', className }: RatingStarsProps) {
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);
  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';

  const handleRate = (star: number) => {
    if (readOnly) return;
    setRating(star);
    onRate?.(star);
    toast.success(`Rated ${star} star${star !== 1 ? 's' : ''}`);
  };

  return (
    <div className={cn('inline-flex items-center gap-0.5', className)}>
      {Array.from({ length: maxStars }, (_, i) => i + 1).map(star => (
        <button key={star} onClick={() => handleRate(star)} onMouseEnter={() => !readOnly && setHover(star)} onMouseLeave={() => !readOnly && setHover(0)} className={cn('transition-transform duration-150', readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-125 active:scale-95')} disabled={readOnly} aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}>
          <FiStar className={cn(iconSize, 'transition-colors duration-150', (hover || rating) >= star ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300')} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Create SearchBar**

```tsx
// backend-ts/templates/react/src/components/blocks/SearchBar.tsx
import { FiSearch, FiX } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export function SearchBar({ onSearch, placeholder = 'Search...', debounceMs = 300, className }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearch(value), debounceMs);
  }, [onSearch, debounceMs]);

  const handleClear = () => { setQuery(''); onSearch(''); };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className={cn('relative', className)}>
      <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input type="text" value={query} onChange={e => handleChange(e.target.value)} placeholder={placeholder} className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors" />
      {query && (
        <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Clear search">
          <FiX className="w-4 h-4 text-gray-400" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create FilterChips**

```tsx
// backend-ts/templates/react/src/components/blocks/FilterChips.tsx
import { cn } from '@/lib/utils';

interface FilterChip { id: string; label: string; }

interface FilterChipsProps {
  chips: FilterChip[];
  selected: string[];
  onChange: (selected: string[]) => void;
  multiple?: boolean;
  className?: string;
}

export function FilterChips({ chips, selected, onChange, multiple = true, className }: FilterChipsProps) {
  const handleToggle = (chipId: string) => {
    if (multiple) {
      onChange(selected.includes(chipId) ? selected.filter(id => id !== chipId) : [...selected, chipId]);
    } else {
      onChange(selected.includes(chipId) ? [] : [chipId]);
    }
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {chips.map(chip => (
        <button key={chip.id} onClick={() => handleToggle(chip.id)} className={cn('px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 active:scale-95', selected.includes(chip.id) ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          {chip.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Create ToggleSwitch**

```tsx
// backend-ts/templates/react/src/components/blocks/ToggleSwitch.tsx
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface ToggleSwitchProps {
  initialValue?: boolean;
  onChange?: (value: boolean) => void;
  label?: string;
  className?: string;
}

export function ToggleSwitch({ initialValue = false, onChange, label, className }: ToggleSwitchProps) {
  const [enabled, setEnabled] = useState(initialValue);

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    onChange?.(next);
  };

  return (
    <label className={cn('inline-flex items-center gap-3 cursor-pointer', className)}>
      <button role="switch" aria-checked={enabled} onClick={handleToggle} className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200', enabled ? 'bg-primary' : 'bg-gray-300')}>
        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 shadow-sm', enabled ? 'translate-x-6' : 'translate-x-1')} />
      </button>
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  );
}
```

- [ ] **Step 10: Commit React blocks**

```bash
git add backend-ts/templates/react/src/components/blocks/
git commit -m "feat: add 9 feature blocks for React template"
```

---

## Task 3: Next.js AppProvider + Feature Blocks

**Files:**
- Create: `backend-ts/templates/nextjs/app/context/AppProvider.tsx`
- Create: 9 files in `backend-ts/templates/nextjs/app/components/blocks/`

Next.js blocks are identical to React blocks with these differences:
1. Every file starts with `"use client";` directive
2. Toast import: `import { toast } from 'sonner';` (Next.js template uses sonner, not react-hot-toast)
3. Import paths use `@/` alias (same as React)

- [ ] **Step 1: Create Next.js AppProvider**

Copy React's AppProvider.tsx with:
- Add `"use client";` as first line
- Replace `import toast from 'react-hot-toast';` with `import { toast } from 'sonner';`
- Rest is identical

- [ ] **Step 2: Create all 9 Next.js blocks**

For each of the 9 blocks, copy the React version with:
- Add `"use client";` as first line
- Replace `import toast from 'react-hot-toast';` with `import { toast } from 'sonner';` (only in files that use toast: LikeButton, ShareButton, DeleteButton, RatingStars)
- QuantitySelector, SearchBar, FilterChips, ToggleSwitch have no toast — only add `"use client";`
- AddToCartButton uses `useApp()` which calls toast internally — only add `"use client";`

- [ ] **Step 3: Commit Next.js blocks**

```bash
git add backend-ts/templates/nextjs/app/context/ backend-ts/templates/nextjs/app/components/blocks/
git commit -m "feat: add AppProvider + 9 feature blocks for Next.js template"
```

---

## Task 4: Vue AppStore Composable + Feature Blocks

**Files:**
- Create: `backend-ts/templates/vue/src/composables/useAppStore.ts`
- Create: 9 files in `backend-ts/templates/vue/src/components/blocks/`

Vue uses Composition API with `ref()`, `computed()`, and composables. Icons from `@iconify/vue`.

- [ ] **Step 1: Create useAppStore composable**

```ts
// backend-ts/templates/vue/src/composables/useAppStore.ts
import { ref, computed } from 'vue';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  quantity: number;
}

const cart = ref<CartItem[]>([]);
const favorites = ref<string[]>([]);
const toastMessage = ref('');
const toastVisible = ref(false);

function showToast(message: string) {
  toastMessage.value = message;
  toastVisible.value = true;
  setTimeout(() => { toastVisible.value = false; }, 2500);
}

export function useAppStore() {
  const addToCart = (item: Omit<CartItem, 'quantity'>) => {
    const existing = cart.value.find(i => i.id === item.id);
    if (existing) {
      cart.value = cart.value.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      showToast(`Updated ${item.name} quantity`);
    } else {
      cart.value = [...cart.value, { ...item, quantity: 1 }];
      showToast(`${item.name} added to cart`);
    }
  };

  const removeFromCart = (id: string) => {
    const item = cart.value.find(i => i.id === id);
    if (item) showToast(`${item.name} removed`);
    cart.value = cart.value.filter(i => i.id !== id);
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) { cart.value = cart.value.filter(i => i.id !== id); return; }
    cart.value = cart.value.map(i => i.id === id ? { ...i, quantity } : i);
  };

  const clearCart = () => { cart.value = []; showToast('Cart cleared'); };

  const cartTotal = computed(() => cart.value.reduce((s, i) => s + i.price * i.quantity, 0));
  const cartCount = computed(() => cart.value.reduce((s, i) => s + i.quantity, 0));

  const toggleFavorite = (id: string) => {
    if (favorites.value.includes(id)) {
      favorites.value = favorites.value.filter(i => i !== id);
      showToast('Removed from favorites');
    } else {
      favorites.value = [...favorites.value, id];
      showToast('Added to favorites');
    }
  };

  const isFavorite = (id: string) => favorites.value.includes(id);

  return {
    cart, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount,
    favorites, toggleFavorite, isFavorite, toastMessage, toastVisible,
  };
}
```

- [ ] **Step 2: Create LikeButton.vue**

```vue
<!-- backend-ts/templates/vue/src/components/blocks/LikeButton.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { Icon } from '@iconify/vue';

const props = withDefaults(defineProps<{
  itemId: string;
  initialLiked?: boolean;
  showCount?: boolean;
  initialCount?: number;
}>(), { initialLiked: false, showCount: false, initialCount: 0 });

const emit = defineEmits<{ toggle: [liked: boolean] }>();
const { toggleFavorite } = useAppStore();
const liked = ref(props.initialLiked);
const count = ref(props.initialCount);

const handleToggle = () => {
  liked.value = !liked.value;
  count.value += liked.value ? 1 : -1;
  if (count.value < 0) count.value = 0;
  toggleFavorite(props.itemId);
  emit('toggle', liked.value);
};
</script>

<template>
  <button @click="handleToggle" class="rounded-full transition-all duration-200 hover:scale-110 active:scale-95 p-2" :aria-label="liked ? 'Remove from favorites' : 'Add to favorites'">
    <Icon :icon="liked ? 'mdi:heart' : 'mdi:heart-outline'" :width="20" :class="liked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'" class="transition-colors duration-200" />
    <span v-if="showCount" class="text-xs text-gray-500 ml-1">{{ count }}</span>
  </button>
</template>
```

- [ ] **Step 3: Create remaining 8 Vue blocks**

Each `.vue` file follows the same pattern: `<script setup lang="ts">` with Composition API, `@iconify/vue` for icons, `useAppStore` for shared state where needed, Tailwind classes for styling.

Files to create (all in `src/components/blocks/`):
1. `AddToCartButton.vue` — uses `useAppStore().addToCart()`, cart icon to check icon transition
2. `ShareButton.vue` — `navigator.share` / `navigator.clipboard`, share icon to check transition
3. `QuantitySelector.vue` — `ref(value)` with +/- buttons, emits `update:value`
4. `DeleteButton.vue` — confirm-on-second-click, emits `delete`
5. `RatingStars.vue` — `ref(rating)` + hover state, star icons fill on click
6. `SearchBar.vue` — `ref(query)` with debounced `emit('search', query)`, clear button
7. `FilterChips.vue` — `ref(selected[])` toggle, emits `update:selected`
8. `ToggleSwitch.vue` — `ref(enabled)` boolean toggle, emits `update:modelValue`

- [ ] **Step 4: Commit Vue blocks**

```bash
git add backend-ts/templates/vue/src/composables/ backend-ts/templates/vue/src/components/blocks/
git commit -m "feat: add useAppStore composable + 9 feature blocks for Vue template"
```

---

## Task 5: Astro Feature Blocks (React Islands)

**Files:**
- Create: 7 files in `backend-ts/templates/astro/src/components/blocks/`

Astro blocks are self-contained React islands — no shared context. Each uses local `useState`. No AddToCartButton or DeleteButton (require shared context). No toast library — use callback props for feedback.

- [ ] **Step 1: Create 7 Astro blocks**

Each block is a simplified React component with only `useState` for state. No external dependencies beyond `react-icons/fi`.

Usage in `.astro` files:
```astro
---
import { LikeButton } from '../components/blocks/LikeButton';
---
<LikeButton client:load itemId="product-1" />
```

Files (each is the React version stripped of context, toast replaced with callback):
1. `LikeButton.tsx` — local useState, onToggle callback
2. `ShareButton.tsx` — navigator.clipboard, onShare callback
3. `QuantitySelector.tsx` — same as React (already self-contained)
4. `RatingStars.tsx` — local useState, onRate callback
5. `SearchBar.tsx` — same as React (already self-contained)
6. `FilterChips.tsx` — same as React (already self-contained)
7. `ToggleSwitch.tsx` — same as React (already self-contained)

- [ ] **Step 2: Commit Astro blocks**

```bash
git add backend-ts/templates/astro/src/components/blocks/
git commit -m "feat: add 7 feature blocks for Astro template — React islands"
```

---

## Task 6: Expo AppProvider + Feature Blocks (React Native)

**Files:**
- Create: `backend-ts/templates/expo/components/AppProvider.tsx`
- Create: 9 files in `backend-ts/templates/expo/components/blocks/`

Expo blocks use React Native primitives: `Pressable`, `Text`, `View`, `TextInput`, `Alert`, `Share`, `Switch`, `StyleSheet`. Icons from `@expo/vector-icons` (`Ionicons`). No Tailwind.

- [ ] **Step 1: Create Expo AppProvider**

Same logic as React AppProvider but:
- Replace `toast.success()` with `Alert.alert('Success', message)` (or silent — cart/favorites just update state)
- No toast import
- Use React Native types

```tsx
// backend-ts/templates/expo/components/AppProvider.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  quantity: number;
}

interface AppContextType {
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, 'quantity'>) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const addToCart = useCallback((item: Omit<CartItem, 'quantity'>) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) { setCart(prev => prev.filter(i => i.id !== id)); return; }
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity } : i));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }, []);

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  return (
    <AppContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount, favorites, toggleFavorite, isFavorite }}>
      {children}
    </AppContext.Provider>
  );
}
```

- [ ] **Step 2: Create all 9 Expo blocks**

Each block uses: `Pressable`, `View`, `Text`, `StyleSheet`, `Ionicons`. Pattern:

```tsx
import React, { useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
```

Blocks to create in `components/blocks/`:
1. `LikeButton.tsx` — Ionicons heart-outline/heart toggle, Pressable
2. `AddToCartButton.tsx` — uses useApp().addToCart(), cart icon to checkmark transition
3. `ShareButton.tsx` — uses `Share.share()` from react-native
4. `QuantitySelector.tsx` — View with +/- Pressables and Text counter
5. `DeleteButton.tsx` — uses `Alert.alert()` for confirm dialog
6. `RatingStars.tsx` — star icons in a row, Pressable per star
7. `SearchBar.tsx` — TextInput with clear button
8. `FilterChips.tsx` — horizontal ScrollView with chip Pressables
9. `ToggleSwitch.tsx` — uses `Switch` from react-native

- [ ] **Step 3: Commit Expo blocks**

```bash
git add backend-ts/templates/expo/components/AppProvider.tsx backend-ts/templates/expo/components/blocks/
git commit -m "feat: add AppProvider + 9 feature blocks for Expo template"
```

---

## Task 7: HTML Feature Blocks (Vanilla JS)

**Files:**
- Create: `backend-ts/templates/html/blocks.js`

Single file with factory functions. All DOM manipulation uses `createElement`, `textContent`, and `style` properties — no innerHTML for security. Each function returns a DOM element with working event handlers.

- [ ] **Step 1: Create blocks.js**

```javascript
// backend-ts/templates/html/blocks.js
/**
 * Drape Feature Blocks - vanilla JS functional UI components.
 * Each function returns a DOM element with working event handlers.
 * Usage: document.getElementById('target').appendChild(Drape.likeButton({ id: '1' }));
 */
const Drape = {
  _toast(message) {
    const t = document.createElement('div');
    t.textContent = message;
    Object.assign(t.style, {
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      background: '#333', color: '#fff', padding: '10px 20px', borderRadius: '8px',
      fontSize: '14px', zIndex: '10000', transition: 'opacity 0.3s', opacity: '1'
    });
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2500);
  },

  likeButton({ id, onToggle, initialLiked = false }) {
    let liked = initialLiked;
    const btn = document.createElement('button');
    btn.textContent = '\u2661'; // empty heart unicode
    btn.style.cssText = 'background:none;border:none;font-size:24px;cursor:pointer;transition:transform 0.2s;padding:8px;';
    const update = () => {
      btn.textContent = liked ? '\u2665' : '\u2661'; // filled vs empty heart
      btn.style.color = liked ? '#ef4444' : '#9ca3af';
    };
    update();
    btn.onclick = () => { liked = !liked; update(); Drape._toast(liked ? 'Added to favorites' : 'Removed'); onToggle?.(liked); };
    btn.onmouseenter = () => { btn.style.transform = 'scale(1.2)'; };
    btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; };
    return btn;
  },

  shareButton({ url, title }) {
    const btn = document.createElement('button');
    btn.textContent = 'Share';
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;';
    btn.onclick = async () => {
      const u = url || location.href;
      if (navigator.share) { try { await navigator.share({ title: title || document.title, url: u }); return; } catch {} }
      await navigator.clipboard.writeText(u);
      Drape._toast('Link copied!');
    };
    return btn;
  },

  quantitySelector({ value = 1, min = 0, max = 99, onChange }) {
    let val = value;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-flex;align-items:center;border:1px solid #e5e7eb;border-radius:8px;';
    const minus = document.createElement('button');
    const display = document.createElement('span');
    const plus = document.createElement('button');
    minus.textContent = '\u2212'; plus.textContent = '+';
    [minus, plus].forEach(b => { b.style.cssText = 'padding:8px 12px;border:none;background:none;cursor:pointer;font-size:16px;'; });
    display.style.cssText = 'width:40px;text-align:center;font-size:14px;font-weight:500;';
    const update = () => { display.textContent = String(val); minus.disabled = val <= min; plus.disabled = val >= max; };
    update();
    minus.onclick = () => { val = Math.max(min, val - 1); update(); onChange?.(val); };
    plus.onclick = () => { val = Math.min(max, val + 1); update(); onChange?.(val); };
    wrap.append(minus, display, plus);
    return wrap;
  },

  ratingStars({ maxStars = 5, initialRating = 0, onRate }) {
    let rating = initialRating;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-flex;gap:2px;';
    const stars = [];
    const update = () => stars.forEach((s, i) => {
      s.textContent = i < rating ? '\u2605' : '\u2606'; // filled vs empty star
      s.style.color = i < rating ? '#facc15' : '#d1d5db';
    });
    for (let i = 0; i < maxStars; i++) {
      const s = document.createElement('button');
      s.style.cssText = 'background:none;border:none;font-size:24px;cursor:pointer;transition:transform 0.15s;padding:2px;';
      s.onclick = () => { rating = i + 1; update(); Drape._toast('Rated ' + rating + ' star' + (rating > 1 ? 's' : '')); onRate?.(rating); };
      s.onmouseenter = () => { s.style.transform = 'scale(1.3)'; };
      s.onmouseleave = () => { s.style.transform = 'scale(1)'; };
      stars.push(s);
      wrap.appendChild(s);
    }
    update();
    return wrap;
  },

  deleteButton({ onDelete, label = 'Delete', confirmMessage }) {
    let confirming = false;
    const btn = document.createElement('button');
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid #fecaca;border-radius:8px;background:#fff;color:#dc2626;cursor:pointer;font-size:14px;transition:all 0.2s;';
    btn.textContent = label;
    btn.onclick = () => {
      if (confirmMessage && !confirming) {
        confirming = true; btn.textContent = 'Confirm?'; btn.style.background = '#dc2626'; btn.style.color = '#fff';
        setTimeout(() => { confirming = false; btn.textContent = label; btn.style.background = '#fff'; btn.style.color = '#dc2626'; }, 3000);
        return;
      }
      onDelete?.(); confirming = false; Drape._toast('Deleted');
    };
    return btn;
  },

  toggleSwitch({ initialValue = false, onChange, label }) {
    let enabled = initialValue;
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:12px;cursor:pointer;';
    const track = document.createElement('div');
    track.style.cssText = 'width:44px;height:24px;border-radius:12px;position:relative;transition:background 0.2s;';
    const thumb = document.createElement('div');
    thumb.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:4px;transition:transform 0.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);';
    track.appendChild(thumb);
    const update = () => { track.style.background = enabled ? '#8b5cf6' : '#d1d5db'; thumb.style.transform = enabled ? 'translateX(24px)' : 'translateX(4px)'; };
    update();
    wrap.onclick = (e) => { e.preventDefault(); enabled = !enabled; update(); onChange?.(enabled); };
    wrap.appendChild(track);
    if (label) { const lbl = document.createElement('span'); lbl.textContent = label; lbl.style.fontSize = '14px'; wrap.appendChild(lbl); }
    return wrap;
  },

  searchBar({ onSearch, placeholder = 'Search...' }) {
    let timer;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;';
    const input = document.createElement('input');
    input.type = 'text'; input.placeholder = placeholder;
    input.style.cssText = 'width:100%;padding:10px 40px 10px 36px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;';
    input.oninput = () => { clearTimeout(timer); timer = setTimeout(() => onSearch?.(input.value), 300); };
    wrap.appendChild(input);
    return wrap;
  },

  filterChips({ chips, onChange, multiple = true }) {
    const selected = new Set();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
    const updateAll = () => allBtns.forEach(({ btn, chip }) => {
      const active = selected.has(chip.id);
      btn.style.background = active ? '#8b5cf6' : '#f3f4f6';
      btn.style.color = active ? '#fff' : '#4b5563';
    });
    const allBtns = chips.map(chip => {
      const btn = document.createElement('button');
      btn.textContent = chip.label;
      btn.style.cssText = 'padding:6px 14px;border-radius:9999px;font-size:14px;font-weight:500;border:none;cursor:pointer;transition:all 0.2s;';
      btn.onclick = () => {
        if (!multiple) selected.clear();
        selected.has(chip.id) ? selected.delete(chip.id) : selected.add(chip.id);
        updateAll();
        onChange?.([...selected]);
      };
      wrap.appendChild(btn);
      return { btn, chip };
    });
    updateAll();
    return wrap;
  },
};
```

- [ ] **Step 2: Commit HTML blocks**

```bash
git add backend-ts/templates/html/blocks.js
git commit -m "feat: add feature blocks for HTML template — vanilla JS"
```

---

## Task 8: Update TEMPLATE_FILES + Protected Files

**Files:**
- Modify: `backend-ts/src/services/project-creation-prompt.ts` (TEMPLATE_FILES constant, lines 19-46)

Add all new block files to TEMPLATE_FILES so the AI does NOT regenerate them.

- [ ] **Step 1: Update TEMPLATE_FILES**

Add to each stack's array:

**React** — append:
```ts
'src/context/AppProvider.tsx',
'src/components/blocks/LikeButton.tsx', 'src/components/blocks/AddToCartButton.tsx',
'src/components/blocks/ShareButton.tsx', 'src/components/blocks/QuantitySelector.tsx',
'src/components/blocks/DeleteButton.tsx', 'src/components/blocks/RatingStars.tsx',
'src/components/blocks/SearchBar.tsx', 'src/components/blocks/FilterChips.tsx',
'src/components/blocks/ToggleSwitch.tsx',
```

**Next.js** — append:
```ts
'app/context/AppProvider.tsx',
'app/components/blocks/LikeButton.tsx', 'app/components/blocks/AddToCartButton.tsx',
'app/components/blocks/ShareButton.tsx', 'app/components/blocks/QuantitySelector.tsx',
'app/components/blocks/DeleteButton.tsx', 'app/components/blocks/RatingStars.tsx',
'app/components/blocks/SearchBar.tsx', 'app/components/blocks/FilterChips.tsx',
'app/components/blocks/ToggleSwitch.tsx',
```

**Vue** — append:
```ts
'src/composables/useAppStore.ts',
'src/components/blocks/LikeButton.vue', 'src/components/blocks/AddToCartButton.vue',
'src/components/blocks/ShareButton.vue', 'src/components/blocks/QuantitySelector.vue',
'src/components/blocks/DeleteButton.vue', 'src/components/blocks/RatingStars.vue',
'src/components/blocks/SearchBar.vue', 'src/components/blocks/FilterChips.vue',
'src/components/blocks/ToggleSwitch.vue',
```

**Astro** — append:
```ts
'src/components/blocks/LikeButton.tsx', 'src/components/blocks/ShareButton.tsx',
'src/components/blocks/QuantitySelector.tsx', 'src/components/blocks/RatingStars.tsx',
'src/components/blocks/SearchBar.tsx', 'src/components/blocks/FilterChips.tsx',
'src/components/blocks/ToggleSwitch.tsx',
```

**HTML** — append: `'blocks.js',`

**Expo** — append:
```ts
'components/AppProvider.tsx',
'components/blocks/LikeButton.tsx', 'components/blocks/AddToCartButton.tsx',
'components/blocks/ShareButton.tsx', 'components/blocks/QuantitySelector.tsx',
'components/blocks/DeleteButton.tsx', 'components/blocks/RatingStars.tsx',
'components/blocks/SearchBar.tsx', 'components/blocks/FilterChips.tsx',
'components/blocks/ToggleSwitch.tsx',
```

- [ ] **Step 2: Commit**

```bash
git add backend-ts/src/services/project-creation-prompt.ts
git commit -m "feat: register feature blocks in TEMPLATE_FILES — prevent AI regeneration"
```

---

## Task 9: Update Generation Prompts

**Files:**
- Modify: `backend-ts/src/services/project-creation-prompt.ts` (STACK_INSTRUCTIONS + getAgentCreationPrompt)

- [ ] **Step 1: Add block instructions to React STACK_INSTRUCTIONS**

After the SafeButton/SafeLink instructions in the `react` entry, add:

```
- PRE-BUILT FEATURE BLOCKS in src/components/blocks/: LikeButton, AddToCartButton, ShareButton, QuantitySelector, DeleteButton, RatingStars, SearchBar, FilterChips, ToggleSwitch. USE THESE for common interactions — they are tested and produce visible toast feedback.
- AppProvider in src/context/AppProvider.tsx provides cart and favorites state. Wrap your app: in App.tsx add <AppProvider> around <Routes>. Use: const { addToCart, toggleFavorite, cart, cartCount } = useApp();
- PREFER blocks: <LikeButton itemId="1" /> not custom heart. <AddToCartButton item={product} /> not custom cart. <ShareButton /> not custom share. <RatingStars onRate={fn} /> not custom stars.
```

- [ ] **Step 2: Add block instructions for Next.js, Vue, Astro, Expo, HTML**

Same pattern adapted per stack (paths, component names, import syntax). See Task 3-7 for stack-specific details.

- [ ] **Step 3: Update agent creation prompt ACTION MAP**

In `getAgentCreationPrompt`, in the ACTION MAP section, add:

```
IMPORTANT: Before writing a custom button, check if a PRE-BUILT BLOCK exists in components/blocks/.
These blocks are ALREADY TESTED and produce visible feedback:
- Heart/like/bookmark -> <LikeButton itemId="..." />
- Add to cart -> <AddToCartButton item={...} />
- Share -> <ShareButton />
- +/- quantity -> <QuantitySelector value={n} onChange={...} />
- Delete/remove -> <DeleteButton onDelete={...} />
- Star rating -> <RatingStars onRate={...} />
- Search input -> <SearchBar onSearch={...} />
- Filter tags -> <FilterChips chips={[...]} selected={[...]} onChange={...} />
- On/off switch -> <ToggleSwitch onChange={...} label="..." />
Custom buttons are ONLY needed for app-specific actions not covered above.
```

- [ ] **Step 4: Commit prompt updates**

```bash
git add backend-ts/src/services/project-creation-prompt.ts
git commit -m "feat: update generation prompts to reference feature blocks — all 6 stacks"
```

---

## Task 10: Verification

- [ ] **Step 1: Verify all files exist**

```bash
echo "=== React ===" && ls backend-ts/templates/react/src/context/ backend-ts/templates/react/src/components/blocks/
echo "=== Next.js ===" && ls backend-ts/templates/nextjs/app/context/ backend-ts/templates/nextjs/app/components/blocks/
echo "=== Vue ===" && ls backend-ts/templates/vue/src/composables/ backend-ts/templates/vue/src/components/blocks/
echo "=== Astro ===" && ls backend-ts/templates/astro/src/components/blocks/
echo "=== Expo ===" && ls backend-ts/templates/expo/components/blocks/ && ls backend-ts/templates/expo/components/AppProvider.tsx
echo "=== HTML ===" && ls backend-ts/templates/html/blocks.js
```

Expected: All directories and files listed without errors.

- [ ] **Step 2: Verify TEMPLATE_FILES includes block files**

```bash
grep -c "blocks/" backend-ts/src/services/project-creation-prompt.ts
```

Expected: ~57 entries (10 React + 10 Next.js + 10 Vue + 7 Astro + 10 Expo = 47 blocks paths, plus a few references in prompts).

- [ ] **Step 3: Verify prompt references blocks**

```bash
grep -c "PRE-BUILT FEATURE BLOCKS" backend-ts/src/services/project-creation-prompt.ts
```

Expected: 6 (one per stack in STACK_INSTRUCTIONS).

- [ ] **Step 4: Count total new files**

```bash
find backend-ts/templates/ -path "*/blocks/*" -o -name "AppProvider.tsx" -path "*/context/*" -o -name "AppProvider.tsx" -path "*/expo/*" -o -name "useAppStore.ts" | wc -l
```

Expected: ~50 files total across all stacks.

- [ ] **Step 5: Final verification commit if needed**

```bash
git status
# If fixups needed, commit them:
git add -A && git commit -m "fix: verification fixes for feature blocks"
```
