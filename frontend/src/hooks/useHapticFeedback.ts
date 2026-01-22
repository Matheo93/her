"use client";

/**
 * useHapticFeedback - Tactile Response for Mobile
 *
 * Provides haptic feedback on mobile devices for key interactions.
 * Falls back gracefully on devices without vibration support.
 *
 * Patterns:
 * - light: Quick tap (10ms) - button press
 * - medium: Confirmation (25ms) - successful action
 * - heavy: Emphasis (50ms) - error or important
 * - double: Two quick taps - toggle
 * - success: Rising pattern - task complete
 * - error: Falling pattern - error occurred
 *
 * Sprint 129: Mobile responsive enhancements
 */

import { useCallback, useRef, useEffect } from "react";

type HapticPattern = "light" | "medium" | "heavy" | "double" | "success" | "error";

interface HapticFeedbackResult {
  // Trigger haptic feedback
  trigger: (pattern?: HapticPattern) => void;

  // Check if haptics are supported
  isSupported: boolean;

  // Enable/disable haptics
  setEnabled: (enabled: boolean) => void;
}

// Vibration patterns (in milliseconds)
const PATTERNS: Record<HapticPattern, number[]> = {
  light: [10],
  medium: [25],
  heavy: [50],
  double: [15, 50, 15],
  success: [10, 30, 20, 30, 30],
  error: [50, 30, 50],
};

export function useHapticFeedback(): HapticFeedbackResult {
  const enabledRef = useRef(true);
  const supportedRef = useRef(false);

  // Check support on mount
  useEffect(() => {
    supportedRef.current =
      typeof navigator !== "undefined" &&
      "vibrate" in navigator &&
      typeof navigator.vibrate === "function";
  }, []);

  const trigger = useCallback((pattern: HapticPattern = "light") => {
    if (!enabledRef.current || !supportedRef.current) return;

    try {
      navigator.vibrate(PATTERNS[pattern]);
    } catch {
      // Silently fail if vibration fails
    }
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    enabledRef.current = enabled;
  }, []);

  return {
    trigger,
    isSupported: supportedRef.current,
    setEnabled,
  };
}

/**
 * Hook to add haptic feedback to touch events
 */
export function useTouchHaptic(
  pattern: HapticPattern = "light"
): {
  onTouchStart: () => void;
  onTouchEnd: () => void;
} {
  const { trigger } = useHapticFeedback();
  const touchStartRef = useRef<number>(0);

  const onTouchStart = useCallback(() => {
    touchStartRef.current = Date.now();
    trigger(pattern);
  }, [trigger, pattern]);

  const onTouchEnd = useCallback(() => {
    // Only trigger end feedback if touch was short (< 300ms)
    const duration = Date.now() - touchStartRef.current;
    if (duration < 300) {
      // Short feedback on release
      setTimeout(() => trigger("light"), 10);
    }
  }, [trigger]);

  return { onTouchStart, onTouchEnd };
}
