"use client";

/**
 * useVisibility - Page Visibility API Hook
 *
 * Detects when the page is visible/hidden to pause expensive operations.
 * Essential for mobile battery optimization and performance.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface VisibilityState {
  // Whether the page is currently visible
  isVisible: boolean;

  // Whether the page has ever been hidden
  wasHidden: boolean;

  // Time spent visible (ms)
  visibleTime: number;

  // Time spent hidden (ms)
  hiddenTime: number;

  // Visibility state: "visible" | "hidden" | "prerender"
  visibilityState: DocumentVisibilityState;

  // Last visibility change timestamp
  lastChangeAt: number;
}

interface UseVisibilityOptions {
  // Callback when page becomes visible
  onVisible?: () => void;

  // Callback when page becomes hidden
  onHidden?: () => void;

  // Callback on any visibility change
  onChange?: (isVisible: boolean) => void;
}

export function useVisibility(options: UseVisibilityOptions = {}): VisibilityState {
  const { onVisible, onHidden, onChange } = options;

  const [state, setState] = useState<VisibilityState>(() => ({
    isVisible: typeof document !== "undefined" ? !document.hidden : true,
    wasHidden: false,
    visibleTime: 0,
    hiddenTime: 0,
    visibilityState: typeof document !== "undefined" ? document.visibilityState : "visible",
    lastChangeAt: Date.now(),
  }));

  const visibleStartRef = useRef<number>(Date.now());
  const hiddenStartRef = useRef<number | null>(null);
  const totalVisibleRef = useRef<number>(0);
  const totalHiddenRef = useRef<number>(0);

  const handleVisibilityChange = useCallback(() => {
    const isVisible = !document.hidden;
    const now = Date.now();

    if (isVisible) {
      // Becoming visible
      if (hiddenStartRef.current !== null) {
        totalHiddenRef.current += now - hiddenStartRef.current;
        hiddenStartRef.current = null;
      }
      visibleStartRef.current = now;
      onVisible?.();
    } else {
      // Becoming hidden
      totalVisibleRef.current += now - visibleStartRef.current;
      hiddenStartRef.current = now;
      onHidden?.();
    }

    onChange?.(isVisible);

    setState({
      isVisible,
      wasHidden: true,
      visibleTime: totalVisibleRef.current + (isVisible ? now - visibleStartRef.current : 0),
      hiddenTime: totalHiddenRef.current + (!isVisible && hiddenStartRef.current ? now - hiddenStartRef.current : 0),
      visibilityState: document.visibilityState,
      lastChangeAt: now,
    });
  }, [onVisible, onHidden, onChange]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handleVisibilityChange]);

  return state;
}

/**
 * Simple hook to get just the visibility boolean
 */
export function useIsVisible(): boolean {
  const { isVisible } = useVisibility();
  return isVisible;
}

/**
 * Hook that pauses a callback when page is hidden
 */
export function useVisibleCallback<T extends (...args: Parameters<T>) => ReturnType<T>>(
  callback: T,
  deps: React.DependencyList = []
): T {
  const { isVisible } = useVisibility();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback, ...deps]);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (isVisible) {
        return callbackRef.current(...args);
      }
    }) as T,
    [isVisible]
  );
}

/**
 * Hook that returns a value only when visible, otherwise returns fallback
 */
export function useVisibleValue<T>(value: T, fallback: T): T {
  const { isVisible } = useVisibility();
  return isVisible ? value : fallback;
}

/**
 * Hook for interval that pauses when hidden
 */
export function useVisibleInterval(
  callback: () => void,
  delay: number | null
): {
  isPaused: boolean;
} {
  const { isVisible } = useVisibility();
  const callbackRef = useRef(callback);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null || !isVisible) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      callbackRef.current();
    }, delay);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [delay, isVisible]);

  return { isPaused: !isVisible };
}

/**
 * Hook for RAF that pauses when hidden
 */
export function useVisibleAnimationFrame(
  callback: (deltaTime: number) => void,
  enabled: boolean = true
): {
  isPaused: boolean;
} {
  const { isVisible } = useVisibility();
  const callbackRef = useRef(callback);
  const frameRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const shouldRun = enabled && isVisible;

  useEffect(() => {
    if (!shouldRun) {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      previousTimeRef.current = 0;
      return;
    }

    const animate = (time: number) => {
      if (previousTimeRef.current) {
        const deltaTime = time - previousTimeRef.current;
        callbackRef.current(deltaTime);
      }
      previousTimeRef.current = time;
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [shouldRun]);

  return { isPaused: !isVisible };
}
