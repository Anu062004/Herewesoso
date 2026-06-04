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
        headline: ['var(--font-headline)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)']
      },
      colors: {
        background: '#050505',
        'background-deep': '#020202',
        panel: 'rgba(16, 16, 16, 0.86)',
        border: 'rgba(255, 255, 255, 0.1)',
        text: '#f5f5f5',
        'text-dim': '#b8b8b8',
        accent: '#ff6b00',
        'accent-dim': '#d95b00',
        'accent-glow': '#f0b90b',
        safe: '#16c784',
        'safe-dim': '#0fa86c',
        caution: '#f0b90b',
        'caution-dim': '#c89705',
        danger: '#ea3943',
        'danger-dim': '#c62f38',
        critical: '#ea3943',
        cyan: '#42c8f5',
        magenta: '#ff9f1c'
      }
    }
  },
  plugins: []
};

export default config;
