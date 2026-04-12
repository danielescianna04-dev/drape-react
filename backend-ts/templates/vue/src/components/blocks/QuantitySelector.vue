<script setup lang="ts">
import { Icon } from '@iconify/vue';

const props = withDefaults(defineProps<{
  modelValue: number;
  min?: number;
  max?: number;
}>(), { min: 0, max: 99 });

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
</script>

<template>
  <div class="inline-flex items-center gap-1 rounded-lg border border-gray-200">
    <button @click="emit('update:modelValue', Math.max(min, modelValue - 1))" :disabled="modelValue <= min" class="p-2 hover:bg-gray-100 rounded-l-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Decrease quantity">
      <Icon icon="mdi:minus" :width="16" />
    </button>
    <span class="w-10 text-center text-sm font-medium tabular-nums">{{ modelValue }}</span>
    <button @click="emit('update:modelValue', Math.min(max, modelValue + 1))" :disabled="modelValue >= max" class="p-2 hover:bg-gray-100 rounded-r-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Increase quantity">
      <Icon icon="mdi:plus" :width="16" />
    </button>
  </div>
</template>
