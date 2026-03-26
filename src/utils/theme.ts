import { ThemeMode } from '@/types/header.ts';

export function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
}
