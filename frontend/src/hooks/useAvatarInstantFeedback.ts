/**
 * useAvatarInstantFeedback - Sprint 536
 *
 * Provides instant visual feedback for avatar interactions on mobile:
 * - Immediate micro-animations before main animation loads
 * - Placeholder expressions during processing
 * - Optimistic state updates that roll back on failure
 * - Haptic coordination for perceived responsiveness
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type FeedbackType = "tap" | "press" | "swipe" | "pinch" | "speak";
export type FeedbackIntensity = "subtle" | "medium" | "strong";
export type FeedbackPhase = "idle" | "instant" | "processing" | "complete" | "rollback";

export interface FeedbackPosition {
  x: number;
  y: number;
}

export interface InstantFeedbackStyle {
  transform: string;
  opacity: number;
  filter: string;
  transition: string;
}

export interface PlaceholderExpression {
  eyebrowRaise: number;
  eyeWiden: number;
  mouthOpen: number;
  headTilt: number;
}

export interface OptimisticState<T> {
  value: T;
  isOptimistic: boolean;
  pendingUpdate: boolean;
  rollbackValue: T | null;
}

export interface FeedbackConfig {
  enableHaptics: boolean;
  instantResponseMs: number;
  processingTimeoutMs: number;
  rollbackAnimationMs: number;
  feedbackIntensity: FeedbackIntensity;
}

export interface FeedbackCallbacks {
  onInstantFeedback?: (type: FeedbackType) => void;
  onProcessingStart?: () => void;
  onProcessingComplete?: () => void;
  onRollback?: (reason: string) => void;
}

export interface FeedbackState {
  phase: FeedbackPhase;
  currentFeedbackType: FeedbackType | null;
  isProcessing: boolean;
  feedbackPosition: FeedbackPosition | null;
  placeholderExpression: PlaceholderExpression;
}

export interface FeedbackMetrics {
  instantResponseTime: number;
  processingTime: number;
  rollbackCount: number;
  successRate: number;
}

export interface FeedbackControls {
  triggerInstantFeedback: (type: FeedbackType, position?: FeedbackPosition) => void;
  startProcessing: () => void;
  completeProcessing: () => void;
  triggerRollback: (reason: string) => void;
  getInstantFeedbackStyle: () => InstantFeedbackStyle;
  getPlaceholderExpression: () => PlaceholderExpression;
  setOptimisticValue: <T>(key: string, value: T) => void;
  getOptimisticValue: <T>(key: string) => OptimisticState<T> | null;
  commitOptimisticValue: (key: string) => void;
  rollbackOptimisticValue: (key: string) => void;
  reset: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: FeedbackConfig = {
  enableHaptics: true,
  instantResponseMs: 16, // One frame at 60fps
  processingTimeoutMs: 3000,
  rollbackAnimationMs: 200,
  feedbackIntensity: "medium",
};

const DEFAULT_PLACEHOLDER_EXPRESSION: PlaceholderExpression = {
  eyebrowRaise: 0,
  eyeWiden: 0,
  mouthOpen: 0,
  headTilt: 0,
};

const INTENSITY_MULTIPLIERS: Record<FeedbackIntensity, number> = {
  subtle: 0.5,
  medium: 1.0,
  strong: 1.5,
};

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarInstantFeedback(
  config: Partial<FeedbackConfig> = {},
  callbacks: FeedbackCallbacks = {}
): { state: FeedbackState; metrics: FeedbackMetrics; controls: FeedbackControls } {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [phase, setPhase] = useState<FeedbackPhase>("idle");
  const [currentFeedbackType, setCurrentFeedbackType] = useState<FeedbackType | null>(null);
  const [feedbackPosition, setFeedbackPosition] = useState<FeedbackPosition | null>(null);
  const [placeholderExpression, setPlaceholderExpression] = useState<PlaceholderExpression>(
    DEFAULT_PLACEHOLDER_EXPRESSION
  );

  // Metrics
  const [instantResponseTime, setInstantResponseTime] = useState(0);
  const [processingTime, setProcessingTime] = useState(0);
  const [rollbackCount, setRollbackCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);

  // Refs
  const instantStartRef = useRef(0);
  const processingStartRef = useRef(0);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optimisticValuesRef = useRef<Map<string, OptimisticState<unknown>>>(new Map());

  // Calculate placeholder expression based on feedback type
  const calculatePlaceholderExpression = useCallback(
    (type: FeedbackType): PlaceholderExpression => {
      const intensity = INTENSITY_MULTIPLIERS[mergedConfig.feedbackIntensity];

      switch (type) {
        case "tap":
          return {
            eyebrowRaise: 0.2 * intensity,
            eyeWiden: 0.1 * intensity,
            mouthOpen: 0,
            headTilt: 0,
          };
        case "press":
          return {
            eyebrowRaise: 0.3 * intensity,
            eyeWiden: 0.2 * intensity,
            mouthOpen: 0.1 * intensity,
            headTilt: 0.05 * intensity,
          };
        case "swipe":
          return {
            eyebrowRaise: 0.1 * intensity,
            eyeWiden: 0,
            mouthOpen: 0,
            headTilt: 0.1 * intensity,
          };
        case "pinch":
          return {
            eyebrowRaise: 0.15 * intensity,
            eyeWiden: 0.15 * intensity,
            mouthOpen: 0,
            headTilt: 0,
          };
        case "speak":
          return {
            eyebrowRaise: 0.1 * intensity,
            eyeWiden: 0.05 * intensity,
            mouthOpen: 0.3 * intensity,
            headTilt: 0.02 * intensity,
          };
        default:
          return DEFAULT_PLACEHOLDER_EXPRESSION;
      }
    },
    [mergedConfig.feedbackIntensity]
  );

  // Trigger instant feedback
  const triggerInstantFeedback = useCallback(
    (type: FeedbackType, position?: FeedbackPosition) => {
      instantStartRef.current = performance.now();
      setPhase("instant");
      setCurrentFeedbackType(type);
      setFeedbackPosition(position || null);
      setPlaceholderExpression(calculatePlaceholderExpression(type));

      callbacks.onInstantFeedback?.(type);

      // Measure instant response time
      requestAnimationFrame(() => {
        const responseTime = performance.now() - instantStartRef.current;
        setInstantResponseTime(responseTime);
      });
    },
    [calculatePlaceholderExpression, callbacks]
  );

  // Start processing phase
  const startProcessing = useCallback(() => {
    processingStartRef.current = performance.now();
    setPhase("processing");
    callbacks.onProcessingStart?.();

    // Set timeout for auto-rollback
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    processingTimeoutRef.current = setTimeout(() => {
      setPhase("rollback");
      setRollbackCount((prev) => prev + 1);
      callbacks.onRollback?.("Processing timeout");
    }, mergedConfig.processingTimeoutMs);
  }, [callbacks, mergedConfig.processingTimeoutMs]);

  // Complete processing
  const completeProcessing = useCallback(() => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }

    const elapsed = performance.now() - processingStartRef.current;
    setProcessingTime(elapsed);
    setPhase("complete");
    setSuccessCount((prev) => prev + 1);
    callbacks.onProcessingComplete?.();

    // Commit all optimistic values
    optimisticValuesRef.current.forEach((_, key) => {
      const state = optimisticValuesRef.current.get(key);
      if (state) {
        optimisticValuesRef.current.set(key, {
          ...state,
          isOptimistic: false,
          pendingUpdate: false,
        });
      }
    });
  }, [callbacks]);

  // Trigger rollback
  const triggerRollback = useCallback(
    (reason: string) => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }

      setPhase("rollback");
      setRollbackCount((prev) => prev + 1);
      callbacks.onRollback?.(reason);

      // Rollback all optimistic values
      optimisticValuesRef.current.forEach((state, key) => {
        if (state.isOptimistic && state.rollbackValue !== null) {
          optimisticValuesRef.current.set(key, {
            value: state.rollbackValue,
            isOptimistic: false,
            pendingUpdate: false,
            rollbackValue: null,
          });
        }
      });

      // Auto-reset after rollback animation
      setTimeout(() => {
        setPhase("idle");
        setPlaceholderExpression(DEFAULT_PLACEHOLDER_EXPRESSION);
      }, mergedConfig.rollbackAnimationMs);
    },
    [callbacks, mergedConfig.rollbackAnimationMs]
  );

  // Get instant feedback style
  const getInstantFeedbackStyle = useCallback((): InstantFeedbackStyle => {
    const intensity = INTENSITY_MULTIPLIERS[mergedConfig.feedbackIntensity];

    switch (phase) {
      case "instant":
        return {
          transform: `scale(${1 + 0.02 * intensity})`,
          opacity: 1,
          filter: "none",
          transition: `all ${mergedConfig.instantResponseMs}ms ease-out`,
        };
      case "processing":
        return {
          transform: `scale(${1 + 0.01 * intensity})`,
          opacity: 0.95,
          filter: "none",
          transition: "all 100ms ease-in-out",
        };
      case "rollback":
        return {
          transform: "scale(1)",
          opacity: 0.8,
          filter: "saturate(0.8)",
          transition: `all ${mergedConfig.rollbackAnimationMs}ms ease-out`,
        };
      case "complete":
        return {
          transform: "scale(1)",
          opacity: 1,
          filter: "none",
          transition: "all 150ms ease-out",
        };
      default:
        return {
          transform: "scale(1)",
          opacity: 1,
          filter: "none",
          transition: "none",
        };
    }
  }, [phase, mergedConfig]);

  // Get placeholder expression
  const getPlaceholderExpression = useCallback((): PlaceholderExpression => {
    return placeholderExpression;
  }, [placeholderExpression]);

  // Optimistic value management
  const setOptimisticValue = useCallback(<T,>(key: string, value: T) => {
    const currentState = optimisticValuesRef.current.get(key);
    const rollbackValue = currentState ? currentState.value : value;

    optimisticValuesRef.current.set(key, {
      value,
      isOptimistic: true,
      pendingUpdate: true,
      rollbackValue: rollbackValue as T,
    });
  }, []);

  const getOptimisticValue = useCallback(<T,>(key: string): OptimisticState<T> | null => {
    const state = optimisticValuesRef.current.get(key);
    return state as OptimisticState<T> | null;
  }, []);

  const commitOptimisticValue = useCallback((key: string) => {
    const state = optimisticValuesRef.current.get(key);
    if (state) {
      optimisticValuesRef.current.set(key, {
        ...state,
        isOptimistic: false,
        pendingUpdate: false,
        rollbackValue: null,
      });
    }
  }, []);

  const rollbackOptimisticValue = useCallback((key: string) => {
    const state = optimisticValuesRef.current.get(key);
    if (state && state.rollbackValue !== null) {
      optimisticValuesRef.current.set(key, {
        value: state.rollbackValue,
        isOptimistic: false,
        pendingUpdate: false,
        rollbackValue: null,
      });
    }
  }, []);

  // Reset
  const reset = useCallback(() => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    setPhase("idle");
    setCurrentFeedbackType(null);
    setFeedbackPosition(null);
    setPlaceholderExpression(DEFAULT_PLACEHOLDER_EXPRESSION);
    optimisticValuesRef.current.clear();
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, []);

  const state: FeedbackState = useMemo(() => ({
    phase,
    currentFeedbackType,
    isProcessing: phase === "processing",
    feedbackPosition,
    placeholderExpression,
  }), [phase, currentFeedbackType, feedbackPosition, placeholderExpression]);

  const totalAttempts = successCount + rollbackCount;
  const metrics: FeedbackMetrics = useMemo(() => ({
    instantResponseTime,
    processingTime,
    rollbackCount,
    successRate: totalAttempts > 0 ? (successCount / totalAttempts) * 100 : 100,
  }), [instantResponseTime, processingTime, rollbackCount, successCount, totalAttempts]);

  const controls: FeedbackControls = useMemo(() => ({
    triggerInstantFeedback,
    startProcessing,
    completeProcessing,
    triggerRollback,
    getInstantFeedbackStyle,
    getPlaceholderExpression,
    setOptimisticValue,
    getOptimisticValue,
    commitOptimisticValue,
    rollbackOptimisticValue,
    reset,
  }), [
    triggerInstantFeedback,
    startProcessing,
    completeProcessing,
    triggerRollback,
    getInstantFeedbackStyle,
    getPlaceholderExpression,
    setOptimisticValue,
    getOptimisticValue,
    commitOptimisticValue,
    rollbackOptimisticValue,
    reset,
  ]);

  return { state, metrics, controls };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useTapFeedback(): {
  triggerTap: (position?: FeedbackPosition) => void;
  isActive: boolean;
  style: InstantFeedbackStyle;
} {
  const { state, controls } = useAvatarInstantFeedback();

  const triggerTap = useCallback((position?: FeedbackPosition) => {
    controls.triggerInstantFeedback("tap", position);
  }, [controls]);

  const style = controls.getInstantFeedbackStyle();

  return {
    triggerTap,
    isActive: state.phase !== "idle",
    style,
  };
}

export function useSpeakFeedback(): {
  triggerSpeak: () => void;
  expression: PlaceholderExpression;
  isProcessing: boolean;
} {
  const { state, controls } = useAvatarInstantFeedback();

  const triggerSpeak = useCallback(() => {
    controls.triggerInstantFeedback("speak");
  }, [controls]);

  return {
    triggerSpeak,
    expression: state.placeholderExpression,
    isProcessing: state.isProcessing,
  };
}

export function useOptimisticAvatarState<T>(
  key: string,
  initialValue: T
): {
  value: T;
  setValue: (newValue: T) => void;
  commit: () => void;
  rollback: () => void;
  isOptimistic: boolean;
} {
  const { controls } = useAvatarInstantFeedback();
  const [localValue, setLocalValue] = useState<T>(initialValue);
  const [isOptimistic, setIsOptimistic] = useState(false);

  const setValue = useCallback((newValue: T) => {
    setLocalValue(newValue);
    setIsOptimistic(true);
    controls.setOptimisticValue(key, newValue);
  }, [controls, key]);

  const commit = useCallback(() => {
    setIsOptimistic(false);
    controls.commitOptimisticValue(key);
  }, [controls, key]);

  const rollback = useCallback(() => {
    const state = controls.getOptimisticValue<T>(key);
    if (state && state.rollbackValue !== null) {
      setLocalValue(state.rollbackValue);
    }
    setIsOptimistic(false);
    controls.rollbackOptimisticValue(key);
  }, [controls, key]);

  return {
    value: localValue,
    setValue,
    commit,
    rollback,
    isOptimistic,
  };
}

export default useAvatarInstantFeedback;
