<script lang="ts">
  interface Props {
    icon: string;
    title: string;
    description: string;
  }

  let { icon, title, description }: Props = $props();
</script>

<div class="group glass rounded-2xl p-6 hover:bg-white/10 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary-500/10">
  <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500/20 to-indigo-500/20 border border-primary-500/30
              flex items-center justify-center mb-4 group-hover:scale-110 group-hover:from-primary-500/30 group-hover:to-indigo-500/30
              transition-all duration-500">
    <span class="text-2xl">{icon}</span>
  </div>
  <h3 class="text-lg font-semibold text-white mb-2 group-hover:gradient-text transition-all duration-300">{title}</h3>
  <p class="text-surface-200 text-sm leading-relaxed">{description}</p>
</div>
