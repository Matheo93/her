/**
 * useAvatarGesturePredictor - Sprint 544
 *
 * Predictive gesture recognition for reduced perceived latency:
 * - Touch trajectory prediction using linear extrapolation
 * - Early gesture classification (tap, swipe, pinch, rotate)
 * - Intent prediction based on velocity and direction
 * - Speculative avatar state preparation
 * - Confidence-based action triggering
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type PredictedGesture =
  | "tap"
  | "double-tap"
  | "long-press"
  | "swipe-up"
  | "swipe-down"
  | "swipe-left"
  | "swipe-right"
  | "pinch-in"
  | "pinch-out"
  | "rotate-cw"
  | "rotate-ccw"
  | "drag"
  | "unknown";

export type GesturePredictionConfidence = "high" | "medium" | "low" | "none";

export type PredictorMode = "conservative" | "balanced" | "aggressive";

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
  timestamp: number;
  force?: number;
}

export interface TouchTrajectory {
  points: TouchPoint[];
  velocityX: number;
  velocityY: number;
  accelerationX: number;
  accelerationY: number;
  direction: number; // radians
  distance: number;
  duration: number;
}

export interface GesturePrediction {
  gesture: PredictedGesture;
  confidence: GesturePredictionConfidence;
  probability: number;
  predictedEndPoint: { x: number; y: number } | null;
  predictedDuration: number;
  alternates: Array<{ gesture: PredictedGesture; probability: number }>;
  shouldAct: boolean;
}

export interface PredictorState {
  isTracking: boolean;
  activeTouches: number;
  currentPrediction: GesturePrediction | null;
  trajectories: Map<number, TouchTrajectory>;
  lastGesture: PredictedGesture | null;
  gestureStartTime: number | null;
}

export interface PredictorMetrics {
  totalPredictions: number;
  correctPredictions: number;
  incorrectPredictions: number;
  accuracy: number;
  averageConfidence: number;
  averagePredictionTime: number;
  gesturesDetected: Record<PredictedGesture, number>;
}

export interface PredictorConfig {
  mode?: PredictorMode;
  minConfidenceToAct?: number;
  tapMaxDuration?: number;
  tapMaxDistance?: number;
  doubleTapMaxInterval?: number;
  longPressMinDuration?: number;
  swipeMinVelocity?: number;
  swipeMinDistance?: number;
  pinchMinScale?: number;
  rotateMinAngle?: number;
  predictionHorizonMs?: number;
  historySize?: number;
  enabled?: boolean;
}

export interface PredictorCallbacks {
  onPrediction?: (prediction: GesturePrediction) => void;
  onGestureStart?: (gesture: PredictedGesture) => void;
  onGestureEnd?: (gesture: PredictedGesture, wasCorrect: boolean) => void;
  onConfidenceChange?: (confidence: GesturePredictionConfidence) => void;
  onActionTriggered?: (gesture: PredictedGesture) => void;
}

export interface PredictorControls {
  trackTouch: (touch: TouchPoint) => void;
  trackTouchEnd: (touchId: number) => void;
  trackTouchCancel: (touchId: number) => void;
  reset: () => void;
  confirmGesture: (gesture: PredictedGesture) => void;
  rejectPrediction: () => void;
  setMode: (mode: PredictorMode) => void;
  predictNext: () => GesturePrediction | null;
}

export interface GesturePredictorResult {
  state: PredictorState;
  metrics: PredictorMetrics;
  controls: PredictorControls;
  prediction: GesturePrediction | null;
  isActive: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: Required<PredictorConfig> = {
  mode: "balanced",
  minConfidenceToAct: 0.7,
  tapMaxDuration: 300,
  tapMaxDistance: 10,
  doubleTapMaxInterval: 300,
  longPressMinDuration: 500,
  swipeMinVelocity: 0.5,
  swipeMinDistance: 50,
  pinchMinScale: 0.1,
  rotateMinAngle: 15,
  predictionHorizonMs: 100,
  historySize: 20,
  enabled: true,
};

const MODE_THRESHOLDS: Record<PredictorMode, { min: number; actAt: number }> = {
  conservative: { min: 0.8, actAt: 0.9 },
  balanced: { min: 0.6, actAt: 0.75 },
  aggressive: { min: 0.4, actAt: 0.6 },
};

const INITIAL_GESTURE_COUNTS: Record<PredictedGesture, number> = {
  tap: 0,
  "double-tap": 0,
  "long-press": 0,
  "swipe-up": 0,
  "swipe-down": 0,
  "swipe-left": 0,
  "swipe-right": 0,
  "pinch-in": 0,
  "pinch-out": 0,
  "rotate-cw": 0,
  "rotate-ccw": 0,
  drag: 0,
  unknown: 0,
};

// ============================================================================
// Utility Functions
// ============================================================================

function calculateVelocity(
  points: TouchPoint[]
): { vx: number; vy: number } {
  if (points.length < 2) return { vx: 0, vy: 0 };

  const recent = points.slice(-5);
  if (recent.length < 2) return { vx: 0, vy: 0 };

  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = (last.timestamp - first.timestamp) / 1000;

  if (dt === 0) return { vx: 0, vy: 0 };

  return {
    vx: (last.x - first.x) / dt,
    vy: (last.y - first.y) / dt,
  };
}

function calculateAcceleration(
  points: TouchPoint[]
): { ax: number; ay: number } {
  if (points.length < 3) return { ax: 0, ay: 0 };

  const recent = points.slice(-10);
  if (recent.length < 3) return { ax: 0, ay: 0 };

  const mid = Math.floor(recent.length / 2);
  const first = recent.slice(0, mid);
  const second = recent.slice(mid);

  const v1 = calculateVelocity(first);
  const v2 = calculateVelocity(second);

  const t1 = first[first.length - 1]?.timestamp || 0;
  const t2 = second[second.length - 1]?.timestamp || t1;
  const dt = (t2 - t1) / 1000;

  if (dt === 0) return { ax: 0, ay: 0 };

  return {
    ax: (v2.vx - v1.vx) / dt,
    ay: (v2.vy - v1.vy) / dt,
  };
}

function calculateDirection(points: TouchPoint[]): number {
  if (points.length < 2) return 0;

  const first = points[0];
  const last = points[points.length - 1];

  return Math.atan2(last.y - first.y, last.x - first.x);
}

function calculateDistance(points: TouchPoint[]): number {
  if (points.length < 2) return 0;

  const first = points[0];
  const last = points[points.length - 1];

  return Math.sqrt(
    Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2)
  );
}

function predictEndPoint(
  trajectory: TouchTrajectory,
  horizonMs: number
): { x: number; y: number } | null {
  if (trajectory.points.length === 0) return null;

  const last = trajectory.points[trajectory.points.length - 1];
  const t = horizonMs / 1000;

  return {
    x: last.x + trajectory.velocityX * t + 0.5 * trajectory.accelerationX * t * t,
    y: last.y + trajectory.velocityY * t + 0.5 * trajectory.accelerationY * t * t,
  };
}

function calculatePinchScale(
  trajectory1: TouchTrajectory,
  trajectory2: TouchTrajectory
): number {
  if (trajectory1.points.length < 2 || trajectory2.points.length < 2) return 1;

  const p1First = trajectory1.points[0];
  const p1Last = trajectory1.points[trajectory1.points.length - 1];
  const p2First = trajectory2.points[0];
  const p2Last = trajectory2.points[trajectory2.points.length - 1];

  const initialDistance = Math.sqrt(
    Math.pow(p2First.x - p1First.x, 2) + Math.pow(p2First.y - p1First.y, 2)
  );

  const currentDistance = Math.sqrt(
    Math.pow(p2Last.x - p1Last.x, 2) + Math.pow(p2Last.y - p1Last.y, 2)
  );

  if (initialDistance === 0) return 1;
  return currentDistance / initialDistance;
}

function calculateRotationAngle(
  trajectory1: TouchTrajectory,
  trajectory2: TouchTrajectory
): number {
  if (trajectory1.points.length < 2 || trajectory2.points.length < 2) return 0;

  const p1First = trajectory1.points[0];
  const p1Last = trajectory1.points[trajectory1.points.length - 1];
  const p2First = trajectory2.points[0];
  const p2Last = trajectory2.points[trajectory2.points.length - 1];

  const initialAngle = Math.atan2(
    p2First.y - p1First.y,
    p2First.x - p1First.x
  );

  const currentAngle = Math.atan2(
    p2Last.y - p1Last.y,
    p2Last.x - p1Last.x
  );

  return ((currentAngle - initialAngle) * 180) / Math.PI;
}

function confidenceToLevel(probability: number): GesturePredictionConfidence {
  if (probability >= 0.8) return "high";
  if (probability >= 0.6) return "medium";
  if (probability >= 0.3) return "low";
  return "none";
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarGesturePredictor(
  config: PredictorConfig = {},
  callbacks: PredictorCallbacks = {}
): GesturePredictorResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [trajectories, setTrajectories] = useState<Map<number, TouchTrajectory>>(
    new Map()
  );
  const [currentPrediction, setCurrentPrediction] =
    useState<GesturePrediction | null>(null);
  const [lastGesture, setLastGesture] = useState<PredictedGesture | null>(null);
  const [gestureStartTime, setGestureStartTime] = useState<number | null>(null);
  const [mode, setModeState] = useState<PredictorMode>(mergedConfig.mode);

  // Refs
  const trajectoriesRef = useRef(trajectories);
  trajectoriesRef.current = trajectories;
  const lastTapTimeRef = useRef<number>(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const metricsRef = useRef<PredictorMetrics>({
    totalPredictions: 0,
    correctPredictions: 0,
    incorrectPredictions: 0,
    accuracy: 0,
    averageConfidence: 0,
    averagePredictionTime: 0,
    gesturesDetected: { ...INITIAL_GESTURE_COUNTS },
  });
  const predictionTimesRef = useRef<number[]>([]);
  const confidencesRef = useRef<number[]>([]);
  const lastPredictionRef = useRef<GesturePrediction | null>(null);

  // Cleanup long press timer
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Predict gesture from trajectories
  const predictGesture = useCallback((): GesturePrediction | null => {
    if (!mergedConfig.enabled) return null;

    const trajectoryArray = Array.from(trajectoriesRef.current.values());
    if (trajectoryArray.length === 0) return null;

    const thresholds = MODE_THRESHOLDS[mode];
    const now = Date.now();
    const predictionStart = performance.now();

    let gesture: PredictedGesture = "unknown";
    let probability = 0;
    const alternates: Array<{ gesture: PredictedGesture; probability: number }> = [];

    // Single touch gestures
    if (trajectoryArray.length === 1) {
      const trajectory = trajectoryArray[0];
      const duration = trajectory.duration;
      const distance = trajectory.distance;
      const velocity = Math.sqrt(
        trajectory.velocityX ** 2 + trajectory.velocityY ** 2
      );

      // Check for tap
      if (
        duration < mergedConfig.tapMaxDuration &&
        distance < mergedConfig.tapMaxDistance
      ) {
        // Check for double tap
        if (now - lastTapTimeRef.current < mergedConfig.doubleTapMaxInterval) {
          gesture = "double-tap";
          probability = 0.85;
          alternates.push({ gesture: "tap", probability: 0.1 });
        } else {
          gesture = "tap";
          probability = 0.9;
          alternates.push({ gesture: "double-tap", probability: 0.05 });
        }
      }
      // Check for long press
      else if (
        duration >= mergedConfig.longPressMinDuration &&
        distance < mergedConfig.tapMaxDistance * 2
      ) {
        gesture = "long-press";
        probability = 0.85;
        alternates.push({ gesture: "drag", probability: 0.1 });
      }
      // Check for swipe
      else if (
        velocity >= mergedConfig.swipeMinVelocity &&
        distance >= mergedConfig.swipeMinDistance
      ) {
        const direction = trajectory.direction;
        const absDirection = Math.abs(direction);

        if (absDirection < Math.PI / 4) {
          gesture = "swipe-right";
          probability = 0.8 + velocity * 0.05;
        } else if (absDirection > (3 * Math.PI) / 4) {
          gesture = "swipe-left";
          probability = 0.8 + velocity * 0.05;
        } else if (direction > 0) {
          gesture = "swipe-down";
          probability = 0.8 + velocity * 0.05;
        } else {
          gesture = "swipe-up";
          probability = 0.8 + velocity * 0.05;
        }
        probability = Math.min(probability, 0.95);

        // Add alternates
        if (gesture === "swipe-right" || gesture === "swipe-left") {
          alternates.push({ gesture: "drag", probability: 0.1 });
        }
      }
      // Default to drag
      else if (distance > mergedConfig.tapMaxDistance) {
        gesture = "drag";
        probability = 0.7;
        alternates.push({ gesture: "swipe-right", probability: 0.15 });
      }
    }
    // Two-touch gestures
    else if (trajectoryArray.length === 2) {
      const [t1, t2] = trajectoryArray;
      const scale = calculatePinchScale(t1, t2);
      const rotation = calculateRotationAngle(t1, t2);

      // Check for pinch
      if (Math.abs(scale - 1) > mergedConfig.pinchMinScale) {
        gesture = scale < 1 ? "pinch-in" : "pinch-out";
        probability = 0.85;
        alternates.push({ gesture: "rotate-cw", probability: 0.1 });
      }
      // Check for rotation
      else if (Math.abs(rotation) > mergedConfig.rotateMinAngle) {
        gesture = rotation > 0 ? "rotate-cw" : "rotate-ccw";
        probability = 0.8;
        alternates.push({ gesture: "pinch-in", probability: 0.1 });
      }
    }

    if (gesture === "unknown") {
      return null;
    }

    const predictionTime = performance.now() - predictionStart;
    predictionTimesRef.current.push(predictionTime);
    confidencesRef.current.push(probability);

    // Update metrics
    metricsRef.current.totalPredictions++;
    metricsRef.current.averagePredictionTime =
      predictionTimesRef.current.reduce((a, b) => a + b, 0) /
      predictionTimesRef.current.length;
    metricsRef.current.averageConfidence =
      confidencesRef.current.reduce((a, b) => a + b, 0) /
      confidencesRef.current.length;

    const prediction: GesturePrediction = {
      gesture,
      confidence: confidenceToLevel(probability),
      probability,
      predictedEndPoint:
        trajectoryArray.length === 1
          ? predictEndPoint(trajectoryArray[0], mergedConfig.predictionHorizonMs)
          : null,
      predictedDuration: trajectoryArray[0]?.duration || 0,
      alternates,
      shouldAct: probability >= thresholds.actAt,
    };

    return prediction;
  }, [mergedConfig, mode]);

  // Track touch point
  const trackTouch = useCallback(
    (touch: TouchPoint) => {
      if (!mergedConfig.enabled) return;

      setTrajectories((prev) => {
        const next = new Map(prev);
        const existing = next.get(touch.id);

        if (existing) {
          // Add to existing trajectory
          const points = [...existing.points, touch].slice(
            -mergedConfig.historySize
          );
          const velocity = calculateVelocity(points);
          const acceleration = calculateAcceleration(points);

          next.set(touch.id, {
            points,
            velocityX: velocity.vx,
            velocityY: velocity.vy,
            accelerationX: acceleration.ax,
            accelerationY: acceleration.ay,
            direction: calculateDirection(points),
            distance: calculateDistance(points),
            duration: points.length > 0
              ? points[points.length - 1].timestamp - points[0].timestamp
              : 0,
          });
        } else {
          // Start new trajectory
          next.set(touch.id, {
            points: [touch],
            velocityX: 0,
            velocityY: 0,
            accelerationX: 0,
            accelerationY: 0,
            direction: 0,
            distance: 0,
            duration: 0,
          });

          // Set gesture start time
          if (next.size === 1) {
            setGestureStartTime(touch.timestamp);
            callbacksRef.current.onGestureStart?.("unknown");

            // Start long press timer
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
            }
            longPressTimerRef.current = setTimeout(() => {
              const trajectory = trajectoriesRef.current.get(touch.id);
              if (
                trajectory &&
                trajectory.distance < mergedConfig.tapMaxDistance * 2
              ) {
                const prediction: GesturePrediction = {
                  gesture: "long-press",
                  confidence: "high",
                  probability: 0.9,
                  predictedEndPoint: null,
                  predictedDuration: mergedConfig.longPressMinDuration,
                  alternates: [],
                  shouldAct: true,
                };
                setCurrentPrediction(prediction);
                callbacksRef.current.onPrediction?.(prediction);
              }
            }, mergedConfig.longPressMinDuration);
          }
        }

        return next;
      });

      // Update prediction
      const prediction = predictGesture();
      if (prediction) {
        setCurrentPrediction(prediction);
        lastPredictionRef.current = prediction;

        if (
          prediction.confidence !== lastPredictionRef.current?.confidence
        ) {
          callbacksRef.current.onConfidenceChange?.(prediction.confidence);
        }

        callbacksRef.current.onPrediction?.(prediction);

        if (prediction.shouldAct) {
          callbacksRef.current.onActionTriggered?.(prediction.gesture);
        }
      }
    },
    [mergedConfig, predictGesture]
  );

  // Track touch end
  const trackTouchEnd = useCallback(
    (touchId: number) => {
      // Clear long press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      const trajectory = trajectoriesRef.current.get(touchId);
      if (trajectory && trajectory.points.length > 0) {
        // Final prediction
        const prediction = predictGesture();
        if (prediction) {
          setCurrentPrediction(prediction);
          setLastGesture(prediction.gesture);
          lastTapTimeRef.current =
            prediction.gesture === "tap" ? Date.now() : lastTapTimeRef.current;

          // Update gesture counts
          metricsRef.current.gesturesDetected[prediction.gesture]++;

          callbacksRef.current.onGestureEnd?.(prediction.gesture, true);
        }
      }

      setTrajectories((prev) => {
        const next = new Map(prev);
        next.delete(touchId);

        if (next.size === 0) {
          setGestureStartTime(null);
          setCurrentPrediction(null);
        }

        return next;
      });
    },
    [predictGesture]
  );

  // Track touch cancel
  const trackTouchCancel = useCallback((touchId: number) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    setTrajectories((prev) => {
      const next = new Map(prev);
      next.delete(touchId);

      if (next.size === 0) {
        setGestureStartTime(null);
        setCurrentPrediction(null);
      }

      return next;
    });
  }, []);

  // Reset state
  const reset = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    setTrajectories(new Map());
    setCurrentPrediction(null);
    setLastGesture(null);
    setGestureStartTime(null);
    lastTapTimeRef.current = 0;
    lastPredictionRef.current = null;
  }, []);

  // Confirm gesture (for accuracy tracking)
  const confirmGesture = useCallback((gesture: PredictedGesture) => {
    if (lastPredictionRef.current?.gesture === gesture) {
      metricsRef.current.correctPredictions++;
    } else {
      metricsRef.current.incorrectPredictions++;
    }

    const total =
      metricsRef.current.correctPredictions +
      metricsRef.current.incorrectPredictions;
    metricsRef.current.accuracy =
      total > 0 ? metricsRef.current.correctPredictions / total : 0;
  }, []);

  // Reject current prediction
  const rejectPrediction = useCallback(() => {
    metricsRef.current.incorrectPredictions++;
    const total =
      metricsRef.current.correctPredictions +
      metricsRef.current.incorrectPredictions;
    metricsRef.current.accuracy =
      total > 0 ? metricsRef.current.correctPredictions / total : 0;

    setCurrentPrediction(null);
    lastPredictionRef.current = null;
  }, []);

  // Set prediction mode
  const setMode = useCallback((newMode: PredictorMode) => {
    setModeState(newMode);
  }, []);

  // Predict next (manual trigger)
  const predictNext = useCallback((): GesturePrediction | null => {
    return predictGesture();
  }, [predictGesture]);

  // State
  const state = useMemo<PredictorState>(
    () => ({
      isTracking: trajectories.size > 0,
      activeTouches: trajectories.size,
      currentPrediction,
      trajectories,
      lastGesture,
      gestureStartTime,
    }),
    [trajectories, currentPrediction, lastGesture, gestureStartTime]
  );

  // Controls
  const controls = useMemo<PredictorControls>(
    () => ({
      trackTouch,
      trackTouchEnd,
      trackTouchCancel,
      reset,
      confirmGesture,
      rejectPrediction,
      setMode,
      predictNext,
    }),
    [
      trackTouch,
      trackTouchEnd,
      trackTouchCancel,
      reset,
      confirmGesture,
      rejectPrediction,
      setMode,
      predictNext,
    ]
  );

  return {
    state,
    metrics: metricsRef.current,
    controls,
    prediction: currentPrediction,
    isActive: trajectories.size > 0 && mergedConfig.enabled,
  };
}

// ============================================================================
// Sub-Hooks
// ============================================================================

export interface TouchPredictorOptions {
  mode?: PredictorMode;
  enabled?: boolean;
}

export function useGesturePrediction(
  options: TouchPredictorOptions = {}
): GesturePrediction | null {
  const { prediction } = useAvatarGesturePredictor({
    mode: options.mode,
    enabled: options.enabled,
  });

  return prediction;
}

export function usePredictedGesture(
  options: TouchPredictorOptions = {}
): PredictedGesture | null {
  const { prediction } = useAvatarGesturePredictor({
    mode: options.mode,
    enabled: options.enabled,
  });

  return prediction?.gesture || null;
}

export function usePredictionConfidence(
  options: TouchPredictorOptions = {}
): { confidence: GesturePredictionConfidence; probability: number } {
  const { prediction } = useAvatarGesturePredictor({
    mode: options.mode,
    enabled: options.enabled,
  });

  return {
    confidence: prediction?.confidence || "none",
    probability: prediction?.probability || 0,
  };
}

export function usePredictorMetrics(): PredictorMetrics {
  const { metrics } = useAvatarGesturePredictor();
  return metrics;
}

export default useAvatarGesturePredictor;
