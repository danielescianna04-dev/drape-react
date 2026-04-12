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
