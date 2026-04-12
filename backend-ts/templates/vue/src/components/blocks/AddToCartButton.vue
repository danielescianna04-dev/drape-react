<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { Icon } from '@iconify/vue';

const props = withDefaults(defineProps<{
  item: { id: string; name: string; price: number; image?: string };
  variant?: 'primary' | 'outline' | 'icon';
}>(), { variant: 'primary' });

const { addToCart, cart } = useAppStore();
const justAdded = ref(false);
const inCart = computed(() => cart.value.some(i => i.id === props.item.id));

const handleAdd = () => {
  addToCart(props.item);
  justAdded.value = true;
  setTimeout(() => { justAdded.value = false; }, 1500);
};
</script>

<template>
  <button v-if="variant === 'icon'" @click="handleAdd" class="p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-95" :class="justAdded ? 'bg-green-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'" :aria-label="`Add ${item.name} to cart`">
    <Icon :icon="justAdded ? 'mdi:check' : 'mdi:cart-outline'" :width="20" />
  </button>
  <button v-else @click="handleAdd" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 active:scale-95" :class="variant === 'outline' ? 'border border-gray-300 hover:bg-gray-50 text-gray-700' : justAdded ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:opacity-90'">
    <Icon :icon="justAdded ? 'mdi:check' : 'mdi:cart-outline'" :width="16" />
    {{ justAdded ? 'Added!' : inCart ? 'Add another' : 'Add to cart' }}
  </button>
</template>
