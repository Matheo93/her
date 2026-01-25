"use client";

/**
 * Theme Context - Dark/Light mode management
 * Sprint 572 - Frontend Feature
 *
 * Features:
 * - System preference detection
 * - LocalStorage persistence
 * - Smooth transitions
 * - HER color palette integration
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  ColorMode,
  getHerColors,
  getEmotionPresence,
  THEME_TRANSITION_MS,
} from "@/styles/her-theme";

interface ThemeContextValue {
  mode: ColorMode;
  colors: ReturnType<typeof getHerColors>;
  emotionPresence: ReturnType<typeof getEmotionPresence>;
  toggleMode: () => void;
  setMode: (mode: ColorMode) => void;
  isTransitioning: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "her-theme-mode";

/**
 * Get initial theme from storage or system preference
 */
function getInitialMode(): ColorMode {
  // Check localStorage first
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      return stored;
    }

    // Check system preference
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  }
  return "light";
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultMode?: ColorMode;
}

export function ThemeProvider({ children, defaultMode }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ColorMode>(defaultMode ?? "light");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Initialize from storage/system on mount
  useEffect(() => {
    setModeState(getInitialMode());
    setIsMounted(true);
  }, []);

  // Apply theme class to document
  useEffect(() => {
    if (!isMounted) return;

    const root = document.documentElement;

    // Add transition class for smooth theme switch
    root.classList.add("theme-transitioning");
    setIsTransitioning(true);

    // Apply theme
    if (mode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Store preference
    localStorage.setItem(STORAGE_KEY, mode);

    // Remove transition class after animation
    const timeout = setTimeout(() => {
      root.classList.remove("theme-transitioning");
      setIsTransitioning(false);
    }, THEME_TRANSITION_MS);

    return () => clearTimeout(timeout);
  }, [mode, isMounted]);

  // Listen for system preference changes
  useEffect(() => {
    if (!isMounted) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't set a preference
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setModeState(e.matches ? "dark" : "light");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [isMounted]);

  const toggleMode = useCallback(() => {
    setModeState((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const setMode = useCallback((newMode: ColorMode) => {
    setModeState(newMode);
  }, []);

  const value: ThemeContextValue = {
    mode,
    colors: getHerColors(mode),
    emotionPresence: getEmotionPresence(mode),
    toggleMode,
    setMode,
    isTransitioning,
  };

  // Prevent flash of wrong theme
  if (!isMounted) {
    return null;
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Hook for simple dark mode check
 */
export function useIsDarkMode(): boolean {
  const { mode } = useTheme();
  return mode === "dark";
}
