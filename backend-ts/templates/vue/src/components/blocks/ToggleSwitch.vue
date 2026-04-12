<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: boolean;
  label?: string;
}>(), { modelValue: false });

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const handleToggle = () => emit('update:modelValue', !props.modelValue);
</script>

<template>
  <label class="inline-flex items-center gap-3 cursor-pointer">
    <button role="switch" :aria-checked="modelValue" @click="handleToggle" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200" :class="modelValue ? 'bg-primary' : 'bg-gray-300'">
      <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 shadow-sm" :class="modelValue ? 'translate-x-6' : 'translate-x-1'" />
    </button>
    <span v-if="label" class="text-sm text-gray-700">{{ label }}</span>
  </label>
</template>
