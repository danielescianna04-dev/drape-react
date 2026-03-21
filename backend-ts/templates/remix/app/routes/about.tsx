import type { MetaFunction } from '@remix-run/node';

export const meta: MetaFunction = () => [
  { title: 'About - RemixApp' },
  { name: 'description', content: 'Learn about the team and philosophy behind RemixApp.' },
];

const team = [
  { name: 'Alex Rivera', role: 'CEO & Co-founder', avatar: 'AR' },
  { name: 'Sam Chen', role: 'CTO & Co-founder', avatar: 'SC' },
  { name: 'Jordan Lee', role: 'Head of Design', avatar: 'JL' },
  { name: 'Morgan Davis', role: 'Lead Engineer', avatar: 'MD' },
];

const values = [
  {
    icon: '🌐',
    title: 'Web Standards First',
    description: 'We build on Request, Response, FormData, and URL. Knowledge you gain with Remix transfers directly to any web platform — and vice versa.'
  },
  {
    icon: '📈',
    title: 'Progressive Enhancement',
    description: 'Start with HTML that works everywhere. Layer on JavaScript for enhanced interactions. Your app is resilient from the ground up.'
  },
  {
    icon: '🔗',
    title: 'Server/Client Harmony',
    description: 'Loaders and actions bridge the gap between server and client. No separate API layer, no data fetching libraries — just web fundamentals.'
  }
];

export default function About() {
  return (
    <>
      {/* Hero */}
      <section className="relative pt-32 pb-16 px-4">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary-600/15 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            <span className="text-white">Embracing the </span>
            <span className="gradient-text">web platform</span>
          </h1>
          <p className="text-lg sm:text-xl text-surface-200 leading-relaxed max-w-2xl mx-auto">
            Remix was created because we believe the best web framework is the web itself.
            Standards-based, server-first, progressively enhanced.
          </p>
        </div>
      </section>

      {/* Philosophy */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="glass rounded-3xl p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Our Philosophy</h2>
                <p className="text-surface-200 leading-relaxed mb-4">
                  For years, web development has been moving further from the platform. Client-side
                  routing, client-side data fetching, client-side state management &mdash; we kept
                  reinventing what browsers already do well.
                </p>
                <p className="text-surface-200 leading-relaxed mb-4">
                  Remix takes a different approach. We lean into the browser. Forms submit data.
                  Links navigate pages. The server renders HTML. These patterns have worked for
                  decades, and they still work today.
                </p>
                <p className="text-surface-200 leading-relaxed">
                  By embracing web standards, Remix apps are faster, more resilient, and simpler
                  to understand. Progressive enhancement means everything works before JavaScript
                  even loads &mdash; then gets better with it.
                </p>
              </div>
              <div className="relative">
                <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🌊</div>
                    <div className="text-2xl font-bold gradient-text">Web Standards</div>
                    <div className="text-surface-200 text-sm mt-1">Built on the platform, not around it</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Core Values</h2>
            <p className="text-surface-200 max-w-xl mx-auto">The principles that shape every decision we make.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {values.map((value) => (
              <div key={value.title} className="glass rounded-2xl p-8 text-center hover:bg-white/10 transition-all duration-500 hover:-translate-y-1">
                <div className="text-4xl mb-4">{value.icon}</div>
                <h3 className="text-xl font-semibold text-white mb-3">{value.title}</h3>
                <p className="text-surface-200 text-sm leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">The Remix Journey</h2>
          </div>
          <div className="space-y-6">
            {[
              { year: '2020', event: 'Remix created by the makers of React Router' },
              { year: '2021', event: 'Open-sourced and reached 10K GitHub stars in weeks' },
              { year: '2022', event: 'Acquired by Shopify, powering Hydrogen framework' },
              { year: '2024', event: 'Remix v2 with Vite, SPA mode, and Tailwind CSS v4' }
            ].map((m) => (
              <div key={m.year} className="glass rounded-2xl p-6 flex items-start gap-6 hover:bg-white/10 transition-all duration-300">
                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{m.year}</span>
                </div>
                <div className="pt-1">
                  <h3 className="text-white font-semibold text-lg">{m.year}</h3>
                  <p className="text-surface-200 text-sm mt-1">{m.event}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Meet the Team</h2>
            <p className="text-surface-200 max-w-xl mx-auto">The people building the future of full-stack web development.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {team.map((member) => (
              <div key={member.name} className="glass rounded-2xl p-6 text-center group hover:bg-white/10 transition-all duration-500 hover:-translate-y-1">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center mx-auto mb-4
                                group-hover:scale-110 transition-transform duration-500">
                  <span className="text-xl font-bold text-white">{member.avatar}</span>
                </div>
                <h3 className="text-white font-semibold">{member.name}</h3>
                <p className="text-surface-200 text-sm mt-1">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="glass rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-600/10 to-indigo-600/10"></div>
            <div className="relative">
              <h2 className="text-3xl font-bold text-white mb-4">Build with us</h2>
              <p className="text-surface-200 text-lg mb-8">We are hiring engineers who love the web platform.</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button className="btn-primary text-lg !px-10 !py-4">View Open Roles</button>
                <button className="btn-secondary text-lg !px-10 !py-4">Join the Community</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
