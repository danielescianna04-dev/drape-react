import { Component, input } from '@angular/core';

@Component({
  selector: 'app-feature-card',
  standalone: true,
  template: `
    <div class="group relative p-6 lg:p-8 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/30 hover:bg-white/[0.05] transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-purple-500/10">
      <!-- Gradient overlay on hover -->
      <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/5 via-transparent to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

      <div class="relative">
        <!-- Icon -->
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/10 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-purple-500/20 transition-all duration-500">
          <span class="text-2xl">{{ icon() }}</span>
        </div>

        <!-- Title -->
        <h3 class="text-lg font-semibold text-white mb-3 group-hover:text-purple-300 transition-colors duration-300">
          {{ title() }}
        </h3>

        <!-- Description -->
        <p class="text-sm text-gray-400 leading-relaxed">
          {{ description() }}
        </p>
      </div>
    </div>
  `,
})
export class FeatureCardComponent {
  icon = input.required<string>();
  title = input.required<string>();
  description = input.required<string>();
}
