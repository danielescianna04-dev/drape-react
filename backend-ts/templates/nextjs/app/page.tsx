import FeatureCard from './components/FeatureCard'

const features = [
  {
    icon: '\u26A1',
    title: 'Lightning Fast',
    description:
      'Built on modern infrastructure for instant page loads and seamless interactions. No more waiting around.',
  },
  {
    icon: '\uD83D\uDD12',
    title: 'Secure by Default',
    description:
      'Enterprise-grade security out of the box. End-to-end encryption, SOC 2 compliance, and regular audits.',
  },
  {
    icon: '\uD83C\uDF10',
    title: 'Global Scale',
    description:
      'Deploy to edge locations worldwide. Your users get sub-50ms response times, no matter where they are.',
  },
  {
    icon: '\uD83D\uDEE0\uFE0F',
    title: 'Developer First',
    description:
      'Clean APIs, comprehensive docs, and SDKs for every language. Ship features in hours, not weeks.',
  },
  {
    icon: '\uD83D\uDCCA',
    title: 'Real-time Analytics',
    description:
      'Monitor everything in real-time with beautiful dashboards. Make data-driven decisions with confidence.',
  },
  {
    icon: '\uD83E\uDE84',
    title: 'AI Powered',
    description:
      'Built-in AI capabilities that learn and adapt. Automate workflows and unlock insights automatically.',
  },
]

const stats = [
  { value: '99.99%', label: 'Uptime SLA' },
  { value: '50ms', label: 'Avg Response' },
  { value: '10M+', label: 'API Requests/day' },
  { value: '2,000+', label: 'Happy Teams' },
]

const testimonials = [
  {
    quote:
      'This platform transformed how we build products. What used to take weeks now takes hours.',
    author: 'Sarah Chen',
    role: 'CTO, TechCorp',
    avatar: 'SC',
  },
  {
    quote:
      'The developer experience is unmatched. Clean APIs, great docs, and a supportive community.',
    author: 'Marcus Johnson',
    role: 'Lead Engineer, StartupXYZ',
    avatar: 'MJ',
  },
  {
    quote:
      'We scaled from 100 to 10M users without changing a single line of infrastructure code.',
    author: 'Elena Rodriguez',
    role: 'VP Engineering, ScaleUp',
    avatar: 'ER',
  },
]

export default function Home() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-primary/8 blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px]" />
        </div>

        {/* Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(oklch(0.95 0.01 270) 1px, transparent 1px), linear-gradient(to right, oklch(0.95 0.01 270) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        <div className="relative max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border/50 bg-surface/80 text-sm text-text-secondary mb-8 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Now in public beta
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Build something{' '}
            <span className="gradient-text">amazing</span>
            <br />
            with modern tools
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
            The all-in-one platform for developers who want to ship faster.
            Beautiful defaults, powerful primitives, and an experience that
            scales.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="w-full sm:w-auto px-8 py-3.5 text-base font-medium text-white rounded-xl gradient-bg hover:opacity-90 transition-all duration-200 hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5">
              Start Building Free
            </button>
            <button className="w-full sm:w-auto px-8 py-3.5 text-base font-medium text-text-primary rounded-xl border border-border hover:border-primary/50 hover:bg-surface-light transition-all duration-200 flex items-center justify-center gap-2">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Watch Demo
            </button>
          </div>

          {/* Social Proof */}
          <div className="mt-16 flex items-center justify-center gap-8 text-text-muted text-sm">
            <span>Trusted by teams at</span>
            <div className="flex items-center gap-6 text-text-secondary font-medium">
              <span className="opacity-60 hover:opacity-100 transition-opacity">Vercel</span>
              <span className="opacity-60 hover:opacity-100 transition-opacity">Stripe</span>
              <span className="opacity-60 hover:opacity-100 transition-opacity">Linear</span>
              <span className="hidden sm:inline opacity-60 hover:opacity-100 transition-opacity">Notion</span>
              <span className="hidden sm:inline opacity-60 hover:opacity-100 transition-opacity">Figma</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-y border-border/50 bg-surface/30">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold gradient-text mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-text-muted">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              Everything you need to{' '}
              <span className="gradient-text">ship fast</span>
            </h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">
              Powerful features that give your team superpowers. No
              configuration needed &mdash; it just works.
            </p>
          </div>

          {/* Feature Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Code Preview / Highlight Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-surface/30 border-y border-border/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-6">
                Ship in minutes,{' '}
                <span className="gradient-text">not months</span>
              </h2>
              <p className="text-lg text-text-secondary mb-8 leading-relaxed">
                Get up and running with just a few lines of code. Our intuitive
                API handles the complexity so you can focus on building great
                products.
              </p>
              <ul className="space-y-4">
                {[
                  'One-command setup and deployment',
                  'Auto-scaling infrastructure',
                  'Built-in monitoring and alerting',
                  'Zero-config CI/CD pipeline',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-text-secondary">
                    <svg
                      className="w-5 h-5 text-primary shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Code Block */}
            <div className="rounded-2xl bg-surface border border-border/50 overflow-hidden glow">
              {/* Window Chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="ml-2 text-xs text-text-muted">app.ts</span>
              </div>
              {/* Code Content */}
              <pre className="p-6 text-sm leading-relaxed overflow-x-auto">
                <code>
                  <span className="text-primary-light">import</span>
                  <span className="text-text-primary"> {'{ App }'} </span>
                  <span className="text-primary-light">from</span>
                  <span className="text-accent"> &apos;@app/core&apos;</span>
                  <br />
                  <br />
                  <span className="text-primary-light">const</span>
                  <span className="text-text-primary"> app </span>
                  <span className="text-text-muted">= </span>
                  <span className="text-primary-light">new</span>
                  <span className="text-accent"> App</span>
                  <span className="text-text-muted">({'{'}</span>
                  <br />
                  <span className="text-text-secondary">{'  '}name</span>
                  <span className="text-text-muted">: </span>
                  <span className="text-accent">&apos;my-app&apos;</span>
                  <span className="text-text-muted">,</span>
                  <br />
                  <span className="text-text-secondary">{'  '}region</span>
                  <span className="text-text-muted">: </span>
                  <span className="text-accent">&apos;auto&apos;</span>
                  <span className="text-text-muted">,</span>
                  <br />
                  <span className="text-text-muted">{'})'}</span>
                  <br />
                  <br />
                  <span className="text-text-secondary">app</span>
                  <span className="text-text-muted">.</span>
                  <span className="text-primary-light">deploy</span>
                  <span className="text-text-muted">()</span>
                  <br />
                  <span className="text-text-muted">{'  '}.</span>
                  <span className="text-primary-light">then</span>
                  <span className="text-text-muted">{'(() => '}</span>
                  <span className="text-text-secondary">console</span>
                  <span className="text-text-muted">.</span>
                  <span className="text-primary-light">log</span>
                  <span className="text-text-muted">(</span>
                  <span className="text-accent">&apos;Deployed!&apos;</span>
                  <span className="text-text-muted">{'))'}</span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              Loved by{' '}
              <span className="gradient-text">developers</span>
            </h2>
            <p className="text-lg text-text-secondary">
              See what teams are saying about their experience.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.author}
                className="p-6 rounded-2xl bg-surface border border-border/50 card-hover"
              >
                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className="w-4 h-4 text-yellow-500"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  ))}
                </div>

                {/* Quote */}
                <p className="text-text-secondary leading-relaxed mb-6">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>

                {/* Author */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-white text-sm font-medium">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {testimonial.author}
                    </div>
                    <div className="text-xs text-text-muted">
                      {testimonial.role}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative p-12 sm:p-16 rounded-3xl bg-surface border border-border/50 overflow-hidden">
            {/* Background Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                Ready to get started?
              </h2>
              <p className="text-lg text-text-secondary mb-8 max-w-xl mx-auto">
                Join thousands of developers building the future. Free to start,
                no credit card required.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button className="w-full sm:w-auto px-8 py-3.5 text-base font-medium text-white rounded-xl gradient-bg hover:opacity-90 transition-all duration-200 hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5">
                  Start for Free
                </button>
                <button className="w-full sm:w-auto px-8 py-3.5 text-base font-medium text-text-primary rounded-xl border border-border hover:border-primary/50 hover:bg-surface-light transition-all duration-200">
                  Talk to Sales
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

    </>
  )
}
