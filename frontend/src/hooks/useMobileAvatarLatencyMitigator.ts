/**
 * useMobileAvatarLatencyMitigator - Mobile Avatar Latency Mitigation Hook
 *
 * Sprint 516: Combines multiple latency reduction techniques for mobile avatar UX:
 * - Frame-perfect animation scheduling
 * - Predictive pose interpolation
 * - Gesture response acceleration
 * - Render pipeline optimization
 * - Touch-to-visual latency reduction
 *
 * @example
 * ```tsx
 * const { controls, state, metrics } = useMobileAvatarLatencyMitigator({
 *   targetFrameTimeMs: 16.67, // 60fps target
 *   touchResponseTarget: 50,   // 50ms touch-to-visual
 * });
 *
 * // Apply mitigated pose
 * const smoothPose = controls.interpolatePose(currentPose, targetPose);
 *
 * // Measure actual latency
 * controls.markTouchStart();
 * // ... avatar responds ...
 * controls.markVisualUpdate();
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Avatar pose for interpolation
 */
export interface AvatarPose {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  blendShapes?: Record<string, number>;
  timestamp: number;
}

/**
 * Latency measurement point
 */
export interface LatencyPoint {
  id: string;
  type: "touch_start" | "input_received" | "pose_calculated" | "render_start" | "visual_update";
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Frame timing info
 */
export interface FrameTiming {
  frameNumber: number;
  deltaMs: number;
  expectedDeltaMs: number;
  jitterMs: number;
  missedFrames: number;
  timestamp: number;
}

/**
 * Touch-to-visual latency measurement
 */
export interface TouchLatency {
  touchToInput: number;
  inputToPose: number;
  poseToRender: number;
  renderToVisual: number;
  totalLatency: number;
  timestamp: number;
}

/**
 * Interpolation mode
 */
export type InterpolationMode = "linear" | "easeOut" | "spring" | "predictive";

/**
 * Mitigation strategy
 */
export type MitigationStrategy =
  | "conservative"
  | "balanced"
  | "aggressive"
  | "adaptive";

/**
 * Prediction confidence
 */
export interface PredictionConfidence {
  position: number;
  rotation: number;
  blendShapes: number;
  overall: number;
}

/**
 * Mitigation state
 */
export interface MitigatorState {
  isActive: boolean;
  currentStrategy: MitigationStrategy;
  interpolationMode: InterpolationMode;
  averageLatencyMs: number;
  frameTiming: FrameTiming | null;
  isMeasuring: boolean;
  predictionConfidence: PredictionConfidence;
}

/**
 * Mitigation metrics
 */
export interface MitigatorMetrics {
  touchLatencies: TouchLatency[];
  averageTouchLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  totalMeasurements: number;
  missedFrames: number;
  jitterAvgMs: number;
  predictionsUsed: number;
  predictionAccuracy: number;
  frameDropRate: number;
}

/**
 * Mitigation config
 */
export interface MitigatorConfig {
  /** Target frame time in ms (16.67 for 60fps) */
  targetFrameTimeMs: number;
  /** Target touch-to-visual latency in ms */
  touchResponseTarget: number;
  /** Interpolation mode */
  interpolationMode: InterpolationMode;
  /** Mitigation strategy */
  strategy: MitigationStrategy;
  /** Maximum prediction time in ms */
  maxPredictionMs: number;
  /** Pose history size for prediction */
  poseHistorySize: number;
  /** Enable frame timing monitoring */
  monitorFrameTiming: boolean;
  /** Latency sample window size */
  latencySampleWindow: number;
  /** Spring stiffness for spring interpolation */
  springStiffness: number;
  /** Spring damping for spring interpolation */
  springDamping: number;
  /** Adaptive strategy threshold (ms) */
  adaptiveThreshold: number;
}

/**
 * Mitigation controls
 */
export interface MitigatorControls {
  /** Interpolate between two poses */
  interpolatePose: (from: AvatarPose, to: AvatarPose, t: number) => AvatarPose;
  /** Predict next pose based on history */
  predictPose: (poseHistory: AvatarPose[], deltaMs: number) => AvatarPose | null;
  /** Mark touch start for latency measurement */
  markTouchStart: (id?: string) => string;
  /** Mark input received */
  markInputReceived: (id: string) => void;
  /** Mark pose calculated */
  markPoseCalculated: (id: string) => void;
  /** Mark render start */
  markRenderStart: (id: string) => void;
  /** Mark visual update (end measurement) */
  markVisualUpdate: (id: string) => TouchLatency | null;
  /** Update strategy based on current conditions */
  updateStrategy: (strategy: MitigationStrategy) => void;
  /** Set interpolation mode */
  setInterpolationMode: (mode: InterpolationMode) => void;
  /** Reset metrics */
  resetMetrics: () => void;
  /** Start frame timing monitor */
  startFrameMonitor: () => void;
  /** Stop frame timing monitor */
  stopFrameMonitor: () => void;
  /** Get optimal interpolation factor */
  getOptimalT: (deltaMs: number, targetLatencyMs: number) => number;
}

/**
 * Hook result
 */
export interface UseMobileAvatarLatencyMitigatorResult {
  state: MitigatorState;
  metrics: MitigatorMetrics;
  controls: MitigatorControls;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: MitigatorConfig = {
  targetFrameTimeMs: 16.67,
  touchResponseTarget: 50,
  interpolationMode: "easeOut",
  strategy: "adaptive",
  maxPredictionMs: 100,
  poseHistorySize: 10,
  monitorFrameTiming: true,
  latencySampleWindow: 50,
  springStiffness: 300,
  springDamping: 20,
  adaptiveThreshold: 100,
};

// ============================================================================
// Utility Functions
// ============================================================================

function generateMeasurementId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number
): { x: number; y: number; z: number } {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function springInterpolation(
  current: number,
  target: number,
  velocity: number,
  stiffness: number,
  damping: number,
  deltaMs: number
): { value: number; velocity: number } {
  const dt = deltaMs / 1000;
  const displacement = current - target;
  const springForce = -stiffness * displacement;
  const dampingForce = -damping * velocity;
  const acceleration = springForce + dampingForce;
  const newVelocity = velocity + acceleration * dt;
  const newValue = current + newVelocity * dt;
  return { value: newValue, velocity: newVelocity };
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Mobile avatar latency mitigation hook
 */
export function useMobileAvatarLatencyMitigator(
  config: Partial<MitigatorConfig> = {},
  callbacks?: {
    onLatencyMeasured?: (latency: TouchLatency) => void;
    onFrameDrop?: (missedFrames: number) => void;
    onStrategyChange?: (strategy: MitigationStrategy) => void;
    onHighLatency?: (latencyMs: number) => void;
  }
): UseMobileAvatarLatencyMitigatorResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [isActive, setIsActive] = useState(true);
  const [currentStrategy, setCurrentStrategy] = useState<MitigationStrategy>(
    fullConfig.strategy
  );
  const [interpolationMode, setInterpolationMode] = useState<InterpolationMode>(
    fullConfig.interpolationMode
  );
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [frameTiming, setFrameTiming] = useState<FrameTiming | null>(null);

  // Metrics
  const [metrics, setMetrics] = useState<MitigatorMetrics>({
    touchLatencies: [],
    averageTouchLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    totalMeasurements: 0,
    missedFrames: 0,
    jitterAvgMs: 0,
    predictionsUsed: 0,
    predictionAccuracy: 0,
    frameDropRate: 0,
  });

  // Refs
  const measurementPointsRef = useRef<Map<string, LatencyPoint[]>>(new Map());
  const frameMonitorRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const velocitiesRef = useRef<Map<string, { x: number; y: number; z: number }>>(
    new Map()
  );
  const poseHistoryRef = useRef<AvatarPose[]>([]);

  /**
   * Interpolate between two poses
   */
  const interpolatePose = useCallback(
    (from: AvatarPose, to: AvatarPose, t: number): AvatarPose => {
      let adjustedT = Math.max(0, Math.min(1, t));

      switch (interpolationMode) {
        case "easeOut":
          adjustedT = easeOutQuad(adjustedT);
          break;
        case "spring": {
          // Use spring physics for position
          const posKey = "position";
          const vel = velocitiesRef.current.get(posKey) || { x: 0, y: 0, z: 0 };

          const springX = springInterpolation(
            from.position.x,
            to.position.x,
            vel.x,
            fullConfig.springStiffness,
            fullConfig.springDamping,
            fullConfig.targetFrameTimeMs
          );
          const springY = springInterpolation(
            from.position.y,
            to.position.y,
            vel.y,
            fullConfig.springStiffness,
            fullConfig.springDamping,
            fullConfig.targetFrameTimeMs
          );
          const springZ = springInterpolation(
            from.position.z,
            to.position.z,
            vel.z,
            fullConfig.springStiffness,
            fullConfig.springDamping,
            fullConfig.targetFrameTimeMs
          );

          velocitiesRef.current.set(posKey, {
            x: springX.velocity,
            y: springY.velocity,
            z: springZ.velocity,
          });

          return {
            position: { x: springX.value, y: springY.value, z: springZ.value },
            rotation: lerpVec3(from.rotation, to.rotation, easeOutCubic(adjustedT)),
            scale: lerpVec3(from.scale, to.scale, adjustedT),
            blendShapes: interpolateBlendShapes(from.blendShapes, to.blendShapes, adjustedT),
            timestamp: Date.now(),
          };
        }
        case "predictive":
          // Use prediction with decay
          adjustedT = Math.min(1, adjustedT * 1.2);
          break;
        case "linear":
        default:
          // Use t as-is
          break;
      }

      return {
        position: lerpVec3(from.position, to.position, adjustedT),
        rotation: lerpVec3(from.rotation, to.rotation, adjustedT),
        scale: lerpVec3(from.scale, to.scale, adjustedT),
        blendShapes: interpolateBlendShapes(from.blendShapes, to.blendShapes, adjustedT),
        timestamp: Date.now(),
      };
    },
    [interpolationMode, fullConfig]
  );

  /**
   * Helper to interpolate blend shapes
   */
  function interpolateBlendShapes(
    from: Record<string, number> | undefined,
    to: Record<string, number> | undefined,
    t: number
  ): Record<string, number> | undefined {
    if (!from && !to) return undefined;
    if (!from) return to;
    if (!to) return from;

    const result: Record<string, number> = {};
    const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);

    for (const key of allKeys) {
      const fromVal = from[key] ?? 0;
      const toVal = to[key] ?? 0;
      result[key] = lerp(fromVal, toVal, t);
    }

    return result;
  }

  /**
   * Predict next pose based on history
   */
  const predictPose = useCallback(
    (poseHistory: AvatarPose[], deltaMs: number): AvatarPose | null => {
      if (poseHistory.length < 2) return null;
      if (deltaMs > fullConfig.maxPredictionMs) return null;

      // Update history
      poseHistoryRef.current = poseHistory.slice(-fullConfig.poseHistorySize);

      const latest = poseHistory[poseHistory.length - 1];
      const previous = poseHistory[poseHistory.length - 2];

      const timeDiff = latest.timestamp - previous.timestamp;
      if (timeDiff <= 0) return latest;

      // Calculate velocity
      const factor = deltaMs / timeDiff;

      const predictedPosition = {
        x: latest.position.x + (latest.position.x - previous.position.x) * factor,
        y: latest.position.y + (latest.position.y - previous.position.y) * factor,
        z: latest.position.z + (latest.position.z - previous.position.z) * factor,
      };

      const predictedRotation = {
        x: latest.rotation.x + (latest.rotation.x - previous.rotation.x) * factor,
        y: latest.rotation.y + (latest.rotation.y - previous.rotation.y) * factor,
        z: latest.rotation.z + (latest.rotation.z - previous.rotation.z) * factor,
      };

      // Update metrics
      setMetrics((prev) => ({
        ...prev,
        predictionsUsed: prev.predictionsUsed + 1,
      }));

      return {
        position: predictedPosition,
        rotation: predictedRotation,
        scale: latest.scale,
        blendShapes: latest.blendShapes,
        timestamp: Date.now() + deltaMs,
      };
    },
    [fullConfig]
  );

  /**
   * Mark touch start for latency measurement
   */
  const markTouchStart = useCallback((id?: string): string => {
    const measurementId = id || generateMeasurementId();
    const point: LatencyPoint = {
      id: measurementId,
      type: "touch_start",
      timestamp: performance.now(),
    };

    measurementPointsRef.current.set(measurementId, [point]);
    setIsMeasuring(true);

    return measurementId;
  }, []);

  /**
   * Mark input received
   */
  const markInputReceived = useCallback((id: string): void => {
    const points = measurementPointsRef.current.get(id);
    if (points) {
      points.push({
        id,
        type: "input_received",
        timestamp: performance.now(),
      });
    }
  }, []);

  /**
   * Mark pose calculated
   */
  const markPoseCalculated = useCallback((id: string): void => {
    const points = measurementPointsRef.current.get(id);
    if (points) {
      points.push({
        id,
        type: "pose_calculated",
        timestamp: performance.now(),
      });
    }
  }, []);

  /**
   * Mark render start
   */
  const markRenderStart = useCallback((id: string): void => {
    const points = measurementPointsRef.current.get(id);
    if (points) {
      points.push({
        id,
        type: "render_start",
        timestamp: performance.now(),
      });
    }
  }, []);

  /**
   * Mark visual update (end measurement)
   */
  const markVisualUpdate = useCallback(
    (id: string): TouchLatency | null => {
      const points = measurementPointsRef.current.get(id);
      if (!points || points.length === 0) return null;

      const endTime = performance.now();
      points.push({
        id,
        type: "visual_update",
        timestamp: endTime,
      });

      // Calculate latencies
      const touchStart = points.find((p) => p.type === "touch_start");
      const inputReceived = points.find((p) => p.type === "input_received");
      const poseCalculated = points.find((p) => p.type === "pose_calculated");
      const renderStart = points.find((p) => p.type === "render_start");

      if (!touchStart) return null;

      const latency: TouchLatency = {
        touchToInput: inputReceived
          ? inputReceived.timestamp - touchStart.timestamp
          : 0,
        inputToPose: poseCalculated && inputReceived
          ? poseCalculated.timestamp - inputReceived.timestamp
          : 0,
        poseToRender: renderStart && poseCalculated
          ? renderStart.timestamp - poseCalculated.timestamp
          : 0,
        renderToVisual: renderStart
          ? endTime - renderStart.timestamp
          : 0,
        totalLatency: endTime - touchStart.timestamp,
        timestamp: Date.now(),
      };

      // Update metrics
      setMetrics((prev) => {
        const newLatencies = [...prev.touchLatencies, latency].slice(
          -fullConfig.latencySampleWindow
        );
        const totalValues = newLatencies.map((l) => l.totalLatency);
        const avgLatency =
          totalValues.reduce((a, b) => a + b, 0) / totalValues.length;

        return {
          ...prev,
          touchLatencies: newLatencies,
          averageTouchLatencyMs: avgLatency,
          p50LatencyMs: calculatePercentile(totalValues, 50),
          p95LatencyMs: calculatePercentile(totalValues, 95),
          p99LatencyMs: calculatePercentile(totalValues, 99),
          totalMeasurements: prev.totalMeasurements + 1,
        };
      });

      // Cleanup
      measurementPointsRef.current.delete(id);
      setIsMeasuring(measurementPointsRef.current.size > 0);

      // Callbacks
      callbacks?.onLatencyMeasured?.(latency);
      if (latency.totalLatency > fullConfig.adaptiveThreshold) {
        callbacks?.onHighLatency?.(latency.totalLatency);

        // Adapt strategy if needed
        if (currentStrategy === "adaptive") {
          if (latency.totalLatency > fullConfig.adaptiveThreshold * 2) {
            setCurrentStrategy("aggressive");
          } else if (latency.totalLatency > fullConfig.adaptiveThreshold) {
            setCurrentStrategy("balanced");
          }
        }
      }

      return latency;
    },
    [fullConfig, currentStrategy, callbacks]
  );

  /**
   * Update strategy
   */
  const updateStrategy = useCallback(
    (strategy: MitigationStrategy): void => {
      setCurrentStrategy(strategy);
      callbacks?.onStrategyChange?.(strategy);

      // Adjust interpolation mode based on strategy
      switch (strategy) {
        case "conservative":
          setInterpolationMode("linear");
          break;
        case "balanced":
          setInterpolationMode("easeOut");
          break;
        case "aggressive":
          setInterpolationMode("predictive");
          break;
        case "adaptive":
          // Keep current mode
          break;
      }
    },
    [callbacks]
  );

  /**
   * Start frame timing monitor
   */
  const startFrameMonitor = useCallback((): void => {
    if (frameMonitorRef.current !== null) return;

    lastFrameTimeRef.current = performance.now();
    frameCountRef.current = 0;

    const monitorFrame = (timestamp: number) => {
      const delta = timestamp - lastFrameTimeRef.current;
      const expectedDelta = fullConfig.targetFrameTimeMs;
      const jitter = Math.abs(delta - expectedDelta);
      const missedFrames = Math.max(0, Math.floor(delta / expectedDelta) - 1);

      if (missedFrames > 0) {
        callbacks?.onFrameDrop?.(missedFrames);
        setMetrics((prev) => ({
          ...prev,
          missedFrames: prev.missedFrames + missedFrames,
          frameDropRate:
            (prev.missedFrames + missedFrames) /
            (frameCountRef.current + 1),
        }));
      }

      frameCountRef.current++;

      setFrameTiming({
        frameNumber: frameCountRef.current,
        deltaMs: delta,
        expectedDeltaMs: expectedDelta,
        jitterMs: jitter,
        missedFrames,
        timestamp,
      });

      setMetrics((prev) => ({
        ...prev,
        jitterAvgMs:
          (prev.jitterAvgMs * (frameCountRef.current - 1) + jitter) /
          frameCountRef.current,
      }));

      lastFrameTimeRef.current = timestamp;
      frameMonitorRef.current = requestAnimationFrame(monitorFrame);
    };

    frameMonitorRef.current = requestAnimationFrame(monitorFrame);
    setIsActive(true);
  }, [fullConfig.targetFrameTimeMs, callbacks]);

  /**
   * Stop frame timing monitor
   */
  const stopFrameMonitor = useCallback((): void => {
    if (frameMonitorRef.current !== null) {
      cancelAnimationFrame(frameMonitorRef.current);
      frameMonitorRef.current = null;
    }
    setIsActive(false);
  }, []);

  /**
   * Get optimal interpolation factor
   */
  const getOptimalT = useCallback(
    (deltaMs: number, targetLatencyMs: number): number => {
      // Calculate how much to compensate based on current latency
      const currentLatency = metrics.averageTouchLatencyMs || fullConfig.touchResponseTarget;
      const latencyRatio = targetLatencyMs / Math.max(1, currentLatency);

      // Adjust t based on strategy
      switch (currentStrategy) {
        case "conservative":
          return Math.min(1, deltaMs / targetLatencyMs);
        case "balanced":
          return Math.min(1, (deltaMs / targetLatencyMs) * 1.1);
        case "aggressive":
          return Math.min(1, (deltaMs / targetLatencyMs) * 1.3);
        case "adaptive":
          return Math.min(1, (deltaMs / targetLatencyMs) * latencyRatio);
        default:
          return Math.min(1, deltaMs / targetLatencyMs);
      }
    },
    [currentStrategy, metrics.averageTouchLatencyMs, fullConfig.touchResponseTarget]
  );

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback((): void => {
    setMetrics({
      touchLatencies: [],
      averageTouchLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      totalMeasurements: 0,
      missedFrames: 0,
      jitterAvgMs: 0,
      predictionsUsed: 0,
      predictionAccuracy: 0,
      frameDropRate: 0,
    });
    measurementPointsRef.current.clear();
    velocitiesRef.current.clear();
    poseHistoryRef.current = [];
    frameCountRef.current = 0;
  }, []);

  // Start frame monitor on mount if configured
  useEffect(() => {
    if (fullConfig.monitorFrameTiming) {
      startFrameMonitor();
    }

    return () => {
      stopFrameMonitor();
    };
  }, [fullConfig.monitorFrameTiming, startFrameMonitor, stopFrameMonitor]);

  // Compute prediction confidence
  const predictionConfidence: PredictionConfidence = useMemo(() => {
    const history = poseHistoryRef.current;
    if (history.length < 3) {
      return { position: 0, rotation: 0, blendShapes: 0, overall: 0 };
    }

    // Calculate variance in recent poses to estimate confidence
    const recentPoses = history.slice(-5);
    let posVariance = 0;
    let rotVariance = 0;

    for (let i = 1; i < recentPoses.length; i++) {
      const prev = recentPoses[i - 1];
      const curr = recentPoses[i];

      posVariance += Math.abs(curr.position.x - prev.position.x);
      posVariance += Math.abs(curr.position.y - prev.position.y);
      posVariance += Math.abs(curr.position.z - prev.position.z);

      rotVariance += Math.abs(curr.rotation.x - prev.rotation.x);
      rotVariance += Math.abs(curr.rotation.y - prev.rotation.y);
      rotVariance += Math.abs(curr.rotation.z - prev.rotation.z);
    }

    // Lower variance = higher confidence
    const posConfidence = Math.max(0, 1 - posVariance / 10);
    const rotConfidence = Math.max(0, 1 - rotVariance / 5);
    const blendConfidence = 0.8; // Assume moderate confidence for blendshapes

    return {
      position: posConfidence,
      rotation: rotConfidence,
      blendShapes: blendConfidence,
      overall: (posConfidence + rotConfidence + blendConfidence) / 3,
    };
  }, [metrics.predictionsUsed]); // Re-compute when predictions are used

  // Compile state
  const state: MitigatorState = useMemo(
    () => ({
      isActive,
      currentStrategy,
      interpolationMode,
      averageLatencyMs: metrics.averageTouchLatencyMs,
      frameTiming,
      isMeasuring,
      predictionConfidence,
    }),
    [isActive, currentStrategy, interpolationMode, metrics.averageTouchLatencyMs, frameTiming, isMeasuring, predictionConfidence]
  );

  // Compile controls
  const controls: MitigatorControls = useMemo(
    () => ({
      interpolatePose,
      predictPose,
      markTouchStart,
      markInputReceived,
      markPoseCalculated,
      markRenderStart,
      markVisualUpdate,
      updateStrategy,
      setInterpolationMode,
      resetMetrics,
      startFrameMonitor,
      stopFrameMonitor,
      getOptimalT,
    }),
    [
      interpolatePose,
      predictPose,
      markTouchStart,
      markInputReceived,
      markPoseCalculated,
      markRenderStart,
      markVisualUpdate,
      updateStrategy,
      resetMetrics,
      startFrameMonitor,
      stopFrameMonitor,
      getOptimalT,
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
 * Simple pose interpolation hook
 */
export function usePoseInterpolation(
  mode: InterpolationMode = "easeOut"
): (from: AvatarPose, to: AvatarPose, t: number) => AvatarPose {
  const { controls } = useMobileAvatarLatencyMitigator({
    interpolationMode: mode,
    monitorFrameTiming: false,
  });

  return controls.interpolatePose;
}

/**
 * Touch latency measurement hook
 */
export function useTouchLatencyMeasurement(): {
  startMeasurement: () => string;
  endMeasurement: (id: string) => TouchLatency | null;
  averageLatency: number;
} {
  const { controls, metrics } = useMobileAvatarLatencyMitigator({
    monitorFrameTiming: false,
  });

  const startMeasurement = useCallback(() => {
    const id = controls.markTouchStart();
    controls.markInputReceived(id);
    return id;
  }, [controls]);

  const endMeasurement = useCallback(
    (id: string) => {
      controls.markRenderStart(id);
      return controls.markVisualUpdate(id);
    },
    [controls]
  );

  return {
    startMeasurement,
    endMeasurement,
    averageLatency: metrics.averageTouchLatencyMs,
  };
}

export default useMobileAvatarLatencyMitigator;
