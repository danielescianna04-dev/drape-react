import { A, useLocation } from '@solidjs/router';
import { createSignal } from 'solid-js';

const links = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' }
];

export default function Navbar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = createSignal(false);

  const isActive = (path: string) => {
    return path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  };

  return (
    <nav class="fixed top-0 w-full z-50 glass">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <A href="/" class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center">
              <span class="text-white font-bold text-sm">S</span>
            </div>
            <span class="text-xl font-bold gradient-text">SolidApp</span>
          </A>

          <div class="hidden md:flex items-center gap-1">
            {links.map((link) => (
              <A
                href={link.href}
                class={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive(link.href)
                    ? 'text-white bg-white/10'
                    : 'text-surface-200 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </A>
            ))}
          </div>

          <div class="hidden md:flex items-center gap-3">
            <A href="/about" class="text-sm text-surface-200 hover:text-white transition-colors">
              Sign In
            </A>
            <button class="btn-primary text-sm !px-5 !py-2">Get Started</button>
          </div>

          <button
            class="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen())}
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen() ? (
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen() && (
        <div class="md:hidden border-t border-white/10 bg-surface-950/95 backdrop-blur-xl">
          <div class="px-4 py-3 space-y-1">
            {links.map((link) => (
              <A
                href={link.href}
                class={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'text-white bg-white/10'
                    : 'text-surface-200 hover:text-white hover:bg-white/5'
                }`}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </A>
            ))}
            <div class="pt-3 border-t border-white/10">
              <button class="btn-primary w-full text-sm !py-2">Get Started</button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
