import { useState } from 'react';

interface FilterChip { id: string; label: string; }

interface FilterChipsProps {
  chips: FilterChip[];
  initialSelected?: string[];
  onChange?: (selected: string[]) => void;
  multiple?: boolean;
}

export function FilterChips({ chips, initialSelected = [], onChange, multiple = true }: FilterChipsProps) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  const handleToggle = (chipId: string) => {
    const next = multiple
      ? (selected.includes(chipId) ? selected.filter(id => id !== chipId) : [...selected, chipId])
      : (selected.includes(chipId) ? [] : [chipId]);
    setSelected(next);
    onChange?.(next);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {chips.map(chip => (
        <button key={chip.id} onClick={() => handleToggle(chip.id)} style={{ padding: '6px 14px', borderRadius: '9999px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: selected.includes(chip.id) ? '#8b5cf6' : '#f3f4f6', color: selected.includes(chip.id) ? '#fff' : '#4b5563' }}>
          {chip.label}
        </button>
      ))}
    </div>
  );
}
