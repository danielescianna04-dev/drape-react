import type { MetaFunction } from '@remix-run/node';
import FeatureCard from '~/components/FeatureCard';

export const meta: MetaFunction = () => [
  { title: 'RemixApp - Full-Stack Web Framework' },
  { name: 'description', content: 'Build better websites with Remix. Web standards, progressive enhancement, and server-first architecture.' },
];

const features = [
  {
    icon: '🌊',
    title: 'Nested Routing',
    description: 'Parallel data loading with nested routes. Each route segment fetches its own data simultaneously — no waterfalls.'
  },
  {
    icon: '📡',
    title: 'Loaders & Actions',
    description: 'Server-side data loading and mutations built on Web Fetch API. Type-safe from database to component.'
  },
  {
    icon: '⚡',
    title: 'Progressive Enhancement',
    description: 'Works without JavaScript, then enhances with it. Forms submit, links navigate, and the app works even before JS loads.'
  },
  {
    icon: '🔄',
    title: 'Automatic Revalidation',
    description: 'After every action, Remix automatically revalidates all loader data on the page. Always fresh, always consistent.'
  },
  {
    icon: '🛡️',
    title: 'Error Boundaries',
    description: 'Route-level error boundaries catch errors at any level. The rest of the app keeps working — no full-page crashes.'
  },
  {
    icon: '🌐',
    title: 'Web Standards',
    description: 'Built on Request, Response, FormData, and URLSearchParams. Skills you learn here transfer to any web platform.'
  }
];

const stats = [
  { value: '30K+', label: 'GitHub Stars' },
  { value: 'Web API', label: 'Standards Based' },
  { value: '0 JS', label: 'Works Without' },
  { value: '< 1s', label: 'TTI Average' }
];

export default function Index() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-primary-600/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/3 w-[450px] h-[450px] bg-indigo-600/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-blue-600/8 rounded-full blur-3xl"></div>
        </div>

        <div className="absolute inset-0 -z-10 opacity-[0.03]"
             style={{
               backgroundImage: 'radial-gradient(rgba(255,255,255,.12) 1.5px, transparent 1.5px)',
               backgroundSize: '32px 32px'
             }}>
        </div>

        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm text-primary-300 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            Remix v2 &mdash; Built on Vite
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            <span className="block text-white">Web standards,</span>
            <span className="block gradient-text mt-2">modern experience</span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg sm:text-xl text-surface-200 mb-10 leading-relaxed">
            Remix is a full-stack framework that leverages web fundamentals to deliver fast,
            resilient user experiences. Loaders fetch data, actions handle mutations, and
            everything just works.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button className="btn-primary text-lg !px-10 !py-4">
              Start Building
              <svg className="inline-block w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
            <button className="btn-secondary text-lg !px-10 !py-4">
              <svg className="inline-block w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Read the Docs
            </button>
          </div>

          {/* Loader/Action showcase */}
          <div className="max-w-3xl mx-auto glass rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <span className="text-xs text-surface-200 ml-2">app/routes/dashboard.tsx</span>
            </div>
            <div className="p-6 text-left font-mono text-sm leading-relaxed">
              <span className="text-purple-400">export async function</span> <span className="text-yellow-400">loader</span>({'{'} <span className="text-blue-400">request</span> {'}'}) {'{'}<br />
              &nbsp;&nbsp;<span className="text-purple-400">const</span> <span className="text-blue-400">user</span> = <span className="text-purple-400">await</span> <span className="text-yellow-400">getUser</span>(<span className="text-blue-400">request</span>);<br />
              &nbsp;&nbsp;<span className="text-purple-400">return</span> <span className="text-yellow-400">json</span>({'{'} <span className="text-blue-400">user</span> {'}'});<br />
              {'}'}<br /><br />
              <span className="text-purple-400">export async function</span> <span className="text-yellow-400">action</span>({'{'} <span className="text-blue-400">request</span> {'}'}) {'{'}<br />
              &nbsp;&nbsp;<span className="text-purple-400">const</span> <span className="text-blue-400">form</span> = <span className="text-purple-400">await</span> <span className="text-blue-400">request</span>.<span className="text-yellow-400">formData</span>();<br />
              &nbsp;&nbsp;<span className="text-purple-400">await</span> <span className="text-yellow-400">updateProfile</span>(<span className="text-blue-400">form</span>);<br />
              &nbsp;&nbsp;<span className="text-purple-400">return</span> <span className="text-yellow-400">redirect</span>(<span className="text-green-400">"/dashboard"</span>);<br />
              {'}'}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-4 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold gradient-text mb-1">{stat.value}</div>
                <div className="text-sm text-surface-200">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Built on <span className="gradient-text">web fundamentals</span>
            </h2>
            <p className="max-w-2xl mx-auto text-surface-200 text-lg">
              Remix embraces the platform. Every feature is built on top of web standards
              that have stood the test of time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Data flow visualization */}
      <section className="py-24 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              The Remix <span className="gradient-text">data flow</span>
            </h2>
            <p className="max-w-2xl mx-auto text-surface-200 text-lg">
              A simple, powerful mental model for full-stack web development.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Loader',
                desc: 'Runs on the server before rendering. Fetch data from databases, APIs, or the filesystem. Returns typed JSON to your component.',
                color: 'from-blue-500 to-cyan-500'
              },
              {
                step: '02',
                title: 'Component',
                desc: 'Renders with loader data via useLoaderData(). Pure UI components that receive exactly the data they need. No client-side fetching.',
                color: 'from-primary-500 to-indigo-500'
              },
              {
                step: '03',
                title: 'Action',
                desc: 'Handles form submissions and mutations server-side. After the action completes, all loaders on the page automatically revalidate.',
                color: 'from-indigo-500 to-purple-500'
              }
            ].map((item) => (
              <div key={item.step} className="glass rounded-2xl p-8 relative overflow-hidden group hover:bg-white/10 transition-all duration-500">
                <div className="absolute top-4 right-4 text-5xl font-black text-white/5 group-hover:text-primary-500/10 transition-colors duration-500">
                  {item.step}
                </div>
                <div className="relative">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center mb-4`}>
                    <span className="text-white font-bold text-sm">{item.step}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
                  <p className="text-surface-200 text-sm leading-relaxed">{item.desc}</p>
                </div>
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
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ship with confidence</h2>
              <p className="text-surface-200 text-lg mb-8 max-w-lg mx-auto">
                Progressive enhancement means your app works even before JavaScript loads.
                Start building resilient web applications today.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button className="btn-primary text-lg !px-10 !py-4">Create a Project</button>
                <button className="btn-secondary text-lg !px-10 !py-4">View Examples</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
