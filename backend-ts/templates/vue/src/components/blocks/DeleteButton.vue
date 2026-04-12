<script setup lang="ts">
import { ref } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { Icon } from '@iconify/vue';

const props = withDefaults(defineProps<{
  label?: string;
  confirmMessage?: string;
  variant?: 'icon' | 'button';
}>(), { label: 'Delete', variant: 'icon' });

const emit = defineEmits<{ delete: [] }>();
const { toastMessage, toastVisible } = useAppStore();
const confirming = ref(false);

const handleClick = () => {
  if (props.confirmMessage && !confirming.value) {
    confirming.value = true;
    setTimeout(() => { confirming.value = false; }, 3000);
    return;
  }
  emit('delete');
  confirming.value = false;
  toastMessage.value = 'Deleted';
  toastVisible.value = true;
  setTimeout(() => { toastVisible.value = false; }, 2500);
};
</script>

<template>
  <button v-if="variant === 'button'" @click="handleClick" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 active:scale-95" :class="confirming ? 'bg-red-500 text-white' : 'border border-red-200 text-red-600 hover:bg-red-50'">
    <Icon icon="mdi:delete-outline" :width="16" />
    {{ confirming ? 'Confirm?' : label }}
  </button>
  <button v-else @click="handleClick" class="p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-95" :class="confirming ? 'bg-red-500 text-white' : 'hover:bg-red-50 text-red-400 hover:text-red-600'" :aria-label="confirming ? 'Confirm delete' : label">
    <Icon icon="mdi:delete-outline" :width="20" />
  </button>
</template>
