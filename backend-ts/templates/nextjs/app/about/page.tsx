const team = [
  { name: 'Alex Morgan', role: 'CEO & Co-founder', avatar: 'AM' },
  { name: 'Jordan Lee', role: 'CTO & Co-founder', avatar: 'JL' },
  { name: 'Sam Rivera', role: 'Head of Design', avatar: 'SR' },
  { name: 'Taylor Kim', role: 'Head of Engineering', avatar: 'TK' },
]

const values = [
  {
    title: 'Ship Fast',
    description:
      'We believe in rapid iteration and continuous delivery. Ship early, learn fast, and improve constantly.',
  },
  {
    title: 'Developer Joy',
    description:
      'Every API, every tool, every interface should bring joy. We obsess over the developer experience.',
  },
  {
    title: 'Open by Default',
    description:
      'Transparency in our code, our roadmap, and our communication. We build in the open whenever possible.',
  },
  {
    title: 'Quality Matters',
    description:
      'We never ship half-baked. Every feature is polished, tested, and documented before release.',
  },
]

export default function About() {
  return (
    <>
      {/* Hero */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-primary/8 blur-[120px]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Building the future of{' '}
            <span className="gradient-text">developer tools</span>
          </h1>
          <p className="text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed">
            We started with a simple mission: make it ridiculously easy for
            developers to build, deploy, and scale applications.
          </p>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-y border-border/50 bg-surface/30">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-bold text-text-primary mb-4">
                Our Story
              </h2>
              <div className="space-y-4 text-text-secondary leading-relaxed">
                <p>
                  Founded in 2024, we set out to solve the problems we
                  experienced firsthand as developers. The tools were either too
                  complex or too limiting.
                </p>
                <p>
                  We believed there was a better way &mdash; one that combined
                  powerful capabilities with an incredible developer experience.
                  No more choosing between flexibility and simplicity.
                </p>
                <p>
                  Today, thousands of teams trust our platform to power their
                  most critical applications. And we&apos;re just getting
                  started.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-2xl bg-surface border border-border/50 text-center">
                <div className="text-3xl font-bold gradient-text mb-1">2024</div>
                <div className="text-sm text-text-muted">Founded</div>
              </div>
              <div className="p-6 rounded-2xl bg-surface border border-border/50 text-center">
                <div className="text-3xl font-bold gradient-text mb-1">50+</div>
                <div className="text-sm text-text-muted">Team members</div>
              </div>
              <div className="p-6 rounded-2xl bg-surface border border-border/50 text-center">
                <div className="text-3xl font-bold gradient-text mb-1">2K+</div>
                <div className="text-sm text-text-muted">Customers</div>
              </div>
              <div className="p-6 rounded-2xl bg-surface border border-border/50 text-center">
                <div className="text-3xl font-bold gradient-text mb-1">$30M</div>
                <div className="text-sm text-text-muted">Raised</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              Our <span className="gradient-text">values</span>
            </h2>
            <p className="text-lg text-text-secondary">
              The principles that guide everything we build.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {values.map((value, index) => (
              <div
                key={value.title}
                className="p-6 rounded-2xl bg-surface border border-border/50 card-hover"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-lg mb-4">
                  {index + 1}
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  {value.title}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 border-t border-border/50 bg-surface/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              Meet the <span className="gradient-text">team</span>
            </h2>
            <p className="text-lg text-text-secondary">
              The people behind the product.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {team.map((member) => (
              <div
                key={member.name}
                className="text-center p-6 rounded-2xl bg-surface border border-border/50 card-hover"
              >
                <div className="w-16 h-16 rounded-full gradient-bg flex items-center justify-center text-white font-semibold text-lg mx-auto mb-4">
                  {member.avatar}
                </div>
                <div className="text-sm font-semibold text-text-primary">
                  {member.name}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {member.role}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative p-12 sm:p-16 rounded-3xl bg-surface border border-border/50 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                Want to join us?
              </h2>
              <p className="text-lg text-text-secondary mb-8 max-w-xl mx-auto">
                We&apos;re always looking for talented people who share our
                passion for building great developer tools.
              </p>
              <button className="px-8 py-3.5 text-base font-medium text-white rounded-xl gradient-bg hover:opacity-90 transition-all duration-200 hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5">
                View Open Positions
              </button>
            </div>
          </div>
        </div>
      </section>

    </>
  )
}
