import { Title, Meta } from '@solidjs/meta';
import { For } from 'solid-js';
import FeatureCard from '~/components/FeatureCard';

const features = [
  {
    icon: '💎',
    title: 'Fine-Grained Reactivity',
    description: 'No virtual DOM diffing. Solid updates exactly what changed, nothing more. True surgical precision for your UI.'
  },
  {
    icon: '🚀',
    title: 'Blazing Performance',
    description: 'Consistently tops framework benchmarks. Compiles away the framework overhead for near-native DOM speed.'
  },
  {
    icon: '🧩',
    title: 'Composable Primitives',
    description: 'Build complex UIs from simple, reusable primitives. createSignal, createEffect, createMemo — simple yet powerful.'
  },
  {
    icon: '📦',
    title: 'Tiny Bundle Size',
    description: 'Under 7KB gzipped for the runtime. Tree-shakeable and dead-code eliminated for minimal payload.'
  },
  {
    icon: '🔄',
    title: 'Full-Stack with SolidStart',
    description: 'Server functions, API routes, and SSR built in. Deploy anywhere with adapter-based architecture.'
  },
  {
    icon: '🛡️',
    title: 'TypeScript Native',
    description: 'Written in TypeScript from the ground up. Perfect autocompletion and type inference for every API.'
  }
];

const stats = [
  { value: '6.4KB', label: 'Runtime Size' },
  { value: '#1', label: 'JS Benchmark' },
  { value: '0ms', label: 'VDOM Overhead' },
  { value: '50K+', label: 'GitHub Stars' }
];

export default function Home() {
  return (
    <>
      <Title>SolidApp - Reactive UI Without Compromise</Title>
      <Meta name="description" content="Build blazing fast web applications with Solid.js fine-grained reactivity and SolidStart full-stack framework." />

      {/* Hero Section */}
      <section class="relative pt-32 pb-20 px-4 overflow-hidden">
        <div class="absolute inset-0 -z-10">
          <div class="absolute top-1/4 right-1/3 w-[500px] h-[500px] bg-primary-600/20 rounded-full blur-3xl animate-pulse"></div>
          <div class="absolute bottom-1/3 left-1/4 w-[400px] h-[400px] bg-indigo-600/15 rounded-full blur-3xl animate-pulse" style="animation-delay: 1.5s;"></div>
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/8 rounded-full blur-3xl"></div>
        </div>

        <div class="absolute inset-0 -z-10 opacity-[0.03]"
             style="background-image: linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px); background-size: 50px 50px;">
        </div>

        <div class="max-w-7xl mx-auto text-center">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm text-primary-300 mb-8">
            <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            SolidStart 1.0 is here &mdash; Full-stack Solid.js
          </div>

          <h1 class="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            <span class="block text-white">Reactive UI without</span>
            <span class="block gradient-text mt-2">the compromise</span>
          </h1>

          <p class="max-w-2xl mx-auto text-lg sm:text-xl text-surface-200 mb-10 leading-relaxed">
            Solid.js delivers true fine-grained reactivity with no virtual DOM. Build UIs that
            update with surgical precision &mdash; only what changed, when it changed.
          </p>

          <div class="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button class="btn-primary text-lg !px-10 !py-4">
              Get Started
              <svg class="inline-block w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
            <button class="btn-secondary text-lg !px-10 !py-4">
              <svg class="inline-block w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Documentation
            </button>
          </div>

          {/* Reactive Demo */}
          <div class="max-w-3xl mx-auto glass rounded-2xl overflow-hidden">
            <div class="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <div class="flex gap-1.5">
                <div class="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div class="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div class="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <span class="text-xs text-surface-200 ml-2">Counter.tsx</span>
            </div>
            <div class="p-6 text-left font-mono text-sm leading-relaxed">
              <span class="text-purple-400">import</span> {'{'} <span class="text-blue-400">createSignal</span> {'}'} <span class="text-purple-400">from</span> <span class="text-green-400">'solid-js'</span>;<br /><br />
              <span class="text-purple-400">function</span> <span class="text-yellow-400">Counter</span>() {'{'}<br />
              &nbsp;&nbsp;<span class="text-purple-400">const</span> [<span class="text-blue-400">count</span>, <span class="text-blue-400">setCount</span>] = <span class="text-yellow-400">createSignal</span>(<span class="text-orange-400">0</span>);<br />
              &nbsp;&nbsp;<span class="text-purple-400">const</span> <span class="text-blue-400">doubled</span> = () =&gt; <span class="text-blue-400">count</span>() * <span class="text-orange-400">2</span>;<br /><br />
              &nbsp;&nbsp;<span class="text-purple-400">return</span> (<br />
              &nbsp;&nbsp;&nbsp;&nbsp;<span class="text-primary-400">&lt;button</span> <span class="text-blue-400">onClick</span>={'{'}() =&gt; <span class="text-blue-400">setCount</span>(<span class="text-blue-400">count</span>() + <span class="text-orange-400">1</span>){'}'}<span class="text-primary-400">&gt;</span><br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{'{'}<span class="text-blue-400">count</span>(){'}'} clicked, {'{'}<span class="text-blue-400">doubled</span>(){'}'} doubled<br />
              &nbsp;&nbsp;&nbsp;&nbsp;<span class="text-primary-400">&lt;/button&gt;</span><br />
              &nbsp;&nbsp;);<br />
              {'}'}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section class="py-16 px-4 border-y border-white/5">
        <div class="max-w-7xl mx-auto">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <For each={stats}>{(stat) => (
              <div class="text-center">
                <div class="text-3xl sm:text-4xl font-bold gradient-text mb-1">{stat.value}</div>
                <div class="text-sm text-surface-200">{stat.label}</div>
              </div>
            )}</For>
          </div>
        </div>
      </section>

      {/* Features */}
      <section class="py-24 px-4">
        <div class="max-w-7xl mx-auto">
          <div class="text-center mb-16">
            <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">
              Why <span class="gradient-text">Solid.js</span> is different
            </h2>
            <p class="max-w-2xl mx-auto text-surface-200 text-lg">
              Not another virtual DOM framework. Solid compiles your declarative code into
              optimized imperative DOM operations.
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <For each={features}>{(feature) => (
              <FeatureCard icon={feature.icon} title={feature.title} description={feature.description} />
            )}</For>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section class="py-24 px-4 border-t border-white/5">
        <div class="max-w-7xl mx-auto">
          <div class="text-center mb-16">
            <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">
              Performance that <span class="gradient-text">speaks for itself</span>
            </h2>
          </div>

          <div class="grid md:grid-cols-3 gap-8">
            <For each={[
              { name: 'Solid.js', time: '1.02x', bar: 98, highlight: true },
              { name: 'Vue 3', time: '1.31x', bar: 76, highlight: false },
              { name: 'React 18', time: '1.55x', bar: 64, highlight: false }
            ]}>{(item) => (
              <div class={`glass rounded-2xl p-6 ${item.highlight ? 'ring-2 ring-primary-500/50' : ''}`}>
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-lg font-semibold text-white">{item.name}</h3>
                  <span class={`text-sm font-mono ${item.highlight ? 'text-green-400' : 'text-surface-200'}`}>
                    {item.time}
                  </span>
                </div>
                <div class="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                  <div
                    class={`h-full rounded-full transition-all duration-1000 ${
                      item.highlight
                        ? 'bg-gradient-to-r from-primary-500 to-indigo-500'
                        : 'bg-white/20'
                    }`}
                    style={`width: ${item.bar}%`}
                  ></div>
                </div>
                {item.highlight && (
                  <p class="text-xs text-green-400 mt-2">Fastest framework</p>
                )}
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
              <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Ready for true reactivity?</h2>
              <p class="text-surface-200 text-lg mb-8 max-w-lg mx-auto">
                Experience the difference fine-grained reactivity makes. Start building with Solid.js today.
              </p>
              <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button class="btn-primary text-lg !px-10 !py-4">Try the Playground</button>
                <button class="btn-secondary text-lg !px-10 !py-4">Join Discord</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
