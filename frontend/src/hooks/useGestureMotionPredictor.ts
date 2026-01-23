/**
 * useGestureMotionPredictor - Gesture-Based Motion Prediction Hook
 *
 * Sprint 521: Predicts avatar motion from user gestures for reduced latency:
 * - Velocity-based motion prediction
 * - Gesture pattern recognition
 * - Kalman filter smoothing
 * - Multi-point trajectory prediction
 * - Confidence-weighted interpolation
 *
 * @example
 * ```tsx
 * const { state, controls, metrics } = useGestureMotionPredictor({
 *   predictionHorizonMs: 100,
 *   smoothingFactor: 0.8,
 * });
 *
 * // Feed gesture points
 * onTouchMove((e) => {
 *   controls.addPoint(e.clientX, e.clientY);
 * });
 *
 * // Get predicted position
 * const predicted = controls.predict(50); // 50ms ahead
 * avatar.moveTo(predicted.x, predicted.y);
 * ```
 */

import { useState, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * 2D point
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Motion point with timestamp and velocity
 */
export interface MotionPoint extends Point2D {
  timestamp: number;
  velocityX: number;
  velocityY: number;
  accelerationX: number;
  accelerationY: number;
}

/**
 * Predicted position
 */
export interface PredictedPosition extends Point2D {
  confidence: number;
  predictedTimestamp: number;
  velocityX: number;
  velocityY: number;
}

/**
 * Gesture type
 */
export type GestureType =
  | "tap"
  | "swipe_left"
  | "swipe_right"
  | "swipe_up"
  | "swipe_down"
  | "pan"
  | "pinch"
  | "rotate"
  | "unknown";

/**
 * Recognized gesture
 */
export interface RecognizedGesture {
  type: GestureType;
  confidence: number;
  direction: number; // Angle in radians
  speed: number; // Pixels per second
  startPoint: Point2D;
  endPoint: Point2D;
  duration: number;
  timestamp: number;
}

/**
 * Trajectory point
 */
export interface TrajectoryPoint extends Point2D {
  t: number; // Normalized time 0-1
  confidence: number;
}

/**
 * Predicted trajectory
 */
export interface PredictedTrajectory {
  points: TrajectoryPoint[];
  gesture: GestureType;
  confidence: number;
  durationMs: number;
}

/**
 * Kalman filter state
 */
export interface KalmanState {
  x: number;
  vx: number;
  y: number;
  vy: number;
  P: number[][]; // Covariance matrix
}

/**
 * Predictor metrics
 */
export interface PredictorMetrics {
  pointsProcessed: number;
  predictionsGenerated: number;
  gesturesRecognized: number;
  avgPredictionConfidence: number;
  avgPredictionErrorPx: number;
  avgLatencySavedMs: number;
  kalmanUpdates: number;
  trajectoryPredictions: number;
}

/**
 * Predictor state
 */
export interface PredictorState {
  isTracking: boolean;
  pointCount: number;
  currentVelocity: Point2D;
  currentAcceleration: Point2D;
  lastGesture: RecognizedGesture | null;
  kalmanState: KalmanState | null;
}

/**
 * Predictor config
 */
export interface PredictorConfig {
  /** Maximum prediction horizon in ms */
  predictionHorizonMs: number;
  /** Smoothing factor for velocity (0-1) */
  smoothingFactor: number;
  /** Point history size */
  historySize: number;
  /** Minimum points for prediction */
  minPointsForPrediction: number;
  /** Enable Kalman filter smoothing */
  enableKalman: boolean;
  /** Kalman process noise */
  kalmanProcessNoise: number;
  /** Kalman measurement noise */
  kalmanMeasurementNoise: number;
  /** Gesture recognition threshold (min speed px/s) */
  gestureThresholdSpeed: number;
  /** Swipe direction threshold (radians from axis) */
  swipeDirectionThreshold: number;
  /** Trajectory sample count */
  trajectorySampleCount: number;
}

/**
 * Predictor controls
 */
export interface PredictorControls {
  /** Add a new point to track */
  addPoint: (x: number, y: number, timestamp?: number) => void;
  /** Clear tracking history */
  clear: () => void;
  /** Predict position at future time */
  predict: (aheadMs: number) => PredictedPosition | null;
  /** Predict full trajectory */
  predictTrajectory: (durationMs: number) => PredictedTrajectory | null;
  /** Get current velocity */
  getVelocity: () => Point2D;
  /** Get current acceleration */
  getAcceleration: () => Point2D;
  /** Recognize gesture from history */
  recognizeGesture: () => RecognizedGesture | null;
  /** Validate prediction accuracy */
  validatePrediction: (predicted: PredictedPosition, actual: Point2D) => number;
  /** Reset metrics */
  resetMetrics: () => void;
  /** Start tracking */
  startTracking: () => void;
  /** Stop tracking */
  stopTracking: () => void;
}

/**
 * Hook result
 */
export interface UseGestureMotionPredictorResult {
  state: PredictorState;
  metrics: PredictorMetrics;
  controls: PredictorControls;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: PredictorConfig = {
  predictionHorizonMs: 100,
  smoothingFactor: 0.8,
  historySize: 20,
  minPointsForPrediction: 3,
  enableKalman: true,
  kalmanProcessNoise: 0.01,
  kalmanMeasurementNoise: 0.1,
  gestureThresholdSpeed: 100, // px/s
  swipeDirectionThreshold: Math.PI / 6, // 30 degrees
  trajectorySampleCount: 10,
};

// ============================================================================
// Utility Functions
// ============================================================================

function createInitialKalmanState(x: number, y: number): KalmanState {
  return {
    x,
    vx: 0,
    y,
    vy: 0,
    P: [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ],
  };
}

function kalmanPredict(
  state: KalmanState,
  dt: number,
  processNoise: number
): KalmanState {
  // State transition: x' = x + vx*dt, vx' = vx (constant velocity model)
  const newX = state.x + state.vx * dt;
  const newY = state.y + state.vy * dt;

  // Process noise matrix Q
  const q = processNoise * dt;
  const Q = [
    [q, 0, 0, 0],
    [0, q, 0, 0],
    [0, 0, q, 0],
    [0, 0, 0, q],
  ];

  // State transition matrix F
  const F = [
    [1, dt, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, dt],
    [0, 0, 0, 1],
  ];

  // P' = F*P*F' + Q
  const newP = state.P.map((row, i) =>
    row.map((_, j) => {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        for (let l = 0; l < 4; l++) {
          sum += F[i][k] * state.P[k][l] * F[j][l];
        }
      }
      return sum + Q[i][j];
    })
  );

  return {
    x: newX,
    vx: state.vx,
    y: newY,
    vy: state.vy,
    P: newP,
  };
}

function kalmanUpdate(
  state: KalmanState,
  measuredX: number,
  measuredY: number,
  measurementNoise: number
): KalmanState {
  // Measurement matrix H (we measure x and y directly)
  const H = [
    [1, 0, 0, 0],
    [0, 0, 1, 0],
  ];

  // Measurement noise R
  const R = [
    [measurementNoise, 0],
    [0, measurementNoise],
  ];

  // Innovation: y = z - H*x
  const innovation = [measuredX - state.x, measuredY - state.y];

  // Innovation covariance: S = H*P*H' + R
  const S = [
    [state.P[0][0] + R[0][0], state.P[0][2]],
    [state.P[2][0], state.P[2][2] + R[1][1]],
  ];

  // Kalman gain: K = P*H'*S^-1
  const det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
  if (Math.abs(det) < 1e-10) return state; // Singular matrix

  const SInv = [
    [S[1][1] / det, -S[0][1] / det],
    [-S[1][0] / det, S[0][0] / det],
  ];

  const K = [
    [state.P[0][0] * SInv[0][0] + state.P[0][2] * SInv[1][0], state.P[0][0] * SInv[0][1] + state.P[0][2] * SInv[1][1]],
    [state.P[1][0] * SInv[0][0] + state.P[1][2] * SInv[1][0], state.P[1][0] * SInv[0][1] + state.P[1][2] * SInv[1][1]],
    [state.P[2][0] * SInv[0][0] + state.P[2][2] * SInv[1][0], state.P[2][0] * SInv[0][1] + state.P[2][2] * SInv[1][1]],
    [state.P[3][0] * SInv[0][0] + state.P[3][2] * SInv[1][0], state.P[3][0] * SInv[0][1] + state.P[3][2] * SInv[1][1]],
  ];

  // Update state: x' = x + K*y
  const newX = state.x + K[0][0] * innovation[0] + K[0][1] * innovation[1];
  const newVx = state.vx + K[1][0] * innovation[0] + K[1][1] * innovation[1];
  const newY = state.y + K[2][0] * innovation[0] + K[2][1] * innovation[1];
  const newVy = state.vy + K[3][0] * innovation[0] + K[3][1] * innovation[1];

  // Update covariance: P' = (I - K*H)*P
  const I_KH = [
    [1 - K[0][0], 0, -K[0][1], 0],
    [-K[1][0], 1, -K[1][1], 0],
    [-K[2][0], 0, 1 - K[2][1], 0],
    [-K[3][0], 0, -K[3][1], 1],
  ];

  const newP = I_KH.map((row, i) =>
    row.map((_, j) => {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += I_KH[i][k] * state.P[k][j];
      }
      return sum;
    })
  );

  return {
    x: newX,
    vx: newVx,
    y: newY,
    vy: newVy,
    P: newP,
  };
}

function identifyGestureType(
  direction: number,
  speed: number,
  threshold: number,
  swipeThreshold: number
): GestureType {
  if (speed < threshold) {
    return "tap";
  }

  // Normalize direction to 0-2PI
  const normalizedDir = ((direction % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  // Right: around 0 or 2PI
  if (normalizedDir < swipeThreshold || normalizedDir > 2 * Math.PI - swipeThreshold) {
    return "swipe_right";
  }

  // Left: around PI
  if (Math.abs(normalizedDir - Math.PI) < swipeThreshold) {
    return "swipe_left";
  }

  // Up: around -PI/2 or 3PI/2
  if (Math.abs(normalizedDir - 3 * Math.PI / 2) < swipeThreshold) {
    return "swipe_up";
  }

  // Down: around PI/2
  if (Math.abs(normalizedDir - Math.PI / 2) < swipeThreshold) {
    return "swipe_down";
  }

  return "pan";
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Gesture-based motion prediction hook
 */
export function useGestureMotionPredictor(
  config: Partial<PredictorConfig> = {},
  callbacks?: {
    onGestureRecognized?: (gesture: RecognizedGesture) => void;
    onPredictionGenerated?: (prediction: PredictedPosition) => void;
    onTrackingStarted?: () => void;
    onTrackingStopped?: () => void;
  }
): UseGestureMotionPredictorResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [isTracking, setIsTracking] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [currentVelocity, setCurrentVelocity] = useState<Point2D>({ x: 0, y: 0 });
  const [currentAcceleration, setCurrentAcceleration] = useState<Point2D>({ x: 0, y: 0 });
  const [lastGesture, setLastGesture] = useState<RecognizedGesture | null>(null);
  const [kalmanState, setKalmanState] = useState<KalmanState | null>(null);

  // Metrics
  const [metrics, setMetrics] = useState<PredictorMetrics>({
    pointsProcessed: 0,
    predictionsGenerated: 0,
    gesturesRecognized: 0,
    avgPredictionConfidence: 0,
    avgPredictionErrorPx: 0,
    avgLatencySavedMs: 0,
    kalmanUpdates: 0,
    trajectoryPredictions: 0,
  });

  // Refs
  const historyRef = useRef<MotionPoint[]>([]);
  const predictionErrorsRef = useRef<number[]>([]);
  const confidencesRef = useRef<number[]>([]);

  /**
   * Add a new point
   */
  const addPoint = useCallback(
    (x: number, y: number, timestamp: number = performance.now()): void => {
      const history = historyRef.current;
      const lastPoint = history.length > 0 ? history[history.length - 1] : null;

      // Calculate velocity
      let velocityX = 0;
      let velocityY = 0;
      let accelerationX = 0;
      let accelerationY = 0;

      if (lastPoint) {
        const dt = (timestamp - lastPoint.timestamp) / 1000; // Convert to seconds
        if (dt > 0) {
          velocityX = (x - lastPoint.x) / dt;
          velocityY = (y - lastPoint.y) / dt;

          // Smooth velocity
          const alpha = fullConfig.smoothingFactor;
          velocityX = alpha * velocityX + (1 - alpha) * lastPoint.velocityX;
          velocityY = alpha * velocityY + (1 - alpha) * lastPoint.velocityY;

          // Calculate acceleration
          accelerationX = (velocityX - lastPoint.velocityX) / dt;
          accelerationY = (velocityY - lastPoint.velocityY) / dt;
        }
      }

      const newPoint: MotionPoint = {
        x,
        y,
        timestamp,
        velocityX,
        velocityY,
        accelerationX,
        accelerationY,
      };

      // Add to history
      history.push(newPoint);
      if (history.length > fullConfig.historySize) {
        history.shift();
      }

      setPointCount(history.length);
      setCurrentVelocity({ x: velocityX, y: velocityY });
      setCurrentAcceleration({ x: accelerationX, y: accelerationY });

      // Update Kalman filter
      if (fullConfig.enableKalman) {
        if (!kalmanState) {
          setKalmanState(createInitialKalmanState(x, y));
        } else {
          const dt = lastPoint ? (timestamp - lastPoint.timestamp) / 1000 : 0.016;
          const predicted = kalmanPredict(kalmanState, dt, fullConfig.kalmanProcessNoise);
          const updated = kalmanUpdate(
            predicted,
            x,
            y,
            fullConfig.kalmanMeasurementNoise
          );
          setKalmanState(updated);
          setMetrics((prev) => ({ ...prev, kalmanUpdates: prev.kalmanUpdates + 1 }));
        }
      }

      setMetrics((prev) => ({ ...prev, pointsProcessed: prev.pointsProcessed + 1 }));
    },
    [fullConfig, kalmanState]
  );

  /**
   * Clear history
   */
  const clear = useCallback((): void => {
    historyRef.current = [];
    setPointCount(0);
    setCurrentVelocity({ x: 0, y: 0 });
    setCurrentAcceleration({ x: 0, y: 0 });
    setKalmanState(null);
    setLastGesture(null);
  }, []);

  /**
   * Predict position
   */
  const predict = useCallback(
    (aheadMs: number): PredictedPosition | null => {
      if (aheadMs > fullConfig.predictionHorizonMs) {
        aheadMs = fullConfig.predictionHorizonMs;
      }

      const history = historyRef.current;
      if (history.length < fullConfig.minPointsForPrediction) {
        return null;
      }

      const latest = history[history.length - 1];
      const aheadSec = aheadMs / 1000;

      let predictedX: number;
      let predictedY: number;
      let confidence: number;

      if (fullConfig.enableKalman && kalmanState) {
        // Use Kalman prediction
        const predicted = kalmanPredict(
          kalmanState,
          aheadSec,
          fullConfig.kalmanProcessNoise
        );
        predictedX = predicted.x;
        predictedY = predicted.y;

        // Confidence based on Kalman covariance
        const variance = predicted.P[0][0] + predicted.P[2][2];
        confidence = Math.max(0, 1 - Math.sqrt(variance) / 100);
      } else {
        // Simple velocity-based prediction with acceleration correction
        predictedX =
          latest.x +
          latest.velocityX * aheadSec +
          0.5 * latest.accelerationX * aheadSec * aheadSec;
        predictedY =
          latest.y +
          latest.velocityY * aheadSec +
          0.5 * latest.accelerationY * aheadSec * aheadSec;

        // Confidence decreases with prediction horizon and velocity variance
        const velocityMagnitude = Math.sqrt(
          latest.velocityX ** 2 + latest.velocityY ** 2
        );
        const horizonFactor = 1 - aheadMs / fullConfig.predictionHorizonMs;
        const velocityFactor = Math.min(1, velocityMagnitude / 1000);
        confidence = horizonFactor * 0.7 + velocityFactor * 0.3;
      }

      const result: PredictedPosition = {
        x: predictedX,
        y: predictedY,
        confidence,
        predictedTimestamp: latest.timestamp + aheadMs,
        velocityX: latest.velocityX,
        velocityY: latest.velocityY,
      };

      // Track metrics
      confidencesRef.current.push(confidence);
      if (confidencesRef.current.length > 100) {
        confidencesRef.current.shift();
      }

      setMetrics((prev) => ({
        ...prev,
        predictionsGenerated: prev.predictionsGenerated + 1,
        avgPredictionConfidence:
          confidencesRef.current.reduce((a, b) => a + b, 0) /
          confidencesRef.current.length,
        avgLatencySavedMs: aheadMs,
      }));

      callbacks?.onPredictionGenerated?.(result);

      return result;
    },
    [fullConfig, kalmanState, callbacks]
  );

  /**
   * Predict trajectory
   */
  const predictTrajectory = useCallback(
    (durationMs: number): PredictedTrajectory | null => {
      const history = historyRef.current;
      if (history.length < fullConfig.minPointsForPrediction) {
        return null;
      }

      const sampleCount = fullConfig.trajectorySampleCount;
      const points: TrajectoryPoint[] = [];

      for (let i = 0; i <= sampleCount; i++) {
        const t = i / sampleCount;
        const aheadMs = t * Math.min(durationMs, fullConfig.predictionHorizonMs);
        const predicted = predict(aheadMs);

        if (predicted) {
          points.push({
            x: predicted.x,
            y: predicted.y,
            t,
            confidence: predicted.confidence,
          });
        }
      }

      if (points.length === 0) {
        return null;
      }

      // Recognize gesture from trajectory
      const gesture = recognizeGesture();
      const avgConfidence =
        points.reduce((sum, p) => sum + p.confidence, 0) / points.length;

      setMetrics((prev) => ({
        ...prev,
        trajectoryPredictions: prev.trajectoryPredictions + 1,
      }));

      return {
        points,
        gesture: gesture?.type || "unknown",
        confidence: avgConfidence,
        durationMs,
      };
    },
    [fullConfig, predict]
  );

  /**
   * Get velocity
   */
  const getVelocity = useCallback((): Point2D => {
    return currentVelocity;
  }, [currentVelocity]);

  /**
   * Get acceleration
   */
  const getAcceleration = useCallback((): Point2D => {
    return currentAcceleration;
  }, [currentAcceleration]);

  /**
   * Recognize gesture
   */
  const recognizeGesture = useCallback((): RecognizedGesture | null => {
    const history = historyRef.current;
    if (history.length < 2) {
      return null;
    }

    const first = history[0];
    const last = history[history.length - 1];

    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const duration = last.timestamp - first.timestamp;
    const speed = duration > 0 ? (distance / duration) * 1000 : 0; // px/s
    const direction = Math.atan2(dy, dx);

    const gestureType = identifyGestureType(
      direction,
      speed,
      fullConfig.gestureThresholdSpeed,
      fullConfig.swipeDirectionThreshold
    );

    // Confidence based on consistency and speed
    let confidence = 0.5;
    if (speed > fullConfig.gestureThresholdSpeed) {
      confidence += 0.3;
    }
    if (history.length >= fullConfig.minPointsForPrediction) {
      confidence += 0.2;
    }
    confidence = Math.min(1, confidence);

    const gesture: RecognizedGesture = {
      type: gestureType,
      confidence,
      direction,
      speed,
      startPoint: { x: first.x, y: first.y },
      endPoint: { x: last.x, y: last.y },
      duration,
      timestamp: Date.now(),
    };

    setLastGesture(gesture);
    setMetrics((prev) => ({
      ...prev,
      gesturesRecognized: prev.gesturesRecognized + 1,
    }));

    callbacks?.onGestureRecognized?.(gesture);

    return gesture;
  }, [fullConfig, callbacks]);

  /**
   * Validate prediction
   */
  const validatePrediction = useCallback(
    (predicted: PredictedPosition, actual: Point2D): number => {
      const dx = predicted.x - actual.x;
      const dy = predicted.y - actual.y;
      const errorPx = Math.sqrt(dx * dx + dy * dy);

      predictionErrorsRef.current.push(errorPx);
      if (predictionErrorsRef.current.length > 100) {
        predictionErrorsRef.current.shift();
      }

      const avgError =
        predictionErrorsRef.current.reduce((a, b) => a + b, 0) /
        predictionErrorsRef.current.length;

      setMetrics((prev) => ({
        ...prev,
        avgPredictionErrorPx: avgError,
      }));

      return errorPx;
    },
    []
  );

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback((): void => {
    setMetrics({
      pointsProcessed: 0,
      predictionsGenerated: 0,
      gesturesRecognized: 0,
      avgPredictionConfidence: 0,
      avgPredictionErrorPx: 0,
      avgLatencySavedMs: 0,
      kalmanUpdates: 0,
      trajectoryPredictions: 0,
    });
    predictionErrorsRef.current = [];
    confidencesRef.current = [];
  }, []);

  /**
   * Start tracking
   */
  const startTracking = useCallback((): void => {
    clear();
    setIsTracking(true);
    callbacks?.onTrackingStarted?.();
  }, [clear, callbacks]);

  /**
   * Stop tracking
   */
  const stopTracking = useCallback((): void => {
    setIsTracking(false);
    callbacks?.onTrackingStopped?.();
  }, [callbacks]);

  // Compile state
  const state: PredictorState = useMemo(
    () => ({
      isTracking,
      pointCount,
      currentVelocity,
      currentAcceleration,
      lastGesture,
      kalmanState,
    }),
    [isTracking, pointCount, currentVelocity, currentAcceleration, lastGesture, kalmanState]
  );

  // Compile controls
  const controls: PredictorControls = useMemo(
    () => ({
      addPoint,
      clear,
      predict,
      predictTrajectory,
      getVelocity,
      getAcceleration,
      recognizeGesture,
      validatePrediction,
      resetMetrics,
      startTracking,
      stopTracking,
    }),
    [
      addPoint,
      clear,
      predict,
      predictTrajectory,
      getVelocity,
      getAcceleration,
      recognizeGesture,
      validatePrediction,
      resetMetrics,
      startTracking,
      stopTracking,
    ]
  );

  return {
    state,
    metrics,
    controls,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple motion prediction hook
 */
export function useSimpleMotionPredictor(): {
  addPoint: (x: number, y: number) => void;
  predict: (aheadMs: number) => Point2D | null;
  clear: () => void;
} {
  const { controls } = useGestureMotionPredictor({
    enableKalman: false,
    minPointsForPrediction: 2,
  });

  const predict = useCallback(
    (aheadMs: number): Point2D | null => {
      const result = controls.predict(aheadMs);
      return result ? { x: result.x, y: result.y } : null;
    },
    [controls]
  );

  return {
    addPoint: controls.addPoint,
    predict,
    clear: controls.clear,
  };
}

/**
 * Gesture-only recognition hook
 */
export function useGestureRecognition(
  onGesture?: (gesture: RecognizedGesture) => void
): {
  addPoint: (x: number, y: number) => void;
  recognizeGesture: () => RecognizedGesture | null;
  clear: () => void;
  lastGesture: RecognizedGesture | null;
} {
  const { state, controls } = useGestureMotionPredictor(
    { enableKalman: false },
    { onGestureRecognized: onGesture }
  );

  return {
    addPoint: controls.addPoint,
    recognizeGesture: controls.recognizeGesture,
    clear: controls.clear,
    lastGesture: state.lastGesture,
  };
}

/**
 * Kalman-filtered position hook
 */
export function useKalmanPosition(): {
  addMeasurement: (x: number, y: number) => void;
  getFilteredPosition: () => Point2D | null;
  getFilteredVelocity: () => Point2D | null;
} {
  const { state, controls } = useGestureMotionPredictor({
    enableKalman: true,
    smoothingFactor: 0.9,
  });

  const getFilteredPosition = useCallback((): Point2D | null => {
    if (!state.kalmanState) return null;
    return { x: state.kalmanState.x, y: state.kalmanState.y };
  }, [state.kalmanState]);

  const getFilteredVelocity = useCallback((): Point2D | null => {
    if (!state.kalmanState) return null;
    return { x: state.kalmanState.vx, y: state.kalmanState.vy };
  }, [state.kalmanState]);

  return {
    addMeasurement: controls.addPoint,
    getFilteredPosition,
    getFilteredVelocity,
  };
}

export default useGestureMotionPredictor;
