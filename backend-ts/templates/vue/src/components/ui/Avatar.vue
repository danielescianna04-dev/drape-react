<script setup lang="ts">
import { ref, computed } from 'vue'
import { cn } from '../../lib/utils'

const props = withDefaults(defineProps<{
  src?: string
  alt?: string
  fallback?: string
  size?: 'sm' | 'md' | 'lg'
}>(), {
  alt: '',
  fallback: '?',
  size: 'md',
})

const imgError = ref(false)

const sizeClasses: Record<string, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
}

const classes = computed(() =>
  cn(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-light',
    sizeClasses[props.size],
  )
)

const showImage = computed(() => props.src && !imgError.value)
</script>

<template>
  <span :class="classes">
    <img
      v-if="showImage"
      :src="src"
      :alt="alt"
      class="aspect-square h-full w-full object-cover"
      @error="imgError = true"
    />
    <span v-else class="font-medium text-text-secondary">
      {{ fallback }}
    </span>
  </span>
</template>
