"use client";

/**
 * useTouchGestures - Mobile Touch Gesture Detection
 *
 * Detects swipes, taps, long press, and pinch gestures.
 * Optimized for mobile UX with configurable thresholds.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface SwipeGesture {
  direction: "up" | "down" | "left" | "right";
  distance: number;
  velocity: number;
}

interface PinchGesture {
  scale: number;
  center: { x: number; y: number };
}

interface GestureCallbacks {
  onSwipe?: (gesture: SwipeGesture) => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onTap?: (point: { x: number; y: number }) => void;
  onDoubleTap?: (point: { x: number; y: number }) => void;
  onLongPress?: (point: { x: number; y: number }) => void;
  onPinch?: (gesture: PinchGesture) => void;
}

interface GestureOptions {
  swipeThreshold?: number; // Minimum distance for swipe (px)
  swipeVelocityThreshold?: number; // Minimum velocity for swipe (px/ms)
  longPressDelay?: number; // Time for long press (ms)
  doubleTapDelay?: number; // Max time between taps for double tap (ms)
  enabled?: boolean;
}

interface GestureState {
  isSwiping: boolean;
  isLongPressing: boolean;
  isPinching: boolean;
  swipeDirection: "up" | "down" | "left" | "right" | null;
}

const DEFAULT_OPTIONS: Required<GestureOptions> = {
  swipeThreshold: 50,
  swipeVelocityThreshold: 0.3,
  longPressDelay: 500,
  doubleTapDelay: 300,
  enabled: true,
};

export function useTouchGestures(
  ref: React.RefObject<HTMLElement>,
  callbacks: GestureCallbacks,
  options?: GestureOptions
): GestureState {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const [state, setState] = useState<GestureState>({
    isSwiping: false,
    isLongPressing: false,
    isPinching: false,
    swipeDirection: null,
  });

  const touchStartRef = useRef<TouchPoint | null>(null);
  const lastTapRef = useRef<number>(0);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialPinchDistanceRef = useRef<number>(0);

  // Calculate distance between two touch points
  const getDistance = useCallback((touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Calculate center point between two touches
  const getCenter = useCallback(
    (touch1: Touch, touch2: Touch): { x: number; y: number } => ({
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    }),
    []
  );

  // Clear long press timeout
  const clearLongPress = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  // Touch start handler
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!opts.enabled) return;

      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: Date.now(),
      };

      // Handle pinch start
      if (e.touches.length === 2) {
        setState((prev) => ({ ...prev, isPinching: true }));
        initialPinchDistanceRef.current = getDistance(e.touches[0], e.touches[1]);
        clearLongPress();
        return;
      }

      // Start long press timer
      longPressTimeoutRef.current = setTimeout(() => {
        setState((prev) => ({ ...prev, isLongPressing: true }));
        callbacks.onLongPress?.({ x: touch.clientX, y: touch.clientY });
      }, opts.longPressDelay);
    },
    [opts.enabled, opts.longPressDelay, callbacks, getDistance, clearLongPress]
  );

  // Touch move handler
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!opts.enabled || !touchStartRef.current) return;

      // Cancel long press on move
      clearLongPress();

      // Handle pinch
      if (e.touches.length === 2 && state.isPinching) {
        const currentDistance = getDistance(e.touches[0], e.touches[1]);
        const scale = currentDistance / initialPinchDistanceRef.current;
        const center = getCenter(e.touches[0], e.touches[1]);

        callbacks.onPinch?.({ scale, center });
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Detect swipe direction during move
      if (distance > opts.swipeThreshold / 2) {
        let direction: "up" | "down" | "left" | "right";

        if (Math.abs(dx) > Math.abs(dy)) {
          direction = dx > 0 ? "right" : "left";
        } else {
          direction = dy > 0 ? "down" : "up";
        }

        setState((prev) => ({
          ...prev,
          isSwiping: true,
          swipeDirection: direction,
        }));
      }
    },
    [opts.enabled, opts.swipeThreshold, state.isPinching, callbacks, getDistance, getCenter, clearLongPress]
  );

  // Touch end handler
  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!opts.enabled) return;

      clearLongPress();

      // Reset pinch state
      if (state.isPinching) {
        setState((prev) => ({ ...prev, isPinching: false }));
        initialPinchDistanceRef.current = 0;
        return;
      }

      if (!touchStartRef.current) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const duration = Date.now() - touchStartRef.current.timestamp;
      const velocity = distance / duration;

      // Reset swipe state
      setState((prev) => ({
        ...prev,
        isSwiping: false,
        isLongPressing: false,
        swipeDirection: null,
      }));

      // Check for swipe
      if (distance >= opts.swipeThreshold && velocity >= opts.swipeVelocityThreshold) {
        let direction: "up" | "down" | "left" | "right";

        if (Math.abs(dx) > Math.abs(dy)) {
          direction = dx > 0 ? "right" : "left";
        } else {
          direction = dy > 0 ? "down" : "up";
        }

        const gesture: SwipeGesture = { direction, distance, velocity };
        callbacks.onSwipe?.(gesture);

        switch (direction) {
          case "up":
            callbacks.onSwipeUp?.();
            break;
          case "down":
            callbacks.onSwipeDown?.();
            break;
          case "left":
            callbacks.onSwipeLeft?.();
            break;
          case "right":
            callbacks.onSwipeRight?.();
            break;
        }
      } else if (distance < 10) {
        // Check for tap / double tap
        const now = Date.now();
        const timeSinceLastTap = now - lastTapRef.current;

        if (timeSinceLastTap < opts.doubleTapDelay) {
          callbacks.onDoubleTap?.({ x: touch.clientX, y: touch.clientY });
          lastTapRef.current = 0;
        } else {
          callbacks.onTap?.({ x: touch.clientX, y: touch.clientY });
          lastTapRef.current = now;
        }
      }

      touchStartRef.current = null;
    },
    [opts, state.isPinching, callbacks, clearLongPress]
  );

  // Attach event listeners
  useEffect(() => {
    const element = ref.current;
    if (!element || !opts.enabled) return;

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchEnd);
      clearLongPress();
    };
  }, [ref, opts.enabled, handleTouchStart, handleTouchMove, handleTouchEnd, clearLongPress]);

  return state;
}

/**
 * Simple swipe detection hook
 */
export function useSwipe(
  ref: React.RefObject<HTMLElement>,
  onSwipe: (direction: "up" | "down" | "left" | "right") => void,
  options?: { threshold?: number; enabled?: boolean }
) {
  return useTouchGestures(ref, {
    onSwipeUp: () => onSwipe("up"),
    onSwipeDown: () => onSwipe("down"),
    onSwipeLeft: () => onSwipe("left"),
    onSwipeRight: () => onSwipe("right"),
  }, options);
}

/**
 * Pull-to-refresh gesture hook
 */
export function usePullToRefresh(
  ref: React.RefObject<HTMLElement>,
  onRefresh: () => void | Promise<void>,
  options?: { threshold?: number; enabled?: boolean }
): { isRefreshing: boolean; progress: number } {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);
  const startYRef = useRef<number>(0);
  const threshold = options?.threshold ?? 80;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (element.scrollTop === 0) {
        startYRef.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startYRef.current === 0 || isRefreshing) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;

      if (diff > 0 && element.scrollTop === 0) {
        const prog = Math.min(diff / threshold, 1);
        setProgress(prog);
      }
    };

    const handleTouchEnd = async () => {
      if (progress >= 1 && !isRefreshing) {
        setIsRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      }
      setProgress(0);
      startYRef.current = 0;
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [ref, enabled, isRefreshing, onRefresh, progress, threshold]);

  return { isRefreshing, progress };
}
