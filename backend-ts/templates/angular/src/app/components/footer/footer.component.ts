import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="relative bg-dark-950 border-t border-white/5">
      <!-- Gradient glow -->
      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          <!-- Brand -->
          <div class="lg:col-span-1">
            <a routerLink="/" class="flex items-center gap-2 mb-4">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span class="text-xl font-bold text-white">Acme</span>
            </a>
            <p class="text-sm text-gray-500 leading-relaxed max-w-xs">
              Building the future of digital experiences with cutting-edge technology and thoughtful design.
            </p>
          </div>

          <!-- Product -->
          <div>
            <h3 class="text-sm font-semibold text-white uppercase tracking-wider mb-4">Product</h3>
            <ul class="space-y-3">
              <li><a href="#features" class="text-sm text-gray-500 hover:text-purple-400 transition-colors duration-200">Features</a></li>
              <li><a href="#" class="text-sm text-gray-500 hover:text-purple-400 transition-colors duration-200">Pricing</a></li>
              <li><a href="#" class="text-sm text-gray-500 hover:text-purple-400 transition-colors duration-200">Changelog</a></li>
              <li><a href="#" class="text-sm text-gray-500 hover:text-purple-400 transition-colors duration-200">Documentation</a></li>
            </ul>
          </div>

          <!-- Company -->
          <div>
            <h3 class="text-sm font-semibold text-white uppercase tracking-wider mb-4">Company</h3>
            <ul class="space-y-3">
              <li><a routerLink="/about" class="text-sm text-gray-500 hover:text-purple-400 transition-colors duration-200">About</a></li>
              <li><a href="#" class="text-sm text-gray-500 hover:text-purple-400 transition-colors duration-200">Blog</a></li>
              <li><a href="#" class="text-sm text-gray-500 hover:text-purple-400 transition-colors duration-200">Careers</a></li>
              <li><a href="#" class="text-sm text-gray-500 hover:text-purple-400 transition-colors duration-200">Contact</a></li>
            </ul>
          </div>

          <!-- Legal -->
          <div>
            <h3 class="text-sm font-semibold text-white uppercase tracking-wider mb-4">Legal</h3>
            <ul class="space-y-3">
              <li><a href="#" class="text-sm text-gray-500 hover:text-purple-400 transition-colors duration-200">Privacy Policy</a></li>
              <li><a href="#" class="text-sm text-gray-500 hover:text-purple-400 transition-colors duration-200">Terms of Service</a></li>
              <li><a href="#" class="text-sm text-gray-500 hover:text-purple-400 transition-colors duration-200">Cookie Policy</a></li>
            </ul>
          </div>
        </div>

        <!-- Bottom -->
        <div class="mt-16 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p class="text-sm text-gray-600">
            &copy; {{ currentYear }} Acme Inc. All rights reserved.
          </p>
          <div class="flex items-center gap-4">
            <a href="#" class="text-gray-600 hover:text-purple-400 transition-colors duration-200" aria-label="Twitter">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="#" class="text-gray-600 hover:text-purple-400 transition-colors duration-200" aria-label="GitHub">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
            </a>
            <a href="#" class="text-gray-600 hover:text-purple-400 transition-colors duration-200" aria-label="LinkedIn">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  `,
})
export class FooterComponent {
  currentYear = new Date().getFullYear();
}
