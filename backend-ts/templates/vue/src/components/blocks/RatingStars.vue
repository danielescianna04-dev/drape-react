<script setup lang="ts">
import { ref } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { Icon } from '@iconify/vue';

const props = withDefaults(defineProps<{
  initialRating?: number;
  maxStars?: number;
  readOnly?: boolean;
}>(), { initialRating: 0, maxStars: 5, readOnly: false });

const emit = defineEmits<{ rate: [rating: number] }>();
const { toastMessage, toastVisible } = useAppStore();
const rating = ref(props.initialRating);
const hover = ref(0);

const handleRate = (star: number) => {
  if (props.readOnly) return;
  rating.value = star;
  emit('rate', star);
  toastMessage.value = `Rated ${star} star${star !== 1 ? 's' : ''}`;
  toastVisible.value = true;
  setTimeout(() => { toastVisible.value = false; }, 2500);
};
</script>

<template>
  <div class="inline-flex items-center gap-0.5">
    <button v-for="star in maxStars" :key="star" @click="handleRate(star)" @mouseenter="!readOnly && (hover = star)" @mouseleave="!readOnly && (hover = 0)" class="transition-transform duration-150" :class="readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-125 active:scale-95'" :disabled="readOnly" :aria-label="`Rate ${star} star${star !== 1 ? 's' : ''}`">
      <Icon :icon="(hover || rating) >= star ? 'mdi:star' : 'mdi:star-outline'" :width="20" :class="(hover || rating) >= star ? 'text-yellow-400' : 'text-gray-300'" class="transition-colors duration-150" />
    </button>
  </div>
</template>
