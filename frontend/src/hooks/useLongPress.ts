"use client";

/**
 * useLongPress - Long Press Detection Hook
 *
 * Detects long press gestures with configurable threshold.
 * Provides both callback and state-based APIs.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useCallback, useRef, useState } from "react";
import { useHapticFeedback } from "./useHapticFeedback";

interface LongPressOptions {
  // Duration in ms before long press triggers (default: 500)
  threshold?: number;

  // Callback when long press starts
  onLongPressStart?: () => void;

  // Callback when long press completes
  onLongPress?: () => void;

  // Callback when long press is cancelled
  onCancel?: () => void;

  // Callback for regular click (when released before threshold)
  onClick?: () => void;

  // Enable haptic feedback
  haptic?: boolean;

  // Disable the hook
  disabled?: boolean;

  // Movement tolerance in pixels before cancelling
  moveTolerance?: number;
}

interface LongPressResult {
  // Event handlers to spread onto target element
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
  };

  // Current state
  isLongPressing: boolean;
  isPressed: boolean;
}

export function useLongPress(options: LongPressOptions = {}): LongPressResult {
  const {
    threshold = 500,
    onLongPressStart,
    onLongPress,
    onCancel,
    onClick,
    haptic = true,
    disabled = false,
    moveTolerance = 10,
  } = options;

  const [isLongPressing, setIsLongPressing] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const { trigger: triggerHaptic } = useHapticFeedback();

  // Clear the timer
  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Start long press detection
  const start = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled) return;

      setIsPressed(true);
      isLongPressRef.current = false;
      startPosRef.current = { x: clientX, y: clientY };

      clear();

      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        setIsLongPressing(true);

        if (haptic) {
          triggerHaptic("heavy");
        }

        onLongPressStart?.();
        onLongPress?.();
      }, threshold);
    },
    [disabled, clear, threshold, haptic, triggerHaptic, onLongPressStart, onLongPress]
  );

  // End long press detection
  const end = useCallback(() => {
    const wasLongPress = isLongPressRef.current;

    clear();
    setIsPressed(false);
    setIsLongPressing(false);
    isLongPressRef.current = false;
    startPosRef.current = null;

    if (!wasLongPress && onClick) {
      onClick();
    }
  }, [clear, onClick]);

  // Cancel long press (e.g., on mouse leave or significant movement)
  const cancel = useCallback(() => {
    if (isPressed) {
      clear();
      setIsPressed(false);
      setIsLongPressing(false);
      isLongPressRef.current = false;
      startPosRef.current = null;
      onCancel?.();
    }
  }, [isPressed, clear, onCancel]);

  // Check if movement exceeds tolerance
  const checkMovement = useCallback(
    (clientX: number, clientY: number) => {
      if (!startPosRef.current) return;

      const dx = Math.abs(clientX - startPosRef.current.x);
      const dy = Math.abs(clientY - startPosRef.current.y);

      if (dx > moveTolerance || dy > moveTolerance) {
        cancel();
      }
    },
    [moveTolerance, cancel]
  );

  // Event handlers
  const handlers = {
    onMouseDown: useCallback(
      (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click
        start(e.clientX, e.clientY);
      },
      [start]
    ),

    onMouseUp: useCallback(
      (e: React.MouseEvent) => {
        end();
      },
      [end]
    ),

    onMouseLeave: useCallback(
      (e: React.MouseEvent) => {
        cancel();
      },
      [cancel]
    ),

    onTouchStart: useCallback(
      (e: React.TouchEvent) => {
        const touch = e.touches[0];
        start(touch.clientX, touch.clientY);
      },
      [start]
    ),

    onTouchEnd: useCallback(
      (e: React.TouchEvent) => {
        end();
      },
      [end]
    ),

    onTouchMove: useCallback(
      (e: React.TouchEvent) => {
        const touch = e.touches[0];
        checkMovement(touch.clientX, touch.clientY);
      },
      [checkMovement]
    ),
  };

  return {
    handlers,
    isLongPressing,
    isPressed,
  };
}

/**
 * Simplified hook that just returns a boolean
 */
export function useIsLongPressed(
  threshold: number = 500,
  disabled: boolean = false
): {
  isLongPressed: boolean;
  handlers: LongPressResult["handlers"];
} {
  const { handlers, isLongPressing } = useLongPress({
    threshold,
    disabled,
  });

  return {
    isLongPressed: isLongPressing,
    handlers,
  };
}

/**
 * Hook for long press with callback only
 */
export function useLongPressCallback(
  callback: () => void,
  options: Omit<LongPressOptions, "onLongPress"> = {}
): LongPressResult["handlers"] {
  const { handlers } = useLongPress({
    ...options,
    onLongPress: callback,
  });

  return handlers;
}
