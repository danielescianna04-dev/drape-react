import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="relative min-h-screen pt-32 pb-24">
      <!-- Background -->
      <div class="absolute inset-0">
        <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-purple-600/15 rounded-full blur-[128px]"></div>
        <div class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]"></div>
      </div>

      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- Header -->
        <div class="text-center mb-20">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold uppercase tracking-wider mb-6">
            About Us
          </div>
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight">
            We're building the future
            <br />
            <span class="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              of development
            </span>
          </h1>
          <p class="max-w-2xl mx-auto text-lg text-gray-400 leading-relaxed">
            Founded in 2024, we set out to create the tools we always wished existed.
            Our mission is to make software development faster, more enjoyable, and accessible to everyone.
          </p>
        </div>

        <!-- Values Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
          <div class="p-8 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/20 transition-all duration-300">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/10 flex items-center justify-center mb-6">
              <svg class="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-white mb-3">Innovation First</h3>
            <p class="text-gray-400 leading-relaxed">
              We push boundaries and challenge conventions. Every feature we build is designed to be years ahead of the curve.
            </p>
          </div>

          <div class="p-8 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/20 transition-all duration-300">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/10 flex items-center justify-center mb-6">
              <svg class="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-white mb-3">Developer Obsessed</h3>
            <p class="text-gray-400 leading-relaxed">
              Every decision starts with the developer experience. We dogfood our own products daily and iterate based on real feedback.
            </p>
          </div>

          <div class="p-8 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/20 transition-all duration-300">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/10 flex items-center justify-center mb-6">
              <svg class="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-white mb-3">Open & Transparent</h3>
            <p class="text-gray-400 leading-relaxed">
              We build in public, share our roadmap openly, and believe that transparency creates trust and better products.
            </p>
          </div>
        </div>

        <!-- Team Section -->
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Meet the Team</h2>
          <p class="text-gray-400 max-w-xl mx-auto">
            A small but mighty team of engineers, designers, and dreamers.
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          @for (member of team; track member.name) {
            <div class="group p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/20 transition-all duration-300 text-center">
              <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500/30 to-indigo-500/30 border border-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <span class="text-3xl">{{ member.avatar }}</span>
              </div>
              <h3 class="text-lg font-semibold text-white mb-1">{{ member.name }}</h3>
              <p class="text-sm text-purple-400 mb-3">{{ member.role }}</p>
              <p class="text-sm text-gray-500">{{ member.bio }}</p>
            </div>
          }
        </div>

        <!-- CTA -->
        <div class="text-center p-12 rounded-3xl bg-gradient-to-br from-purple-500/10 via-transparent to-indigo-500/10 border border-white/[0.06]">
          <h2 class="text-2xl sm:text-3xl font-bold text-white mb-4">Want to join us?</h2>
          <p class="text-gray-400 mb-8 max-w-lg mx-auto">
            We're always looking for talented people who share our passion for building great developer tools.
          </p>
          <a
            href="#"
            class="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl hover:from-purple-500 hover:to-indigo-500 transition-all duration-300 shadow-2xl shadow-purple-500/25 hover:shadow-purple-500/40"
          >
            View Open Positions
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  `,
})
export class AboutComponent {
  team = [
    { name: 'Alex Chen', role: 'CEO & Co-founder', avatar: '\uD83D\uDC68\u200D\uD83D\uDCBB', bio: 'Former Staff Engineer at Stripe. Loves Rust and hiking.' },
    { name: 'Sarah Kim', role: 'CTO & Co-founder', avatar: '\uD83D\uDC69\u200D\uD83D\uDD2C', bio: 'PhD in Distributed Systems. Built infra at scale.' },
    { name: 'Marcus Rivera', role: 'Head of Design', avatar: '\uD83C\uDFA8', bio: 'Ex-Figma designer. Obsessed with micro-interactions.' },
    { name: 'Priya Patel', role: 'Lead Engineer', avatar: '\uD83D\uDC69\u200D\uD83D\uDCBB', bio: 'Open source contributor. TypeScript enthusiast.' },
  ];
}
