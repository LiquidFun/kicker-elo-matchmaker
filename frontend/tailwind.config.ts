import type { Config } from 'tailwindcss';

/**
 * Palette: three accents only — pitch (dark green), rail (beige), accent (orange).
 * Plus neutrals: paper / surface / ink / ink2 / line.
 *
 * Color tokens are CSS variables defined in src/index.css with light and dark
 * values. Toggle by adding/removing the `dark` class on <html>.
 *
 * Rules of thumb:
 *  - Use `ring-line` / `border-line` for default subtle separators.
 *  - Use `ring-pitch` / `border-pitch` for emphasized borders.
 *  - Primary buttons: `bg-pitch text-white`.
 *  - Secondary buttons: `bg-surface text-ink ring-1 ring-line`.
 */
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pitch: token('pitch'),
        pitch2: token('pitch2'),
        wood: token('wood'),
        rail: token('rail'),
        accent: token('accent'),
        paper: token('paper'),
        surface: token('surface'),
        ink: token('ink'),
        ink2: token('ink2'),
        line: token('line'),
      },
    },
  },
  plugins: [],
};

export default config;
