<script lang="ts">
  import FeatureCard from '$lib/components/FeatureCard.svelte';

  const features = [
    {
      icon: '⚡',
      title: 'Lightning Fast',
      description: 'Built on SvelteKit with zero virtual DOM overhead. Compiled at build time for maximum runtime performance.'
    },
    {
      icon: '🎨',
      title: 'Beautiful by Default',
      description: 'Stunning UI components with Tailwind CSS v4. Dark themes, glass effects, and smooth animations out of the box.'
    },
    {
      icon: '🔒',
      title: 'Type Safe',
      description: 'Full TypeScript support with strict mode. Catch errors before they reach production with compile-time checks.'
    },
    {
      icon: '📦',
      title: 'Zero Config',
      description: 'Works out of the box with sensible defaults. No complex configuration needed to get started building.'
    },
    {
      icon: '🌐',
      title: 'SSR & SSG',
      description: 'Server-side rendering and static site generation built in. Choose the right strategy for every page.'
    },
    {
      icon: '🔄',
      title: 'Reactive Stores',
      description: 'Svelte 5 runes make state management effortless. Fine-grained reactivity without the boilerplate.'
    }
  ];

  const stats = [
    { value: '99.9%', label: 'Uptime SLA' },
    { value: '<50ms', label: 'Response Time' },
    { value: '10M+', label: 'Requests/Day' },
    { value: '150+', label: 'Countries' }
  ];
</script>

<svelte:head>
  <title>SvelteApp - Build Faster, Ship Smarter</title>
  <meta name="description" content="Modern web applications built with SvelteKit, Svelte 5, and Tailwind CSS." />
</svelte:head>

<!-- Hero Section -->
<section class="relative pt-32 pb-20 px-4 overflow-hidden">
  <!-- Background effects -->
  <div class="absolute inset-0 -z-10">
    <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl animate-pulse"></div>
    <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl animate-pulse" style="animation-delay: 1s;"></div>
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl"></div>
  </div>

  <!-- Grid pattern -->
  <div class="absolute inset-0 -z-10 opacity-[0.03]"
       style="background-image: linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px); background-size: 60px 60px;">
  </div>

  <div class="max-w-7xl mx-auto text-center">
    <!-- Badge -->
    <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm text-primary-300 mb-8">
      <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
      Now in public beta &mdash; Svelte 5 powered
    </div>

    <!-- Heading -->
    <h1 class="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
      <span class="block text-white">Build faster with</span>
      <span class="block gradient-text mt-2">SvelteKit & Svelte 5</span>
    </h1>

    <p class="max-w-2xl mx-auto text-lg sm:text-xl text-surface-200 mb-10 leading-relaxed">
      The next generation web framework. Compile-time reactivity, server-side rendering,
      and the most intuitive developer experience. Ship production apps in record time.
    </p>

    <!-- CTA Buttons -->
    <div class="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
      <button class="btn-primary text-lg !px-10 !py-4">
        Start Building Free
        <svg class="inline-block w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </button>
      <button class="btn-secondary text-lg !px-10 !py-4">
        <svg class="inline-block w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Watch Demo
      </button>
    </div>

    <!-- Code preview -->
    <div class="max-w-3xl mx-auto glass rounded-2xl overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <div class="flex gap-1.5">
          <div class="w-3 h-3 rounded-full bg-red-500/80"></div>
          <div class="w-3 h-3 rounded-full bg-yellow-500/80"></div>
          <div class="w-3 h-3 rounded-full bg-green-500/80"></div>
        </div>
        <span class="text-xs text-surface-200 ml-2">+page.svelte</span>
      </div>
      <div class="p-6 text-left font-mono text-sm leading-relaxed">
        <span class="text-primary-400">&lt;script</span> <span class="text-blue-400">lang=</span><span class="text-green-400">"ts"</span><span class="text-primary-400">&gt;</span><br>
        &nbsp;&nbsp;<span class="text-purple-400">let</span> count = <span class="text-yellow-400">$state</span>(<span class="text-orange-400">0</span>);<br>
        &nbsp;&nbsp;<span class="text-purple-400">let</span> doubled = <span class="text-yellow-400">$derived</span>(count * <span class="text-orange-400">2</span>);<br>
        <span class="text-primary-400">&lt;/script&gt;</span><br><br>
        <span class="text-primary-400">&lt;button</span> <span class="text-blue-400">onclick=</span><span class="text-green-400">&#123;() =&gt; count++&#125;</span><span class="text-primary-400">&gt;</span><br>
        &nbsp;&nbsp;Clicks: &#123;count&#125; (doubled: &#123;doubled&#125;)<br>
        <span class="text-primary-400">&lt;/button&gt;</span>
      </div>
    </div>
  </div>
</section>

<!-- Stats Section -->
<section class="py-16 px-4 border-y border-white/5">
  <div class="max-w-7xl mx-auto">
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-8">
      {#each stats as stat}
        <div class="text-center">
          <div class="text-3xl sm:text-4xl font-bold gradient-text mb-1">{stat.value}</div>
          <div class="text-sm text-surface-200">{stat.label}</div>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- Features Section -->
<section class="py-24 px-4">
  <div class="max-w-7xl mx-auto">
    <div class="text-center mb-16">
      <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">
        Everything you need to <span class="gradient-text">ship fast</span>
      </h2>
      <p class="max-w-2xl mx-auto text-surface-200 text-lg">
        A complete toolkit for building modern web applications. From development to deployment, we have you covered.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each features as feature}
        <FeatureCard {...feature} />
      {/each}
    </div>
  </div>
</section>

<!-- CTA Section -->
<section class="py-24 px-4">
  <div class="max-w-4xl mx-auto text-center">
    <div class="glass rounded-3xl p-12 relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-br from-primary-600/10 to-indigo-600/10"></div>
      <div class="relative">
        <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to get started?</h2>
        <p class="text-surface-200 text-lg mb-8 max-w-lg mx-auto">
          Join thousands of developers building the next generation of web apps with SvelteKit.
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button class="btn-primary text-lg !px-10 !py-4">Start for Free</button>
          <button class="btn-secondary text-lg !px-10 !py-4">Talk to Sales</button>
        </div>
      </div>
    </div>
  </div>
</section>
