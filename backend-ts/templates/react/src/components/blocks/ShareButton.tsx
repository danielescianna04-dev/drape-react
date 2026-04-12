import { FiShare2, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface ShareButtonProps {
  url?: string;
  title?: string;
  variant?: 'icon' | 'button';
  className?: string;
}

export function ShareButton({ url, title, variant = 'icon', className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = url || window.location.href;
    const shareTitle = title || document.title;
    if (navigator.share) {
      try { await navigator.share({ title: shareTitle, url: shareUrl }); toast.success('Shared!'); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (variant === 'button') {
    return (
      <button onClick={handleShare} className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 active:scale-95 border border-gray-300 hover:bg-gray-50 text-gray-700', className)}>
        {copied ? <FiCheck className="w-4 h-4" /> : <FiShare2 className="w-4 h-4" />}
        {copied ? 'Copied!' : 'Share'}
      </button>
    );
  }

  return (
    <button onClick={handleShare} className={cn('p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-95 hover:bg-gray-100', className)} aria-label="Share">
      {copied ? <FiCheck className="w-5 h-5 text-green-500" /> : <FiShare2 className="w-5 h-5 text-gray-500" />}
    </button>
  );
}
