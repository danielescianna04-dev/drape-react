interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
}

export default function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="group glass rounded-2xl p-6 hover:bg-white/10 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary-500/10">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500/20 to-indigo-500/20 border border-primary-500/30
                      flex items-center justify-center mb-4 group-hover:scale-110 group-hover:from-primary-500/30 group-hover:to-indigo-500/30
                      transition-all duration-500">
        <span className="text-2xl">{icon}</span>
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-surface-200 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
