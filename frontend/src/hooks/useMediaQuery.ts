"use client";

/**
 * useMediaQuery - CSS Media Query Hook
 *
 * Provides reactive access to CSS media query matches.
 * Useful for responsive logic in components.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useState, useEffect, useCallback } from "react";

/**
 * Hook to match a CSS media query
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(query);

    // Set initial value
    setMatches(mediaQuery.matches);

    // Create listener
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handler);
    } else {
      // Legacy support
      mediaQuery.addListener(handler);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handler);
      } else {
        mediaQuery.removeListener(handler);
      }
    };
  }, [query]);

  return matches;
}

/**
 * Predefined breakpoint hooks
 */

// Mobile first breakpoints (min-width)
export function useIsSmall(): boolean {
  return useMediaQuery("(min-width: 640px)");
}

export function useIsMedium(): boolean {
  return useMediaQuery("(min-width: 768px)");
}

export function useIsLarge(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

export function useIsXLarge(): boolean {
  return useMediaQuery("(min-width: 1280px)");
}

export function useIs2XLarge(): boolean {
  return useMediaQuery("(min-width: 1536px)");
}

// Desktop first breakpoints (max-width)
export function useIsMobileOrSmaller(): boolean {
  return useMediaQuery("(max-width: 639px)");
}

export function useIsTabletOrSmaller(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}

/**
 * Hook for prefers-color-scheme
 */
export function usePrefersColorScheme(): "light" | "dark" | "no-preference" {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const prefersLight = useMediaQuery("(prefers-color-scheme: light)");

  if (prefersDark) return "dark";
  if (prefersLight) return "light";
  return "no-preference";
}

/**
 * Hook for prefers-reduced-motion (already exists in useReducedMotion, but added here for completeness)
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/**
 * Hook for prefers-contrast
 */
export function usePrefersContrast(): "more" | "less" | "no-preference" {
  const prefersMore = useMediaQuery("(prefers-contrast: more)");
  const prefersLess = useMediaQuery("(prefers-contrast: less)");

  if (prefersMore) return "more";
  if (prefersLess) return "less";
  return "no-preference";
}

/**
 * Hook for orientation
 */
export function useOrientationQuery(): "portrait" | "landscape" {
  const isPortrait = useMediaQuery("(orientation: portrait)");
  return isPortrait ? "portrait" : "landscape";
}

/**
 * Hook for pointer type (coarse = touch, fine = mouse)
 */
export function usePointerType(): "coarse" | "fine" | "none" {
  const isCoarse = useMediaQuery("(pointer: coarse)");
  const isFine = useMediaQuery("(pointer: fine)");

  if (isCoarse) return "coarse";
  if (isFine) return "fine";
  return "none";
}

/**
 * Hook for hover capability
 */
export function useCanHover(): boolean {
  return useMediaQuery("(hover: hover)");
}

/**
 * Hook for display-mode (standalone = PWA)
 */
export function useDisplayMode(): "standalone" | "browser" | "minimal-ui" | "fullscreen" {
  const isStandalone = useMediaQuery("(display-mode: standalone)");
  const isMinimalUi = useMediaQuery("(display-mode: minimal-ui)");
  const isFullscreen = useMediaQuery("(display-mode: fullscreen)");

  if (isStandalone) return "standalone";
  if (isMinimalUi) return "minimal-ui";
  if (isFullscreen) return "fullscreen";
  return "browser";
}

/**
 * Hook for device pixel ratio
 */
export function useHighDPI(): boolean {
  return useMediaQuery("(-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi)");
}

/**
 * Hook to get all breakpoint states at once
 */
export function useBreakpoints(): {
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
  is2xl: boolean;
} {
  return {
    isSm: useMediaQuery("(min-width: 640px)"),
    isMd: useMediaQuery("(min-width: 768px)"),
    isLg: useMediaQuery("(min-width: 1024px)"),
    isXl: useMediaQuery("(min-width: 1280px)"),
    is2xl: useMediaQuery("(min-width: 1536px)"),
  };
}

/**
 * Hook for safe area insets (notch, home indicator)
 * Note: Returns true if device has safe areas
 */
export function useHasSafeAreas(): boolean {
  return useMediaQuery("(env(safe-area-inset-top) > 0) or (env(safe-area-inset-bottom) > 0)");
}
