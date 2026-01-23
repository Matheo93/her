/**
 * useAvatarPoseInterpolator - Sprint 231
 *
 * Interpolates avatar poses between keyframes for smooth animation
 * on mobile devices. Uses predictive interpolation and frame-rate
 * aware blending to maintain visual smoothness.
 *
 * Features:
 * - Keyframe-based pose interpolation
 * - Predictive pose extrapolation
 * - Frame-rate adaptive blending
 * - Bezier curve interpolation
 * - Pose caching for performance
 * - Blend shape smoothing
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * 3D Vector
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Quaternion rotation
 */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Blend shape weights
 */
export interface BlendShapeWeights {
  [shapeName: string]: number;
}

/**
 * Complete avatar pose
 */
export interface AvatarPose {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  blendShapes: BlendShapeWeights;
  timestamp: number;
}

/**
 * Pose keyframe
 */
export interface PoseKeyframe {
  id: string;
  pose: AvatarPose;
  timestamp: number;
  easing?: EasingType;
  duration?: number;
}

/**
 * Easing types
 */
export type EasingType =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "spring"
  | "bounce";

/**
 * Interpolation mode
 */
export type InterpolationMode =
  | "linear"
  | "cubic"
  | "bezier"
  | "hermite"
  | "catmullRom";

/**
 * Interpolator configuration
 */
export interface InterpolatorConfig {
  /** Interpolation mode (default: cubic) */
  mode: InterpolationMode;
  /** Target frame rate (default: 60) */
  targetFps: number;
  /** Enable predictive extrapolation (default: true) */
  enablePrediction: boolean;
  /** Prediction lookahead in ms (default: 16) */
  predictionLookaheadMs: number;
  /** Blend shape smoothing factor (default: 0.3) */
  blendShapeSmoothingFactor: number;
  /** Maximum keyframes to cache (default: 10) */
  maxCachedKeyframes: number;
  /** Enable adaptive frame rate (default: true) */
  adaptiveFrameRate: boolean;
  /** Minimum acceptable FPS (default: 30) */
  minFps: number;
}

/**
 * Interpolator metrics
 */
export interface InterpolatorMetrics {
  framesInterpolated: number;
  keyframesProcessed: number;
  predictionsMade: number;
  cacheHits: number;
  cacheMisses: number;
  averageInterpolationTime: number;
  droppedFrames: number;
}

/**
 * Interpolator state
 */
export interface InterpolatorState {
  isRunning: boolean;
  currentPose: AvatarPose | null;
  progress: number;
  currentFps: number;
  metrics: InterpolatorMetrics;
}

/**
 * Interpolator controls
 */
export interface InterpolatorControls {
  /** Add a keyframe */
  addKeyframe: (keyframe: PoseKeyframe) => void;
  /** Remove a keyframe */
  removeKeyframe: (id: string) => void;
  /** Clear all keyframes */
  clearKeyframes: () => void;
  /** Set target pose (immediate interpolation) */
  setTargetPose: (pose: AvatarPose, duration?: number) => void;
  /** Start interpolation */
  start: () => void;
  /** Stop interpolation */
  stop: () => void;
  /** Pause interpolation */
  pause: () => void;
  /** Resume interpolation */
  resume: () => void;
  /** Seek to time */
  seekTo: (timestamp: number) => void;
  /** Get interpolated pose at time */
  getPoseAt: (timestamp: number) => AvatarPose | null;
  /** Reset metrics */
  resetMetrics: () => void;
}

/**
 * Hook return type
 */
export interface UseAvatarPoseInterpolatorResult {
  state: InterpolatorState;
  controls: InterpolatorControls;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONFIG: InterpolatorConfig = {
  mode: "cubic",
  targetFps: 60,
  enablePrediction: true,
  predictionLookaheadMs: 16,
  blendShapeSmoothingFactor: 0.3,
  maxCachedKeyframes: 10,
  adaptiveFrameRate: true,
  minFps: 30,
};

const DEFAULT_POSE: AvatarPose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  blendShapes: {},
  timestamp: 0,
};

const DEFAULT_METRICS: InterpolatorMetrics = {
  framesInterpolated: 0,
  keyframesProcessed: 0,
  predictionsMade: 0,
  cacheHits: 0,
  cacheMisses: 0,
  averageInterpolationTime: 0,
  droppedFrames: 0,
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
 * Interpolate Vector3
 */
function lerpVector3(a: Vector3, b: Vector3, t: number): Vector3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

/**
 * Spherical linear interpolation for quaternions
 */
function slerp(a: Quaternion, b: Quaternion, t: number): Quaternion {
  // Calculate cosine of angle between quaternions
  let cosHalfTheta = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

  // If negative, negate one quaternion
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  if (cosHalfTheta < 0) {
    cosHalfTheta = -cosHalfTheta;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }

  // If quaternions are close, use linear interpolation
  if (cosHalfTheta > 0.9999) {
    return {
      x: lerp(a.x, bx, t),
      y: lerp(a.y, by, t),
      z: lerp(a.z, bz, t),
      w: lerp(a.w, bw, t),
    };
  }

  // Spherical interpolation
  const halfTheta = Math.acos(cosHalfTheta);
  const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta);

  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

  return {
    x: a.x * ratioA + bx * ratioB,
    y: a.y * ratioA + by * ratioB,
    z: a.z * ratioA + bz * ratioB,
    w: a.w * ratioA + bw * ratioB,
  };
}

/**
 * Interpolate blend shapes
 */
function lerpBlendShapes(
  a: BlendShapeWeights,
  b: BlendShapeWeights,
  t: number,
  smoothingFactor: number
): BlendShapeWeights {
  const result: BlendShapeWeights = {};
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of allKeys) {
    const valA = a[key] ?? 0;
    const valB = b[key] ?? 0;
    // Apply smoothing
    const smoothedT = t * (1 - smoothingFactor) + smoothingFactor * t * t * (3 - 2 * t);
    result[key] = lerp(valA, valB, smoothedT);
  }

  return result;
}

/**
 * Apply easing function
 */
function applyEasing(t: number, easing: EasingType): number {
  switch (easing) {
    case "linear":
      return t;
    case "easeIn":
      return t * t;
    case "easeOut":
      return t * (2 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case "spring":
      return 1 - Math.pow(Math.cos(t * Math.PI * 2.5), 3) * Math.exp(-t * 6);
    case "bounce":
      if (t < 1 / 2.75) return 7.5625 * t * t;
      if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
      if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
      return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    default:
      return t;
  }
}

/**
 * Cubic interpolation
 */
function cubicInterpolate(p0: number, p1: number, p2: number, p3: number, t: number): number {
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
 * Interpolate pose
 */
function interpolatePose(
  from: AvatarPose,
  to: AvatarPose,
  t: number,
  easing: EasingType = "linear",
  smoothingFactor: number = 0.3
): AvatarPose {
  const easedT = applyEasing(t, easing);

  return {
    position: lerpVector3(from.position, to.position, easedT),
    rotation: slerp(from.rotation, to.rotation, easedT),
    scale: lerpVector3(from.scale, to.scale, easedT),
    blendShapes: lerpBlendShapes(from.blendShapes, to.blendShapes, easedT, smoothingFactor),
    timestamp: lerp(from.timestamp, to.timestamp, easedT),
  };
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that interpolates avatar poses for smooth animation
 */
export function useAvatarPoseInterpolator(
  config: Partial<InterpolatorConfig> = {}
): UseAvatarPoseInterpolatorResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPose, setCurrentPose] = useState<AvatarPose | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentFps, setCurrentFps] = useState(mergedConfig.targetFps);
  const [metrics, setMetrics] = useState<InterpolatorMetrics>(DEFAULT_METRICS);

  // Refs
  const keyframesRef = useRef<PoseKeyframe[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const targetPoseRef = useRef<AvatarPose | null>(null);
  const transitionDurationRef = useRef<number>(300);
  const transitionStartTimeRef = useRef<number>(0);
  const previousPoseRef = useRef<AvatarPose | null>(null);
  const interpolationTimesRef = useRef<number[]>([]);
  const frameTimesRef = useRef<number[]>([]);
  const poseCache = useRef<Map<string, AvatarPose>>(new Map());

  /**
   * Find keyframes surrounding timestamp
   */
  const findSurroundingKeyframes = useCallback(
    (timestamp: number): [PoseKeyframe | null, PoseKeyframe | null] => {
      const keyframes = keyframesRef.current;
      if (keyframes.length === 0) return [null, null];

      let before: PoseKeyframe | null = null;
      let after: PoseKeyframe | null = null;

      for (const kf of keyframes) {
        if (kf.timestamp <= timestamp) {
          if (!before || kf.timestamp > before.timestamp) {
            before = kf;
          }
        }
        if (kf.timestamp > timestamp) {
          if (!after || kf.timestamp < after.timestamp) {
            after = kf;
          }
        }
      }

      return [before, after];
    },
    []
  );

  /**
   * Get pose at specific timestamp
   */
  const getPoseAt = useCallback(
    (timestamp: number): AvatarPose | null => {
      const cacheKey = `pose_${Math.round(timestamp)}`;

      // Check cache
      if (poseCache.current.has(cacheKey)) {
        setMetrics((prev) => ({ ...prev, cacheHits: prev.cacheHits + 1 }));
        return poseCache.current.get(cacheKey)!;
      }

      setMetrics((prev) => ({ ...prev, cacheMisses: prev.cacheMisses + 1 }));

      const [before, after] = findSurroundingKeyframes(timestamp);

      if (!before && !after) return null;
      if (!before) return after!.pose;
      if (!after) return before.pose;

      // Calculate interpolation factor
      const duration = after.timestamp - before.timestamp;
      const elapsed = timestamp - before.timestamp;
      const t = Math.max(0, Math.min(1, elapsed / duration));

      const pose = interpolatePose(
        before.pose,
        after.pose,
        t,
        after.easing ?? "linear",
        mergedConfig.blendShapeSmoothingFactor
      );

      // Cache result
      if (poseCache.current.size >= mergedConfig.maxCachedKeyframes * 10) {
        // Clear oldest entries
        const entries = Array.from(poseCache.current.entries());
        entries.slice(0, entries.length / 2).forEach(([key]) => {
          poseCache.current.delete(key);
        });
      }
      poseCache.current.set(cacheKey, pose);

      return pose;
    },
    [findSurroundingKeyframes, mergedConfig]
  );

  /**
   * Animation frame callback
   */
  const animationFrame = useCallback(
    (timestamp: number) => {
      if (isPaused) {
        rafIdRef.current = requestAnimationFrame(animationFrame);
        return;
      }

      const interpolationStart = performance.now();

      // Calculate delta time
      const deltaTime = lastFrameTimeRef.current
        ? timestamp - lastFrameTimeRef.current
        : 16.67;
      lastFrameTimeRef.current = timestamp;

      // Track frame times for FPS calculation
      frameTimesRef.current.push(deltaTime);
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift();
      }

      const avgFrameTime =
        frameTimesRef.current.reduce((a, b) => a + b, 0) /
        frameTimesRef.current.length;
      const calculatedFps = 1000 / avgFrameTime;
      setCurrentFps(Math.round(calculatedFps));

      // Check for dropped frames
      if (deltaTime > (1000 / mergedConfig.minFps) * 1.5) {
        setMetrics((prev) => ({ ...prev, droppedFrames: prev.droppedFrames + 1 }));
      }

      let newPose: AvatarPose | null = null;

      // Handle target pose transition
      if (targetPoseRef.current && previousPoseRef.current) {
        const transitionElapsed = timestamp - transitionStartTimeRef.current;
        const transitionProgress = Math.min(1, transitionElapsed / transitionDurationRef.current);

        newPose = interpolatePose(
          previousPoseRef.current,
          targetPoseRef.current,
          transitionProgress,
          "easeOut",
          mergedConfig.blendShapeSmoothingFactor
        );

        setProgress(transitionProgress);

        if (transitionProgress >= 1) {
          targetPoseRef.current = null;
          previousPoseRef.current = null;
        }
      } else {
        // Keyframe-based interpolation
        const elapsed = timestamp - startTimeRef.current;

        // Apply prediction if enabled
        let lookupTime = elapsed;
        if (mergedConfig.enablePrediction) {
          lookupTime += mergedConfig.predictionLookaheadMs;
          setMetrics((prev) => ({ ...prev, predictionsMade: prev.predictionsMade + 1 }));
        }

        newPose = getPoseAt(lookupTime);

        // Calculate progress through keyframes
        const keyframes = keyframesRef.current;
        if (keyframes.length > 0) {
          const minTime = Math.min(...keyframes.map((k) => k.timestamp));
          const maxTime = Math.max(...keyframes.map((k) => k.timestamp));
          const totalDuration = maxTime - minTime;
          if (totalDuration > 0) {
            setProgress((elapsed - minTime) / totalDuration);
          }
        }
      }

      if (newPose) {
        setCurrentPose(newPose);
      }

      // Track interpolation time
      const interpolationTime = performance.now() - interpolationStart;
      interpolationTimesRef.current.push(interpolationTime);
      if (interpolationTimesRef.current.length > 100) {
        interpolationTimesRef.current.shift();
      }

      setMetrics((prev) => ({
        ...prev,
        framesInterpolated: prev.framesInterpolated + 1,
        averageInterpolationTime:
          interpolationTimesRef.current.reduce((a, b) => a + b, 0) /
          interpolationTimesRef.current.length,
      }));

      rafIdRef.current = requestAnimationFrame(animationFrame);
    },
    [isPaused, mergedConfig, getPoseAt]
  );

  /**
   * Add a keyframe
   */
  const addKeyframe = useCallback((keyframe: PoseKeyframe) => {
    keyframesRef.current.push(keyframe);
    keyframesRef.current.sort((a, b) => a.timestamp - b.timestamp);

    // Limit cached keyframes
    if (keyframesRef.current.length > DEFAULT_CONFIG.maxCachedKeyframes * 2) {
      keyframesRef.current = keyframesRef.current.slice(-DEFAULT_CONFIG.maxCachedKeyframes);
    }

    setMetrics((prev) => ({
      ...prev,
      keyframesProcessed: prev.keyframesProcessed + 1,
    }));

    // Clear cache on new keyframe
    poseCache.current.clear();
  }, []);

  /**
   * Remove a keyframe
   */
  const removeKeyframe = useCallback((id: string) => {
    keyframesRef.current = keyframesRef.current.filter((k) => k.id !== id);
    poseCache.current.clear();
  }, []);

  /**
   * Clear all keyframes
   */
  const clearKeyframes = useCallback(() => {
    keyframesRef.current = [];
    poseCache.current.clear();
  }, []);

  /**
   * Set target pose for immediate interpolation
   */
  const setTargetPose = useCallback(
    (pose: AvatarPose, duration: number = 300) => {
      previousPoseRef.current = currentPose ?? DEFAULT_POSE;
      targetPoseRef.current = pose;
      transitionDurationRef.current = duration;
      transitionStartTimeRef.current = performance.now();

      if (!isRunning) {
        setIsRunning(true);
        startTimeRef.current = performance.now();
        rafIdRef.current = requestAnimationFrame(animationFrame);
      }
    },
    [currentPose, isRunning, animationFrame]
  );

  /**
   * Start interpolation
   */
  const start = useCallback(() => {
    if (isRunning) return;

    setIsRunning(true);
    setIsPaused(false);
    startTimeRef.current = performance.now();
    lastFrameTimeRef.current = 0;
    rafIdRef.current = requestAnimationFrame(animationFrame);
  }, [isRunning, animationFrame]);

  /**
   * Stop interpolation
   */
  const stop = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setIsRunning(false);
    setIsPaused(false);
    setProgress(0);
  }, []);

  /**
   * Pause interpolation
   */
  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  /**
   * Resume interpolation
   */
  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  /**
   * Seek to timestamp
   */
  const seekTo = useCallback(
    (timestamp: number) => {
      const pose = getPoseAt(timestamp);
      if (pose) {
        setCurrentPose(pose);
      }
    },
    [getPoseAt]
  );

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback(() => {
    setMetrics(DEFAULT_METRICS);
    interpolationTimesRef.current = [];
    frameTimesRef.current = [];
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Build state
  const state: InterpolatorState = useMemo(
    () => ({
      isRunning,
      currentPose,
      progress,
      currentFps,
      metrics,
    }),
    [isRunning, currentPose, progress, currentFps, metrics]
  );

  // Build controls
  const controls: InterpolatorControls = useMemo(
    () => ({
      addKeyframe,
      removeKeyframe,
      clearKeyframes,
      setTargetPose,
      start,
      stop,
      pause,
      resume,
      seekTo,
      getPoseAt,
      resetMetrics,
    }),
    [
      addKeyframe,
      removeKeyframe,
      clearKeyframes,
      setTargetPose,
      start,
      stop,
      pause,
      resume,
      seekTo,
      getPoseAt,
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
 * Simple pose transition hook
 */
export function usePoseTransition(duration: number = 300): {
  currentPose: AvatarPose | null;
  transitionTo: (pose: AvatarPose) => void;
  isTransitioning: boolean;
} {
  const { state, controls } = useAvatarPoseInterpolator();

  const transitionTo = useCallback(
    (pose: AvatarPose) => {
      controls.setTargetPose(pose, duration);
    },
    [controls, duration]
  );

  return {
    currentPose: state.currentPose,
    transitionTo,
    isTransitioning: state.isRunning && state.progress < 1,
  };
}

/**
 * Blend shape interpolation hook
 */
export function useBlendShapeInterpolator(): {
  weights: BlendShapeWeights;
  setTargetWeights: (weights: BlendShapeWeights, duration?: number) => void;
} {
  const { state, controls } = useAvatarPoseInterpolator();

  const setTargetWeights = useCallback(
    (weights: BlendShapeWeights, duration: number = 200) => {
      const targetPose: AvatarPose = {
        ...DEFAULT_POSE,
        blendShapes: weights,
        timestamp: performance.now(),
      };
      controls.setTargetPose(targetPose, duration);
    },
    [controls]
  );

  return {
    weights: state.currentPose?.blendShapes ?? {},
    setTargetWeights,
  };
}

// ============================================================================
// Exports
// ============================================================================

export default useAvatarPoseInterpolator;
