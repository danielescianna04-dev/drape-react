<script lang="ts">
  import { page } from '$app/stores';

  let mobileMenuOpen = $state(false);

  const links = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' }
  ];
</script>

<nav class="fixed top-0 w-full z-50 glass">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-16">
      <a href="/" class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center">
          <span class="text-white font-bold text-sm">S</span>
        </div>
        <span class="text-xl font-bold gradient-text">SvelteApp</span>
      </a>

      <div class="hidden md:flex items-center gap-1">
        {#each links as link}
          <a
            href={link.href}
            class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                   {$page.url.pathname === link.href
                     ? 'text-white bg-white/10'
                     : 'text-surface-200 hover:text-white hover:bg-white/5'}"
          >
            {link.label}
          </a>
        {/each}
      </div>

      <div class="hidden md:flex items-center gap-3">
        <a href="/about" class="text-sm text-surface-200 hover:text-white transition-colors">Sign In</a>
        <button class="btn-primary text-sm !px-5 !py-2">Get Started</button>
      </div>

      <button
        class="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
        onclick={() => mobileMenuOpen = !mobileMenuOpen}
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {#if mobileMenuOpen}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          {/if}
        </svg>
      </button>
    </div>
  </div>

  {#if mobileMenuOpen}
    <div class="md:hidden border-t border-white/10 bg-surface-950/95 backdrop-blur-xl">
      <div class="px-4 py-3 space-y-1">
        {#each links as link}
          <a
            href={link.href}
            class="block px-4 py-2 rounded-lg text-sm font-medium transition-colors
                   {$page.url.pathname === link.href
                     ? 'text-white bg-white/10'
                     : 'text-surface-200 hover:text-white hover:bg-white/5'}"
            onclick={() => mobileMenuOpen = false}
          >
            {link.label}
          </a>
        {/each}
        <div class="pt-3 border-t border-white/10">
          <button class="btn-primary w-full text-sm !py-2">Get Started</button>
        </div>
      </div>
    </div>
  {/if}
</nav>
