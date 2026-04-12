"use client";
import { useState } from 'react';
import { FiHeart } from 'react-icons/fi';
import { toast } from 'sonner';
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

export function LikeButton({ itemId, initialLiked = false, onToggle, size = 'md', showCount = false, initialCount = 0, className }: LikeButtonProps) {
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
    <button onClick={handleToggle} className={cn('rounded-full transition-all duration-200 hover:scale-110 active:scale-95', buttonSize, className)} aria-label={liked ? 'Remove from favorites' : 'Add to favorites'}>
      <FiHeart className={cn(iconSize, 'transition-colors duration-200', liked ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-red-400')} />
      {showCount && <span className="text-xs text-gray-500 ml-1">{count}</span>}
    </button>
  );
}
