<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';

const props = withDefaults(defineProps<{
  placeholder?: string;
  debounceMs?: number;
}>(), { placeholder: 'Search...', debounceMs: 300 });

const emit = defineEmits<{ search: [query: string] }>();
const query = ref('');
let timer: ReturnType<typeof setTimeout>;

const handleInput = (value: string) => {
  query.value = value;
  clearTimeout(timer);
  timer = setTimeout(() => emit('search', value), props.debounceMs);
};

const handleClear = () => { query.value = ''; emit('search', ''); };

onUnmounted(() => clearTimeout(timer));
</script>

<template>
  <div class="relative">
    <Icon icon="mdi:magnify" :width="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
    <input type="text" :value="query" @input="handleInput(($event.target as HTMLInputElement).value)" :placeholder="placeholder" class="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors" />
    <button v-if="query" @click="handleClear" class="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Clear search">
      <Icon icon="mdi:close" :width="16" class="text-gray-400" />
    </button>
  </div>
</template>
