export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "rmbsale.theme";

function parseTheme(value: string | null): Theme | null {
  const normalized = value?.trim();
  if (normalized === "light" || normalized === "dark") return normalized;
  return null;
}

export function getStoredTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY)) ?? "dark";
  } catch {
    return "dark";
  }
}

export function readThemeFromDocument(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** 在 React 掛載前同步還原主題，避免重整後閃回深色。 */
export function initTheme() {
  applyTheme(getStoredTheme());
}

export function toggleTheme(current: Theme): Theme {
  const next: Theme = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
