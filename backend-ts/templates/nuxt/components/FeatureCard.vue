<script setup lang="ts">
interface Props {
  icon: string
  title: string
  description: string
  delay?: string
}

withDefaults(defineProps<Props>(), {
  delay: 'delay-100',
})
</script>

<template>
  <div
    :class="[
      'group relative p-6 lg:p-8 rounded-2xl border border-border-subtle',
      'bg-bg-card hover:bg-bg-card-hover',
      'hover:border-border-hover',
      'transition-all duration-500 ease-out',
      'hover:-translate-y-1 hover:shadow-xl hover:shadow-accent-purple/5',
      'animate-fade-in-up',
      delay,
    ]"
  >
    <!-- Gradient glow on hover -->
    <div
      class="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent-purple/5 via-transparent to-accent-blue/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
    />

    <div class="relative">
      <!-- Icon -->
      <div
        class="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-purple/20 to-accent-blue/20 border border-accent-purple/20 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-accent-purple/20 transition-all duration-300"
      >
        <span class="text-2xl">{{ icon }}</span>
      </div>

      <!-- Content -->
      <h3
        class="text-lg font-semibold text-text-primary mb-3 group-hover:text-accent-purple transition-colors duration-300"
      >
        {{ title }}
      </h3>
      <p class="text-sm leading-relaxed text-text-secondary">
        {{ description }}
      </p>

      <!-- Arrow indicator -->
      <div
        class="mt-5 flex items-center gap-2 text-xs font-medium text-text-muted group-hover:text-accent-purple transition-all duration-300"
      >
        <span>Learn more</span>
        <svg
          class="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform duration-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
      </div>
    </div>
  </div>
</template>
