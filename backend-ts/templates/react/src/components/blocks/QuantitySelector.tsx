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
