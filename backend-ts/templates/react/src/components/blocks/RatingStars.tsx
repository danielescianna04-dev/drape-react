import { FiStar } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface RatingStarsProps {
  initialRating?: number;
  maxStars?: number;
  onRate?: (rating: number) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function RatingStars({ initialRating = 0, maxStars = 5, onRate, readOnly = false, size = 'md', className }: RatingStarsProps) {
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);
  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';

  const handleRate = (star: number) => {
    if (readOnly) return;
    setRating(star);
    onRate?.(star);
    toast.success(`Rated ${star} star${star !== 1 ? 's' : ''}`);
  };

  return (
    <div className={cn('inline-flex items-center gap-0.5', className)}>
      {Array.from({ length: maxStars }, (_, i) => i + 1).map(star => (
        <button key={star} onClick={() => handleRate(star)} onMouseEnter={() => !readOnly && setHover(star)} onMouseLeave={() => !readOnly && setHover(0)} className={cn('transition-transform duration-150', readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-125 active:scale-95')} disabled={readOnly} aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}>
          <FiStar className={cn(iconSize, 'transition-colors duration-150', (hover || rating) >= star ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300')} />
        </button>
      ))}
    </div>
  );
}
