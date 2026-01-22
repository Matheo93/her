"use client";

/**
 * useTouchAvatarInteraction - Touch-Optimized Avatar Interactions
 *
 * Provides smooth, responsive touch interactions for avatar on mobile devices.
 * Handles tap, double-tap, long-press, swipe, and drag gestures.
 *
 * Sprint 232: Avatar UX and mobile latency improvements
 *
 * Key features:
 * - Zero-delay tap response for perceived responsiveness
 * - Gesture recognition with configurable thresholds
 * - Haptic feedback integration
 * - Passive event listeners for smooth scrolling
 * - Touch position tracking for eye following
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useMobileDetect } from "./useMobileDetect";
import { useHapticFeedback } from "./useHapticFeedback";

type TouchGesture = "tap" | "double-tap" | "long-press" | "swipe-left" | "swipe-right" | "swipe-up" | "swipe-down" | "pinch" | "spread" | "pan" | "none";

interface TouchPosition {
  x: number;
  y: number;
  timestamp: number;
}

interface TouchState {
  // Current gesture being performed
  currentGesture: TouchGesture;

  // Whether touch is active
  isTouching: boolean;

  // Current touch position (normalized 0-1)
  position: { x: number; y: number } | null;

  // Velocity of touch movement
  velocity: { x: number; y: number };

  // Number of active touch points
  touchCount: number;

  // Time since touch started (ms)
  touchDuration: number;

  // Distance moved since touch started
  totalDistance: number;
}

interface TouchCallbacks {
  onTap?: (position: TouchPosition) => void;
  onDoubleTap?: (position: TouchPosition) => void;
  onLongPress?: (position: TouchPosition) => void;
  onSwipe?: (direction: "left" | "right" | "up" | "down", velocity: number) => void;
  onPinch?: (scale: number) => void;
  onPan?: (delta: { x: number; y: number }) => void;
  onTouchStart?: (position: TouchPosition) => void;
  onTouchMove?: (position: TouchPosition) => void;
  onTouchEnd?: (position: TouchPosition, gesture: TouchGesture) => void;
}

interface TouchConfig {
  // Time threshold for long press (ms)
  longPressThreshold?: number;

  // Time threshold for double tap (ms)
  doubleTapThreshold?: number;

  // Distance threshold for swipe recognition (px)
  swipeThreshold?: number;

  // Velocity threshold for swipe (px/ms)
  swipeVelocityThreshold?: number;

  // Whether to enable haptic feedback
  enableHaptics?: boolean;

  // Debounce time for gestures (ms)
  gestureDebounce?: number;

  // Whether to prevent default touch behavior
  preventDefault?: boolean;

  // Whether to use passive event listeners
  usePassive?: boolean;
}

interface UseTouchAvatarInteractionResult {
  // Ref to attach to the element
  ref: React.RefCallback<HTMLElement>;

  // Current touch state
  state: TouchState;

  // Gesture recognition results
  lastGesture: TouchGesture;

  // Normalized position for eye tracking (0-1 range)
  eyeTrackingPosition: { x: number; y: number } | null;

  // Whether device supports touch
  isTouchSupported: boolean;

  // Reset state
  reset: () => void;
}

const DEFAULT_CONFIG: Required<TouchConfig> = {
  longPressThreshold: 500,
  doubleTapThreshold: 300,
  swipeThreshold: 50,
  swipeVelocityThreshold: 0.3,
  enableHaptics: true,
  gestureDebounce: 100,
  preventDefault: false,
  usePassive: true,
};

export function useTouchAvatarInteraction(
  callbacks: TouchCallbacks = {},
  config: TouchConfig = {}
): UseTouchAvatarInteractionResult {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const { isTouchDevice, isMobile } = useMobileDetect();
  const { trigger: hapticTrigger } = useHapticFeedback();

  // State
  const [state, setState] = useState<TouchState>({
    currentGesture: "none",
    isTouching: false,
    position: null,
    velocity: { x: 0, y: 0 },
    touchCount: 0,
    touchDuration: 0,
    totalDistance: 0,
  });
  const [lastGesture, setLastGesture] = useState<TouchGesture>("none");
  const [eyeTrackingPosition, setEyeTrackingPosition] = useState<{ x: number; y: number } | null>(null);

  // Refs
  const elementRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<TouchPosition | null>(null);
  const touchHistoryRef = useRef<TouchPosition[]>([]);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const doubleTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const gestureLockedRef = useRef<boolean>(false);
  const touchStartTimeRef = useRef<number>(0);

  // Clear timers
  const clearTimers = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (doubleTapTimerRef.current) {
      clearTimeout(doubleTapTimerRef.current);
      doubleTapTimerRef.current = null;
    }
  }, []);

  // Get touch position relative to element
  const getTouchPosition = useCallback(
    (touch: Touch): TouchPosition => {
      const rect = elementRef.current?.getBoundingClientRect();
      if (!rect) {
        return { x: touch.clientX, y: touch.clientY, timestamp: Date.now() };
      }

      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        timestamp: Date.now(),
      };
    },
    []
  );

  // Get normalized position (0-1)
  const getNormalizedPosition = useCallback(
    (touch: Touch): { x: number; y: number } | null => {
      const rect = elementRef.current?.getBoundingClientRect();
      if (!rect) return null;

      const x = (touch.clientX - rect.left) / rect.width;
      const y = (touch.clientY - rect.top) / rect.height;

      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      };
    },
    []
  );

  // Calculate distance between two touch points
  const getDistance = useCallback((p1: TouchPosition, p2: TouchPosition): number => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }, []);

  // Calculate velocity
  const getVelocity = useCallback((): { x: number; y: number } => {
    const history = touchHistoryRef.current;
    if (history.length < 2) return { x: 0, y: 0 };

    const recent = history.slice(-5);
    const timeDiff = recent[recent.length - 1].timestamp - recent[0].timestamp;
    if (timeDiff === 0) return { x: 0, y: 0 };

    return {
      x: (recent[recent.length - 1].x - recent[0].x) / timeDiff,
      y: (recent[recent.length - 1].y - recent[0].y) / timeDiff,
    };
  }, []);

  // Recognize gesture from movement
  const recognizeGesture = useCallback(
    (velocity: { x: number; y: number }, distance: number): TouchGesture => {
      if (distance < mergedConfig.swipeThreshold) return "none";

      const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
      if (speed < mergedConfig.swipeVelocityThreshold) return "pan";

      const absX = Math.abs(velocity.x);
      const absY = Math.abs(velocity.y);

      if (absX > absY) {
        return velocity.x > 0 ? "swipe-right" : "swipe-left";
      } else {
        return velocity.y > 0 ? "swipe-down" : "swipe-up";
      }
    },
    [mergedConfig.swipeThreshold, mergedConfig.swipeVelocityThreshold]
  );

  // Touch event handlers
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (mergedConfig.preventDefault) {
        e.preventDefault();
      }

      const touch = e.touches[0];
      const position = getTouchPosition(touch);
      const normalized = getNormalizedPosition(touch);

      touchStartRef.current = position;
      touchHistoryRef.current = [position];
      touchStartTimeRef.current = Date.now();
      gestureLockedRef.current = false;

      setState({
        currentGesture: "none",
        isTouching: true,
        position: normalized,
        velocity: { x: 0, y: 0 },
        touchCount: e.touches.length,
        touchDuration: 0,
        totalDistance: 0,
      });

      setEyeTrackingPosition(normalized);

      // Haptic feedback on touch start (light)
      if (mergedConfig.enableHaptics && isMobile) {
        hapticTrigger("light");
      }

      callbacks.onTouchStart?.(position);

      // Set up long press timer
      clearTimers();
      longPressTimerRef.current = setTimeout(() => {
        if (touchStartRef.current && !gestureLockedRef.current) {
          gestureLockedRef.current = true;
          setLastGesture("long-press");
          setState((s) => ({ ...s, currentGesture: "long-press" }));

          if (mergedConfig.enableHaptics) {
            hapticTrigger("heavy");
          }

          callbacks.onLongPress?.(touchStartRef.current);
        }
      }, mergedConfig.longPressThreshold);

      // Handle pinch gesture (multi-touch)
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        initialPinchDistanceRef.current = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
      }
    },
    [
      mergedConfig.preventDefault,
      mergedConfig.enableHaptics,
      mergedConfig.longPressThreshold,
      getTouchPosition,
      getNormalizedPosition,
      clearTimers,
      callbacks,
      hapticTrigger,
      isMobile,
    ]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const touch = e.touches[0];
      const position = getTouchPosition(touch);
      const normalized = getNormalizedPosition(touch);

      touchHistoryRef.current.push(position);
      if (touchHistoryRef.current.length > 20) {
        touchHistoryRef.current.shift();
      }

      const velocity = getVelocity();
      const totalDistance = getDistance(touchStartRef.current, position);
      const duration = Date.now() - touchStartTimeRef.current;

      // Cancel long press if moved too much
      if (totalDistance > 10 && longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      // Handle pinch gesture
      if (e.touches.length === 2 && initialPinchDistanceRef.current) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        const scale = currentDistance / initialPinchDistanceRef.current;

        if (!gestureLockedRef.current && Math.abs(scale - 1) > 0.1) {
          gestureLockedRef.current = true;
          setLastGesture(scale > 1 ? "spread" : "pinch");
          callbacks.onPinch?.(scale);
        }
      }

      setState((s) => ({
        ...s,
        position: normalized,
        velocity,
        touchCount: e.touches.length,
        touchDuration: duration,
        totalDistance,
      }));

      setEyeTrackingPosition(normalized);

      callbacks.onTouchMove?.(position);

      // Handle pan gesture
      if (!gestureLockedRef.current && totalDistance > mergedConfig.swipeThreshold * 0.5) {
        const delta = {
          x: position.x - touchHistoryRef.current[touchHistoryRef.current.length - 2]?.x || 0,
          y: position.y - touchHistoryRef.current[touchHistoryRef.current.length - 2]?.y || 0,
        };
        callbacks.onPan?.(delta);
      }
    },
    [
      getTouchPosition,
      getNormalizedPosition,
      getVelocity,
      getDistance,
      mergedConfig.swipeThreshold,
      callbacks,
    ]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      clearTimers();

      if (!touchStartRef.current) return;

      const lastTouch = touchHistoryRef.current[touchHistoryRef.current.length - 1];
      const velocity = getVelocity();
      const totalDistance = lastTouch ? getDistance(touchStartRef.current, lastTouch) : 0;
      const duration = Date.now() - touchStartTimeRef.current;

      let gesture: TouchGesture = "none";

      if (!gestureLockedRef.current) {
        // Check for swipe
        gesture = recognizeGesture(velocity, totalDistance);

        if (gesture !== "none" && gesture !== "pan") {
          // Swipe detected
          if (mergedConfig.enableHaptics) {
            hapticTrigger("medium");
          }

          const direction = gesture.replace("swipe-", "") as "left" | "right" | "up" | "down";
          const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
          callbacks.onSwipe?.(direction, speed);
        } else if (totalDistance < 10 && duration < mergedConfig.longPressThreshold) {
          // Tap detected
          const now = Date.now();
          const timeSinceLastTap = now - lastTapTimeRef.current;

          if (timeSinceLastTap < mergedConfig.doubleTapThreshold) {
            // Double tap
            gesture = "double-tap";
            if (mergedConfig.enableHaptics) {
              hapticTrigger("medium");
            }
            callbacks.onDoubleTap?.(lastTouch || touchStartRef.current);
            lastTapTimeRef.current = 0; // Reset to prevent triple-tap
          } else {
            // Single tap
            gesture = "tap";
            lastTapTimeRef.current = now;

            if (mergedConfig.enableHaptics) {
              hapticTrigger("light");
            }
            callbacks.onTap?.(lastTouch || touchStartRef.current);
          }
        }
      } else {
        gesture = state.currentGesture;
      }

      setLastGesture(gesture);
      callbacks.onTouchEnd?.(lastTouch || touchStartRef.current, gesture);

      // Reset state
      setState({
        currentGesture: "none",
        isTouching: false,
        position: null,
        velocity: { x: 0, y: 0 },
        touchCount: 0,
        touchDuration: 0,
        totalDistance: 0,
      });

      touchStartRef.current = null;
      touchHistoryRef.current = [];
      initialPinchDistanceRef.current = null;
      gestureLockedRef.current = false;

      // Keep eye tracking position for a moment after release
      setTimeout(() => {
        setEyeTrackingPosition(null);
      }, 500);
    },
    [
      clearTimers,
      getVelocity,
      getDistance,
      recognizeGesture,
      mergedConfig.enableHaptics,
      mergedConfig.longPressThreshold,
      mergedConfig.doubleTapThreshold,
      callbacks,
      hapticTrigger,
      state.currentGesture,
    ]
  );

  // Ref callback
  const ref = useCallback(
    (element: HTMLElement | null) => {
      // Cleanup old listeners
      if (elementRef.current) {
        elementRef.current.removeEventListener("touchstart", handleTouchStart);
        elementRef.current.removeEventListener("touchmove", handleTouchMove);
        elementRef.current.removeEventListener("touchend", handleTouchEnd);
        elementRef.current.removeEventListener("touchcancel", handleTouchEnd);
      }

      elementRef.current = element;

      // Add new listeners
      if (element) {
        const options = { passive: mergedConfig.usePassive };
        element.addEventListener("touchstart", handleTouchStart, options);
        element.addEventListener("touchmove", handleTouchMove, options);
        element.addEventListener("touchend", handleTouchEnd, options);
        element.addEventListener("touchcancel", handleTouchEnd, options);
      }
    },
    [handleTouchStart, handleTouchMove, handleTouchEnd, mergedConfig.usePassive]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      if (elementRef.current) {
        elementRef.current.removeEventListener("touchstart", handleTouchStart);
        elementRef.current.removeEventListener("touchmove", handleTouchMove);
        elementRef.current.removeEventListener("touchend", handleTouchEnd);
        elementRef.current.removeEventListener("touchcancel", handleTouchEnd);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset function
  const reset = useCallback(() => {
    clearTimers();
    setState({
      currentGesture: "none",
      isTouching: false,
      position: null,
      velocity: { x: 0, y: 0 },
      touchCount: 0,
      touchDuration: 0,
      totalDistance: 0,
    });
    setLastGesture("none");
    setEyeTrackingPosition(null);
    touchStartRef.current = null;
    touchHistoryRef.current = [];
    initialPinchDistanceRef.current = null;
    gestureLockedRef.current = false;
  }, [clearTimers]);

  return {
    ref,
    state,
    lastGesture,
    eyeTrackingPosition,
    isTouchSupported: isTouchDevice,
    reset,
  };
}

/**
 * Simple hook for just eye tracking from touch
 */
export function useTouchEyeTracking(): {
  position: { x: number; y: number } | null;
  ref: React.RefCallback<HTMLElement>;
} {
  const { ref, eyeTrackingPosition } = useTouchAvatarInteraction();

  return {
    position: eyeTrackingPosition,
    ref,
  };
}

/**
 * Hook for avatar tap interactions
 */
export function useAvatarTap(
  onTap: (position: TouchPosition) => void,
  onDoubleTap?: (position: TouchPosition) => void
): React.RefCallback<HTMLElement> {
  const { ref } = useTouchAvatarInteraction({
    onTap,
    onDoubleTap,
  });

  return ref;
}

// Export types
export type {
  TouchGesture,
  TouchPosition,
  TouchState,
  TouchCallbacks,
  TouchConfig,
  UseTouchAvatarInteractionResult,
};
