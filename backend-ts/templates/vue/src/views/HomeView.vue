<script setup lang="ts">
import NavBar from '../components/NavBar.vue'
import FeatureCard from '../components/FeatureCard.vue'
import FooterSection from '../components/FooterSection.vue'

const features = [
  {
    icon: '\u26A1',
    title: 'Lightning Fast',
    description:
      'Optimized build pipeline with instant HMR. See changes reflected in milliseconds, not seconds. Powered by Vite for the fastest development experience.',
  },
  {
    icon: '\uD83D\uDD12',
    title: 'Type Safe',
    description:
      'Full TypeScript support out of the box. Catch errors at compile time, enjoy superior autocompletion, and ship with confidence.',
  },
  {
    icon: '\uD83C\uDFA8',
    title: 'Beautiful UI',
    description:
      'Tailwind CSS v4 with a carefully crafted design system. Build stunning interfaces without writing custom CSS from scratch.',
  },
  {
    icon: '\uD83D\uDE80',
    title: 'Production Ready',
    description:
      'Enterprise-grade architecture with code splitting, lazy loading, and optimized bundles. Deploy anywhere with zero configuration.',
  },
  {
    icon: '\uD83D\uDD27',
    title: 'Developer Experience',
    description:
      'Vue 3 Composition API, script setup, and modern tooling. Write less boilerplate and focus on building features that matter.',
  },
  {
    icon: '\uD83C\uDF10',
    title: 'Fully Responsive',
    description:
      'Every component is built mobile-first with fluid layouts. Your app looks pixel-perfect on any screen size, from phones to ultrawide monitors.',
  },
]

const stats = [
  { value: '99.9%', label: 'Uptime SLA' },
  { value: '<50ms', label: 'Response Time' },
  { value: '10K+', label: 'Active Users' },
  { value: '4.9/5', label: 'Satisfaction' },
]
</script>

<template>
  <div class="min-h-screen bg-bg-primary">
    <NavBar />

    <!-- Hero Section -->
    <section class="relative pt-32 pb-20 lg:pt-44 lg:pb-32 overflow-hidden">
      <!-- Background decorations -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <!-- Gradient orbs -->
        <div
          class="absolute -top-40 -right-40 w-96 h-96 bg-accent-purple/15 rounded-full blur-3xl animate-float"
        />
        <div
          class="absolute top-20 -left-40 w-80 h-80 bg-accent-blue/10 rounded-full blur-3xl animate-float delay-200"
        />
        <div
          class="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-accent-purple/20 to-transparent"
        />
        <!-- Grid pattern -->
        <div
          class="absolute inset-0 opacity-[0.02]"
          style="background-image: linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px); background-size: 64px 64px"
        />
      </div>

      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="max-w-4xl mx-auto text-center">
          <!-- Badge -->
          <div class="animate-fade-in-up inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border-subtle bg-bg-card mb-8">
            <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span class="text-xs font-medium text-text-secondary">Now in Public Beta</span>
            <svg class="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>

          <!-- Heading -->
          <h1 class="animate-fade-in-up delay-100 text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-8">
            Build amazing apps
            <br />
            <span
              class="bg-gradient-to-r from-gradient-start via-gradient-mid to-gradient-end bg-clip-text text-transparent animate-gradient"
            >
              at lightning speed
            </span>
          </h1>

          <!-- Subtitle -->
          <p class="animate-fade-in-up delay-200 text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
            A modern Vue 3 starter with TypeScript, Tailwind CSS v4, and everything you need
            to ship production-ready applications in record time.
          </p>

          <!-- CTA Buttons -->
          <div class="animate-fade-in-up delay-300 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#features"
              class="group relative inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-accent-purple via-accent-indigo to-accent-blue hover:opacity-90 transition-all duration-300 shadow-2xl shadow-accent-purple/25 hover:shadow-accent-purple/40"
            >
              Explore Features
              <svg
                class="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
            <a
              href="#"
              class="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-semibold text-text-secondary border border-border-subtle bg-bg-card hover:bg-bg-card-hover hover:text-text-primary hover:border-border-hover transition-all duration-300"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path
                  d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>

        <!-- Hero visual / Code preview -->
        <div class="animate-fade-in-up delay-500 mt-20 max-w-3xl mx-auto">
          <div class="relative rounded-2xl border border-border-subtle bg-bg-secondary overflow-hidden shadow-2xl shadow-black/40">
            <!-- Window controls -->
            <div class="flex items-center gap-2 px-4 py-3 border-b border-border-subtle bg-bg-primary/50">
              <div class="w-3 h-3 rounded-full bg-red-500/60" />
              <div class="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div class="w-3 h-3 rounded-full bg-green-500/60" />
              <span class="ml-3 text-xs text-text-muted font-mono">App.vue</span>
            </div>
            <!-- Code content -->
            <div class="p-6 font-mono text-sm leading-relaxed">
              <div><span class="text-accent-purple">&lt;script</span> <span class="text-accent-blue">setup</span> <span class="text-accent-purple">lang=</span><span class="text-green-400">"ts"</span><span class="text-accent-purple">&gt;</span></div>
              <div class="text-text-secondary pl-4">import { ref } from <span class="text-green-400">'vue'</span></div>
              <div class="text-text-secondary pl-4">const count = <span class="text-accent-blue">ref</span>(<span class="text-accent-purple">0</span>)</div>
              <div><span class="text-accent-purple">&lt;/script&gt;</span></div>
              <div class="mt-2"><span class="text-accent-purple">&lt;template&gt;</span></div>
              <div class="text-text-secondary pl-4">&lt;button <span class="text-accent-blue">@click</span>=<span class="text-green-400">"count++"</span>&gt;</div>
              <div class="text-text-primary pl-8">Count is {{ '{{ count }}' }}</div>
              <div class="text-text-secondary pl-4">&lt;/button&gt;</div>
              <div><span class="text-accent-purple">&lt;/template&gt;</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Stats Section -->
    <section class="py-16 lg:py-20 border-y border-border-subtle bg-bg-secondary/50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-8">
          <div
            v-for="(stat, index) in stats"
            :key="stat.label"
            class="text-center animate-fade-in-up"
            :class="`delay-${(index + 1) * 100}`"
          >
            <div
              class="text-3xl lg:text-4xl font-extrabold bg-gradient-to-r from-accent-purple to-accent-blue bg-clip-text text-transparent mb-2"
            >
              {{ stat.value }}
            </div>
            <div class="text-sm text-text-secondary">{{ stat.label }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="py-20 lg:py-32">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- Section header -->
        <div class="max-w-2xl mx-auto text-center mb-16 lg:mb-20">
          <div class="animate-fade-in-up inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent-purple/20 bg-accent-purple/5 mb-6">
            <span class="text-xs font-semibold text-accent-purple uppercase tracking-wider">Features</span>
          </div>
          <h2 class="animate-fade-in-up delay-100 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-6">
            Everything you need to
            <span class="bg-gradient-to-r from-accent-purple to-accent-blue bg-clip-text text-transparent">
              build faster
            </span>
          </h2>
          <p class="animate-fade-in-up delay-200 text-text-secondary text-lg leading-relaxed">
            A complete toolkit designed for modern web development. From blazing-fast builds
            to beautiful, responsive components.
          </p>
        </div>

        <!-- Features grid -->
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            v-for="(feature, index) in features"
            :key="feature.title"
            :icon="feature.icon"
            :title="feature.title"
            :description="feature.description"
            :delay="`delay-${(index + 1) * 100}`"
          />
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-20 lg:py-32">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          class="relative rounded-3xl border border-border-subtle bg-gradient-to-br from-bg-secondary via-bg-primary to-bg-secondary overflow-hidden"
        >
          <!-- Background effects -->
          <div class="absolute inset-0 pointer-events-none">
            <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-accent-purple/30 to-transparent" />
            <div class="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 bg-accent-purple/10 rounded-full blur-3xl" />
            <div class="absolute -bottom-20 right-20 w-48 h-48 bg-accent-blue/10 rounded-full blur-3xl" />
          </div>

          <div class="relative px-8 py-16 lg:px-16 lg:py-24 text-center">
            <h2 class="animate-fade-in-up text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-6">
              Ready to get
              <span class="bg-gradient-to-r from-accent-purple to-accent-blue bg-clip-text text-transparent">
                started?
              </span>
            </h2>
            <p class="animate-fade-in-up delay-100 text-text-secondary text-lg max-w-xl mx-auto mb-10">
              Join thousands of developers building the next generation of web applications. Start shipping today.
            </p>
            <div class="animate-fade-in-up delay-200 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="#"
                class="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-accent-purple to-accent-blue hover:opacity-90 transition-all shadow-2xl shadow-accent-purple/25"
              >
                Start Building
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
              <a
                href="#"
                class="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors"
              >
                Read Documentation
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <FooterSection />
  </div>
</template>
