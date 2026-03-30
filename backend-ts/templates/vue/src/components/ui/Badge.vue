<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '../../lib/utils'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
}>(), {
  variant: 'default',
})

const variantClasses: Record<string, string> = {
  default: 'bg-primary text-white',
  secondary: 'bg-surface-light text-text-primary',
  destructive: 'bg-red-500 text-white',
  outline: 'border border-border text-text-primary bg-transparent',
}

const classes = computed(() =>
  cn(
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
    variantClasses[props.variant],
  )
)
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
