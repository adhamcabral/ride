export type Appearance = 'light' | 'dark' | 'system';

const APPEARANCE_KEY = 'ride:appearance';

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function prefersDark() {
  return canUseDom() && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function setThemeColor(theme: 'light' | 'dark') {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  meta?.setAttribute('content', theme === 'dark' ? '#1b1b1b' : '#f8fafd');
}

export function getStoredAppearance(): Appearance {
  if (!canUseDom()) return 'system';
  const stored = window.localStorage.getItem(APPEARANCE_KEY);
  return stored === 'dark' || stored === 'system' || stored === 'light' ? stored : 'system';
}

export function applyAppearance(appearance: Appearance): void {
  if (!canUseDom()) return;
  const theme = appearance === 'system' ? (prefersDark() ? 'dark' : 'light') : appearance;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  setThemeColor(theme);
}

export function setAppearance(appearance: Appearance): void {
  if (!canUseDom()) return;
  window.localStorage.setItem(APPEARANCE_KEY, appearance);
  applyAppearance(appearance);
}

export function initTheme(): () => void {
  if (!canUseDom()) return () => undefined;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const sync = () => applyAppearance(getStoredAppearance());
  sync();
  media.addEventListener('change', sync);
  return () => media.removeEventListener('change', sync);
}
