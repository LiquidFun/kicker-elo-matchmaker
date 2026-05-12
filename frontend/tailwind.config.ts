import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pitch: '#1a3d2e',
        pitch2: '#143020',
        wood: '#8b6440',
        rail: '#c9a36c',
      },
    },
  },
  plugins: [],
};

export default config;
