import { afterEach, describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  initTheme,
  toggleTheme,
} from "../lib/theme";

describe("theme persistence", () => {
  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove("light", "dark");
    delete document.documentElement.dataset.theme;
  });

  it("stores light theme in localStorage", () => {
    applyTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(getStoredTheme()).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("restores stored theme on initTheme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add("dark");
    initTheme();
    expect(getStoredTheme()).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("toggleTheme flips and persists", () => {
    applyTheme("dark");
    const next = toggleTheme("dark");
    expect(next).toBe("light");
    expect(getStoredTheme()).toBe("light");
  });
});
