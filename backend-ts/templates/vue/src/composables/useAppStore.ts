import { ref, computed } from 'vue';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  quantity: number;
}

const cart = ref<CartItem[]>([]);
const favorites = ref<string[]>([]);
const toastMessage = ref('');
const toastVisible = ref(false);

function showToast(message: string) {
  toastMessage.value = message;
  toastVisible.value = true;
  setTimeout(() => { toastVisible.value = false; }, 2500);
}

export function useAppStore() {
  const addToCart = (item: Omit<CartItem, 'quantity'>) => {
    const existing = cart.value.find(i => i.id === item.id);
    if (existing) {
      cart.value = cart.value.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      showToast(`Updated ${item.name} quantity`);
    } else {
      cart.value = [...cart.value, { ...item, quantity: 1 }];
      showToast(`${item.name} added to cart`);
    }
  };

  const removeFromCart = (id: string) => {
    const item = cart.value.find(i => i.id === id);
    if (item) showToast(`${item.name} removed`);
    cart.value = cart.value.filter(i => i.id !== id);
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) { cart.value = cart.value.filter(i => i.id !== id); return; }
    cart.value = cart.value.map(i => i.id === id ? { ...i, quantity } : i);
  };

  const clearCart = () => { cart.value = []; showToast('Cart cleared'); };

  const cartTotal = computed(() => cart.value.reduce((s, i) => s + i.price * i.quantity, 0));
  const cartCount = computed(() => cart.value.reduce((s, i) => s + i.quantity, 0));

  const toggleFavorite = (id: string) => {
    if (favorites.value.includes(id)) {
      favorites.value = favorites.value.filter(i => i !== id);
      showToast('Removed from favorites');
    } else {
      favorites.value = [...favorites.value, id];
      showToast('Added to favorites');
    }
  };

  const isFavorite = (id: string) => favorites.value.includes(id);

  return {
    cart, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount,
    favorites, toggleFavorite, isFavorite, toastMessage, toastVisible,
  };
}
