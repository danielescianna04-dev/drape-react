<script setup lang="ts">
/**
 * SafeButton — warns in dev mode when no click handler is provided.
 */
import { useAttrs, onMounted, getCurrentInstance } from 'vue';

const props = defineProps<{
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}>();

const attrs = useAttrs();

onMounted(() => {
  if (import.meta.env.DEV && !attrs.onClick && props.type !== 'submit' && !props.disabled) {
    const instance = getCurrentInstance();
    const label = instance?.vnode?.el?.textContent?.trim() || 'unknown';
    console.error(`[Drape] Dead button detected: "${label}" has no @click handler. Add a real handler or remove the button.`);
  }
});
</script>

<template>
  <button
    :type="type || 'button'"
    :disabled="disabled"
    v-bind="$attrs"
    class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
  >
    <slot />
  </button>
</template>
