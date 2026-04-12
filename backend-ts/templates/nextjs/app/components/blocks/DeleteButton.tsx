"use client";
import { FiTrash2 } from 'react-icons/fi';
import { toast } from 'sonner';
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
