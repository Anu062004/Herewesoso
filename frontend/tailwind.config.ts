import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        headline: ['Geist', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      colors: {
        background: '#0d1515',
        'background-deep': '#050508',
        panel: 'rgba(15, 15, 25, 0.7)',
        border: 'rgba(255, 255, 255, 0.1)',
        text: '#dce4e4',
        'text-dim': '#b9cacb',
        accent: '#00f2ff',
        'accent-dim': '#00dbe7',
        'accent-glow': '#ff00d9',
        safe: '#00ffa3',
        'safe-dim': '#00cc82',
        caution: '#ffd700',
        'caution-dim': '#ccac00',
        danger: '#ff3131',
        'danger-dim': '#cc2727',
        critical: '#ff3131',
        cyan: '#00f2ff',
        magenta: '#ff00d9'
      }
    }
  },
  plugins: []
};

export default config;
