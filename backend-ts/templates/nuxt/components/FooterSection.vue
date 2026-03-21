<script setup lang="ts">
const currentYear = new Date().getFullYear()

const footerLinks = {
  product: [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#' },
    { label: 'Changelog', href: '#' },
    { label: 'Documentation', href: '#' },
  ],
  company: [
    { label: 'About', to: '/about' },
    { label: 'Blog', href: '#' },
    { label: 'Careers', href: '#' },
    { label: 'Contact', href: '#' },
  ],
  legal: [
    { label: 'Privacy', href: '#' },
    { label: 'Terms', href: '#' },
    { label: 'License', href: '#' },
  ],
}
</script>

<template>
  <footer class="relative border-t border-border-subtle bg-bg-primary">
    <!-- Gradient line at top -->
    <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-purple/50 to-transparent" />

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
        <!-- Brand Column -->
        <div class="col-span-2 md:col-span-1">
          <div class="flex items-center gap-3 mb-4">
            <div
              class="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center"
            >
              <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span class="font-bold text-text-primary">NuxtApp</span>
          </div>
          <p class="text-sm text-text-secondary leading-relaxed mb-6 max-w-xs">
            Build modern web applications with server-side rendering and an elegant developer experience.
          </p>
          <div class="flex items-center gap-3">
            <a
              v-for="social in ['github', 'twitter', 'discord']"
              :key="social"
              href="#"
              class="w-9 h-9 rounded-lg border border-border-subtle bg-bg-card flex items-center justify-center text-text-muted hover:text-accent-purple hover:border-border-hover transition-all duration-200"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="4" />
              </svg>
            </a>
          </div>
        </div>

        <!-- Product Links -->
        <div>
          <h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-4">Product</h4>
          <ul class="space-y-3">
            <li v-for="link in footerLinks.product" :key="link.label">
              <a
                :href="link.href"
                class="text-sm text-text-secondary hover:text-text-primary transition-colors duration-200"
              >
                {{ link.label }}
              </a>
            </li>
          </ul>
        </div>

        <!-- Company Links -->
        <div>
          <h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-4">Company</h4>
          <ul class="space-y-3">
            <li v-for="link in footerLinks.company" :key="link.label">
              <NuxtLink
                v-if="link.to"
                :to="link.to"
                class="text-sm text-text-secondary hover:text-text-primary transition-colors duration-200"
              >
                {{ link.label }}
              </NuxtLink>
              <a
                v-else
                :href="link.href"
                class="text-sm text-text-secondary hover:text-text-primary transition-colors duration-200"
              >
                {{ link.label }}
              </a>
            </li>
          </ul>
        </div>

        <!-- Legal Links -->
        <div>
          <h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-4">Legal</h4>
          <ul class="space-y-3">
            <li v-for="link in footerLinks.legal" :key="link.label">
              <a
                :href="link.href"
                class="text-sm text-text-secondary hover:text-text-primary transition-colors duration-200"
              >
                {{ link.label }}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom bar -->
      <div class="mt-16 pt-8 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-4">
        <p class="text-xs text-text-muted">
          &copy; {{ currentYear }} NuxtApp. All rights reserved.
        </p>
        <p class="text-xs text-text-muted">
          Built with
          <span class="text-accent-purple">Nuxt</span>
          +
          <span class="text-accent-blue">Tailwind CSS</span>
        </p>
      </div>
    </div>
  </footer>
</template>
