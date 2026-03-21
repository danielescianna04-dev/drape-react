<script lang="ts">
  const team = [
    { name: 'Alex Rivera', role: 'CEO & Co-founder', avatar: 'AR' },
    { name: 'Sam Chen', role: 'CTO & Co-founder', avatar: 'SC' },
    { name: 'Jordan Lee', role: 'Head of Design', avatar: 'JL' },
    { name: 'Morgan Davis', role: 'Lead Engineer', avatar: 'MD' }
  ];

  const values = [
    {
      icon: '🎯',
      title: 'Simplicity First',
      description: 'We believe the best tools get out of your way. Every feature is designed to reduce complexity, not add it.'
    },
    {
      icon: '🚀',
      title: 'Performance Matters',
      description: 'Speed is not a feature, it is a requirement. We obsess over every millisecond to deliver the fastest experience.'
    },
    {
      icon: '🤝',
      title: 'Community Driven',
      description: 'Open source at heart. We build with the community, for the community, guided by real developer needs.'
    }
  ];
</script>

<svelte:head>
  <title>About - SvelteApp</title>
  <meta name="description" content="Learn about the team and mission behind SvelteApp." />
</svelte:head>

<!-- Hero -->
<section class="relative pt-32 pb-16 px-4">
  <div class="absolute inset-0 -z-10">
    <div class="absolute top-1/3 left-1/3 w-96 h-96 bg-primary-600/15 rounded-full blur-3xl"></div>
    <div class="absolute bottom-1/3 right-1/3 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl"></div>
  </div>

  <div class="max-w-4xl mx-auto text-center">
    <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
      <span class="text-white">Built for </span>
      <span class="gradient-text">developers</span>
    </h1>
    <p class="text-lg sm:text-xl text-surface-200 leading-relaxed max-w-2xl mx-auto">
      We are a team of passionate engineers and designers who believe that building web applications
      should be fast, fun, and accessible to everyone.
    </p>
  </div>
</section>

<!-- Mission -->
<section class="py-16 px-4">
  <div class="max-w-7xl mx-auto">
    <div class="glass rounded-3xl p-8 md:p-12">
      <div class="grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 class="text-2xl sm:text-3xl font-bold text-white mb-4">Our Mission</h2>
          <p class="text-surface-200 leading-relaxed mb-4">
            We started this project because we were frustrated with the complexity of modern web development.
            Configuration files, build tools, state management libraries &mdash; it felt like we were spending
            more time on tooling than on building actual products.
          </p>
          <p class="text-surface-200 leading-relaxed">
            Our mission is to make web development simple again. By leveraging Svelte 5's compile-time
            approach and SvelteKit's full-stack capabilities, we provide a platform that lets you focus
            on what matters: your application.
          </p>
        </div>
        <div class="relative">
          <div class="aspect-square rounded-2xl bg-gradient-to-br from-primary-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center">
            <div class="text-center">
              <div class="text-6xl mb-4">🌟</div>
              <div class="text-2xl font-bold gradient-text">Since 2024</div>
              <div class="text-surface-200 text-sm mt-1">Empowering developers worldwide</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Values -->
<section class="py-16 px-4">
  <div class="max-w-7xl mx-auto">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold text-white mb-4">Our Values</h2>
      <p class="text-surface-200 max-w-xl mx-auto">The principles that guide everything we build.</p>
    </div>
    <div class="grid md:grid-cols-3 gap-6">
      {#each values as value}
        <div class="glass rounded-2xl p-8 text-center hover:bg-white/10 transition-all duration-500 hover:-translate-y-1">
          <div class="text-4xl mb-4">{value.icon}</div>
          <h3 class="text-xl font-semibold text-white mb-3">{value.title}</h3>
          <p class="text-surface-200 text-sm leading-relaxed">{value.description}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- Team -->
<section class="py-16 px-4">
  <div class="max-w-7xl mx-auto">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold text-white mb-4">Meet the Team</h2>
      <p class="text-surface-200 max-w-xl mx-auto">The people making it all happen.</p>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
      {#each team as member}
        <div class="glass rounded-2xl p-6 text-center group hover:bg-white/10 transition-all duration-500 hover:-translate-y-1">
          <div class="w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center mx-auto mb-4
                      group-hover:scale-110 transition-transform duration-500">
            <span class="text-xl font-bold text-white">{member.avatar}</span>
          </div>
          <h3 class="text-white font-semibold">{member.name}</h3>
          <p class="text-surface-200 text-sm mt-1">{member.role}</p>
        </div>
      {/each}
    </div>
  </div>
</section>
