import { useState } from 'react';

interface LikeButtonProps {
  itemId: string;
  initialLiked?: boolean;
  onToggle?: (liked: boolean) => void;
}

export function LikeButton({ itemId, initialLiked = false, onToggle }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);

  const handleToggle = () => {
    const next = !liked;
    setLiked(next);
    onToggle?.(next);
  };

  return (
    <button onClick={handleToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', padding: '8px', transition: 'transform 0.2s' }} aria-label={liked ? 'Unlike' : 'Like'}>
      <span style={{ color: liked ? '#ef4444' : '#9ca3af', transition: 'color 0.2s' }}>{liked ? '\u2665' : '\u2661'}</span>
    </button>
  );
}
