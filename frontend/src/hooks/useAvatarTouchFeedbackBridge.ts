/**
 * useAvatarTouchFeedbackBridge - Sprint 543
 *
 * Bridges touch input to avatar visual feedback with minimal latency.
 * Provides immediate visual responses while actual avatar updates process.
 *
 * Key features:
 * - Instant visual feedback on touch (< 16ms)
 * - Predictive avatar state based on touch trajectory
 * - Smooth transition from feedback to actual avatar state
 * - Touch pressure to expression intensity mapping
 * - Multi-touch gesture to avatar action mapping
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type FeedbackType = "highlight" | "ripple" | "glow" | "pulse" | "scale";
export type AvatarRegion = "face" | "eyes" | "mouth" | "head" | "body" | "hand";
export type GestureAction = "tap" | "double-tap" | "long-press" | "swipe" | "pinch" | "rotate";
export type TransitionState = "idle" | "feedback" | "transitioning" | "synced";

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
}

export interface FeedbackStyle {
  transform: string;
  opacity: number;
  filter: string;
  transition: string;
}

export interface AvatarFeedback {
  region: AvatarRegion;
  intensity: number;
  feedbackType: FeedbackType;
  style: FeedbackStyle;
  duration: number;
}

export interface PredictedAvatarState {
  expression: string;
  lookAt: { x: number; y: number };
  headTilt: number;
  confidence: number;
}

export interface TouchFeedbackConfig {
  feedbackDelayMs: number;
  transitionDurationMs: number;
  pressureMultiplier: number;
  enablePrediction: boolean;
  enableHaptic: boolean;
  maxConcurrentFeedbacks: number;
  feedbackDecayMs: number;
}

export interface TouchFeedbackCallbacks {
  onFeedbackStart?: (feedback: AvatarFeedback) => void;
  onFeedbackEnd?: (feedback: AvatarFeedback) => void;
  onGestureDetected?: (gesture: GestureAction, region: AvatarRegion) => void;
  onStateTransition?: (from: TransitionState, to: TransitionState) => void;
  onPrediction?: (state: PredictedAvatarState) => void;
}

export interface TouchFeedbackState {
  isActive: boolean;
  transitionState: TransitionState;
  activeTouches: TouchPoint[];
  activeFeedbacks: AvatarFeedback[];
  predictedState: PredictedAvatarState | null;
  lastGesture: GestureAction | null;
  lastRegion: AvatarRegion | null;
}

export interface TouchFeedbackMetrics {
  feedbackLatencyMs: number;
  averageFeedbackLatency: number;
  gesturesDetected: number;
  feedbacksTriggered: number;
  predictionAccuracy: number;
  transitionSmoothness: number;
}

export interface TouchFeedbackControls {
  enable: () => void;
  disable: () => void;
  processTouchStart: (touches: TouchPoint[], region: AvatarRegion) => AvatarFeedback[];
  processTouchMove: (touches: TouchPoint[]) => void;
  processTouchEnd: (touchIds: number[]) => void;
  triggerFeedback: (region: AvatarRegion, type: FeedbackType, intensity?: number) => AvatarFeedback;
  clearFeedbacks: () => void;
  syncWithAvatarState: (actualState: Record<string, unknown>) => void;
  getRegionFromPoint: (x: number, y: number, bounds: DOMRect) => AvatarRegion;
  resetMetrics: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: TouchFeedbackConfig = {
  feedbackDelayMs: 0, // Instant feedback
  transitionDurationMs: 150,
  pressureMultiplier: 1.5,
  enablePrediction: true,
  enableHaptic: true,
  maxConcurrentFeedbacks: 5,
  feedbackDecayMs: 300,
};

const REGION_FEEDBACK_MAP: Record<AvatarRegion, FeedbackType> = {
  face: "glow",
  eyes: "pulse",
  mouth: "scale",
  head: "highlight",
  body: "ripple",
  hand: "scale",
};

const GESTURE_EXPRESSION_MAP: Record<GestureAction, string> = {
  tap: "curious",
  "double-tap": "surprised",
  "long-press": "thoughtful",
  swipe: "following",
  pinch: "focused",
  rotate: "playful",
};

// ============================================================================
// Helper Functions
// ============================================================================

function createFeedbackStyle(
  type: FeedbackType,
  intensity: number,
  transitionMs: number
): FeedbackStyle {
  const baseTransition = `all ${transitionMs}ms ease-out`;

  switch (type) {
    case "highlight":
      return {
        transform: "scale(1)",
        opacity: 0.3 + intensity * 0.4,
        filter: `brightness(${1 + intensity * 0.3})`,
        transition: baseTransition,
      };
    case "ripple":
      return {
        transform: `scale(${1 + intensity * 0.1})`,
        opacity: 0.5 + intensity * 0.3,
        filter: "none",
        transition: baseTransition,
      };
    case "glow":
      return {
        transform: "scale(1)",
        opacity: 1,
        filter: `drop-shadow(0 0 ${intensity * 10}px rgba(255,255,255,${intensity * 0.5}))`,
        transition: baseTransition,
      };
    case "pulse":
      return {
        transform: `scale(${1 + intensity * 0.05})`,
        opacity: 1,
        filter: `brightness(${1 + intensity * 0.2})`,
        transition: `${baseTransition}, transform 100ms ease-in-out`,
      };
    case "scale":
      return {
        transform: `scale(${1 + intensity * 0.15})`,
        opacity: 1,
        filter: "none",
        transition: baseTransition,
      };
    default:
      return {
        transform: "scale(1)",
        opacity: 1,
        filter: "none",
        transition: baseTransition,
      };
  }
}

function detectGesture(
  touches: TouchPoint[],
  touchHistory: Map<number, TouchPoint[]>
): GestureAction | null {
  if (touches.length === 0) return null;

  // Single touch gestures
  if (touches.length === 1) {
    const touch = touches[0];
    const history = touchHistory.get(touch.id) || [];

    if (history.length < 2) return "tap";

    const first = history[0];
    const last = history[history.length - 1];
    const duration = last.timestamp - first.timestamp;
    const distance = Math.sqrt(
      Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2)
    );

    if (duration > 500 && distance < 20) return "long-press";
    if (distance > 50) return "swipe";
    return "tap";
  }

  // Multi-touch gestures
  if (touches.length === 2) {
    const [t1, t2] = touches;
    const h1 = touchHistory.get(t1.id) || [];
    const h2 = touchHistory.get(t2.id) || [];

    if (h1.length > 1 && h2.length > 1) {
      const prevDist = Math.sqrt(
        Math.pow(h1[0].x - h2[0].x, 2) + Math.pow(h1[0].y - h2[0].y, 2)
      );
      const currDist = Math.sqrt(
        Math.pow(t1.x - t2.x, 2) + Math.pow(t1.y - t2.y, 2)
      );

      if (Math.abs(currDist - prevDist) > 30) return "pinch";

      // Check for rotation
      const prevAngle = Math.atan2(h1[0].y - h2[0].y, h1[0].x - h2[0].x);
      const currAngle = Math.atan2(t1.y - t2.y, t1.x - t2.x);
      if (Math.abs(currAngle - prevAngle) > 0.2) return "rotate";
    }
  }

  return null;
}

function predictAvatarState(
  touches: TouchPoint[],
  gesture: GestureAction | null,
  region: AvatarRegion
): PredictedAvatarState {
  const expression = gesture ? GESTURE_EXPRESSION_MAP[gesture] : "neutral";

  // Calculate look-at based on touch centroid
  let lookAtX = 0;
  let lookAtY = 0;
  if (touches.length > 0) {
    lookAtX = touches.reduce((sum, t) => sum + t.x, 0) / touches.length;
    lookAtY = touches.reduce((sum, t) => sum + t.y, 0) / touches.length;
    // Normalize to -1 to 1 range (assuming 500px viewport)
    lookAtX = (lookAtX - 250) / 250;
    lookAtY = (lookAtY - 250) / 250;
  }

  // Calculate head tilt based on touch position
  const headTilt = lookAtX * 15; // Max 15 degrees tilt

  // Confidence based on touch data quality
  const avgPressure = touches.length > 0
    ? touches.reduce((sum, t) => sum + t.pressure, 0) / touches.length
    : 0;
  const confidence = Math.min(1, 0.5 + avgPressure * 0.5);

  return {
    expression,
    lookAt: { x: lookAtX, y: lookAtY },
    headTilt,
    confidence,
  };
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarTouchFeedbackBridge(
  config: Partial<TouchFeedbackConfig> = {},
  callbacks: TouchFeedbackCallbacks = {}
): { state: TouchFeedbackState; metrics: TouchFeedbackMetrics; controls: TouchFeedbackControls } {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isActive, setIsActive] = useState(false);
  const [transitionState, setTransitionState] = useState<TransitionState>("idle");
  const [activeTouches, setActiveTouches] = useState<TouchPoint[]>([]);
  const [activeFeedbacks, setActiveFeedbacks] = useState<AvatarFeedback[]>([]);
  const [predictedState, setPredictedState] = useState<PredictedAvatarState | null>(null);
  const [lastGesture, setLastGesture] = useState<GestureAction | null>(null);
  const [lastRegion, setLastRegion] = useState<AvatarRegion | null>(null);

  // Metrics
  const [feedbackLatencyMs, setFeedbackLatencyMs] = useState(0);
  const [averageFeedbackLatency, setAverageFeedbackLatency] = useState(0);
  const [gesturesDetected, setGesturesDetected] = useState(0);
  const [feedbacksTriggered, setFeedbacksTriggered] = useState(0);
  const [predictionAccuracy, setPredictionAccuracy] = useState(1);
  const [transitionSmoothness, setTransitionSmoothness] = useState(1);

  // Refs
  const touchHistoryRef = useRef<Map<number, TouchPoint[]>>(new Map());
  const feedbackTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const latencyHistoryRef = useRef<number[]>([]);
  const prevTransitionStateRef = useRef<TransitionState>(transitionState);

  // Transition state change callback
  useEffect(() => {
    if (prevTransitionStateRef.current !== transitionState) {
      callbacks.onStateTransition?.(prevTransitionStateRef.current, transitionState);
      prevTransitionStateRef.current = transitionState;
    }
  }, [transitionState, callbacks]);

  // Cleanup feedback timers on unmount
  useEffect(() => {
    return () => {
      feedbackTimersRef.current.forEach((timer) => clearTimeout(timer));
      feedbackTimersRef.current.clear();
    };
  }, []);

  // Enable/disable
  const enable = useCallback(() => {
    setIsActive(true);
    setTransitionState("idle");
  }, []);

  const disable = useCallback(() => {
    setIsActive(false);
    setActiveTouches([]);
    setActiveFeedbacks([]);
    setPredictedState(null);
    setTransitionState("idle");
    touchHistoryRef.current.clear();
    feedbackTimersRef.current.forEach((timer) => clearTimeout(timer));
    feedbackTimersRef.current.clear();
  }, []);

  // Trigger feedback for a region
  const triggerFeedback = useCallback((
    region: AvatarRegion,
    type: FeedbackType,
    intensity = 0.5
  ): AvatarFeedback => {
    const startTime = performance.now();

    const feedback: AvatarFeedback = {
      region,
      intensity: Math.min(1, Math.max(0, intensity)),
      feedbackType: type,
      style: createFeedbackStyle(type, intensity, mergedConfig.transitionDurationMs),
      duration: mergedConfig.feedbackDecayMs,
    };

    // Add to active feedbacks (limit concurrent)
    setActiveFeedbacks((prev) => {
      const filtered = prev.filter((f) => f.region !== region);
      const newFeedbacks = [...filtered, feedback].slice(-mergedConfig.maxConcurrentFeedbacks);
      return newFeedbacks;
    });

    // Track latency
    const latency = performance.now() - startTime;
    setFeedbackLatencyMs(latency);
    latencyHistoryRef.current.push(latency);
    if (latencyHistoryRef.current.length > 100) {
      latencyHistoryRef.current.shift();
    }
    const avgLatency =
      latencyHistoryRef.current.reduce((a, b) => a + b, 0) /
      latencyHistoryRef.current.length;
    setAverageFeedbackLatency(avgLatency);

    setFeedbacksTriggered((prev) => prev + 1);
    setTransitionState("feedback");

    callbacks.onFeedbackStart?.(feedback);

    // Set up decay timer
    const feedbackKey = `${region}-${Date.now()}`;
    const timer = setTimeout(() => {
      setActiveFeedbacks((prev) => prev.filter((f) => f !== feedback));
      callbacks.onFeedbackEnd?.(feedback);
      feedbackTimersRef.current.delete(feedbackKey);

      // Transition back to idle if no more feedbacks
      setActiveFeedbacks((current) => {
        if (current.length === 0) {
          setTransitionState("idle");
        }
        return current;
      });
    }, mergedConfig.feedbackDecayMs);

    feedbackTimersRef.current.set(feedbackKey, timer);

    return feedback;
  }, [mergedConfig, callbacks]);

  // Process touch start
  const processTouchStart = useCallback((
    touches: TouchPoint[],
    region: AvatarRegion
  ): AvatarFeedback[] => {
    if (!isActive) return [];

    setActiveTouches(touches);
    setLastRegion(region);

    // Initialize touch history
    touches.forEach((touch) => {
      touchHistoryRef.current.set(touch.id, [touch]);
    });

    // Detect gesture
    const gesture = detectGesture(touches, touchHistoryRef.current);
    if (gesture) {
      setLastGesture(gesture);
      setGesturesDetected((prev) => prev + 1);
      callbacks.onGestureDetected?.(gesture, region);
    }

    // Generate feedbacks
    const feedbacks: AvatarFeedback[] = [];
    const feedbackType = REGION_FEEDBACK_MAP[region];

    touches.forEach((touch) => {
      const intensity = touch.pressure * mergedConfig.pressureMultiplier;
      const feedback = triggerFeedback(region, feedbackType, intensity);
      feedbacks.push(feedback);
    });

    // Predict avatar state if enabled
    if (mergedConfig.enablePrediction) {
      const predicted = predictAvatarState(touches, gesture, region);
      setPredictedState(predicted);
      callbacks.onPrediction?.(predicted);
    }

    return feedbacks;
  }, [isActive, mergedConfig, triggerFeedback, callbacks]);

  // Process touch move
  const processTouchMove = useCallback((touches: TouchPoint[]) => {
    if (!isActive || touches.length === 0) return;

    setActiveTouches(touches);

    // Update touch history
    touches.forEach((touch) => {
      const history = touchHistoryRef.current.get(touch.id) || [];
      history.push(touch);
      if (history.length > 10) history.shift();
      touchHistoryRef.current.set(touch.id, history);
    });

    // Update gesture detection
    const gesture = detectGesture(touches, touchHistoryRef.current);
    if (gesture && gesture !== lastGesture) {
      setLastGesture(gesture);
      setGesturesDetected((prev) => prev + 1);
      if (lastRegion) {
        callbacks.onGestureDetected?.(gesture, lastRegion);
      }
    }

    // Update prediction
    if (mergedConfig.enablePrediction && lastRegion) {
      const predicted = predictAvatarState(touches, gesture, lastRegion);
      setPredictedState(predicted);
      callbacks.onPrediction?.(predicted);
    }

    setTransitionState("feedback");
  }, [isActive, lastGesture, lastRegion, mergedConfig.enablePrediction, callbacks]);

  // Process touch end
  const processTouchEnd = useCallback((touchIds: number[]) => {
    if (!isActive) return;

    // Remove from active touches
    setActiveTouches((prev) =>
      prev.filter((t) => !touchIds.includes(t.id))
    );

    // Clean up history
    touchIds.forEach((id) => {
      touchHistoryRef.current.delete(id);
    });

    // If no more touches, start transition to synced
    setActiveTouches((current) => {
      if (current.length === 0) {
        setTransitionState("transitioning");
        // After transition, move to synced
        setTimeout(() => {
          setTransitionState("synced");
          setPredictedState(null);
        }, mergedConfig.transitionDurationMs);
      }
      return current;
    });
  }, [isActive, mergedConfig.transitionDurationMs]);

  // Clear all feedbacks
  const clearFeedbacks = useCallback(() => {
    setActiveFeedbacks([]);
    feedbackTimersRef.current.forEach((timer) => clearTimeout(timer));
    feedbackTimersRef.current.clear();
    setTransitionState("idle");
  }, []);

  // Sync with actual avatar state
  const syncWithAvatarState = useCallback((actualState: Record<string, unknown>) => {
    // Calculate transition smoothness based on prediction vs actual
    if (predictedState && actualState.expression) {
      const expressionMatch = predictedState.expression === actualState.expression;
      const smoothness = expressionMatch ? 1 : 0.5;
      setTransitionSmoothness((prev) => prev * 0.9 + smoothness * 0.1);
      setPredictionAccuracy((prev) => prev * 0.9 + (expressionMatch ? 1 : 0) * 0.1);
    }

    setTransitionState("synced");
    setPredictedState(null);
  }, [predictedState]);

  // Get region from point
  const getRegionFromPoint = useCallback((
    x: number,
    y: number,
    bounds: DOMRect
  ): AvatarRegion => {
    // Normalize coordinates
    const normalizedX = (x - bounds.left) / bounds.width;
    const normalizedY = (y - bounds.top) / bounds.height;

    // Simple region mapping based on avatar layout
    if (normalizedY < 0.3) {
      return "head";
    } else if (normalizedY < 0.5) {
      if (normalizedX < 0.35 || normalizedX > 0.65) {
        return "eyes";
      }
      return "face";
    } else if (normalizedY < 0.6) {
      return "mouth";
    } else if (normalizedY < 0.8) {
      return "body";
    } else {
      return normalizedX < 0.3 || normalizedX > 0.7 ? "hand" : "body";
    }
  }, []);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    setFeedbackLatencyMs(0);
    setAverageFeedbackLatency(0);
    setGesturesDetected(0);
    setFeedbacksTriggered(0);
    setPredictionAccuracy(1);
    setTransitionSmoothness(1);
    latencyHistoryRef.current = [];
  }, []);

  // Build state object
  const state: TouchFeedbackState = useMemo(() => ({
    isActive,
    transitionState,
    activeTouches,
    activeFeedbacks,
    predictedState,
    lastGesture,
    lastRegion,
  }), [
    isActive,
    transitionState,
    activeTouches,
    activeFeedbacks,
    predictedState,
    lastGesture,
    lastRegion,
  ]);

  // Build metrics object
  const metrics: TouchFeedbackMetrics = useMemo(() => ({
    feedbackLatencyMs,
    averageFeedbackLatency,
    gesturesDetected,
    feedbacksTriggered,
    predictionAccuracy,
    transitionSmoothness,
  }), [
    feedbackLatencyMs,
    averageFeedbackLatency,
    gesturesDetected,
    feedbacksTriggered,
    predictionAccuracy,
    transitionSmoothness,
  ]);

  // Build controls object
  const controls: TouchFeedbackControls = useMemo(() => ({
    enable,
    disable,
    processTouchStart,
    processTouchMove,
    processTouchEnd,
    triggerFeedback,
    clearFeedbacks,
    syncWithAvatarState,
    getRegionFromPoint,
    resetMetrics,
  }), [
    enable,
    disable,
    processTouchStart,
    processTouchMove,
    processTouchEnd,
    triggerFeedback,
    clearFeedbacks,
    syncWithAvatarState,
    getRegionFromPoint,
    resetMetrics,
  ]);

  return { state, metrics, controls };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useTouchFeedbackStyle(region: AvatarRegion): FeedbackStyle | null {
  const { state } = useAvatarTouchFeedbackBridge();

  const feedback = state.activeFeedbacks.find((f) => f.region === region);
  return feedback?.style ?? null;
}

export function useAvatarPredictedState(): PredictedAvatarState | null {
  const { state } = useAvatarTouchFeedbackBridge();
  return state.predictedState;
}

export function useTouchFeedbackActive(): boolean {
  const { state } = useAvatarTouchFeedbackBridge();
  return state.transitionState === "feedback";
}

export function useFeedbackLatency(): { current: number; average: number } {
  const { metrics } = useAvatarTouchFeedbackBridge();
  return {
    current: metrics.feedbackLatencyMs,
    average: metrics.averageFeedbackLatency,
  };
}

export default useAvatarTouchFeedbackBridge;
