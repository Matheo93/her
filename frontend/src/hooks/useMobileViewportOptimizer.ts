/**
 * useMobileViewportOptimizer - Viewport and layout optimization for mobile
 *
 * Sprint 1591 - Handles dynamic viewport adjustments, safe areas, keyboard
 * handling, and orientation changes for optimal mobile UX.
 *
 * Features:
 * - Dynamic viewport height (100vh fix)
 * - Safe area inset handling
 * - Virtual keyboard detection
 * - Orientation change handling
 * - Scroll lock management
 * - Viewport-aware component sizing
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Orientation types
export type ViewportOrientation = "portrait" | "landscape" | "portrait-primary" | "portrait-secondary" | "landscape-primary" | "landscape-secondary";

// Viewport state types
export type KeyboardState = "hidden" | "showing" | "visible" | "hiding";

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportDimensions {
  width: number;
  height: number;
  visualWidth: number;
  visualHeight: number;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
}

export interface ViewportState {
  dimensions: ViewportDimensions;
  orientation: ViewportOrientation;
  safeAreaInsets: SafeAreaInsets;
  keyboardState: KeyboardState;
  keyboardHeight: number;
  isScrollLocked: boolean;
  isFullscreen: boolean;
  availableHeight: number; // Height minus keyboard and safe areas
}

export interface ViewportMetrics {
  orientationChanges: number;
  keyboardShowCount: number;
  averageKeyboardHeight: number;
  scrollLockCount: number;
  resizeCount: number;
  viewportUpdates: number;
}

export interface ViewportConfig {
  enableDynamicVH: boolean; // Fix 100vh on mobile
  enableSafeAreaHandling: boolean;
  enableKeyboardDetection: boolean;
  enableOrientationLock: ViewportOrientation | null;
  keyboardAnimationDuration: number; // ms
  resizeDebounceMs: number;
  scrollLockOnKeyboard: boolean;
}

export interface ViewportControls {
  lockScroll: () => void;
  unlockScroll: () => void;
  requestFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  lockOrientation: (orientation: ViewportOrientation) => Promise<void>;
  unlockOrientation: () => void;
  scrollToTop: (smooth?: boolean) => void;
  scrollToBottom: (smooth?: boolean) => void;
  focusInput: (element: HTMLElement) => void;
  updateConfig: (config: Partial<ViewportConfig>) => void;
  getCSSVars: () => Record<string, string>;
}

export interface UseMobileViewportOptimizerResult {
  state: ViewportState;
  metrics: ViewportMetrics;
  controls: ViewportControls;
  config: ViewportConfig;
}

const DEFAULT_CONFIG: ViewportConfig = {
  enableDynamicVH: true,
  enableSafeAreaHandling: true,
  enableKeyboardDetection: true,
  enableOrientationLock: null,
  keyboardAnimationDuration: 300,
  resizeDebounceMs: 100,
  scrollLockOnKeyboard: false,
};

function getOrientation(): ViewportOrientation {
  if (typeof window === "undefined") return "portrait";

  if (screen.orientation) {
    return screen.orientation.type as ViewportOrientation;
  }

  return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
}

function getSafeAreaInsets(): SafeAreaInsets {
  if (typeof window === "undefined") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const computedStyle = getComputedStyle(document.documentElement);

  return {
    top: parseInt(computedStyle.getPropertyValue("--sat") || "0", 10) ||
         parseInt(computedStyle.getPropertyValue("env(safe-area-inset-top)") || "0", 10),
    right: parseInt(computedStyle.getPropertyValue("--sar") || "0", 10) ||
           parseInt(computedStyle.getPropertyValue("env(safe-area-inset-right)") || "0", 10),
    bottom: parseInt(computedStyle.getPropertyValue("--sab") || "0", 10) ||
            parseInt(computedStyle.getPropertyValue("env(safe-area-inset-bottom)") || "0", 10),
    left: parseInt(computedStyle.getPropertyValue("--sal") || "0", 10) ||
          parseInt(computedStyle.getPropertyValue("env(safe-area-inset-left)") || "0", 10),
  };
}

function getViewportDimensions(): ViewportDimensions {
  if (typeof window === "undefined") {
    return {
      width: 0,
      height: 0,
      visualWidth: 0,
      visualHeight: 0,
      innerWidth: 0,
      innerHeight: 0,
      devicePixelRatio: 1,
    };
  }

  const visualViewport = window.visualViewport;

  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
    visualWidth: visualViewport?.width || window.innerWidth,
    visualHeight: visualViewport?.height || window.innerHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

export function useMobileViewportOptimizer(
  initialConfig: Partial<ViewportConfig> = {}
): UseMobileViewportOptimizerResult {
  const [config, setConfig] = useState<ViewportConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [state, setState] = useState<ViewportState>(() => {
    const dimensions = getViewportDimensions();
    const safeAreaInsets = getSafeAreaInsets();
    return {
      dimensions,
      orientation: getOrientation(),
      safeAreaInsets,
      keyboardState: "hidden",
      keyboardHeight: 0,
      isScrollLocked: false,
      isFullscreen: false,
      availableHeight: dimensions.innerHeight - safeAreaInsets.top - safeAreaInsets.bottom,
    };
  });

  const [metrics, setMetrics] = useState<ViewportMetrics>({
    orientationChanges: 0,
    keyboardShowCount: 0,
    averageKeyboardHeight: 0,
    scrollLockCount: 0,
    resizeCount: 0,
    viewportUpdates: 0,
  });

  // Refs
  const scrollPositionRef = useRef(0);
  const keyboardHeightsRef = useRef<number[]>([]);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialViewportHeightRef = useRef(0);
  const lastInnerHeightRef = useRef(0);

  // Store initial viewport height
  useEffect(() => {
    if (typeof window !== "undefined") {
      initialViewportHeightRef.current = window.innerHeight;
      lastInnerHeightRef.current = window.innerHeight;
    }
  }, []);

  // Update CSS variables for dynamic VH
  const updateCSSVars = useCallback(() => {
    if (typeof document === "undefined" || !config.enableDynamicVH) return;

    const vh = window.innerHeight * 0.01;
    const visualVh = (window.visualViewport?.height || window.innerHeight) * 0.01;
    const safeAreaInsets = getSafeAreaInsets();

    document.documentElement.style.setProperty("--vh", `${vh}px`);
    document.documentElement.style.setProperty("--visual-vh", `${visualVh}px`);
    document.documentElement.style.setProperty("--viewport-height", `${window.innerHeight}px`);
    document.documentElement.style.setProperty("--sat", `${safeAreaInsets.top}px`);
    document.documentElement.style.setProperty("--sar", `${safeAreaInsets.right}px`);
    document.documentElement.style.setProperty("--sab", `${safeAreaInsets.bottom}px`);
    document.documentElement.style.setProperty("--sal", `${safeAreaInsets.left}px`);
  }, [config.enableDynamicVH]);

  // Lock scroll
  const lockScroll = useCallback(() => {
    if (typeof document === "undefined") return;

    scrollPositionRef.current = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollPositionRef.current}px`;
    document.body.style.width = "100%";

    setState((prev) => ({ ...prev, isScrollLocked: true }));
    setMetrics((prev) => ({ ...prev, scrollLockCount: prev.scrollLockCount + 1 }));
  }, []);

  // Unlock scroll
  const unlockScroll = useCallback(() => {
    if (typeof document === "undefined") return;

    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, scrollPositionRef.current);

    setState((prev) => ({ ...prev, isScrollLocked: false }));
  }, []);

  // Request fullscreen
  const requestFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;

    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      }
      setState((prev) => ({ ...prev, isFullscreen: true }));
    } catch (err) {
      console.error("Fullscreen request failed:", err);
    }
  }, []);

  // Exit fullscreen
  const exitFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;

    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      }
      setState((prev) => ({ ...prev, isFullscreen: false }));
    } catch (err) {
      console.error("Exit fullscreen failed:", err);
    }
  }, []);

  // Lock orientation
  const lockOrientation = useCallback(async (orientation: ViewportOrientation) => {
    if (typeof screen === "undefined" || !screen.orientation) return;

    try {
      await screen.orientation.lock(orientation);
    } catch (err) {
      console.error("Orientation lock failed:", err);
    }
  }, []);

  // Unlock orientation
  const unlockOrientation = useCallback(() => {
    if (typeof screen === "undefined" || !screen.orientation) return;

    try {
      screen.orientation.unlock();
    } catch (err) {
      console.error("Orientation unlock failed:", err);
    }
  }, []);

  // Scroll helpers
  const scrollToTop = useCallback((smooth = true) => {
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // Focus input with keyboard handling
  const focusInput = useCallback(
    (element: HTMLElement) => {
      if (!element) return;

      // Wait for keyboard to appear then scroll element into view
      element.focus();

      setTimeout(() => {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, config.keyboardAnimationDuration);
    },
    [config.keyboardAnimationDuration]
  );

  // Update config
  const updateConfig = useCallback((updates: Partial<ViewportConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Get CSS variables
  const getCSSVars = useCallback(() => {
    const safeAreaInsets = getSafeAreaInsets();
    const vh = typeof window !== "undefined" ? window.innerHeight * 0.01 : 0;

    return {
      "--vh": `${vh}px`,
      "--viewport-height": `${typeof window !== "undefined" ? window.innerHeight : 0}px`,
      "--keyboard-height": `${state.keyboardHeight}px`,
      "--safe-area-top": `${safeAreaInsets.top}px`,
      "--safe-area-right": `${safeAreaInsets.right}px`,
      "--safe-area-bottom": `${safeAreaInsets.bottom}px`,
      "--safe-area-left": `${safeAreaInsets.left}px`,
      "--available-height": `${state.availableHeight}px`,
    };
  }, [state.keyboardHeight, state.availableHeight]);

  // Handle resize
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      resizeTimeoutRef.current = setTimeout(() => {
        const dimensions = getViewportDimensions();
        const safeAreaInsets = getSafeAreaInsets();
        const orientation = getOrientation();

        // Detect keyboard by comparing heights
        const heightDiff = initialViewportHeightRef.current - window.innerHeight;
        const isKeyboardVisible = heightDiff > 150; // Threshold for keyboard

        let keyboardState: KeyboardState = "hidden";
        let keyboardHeight = 0;

        if (isKeyboardVisible) {
          keyboardHeight = heightDiff;
          keyboardState = "visible";

          // Track keyboard heights
          keyboardHeightsRef.current.push(keyboardHeight);
          if (keyboardHeightsRef.current.length > 10) {
            keyboardHeightsRef.current.shift();
          }

          const avgKeyboardHeight =
            keyboardHeightsRef.current.reduce((a, b) => a + b, 0) /
            keyboardHeightsRef.current.length;

          setMetrics((prev) => ({
            ...prev,
            keyboardShowCount: prev.keyboardShowCount + 1,
            averageKeyboardHeight: avgKeyboardHeight,
          }));

          if (config.scrollLockOnKeyboard) {
            lockScroll();
          }
        } else if (lastInnerHeightRef.current < window.innerHeight) {
          // Keyboard was visible, now hidden
          if (config.scrollLockOnKeyboard && state.isScrollLocked) {
            unlockScroll();
          }
        }

        lastInnerHeightRef.current = window.innerHeight;

        const availableHeight =
          dimensions.innerHeight -
          safeAreaInsets.top -
          safeAreaInsets.bottom -
          keyboardHeight;

        setState((prev) => ({
          ...prev,
          dimensions,
          orientation,
          safeAreaInsets,
          keyboardState,
          keyboardHeight,
          availableHeight,
        }));

        setMetrics((prev) => ({
          ...prev,
          resizeCount: prev.resizeCount + 1,
          viewportUpdates: prev.viewportUpdates + 1,
        }));

        updateCSSVars();
      }, config.resizeDebounceMs);
    };

    window.addEventListener("resize", handleResize);

    // Visual viewport API for more accurate keyboard detection
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
    }

    // Initial update
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleResize);
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [
    config.resizeDebounceMs,
    config.scrollLockOnKeyboard,
    state.isScrollLocked,
    updateCSSVars,
    lockScroll,
    unlockScroll,
  ]);

  // Handle orientation change
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOrientationChange = () => {
      const orientation = getOrientation();

      setState((prev) => ({ ...prev, orientation }));
      setMetrics((prev) => ({
        ...prev,
        orientationChanges: prev.orientationChanges + 1,
      }));

      // Update CSS vars after orientation change
      setTimeout(updateCSSVars, 100);
    };

    if (screen.orientation) {
      screen.orientation.addEventListener("change", handleOrientationChange);
    } else {
      window.addEventListener("orientationchange", handleOrientationChange);
    }

    return () => {
      if (screen.orientation) {
        screen.orientation.removeEventListener("change", handleOrientationChange);
      } else {
        window.removeEventListener("orientationchange", handleOrientationChange);
      }
    };
  }, [updateCSSVars]);

  // Handle fullscreen change
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleFullscreenChange = () => {
      const isFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement
      );
      setState((prev) => ({ ...prev, isFullscreen }));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Apply orientation lock if configured
  useEffect(() => {
    if (config.enableOrientationLock) {
      lockOrientation(config.enableOrientationLock);
    }
  }, [config.enableOrientationLock, lockOrientation]);

  const controls: ViewportControls = useMemo(
    () => ({
      lockScroll,
      unlockScroll,
      requestFullscreen,
      exitFullscreen,
      lockOrientation,
      unlockOrientation,
      scrollToTop,
      scrollToBottom,
      focusInput,
      updateConfig,
      getCSSVars,
    }),
    [
      lockScroll,
      unlockScroll,
      requestFullscreen,
      exitFullscreen,
      lockOrientation,
      unlockOrientation,
      scrollToTop,
      scrollToBottom,
      focusInput,
      updateConfig,
      getCSSVars,
    ]
  );

  return {
    state,
    metrics,
    controls,
    config,
  };
}

// Sub-hook: Simple viewport dimensions
export function useViewportDimensions(): ViewportDimensions {
  const { state } = useMobileViewportOptimizer();
  return state.dimensions;
}

// Sub-hook: Keyboard-aware height
export function useKeyboardAwareHeight(): {
  height: number;
  keyboardHeight: number;
  isKeyboardVisible: boolean;
} {
  const { state } = useMobileViewportOptimizer();

  return {
    height: state.availableHeight,
    keyboardHeight: state.keyboardHeight,
    isKeyboardVisible: state.keyboardState === "visible",
  };
}

// Sub-hook: Safe area insets
export function useSafeAreaInsets(): SafeAreaInsets {
  const { state } = useMobileViewportOptimizer();
  return state.safeAreaInsets;
}

export default useMobileViewportOptimizer;
