import { FiShoppingCart, FiCheck } from 'react-icons/fi';
import { useApp } from '@/context/AppProvider';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface AddToCartButtonProps {
  item: { id: string; name: string; price: number; image?: string };
  variant?: 'primary' | 'outline' | 'icon';
  className?: string;
}

export function AddToCartButton({ item, variant = 'primary', className }: AddToCartButtonProps) {
  const { addToCart, cart } = useApp();
  const [justAdded, setJustAdded] = useState(false);
  const inCart = cart.some(i => i.id === item.id);

  const handleAdd = () => {
    addToCart(item);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  if (variant === 'icon') {
    return (
      <button onClick={handleAdd} className={cn('p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-95', justAdded ? 'bg-green-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700', className)} aria-label={`Add ${item.name} to cart`}>
        {justAdded ? <FiCheck className="w-5 h-5" /> : <FiShoppingCart className="w-5 h-5" />}
      </button>
    );
  }

  return (
    <button onClick={handleAdd} className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 active:scale-95', variant === 'outline' ? 'border border-gray-300 hover:bg-gray-50 text-gray-700' : justAdded ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:opacity-90', className)}>
      {justAdded ? <FiCheck className="w-4 h-4" /> : <FiShoppingCart className="w-4 h-4" />}
      {justAdded ? 'Added!' : inCart ? 'Add another' : 'Add to cart'}
    </button>
  );
}
