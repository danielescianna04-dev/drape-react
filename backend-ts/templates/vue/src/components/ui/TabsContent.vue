<script setup lang="ts">
import { inject, computed, type Ref } from 'vue'

const props = defineProps<{
  value: string
}>()

const activeTab = inject<Ref<string>>('tabs-active')
const isActive = computed(() => activeTab?.value === props.value)
</script>

<template>
  <div v-if="isActive" class="mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <slot />
  </div>
</template>
