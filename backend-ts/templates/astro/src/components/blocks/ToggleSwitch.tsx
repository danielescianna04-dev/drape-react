import { useState } from 'react';

interface ToggleSwitchProps {
  initialValue?: boolean;
  onChange?: (value: boolean) => void;
  label?: string;
}

export function ToggleSwitch({ initialValue = false, onChange, label }: ToggleSwitchProps) {
  const [enabled, setEnabled] = useState(initialValue);

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    onChange?.(next);
  };

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
      <button onClick={handleToggle} role="switch" aria-checked={enabled} style={{ position: 'relative', display: 'inline-flex', width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: enabled ? '#8b5cf6' : '#d1d5db', transition: 'background 0.2s' }}>
        <span style={{ position: 'absolute', top: '4px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transform: enabled ? 'translateX(24px)' : 'translateX(4px)' }} />
      </button>
      {label && <span style={{ fontSize: '14px' }}>{label}</span>}
    </label>
  );
}
