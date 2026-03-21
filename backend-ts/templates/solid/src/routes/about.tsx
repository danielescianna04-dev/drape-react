import { Title, Meta } from '@solidjs/meta';
import { For } from 'solid-js';

const team = [
  { name: 'Alex Rivera', role: 'CEO & Co-founder', avatar: 'AR' },
  { name: 'Sam Chen', role: 'CTO & Co-founder', avatar: 'SC' },
  { name: 'Jordan Lee', role: 'Head of Design', avatar: 'JL' },
  { name: 'Morgan Davis', role: 'Lead Engineer', avatar: 'MD' }
];

const principles = [
  {
    icon: '🎯',
    title: 'No Virtual DOM',
    description: 'We took a fundamentally different approach. Instead of diffing virtual trees, Solid compiles your components to real DOM operations. The result is unmatched performance.'
  },
  {
    icon: '🧪',
    title: 'Proven at Scale',
    description: 'Used by companies processing millions of requests daily. From dashboards to e-commerce, Solid handles any workload with consistent sub-millisecond updates.'
  },
  {
    icon: '🌱',
    title: 'Growing Ecosystem',
    description: 'SolidStart for full-stack, Solid UI for components, and a vibrant community building tools, libraries, and resources every day.'
  }
];

export default function About() {
  return (
    <>
      <Title>About - SolidApp</Title>
      <Meta name="description" content="Learn about the team and philosophy behind SolidApp." />

      {/* Hero */}
      <section class="relative pt-32 pb-16 px-4">
        <div class="absolute inset-0 -z-10">
          <div class="absolute top-1/3 left-1/4 w-96 h-96 bg-primary-600/15 rounded-full blur-3xl"></div>
          <div class="absolute bottom-1/3 right-1/3 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl"></div>
        </div>

        <div class="max-w-4xl mx-auto text-center">
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            <span class="text-white">Rethinking </span>
            <span class="gradient-text">reactivity</span>
          </h1>
          <p class="text-lg sm:text-xl text-surface-200 leading-relaxed max-w-2xl mx-auto">
            Solid.js was born from a simple question: what if we could have React's declarative
            model without the overhead of a virtual DOM?
          </p>
        </div>
      </section>

      {/* Story */}
      <section class="py-16 px-4">
        <div class="max-w-7xl mx-auto">
          <div class="glass rounded-3xl p-8 md:p-12">
            <div class="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 class="text-2xl sm:text-3xl font-bold text-white mb-4">Our Story</h2>
                <p class="text-surface-200 leading-relaxed mb-4">
                  When we started building Solid, the JavaScript framework landscape was dominated
                  by virtual DOM-based solutions. While they offered great developer experience,
                  performance was always a trade-off.
                </p>
                <p class="text-surface-200 leading-relaxed mb-4">
                  We asked: what if reactivity could be truly fine-grained? What if instead of
                  re-rendering entire component trees, updates could target exactly the DOM nodes
                  that need to change?
                </p>
                <p class="text-surface-200 leading-relaxed">
                  The answer was Solid.js &mdash; a framework that compiles your declarative JSX
                  into optimized imperative DOM operations, delivering React-like DX with native-like
                  performance.
                </p>
              </div>
              <div class="relative">
                <div class="aspect-square rounded-2xl bg-gradient-to-br from-primary-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center">
                  <div class="text-center">
                    <div class="text-6xl mb-4">💎</div>
                    <div class="text-2xl font-bold gradient-text">Fine-Grained</div>
                    <div class="text-surface-200 text-sm mt-1">Reactivity at its core</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section class="py-16 px-4">
        <div class="max-w-7xl mx-auto">
          <div class="text-center mb-12">
            <h2 class="text-3xl font-bold text-white mb-4">Core Principles</h2>
            <p class="text-surface-200 max-w-xl mx-auto">What makes Solid different from the rest.</p>
          </div>
          <div class="grid md:grid-cols-3 gap-6">
            <For each={principles}>{(value) => (
              <div class="glass rounded-2xl p-8 text-center hover:bg-white/10 transition-all duration-500 hover:-translate-y-1">
                <div class="text-4xl mb-4">{value.icon}</div>
                <h3 class="text-xl font-semibold text-white mb-3">{value.title}</h3>
                <p class="text-surface-200 text-sm leading-relaxed">{value.description}</p>
              </div>
            )}</For>
          </div>
        </div>
      </section>

      {/* Team */}
      <section class="py-16 px-4">
        <div class="max-w-7xl mx-auto">
          <div class="text-center mb-12">
            <h2 class="text-3xl font-bold text-white mb-4">Meet the Team</h2>
            <p class="text-surface-200 max-w-xl mx-auto">The engineers pushing the boundaries of web performance.</p>
          </div>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <For each={team}>{(member) => (
              <div class="glass rounded-2xl p-6 text-center group hover:bg-white/10 transition-all duration-500 hover:-translate-y-1">
                <div class="w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center mx-auto mb-4
                            group-hover:scale-110 transition-transform duration-500">
                  <span class="text-xl font-bold text-white">{member.avatar}</span>
                </div>
                <h3 class="text-white font-semibold">{member.name}</h3>
                <p class="text-surface-200 text-sm mt-1">{member.role}</p>
              </div>
            )}</For>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section class="py-24 px-4">
        <div class="max-w-4xl mx-auto text-center">
          <div class="glass rounded-3xl p-12 relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-br from-primary-600/10 to-indigo-600/10"></div>
            <div class="relative">
              <h2 class="text-3xl font-bold text-white mb-4">Join the Solid community</h2>
              <p class="text-surface-200 text-lg mb-8">Connect with thousands of developers on Discord, GitHub, and beyond.</p>
              <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button class="btn-primary text-lg !px-10 !py-4">Join Discord</button>
                <button class="btn-secondary text-lg !px-10 !py-4">Star on GitHub</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
