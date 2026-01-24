/**
 * useMobileAnimationScheduler - Sprint 230
 *
 * Schedules animations on mobile devices with frame budget awareness,
 * priority management, and automatic throttling based on device conditions.
 *
 * Features:
 * - Priority-based animation scheduling
 * - Frame budget enforcement
 * - Automatic throttling under load
 * - Battery/thermal awareness
 * - Animation grouping and synchronization
 * - Deadline-based scheduling
 * - Stagger support for sequential animations
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Animation priority levels
 */
export type AnimationPriority =
  | "critical" // Must run every frame (user input response)
  | "high" // Should run every frame (active animations)
  | "normal" // Can skip frames (background animations)
  | "low" // Only when idle (ambient effects)
  | "deferred"; // Only when explicitly triggered

/**
 * Animation state
 */
export type AnimationState =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "cancelled";

/**
 * Easing function type
 */
export type EasingFunction = (t: number) => number;

/**
 * Animation definition
 */
export interface ScheduledAnimation {
  id: string;
  priority: AnimationPriority;
  state: AnimationState;
  startTime: number;
  duration: number;
  elapsed: number;
  progress: number;
  callback: (progress: number, deltaTime: number) => void;
  onComplete?: () => void;
  easing: EasingFunction;
  groupId?: string;
  deadline?: number;
  staggerDelay?: number;
  staggerIndex?: number;
}

/**
 * Animation group
 */
export interface AnimationGroup {
  id: string;
  animations: string[];
  state: AnimationState;
  synchronize: boolean;
  staggerMs: number;
}

/**
 * Frame budget info
 */
export interface FrameBudgetInfo {
  targetMs: number;
  usedMs: number;
  remainingMs: number;
  isOverBudget: boolean;
  throttleLevel: number;
}

/**
 * Device conditions
 */
export interface DeviceConditions {
  batteryLevel: number | null;
  isCharging: boolean;
  thermalState: "nominal" | "fair" | "serious" | "critical";
  memoryPressure: "normal" | "warning" | "critical";
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Target frame time in ms (default: 16.67) */
  targetFrameTimeMs: number;
  /** Maximum animations per frame (default: 20) */
  maxAnimationsPerFrame: number;
  /** Enable battery awareness (default: true) */
  batteryAware: boolean;
  /** Low battery threshold (default: 0.2) */
  lowBatteryThreshold: number;
  /** Enable thermal throttling (default: true) */
  thermalThrottling: boolean;
  /** Auto-pause on background (default: true) */
  pauseOnBackground: boolean;
  /** Stagger default delay in ms (default: 50) */
  defaultStaggerMs: number;
  /** Enable frame skipping under load (default: true) */
  enableFrameSkipping: boolean;
  /** Maximum skip frames for normal priority (default: 2) */
  maxSkipFrames: number;
}

/**
 * Scheduler metrics
 */
export interface SchedulerMetrics {
  totalAnimations: number;
  activeAnimations: number;
  completedAnimations: number;
  cancelledAnimations: number;
  framesProcessed: number;
  framesSkipped: number;
  averageFrameTime: number;
  budgetOverruns: number;
}

/**
 * Scheduler state
 */
export interface SchedulerState {
  isRunning: boolean;
  isPaused: boolean;
  animations: Map<string, ScheduledAnimation>;
  groups: Map<string, AnimationGroup>;
  frameBudget: FrameBudgetInfo;
  deviceConditions: DeviceConditions;
  metrics: SchedulerMetrics;
  throttleMultiplier: number;
}

/**
 * Animation options
 */
export interface AnimationOptions {
  priority?: AnimationPriority;
  duration?: number;
  easing?: EasingFunction;
  onComplete?: () => void;
  groupId?: string;
  deadline?: number;
  staggerDelay?: number;
  staggerIndex?: number;
}

/**
 * Scheduler controls
 */
export interface SchedulerControls {
  /** Schedule an animation */
  schedule: (
    callback: (progress: number, deltaTime: number) => void,
    options?: AnimationOptions
  ) => string;
  /** Cancel an animation */
  cancel: (animationId: string) => boolean;
  /** Pause an animation */
  pause: (animationId: string) => boolean;
  /** Resume an animation */
  resume: (animationId: string) => boolean;
  /** Create an animation group */
  createGroup: (groupId: string, synchronize?: boolean, staggerMs?: number) => void;
  /** Add animation to group */
  addToGroup: (animationId: string, groupId: string) => boolean;
  /** Remove animation from group */
  removeFromGroup: (animationId: string) => boolean;
  /** Start a group */
  startGroup: (groupId: string) => void;
  /** Pause a group */
  pauseGroup: (groupId: string) => void;
  /** Cancel a group */
  cancelGroup: (groupId: string) => void;
  /** Pause all animations */
  pauseAll: () => void;
  /** Resume all animations */
  resumeAll: () => void;
  /** Cancel all animations */
  cancelAll: () => void;
  /** Get animation by ID */
  getAnimation: (animationId: string) => ScheduledAnimation | undefined;
  /** Force throttle level */
  setThrottleLevel: (level: number) => void;
}

/**
 * Hook return type
 */
export interface UseMobileAnimationSchedulerResult {
  state: SchedulerState;
  controls: SchedulerControls;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONFIG: SchedulerConfig = {
  targetFrameTimeMs: 16.67,
  maxAnimationsPerFrame: 20,
  batteryAware: true,
  lowBatteryThreshold: 0.2,
  thermalThrottling: true,
  pauseOnBackground: true,
  defaultStaggerMs: 50,
  enableFrameSkipping: true,
  maxSkipFrames: 2,
};

const DEFAULT_BUDGET: FrameBudgetInfo = {
  targetMs: 16.67,
  usedMs: 0,
  remainingMs: 16.67,
  isOverBudget: false,
  throttleLevel: 0,
};

const DEFAULT_CONDITIONS: DeviceConditions = {
  batteryLevel: null,
  isCharging: true,
  thermalState: "nominal",
  memoryPressure: "normal",
};

const DEFAULT_METRICS: SchedulerMetrics = {
  totalAnimations: 0,
  activeAnimations: 0,
  completedAnimations: 0,
  cancelledAnimations: 0,
  framesProcessed: 0,
  framesSkipped: 0,
  averageFrameTime: 0,
  budgetOverruns: 0,
};

// ============================================================================
// Easing Functions
// ============================================================================

export const EASING = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => --t * t * t + 1,
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeOutElastic: (t: number) => {
    const p = 0.3;
    return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
  },
  easeOutBounce: (t: number) => {
    if (t < 1 / 2.75) {
      return 7.5625 * t * t;
    } else if (t < 2 / 2.75) {
      return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    } else if (t < 2.5 / 2.75) {
      return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    } else {
      return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    }
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

// Animation ID counter (more efficient than Date.now() for unique IDs)
let animationIdCounter = 0;

/**
 * Generate unique animation ID
 */
function generateAnimationId(): string {
  return `anim_${++animationIdCounter}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get priority order (lower = higher priority)
 */
function getPriorityOrder(priority: AnimationPriority): number {
  const order: Record<AnimationPriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
    deferred: 4,
  };
  return order[priority];
}

/**
 * Should skip frame based on priority and throttle
 */
function shouldSkipFrame(
  priority: AnimationPriority,
  frameCount: number,
  throttleLevel: number,
  maxSkip: number
): boolean {
  if (priority === "critical") return false;
  if (priority === "high" && throttleLevel < 2) return false;

  const skipInterval = Math.min(1 + throttleLevel, maxSkip + 1);

  if (priority === "normal") {
    return frameCount % skipInterval !== 0;
  }

  if (priority === "low") {
    return frameCount % (skipInterval * 2) !== 0;
  }

  return true; // Deferred
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that schedules animations with mobile-optimized frame management
 */
export function useMobileAnimationScheduler(
  config: Partial<SchedulerConfig> = {}
): UseMobileAnimationSchedulerResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [frameBudget, setFrameBudget] = useState<FrameBudgetInfo>(DEFAULT_BUDGET);
  const [deviceConditions, setDeviceConditions] = useState<DeviceConditions>(DEFAULT_CONDITIONS);
  const [metrics, setMetrics] = useState<SchedulerMetrics>(DEFAULT_METRICS);
  const [throttleMultiplier, setThrottleMultiplier] = useState(1);

  // Refs
  const animationsRef = useRef<Map<string, ScheduledAnimation>>(new Map());
  const groupsRef = useRef<Map<string, AnimationGroup>>(new Map());
  const rafIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);
  const throttleLevelRef = useRef<number>(0);

  /**
   * Update device conditions
   */
  const updateDeviceConditions = useCallback(() => {
    // Check battery
    if ("getBattery" in navigator) {
      (navigator as Navigator & { getBattery: () => Promise<{ level: number; charging: boolean }> })
        .getBattery()
        .then((battery) => {
          setDeviceConditions((prev) => ({
            ...prev,
            batteryLevel: battery.level,
            isCharging: battery.charging,
          }));

          // Auto-throttle on low battery
          if (
            mergedConfig.batteryAware &&
            battery.level < mergedConfig.lowBatteryThreshold &&
            !battery.charging
          ) {
            throttleLevelRef.current = Math.max(throttleLevelRef.current, 1);
          }
        })
        .catch(() => {
          // Battery API not available
        });
    }
  }, [mergedConfig.batteryAware, mergedConfig.lowBatteryThreshold]);

  /**
   * Process animations for current frame
   */
  const processFrame = useCallback(
    (timestamp: number) => {
      if (isPaused) {
        rafIdRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const frameStart = performance.now();
      const deltaTime = lastFrameTimeRef.current
        ? timestamp - lastFrameTimeRef.current
        : 16.67;
      lastFrameTimeRef.current = timestamp;
      frameCountRef.current++;

      const animations = animationsRef.current;
      let budgetUsed = 0;
      let processedCount = 0;
      let skippedCount = 0;

      // Sort by priority
      const sortedAnimations = Array.from(animations.values())
        .filter((a) => a.state === "running")
        .sort((a, b) => getPriorityOrder(a.priority) - getPriorityOrder(b.priority));

      for (const animation of sortedAnimations) {
        // Check if we should skip this frame
        if (
          mergedConfig.enableFrameSkipping &&
          shouldSkipFrame(
            animation.priority,
            frameCountRef.current,
            throttleLevelRef.current,
            mergedConfig.maxSkipFrames
          )
        ) {
          skippedCount++;
          continue;
        }

        // Check frame budget
        if (
          processedCount >= mergedConfig.maxAnimationsPerFrame ||
          budgetUsed >= mergedConfig.targetFrameTimeMs * 0.8
        ) {
          break;
        }

        // Check stagger delay
        if (animation.staggerDelay && animation.staggerIndex) {
          const staggerTime = animation.staggerDelay * animation.staggerIndex;
          if (animation.elapsed < staggerTime) {
            animation.elapsed += deltaTime;
            continue;
          }
        }

        // Update animation
        const animStart = performance.now();

        animation.elapsed += deltaTime * throttleMultiplier;
        animation.progress = Math.min(animation.elapsed / animation.duration, 1);

        const easedProgress = animation.easing(animation.progress);

        try {
          animation.callback(easedProgress, deltaTime);
        } catch (error) {
          console.error("Animation callback error:", error);
        }

        budgetUsed += performance.now() - animStart;
        processedCount++;

        // Check completion
        if (animation.progress >= 1) {
          animation.state = "completed";
          animation.onComplete?.();

          setMetrics((prev) => ({
            ...prev,
            completedAnimations: prev.completedAnimations + 1,
            activeAnimations: prev.activeAnimations - 1,
          }));
        }

        // Check deadline
        if (animation.deadline && timestamp > animation.deadline) {
          animation.progress = 1;
          animation.state = "completed";
          animation.callback(1, deltaTime);
          animation.onComplete?.();
        }
      }

      // Remove completed animations
      for (const [id, animation] of animations) {
        if (animation.state === "completed" || animation.state === "cancelled") {
          animations.delete(id);
        }
      }

      // Update budget info
      const frameTime = performance.now() - frameStart;
      const isOverBudget = frameTime > mergedConfig.targetFrameTimeMs;

      frameTimesRef.current.push(frameTime);
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift();
      }

      // Auto-adjust throttle level
      if (isOverBudget) {
        throttleLevelRef.current = Math.min(throttleLevelRef.current + 1, 3);
      } else if (frameTime < mergedConfig.targetFrameTimeMs * 0.5) {
        throttleLevelRef.current = Math.max(throttleLevelRef.current - 1, 0);
      }

      setFrameBudget({
        targetMs: mergedConfig.targetFrameTimeMs,
        usedMs: budgetUsed,
        remainingMs: Math.max(0, mergedConfig.targetFrameTimeMs - budgetUsed),
        isOverBudget,
        throttleLevel: throttleLevelRef.current,
      });

      setMetrics((prev) => ({
        ...prev,
        framesProcessed: prev.framesProcessed + 1,
        framesSkipped: prev.framesSkipped + skippedCount,
        averageFrameTime:
          frameTimesRef.current.reduce((a, b) => a + b, 0) /
          frameTimesRef.current.length,
        budgetOverruns: prev.budgetOverruns + (isOverBudget ? 1 : 0),
      }));

      // Continue loop if animations remain
      if (animations.size > 0) {
        rafIdRef.current = requestAnimationFrame(processFrame);
      } else {
        setIsRunning(false);
      }
    },
    [isPaused, mergedConfig, throttleMultiplier]
  );

  /**
   * Start the scheduler loop
   */
  const startLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;

    setIsRunning(true);
    rafIdRef.current = requestAnimationFrame(processFrame);
  }, [processFrame]);

  /**
   * Schedule an animation
   */
  const schedule = useCallback(
    (
      callback: (progress: number, deltaTime: number) => void,
      options: AnimationOptions = {}
    ): string => {
      const id = generateAnimationId();
      const animation: ScheduledAnimation = {
        id,
        priority: options.priority ?? "normal",
        state: "running",
        startTime: performance.now(),
        duration: options.duration ?? 300,
        elapsed: 0,
        progress: 0,
        callback,
        onComplete: options.onComplete,
        easing: options.easing ?? EASING.easeOutQuad,
        groupId: options.groupId,
        deadline: options.deadline,
        staggerDelay: options.staggerDelay,
        staggerIndex: options.staggerIndex,
      };

      animationsRef.current.set(id, animation);

      setMetrics((prev) => ({
        ...prev,
        totalAnimations: prev.totalAnimations + 1,
        activeAnimations: prev.activeAnimations + 1,
      }));

      // Add to group if specified
      if (options.groupId) {
        const group = groupsRef.current.get(options.groupId);
        if (group) {
          group.animations.push(id);
        }
      }

      // Start loop if not running
      startLoop();

      return id;
    },
    [startLoop]
  );

  /**
   * Cancel an animation
   */
  const cancel = useCallback((animationId: string): boolean => {
    const animation = animationsRef.current.get(animationId);
    if (!animation) return false;

    animation.state = "cancelled";

    setMetrics((prev) => ({
      ...prev,
      cancelledAnimations: prev.cancelledAnimations + 1,
      activeAnimations: Math.max(0, prev.activeAnimations - 1),
    }));

    return true;
  }, []);

  /**
   * Pause an animation
   */
  const pause = useCallback((animationId: string): boolean => {
    const animation = animationsRef.current.get(animationId);
    if (!animation || animation.state !== "running") return false;

    animation.state = "paused";
    return true;
  }, []);

  /**
   * Resume an animation
   */
  const resume = useCallback((animationId: string): boolean => {
    const animation = animationsRef.current.get(animationId);
    if (!animation || animation.state !== "paused") return false;

    animation.state = "running";
    startLoop();
    return true;
  }, [startLoop]);

  /**
   * Create animation group
   */
  const createGroup = useCallback(
    (groupId: string, synchronize: boolean = true, staggerMs?: number) => {
      groupsRef.current.set(groupId, {
        id: groupId,
        animations: [],
        state: "pending",
        synchronize,
        staggerMs: staggerMs ?? mergedConfig.defaultStaggerMs,
      });
    },
    [mergedConfig.defaultStaggerMs]
  );

  /**
   * Add animation to group
   */
  const addToGroup = useCallback((animationId: string, groupId: string): boolean => {
    const group = groupsRef.current.get(groupId);
    const animation = animationsRef.current.get(animationId);

    if (!group || !animation) return false;

    group.animations.push(animationId);
    animation.groupId = groupId;
    animation.staggerIndex = group.animations.length - 1;
    animation.staggerDelay = group.staggerMs;

    return true;
  }, []);

  /**
   * Remove animation from group
   */
  const removeFromGroup = useCallback((animationId: string): boolean => {
    const animation = animationsRef.current.get(animationId);
    if (!animation || !animation.groupId) return false;

    const group = groupsRef.current.get(animation.groupId);
    if (group) {
      group.animations = group.animations.filter((id) => id !== animationId);
    }

    animation.groupId = undefined;
    animation.staggerIndex = undefined;
    animation.staggerDelay = undefined;

    return true;
  }, []);

  /**
   * Start a group
   */
  const startGroup = useCallback((groupId: string) => {
    const group = groupsRef.current.get(groupId);
    if (!group) return;

    group.state = "running";

    for (const animId of group.animations) {
      const animation = animationsRef.current.get(animId);
      if (animation && animation.state === "pending") {
        animation.state = "running";
      }
    }

    startLoop();
  }, [startLoop]);

  /**
   * Pause a group
   */
  const pauseGroup = useCallback((groupId: string) => {
    const group = groupsRef.current.get(groupId);
    if (!group) return;

    group.state = "paused";

    for (const animId of group.animations) {
      const animation = animationsRef.current.get(animId);
      if (animation && animation.state === "running") {
        animation.state = "paused";
      }
    }
  }, []);

  /**
   * Cancel a group
   */
  const cancelGroup = useCallback((groupId: string) => {
    const group = groupsRef.current.get(groupId);
    if (!group) return;

    group.state = "cancelled";

    for (const animId of group.animations) {
      cancel(animId);
    }

    groupsRef.current.delete(groupId);
  }, [cancel]);

  /**
   * Pause all animations
   */
  const pauseAll = useCallback(() => {
    setIsPaused(true);
  }, []);

  /**
   * Resume all animations
   */
  const resumeAll = useCallback(() => {
    setIsPaused(false);
  }, []);

  /**
   * Cancel all animations
   */
  const cancelAll = useCallback(() => {
    for (const animation of animationsRef.current.values()) {
      animation.state = "cancelled";
    }
    animationsRef.current.clear();
    groupsRef.current.clear();

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    setIsRunning(false);
    setMetrics((prev) => ({
      ...prev,
      activeAnimations: 0,
    }));
  }, []);

  /**
   * Get animation by ID
   */
  const getAnimation = useCallback((animationId: string) => {
    return animationsRef.current.get(animationId);
  }, []);

  /**
   * Force throttle level
   */
  const setThrottleLevel = useCallback((level: number) => {
    throttleLevelRef.current = Math.max(0, Math.min(level, 3));
    setThrottleMultiplier(1 / (1 + throttleLevelRef.current * 0.5));
  }, []);

  // Handle visibility change
  useEffect(() => {
    if (!mergedConfig.pauseOnBackground) return;

    const handleVisibility = () => {
      if (document.hidden) {
        pauseAll();
      } else {
        resumeAll();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [mergedConfig.pauseOnBackground, pauseAll, resumeAll]);

  // Update device conditions periodically
  useEffect(() => {
    updateDeviceConditions();
    const interval = setInterval(updateDeviceConditions, 30000);
    return () => clearInterval(interval);
  }, [updateDeviceConditions]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Build state
  const state: SchedulerState = useMemo(
    () => ({
      isRunning,
      isPaused,
      animations: animationsRef.current,
      groups: groupsRef.current,
      frameBudget,
      deviceConditions,
      metrics,
      throttleMultiplier,
    }),
    [isRunning, isPaused, frameBudget, deviceConditions, metrics, throttleMultiplier]
  );

  // Build controls
  const controls: SchedulerControls = useMemo(
    () => ({
      schedule,
      cancel,
      pause,
      resume,
      createGroup,
      addToGroup,
      removeFromGroup,
      startGroup,
      pauseGroup,
      cancelGroup,
      pauseAll,
      resumeAll,
      cancelAll,
      getAnimation,
      setThrottleLevel,
    }),
    [
      schedule,
      cancel,
      pause,
      resume,
      createGroup,
      addToGroup,
      removeFromGroup,
      startGroup,
      pauseGroup,
      cancelGroup,
      pauseAll,
      resumeAll,
      cancelAll,
      getAnimation,
      setThrottleLevel,
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
 * Simple animation hook
 */
export function useScheduledAnimation(
  duration: number = 300,
  easing: EasingFunction = EASING.easeOutQuad
): {
  animate: (callback: (progress: number) => void, onComplete?: () => void) => string;
  cancel: (id: string) => void;
  isAnimating: boolean;
} {
  const { state, controls } = useMobileAnimationScheduler();

  const animate = useCallback(
    (callback: (progress: number) => void, onComplete?: () => void) => {
      return controls.schedule((progress) => callback(progress), {
        duration,
        easing,
        onComplete,
      });
    },
    [controls, duration, easing]
  );

  return {
    animate,
    cancel: controls.cancel,
    isAnimating: state.isRunning,
  };
}

/**
 * Staggered animation hook
 */
export function useStaggeredAnimation(
  staggerMs: number = 50
): {
  scheduleGroup: (
    callbacks: Array<(progress: number) => void>,
    duration?: number,
    onAllComplete?: () => void
  ) => string[];
  cancelGroup: (ids: string[]) => void;
} {
  const { controls } = useMobileAnimationScheduler();
  const groupIdRef = useRef(0);

  const scheduleGroup = useCallback(
    (
      callbacks: Array<(progress: number) => void>,
      duration: number = 300,
      onAllComplete?: () => void
    ) => {
      const groupId = `stagger_${++groupIdRef.current}`;
      controls.createGroup(groupId, false, staggerMs);

      let completedCount = 0;
      const total = callbacks.length;

      const ids = callbacks.map((callback, index) => {
        return controls.schedule((progress) => callback(progress), {
          duration,
          groupId,
          staggerIndex: index,
          staggerDelay: staggerMs,
          onComplete: () => {
            completedCount++;
            if (completedCount === total && onAllComplete) {
              onAllComplete();
            }
          },
        });
      });

      controls.startGroup(groupId);

      return ids;
    },
    [controls, staggerMs]
  );

  const cancelGroup = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        controls.cancel(id);
      }
    },
    [controls]
  );

  return {
    scheduleGroup,
    cancelGroup,
  };
}

// ============================================================================
// Exports
// ============================================================================

export default useMobileAnimationScheduler;
