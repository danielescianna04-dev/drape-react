<script setup lang="ts">
import NavBar from '../components/NavBar.vue'
import FooterSection from '../components/FooterSection.vue'

const team = [
  {
    name: 'Alex Chen',
    role: 'Lead Engineer',
    bio: 'Full-stack developer with a passion for building developer tools and open-source software.',
  },
  {
    name: 'Sarah Kim',
    role: 'Product Designer',
    bio: 'Design systems expert focused on creating delightful, accessible user experiences.',
  },
  {
    name: 'Marcus Rivera',
    role: 'DevOps Lead',
    bio: 'Infrastructure architect specializing in cloud-native deployments and CI/CD pipelines.',
  },
]

const values = [
  {
    icon: '\uD83C\uDFAF',
    title: 'Simplicity',
    description: 'We believe the best tools stay out of your way. Every feature is designed to reduce complexity, not add to it.',
  },
  {
    icon: '\uD83D\uDCA1',
    title: 'Innovation',
    description: 'We push the boundaries of what is possible on the web, adopting cutting-edge technologies early and responsibly.',
  },
  {
    icon: '\uD83E\uDD1D',
    title: 'Community',
    description: 'Open-source at heart. We build in public, welcome contributions, and believe great software is a collective effort.',
  },
]
</script>

<template>
  <div class="min-h-screen bg-bg-primary">
    <NavBar />

    <!-- Hero -->
    <section class="relative pt-32 pb-16 lg:pt-44 lg:pb-24 overflow-hidden">
      <div class="absolute inset-0 pointer-events-none overflow-hidden">
        <div class="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent-indigo/10 rounded-full blur-3xl" />
      </div>

      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="max-w-3xl mx-auto text-center">
          <div class="animate-fade-in-up inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent-purple/20 bg-accent-purple/5 mb-6">
            <span class="text-xs font-semibold text-accent-purple uppercase tracking-wider">About Us</span>
          </div>
          <h1 class="animate-fade-in-up delay-100 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-8">
            We're building the
            <span class="bg-gradient-to-r from-accent-purple via-accent-indigo to-accent-blue bg-clip-text text-transparent">
              future of development
            </span>
          </h1>
          <p class="animate-fade-in-up delay-200 text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto">
            A small, dedicated team on a mission to make web development faster, more enjoyable,
            and accessible to everyone. We craft tools that developers actually love to use.
          </p>
        </div>
      </div>
    </section>

    <!-- Mission -->
    <section class="py-16 lg:py-24 border-y border-border-subtle bg-bg-secondary/30">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <h2 class="animate-fade-in-up text-3xl lg:text-4xl font-extrabold tracking-tight mb-6">
              Our
              <span class="bg-gradient-to-r from-accent-purple to-accent-blue bg-clip-text text-transparent">
                mission
              </span>
            </h2>
            <div class="space-y-4 text-text-secondary leading-relaxed">
              <p class="animate-fade-in-up delay-100">
                We started with a simple observation: developers spend too much time on boilerplate
                and configuration, and not enough time building features their users actually need.
              </p>
              <p class="animate-fade-in-up delay-200">
                Our goal is to provide a foundation so solid, so well-thought-out, that you can
                go from idea to production in hours instead of weeks. We handle the architecture
                decisions so you can focus on what makes your project unique.
              </p>
              <p class="animate-fade-in-up delay-300">
                Every template, every component, and every configuration choice we make is driven
                by real-world production experience and community feedback.
              </p>
            </div>
          </div>
          <div class="animate-fade-in-up delay-200">
            <div class="relative rounded-2xl border border-border-subtle bg-bg-card p-8 lg:p-12">
              <div class="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent-purple/30 to-transparent" />
              <blockquote class="text-lg lg:text-xl font-medium text-text-primary italic leading-relaxed">
                "The best developer experience is one where the tools disappear and you're left
                with pure creative flow."
              </blockquote>
              <div class="mt-6 flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-accent-purple to-accent-blue" />
                <div>
                  <div class="text-sm font-semibold text-text-primary">Alex Chen</div>
                  <div class="text-xs text-text-muted">Lead Engineer</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Values -->
    <section class="py-20 lg:py-32">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="animate-fade-in-up text-3xl lg:text-4xl font-extrabold tracking-tight mb-4">
            Our values
          </h2>
          <p class="animate-fade-in-up delay-100 text-text-secondary text-lg">The principles that guide everything we build.</p>
        </div>

        <div class="grid sm:grid-cols-3 gap-8">
          <div
            v-for="(value, index) in values"
            :key="value.title"
            class="animate-fade-in-up text-center p-8 rounded-2xl border border-border-subtle bg-bg-card hover:bg-bg-card-hover hover:border-border-hover transition-all duration-500"
            :class="`delay-${(index + 1) * 100}`"
          >
            <div class="text-4xl mb-4">{{ value.icon }}</div>
            <h3 class="text-lg font-semibold text-text-primary mb-3">{{ value.title }}</h3>
            <p class="text-sm text-text-secondary leading-relaxed">{{ value.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Team -->
    <section class="py-20 lg:py-32 border-t border-border-subtle bg-bg-secondary/30">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="animate-fade-in-up text-3xl lg:text-4xl font-extrabold tracking-tight mb-4">
            Meet the
            <span class="bg-gradient-to-r from-accent-purple to-accent-blue bg-clip-text text-transparent">
              team
            </span>
          </h2>
          <p class="animate-fade-in-up delay-100 text-text-secondary text-lg">The people behind the product.</p>
        </div>

        <div class="grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div
            v-for="(member, index) in team"
            :key="member.name"
            class="animate-fade-in-up group text-center p-8 rounded-2xl border border-border-subtle bg-bg-card hover:bg-bg-card-hover hover:border-border-hover transition-all duration-500"
            :class="`delay-${(index + 1) * 100}`"
          >
            <div
              class="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-purple/30 to-accent-blue/30 border border-accent-purple/20 mx-auto mb-5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300"
            >
              <span class="text-2xl font-bold text-accent-purple">
                {{ member.name.split(' ').map((n: string) => n[0]).join('') }}
              </span>
            </div>
            <h3 class="text-base font-semibold text-text-primary mb-1">{{ member.name }}</h3>
            <p class="text-xs text-accent-purple font-medium mb-3">{{ member.role }}</p>
            <p class="text-sm text-text-secondary leading-relaxed">{{ member.bio }}</p>
          </div>
        </div>
      </div>
    </section>

    <FooterSection />
  </div>
</template>
