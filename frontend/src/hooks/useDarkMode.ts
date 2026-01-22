import { useState, useEffect, useCallback } from "react";
import { ColorMode, getHerColors, HER_COLORS, HER_COLORS_DARK } from "@/styles/her-theme";

const STORAGE_KEY = "eva-color-mode";

export function useDarkMode() {
  const [mode, setMode] = useState<ColorMode>("light");
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(STORAGE_KEY) as ColorMode | null;
    if (stored === "dark" || stored === "light") {
      setMode(stored);
    } else {
      // Check system preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setMode(prefersDark ? "dark" : "light");
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when mode changes
  useEffect(() => {
    if (!isLoaded || typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode, isLoaded]);

  // Toggle function
  const toggle = useCallback(() => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  // Set specific mode
  const setColorMode = useCallback((newMode: ColorMode) => {
    setMode(newMode);
  }, []);

  // Get current colors
  const colors = getHerColors(mode);

  return {
    mode,
    toggle,
    setColorMode,
    isDark: mode === "dark",
    isLight: mode === "light",
    isLoaded,
    colors,
    // Export both palettes for comparison
    lightColors: HER_COLORS,
    darkColors: HER_COLORS_DARK,
  };
}
