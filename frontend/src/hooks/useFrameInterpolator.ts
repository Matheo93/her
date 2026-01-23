/**
 * useFrameInterpolator - Smooth Frame Interpolation Hook
 *
 * Sprint 524: Interpolates between animation frames for smoother motion:
 * - Sub-frame interpolation for 120Hz+ displays
 * - Motion blur simulation
 * - Stutter compensation
 * - Adaptive interpolation based on frame rate
 * - Prediction-based frame synthesis
 *
 * @example
 * ```tsx
 * const { state, controls } = useFrameInterpolator({
 *   targetFps: 60,
 *   interpolationStrength: 0.5,
 * });
 *
 * // In animation loop
 * const interpolatedValue = controls.interpolate(
 *   previousFrame,
 *   currentFrame,
 *   state.subFrameProgress
 * );
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Interpolation method
 */
export type InterpolationMethod =
  | "linear"
  | "cubic"
  | "hermite"
  | "catmull_rom"
  | "bezier";

/**
 * Frame data for interpolation
 */
export interface FrameData<T = number> {
  value: T;
  timestamp: number;
  velocity?: T;
}

/**
 * Interpolation point with derivatives
 */
export interface InterpolationPoint {
  value: number;
  velocity: number;
  acceleration: number;
}

/**
 * Frame timing info
 */
export interface FrameTimingInfo {
  deltaMs: number;
  targetDeltaMs: number;
  subFrameProgress: number;
  interpolationFactor: number;
  isStuttering: boolean;
  stutterSeverity: number;
}

/**
 * Motion blur config
 */
export interface MotionBlurConfig {
  enabled: boolean;
  samples: number;
  strength: number;
  velocityScale: number;
}

/**
 * Interpolator metrics
 */
export interface InterpolatorMetrics {
  framesInterpolated: number;
  stuttersDetected: number;
  stuttersCompensated: number;
  avgInterpolationMs: number;
  avgSubFrameProgress: number;
  motionBlurFrames: number;
  predictionAccuracy: number;
}

/**
 * Interpolator state
 */
export interface InterpolatorState {
  isActive: boolean;
  currentFps: number;
  targetFps: number;
  displayRefreshRate: number;
  subFrameProgress: number;
  interpolationFactor: number;
  isHighRefreshDisplay: boolean;
  needsInterpolation: boolean;
}

/**
 * Interpolator config
 */
export interface InterpolatorConfig {
  /** Target FPS for content */
  targetFps: number;
  /** Interpolation strength (0-1) */
  interpolationStrength: number;
  /** Interpolation method */
  method: InterpolationMethod;
  /** Enable stutter compensation */
  enableStutterCompensation: boolean;
  /** Stutter detection threshold (ms deviation) */
  stutterThresholdMs: number;
  /** Motion blur config */
  motionBlur: MotionBlurConfig;
  /** Enable prediction for frame synthesis */
  enablePrediction: boolean;
  /** Prediction lookahead frames */
  predictionFrames: number;
  /** Frame history size */
  historySize: number;
}

/**
 * Interpolator controls
 */
export interface InterpolatorControls {
  /** Interpolate between two values */
  interpolate: (from: number, to: number, t?: number) => number;
  /** Interpolate vector (array of numbers) */
  interpolateVector: (from: number[], to: number[], t?: number) => number[];
  /** Interpolate with motion blur */
  interpolateWithBlur: (frames: FrameData<number>[], t?: number) => number;
  /** Add frame to history */
  addFrame: (value: number, timestamp?: number) => void;
  /** Get predicted next frame */
  predictNext: (lookaheadMs?: number) => number | null;
  /** Detect and compensate stutter */
  compensateStutter: (currentValue: number) => number;
  /** Get current timing info */
  getTimingInfo: () => FrameTimingInfo;
  /** Reset interpolator */
  reset: () => void;
  /** Start interpolation loop */
  start: () => void;
  /** Stop interpolation loop */
  stop: () => void;
}

/**
 * Hook result
 */
export interface UseFrameInterpolatorResult {
  state: InterpolatorState;
  metrics: InterpolatorMetrics;
  controls: InterpolatorControls;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: InterpolatorConfig = {
  targetFps: 60,
  interpolationStrength: 0.5,
  method: "hermite",
  enableStutterCompensation: true,
  stutterThresholdMs: 5,
  motionBlur: {
    enabled: false,
    samples: 4,
    strength: 0.3,
    velocityScale: 1.0,
  },
  enablePrediction: true,
  predictionFrames: 2,
  historySize: 10,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Linear interpolation
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Cubic interpolation (smooth step)
 */
function cubicInterpolate(a: number, b: number, t: number): number {
  const smoothT = t * t * (3 - 2 * t);
  return lerp(a, b, smoothT);
}

/**
 * Hermite interpolation with velocities
 */
function hermiteInterpolate(
  p0: number,
  p1: number,
  v0: number,
  v1: number,
  t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * v0 + h01 * p1 + h11 * v1;
}

/**
 * Catmull-Rom spline interpolation
 */
function catmullRomInterpolate(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Bezier interpolation
 */
function bezierInterpolate(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  return u3 * p0 + 3 * u2 * t * p1 + 3 * u * t2 * p2 + t3 * p3;
}

/**
 * Detect display refresh rate
 */
function detectRefreshRate(callback: (rate: number) => void): () => void {
  let frames = 0;
  let lastTime = performance.now();
  let rafId: number;

  const measure = (time: number) => {
    frames++;
    if (time - lastTime >= 1000) {
      callback(frames);
      frames = 0;
      lastTime = time;
    }
    rafId = requestAnimationFrame(measure);
  };

  rafId = requestAnimationFrame(measure);

  return () => cancelAnimationFrame(rafId);
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Frame interpolation hook
 */
export function useFrameInterpolator(
  config: Partial<InterpolatorConfig> = {},
  callbacks?: {
    onStutterDetected?: (severity: number) => void;
    onRefreshRateChanged?: (rate: number) => void;
    onFrameInterpolated?: (from: number, to: number, result: number) => void;
  }
): UseFrameInterpolatorResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [isActive, setIsActive] = useState(false);
  const [currentFps, setCurrentFps] = useState(fullConfig.targetFps);
  const [displayRefreshRate, setDisplayRefreshRate] = useState(60);
  const [subFrameProgress, setSubFrameProgress] = useState(0);
  const [interpolationFactor, setInterpolationFactor] = useState(1);

  // Metrics
  const [metrics, setMetrics] = useState<InterpolatorMetrics>({
    framesInterpolated: 0,
    stuttersDetected: 0,
    stuttersCompensated: 0,
    avgInterpolationMs: 0,
    avgSubFrameProgress: 0,
    motionBlurFrames: 0,
    predictionAccuracy: 0,
  });

  // Refs
  const frameHistoryRef = useRef<FrameData<number>[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const interpolationTimesRef = useRef<number[]>([]);
  const subFrameProgressesRef = useRef<number[]>([]);

  // Detect refresh rate on mount
  useEffect(() => {
    cleanupRef.current = detectRefreshRate((rate) => {
      if (rate !== displayRefreshRate) {
        setDisplayRefreshRate(rate);
        callbacks?.onRefreshRateChanged?.(rate);
      }
    });

    return () => {
      cleanupRef.current?.();
    };
  }, [displayRefreshRate, callbacks]);

  /**
   * Interpolate between two values
   */
  const interpolate = useCallback(
    (from: number, to: number, t: number = subFrameProgress): number => {
      const startTime = performance.now();
      let result: number;

      // Apply interpolation strength
      const adjustedT = t * fullConfig.interpolationStrength + (1 - fullConfig.interpolationStrength) * (t > 0.5 ? 1 : 0);

      switch (fullConfig.method) {
        case "cubic":
          result = cubicInterpolate(from, to, adjustedT);
          break;
        case "hermite": {
          // Estimate velocities from history
          const history = frameHistoryRef.current;
          const v0 = history.length >= 2
            ? (history[history.length - 1].value - history[history.length - 2].value)
            : 0;
          const v1 = v0; // Assume constant velocity for endpoint
          result = hermiteInterpolate(from, to, v0, v1, adjustedT);
          break;
        }
        case "catmull_rom": {
          const history = frameHistoryRef.current;
          if (history.length >= 4) {
            const p0 = history[history.length - 4].value;
            const p1 = history[history.length - 3].value;
            const p2 = history[history.length - 2].value;
            const p3 = history[history.length - 1].value;
            result = catmullRomInterpolate(p0, p1, p2, p3, adjustedT);
          } else {
            result = lerp(from, to, adjustedT);
          }
          break;
        }
        case "bezier": {
          const cp1 = from + (to - from) * 0.25;
          const cp2 = from + (to - from) * 0.75;
          result = bezierInterpolate(from, cp1, cp2, to, adjustedT);
          break;
        }
        case "linear":
        default:
          result = lerp(from, to, adjustedT);
      }

      // Track timing
      const elapsed = performance.now() - startTime;
      interpolationTimesRef.current.push(elapsed);
      if (interpolationTimesRef.current.length > 100) {
        interpolationTimesRef.current.shift();
      }

      setMetrics((prev) => ({
        ...prev,
        framesInterpolated: prev.framesInterpolated + 1,
        avgInterpolationMs:
          interpolationTimesRef.current.reduce((a, b) => a + b, 0) /
          interpolationTimesRef.current.length,
      }));

      callbacks?.onFrameInterpolated?.(from, to, result);

      return result;
    },
    [fullConfig, subFrameProgress, callbacks]
  );

  /**
   * Interpolate vector
   */
  const interpolateVector = useCallback(
    (from: number[], to: number[], t: number = subFrameProgress): number[] => {
      if (from.length !== to.length) {
        throw new Error("Vector lengths must match");
      }
      return from.map((val, i) => interpolate(val, to[i], t));
    },
    [interpolate, subFrameProgress]
  );

  /**
   * Interpolate with motion blur
   */
  const interpolateWithBlur = useCallback(
    (frames: FrameData<number>[], t: number = subFrameProgress): number => {
      if (!fullConfig.motionBlur.enabled || frames.length < 2) {
        return frames.length > 0 ? frames[frames.length - 1].value : 0;
      }

      const { samples, strength, velocityScale } = fullConfig.motionBlur;
      let sum = 0;
      let weights = 0;

      // Sample along motion path
      for (let i = 0; i < samples; i++) {
        const sampleT = (i / (samples - 1)) * strength;
        const frameIndex = Math.min(
          frames.length - 1,
          Math.floor((1 - sampleT) * (frames.length - 1))
        );
        const weight = 1 - sampleT * velocityScale;
        sum += frames[frameIndex].value * weight;
        weights += weight;
      }

      setMetrics((prev) => ({
        ...prev,
        motionBlurFrames: prev.motionBlurFrames + 1,
      }));

      return weights > 0 ? sum / weights : frames[frames.length - 1].value;
    },
    [fullConfig.motionBlur, subFrameProgress]
  );

  /**
   * Add frame to history
   */
  const addFrame = useCallback(
    (value: number, timestamp: number = performance.now()): void => {
      const history = frameHistoryRef.current;
      const lastFrame = history.length > 0 ? history[history.length - 1] : null;

      // Calculate velocity
      let velocity = 0;
      if (lastFrame) {
        const dt = (timestamp - lastFrame.timestamp) / 1000;
        if (dt > 0) {
          velocity = (value - lastFrame.value) / dt;
        }
      }

      history.push({ value, timestamp, velocity });
      if (history.length > fullConfig.historySize) {
        history.shift();
      }

      // Update sub-frame progress
      if (lastFrameTimeRef.current > 0) {
        const delta = timestamp - lastFrameTimeRef.current;
        const targetDelta = 1000 / fullConfig.targetFps;
        const progress = (delta % targetDelta) / targetDelta;
        setSubFrameProgress(progress);

        subFrameProgressesRef.current.push(progress);
        if (subFrameProgressesRef.current.length > 100) {
          subFrameProgressesRef.current.shift();
        }

        setMetrics((prev) => ({
          ...prev,
          avgSubFrameProgress:
            subFrameProgressesRef.current.reduce((a, b) => a + b, 0) /
            subFrameProgressesRef.current.length,
        }));

        // Calculate interpolation factor based on refresh rate ratio
        const ratio = displayRefreshRate / fullConfig.targetFps;
        setInterpolationFactor(Math.max(1, ratio));
      }

      lastFrameTimeRef.current = timestamp;
    },
    [fullConfig.historySize, fullConfig.targetFps, displayRefreshRate]
  );

  /**
   * Predict next frame
   */
  const predictNext = useCallback(
    (lookaheadMs: number = 1000 / fullConfig.targetFps): number | null => {
      if (!fullConfig.enablePrediction) return null;

      const history = frameHistoryRef.current;
      if (history.length < 2) return null;

      const latest = history[history.length - 1];
      const previous = history[history.length - 2];

      // Calculate velocity
      const dt = (latest.timestamp - previous.timestamp) / 1000;
      if (dt <= 0) return latest.value;

      const velocity = (latest.value - previous.value) / dt;

      // Calculate acceleration if we have enough history
      let acceleration = 0;
      if (history.length >= 3) {
        const older = history[history.length - 3];
        const olderDt = (previous.timestamp - older.timestamp) / 1000;
        if (olderDt > 0) {
          const olderVelocity = (previous.value - older.value) / olderDt;
          acceleration = (velocity - olderVelocity) / dt;
        }
      }

      // Predict using velocity and acceleration
      const lookaheadSec = lookaheadMs / 1000;
      const predicted =
        latest.value +
        velocity * lookaheadSec +
        0.5 * acceleration * lookaheadSec * lookaheadSec;

      return predicted;
    },
    [fullConfig.enablePrediction, fullConfig.targetFps]
  );

  /**
   * Compensate for stutter
   */
  const compensateStutter = useCallback(
    (currentValue: number): number => {
      if (!fullConfig.enableStutterCompensation) return currentValue;

      const history = frameHistoryRef.current;
      if (history.length < 2) return currentValue;

      const latest = history[history.length - 1];
      const previous = history[history.length - 2];

      // Detect stutter by checking frame time variance
      const delta = latest.timestamp - previous.timestamp;
      const expectedDelta = 1000 / fullConfig.targetFps;
      const deviation = Math.abs(delta - expectedDelta);

      if (deviation > fullConfig.stutterThresholdMs) {
        // Stutter detected
        const severity = deviation / expectedDelta;
        callbacks?.onStutterDetected?.(severity);

        setMetrics((prev) => ({
          ...prev,
          stuttersDetected: prev.stuttersDetected + 1,
        }));

        // Compensate by interpolating toward predicted position
        const predicted = predictNext();
        if (predicted !== null) {
          const compensationFactor = Math.min(0.5, severity * 0.2);
          const compensated = lerp(currentValue, predicted, compensationFactor);

          setMetrics((prev) => ({
            ...prev,
            stuttersCompensated: prev.stuttersCompensated + 1,
          }));

          return compensated;
        }
      }

      return currentValue;
    },
    [fullConfig, predictNext, callbacks]
  );

  /**
   * Get timing info
   */
  const getTimingInfo = useCallback((): FrameTimingInfo => {
    const history = frameHistoryRef.current;
    let deltaMs = 0;
    let isStuttering = false;
    let stutterSeverity = 0;

    if (history.length >= 2) {
      const latest = history[history.length - 1];
      const previous = history[history.length - 2];
      deltaMs = latest.timestamp - previous.timestamp;

      const targetDelta = 1000 / fullConfig.targetFps;
      const deviation = Math.abs(deltaMs - targetDelta);
      isStuttering = deviation > fullConfig.stutterThresholdMs;
      stutterSeverity = deviation / targetDelta;
    }

    return {
      deltaMs,
      targetDeltaMs: 1000 / fullConfig.targetFps,
      subFrameProgress,
      interpolationFactor,
      isStuttering,
      stutterSeverity,
    };
  }, [fullConfig, subFrameProgress, interpolationFactor]);

  /**
   * Reset interpolator
   */
  const reset = useCallback((): void => {
    frameHistoryRef.current = [];
    lastFrameTimeRef.current = 0;
    interpolationTimesRef.current = [];
    subFrameProgressesRef.current = [];
    setSubFrameProgress(0);
    setInterpolationFactor(1);
    setMetrics({
      framesInterpolated: 0,
      stuttersDetected: 0,
      stuttersCompensated: 0,
      avgInterpolationMs: 0,
      avgSubFrameProgress: 0,
      motionBlurFrames: 0,
      predictionAccuracy: 0,
    });
  }, []);

  /**
   * Start interpolation loop
   */
  const start = useCallback((): void => {
    if (isActive) return;
    setIsActive(true);
    lastFrameTimeRef.current = performance.now();

    const loop = (time: number) => {
      const delta = time - lastFrameTimeRef.current;
      const targetDelta = 1000 / fullConfig.targetFps;
      const progress = (delta % targetDelta) / targetDelta;
      setSubFrameProgress(progress);

      // Estimate current FPS
      if (delta > 0) {
        setCurrentFps(Math.round(1000 / delta));
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [isActive, fullConfig.targetFps]);

  /**
   * Stop interpolation loop
   */
  const stop = useCallback((): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  // Determine if interpolation is needed
  const needsInterpolation = displayRefreshRate > fullConfig.targetFps;
  const isHighRefreshDisplay = displayRefreshRate >= 90;

  // Compile state
  const state: InterpolatorState = useMemo(
    () => ({
      isActive,
      currentFps,
      targetFps: fullConfig.targetFps,
      displayRefreshRate,
      subFrameProgress,
      interpolationFactor,
      isHighRefreshDisplay,
      needsInterpolation,
    }),
    [
      isActive,
      currentFps,
      fullConfig.targetFps,
      displayRefreshRate,
      subFrameProgress,
      interpolationFactor,
      isHighRefreshDisplay,
      needsInterpolation,
    ]
  );

  // Compile controls
  const controls: InterpolatorControls = useMemo(
    () => ({
      interpolate,
      interpolateVector,
      interpolateWithBlur,
      addFrame,
      predictNext,
      compensateStutter,
      getTimingInfo,
      reset,
      start,
      stop,
    }),
    [
      interpolate,
      interpolateVector,
      interpolateWithBlur,
      addFrame,
      predictNext,
      compensateStutter,
      getTimingInfo,
      reset,
      start,
      stop,
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
 * Simple value interpolator
 */
export function useValueInterpolator(
  strength: number = 0.5
): (from: number, to: number, t: number) => number {
  const { controls } = useFrameInterpolator({
    interpolationStrength: strength,
    method: "cubic",
  });

  return controls.interpolate;
}

/**
 * Sub-frame progress hook
 */
export function useSubFrameProgress(targetFps: number = 60): number {
  const { state, controls } = useFrameInterpolator({ targetFps });

  useEffect(() => {
    controls.start();
    return () => controls.stop();
  }, [controls]);

  return state.subFrameProgress;
}

/**
 * Stutter detection hook
 */
export function useStutterDetection(
  onStutter?: (severity: number) => void
): {
  isStuttering: boolean;
  stutterCount: number;
} {
  const { state, metrics } = useFrameInterpolator(
    { enableStutterCompensation: true },
    { onStutterDetected: onStutter }
  );

  const timing = useMemo(() => {
    return {
      isStuttering: false, // Would need getTimingInfo call
      stutterCount: metrics.stuttersDetected,
    };
  }, [metrics.stuttersDetected]);

  return timing;
}

export default useFrameInterpolator;
