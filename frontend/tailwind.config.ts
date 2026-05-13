import type { Config } from 'tailwindcss';

/**
 * Palette: three accents only — pitch (dark green), rail (beige), accent (orange).
 * Plus neutrals: paper / surface / ink / ink2 / line.
 *
 * Rules of thumb:
 *  - Use `ring-line` / `border-line` for default subtle separators.
 *  - Use `ring-pitch` / `border-pitch` for emphasized borders.
 *  - Primary buttons: `bg-pitch text-white`.
 *  - Secondary buttons: `bg-surface text-ink ring-1 ring-line`.
 *  - Don't introduce translucent ring/border colors (e.g. `ring-pitch/30`) —
 *    they muddy against the warm paper background.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Field colors (used only for the pitch / table-soccer background)
        pitch: '#1a3d2e',
        pitch2: '#143020',
        // Beige / wood accents
        wood: '#8b6440',
        rail: '#c9a36c',
        // Warm orange accent (3rd brand color)
        accent: '#d97706',
        // Neutral UI surfaces
        paper: '#f7f3ea',   // warm off-white page background
        surface: '#ffffff', // cards
        ink: '#1c1c1c',     // primary text
        ink2: '#6b7280',    // secondary text / labels
        line: '#e7e0cf',    // soft beige borders
      },
    },
  },
  plugins: [],
};

export default config;
