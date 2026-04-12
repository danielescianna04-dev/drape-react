import { useState } from 'react';

interface RatingStarsProps {
  initialRating?: number;
  maxStars?: number;
  onRate?: (rating: number) => void;
  readOnly?: boolean;
}

export function RatingStars({ initialRating = 0, maxStars = 5, onRate, readOnly = false }: RatingStarsProps) {
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);

  const handleRate = (star: number) => {
    if (readOnly) return;
    setRating(star);
    onRate?.(star);
  };

  return (
    <div style={{ display: 'inline-flex', gap: '2px' }}>
      {Array.from({ length: maxStars }, (_, i) => i + 1).map(star => (
        <button key={star} onClick={() => handleRate(star)} onMouseEnter={() => !readOnly && setHover(star)} onMouseLeave={() => !readOnly && setHover(0)} disabled={readOnly} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: readOnly ? 'default' : 'pointer', padding: '2px', transition: 'transform 0.15s', color: (hover || rating) >= star ? '#facc15' : '#d1d5db' }} aria-label={`Rate ${star}`}>
          {(hover || rating) >= star ? '\u2605' : '\u2606'}
        </button>
      ))}
    </div>
  );
}
