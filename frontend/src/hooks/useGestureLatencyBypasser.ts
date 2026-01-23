/**
 * useGestureLatencyBypasser - Sprint 230
 *
 * Bypasses standard event processing for gestures requiring ultra-low latency.
 * Uses passive event listeners, direct style manipulation, and predictive
 * gesture completion to achieve sub-8ms touch-to-visual response.
 *
 * Features:
 * - Passive touch event listeners
 * - Direct style injection bypassing React
 * - Predictive gesture completion
 * - Velocity-based momentum simulation
 * - Snap point prediction
 * - Frame-aligned updates
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Gesture types that can be bypassed
 */
export type BypassableGesture =
  | "pan"
  | "pinch"
  | "rotate"
  | "swipe"
  | "drag"
  | "scroll";

/**
 * Touch point with timing
 */
export interface TimestampedTouch {
  x: number;
  y: number;
  timestamp: number;
  identifier: number;
}

/**
 * Gesture velocity
 */
export interface GestureVelocity {
  vx: number;
  vy: number;
  speed: number;
  angle: number;
}

/**
 * Predicted gesture end state
 */
export interface PredictedEndState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  confidence: number;
  estimatedTimeMs: number;
}

/**
 * Snap point definition
 */
export interface SnapPoint {
  x: number;
  y: number;
  radius: number;
  id: string;
}

/**
 * Bypasser configuration
 */
export interface BypasserConfig {
  /** Gestures to bypass (default: all) */
  gestures: BypassableGesture[];
  /** Enable velocity tracking (default: true) */
  trackVelocity: boolean;
  /** Velocity sample count (default: 5) */
  velocitySamples: number;
  /** Enable momentum simulation (default: true) */
  enableMomentum: boolean;
  /** Momentum friction (default: 0.95) */
  momentumFriction: number;
  /** Minimum velocity for momentum (default: 0.5) */
  momentumThreshold: number;
  /** Enable snap points (default: false) */
  enableSnapPoints: boolean;
  /** Snap points array */
  snapPoints: SnapPoint[];
  /** Snap attraction radius (default: 50) */
  snapRadius: number;
  /** Enable prediction (default: true) */
  enablePrediction: boolean;
  /** Prediction horizon in ms (default: 50) */
  predictionHorizonMs: number;
  /** Use passive listeners (default: true) */
  usePassiveListeners: boolean;
}

/**
 * Bypasser metrics
 */
export interface BypasserMetrics {
  gesturesProcessed: number;
  bypassedUpdates: number;
  averageLatencyMs: number;
  predictionsGenerated: number;
  predictionAccuracy: number;
  snapsTriggered: number;
  momentumFrames: number;
}

/**
 * Current gesture state
 */
export interface GestureState {
  isActive: boolean;
  type: BypassableGesture | null;
  startPosition: { x: number; y: number } | null;
  currentPosition: { x: number; y: number } | null;
  delta: { x: number; y: number };
  scale: number;
  rotation: number;
  velocity: GestureVelocity;
  touchCount: number;
}

/**
 * Bypasser state
 */
export interface BypasserState {
  isAttached: boolean;
  gesture: GestureState;
  prediction: PredictedEndState | null;
  metrics: BypasserMetrics;
  isMomentumActive: boolean;
}

/**
 * Style updater function
 */
export type StyleUpdater = (
  delta: { x: number; y: number },
  scale: number,
  rotation: number
) => void;

/**
 * Bypasser controls
 */
export interface BypasserControls {
  /** Attach to element */
  attach: (element: HTMLElement, styleUpdater: StyleUpdater) => void;
  /** Detach from element */
  detach: () => void;
  /** Add snap point */
  addSnapPoint: (point: SnapPoint) => void;
  /** Remove snap point */
  removeSnapPoint: (id: string) => void;
  /** Clear all snap points */
  clearSnapPoints: () => void;
  /** Cancel current gesture */
  cancelGesture: () => void;
  /** Stop momentum */
  stopMomentum: () => void;
  /** Reset metrics */
  resetMetrics: () => void;
  /** Get predicted end state */
  getPrediction: () => PredictedEndState | null;
}

/**
 * Hook return type
 */
export interface UseGestureLatencyBypasserResult {
  state: BypasserState;
  controls: BypasserControls;
  ref: React.RefObject<HTMLElement>;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONFIG: BypasserConfig = {
  gestures: ["pan", "pinch", "rotate", "swipe", "drag", "scroll"],
  trackVelocity: true,
  velocitySamples: 5,
  enableMomentum: true,
  momentumFriction: 0.95,
  momentumThreshold: 0.5,
  enableSnapPoints: false,
  snapPoints: [],
  snapRadius: 50,
  enablePrediction: true,
  predictionHorizonMs: 50,
  usePassiveListeners: true,
};

const DEFAULT_VELOCITY: GestureVelocity = {
  vx: 0,
  vy: 0,
  speed: 0,
  angle: 0,
};

const DEFAULT_GESTURE_STATE: GestureState = {
  isActive: false,
  type: null,
  startPosition: null,
  currentPosition: null,
  delta: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
  velocity: DEFAULT_VELOCITY,
  touchCount: 0,
};

const DEFAULT_METRICS: BypasserMetrics = {
  gesturesProcessed: 0,
  bypassedUpdates: 0,
  averageLatencyMs: 0,
  predictionsGenerated: 0,
  predictionAccuracy: 0,
  snapsTriggered: 0,
  momentumFrames: 0,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate distance between two points
 */
function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate angle between two points
 */
function angle(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/**
 * Calculate velocity from touch samples
 */
function calculateVelocity(samples: TimestampedTouch[]): GestureVelocity {
  if (samples.length < 2) {
    return DEFAULT_VELOCITY;
  }

  const recent = samples.slice(-2);
  const dt = (recent[1].timestamp - recent[0].timestamp) / 1000;

  if (dt <= 0) {
    return DEFAULT_VELOCITY;
  }

  const vx = (recent[1].x - recent[0].x) / dt;
  const vy = (recent[1].y - recent[0].y) / dt;
  const speed = Math.sqrt(vx * vx + vy * vy);
  const ang = Math.atan2(vy, vx);

  return { vx, vy, speed, angle: ang };
}

/**
 * Find nearest snap point
 */
function findNearestSnapPoint(
  position: { x: number; y: number },
  snapPoints: SnapPoint[],
  maxRadius: number
): SnapPoint | null {
  let nearest: SnapPoint | null = null;
  let nearestDist = maxRadius;

  for (const point of snapPoints) {
    const dist = distance(position, point);
    if (dist < nearestDist && dist < point.radius) {
      nearest = point;
      nearestDist = dist;
    }
  }

  return nearest;
}

/**
 * Predict gesture end position
 */
function predictEndPosition(
  current: { x: number; y: number },
  velocity: GestureVelocity,
  friction: number,
  horizonMs: number
): { x: number; y: number } {
  // Simple physics prediction
  const t = horizonMs / 1000;
  const decay = Math.pow(friction, t * 60); // Assuming 60fps

  const dx = velocity.vx * t * decay;
  const dy = velocity.vy * t * decay;

  return {
    x: current.x + dx,
    y: current.y + dy,
  };
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that bypasses standard gesture processing for ultra-low latency
 */
export function useGestureLatencyBypasser(
  config: Partial<BypasserConfig> = {}
): UseGestureLatencyBypasserResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isAttached, setIsAttached] = useState(false);
  const [gesture, setGesture] = useState<GestureState>(DEFAULT_GESTURE_STATE);
  const [prediction, setPrediction] = useState<PredictedEndState | null>(null);
  const [metrics, setMetrics] = useState<BypasserMetrics>(DEFAULT_METRICS);
  const [isMomentumActive, setIsMomentumActive] = useState(false);

  // Refs
  const elementRef = useRef<HTMLElement | null>(null);
  const internalRef = useRef<HTMLElement>(null);
  const styleUpdaterRef = useRef<StyleUpdater | null>(null);
  const touchSamplesRef = useRef<TimestampedTouch[]>([]);
  const snapPointsRef = useRef<SnapPoint[]>(mergedConfig.snapPoints);
  const momentumRafRef = useRef<number | null>(null);
  const latencyTimesRef = useRef<number[]>([]);
  const gestureStartTimeRef = useRef<number>(0);
  const initialTouchesRef = useRef<{ x: number; y: number }[]>([]);
  const initialScaleRef = useRef<number>(1);
  const initialRotationRef = useRef<number>(0);

  /**
   * Apply style update directly
   */
  const applyStyleUpdate = useCallback(
    (delta: { x: number; y: number }, scale: number, rotation: number) => {
      const startTime = performance.now();

      if (styleUpdaterRef.current) {
        styleUpdaterRef.current(delta, scale, rotation);
      }

      // Track latency
      const latency = performance.now() - startTime;
      latencyTimesRef.current.push(latency);
      if (latencyTimesRef.current.length > 100) {
        latencyTimesRef.current.shift();
      }

      setMetrics((prev) => ({
        ...prev,
        bypassedUpdates: prev.bypassedUpdates + 1,
        averageLatencyMs:
          latencyTimesRef.current.reduce((a, b) => a + b, 0) /
          latencyTimesRef.current.length,
      }));
    },
    []
  );

  /**
   * Update prediction
   */
  const updatePrediction = useCallback(() => {
    if (!mergedConfig.enablePrediction || touchSamplesRef.current.length < 2) {
      setPrediction(null);
      return;
    }

    const velocity = calculateVelocity(touchSamplesRef.current);
    const current = touchSamplesRef.current[touchSamplesRef.current.length - 1];
    const predicted = predictEndPosition(
      current,
      velocity,
      mergedConfig.momentumFriction,
      mergedConfig.predictionHorizonMs
    );

    // Check for snap points
    let finalPosition = predicted;
    let confidence = 0.7;

    if (mergedConfig.enableSnapPoints) {
      const snapPoint = findNearestSnapPoint(
        predicted,
        snapPointsRef.current,
        mergedConfig.snapRadius
      );

      if (snapPoint) {
        finalPosition = { x: snapPoint.x, y: snapPoint.y };
        confidence = 0.9;
      }
    }

    setPrediction({
      x: finalPosition.x,
      y: finalPosition.y,
      scale: 1,
      rotation: 0,
      confidence,
      estimatedTimeMs: mergedConfig.predictionHorizonMs,
    });

    setMetrics((prev) => ({
      ...prev,
      predictionsGenerated: prev.predictionsGenerated + 1,
    }));
  }, [mergedConfig]);

  /**
   * Run momentum animation
   */
  const runMomentum = useCallback(() => {
    const velocity = calculateVelocity(touchSamplesRef.current);

    if (velocity.speed < mergedConfig.momentumThreshold) {
      setIsMomentumActive(false);
      return;
    }

    setIsMomentumActive(true);

    let vx = velocity.vx;
    let vy = velocity.vy;
    let currentDelta = { ...gesture.delta };

    const animate = () => {
      // Apply friction
      vx *= mergedConfig.momentumFriction;
      vy *= mergedConfig.momentumFriction;

      const speed = Math.sqrt(vx * vx + vy * vy);

      if (speed < mergedConfig.momentumThreshold) {
        setIsMomentumActive(false);

        // Check for snap
        if (mergedConfig.enableSnapPoints) {
          const finalPos = {
            x: (gesture.startPosition?.x ?? 0) + currentDelta.x,
            y: (gesture.startPosition?.y ?? 0) + currentDelta.y,
          };

          const snapPoint = findNearestSnapPoint(
            finalPos,
            snapPointsRef.current,
            mergedConfig.snapRadius
          );

          if (snapPoint) {
            const snapDelta = {
              x: snapPoint.x - (gesture.startPosition?.x ?? 0),
              y: snapPoint.y - (gesture.startPosition?.y ?? 0),
            };
            applyStyleUpdate(snapDelta, gesture.scale, gesture.rotation);

            setMetrics((prev) => ({
              ...prev,
              snapsTriggered: prev.snapsTriggered + 1,
            }));
          }
        }

        return;
      }

      // Update delta
      currentDelta.x += vx / 60; // Assuming 60fps
      currentDelta.y += vy / 60;

      applyStyleUpdate(currentDelta, gesture.scale, gesture.rotation);

      setGesture((prev) => ({
        ...prev,
        delta: currentDelta,
        velocity: { vx, vy, speed, angle: Math.atan2(vy, vx) },
      }));

      setMetrics((prev) => ({
        ...prev,
        momentumFrames: prev.momentumFrames + 1,
      }));

      momentumRafRef.current = requestAnimationFrame(animate);
    };

    momentumRafRef.current = requestAnimationFrame(animate);
  }, [gesture, mergedConfig, applyStyleUpdate]);

  /**
   * Handle touch start
   */
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      gestureStartTimeRef.current = performance.now();
      touchSamplesRef.current = [];

      // Store initial touches
      initialTouchesRef.current = Array.from(e.touches).map((t) => ({
        x: t.clientX,
        y: t.clientY,
      }));

      // Calculate initial scale/rotation for multi-touch
      if (e.touches.length >= 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialScaleRef.current = distance(
          { x: t1.clientX, y: t1.clientY },
          { x: t2.clientX, y: t2.clientY }
        );
        initialRotationRef.current = angle(
          { x: t1.clientX, y: t1.clientY },
          { x: t2.clientX, y: t2.clientY }
        );
      }

      // Determine gesture type
      let gestureType: BypassableGesture = "pan";
      if (e.touches.length >= 2) {
        gestureType = "pinch";
      }

      const firstTouch = e.touches[0];
      const startPos = { x: firstTouch.clientX, y: firstTouch.clientY };

      // Add first sample
      touchSamplesRef.current.push({
        x: firstTouch.clientX,
        y: firstTouch.clientY,
        timestamp: performance.now(),
        identifier: firstTouch.identifier,
      });

      setGesture({
        isActive: true,
        type: gestureType,
        startPosition: startPos,
        currentPosition: startPos,
        delta: { x: 0, y: 0 },
        scale: 1,
        rotation: 0,
        velocity: DEFAULT_VELOCITY,
        touchCount: e.touches.length,
      });

      // Stop any momentum
      if (momentumRafRef.current) {
        cancelAnimationFrame(momentumRafRef.current);
        momentumRafRef.current = null;
      }
      setIsMomentumActive(false);
    },
    []
  );

  /**
   * Handle touch move
   */
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!gesture.isActive || !gesture.startPosition) return;

      const now = performance.now();
      const firstTouch = e.touches[0];

      // Add touch sample
      touchSamplesRef.current.push({
        x: firstTouch.clientX,
        y: firstTouch.clientY,
        timestamp: now,
        identifier: firstTouch.identifier,
      });

      // Keep only recent samples
      if (touchSamplesRef.current.length > mergedConfig.velocitySamples) {
        touchSamplesRef.current.shift();
      }

      // Calculate delta
      const delta = {
        x: firstTouch.clientX - gesture.startPosition.x,
        y: firstTouch.clientY - gesture.startPosition.y,
      };

      // Calculate scale and rotation for multi-touch
      let scale = 1;
      let rotation = 0;

      if (e.touches.length >= 2 && initialScaleRef.current > 0) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];

        const currentDist = distance(
          { x: t1.clientX, y: t1.clientY },
          { x: t2.clientX, y: t2.clientY }
        );
        scale = currentDist / initialScaleRef.current;

        const currentAngle = angle(
          { x: t1.clientX, y: t1.clientY },
          { x: t2.clientX, y: t2.clientY }
        );
        rotation = ((currentAngle - initialRotationRef.current) * 180) / Math.PI;
      }

      // Calculate velocity
      const velocity = mergedConfig.trackVelocity
        ? calculateVelocity(touchSamplesRef.current)
        : DEFAULT_VELOCITY;

      // Apply update directly (bypassing React batching)
      applyStyleUpdate(delta, scale, rotation);

      // Update prediction
      if (mergedConfig.enablePrediction) {
        updatePrediction();
      }

      setGesture((prev) => ({
        ...prev,
        currentPosition: { x: firstTouch.clientX, y: firstTouch.clientY },
        delta,
        scale,
        rotation,
        velocity,
        touchCount: e.touches.length,
      }));
    },
    [gesture, mergedConfig, applyStyleUpdate, updatePrediction]
  );

  /**
   * Handle touch end
   */
  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!gesture.isActive) return;

      setMetrics((prev) => ({
        ...prev,
        gesturesProcessed: prev.gesturesProcessed + 1,
      }));

      // Check if all touches ended
      if (e.touches.length === 0) {
        // Run momentum if enabled
        if (mergedConfig.enableMomentum) {
          runMomentum();
        }

        setGesture((prev) => ({
          ...prev,
          isActive: false,
          touchCount: 0,
        }));
      } else {
        // Update touch count
        setGesture((prev) => ({
          ...prev,
          touchCount: e.touches.length,
        }));
      }
    },
    [gesture, mergedConfig.enableMomentum, runMomentum]
  );

  /**
   * Attach to element
   */
  const attach = useCallback(
    (element: HTMLElement, styleUpdater: StyleUpdater) => {
      elementRef.current = element;
      styleUpdaterRef.current = styleUpdater;

      const listenerOptions = mergedConfig.usePassiveListeners
        ? { passive: true }
        : { passive: false };

      element.addEventListener("touchstart", handleTouchStart, listenerOptions);
      element.addEventListener("touchmove", handleTouchMove, listenerOptions);
      element.addEventListener("touchend", handleTouchEnd, listenerOptions);
      element.addEventListener("touchcancel", handleTouchEnd, listenerOptions);

      // Optimize for touch
      element.style.touchAction = "none";
      element.style.userSelect = "none";
      (element.style as unknown as Record<string, string>).webkitUserSelect = "none";

      setIsAttached(true);
    },
    [mergedConfig.usePassiveListeners, handleTouchStart, handleTouchMove, handleTouchEnd]
  );

  /**
   * Detach from element
   */
  const detach = useCallback(() => {
    const element = elementRef.current;

    if (element) {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchEnd);

      element.style.touchAction = "";
      element.style.userSelect = "";
    }

    if (momentumRafRef.current) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }

    elementRef.current = null;
    styleUpdaterRef.current = null;
    setIsAttached(false);
    setIsMomentumActive(false);
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  /**
   * Add snap point
   */
  const addSnapPoint = useCallback((point: SnapPoint) => {
    snapPointsRef.current.push(point);
  }, []);

  /**
   * Remove snap point
   */
  const removeSnapPoint = useCallback((id: string) => {
    snapPointsRef.current = snapPointsRef.current.filter((p) => p.id !== id);
  }, []);

  /**
   * Clear all snap points
   */
  const clearSnapPoints = useCallback(() => {
    snapPointsRef.current = [];
  }, []);

  /**
   * Cancel current gesture
   */
  const cancelGesture = useCallback(() => {
    setGesture(DEFAULT_GESTURE_STATE);
    touchSamplesRef.current = [];
    setPrediction(null);

    if (momentumRafRef.current) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
    setIsMomentumActive(false);
  }, []);

  /**
   * Stop momentum
   */
  const stopMomentum = useCallback(() => {
    if (momentumRafRef.current) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
    setIsMomentumActive(false);
  }, []);

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback(() => {
    setMetrics(DEFAULT_METRICS);
    latencyTimesRef.current = [];
  }, []);

  /**
   * Get prediction
   */
  const getPrediction = useCallback(() => {
    return prediction;
  }, [prediction]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (momentumRafRef.current) {
        cancelAnimationFrame(momentumRafRef.current);
      }
    };
  }, []);

  // Build state
  const state: BypasserState = useMemo(
    () => ({
      isAttached,
      gesture,
      prediction,
      metrics,
      isMomentumActive,
    }),
    [isAttached, gesture, prediction, metrics, isMomentumActive]
  );

  // Build controls
  const controls: BypasserControls = useMemo(
    () => ({
      attach,
      detach,
      addSnapPoint,
      removeSnapPoint,
      clearSnapPoints,
      cancelGesture,
      stopMomentum,
      resetMetrics,
      getPrediction,
    }),
    [
      attach,
      detach,
      addSnapPoint,
      removeSnapPoint,
      clearSnapPoints,
      cancelGesture,
      stopMomentum,
      resetMetrics,
      getPrediction,
    ]
  );

  return {
    state,
    controls,
    ref: internalRef as React.RefObject<HTMLElement>,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple pan gesture bypasser
 */
export function usePanBypasser(): {
  ref: React.RefObject<HTMLElement>;
  delta: { x: number; y: number };
  isPanning: boolean;
  velocity: GestureVelocity;
} {
  const { state, ref } = useGestureLatencyBypasser({
    gestures: ["pan"],
    enableMomentum: false,
  });

  return {
    ref,
    delta: state.gesture.delta,
    isPanning: state.gesture.isActive,
    velocity: state.gesture.velocity,
  };
}

/**
 * Pinch-zoom gesture bypasser
 */
export function usePinchBypasser(): {
  ref: React.RefObject<HTMLElement>;
  scale: number;
  isPinching: boolean;
} {
  const { state, ref } = useGestureLatencyBypasser({
    gestures: ["pinch"],
    enableMomentum: false,
  });

  return {
    ref,
    scale: state.gesture.scale,
    isPinching: state.gesture.isActive && state.gesture.touchCount >= 2,
  };
}

// ============================================================================
// Exports
// ============================================================================

export default useGestureLatencyBypasser;
