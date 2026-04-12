<script setup lang="ts">
import { ref } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { Icon } from '@iconify/vue';

const props = withDefaults(defineProps<{
  url?: string;
  title?: string;
  variant?: 'icon' | 'button';
}>(), { variant: 'icon' });

const { toastMessage, toastVisible } = useAppStore();
const copied = ref(false);

const handleShare = async () => {
  const shareUrl = props.url || window.location.href;
  const shareTitle = props.title || document.title;
  if (navigator.share) {
    try { await navigator.share({ title: shareTitle, url: shareUrl }); return; } catch { /* cancelled */ }
  }
  await navigator.clipboard.writeText(shareUrl);
  copied.value = true;
  toastMessage.value = 'Link copied!';
  toastVisible.value = true;
  setTimeout(() => { toastVisible.value = false; }, 2500);
  setTimeout(() => { copied.value = false; }, 2000);
};
</script>

<template>
  <button v-if="variant === 'button'" @click="handleShare" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 active:scale-95 border border-gray-300 hover:bg-gray-50 text-gray-700">
    <Icon :icon="copied ? 'mdi:check' : 'mdi:share-variant'" :width="16" />
    {{ copied ? 'Copied!' : 'Share' }}
  </button>
  <button v-else @click="handleShare" class="p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-95 hover:bg-gray-100" aria-label="Share">
    <Icon :icon="copied ? 'mdi:check' : 'mdi:share-variant'" :width="20" :class="copied ? 'text-green-500' : 'text-gray-500'" />
  </button>
</template>
