/**
 * useAvatarAnimationSmoothing - Avatar Animation Smoothing Hook
 *
 * Sprint 526: Reduces animation jank and provides smooth transitions:
 * - Exponential smoothing for continuous values
 * - Spring-based smoothing for physics-like motion
 * - Jank detection and compensation
 * - Animation priority queue management
 * - Blend shape interpolation optimization
 *
 * @example
 * ```tsx
 * const { state, controls, blend } = useAvatarAnimationSmoothing({
 *   smoothingFactor: 0.15,
 *   springStiffness: 200,
 * });
 *
 * // Smooth a continuous value
 * const smoothedRotation = controls.smooth('headRotation', rawRotation);
 *
 * // Blend between poses
 * const blendedPose = blend.poses(idlePose, talkingPose, 0.5);
 * ```
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Smoothing algorithm
 */
export type SmoothingAlgorithm =
  | "exponential"
  | "spring"
  | "lerp"
  | "critically_damped"
  | "adaptive";

/**
 * Animation priority
 */
export type AnimationPriority = "critical" | "high" | "normal" | "low";

/**
 * Smoothed value state
 */
export interface SmoothedValue {
  current: number;
  target: number;
  velocity: number;
  lastUpdate: number;
  isSettled: boolean;
}

/**
 * Blend shape weights
 */
export interface BlendShapeWeights {
  [key: string]: number;
}

/**
 * Avatar pose for blending
 */
export interface AvatarPose {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  blendShapes?: BlendShapeWeights;
}

/**
 * Jank event
 */
export interface JankEvent {
  timestamp: number;
  deltaMs: number;
  expectedMs: number;
  severity: number;
  compensationApplied: boolean;
}

/**
 * Animation in queue
 */
export interface QueuedAnimation {
  id: string;
  priority: AnimationPriority;
  startTime: number;
  duration: number;
  progress: number;
  target: string;
  fromValue: number;
  toValue: number;
}

/**
 * Smoothing metrics
 */
export interface SmoothingMetrics {
  valuesSmoothed: number;
  posesBlended: number;
  jankEventsDetected: number;
  jankEventsCompensated: number;
  avgSmoothingTime: number;
  queuedAnimations: number;
  completedAnimations: number;
  settledValues: number;
}

/**
 * Smoothing state
 */
export interface SmoothingState {
  isActive: boolean;
  algorithm: SmoothingAlgorithm;
  trackedValues: number;
  hasJank: boolean;
  recentJank: JankEvent | null;
}

/**
 * Smoothing config
 */
export interface SmoothingConfig {
  /** Smoothing factor for exponential (0-1, lower = smoother) */
  smoothingFactor: number;
  /** Spring stiffness */
  springStiffness: number;
  /** Spring damping */
  springDamping: number;
  /** Settlement threshold */
  settlementThreshold: number;
  /** Jank detection threshold (ms) */
  jankThresholdMs: number;
  /** Enable jank compensation */
  enableJankCompensation: boolean;
  /** Default algorithm */
  algorithm: SmoothingAlgorithm;
  /** Max queued animations */
  maxQueueSize: number;
  /** Adaptive smoothing sensitivity */
  adaptiveSensitivity: number;
}

/**
 * Smoothing controls
 */
export interface SmoothingControls {
  /** Smooth a named value */
  smooth: (key: string, target: number, algorithm?: SmoothingAlgorithm) => number;
  /** Smooth a vector */
  smoothVector: (
    key: string,
    target: { x: number; y: number; z: number },
    algorithm?: SmoothingAlgorithm
  ) => { x: number; y: number; z: number };
  /** Get current smoothed value */
  getValue: (key: string) => number | undefined;
  /** Reset a smoothed value */
  resetValue: (key: string, value?: number) => void;
  /** Reset all values */
  resetAll: () => void;
  /** Set target without smoothing */
  setImmediate: (key: string, value: number) => void;
  /** Check if value is settled */
  isSettled: (key: string) => boolean;
  /** Queue an animation */
  queueAnimation: (
    id: string,
    target: string,
    fromValue: number,
    toValue: number,
    duration: number,
    priority?: AnimationPriority
  ) => void;
  /** Cancel queued animation */
  cancelAnimation: (id: string) => void;
  /** Process animation queue (call per frame) */
  processQueue: (deltaMs: number) => void;
  /** Set algorithm */
  setAlgorithm: (algorithm: SmoothingAlgorithm) => void;
}

/**
 * Blend controls
 */
export interface BlendControls {
  /** Blend between two poses */
  poses: (poseA: AvatarPose, poseB: AvatarPose, t: number) => AvatarPose;
  /** Blend blend shapes */
  blendShapes: (
    shapesA: BlendShapeWeights,
    shapesB: BlendShapeWeights,
    t: number
  ) => BlendShapeWeights;
  /** Additive blend */
  additive: (base: BlendShapeWeights, overlay: BlendShapeWeights, weight: number) => BlendShapeWeights;
  /** Multi-pose blend */
  multiBlend: (poses: { pose: AvatarPose; weight: number }[]) => AvatarPose;
}

/**
 * Hook result
 */
export interface UseAvatarAnimationSmoothingResult {
  state: SmoothingState;
  metrics: SmoothingMetrics;
  controls: SmoothingControls;
  blend: BlendControls;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: SmoothingConfig = {
  smoothingFactor: 0.15,
  springStiffness: 200,
  springDamping: 20,
  settlementThreshold: 0.001,
  jankThresholdMs: 32, // 2 frames at 60fps
  enableJankCompensation: true,
  algorithm: "exponential",
  maxQueueSize: 50,
  adaptiveSensitivity: 0.5,
};

const PRIORITY_ORDER: AnimationPriority[] = ["critical", "high", "normal", "low"];

// ============================================================================
// Utility Functions
// ============================================================================

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function exponentialSmooth(
  current: number,
  target: number,
  factor: number,
  deltaMs: number
): number {
  // Time-corrected exponential smoothing
  const smoothFactor = 1 - Math.pow(1 - factor, deltaMs / 16.67);
  return current + (target - current) * smoothFactor;
}

function springSmooth(
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

function criticallyDampedSmooth(
  current: number,
  target: number,
  velocity: number,
  stiffness: number,
  deltaMs: number
): { value: number; velocity: number } {
  // Critically damped = damping = 2 * sqrt(stiffness)
  const damping = 2 * Math.sqrt(stiffness);
  return springSmooth(current, target, velocity, stiffness, damping, deltaMs);
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Avatar animation smoothing hook
 */
export function useAvatarAnimationSmoothing(
  config: Partial<SmoothingConfig> = {},
  callbacks?: {
    onJankDetected?: (event: JankEvent) => void;
    onAnimationComplete?: (id: string) => void;
    onValueSettled?: (key: string, value: number) => void;
  }
): UseAvatarAnimationSmoothingResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [algorithm, setAlgorithm] = useState<SmoothingAlgorithm>(fullConfig.algorithm);
  const [hasJank, setHasJank] = useState(false);
  const [recentJank, setRecentJank] = useState<JankEvent | null>(null);

  // Metrics
  const [metrics, setMetrics] = useState<SmoothingMetrics>({
    valuesSmoothed: 0,
    posesBlended: 0,
    jankEventsDetected: 0,
    jankEventsCompensated: 0,
    avgSmoothingTime: 0,
    queuedAnimations: 0,
    completedAnimations: 0,
    settledValues: 0,
  });

  // Refs
  const valuesRef = useRef<Map<string, SmoothedValue>>(new Map());
  const velocitiesRef = useRef<Map<string, number>>(new Map());
  const animationQueueRef = useRef<Map<string, QueuedAnimation>>(new Map());
  const lastFrameTimeRef = useRef<number>(performance.now());
  const smoothingTimesRef = useRef<number[]>([]);

  /**
   * Get or create smoothed value
   */
  const getOrCreateValue = useCallback(
    (key: string, initialValue: number = 0): SmoothedValue => {
      let value = valuesRef.current.get(key);
      if (!value) {
        value = {
          current: initialValue,
          target: initialValue,
          velocity: 0,
          lastUpdate: performance.now(),
          isSettled: true,
        };
        valuesRef.current.set(key, value);
      }
      return value;
    },
    []
  );

  /**
   * Detect and handle jank
   */
  const detectJank = useCallback(
    (deltaMs: number): boolean => {
      if (deltaMs > fullConfig.jankThresholdMs) {
        const event: JankEvent = {
          timestamp: Date.now(),
          deltaMs,
          expectedMs: 16.67,
          severity: deltaMs / 16.67,
          compensationApplied: false,
        };

        setRecentJank(event);
        setHasJank(true);
        callbacks?.onJankDetected?.(event);

        setMetrics((prev) => ({
          ...prev,
          jankEventsDetected: prev.jankEventsDetected + 1,
        }));

        return true;
      }

      setHasJank(false);
      return false;
    },
    [fullConfig.jankThresholdMs, callbacks]
  );

  /**
   * Smooth a value
   */
  const smooth = useCallback(
    (key: string, target: number, algo?: SmoothingAlgorithm): number => {
      const startTime = performance.now();
      const now = startTime;
      const smoothedValue = getOrCreateValue(key, target);
      const deltaMs = now - smoothedValue.lastUpdate;

      // Detect jank
      const isJanky = detectJank(deltaMs);
      const useAlgo = algo || algorithm;

      // Update target
      smoothedValue.target = target;

      let newValue = smoothedValue.current;
      let newVelocity = velocitiesRef.current.get(key) || 0;

      // Apply compensation for jank if enabled
      const effectiveDelta =
        isJanky && fullConfig.enableJankCompensation
          ? Math.min(deltaMs, fullConfig.jankThresholdMs)
          : deltaMs;

      if (isJanky && fullConfig.enableJankCompensation) {
        setMetrics((prev) => ({
          ...prev,
          jankEventsCompensated: prev.jankEventsCompensated + 1,
        }));
      }

      switch (useAlgo) {
        case "exponential":
          newValue = exponentialSmooth(
            smoothedValue.current,
            target,
            fullConfig.smoothingFactor,
            effectiveDelta
          );
          break;

        case "spring": {
          const result = springSmooth(
            smoothedValue.current,
            target,
            newVelocity,
            fullConfig.springStiffness,
            fullConfig.springDamping,
            effectiveDelta
          );
          newValue = result.value;
          newVelocity = result.velocity;
          break;
        }

        case "critically_damped": {
          const result = criticallyDampedSmooth(
            smoothedValue.current,
            target,
            newVelocity,
            fullConfig.springStiffness,
            effectiveDelta
          );
          newValue = result.value;
          newVelocity = result.velocity;
          break;
        }

        case "lerp":
          newValue = lerp(smoothedValue.current, target, fullConfig.smoothingFactor);
          break;

        case "adaptive": {
          // Adjust smoothing based on velocity
          const speed = Math.abs(target - smoothedValue.current);
          const adaptiveFactor =
            fullConfig.smoothingFactor *
            (1 + speed * fullConfig.adaptiveSensitivity);
          newValue = exponentialSmooth(
            smoothedValue.current,
            target,
            clamp(adaptiveFactor, 0.01, 0.5),
            effectiveDelta
          );
          break;
        }
      }

      // Update state
      smoothedValue.current = newValue;
      smoothedValue.lastUpdate = now;
      velocitiesRef.current.set(key, newVelocity);

      // Check settlement
      const wasSettled = smoothedValue.isSettled;
      smoothedValue.isSettled =
        Math.abs(newValue - target) < fullConfig.settlementThreshold;

      if (!wasSettled && smoothedValue.isSettled) {
        callbacks?.onValueSettled?.(key, newValue);
        setMetrics((prev) => ({
          ...prev,
          settledValues: prev.settledValues + 1,
        }));
      }

      // Track smoothing time
      const elapsed = performance.now() - startTime;
      smoothingTimesRef.current.push(elapsed);
      if (smoothingTimesRef.current.length > 100) {
        smoothingTimesRef.current.shift();
      }

      setMetrics((prev) => ({
        ...prev,
        valuesSmoothed: prev.valuesSmoothed + 1,
        avgSmoothingTime:
          smoothingTimesRef.current.reduce((a, b) => a + b, 0) /
          smoothingTimesRef.current.length,
      }));

      return newValue;
    },
    [algorithm, fullConfig, getOrCreateValue, detectJank, callbacks]
  );

  /**
   * Smooth a vector
   */
  const smoothVector = useCallback(
    (
      key: string,
      target: { x: number; y: number; z: number },
      algo?: SmoothingAlgorithm
    ): { x: number; y: number; z: number } => {
      return {
        x: smooth(`${key}.x`, target.x, algo),
        y: smooth(`${key}.y`, target.y, algo),
        z: smooth(`${key}.z`, target.z, algo),
      };
    },
    [smooth]
  );

  /**
   * Get current smoothed value
   */
  const getValue = useCallback((key: string): number | undefined => {
    return valuesRef.current.get(key)?.current;
  }, []);

  /**
   * Reset a value
   */
  const resetValue = useCallback((key: string, value?: number): void => {
    const smoothedValue = valuesRef.current.get(key);
    if (smoothedValue) {
      const resetTo = value ?? smoothedValue.target;
      smoothedValue.current = resetTo;
      smoothedValue.target = resetTo;
      smoothedValue.velocity = 0;
      smoothedValue.isSettled = true;
      velocitiesRef.current.set(key, 0);
    }
  }, []);

  /**
   * Reset all values
   */
  const resetAll = useCallback((): void => {
    valuesRef.current.clear();
    velocitiesRef.current.clear();
    animationQueueRef.current.clear();
  }, []);

  /**
   * Set immediate value
   */
  const setImmediate = useCallback(
    (key: string, value: number): void => {
      const smoothedValue = getOrCreateValue(key, value);
      smoothedValue.current = value;
      smoothedValue.target = value;
      smoothedValue.isSettled = true;
      velocitiesRef.current.set(key, 0);
    },
    [getOrCreateValue]
  );

  /**
   * Check if value is settled
   */
  const isSettled = useCallback((key: string): boolean => {
    return valuesRef.current.get(key)?.isSettled ?? true;
  }, []);

  /**
   * Queue animation
   */
  const queueAnimation = useCallback(
    (
      id: string,
      target: string,
      fromValue: number,
      toValue: number,
      duration: number,
      priority: AnimationPriority = "normal"
    ): void => {
      if (animationQueueRef.current.size >= fullConfig.maxQueueSize) {
        // Remove lowest priority animation
        const animations = Array.from(animationQueueRef.current.entries());
        animations.sort(
          (a, b) =>
            PRIORITY_ORDER.indexOf(b[1].priority) -
            PRIORITY_ORDER.indexOf(a[1].priority)
        );
        if (animations.length > 0) {
          animationQueueRef.current.delete(animations[0][0]);
        }
      }

      animationQueueRef.current.set(id, {
        id,
        priority,
        startTime: performance.now(),
        duration,
        progress: 0,
        target,
        fromValue,
        toValue,
      });

      setMetrics((prev) => ({
        ...prev,
        queuedAnimations: animationQueueRef.current.size,
      }));
    },
    [fullConfig.maxQueueSize]
  );

  /**
   * Cancel animation
   */
  const cancelAnimation = useCallback((id: string): void => {
    animationQueueRef.current.delete(id);
    setMetrics((prev) => ({
      ...prev,
      queuedAnimations: animationQueueRef.current.size,
    }));
  }, []);

  /**
   * Process animation queue
   */
  const processQueue = useCallback(
    (deltaMs: number): void => {
      const completedIds: string[] = [];

      animationQueueRef.current.forEach((anim) => {
        anim.progress += deltaMs / anim.duration;

        if (anim.progress >= 1) {
          anim.progress = 1;
          completedIds.push(anim.id);
          setImmediate(anim.target, anim.toValue);
          callbacks?.onAnimationComplete?.(anim.id);
        } else {
          // Apply easing
          const easedProgress = 1 - Math.pow(1 - anim.progress, 3); // Ease-out cubic
          const value = lerp(anim.fromValue, anim.toValue, easedProgress);
          setImmediate(anim.target, value);
        }
      });

      // Remove completed
      completedIds.forEach((id) => animationQueueRef.current.delete(id));

      if (completedIds.length > 0) {
        setMetrics((prev) => ({
          ...prev,
          completedAnimations: prev.completedAnimations + completedIds.length,
          queuedAnimations: animationQueueRef.current.size,
        }));
      }

      lastFrameTimeRef.current = performance.now();
    },
    [setImmediate, callbacks]
  );

  // ============================================================================
  // Blend Controls
  // ============================================================================

  /**
   * Blend two poses
   */
  const blendPoses = useCallback(
    (poseA: AvatarPose, poseB: AvatarPose, t: number): AvatarPose => {
      setMetrics((prev) => ({
        ...prev,
        posesBlended: prev.posesBlended + 1,
      }));

      return {
        position: {
          x: lerp(poseA.position.x, poseB.position.x, t),
          y: lerp(poseA.position.y, poseB.position.y, t),
          z: lerp(poseA.position.z, poseB.position.z, t),
        },
        rotation: {
          x: lerp(poseA.rotation.x, poseB.rotation.x, t),
          y: lerp(poseA.rotation.y, poseB.rotation.y, t),
          z: lerp(poseA.rotation.z, poseB.rotation.z, t),
        },
        scale: {
          x: lerp(poseA.scale.x, poseB.scale.x, t),
          y: lerp(poseA.scale.y, poseB.scale.y, t),
          z: lerp(poseA.scale.z, poseB.scale.z, t),
        },
        blendShapes:
          poseA.blendShapes && poseB.blendShapes
            ? blendBlendShapes(poseA.blendShapes, poseB.blendShapes, t)
            : poseA.blendShapes || poseB.blendShapes,
      };
    },
    []
  );

  /**
   * Blend blend shapes
   */
  const blendBlendShapes = useCallback(
    (shapesA: BlendShapeWeights, shapesB: BlendShapeWeights, t: number): BlendShapeWeights => {
      const result: BlendShapeWeights = {};
      const allKeys = new Set([...Object.keys(shapesA), ...Object.keys(shapesB)]);

      for (const key of allKeys) {
        const a = shapesA[key] ?? 0;
        const b = shapesB[key] ?? 0;
        result[key] = lerp(a, b, t);
      }

      return result;
    },
    []
  );

  /**
   * Additive blend
   */
  const additiveBlend = useCallback(
    (base: BlendShapeWeights, overlay: BlendShapeWeights, weight: number): BlendShapeWeights => {
      const result: BlendShapeWeights = { ...base };

      for (const [key, value] of Object.entries(overlay)) {
        result[key] = (result[key] ?? 0) + value * weight;
      }

      return result;
    },
    []
  );

  /**
   * Multi-pose blend
   */
  const multiBlend = useCallback(
    (poses: { pose: AvatarPose; weight: number }[]): AvatarPose => {
      if (poses.length === 0) {
        return {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        };
      }

      if (poses.length === 1) {
        return poses[0].pose;
      }

      // Normalize weights
      const totalWeight = poses.reduce((sum, p) => sum + p.weight, 0);
      const normalizedPoses = poses.map((p) => ({
        pose: p.pose,
        weight: p.weight / totalWeight,
      }));

      // Blend all poses
      let result: AvatarPose = {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0, y: 0, z: 0 },
        blendShapes: {},
      };

      for (const { pose, weight } of normalizedPoses) {
        result.position.x += pose.position.x * weight;
        result.position.y += pose.position.y * weight;
        result.position.z += pose.position.z * weight;
        result.rotation.x += pose.rotation.x * weight;
        result.rotation.y += pose.rotation.y * weight;
        result.rotation.z += pose.rotation.z * weight;
        result.scale.x += pose.scale.x * weight;
        result.scale.y += pose.scale.y * weight;
        result.scale.z += pose.scale.z * weight;

        if (pose.blendShapes) {
          result.blendShapes = additiveBlend(
            result.blendShapes || {},
            pose.blendShapes,
            weight
          );
        }
      }

      setMetrics((prev) => ({
        ...prev,
        posesBlended: prev.posesBlended + 1,
      }));

      return result;
    },
    [additiveBlend]
  );

  // Compile state
  const state: SmoothingState = useMemo(
    () => ({
      isActive: true,
      algorithm,
      trackedValues: valuesRef.current.size,
      hasJank,
      recentJank,
    }),
    [algorithm, hasJank, recentJank]
  );

  // Compile controls
  const controls: SmoothingControls = useMemo(
    () => ({
      smooth,
      smoothVector,
      getValue,
      resetValue,
      resetAll,
      setImmediate,
      isSettled,
      queueAnimation,
      cancelAnimation,
      processQueue,
      setAlgorithm,
    }),
    [
      smooth,
      smoothVector,
      getValue,
      resetValue,
      resetAll,
      setImmediate,
      isSettled,
      queueAnimation,
      cancelAnimation,
      processQueue,
    ]
  );

  // Compile blend controls
  const blend: BlendControls = useMemo(
    () => ({
      poses: blendPoses,
      blendShapes: blendBlendShapes,
      additive: additiveBlend,
      multiBlend,
    }),
    [blendPoses, blendBlendShapes, additiveBlend, multiBlend]
  );

  return {
    state,
    metrics,
    controls,
    blend,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple smoothed value hook
 */
export function useSmoothedValue(
  initialValue: number,
  smoothingFactor: number = 0.15
): [number, (target: number) => void] {
  const { controls } = useAvatarAnimationSmoothing({ smoothingFactor });
  const [value, setValue] = useState(initialValue);

  const setTarget = useCallback(
    (target: number) => {
      const smoothed = controls.smooth("value", target);
      setValue(smoothed);
    },
    [controls]
  );

  return [value, setTarget];
}

/**
 * Pose blending hook
 */
export function usePoseBlending(): (
  poseA: AvatarPose,
  poseB: AvatarPose,
  t: number
) => AvatarPose {
  const { blend } = useAvatarAnimationSmoothing();
  return blend.poses;
}

/**
 * Jank detection hook
 */
export function useJankDetection(
  onJank?: (event: JankEvent) => void
): {
  hasJank: boolean;
  recentJank: JankEvent | null;
} {
  const { state } = useAvatarAnimationSmoothing(
    { enableJankCompensation: true },
    { onJankDetected: onJank }
  );

  return {
    hasJank: state.hasJank,
    recentJank: state.recentJank,
  };
}

export default useAvatarAnimationSmoothing;
