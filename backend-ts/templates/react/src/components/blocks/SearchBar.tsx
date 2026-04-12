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
