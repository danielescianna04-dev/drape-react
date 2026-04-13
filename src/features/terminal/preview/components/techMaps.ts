/**
 * Shared tech icon/color/name mappings for preview components.
 */
import { Ionicons } from '@expo/vector-icons';

const techIconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  react: 'logo-react',
  vue: 'logo-vue',
  nextjs: 'server-outline',
  nuxt: 'layers-outline',
  svelte: 'flame-outline',
  angular: 'navigate-outline',
  astro: 'planet-outline',
  remix: 'repeat-outline',
  solid: 'water-outline',
  flask: 'logo-python',
  django: 'shield-outline',
  fastapi: 'flash-outline',
  expo: 'phone-portrait-outline',
  flutter: 'apps-outline',
  laravel: 'diamond-outline',
  html: 'logo-html5',
  static: 'logo-html5',
  'python-console': 'logo-python',
  'javascript-console': 'logo-nodejs',
  'c-lang': 'code-slash-outline',
  cpp: 'code-working-outline',
  java: 'cafe-outline',
};

const techColorMap: Record<string, string> = {
  react: '#61DAFB',
  vue: '#4FC08D',
  nextjs: '#fff',
  nuxt: '#00DC82',
  svelte: '#FF3E00',
  angular: '#DD0031',
  astro: '#BC52EE',
  remix: '#E8F2FF',
  solid: '#2C4F7C',
  flask: '#3776AB',
  django: '#092E20',
  fastapi: '#009688',
  expo: '#61DAFB',
  flutter: '#02569B',
  laravel: '#FF2D20',
  html: '#E34F26',
  static: '#E34F26',
  'python-console': '#3776AB',
  'javascript-console': '#F7DF1E',
  'c-lang': '#A8B9CC',
  cpp: '#00599C',
  java: '#ED8B00',
};

const techNameMap: Record<string, string> = {
  react: 'React',
  vue: 'Vue.js',
  nextjs: 'Next.js',
  nuxt: 'Nuxt.js',
  svelte: 'SvelteKit',
  angular: 'Angular',
  astro: 'Astro',
  remix: 'Remix',
  solid: 'Solid.js',
  flask: 'Flask',
  django: 'Django',
  fastapi: 'FastAPI',
  expo: 'React Native',
  flutter: 'Flutter',
  laravel: 'Laravel',
  html: 'HTML/CSS/JS',
  static: 'HTML/CSS/JS',
  'python-console': 'Python',
  'javascript-console': 'JavaScript',
  'c-lang': 'C',
  cpp: 'C++',
  java: 'Java',
};

export const techMaps = {
  icon: (tech?: string): keyof typeof Ionicons.glyphMap =>
    (tech && techIconMap[tech]) || 'logo-html5',
  color: (tech?: string): string =>
    (tech && techColorMap[tech]) || '#E34F26',
  displayName: (tech?: string): string =>
    (tech && techNameMap[tech]) || tech || 'Web',
};
