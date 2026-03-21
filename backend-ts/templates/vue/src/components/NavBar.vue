<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'

const isScrolled = ref(false)
const isMobileMenuOpen = ref(false)

const handleScroll = () => {
  isScrolled.value = window.scrollY > 20
}

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <nav
    :class="[
      'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
      isScrolled
        ? 'bg-bg-primary/80 backdrop-blur-xl border-b border-border-subtle shadow-lg shadow-black/20'
        : 'bg-transparent',
    ]"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16 lg:h-20">
        <!-- Logo -->
        <RouterLink to="/" class="flex items-center gap-3 group">
          <div
            class="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center shadow-lg shadow-accent-purple/25 group-hover:shadow-accent-purple/40 transition-shadow duration-300"
          >
            <svg
              class="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <span
            class="text-lg font-bold bg-gradient-to-r from-text-primary to-text-secondary bg-clip-text text-transparent"
          >
            VueApp
          </span>
        </RouterLink>

        <!-- Desktop Nav -->
        <div class="hidden md:flex items-center gap-1">
          <RouterLink
            to="/"
            class="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all duration-200"
            active-class="!text-accent-purple bg-accent-purple/10"
          >
            Home
          </RouterLink>
          <RouterLink
            to="/about"
            class="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all duration-200"
            active-class="!text-accent-purple bg-accent-purple/10"
          >
            About
          </RouterLink>
          <a
            href="#features"
            class="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all duration-200"
          >
            Features
          </a>
        </div>

        <!-- CTA Button -->
        <div class="hidden md:flex items-center gap-3">
          <a
            href="#"
            class="relative px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-accent-purple via-accent-indigo to-accent-blue hover:opacity-90 transition-opacity duration-200 shadow-lg shadow-accent-purple/25"
          >
            Get Started
          </a>
        </div>

        <!-- Mobile Menu Button -->
        <button
          class="md:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
          @click="toggleMobileMenu"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path
              v-if="!isMobileMenuOpen"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
            <path
              v-else
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile Menu -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="isMobileMenuOpen"
        class="md:hidden border-t border-border-subtle bg-bg-primary/95 backdrop-blur-xl"
      >
        <div class="px-4 py-4 space-y-1">
          <RouterLink
            to="/"
            class="block px-4 py-3 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            @click="isMobileMenuOpen = false"
          >
            Home
          </RouterLink>
          <RouterLink
            to="/about"
            class="block px-4 py-3 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            @click="isMobileMenuOpen = false"
          >
            About
          </RouterLink>
          <a
            href="#"
            class="block mt-3 px-4 py-3 rounded-xl text-sm font-semibold text-center text-white bg-gradient-to-r from-accent-purple to-accent-blue"
          >
            Get Started
          </a>
        </div>
      </div>
    </Transition>
  </nav>
</template>
