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
