<script setup lang="ts">
/**
 * SafeLink — warns in dev mode when "to" is empty or "#".
 */
import { onMounted } from 'vue';

const props = defineProps<{
  to: string;
}>();

onMounted(() => {
  if (import.meta.env.DEV && (!props.to || props.to === '#' || props.to === '')) {
    console.error(`[Drape] Dead link detected: link points to "${props.to}". Use a real route path.`);
  }
});
</script>

<template>
  <router-link :to="to" v-bind="$attrs">
    <slot />
  </router-link>
</template>
