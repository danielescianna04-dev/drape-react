<script setup lang="ts">
interface FilterChip { id: string; label: string; }

const props = withDefaults(defineProps<{
  chips: FilterChip[];
  modelValue: string[];
  multiple?: boolean;
}>(), { multiple: true });

const emit = defineEmits<{ 'update:modelValue': [selected: string[]] }>();

const handleToggle = (chipId: string) => {
  if (props.multiple) {
    emit('update:modelValue', props.modelValue.includes(chipId) ? props.modelValue.filter(id => id !== chipId) : [...props.modelValue, chipId]);
  } else {
    emit('update:modelValue', props.modelValue.includes(chipId) ? [] : [chipId]);
  }
};
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button v-for="chip in chips" :key="chip.id" @click="handleToggle(chip.id)" class="px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 active:scale-95" :class="modelValue.includes(chip.id) ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
      {{ chip.label }}
    </button>
  </div>
</template>
