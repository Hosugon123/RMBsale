import * as React from "react";
import { applyTheme, getStoredTheme, toggleTheme, type Theme } from "../lib/theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => getStoredTheme());

  const setTheme = React.useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  const toggle = React.useCallback(() => {
    setThemeState((current) => toggleTheme(current));
  }, []);

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = React.useMemo(() => ({ theme, setTheme, toggleTheme: toggle }), [theme, setTheme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
