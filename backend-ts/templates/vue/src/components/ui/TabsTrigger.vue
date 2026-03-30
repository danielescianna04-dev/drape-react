<script setup lang="ts">
import { inject, computed, type Ref } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps<{
  value: string
}>()

const activeTab = inject<Ref<string>>('tabs-active')
const setTab = inject<(value: string) => void>('tabs-set')

const isActive = computed(() => activeTab?.value === props.value)
</script>

<template>
  <button
    :class="cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      isActive
        ? 'bg-surface text-text-primary shadow-sm'
        : 'text-text-muted hover:text-text-primary'
    )"
    @click="setTab?.(props.value)"
  >
    <slot />
  </button>
</template>
