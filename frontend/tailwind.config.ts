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
        headline: ['Trebuchet MS', 'Segoe UI', 'sans-serif'],
        body: ['Segoe UI', 'sans-serif'],
        mono: ['Consolas', 'Liberation Mono', 'monospace']
      },
      colors: {
        background: '#080808',
        panel: '#111111',
        border: '#1e1e1e',
        text: '#e0e0e0',
        accent: '#ff6d00',
        'accent-dim': '#cc5200',
        'accent-glow': '#ff8533',
        safe: '#00e676',
        'safe-dim': '#00cc6d',
        caution: '#ffd600',
        'caution-dim': '#e6b800',
        danger: '#ff1744',
        'danger-dim': '#cc3656',
        critical: '#ff1744',
        cyan: '#6dddff'
      }
    }
  },
  plugins: []
};

export default config;
