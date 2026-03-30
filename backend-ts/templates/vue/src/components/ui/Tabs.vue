<script setup lang="ts">
import { provide, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  defaultValue?: string
  modelValue?: string
}>(), {
  defaultValue: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const activeTab = ref(props.modelValue ?? props.defaultValue)

watch(() => props.modelValue, (val) => {
  if (val !== undefined) activeTab.value = val
})

function setTab(value: string) {
  activeTab.value = value
  emit('update:modelValue', value)
}

provide('tabs-active', activeTab)
provide('tabs-set', setTab)
</script>

<template>
  <div>
    <slot />
  </div>
</template>
