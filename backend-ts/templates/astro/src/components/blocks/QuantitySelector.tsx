import { useState } from 'react';

interface QuantitySelectorProps {
  initialValue?: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
}

export function QuantitySelector({ initialValue = 1, min = 0, max = 99, onChange }: QuantitySelectorProps) {
  const [value, setValue] = useState(initialValue);

  const update = (next: number) => { setValue(next); onChange?.(next); };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <button onClick={() => update(Math.max(min, value - 1))} disabled={value <= min} style={{ padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px' }}>-</button>
      <span style={{ width: '40px', textAlign: 'center', fontSize: '14px', fontWeight: 500 }}>{value}</span>
      <button onClick={() => update(Math.min(max, value + 1))} disabled={value >= max} style={{ padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px' }}>+</button>
    </div>
  );
}
