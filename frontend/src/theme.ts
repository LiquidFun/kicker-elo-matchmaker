import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const THEME_META_COLOR: Record<Theme, string> = {
  light: '#f7f3ea',
  dark: '#241e16',
};

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_META_COLOR[theme]);
}

let current: Theme = readStored() ?? 'light';
const listeners = new Set<() => void>();

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme): void {
  if (theme === current) return;
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore quota / unavailable storage */
  }
  apply(theme);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, getTheme);
  return [theme, setTheme];
}

/**
 * Read a `--c-<name>` color variable as an `rgb()` string. Useful for libraries
 * (e.g. recharts) that need concrete color strings rather than CSS variables.
 */
export function cssVar(name: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--c-${name}`)
    .trim();
  return v ? `rgb(${v})` : '';
}
