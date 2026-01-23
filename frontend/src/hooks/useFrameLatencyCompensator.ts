/**
 * useFrameLatencyCompensator - Sprint 227
 *
 * Compensates for frame rendering latency by predicting and pre-applying
 * visual transformations. Uses adaptive algorithms to measure actual
 * frame times and compensate accordingly.
 *
 * Features:
 * - Real-time frame latency measurement
 * - Predictive transformation pre-application
 * - Adaptive compensation based on device performance
 * - Jitter smoothing with exponential moving average
 * - Frame drop detection and recovery
 * - VSync alignment optimization
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Frame timing information
 */
export interface FrameTiming {
  frameId: number;
  requestTime: number;
  startTime: number;
  endTime: number;
  duration: number;
  latency: number;
  dropped: boolean;
}

/**
 * Compensation state for visual transformations
 */
export interface CompensationState {
  /** Predicted latency in ms */
  predictedLatency: number;
  /** Compensation offset to apply */
  offsetMs: number;
  /** Current frame rate estimate */
  estimatedFps: number;
  /** Jitter (variance in frame times) */
  jitterMs: number;
  /** Whether VSync is detected */
  vsyncDetected: boolean;
  /** VSync interval if detected */
  vsyncIntervalMs: number;
}

/**
 * Transform to be compensated
 */
export interface CompensatedTransform {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  scale: number;
  rotation: number;
}

/**
 * Compensator configuration
 */
export interface CompensatorConfig {
  /** Target frame time in ms (default: 16.67 for 60fps) */
  targetFrameTimeMs: number;
  /** Smoothing factor for latency estimation (default: 0.2) */
  smoothingFactor: number;
  /** Maximum compensation offset in ms (default: 50) */
  maxCompensationMs: number;
  /** Enable VSync detection (default: true) */
  enableVsyncDetection: boolean;
  /** Frame history length for analysis (default: 30) */
  frameHistoryLength: number;
  /** Jitter threshold for adaptation (default: 5) */
  jitterThresholdMs: number;
  /** Enable adaptive compensation (default: true) */
  enableAdaptiveCompensation: boolean;
  /** Minimum frames before compensation starts (default: 10) */
  minFramesForCompensation: number;
  /** Frame drop threshold multiplier (default: 1.5) */
  frameDropThreshold: number;
}

/**
 * Compensator metrics
 */
export interface CompensatorMetrics {
  totalFrames: number;
  droppedFrames: number;
  dropRate: number;
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  averageFps: number;
  compensationAccuracy: number;
}

/**
 * Compensator state
 */
export interface CompensatorState {
  isRunning: boolean;
  compensation: CompensationState;
  metrics: CompensatorMetrics;
  lastFrameTiming: FrameTiming | null;
}

/**
 * Compensator controls
 */
export interface CompensatorControls {
  /** Start the compensator */
  start: () => void;
  /** Stop the compensator */
  stop: () => void;
  /** Apply compensation to a transform */
  compensate: (transform: CompensatedTransform) => CompensatedTransform;
  /** Record a frame timing manually */
  recordFrame: (timing: Partial<FrameTiming>) => void;
  /** Reset metrics and state */
  reset: () => void;
  /** Get compensated position for given velocity */
  getCompensatedPosition: (
    x: number,
    y: number,
    velocityX: number,
    velocityY: number
  ) => { x: number; y: number };
}

/**
 * Hook return type
 */
export interface UseFrameLatencyCompensatorResult {
  state: CompensatorState;
  controls: CompensatorControls;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONFIG: CompensatorConfig = {
  targetFrameTimeMs: 16.67,
  smoothingFactor: 0.2,
  maxCompensationMs: 50,
  enableVsyncDetection: true,
  frameHistoryLength: 30,
  jitterThresholdMs: 5,
  enableAdaptiveCompensation: true,
  minFramesForCompensation: 10,
  frameDropThreshold: 1.5,
};

const DEFAULT_COMPENSATION: CompensationState = {
  predictedLatency: 16.67,
  offsetMs: 0,
  estimatedFps: 60,
  jitterMs: 0,
  vsyncDetected: false,
  vsyncIntervalMs: 16.67,
};

const DEFAULT_METRICS: CompensatorMetrics = {
  totalFrames: 0,
  droppedFrames: 0,
  dropRate: 0,
  averageLatency: 0,
  maxLatency: 0,
  minLatency: Infinity,
  averageFps: 60,
  compensationAccuracy: 1,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate exponential moving average
 */
function ema(current: number, newValue: number, alpha: number): number {
  return alpha * newValue + (1 - alpha) * current;
}

/**
 * Calculate standard deviation
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Detect VSync interval from frame timings
 */
function detectVsyncInterval(frameTimes: number[]): number | null {
  if (frameTimes.length < 10) return null;

  // Common VSync intervals in ms
  const commonIntervals = [16.67, 13.89, 11.11, 8.33]; // 60, 72, 90, 120 Hz

  const avgFrameTime =
    frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;

  // Find closest common interval
  let closestInterval = commonIntervals[0];
  let minDiff = Math.abs(avgFrameTime - closestInterval);

  for (const interval of commonIntervals) {
    const diff = Math.abs(avgFrameTime - interval);
    if (diff < minDiff) {
      minDiff = diff;
      closestInterval = interval;
    }
  }

  // Only return if close enough to a common interval
  if (minDiff < 2) {
    return closestInterval;
  }

  return null;
}

/**
 * Calculate adaptive compensation based on jitter
 */
function calculateAdaptiveCompensation(
  latency: number,
  jitter: number,
  config: CompensatorConfig
): number {
  // Base compensation is the predicted latency
  let compensation = latency;

  // Add jitter buffer if jitter is high
  if (jitter > config.jitterThresholdMs) {
    compensation += jitter * 0.5;
  }

  // Clamp to max compensation
  return Math.min(compensation, config.maxCompensationMs);
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that compensates for frame rendering latency
 */
export function useFrameLatencyCompensator(
  config: Partial<CompensatorConfig> = {}
): UseFrameLatencyCompensatorResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isRunning, setIsRunning] = useState(false);
  const [compensation, setCompensation] =
    useState<CompensationState>(DEFAULT_COMPENSATION);
  const [metrics, setMetrics] = useState<CompensatorMetrics>(DEFAULT_METRICS);
  const [lastFrameTiming, setLastFrameTiming] = useState<FrameTiming | null>(
    null
  );

  // Refs
  const frameIdRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const frameHistoryRef = useRef<FrameTiming[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);
  const latenciesRef = useRef<number[]>([]);

  /**
   * Process frame timing and update compensation
   */
  const processFrameTiming = useCallback(
    (timing: FrameTiming) => {
      const history = frameHistoryRef.current;
      const frameTimes = frameTimesRef.current;
      const latencies = latenciesRef.current;

      // Add to history
      history.push(timing);
      if (history.length > mergedConfig.frameHistoryLength) {
        history.shift();
      }

      // Track frame times and latencies
      frameTimes.push(timing.duration);
      latencies.push(timing.latency);

      if (frameTimes.length > mergedConfig.frameHistoryLength) {
        frameTimes.shift();
        latencies.shift();
      }

      // Calculate metrics
      const totalFrames = metrics.totalFrames + 1;
      const droppedFrames = metrics.droppedFrames + (timing.dropped ? 1 : 0);
      const dropRate = droppedFrames / totalFrames;

      const avgLatency =
        latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(metrics.maxLatency, timing.latency);
      const minLatency = Math.min(metrics.minLatency, timing.latency);

      const avgFrameTime =
        frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const avgFps = 1000 / avgFrameTime;

      setMetrics({
        totalFrames,
        droppedFrames,
        dropRate,
        averageLatency: avgLatency,
        maxLatency,
        minLatency,
        averageFps: avgFps,
        compensationAccuracy: 1 - dropRate,
      });

      // Update compensation state
      const jitter = standardDeviation(frameTimes);
      const vsyncInterval = mergedConfig.enableVsyncDetection
        ? detectVsyncInterval(frameTimes)
        : null;

      const predictedLatency = ema(
        compensation.predictedLatency,
        timing.latency,
        mergedConfig.smoothingFactor
      );

      const offsetMs = mergedConfig.enableAdaptiveCompensation
        ? calculateAdaptiveCompensation(predictedLatency, jitter, mergedConfig)
        : predictedLatency;

      setCompensation({
        predictedLatency,
        offsetMs,
        estimatedFps: avgFps,
        jitterMs: jitter,
        vsyncDetected: vsyncInterval !== null,
        vsyncIntervalMs: vsyncInterval ?? mergedConfig.targetFrameTimeMs,
      });

      setLastFrameTiming(timing);
    },
    [compensation.predictedLatency, mergedConfig, metrics]
  );

  /**
   * Frame loop for measuring latency
   */
  const frameLoop = useCallback(
    (timestamp: number) => {
      const frameId = ++frameIdRef.current;
      const requestTime = lastFrameTimeRef.current || timestamp;
      const startTime = timestamp;

      // Calculate frame timing
      const duration = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      // Detect dropped frame
      const dropped =
        duration > mergedConfig.targetFrameTimeMs * mergedConfig.frameDropThreshold;

      // Simulate end time (actual rendering happens after this callback)
      const endTime = performance.now();
      const latency = endTime - requestTime;

      const timing: FrameTiming = {
        frameId,
        requestTime,
        startTime,
        endTime,
        duration: duration || mergedConfig.targetFrameTimeMs,
        latency,
        dropped,
      };

      // Only process after first frame
      if (frameIdRef.current > 1) {
        processFrameTiming(timing);
      }

      // Continue loop
      if (isRunning) {
        rafIdRef.current = requestAnimationFrame(frameLoop);
      }
    },
    [isRunning, mergedConfig, processFrameTiming]
  );

  /**
   * Start the compensator
   */
  const start = useCallback(() => {
    if (isRunning) return;

    setIsRunning(true);
    frameIdRef.current = 0;
    lastFrameTimeRef.current = performance.now();
    rafIdRef.current = requestAnimationFrame(frameLoop);
  }, [isRunning, frameLoop]);

  /**
   * Stop the compensator
   */
  const stop = useCallback(() => {
    setIsRunning(false);
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  /**
   * Apply compensation to a transform
   */
  const compensate = useCallback(
    (transform: CompensatedTransform): CompensatedTransform => {
      if (
        metrics.totalFrames < mergedConfig.minFramesForCompensation ||
        compensation.offsetMs === 0
      ) {
        return transform;
      }

      // Convert offset to seconds
      const offsetSec = compensation.offsetMs / 1000;

      return {
        ...transform,
        x: transform.x + transform.velocityX * offsetSec,
        y: transform.y + transform.velocityY * offsetSec,
      };
    },
    [compensation.offsetMs, mergedConfig.minFramesForCompensation, metrics.totalFrames]
  );

  /**
   * Record a frame timing manually
   */
  const recordFrame = useCallback(
    (timing: Partial<FrameTiming>) => {
      const frameId = ++frameIdRef.current;
      const now = performance.now();

      const fullTiming: FrameTiming = {
        frameId,
        requestTime: timing.requestTime ?? now - mergedConfig.targetFrameTimeMs,
        startTime: timing.startTime ?? now,
        endTime: timing.endTime ?? now,
        duration: timing.duration ?? mergedConfig.targetFrameTimeMs,
        latency: timing.latency ?? mergedConfig.targetFrameTimeMs,
        dropped: timing.dropped ?? false,
      };

      processFrameTiming(fullTiming);
    },
    [mergedConfig.targetFrameTimeMs, processFrameTiming]
  );

  /**
   * Reset metrics and state
   */
  const reset = useCallback(() => {
    frameIdRef.current = 0;
    frameHistoryRef.current = [];
    frameTimesRef.current = [];
    latenciesRef.current = [];
    lastFrameTimeRef.current = 0;

    setCompensation(DEFAULT_COMPENSATION);
    setMetrics(DEFAULT_METRICS);
    setLastFrameTiming(null);
  }, []);

  /**
   * Get compensated position for given velocity
   */
  const getCompensatedPosition = useCallback(
    (
      x: number,
      y: number,
      velocityX: number,
      velocityY: number
    ): { x: number; y: number } => {
      if (
        metrics.totalFrames < mergedConfig.minFramesForCompensation ||
        compensation.offsetMs === 0
      ) {
        return { x, y };
      }

      const offsetSec = compensation.offsetMs / 1000;

      return {
        x: x + velocityX * offsetSec,
        y: y + velocityY * offsetSec,
      };
    },
    [compensation.offsetMs, mergedConfig.minFramesForCompensation, metrics.totalFrames]
  );

  // Start/stop based on isRunning changes
  useEffect(() => {
    if (isRunning && rafIdRef.current === null) {
      lastFrameTimeRef.current = performance.now();
      rafIdRef.current = requestAnimationFrame(frameLoop);
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isRunning, frameLoop]);

  // Build state object
  const state: CompensatorState = useMemo(
    () => ({
      isRunning,
      compensation,
      metrics,
      lastFrameTiming,
    }),
    [isRunning, compensation, metrics, lastFrameTiming]
  );

  // Build controls object
  const controls: CompensatorControls = useMemo(
    () => ({
      start,
      stop,
      compensate,
      recordFrame,
      reset,
      getCompensatedPosition,
    }),
    [start, stop, compensate, recordFrame, reset, getCompensatedPosition]
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
 * Hook that provides frame timing information
 */
export function useFrameTiming(): {
  fps: number;
  frameTime: number;
  jitter: number;
} {
  const { state } = useFrameLatencyCompensator();

  return {
    fps: state.compensation.estimatedFps,
    frameTime: state.compensation.vsyncIntervalMs,
    jitter: state.compensation.jitterMs,
  };
}

/**
 * Hook that provides a compensated position updater
 */
export function useCompensatedPosition(
  velocityX: number,
  velocityY: number
): (x: number, y: number) => { x: number; y: number } {
  const { state, controls } = useFrameLatencyCompensator();

  return useCallback(
    (x: number, y: number) => {
      return controls.getCompensatedPosition(x, y, velocityX, velocityY);
    },
    [controls, velocityX, velocityY]
  );
}

// ============================================================================
// Exports
// ============================================================================

export default useFrameLatencyCompensator;
