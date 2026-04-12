import { useState, useRef, useEffect, useCallback } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function SearchBar({ onSearch, placeholder = 'Search...', debounceMs = 300 }: SearchBarProps) {
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
    <div style={{ position: 'relative' }}>
      <input type="text" value={query} onChange={e => handleChange(e.target.value)} placeholder={placeholder} style={{ width: '100%', padding: '10px 40px 10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none' }} />
      {query && <button onClick={handleClear} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#9ca3af' }} aria-label="Clear">{'\u2715'}</button>}
    </div>
  );
}
