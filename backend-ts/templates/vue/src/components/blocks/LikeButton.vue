<script setup lang="ts">
import { ref } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { Icon } from '@iconify/vue';

const props = withDefaults(defineProps<{
  itemId: string;
  initialLiked?: boolean;
  showCount?: boolean;
  initialCount?: number;
}>(), { initialLiked: false, showCount: false, initialCount: 0 });

const emit = defineEmits<{ toggle: [liked: boolean] }>();
const { toggleFavorite } = useAppStore();
const liked = ref(props.initialLiked);
const count = ref(props.initialCount);

const handleToggle = () => {
  liked.value = !liked.value;
  count.value += liked.value ? 1 : -1;
  if (count.value < 0) count.value = 0;
  toggleFavorite(props.itemId);
  emit('toggle', liked.value);
};
</script>

<template>
  <button @click="handleToggle" class="rounded-full transition-all duration-200 hover:scale-110 active:scale-95 p-2" :aria-label="liked ? 'Remove from favorites' : 'Add to favorites'">
    <Icon :icon="liked ? 'mdi:heart' : 'mdi:heart-outline'" :width="20" :class="liked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'" class="transition-colors duration-200" />
    <span v-if="showCount" class="text-xs text-gray-500 ml-1">{{ count }}</span>
  </button>
</template>
