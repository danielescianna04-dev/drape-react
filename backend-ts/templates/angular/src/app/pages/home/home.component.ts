import { Component, signal, AfterViewInit, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { FeatureCardComponent } from '../../components/feature-card/feature-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FeatureCardComponent],
  template: `
    <!-- Hero Section -->
    <section class="relative min-h-screen flex items-center justify-center overflow-hidden">
      <!-- Background effects -->
      <div class="absolute inset-0">
        <!-- Gradient orbs -->
        <div class="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[128px] animate-pulse"></div>
        <div class="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-600/15 rounded-full blur-[128px] animate-pulse" style="animation-delay: 1s;"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[128px] animate-pulse" style="animation-delay: 2s;"></div>

        <!-- Grid overlay -->
        <div class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]"></div>

        <!-- Radial fade -->
        <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--color-dark-950)_70%)]"></div>
      </div>

      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 lg:py-40 text-center">
        <!-- Badge -->
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium mb-8 animate-fade-in">
          <span class="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
          Now in Public Beta
        </div>

        <!-- Heading -->
        <h1 class="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-8 animate-fade-in-up">
          <span class="text-white">Build something</span>
          <br />
          <span class="bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
            extraordinary
          </span>
        </h1>

        <!-- Subtitle -->
        <p class="max-w-2xl mx-auto text-lg sm:text-xl text-gray-400 leading-relaxed mb-12 animate-fade-in-up" style="animation-delay: 0.2s;">
          The modern platform for teams who want to ship faster.
          Powerful tools, seamless integrations, and an experience
          that developers actually love.
        </p>

        <!-- CTA Buttons -->
        <div class="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up" style="animation-delay: 0.4s;">
          <a
            href="#"
            class="group relative px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl hover:from-purple-500 hover:to-indigo-500 transition-all duration-300 shadow-2xl shadow-purple-500/25 hover:shadow-purple-500/40 hover:-translate-y-0.5 w-full sm:w-auto"
          >
            <span class="relative z-10 flex items-center justify-center gap-2">
              Start Building Free
              <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          </a>
          <a
            href="#features"
            class="px-8 py-4 text-base font-semibold text-gray-300 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 hover:border-white/20 hover:text-white transition-all duration-300 w-full sm:w-auto text-center"
          >
            See Features
          </a>
        </div>

        <!-- Social proof -->
        <div class="mt-20 animate-fade-in-up" style="animation-delay: 0.6s;">
          <p class="text-sm text-gray-600 mb-6">Trusted by forward-thinking teams</p>
          <div class="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 opacity-40">
            <span class="text-2xl font-bold text-gray-400 tracking-tight">Stripe</span>
            <span class="text-2xl font-bold text-gray-400 tracking-tight">Vercel</span>
            <span class="text-2xl font-bold text-gray-400 tracking-tight">Linear</span>
            <span class="text-2xl font-bold text-gray-400 tracking-tight">Notion</span>
            <span class="text-2xl font-bold text-gray-400 tracking-tight">Figma</span>
          </div>
        </div>
      </div>

      <!-- Scroll indicator -->
      <div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div class="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-2">
          <div class="w-1 h-2 rounded-full bg-white/40 animate-scroll-dot"></div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="relative py-24 lg:py-32">
      <!-- Section bg -->
      <div class="absolute inset-0 bg-gradient-to-b from-dark-950 via-dark-900/50 to-dark-950"></div>

      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- Section header -->
        <div class="text-center mb-16 lg:mb-20">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-6">
            Features
          </div>
          <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Everything you need to
            <span class="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">ship faster</span>
          </h2>
          <p class="max-w-2xl mx-auto text-lg text-gray-400">
            A complete toolkit designed for modern development workflows.
            From prototype to production in record time.
          </p>
        </div>

        <!-- Feature cards grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          @for (feature of features(); track feature.title) {
            <app-feature-card
              [icon]="feature.icon"
              [title]="feature.title"
              [description]="feature.description"
            />
          }
        </div>
      </div>
    </section>

    <!-- Stats Section -->
    <section class="relative py-24 lg:py-32">
      <div class="absolute inset-0">
        <div class="absolute inset-0 bg-gradient-to-r from-purple-600/5 via-indigo-600/5 to-blue-600/5"></div>
      </div>
      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          @for (stat of stats(); track stat.label) {
            <div class="text-center group">
              <div class="text-3xl sm:text-4xl lg:text-5xl font-extrabold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform duration-300">
                {{ stat.value }}
              </div>
              <div class="text-sm text-gray-500 font-medium">{{ stat.label }}</div>
            </div>
          }
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="relative py-24 lg:py-32 overflow-hidden">
      <div class="absolute inset-0">
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-purple-600/15 rounded-full blur-[128px]"></div>
      </div>

      <div class="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
          Ready to get started?
        </h2>
        <p class="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
          Join thousands of developers who are already building the future.
          Start for free, no credit card required.
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#"
            class="px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl hover:from-purple-500 hover:to-indigo-500 transition-all duration-300 shadow-2xl shadow-purple-500/25 hover:shadow-purple-500/40 hover:-translate-y-0.5"
          >
            Start Building Free
          </a>
          <a
            href="#"
            class="px-8 py-4 text-base font-semibold text-gray-300 hover:text-white transition-colors duration-200 flex items-center gap-2"
          >
            Talk to Sales
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fade-in-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes gradient-shift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    @keyframes scroll-dot {
      0%, 100% { opacity: 0; transform: translateY(0); }
      50% { opacity: 1; transform: translateY(8px); }
    }
    .animate-fade-in {
      animation: fade-in 0.8s ease-out both;
    }
    .animate-fade-in-up {
      animation: fade-in-up 0.8s ease-out both;
    }
    .animate-gradient {
      animation: gradient-shift 3s ease infinite;
    }
    .animate-scroll-dot {
      animation: scroll-dot 2s ease-in-out infinite;
    }
  `],
})
export class HomeComponent {
  features = signal([
    {
      icon: '\u26A1',
      title: 'Lightning Fast',
      description: 'Built on cutting-edge infrastructure with edge computing and smart caching for sub-millisecond response times globally.',
    },
    {
      icon: '\uD83D\uDD12',
      title: 'Enterprise Security',
      description: 'SOC 2 Type II compliant with end-to-end encryption, role-based access control, and advanced threat detection.',
    },
    {
      icon: '\uD83D\uDE80',
      title: 'One-Click Deploy',
      description: 'Push to deploy with zero configuration. Automatic scaling, rollbacks, and preview environments for every PR.',
    },
    {
      icon: '\uD83C\uDFA8',
      title: 'Beautiful UI Kit',
      description: 'A comprehensive design system with 200+ components, dark mode support, and full accessibility compliance.',
    },
    {
      icon: '\uD83D\uDD17',
      title: 'Seamless Integrations',
      description: 'Connect with 100+ tools out of the box. REST and GraphQL APIs, webhooks, and real-time event streaming.',
    },
    {
      icon: '\uD83D\uDCCA',
      title: 'Advanced Analytics',
      description: 'Real-time dashboards, custom metrics, anomaly detection, and exportable reports to drive data-informed decisions.',
    },
  ]);

  stats = signal([
    { value: '10K+', label: 'Active Projects' },
    { value: '99.99%', label: 'Uptime SLA' },
    { value: '150ms', label: 'Avg Response' },
    { value: '24/7', label: 'Expert Support' },
  ]);
}
