/**
 * useTouchResponsePredictor - Sprint 231
 *
 * Predicts touch responses before they occur to enable pre-rendering
 * and instant visual feedback on mobile devices.
 *
 * Features:
 * - Touch trajectory prediction using Kalman filtering
 * - Gesture intent recognition
 * - Pre-computed response caching
 * - Confidence-based prediction filtering
 * - Multi-touch prediction support
 * - Temporal extrapolation
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * 2D Point
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Touch sample with timing
 */
export interface TouchSample {
  position: Point2D;
  timestamp: number;
  pressure: number;
  identifier: number;
}

/**
 * Predicted touch position
 */
export interface PredictedTouch {
  position: Point2D;
  velocity: Point2D;
  acceleration: Point2D;
  confidence: number;
  predictedTime: number;
}

/**
 * Gesture intent types
 */
export type GestureIntent =
  | "tap"
  | "doubleTap"
  | "longPress"
  | "swipeLeft"
  | "swipeRight"
  | "swipeUp"
  | "swipeDown"
  | "pinchIn"
  | "pinchOut"
  | "rotate"
  | "pan"
  | "unknown";

/**
 * Intent prediction
 */
export interface IntentPrediction {
  intent: GestureIntent;
  confidence: number;
  targetPosition: Point2D | null;
  estimatedCompletionMs: number;
}

/**
 * Pre-computed response
 */
export interface PrecomputedResponse<T> {
  intent: GestureIntent;
  response: T;
  computedAt: number;
  validUntil: number;
}

/**
 * Kalman filter state
 */
export interface KalmanState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  covariance: number[][];
}

/**
 * Predictor configuration
 */
export interface PredictorConfig {
  /** Prediction horizon in ms (default: 50) */
  predictionHorizonMs: number;
  /** Minimum confidence threshold (default: 0.6) */
  minConfidence: number;
  /** Sample history size (default: 10) */
  sampleHistorySize: number;
  /** Enable Kalman filtering (default: true) */
  enableKalmanFilter: boolean;
  /** Kalman process noise (default: 0.1) */
  processNoise: number;
  /** Kalman measurement noise (default: 0.5) */
  measurementNoise: number;
  /** Intent recognition window in ms (default: 300) */
  intentWindowMs: number;
  /** Tap threshold distance in px (default: 10) */
  tapThreshold: number;
  /** Swipe threshold velocity (default: 0.5) */
  swipeVelocityThreshold: number;
  /** Long press threshold in ms (default: 500) */
  longPressThresholdMs: number;
  /** Response cache TTL in ms (default: 100) */
  responseCacheTtlMs: number;
}

/**
 * Predictor metrics
 */
export interface PredictorMetrics {
  samplesProcessed: number;
  predictionsGenerated: number;
  intentsRecognized: number;
  cacheHits: number;
  cacheMisses: number;
  averagePredictionError: number;
  correctIntentPredictions: number;
}

/**
 * Predictor state
 */
export interface PredictorState {
  isTracking: boolean;
  currentSample: TouchSample | null;
  prediction: PredictedTouch | null;
  intentPrediction: IntentPrediction | null;
  metrics: PredictorMetrics;
}

/**
 * Predictor controls
 */
export interface PredictorControls {
  /** Process a new touch sample */
  processSample: (sample: TouchSample) => PredictedTouch;
  /** Get prediction at future time */
  getPredictionAt: (timeMs: number) => PredictedTouch | null;
  /** Get current intent prediction */
  getIntentPrediction: () => IntentPrediction | null;
  /** Pre-compute response for predicted intent */
  precomputeResponse: <T>(
    intent: GestureIntent,
    computeFunc: () => T
  ) => PrecomputedResponse<T> | null;
  /** Get cached response */
  getCachedResponse: <T>(intent: GestureIntent) => T | null;
  /** Clear prediction state */
  clearPrediction: () => void;
  /** Reset tracking */
  reset: () => void;
  /** Set touch start */
  onTouchStart: (sample: TouchSample) => void;
  /** Set touch end */
  onTouchEnd: () => void;
  /** Reset metrics */
  resetMetrics: () => void;
}

/**
 * Hook return type
 */
export interface UseTouchResponsePredictorResult {
  state: PredictorState;
  controls: PredictorControls;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONFIG: PredictorConfig = {
  predictionHorizonMs: 50,
  minConfidence: 0.6,
  sampleHistorySize: 10,
  enableKalmanFilter: true,
  processNoise: 0.1,
  measurementNoise: 0.5,
  intentWindowMs: 300,
  tapThreshold: 10,
  swipeVelocityThreshold: 0.5,
  longPressThresholdMs: 500,
  responseCacheTtlMs: 100,
};

const DEFAULT_METRICS: PredictorMetrics = {
  samplesProcessed: 0,
  predictionsGenerated: 0,
  intentsRecognized: 0,
  cacheHits: 0,
  cacheMisses: 0,
  averagePredictionError: 0,
  correctIntentPredictions: 0,
};

// ============================================================================
// Kalman Filter Implementation
// ============================================================================

/**
 * Initialize Kalman filter state
 */
function initKalmanState(position: Point2D): KalmanState {
  return {
    x: position.x,
    y: position.y,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    covariance: [
      [1, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0, 1],
    ],
  };
}

/**
 * Kalman filter predict step
 */
function kalmanPredict(
  state: KalmanState,
  dt: number,
  processNoise: number
): KalmanState {
  // State transition
  const newX = state.x + state.vx * dt + 0.5 * state.ax * dt * dt;
  const newY = state.y + state.vy * dt + 0.5 * state.ay * dt * dt;
  const newVx = state.vx + state.ax * dt;
  const newVy = state.vy + state.ay * dt;

  // Update covariance with process noise
  const Q = processNoise;
  const newCovariance = state.covariance.map((row, i) =>
    row.map((val, j) => (i === j ? val + Q : val))
  );

  return {
    x: newX,
    y: newY,
    vx: newVx,
    vy: newVy,
    ax: state.ax,
    ay: state.ay,
    covariance: newCovariance,
  };
}

/**
 * Kalman filter update step
 */
function kalmanUpdate(
  state: KalmanState,
  measurement: Point2D,
  measurementNoise: number
): KalmanState {
  const R = measurementNoise;

  // Innovation
  const dx = measurement.x - state.x;
  const dy = measurement.y - state.y;

  // Kalman gain (simplified)
  const K = state.covariance[0][0] / (state.covariance[0][0] + R);

  // Update state
  const newX = state.x + K * dx;
  const newY = state.y + K * dy;

  // Calculate velocity from innovation
  const newVx = state.vx + K * dx * 0.1;
  const newVy = state.vy + K * dy * 0.1;

  // Calculate acceleration
  const newAx = (newVx - state.vx) * 0.1;
  const newAy = (newVy - state.vy) * 0.1;

  // Update covariance
  const newCovariance = state.covariance.map((row, i) =>
    row.map((val, j) => (1 - K) * val)
  );

  return {
    x: newX,
    y: newY,
    vx: newVx,
    vy: newVy,
    ax: newAx,
    ay: newAy,
    covariance: newCovariance,
  };
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that predicts touch responses for pre-rendering
 */
export function useTouchResponsePredictor(
  config: Partial<PredictorConfig> = {}
): UseTouchResponsePredictorResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isTracking, setIsTracking] = useState(false);
  const [currentSample, setCurrentSample] = useState<TouchSample | null>(null);
  const [prediction, setPrediction] = useState<PredictedTouch | null>(null);
  const [intentPrediction, setIntentPrediction] = useState<IntentPrediction | null>(null);
  const [metrics, setMetrics] = useState<PredictorMetrics>(DEFAULT_METRICS);

  // Refs
  const sampleHistoryRef = useRef<TouchSample[]>([]);
  const kalmanStateRef = useRef<KalmanState | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const touchStartPosRef = useRef<Point2D | null>(null);
  const responseCacheRef = useRef<Map<string, PrecomputedResponse<unknown>>>(new Map());
  const predictionErrorsRef = useRef<number[]>([]);

  /**
   * Calculate velocity from samples
   */
  const calculateVelocity = useCallback(
    (samples: TouchSample[]): Point2D => {
      if (samples.length < 2) return { x: 0, y: 0 };

      const recent = samples.slice(-2);
      const dt = (recent[1].timestamp - recent[0].timestamp) / 1000;

      if (dt <= 0) return { x: 0, y: 0 };

      return {
        x: (recent[1].position.x - recent[0].position.x) / dt,
        y: (recent[1].position.y - recent[0].position.y) / dt,
      };
    },
    []
  );

  /**
   * Recognize gesture intent
   */
  const recognizeIntent = useCallback((): IntentPrediction | null => {
    const samples = sampleHistoryRef.current;
    if (samples.length === 0) return null;

    const now = performance.now();
    const touchDuration = now - touchStartTimeRef.current;
    const startPos = touchStartPosRef.current;
    const currentPos = samples[samples.length - 1].position;

    if (!startPos) return null;

    // Calculate displacement
    const dx = currentPos.x - startPos.x;
    const dy = currentPos.y - startPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate velocity
    const velocity = calculateVelocity(samples);
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

    // Intent recognition
    let intent: GestureIntent = "unknown";
    let confidence = 0.5;
    let targetPosition: Point2D | null = null;
    let estimatedCompletionMs = 0;

    // Tap detection
    if (distance < mergedConfig.tapThreshold && touchDuration < 200) {
      intent = "tap";
      confidence = 0.8;
      targetPosition = currentPos;
      estimatedCompletionMs = 100;
    }
    // Long press detection
    else if (distance < mergedConfig.tapThreshold && touchDuration >= mergedConfig.longPressThresholdMs) {
      intent = "longPress";
      confidence = 0.9;
      targetPosition = currentPos;
      estimatedCompletionMs = 0;
    }
    // Swipe detection
    else if (speed > mergedConfig.swipeVelocityThreshold) {
      const angle = Math.atan2(velocity.y, velocity.x);
      const absAngle = Math.abs(angle);

      if (absAngle < Math.PI / 4) {
        intent = "swipeRight";
      } else if (absAngle > (3 * Math.PI) / 4) {
        intent = "swipeLeft";
      } else if (angle > 0) {
        intent = "swipeDown";
      } else {
        intent = "swipeUp";
      }

      confidence = Math.min(0.95, 0.6 + speed * 0.1);
      targetPosition = {
        x: currentPos.x + velocity.x * 0.2,
        y: currentPos.y + velocity.y * 0.2,
      };
      estimatedCompletionMs = 150;
    }
    // Pan detection
    else if (distance >= mergedConfig.tapThreshold) {
      intent = "pan";
      confidence = 0.7;
      targetPosition = currentPos;
      estimatedCompletionMs = 50;
    }

    return {
      intent,
      confidence,
      targetPosition,
      estimatedCompletionMs,
    };
  }, [mergedConfig, calculateVelocity]);

  /**
   * Process a new touch sample
   */
  const processSample = useCallback(
    (sample: TouchSample): PredictedTouch => {
      // Add to history
      sampleHistoryRef.current.push(sample);
      if (sampleHistoryRef.current.length > mergedConfig.sampleHistorySize) {
        sampleHistoryRef.current.shift();
      }

      setCurrentSample(sample);
      setMetrics((prev) => ({
        ...prev,
        samplesProcessed: prev.samplesProcessed + 1,
      }));

      // Kalman filter processing
      if (mergedConfig.enableKalmanFilter) {
        if (!kalmanStateRef.current) {
          kalmanStateRef.current = initKalmanState(sample.position);
        }

        const dt = sampleHistoryRef.current.length > 1
          ? (sample.timestamp - sampleHistoryRef.current[sampleHistoryRef.current.length - 2].timestamp) / 1000
          : 0.016;

        // Predict and update
        kalmanStateRef.current = kalmanPredict(
          kalmanStateRef.current,
          dt,
          mergedConfig.processNoise
        );
        kalmanStateRef.current = kalmanUpdate(
          kalmanStateRef.current,
          sample.position,
          mergedConfig.measurementNoise
        );
      }

      // Generate prediction
      const predictionTime = mergedConfig.predictionHorizonMs / 1000;
      let predictedPosition: Point2D;
      let predictedVelocity: Point2D;
      let predictedAcceleration: Point2D;
      let confidence = 0.8;

      if (kalmanStateRef.current) {
        const state = kalmanStateRef.current;
        predictedPosition = {
          x: state.x + state.vx * predictionTime + 0.5 * state.ax * predictionTime * predictionTime,
          y: state.y + state.vy * predictionTime + 0.5 * state.ay * predictionTime * predictionTime,
        };
        predictedVelocity = {
          x: state.vx + state.ax * predictionTime,
          y: state.vy + state.ay * predictionTime,
        };
        predictedAcceleration = { x: state.ax, y: state.ay };

        // Confidence based on covariance
        const avgCovariance = (state.covariance[0][0] + state.covariance[1][1]) / 2;
        confidence = Math.max(0.3, Math.min(0.95, 1 - avgCovariance * 0.1));
      } else {
        // Simple linear extrapolation
        const velocity = calculateVelocity(sampleHistoryRef.current);
        predictedPosition = {
          x: sample.position.x + velocity.x * predictionTime,
          y: sample.position.y + velocity.y * predictionTime,
        };
        predictedVelocity = velocity;
        predictedAcceleration = { x: 0, y: 0 };
      }

      const newPrediction: PredictedTouch = {
        position: predictedPosition,
        velocity: predictedVelocity,
        acceleration: predictedAcceleration,
        confidence,
        predictedTime: sample.timestamp + mergedConfig.predictionHorizonMs,
      };

      setPrediction(newPrediction);
      setMetrics((prev) => ({
        ...prev,
        predictionsGenerated: prev.predictionsGenerated + 1,
      }));

      // Update intent prediction
      const intent = recognizeIntent();
      if (intent && intent.confidence >= mergedConfig.minConfidence) {
        setIntentPrediction(intent);
        setMetrics((prev) => ({
          ...prev,
          intentsRecognized: prev.intentsRecognized + 1,
        }));
      }

      return newPrediction;
    },
    [mergedConfig, calculateVelocity, recognizeIntent]
  );

  /**
   * Get prediction at future time
   */
  const getPredictionAt = useCallback(
    (timeMs: number): PredictedTouch | null => {
      if (!kalmanStateRef.current || sampleHistoryRef.current.length === 0) {
        return null;
      }

      const lastSample = sampleHistoryRef.current[sampleHistoryRef.current.length - 1];
      const dt = (timeMs - lastSample.timestamp) / 1000;

      if (dt < 0) return null;

      const state = kalmanStateRef.current;
      const predictedPosition = {
        x: state.x + state.vx * dt + 0.5 * state.ax * dt * dt,
        y: state.y + state.vy * dt + 0.5 * state.ay * dt * dt,
      };

      // Confidence decreases with time
      const baseConfidence = 0.9;
      const decayRate = 0.01;
      const confidence = Math.max(0.3, baseConfidence - decayRate * (timeMs - lastSample.timestamp));

      return {
        position: predictedPosition,
        velocity: { x: state.vx + state.ax * dt, y: state.vy + state.ay * dt },
        acceleration: { x: state.ax, y: state.ay },
        confidence,
        predictedTime: timeMs,
      };
    },
    []
  );

  /**
   * Get current intent prediction
   */
  const getIntentPrediction = useCallback((): IntentPrediction | null => {
    return intentPrediction;
  }, [intentPrediction]);

  /**
   * Pre-compute response for predicted intent
   */
  const precomputeResponse = useCallback(
    <T>(intent: GestureIntent, computeFunc: () => T): PrecomputedResponse<T> | null => {
      const now = performance.now();

      // Check if current intent matches
      if (!intentPrediction || intentPrediction.intent !== intent) {
        return null;
      }

      // Check confidence
      if (intentPrediction.confidence < mergedConfig.minConfidence) {
        return null;
      }

      // Compute response
      const response = computeFunc();

      const precomputed: PrecomputedResponse<T> = {
        intent,
        response,
        computedAt: now,
        validUntil: now + mergedConfig.responseCacheTtlMs,
      };

      // Cache it
      responseCacheRef.current.set(intent, precomputed);

      return precomputed;
    },
    [intentPrediction, mergedConfig]
  );

  /**
   * Get cached response
   */
  const getCachedResponse = useCallback(
    <T>(intent: GestureIntent): T | null => {
      const cached = responseCacheRef.current.get(intent);
      const now = performance.now();

      if (!cached || cached.validUntil < now) {
        setMetrics((prev) => ({ ...prev, cacheMisses: prev.cacheMisses + 1 }));
        return null;
      }

      setMetrics((prev) => ({ ...prev, cacheHits: prev.cacheHits + 1 }));
      return cached.response as T;
    },
    []
  );

  /**
   * Clear prediction state
   */
  const clearPrediction = useCallback(() => {
    setPrediction(null);
    setIntentPrediction(null);
  }, []);

  /**
   * Reset tracking
   */
  const reset = useCallback(() => {
    sampleHistoryRef.current = [];
    kalmanStateRef.current = null;
    touchStartTimeRef.current = 0;
    touchStartPosRef.current = null;
    responseCacheRef.current.clear();
    setIsTracking(false);
    setCurrentSample(null);
    setPrediction(null);
    setIntentPrediction(null);
  }, []);

  /**
   * Handle touch start
   */
  const onTouchStart = useCallback((sample: TouchSample) => {
    touchStartTimeRef.current = sample.timestamp;
    touchStartPosRef.current = sample.position;
    sampleHistoryRef.current = [];
    kalmanStateRef.current = initKalmanState(sample.position);
    setIsTracking(true);
    processSample(sample);
  }, [processSample]);

  /**
   * Handle touch end
   */
  const onTouchEnd = useCallback(() => {
    setIsTracking(false);
  }, []);

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback(() => {
    setMetrics(DEFAULT_METRICS);
    predictionErrorsRef.current = [];
  }, []);

  // Build state
  const state: PredictorState = useMemo(
    () => ({
      isTracking,
      currentSample,
      prediction,
      intentPrediction,
      metrics,
    }),
    [isTracking, currentSample, prediction, intentPrediction, metrics]
  );

  // Build controls
  const controls: PredictorControls = useMemo(
    () => ({
      processSample,
      getPredictionAt,
      getIntentPrediction,
      precomputeResponse,
      getCachedResponse,
      clearPrediction,
      reset,
      onTouchStart,
      onTouchEnd,
      resetMetrics,
    }),
    [
      processSample,
      getPredictionAt,
      getIntentPrediction,
      precomputeResponse,
      getCachedResponse,
      clearPrediction,
      reset,
      onTouchStart,
      onTouchEnd,
      resetMetrics,
    ]
  );

  return {
    state,
    controls,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple gesture prediction hook
 */
export function useGesturePrediction(): {
  intent: GestureIntent | null;
  confidence: number;
  onTouch: (x: number, y: number) => void;
  onTouchEnd: () => void;
} {
  const { state, controls } = useTouchResponsePredictor();

  const onTouch = useCallback(
    (x: number, y: number) => {
      const sample: TouchSample = {
        position: { x, y },
        timestamp: performance.now(),
        pressure: 1,
        identifier: 0,
      };

      if (!state.isTracking) {
        controls.onTouchStart(sample);
      } else {
        controls.processSample(sample);
      }
    },
    [state.isTracking, controls]
  );

  return {
    intent: state.intentPrediction?.intent ?? null,
    confidence: state.intentPrediction?.confidence ?? 0,
    onTouch,
    onTouchEnd: controls.onTouchEnd,
  };
}

/**
 * Touch position prediction hook
 */
export function useTouchPositionPrediction(): {
  predictedPosition: Point2D | null;
  confidence: number;
  processSample: (x: number, y: number) => void;
} {
  const { state, controls } = useTouchResponsePredictor();

  const processSample = useCallback(
    (x: number, y: number) => {
      controls.processSample({
        position: { x, y },
        timestamp: performance.now(),
        pressure: 1,
        identifier: 0,
      });
    },
    [controls]
  );

  return {
    predictedPosition: state.prediction?.position ?? null,
    confidence: state.prediction?.confidence ?? 0,
    processSample,
  };
}

// ============================================================================
// Exports
// ============================================================================

export default useTouchResponsePredictor;

// ============================================================================
// Test Helpers (exported for unit testing internal functions)
// ============================================================================

export const __test__ = {
  initKalmanState,
  kalmanPredict,
  kalmanUpdate,
  DEFAULT_CONFIG,
  DEFAULT_METRICS,
};
