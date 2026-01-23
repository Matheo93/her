/**
 * useAvatarRenderScheduler - Avatar Render Scheduling Hook
 *
 * Sprint 516 (Iteration 2): Optimizes avatar rendering for mobile by
 * intelligently scheduling render updates based on:
 * - Frame budget management
 * - Priority-based update queuing
 * - Visibility-aware rendering
 * - Battery/thermal throttling
 * - Animation interpolation between frames
 *
 * @example
 * ```tsx
 * const { controls, state, metrics } = useAvatarRenderScheduler({
 *   targetFPS: 60,
 *   frameBudgetMs: 12,
 * });
 *
 * // Schedule a high-priority render
 * controls.scheduleRender({
 *   priority: 'high',
 *   update: () => updateAvatarPose(newPose),
 * });
 *
 * // Check if we should render this frame
 * if (controls.shouldRenderThisFrame()) {
 *   renderAvatar();
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Render priority levels
 */
export type RenderPriority = "critical" | "high" | "normal" | "low" | "idle";

/**
 * Render phase
 */
export type RenderPhase =
  | "idle"
  | "scheduled"
  | "updating"
  | "rendering"
  | "compositing"
  | "complete";

/**
 * Visibility state
 */
export type VisibilityState = "visible" | "partial" | "hidden" | "background";

/**
 * Throttle reason
 */
export type ThrottleReason =
  | "none"
  | "low_battery"
  | "thermal"
  | "background"
  | "hidden"
  | "low_fps"
  | "user_preference";

/**
 * Scheduled render update
 */
export interface ScheduledRender {
  id: string;
  priority: RenderPriority;
  update: () => void;
  deadline: number;
  scheduledAt: number;
  dependencies?: string[];
  canDefer: boolean;
  estimatedCostMs: number;
}

/**
 * Frame budget info
 */
export interface FrameBudget {
  totalMs: number;
  usedMs: number;
  remainingMs: number;
  updateBudgetMs: number;
  renderBudgetMs: number;
  isOverBudget: boolean;
}

/**
 * Frame timing stats
 */
export interface FrameStats {
  frameNumber: number;
  timestamp: number;
  deltaMs: number;
  updateTimeMs: number;
  renderTimeMs: number;
  totalTimeMs: number;
  droppedFrames: number;
  jitterMs: number;
}

/**
 * Scheduler state
 */
export interface SchedulerState {
  isActive: boolean;
  currentPhase: RenderPhase;
  queueSize: number;
  currentFPS: number;
  targetFPS: number;
  visibility: VisibilityState;
  throttleReason: ThrottleReason;
  isThrottled: boolean;
  frameBudget: FrameBudget;
}

/**
 * Scheduler metrics
 */
export interface SchedulerMetrics {
  totalFrames: number;
  droppedFrames: number;
  averageFPS: number;
  averageFrameTimeMs: number;
  p95FrameTimeMs: number;
  totalUpdatesScheduled: number;
  updatesDeferred: number;
  updatesDropped: number;
  throttledFrames: number;
  overBudgetFrames: number;
  frameStats: FrameStats[];
}

/**
 * Scheduler config
 */
export interface SchedulerConfig {
  /** Target frames per second */
  targetFPS: number;
  /** Frame budget in ms (time available for updates) */
  frameBudgetMs: number;
  /** Percentage of frame budget for updates vs render */
  updateBudgetRatio: number;
  /** Enable visibility-aware rendering */
  visibilityAware: boolean;
  /** Enable battery/thermal throttling */
  enableThrottling: boolean;
  /** Minimum FPS before throttling */
  minFPS: number;
  /** Maximum queue size before dropping */
  maxQueueSize: number;
  /** Enable frame interpolation */
  enableInterpolation: boolean;
  /** Stats sample window size */
  statsSampleWindow: number;
  /** Defer low-priority updates when busy */
  deferLowPriority: boolean;
  /** Auto-adjust target FPS based on performance */
  adaptiveTargetFPS: boolean;
}

/**
 * Scheduler controls
 */
export interface SchedulerControls {
  /** Schedule a render update */
  scheduleRender: (render: Omit<ScheduledRender, "id" | "scheduledAt">) => string;
  /** Cancel a scheduled render */
  cancelRender: (id: string) => boolean;
  /** Check if should render this frame */
  shouldRenderThisFrame: () => boolean;
  /** Mark update start */
  markUpdateStart: () => void;
  /** Mark update end */
  markUpdateEnd: () => void;
  /** Mark render start */
  markRenderStart: () => void;
  /** Mark render end */
  markRenderEnd: () => void;
  /** Process scheduled renders */
  processQueue: () => void;
  /** Get interpolation factor for smooth animation */
  getInterpolationFactor: () => number;
  /** Pause scheduling */
  pause: () => void;
  /** Resume scheduling */
  resume: () => void;
  /** Set visibility state */
  setVisibility: (state: VisibilityState) => void;
  /** Force throttle */
  forceThrottle: (reason: ThrottleReason) => void;
  /** Clear throttle */
  clearThrottle: () => void;
  /** Reset metrics */
  resetMetrics: () => void;
  /** Get current frame budget */
  getFrameBudget: () => FrameBudget;
}

/**
 * Hook result
 */
export interface UseAvatarRenderSchedulerResult {
  state: SchedulerState;
  metrics: SchedulerMetrics;
  controls: SchedulerControls;
}

// ============================================================================
// Constants
// ============================================================================

const PRIORITY_ORDER: Record<RenderPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  idle: 4,
};

const DEFAULT_CONFIG: SchedulerConfig = {
  targetFPS: 60,
  frameBudgetMs: 12,
  updateBudgetRatio: 0.6,
  visibilityAware: true,
  enableThrottling: true,
  minFPS: 24,
  maxQueueSize: 100,
  enableInterpolation: true,
  statsSampleWindow: 60,
  deferLowPriority: true,
  adaptiveTargetFPS: true,
};

// ============================================================================
// Utility Functions
// ============================================================================

function generateRenderId(): string {
  return `r-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
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
 * Avatar render scheduling hook
 */
export function useAvatarRenderScheduler(
  config: Partial<SchedulerConfig> = {},
  callbacks?: {
    onFrameComplete?: (stats: FrameStats) => void;
    onFrameDrop?: (count: number) => void;
    onThrottleChange?: (reason: ThrottleReason) => void;
    onOverBudget?: (budget: FrameBudget) => void;
    onVisibilityChange?: (state: VisibilityState) => void;
  }
): UseAvatarRenderSchedulerResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [isActive, setIsActive] = useState(true);
  const [currentPhase, setCurrentPhase] = useState<RenderPhase>("idle");
  const [visibility, setVisibility] = useState<VisibilityState>("visible");
  const [throttleReason, setThrottleReason] = useState<ThrottleReason>("none");
  const [currentFPS, setCurrentFPS] = useState(fullConfig.targetFPS);

  // Metrics
  const [metrics, setMetrics] = useState<SchedulerMetrics>({
    totalFrames: 0,
    droppedFrames: 0,
    averageFPS: fullConfig.targetFPS,
    averageFrameTimeMs: 1000 / fullConfig.targetFPS,
    p95FrameTimeMs: 1000 / fullConfig.targetFPS,
    totalUpdatesScheduled: 0,
    updatesDeferred: 0,
    updatesDropped: 0,
    throttledFrames: 0,
    overBudgetFrames: 0,
    frameStats: [],
  });

  // Refs
  const queueRef = useRef<ScheduledRender[]>([]);
  const frameRequestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const updateStartRef = useRef<number>(0);
  const renderStartRef = useRef<number>(0);
  const frameStartRef = useRef<number>(0);
  const interpolationRef = useRef<number>(0);
  const adaptiveTargetFPSRef = useRef<number>(fullConfig.targetFPS);

  /**
   * Calculate frame budget
   */
  const calculateFrameBudget = useCallback((): FrameBudget => {
    const targetFrameTime = 1000 / adaptiveTargetFPSRef.current;
    const updateBudget = fullConfig.frameBudgetMs * fullConfig.updateBudgetRatio;
    const renderBudget = fullConfig.frameBudgetMs * (1 - fullConfig.updateBudgetRatio);

    const now = performance.now();
    const usedMs = now - frameStartRef.current;
    const remainingMs = Math.max(0, fullConfig.frameBudgetMs - usedMs);

    return {
      totalMs: fullConfig.frameBudgetMs,
      usedMs,
      remainingMs,
      updateBudgetMs: updateBudget,
      renderBudgetMs: renderBudget,
      isOverBudget: usedMs > fullConfig.frameBudgetMs,
    };
  }, [fullConfig]);

  /**
   * Check if should render this frame
   */
  const shouldRenderThisFrame = useCallback((): boolean => {
    if (!isActive) return false;
    if (visibility === "hidden" || visibility === "background") return false;
    if (throttleReason !== "none" && throttleReason !== "low_fps") {
      return frameCountRef.current % 2 === 0; // Render every other frame when throttled
    }
    return true;
  }, [isActive, visibility, throttleReason]);

  /**
   * Get interpolation factor
   */
  const getInterpolationFactor = useCallback((): number => {
    if (!fullConfig.enableInterpolation) return 1;
    return interpolationRef.current;
  }, [fullConfig.enableInterpolation]);

  /**
   * Schedule a render update
   */
  const scheduleRender = useCallback(
    (render: Omit<ScheduledRender, "id" | "scheduledAt">): string => {
      const id = generateRenderId();
      const scheduledRender: ScheduledRender = {
        ...render,
        id,
        scheduledAt: performance.now(),
      };

      // Check queue size
      if (queueRef.current.length >= fullConfig.maxQueueSize) {
        // Drop lowest priority
        const sortedQueue = [...queueRef.current].sort(
          (a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
        );
        const dropped = sortedQueue.pop();
        if (dropped) {
          queueRef.current = sortedQueue;
          setMetrics((prev) => ({
            ...prev,
            updatesDropped: prev.updatesDropped + 1,
          }));
        }
      }

      // Insert by priority
      const insertIndex = queueRef.current.findIndex(
        (r) => PRIORITY_ORDER[r.priority] > PRIORITY_ORDER[render.priority]
      );

      if (insertIndex === -1) {
        queueRef.current.push(scheduledRender);
      } else {
        queueRef.current.splice(insertIndex, 0, scheduledRender);
      }

      setMetrics((prev) => ({
        ...prev,
        totalUpdatesScheduled: prev.totalUpdatesScheduled + 1,
      }));

      return id;
    },
    [fullConfig.maxQueueSize]
  );

  /**
   * Cancel a scheduled render
   */
  const cancelRender = useCallback((id: string): boolean => {
    const index = queueRef.current.findIndex((r) => r.id === id);
    if (index !== -1) {
      queueRef.current.splice(index, 1);
      return true;
    }
    return false;
  }, []);

  /**
   * Mark update start
   */
  const markUpdateStart = useCallback((): void => {
    updateStartRef.current = performance.now();
    setCurrentPhase("updating");
  }, []);

  /**
   * Mark update end
   */
  const markUpdateEnd = useCallback((): void => {
    setCurrentPhase("scheduled");
  }, []);

  /**
   * Mark render start
   */
  const markRenderStart = useCallback((): void => {
    renderStartRef.current = performance.now();
    setCurrentPhase("rendering");
  }, []);

  /**
   * Mark render end
   */
  const markRenderEnd = useCallback((): void => {
    setCurrentPhase("complete");
  }, []);

  /**
   * Process scheduled renders within budget
   */
  const processQueue = useCallback((): void => {
    if (queueRef.current.length === 0) return;

    const budget = calculateFrameBudget();
    if (budget.isOverBudget) {
      callbacks?.onOverBudget?.(budget);
      setMetrics((prev) => ({
        ...prev,
        overBudgetFrames: prev.overBudgetFrames + 1,
      }));
      return;
    }

    const processStart = performance.now();
    let processed = 0;

    while (queueRef.current.length > 0) {
      const elapsed = performance.now() - processStart;
      if (elapsed >= budget.remainingMs * 0.8) break; // Leave 20% margin

      const render = queueRef.current[0];

      // Check if we should defer low priority
      if (
        fullConfig.deferLowPriority &&
        (render.priority === "low" || render.priority === "idle") &&
        elapsed > budget.remainingMs * 0.5
      ) {
        setMetrics((prev) => ({
          ...prev,
          updatesDeferred: prev.updatesDeferred + 1,
        }));
        break;
      }

      // Execute update
      queueRef.current.shift();
      try {
        render.update();
        processed++;
      } catch (error) {
        console.error("Render update error:", error);
      }
    }
  }, [fullConfig.deferLowPriority, calculateFrameBudget, callbacks]);

  /**
   * Frame loop
   */
  const frameLoop = useCallback(
    (timestamp: number) => {
      if (!isActive) return;

      frameStartRef.current = timestamp;
      const deltaMs = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;
      frameCountRef.current++;

      // Calculate interpolation factor
      const targetFrameTime = 1000 / adaptiveTargetFPSRef.current;
      interpolationRef.current = Math.min(1, deltaMs / targetFrameTime);

      // Check for dropped frames
      const expectedFrames = Math.round(deltaMs / targetFrameTime);
      const droppedFrames = Math.max(0, expectedFrames - 1);

      if (droppedFrames > 0) {
        callbacks?.onFrameDrop?.(droppedFrames);
      }

      // Update current FPS
      const instantFPS = 1000 / deltaMs;
      setCurrentFPS((prev) => prev * 0.9 + instantFPS * 0.1);

      // Adaptive FPS adjustment
      if (fullConfig.adaptiveTargetFPS) {
        if (instantFPS < fullConfig.minFPS) {
          adaptiveTargetFPSRef.current = Math.max(30, adaptiveTargetFPSRef.current - 5);
        } else if (instantFPS > adaptiveTargetFPSRef.current * 0.95) {
          adaptiveTargetFPSRef.current = Math.min(
            fullConfig.targetFPS,
            adaptiveTargetFPSRef.current + 1
          );
        }
      }

      // Process queue if should render
      if (shouldRenderThisFrame()) {
        setCurrentPhase("scheduled");
        processQueue();
      } else {
        setMetrics((prev) => ({
          ...prev,
          throttledFrames: prev.throttledFrames + 1,
        }));
      }

      // Record frame stats
      const frameStats: FrameStats = {
        frameNumber: frameCountRef.current,
        timestamp,
        deltaMs,
        updateTimeMs: renderStartRef.current - updateStartRef.current,
        renderTimeMs: performance.now() - renderStartRef.current,
        totalTimeMs: performance.now() - frameStartRef.current,
        droppedFrames,
        jitterMs: Math.abs(deltaMs - targetFrameTime),
      };

      setMetrics((prev) => {
        const newStats = [...prev.frameStats, frameStats].slice(
          -fullConfig.statsSampleWindow
        );
        const frameTimes = newStats.map((s) => s.totalTimeMs);
        const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;

        return {
          ...prev,
          totalFrames: prev.totalFrames + 1,
          droppedFrames: prev.droppedFrames + droppedFrames,
          averageFPS: 1000 / avgFrameTime,
          averageFrameTimeMs: avgFrameTime,
          p95FrameTimeMs: calculatePercentile(frameTimes, 95),
          frameStats: newStats,
        };
      });

      callbacks?.onFrameComplete?.(frameStats);

      setCurrentPhase("idle");

      // Schedule next frame
      frameRequestRef.current = requestAnimationFrame(frameLoop);
    },
    [
      isActive,
      fullConfig,
      shouldRenderThisFrame,
      processQueue,
      callbacks,
    ]
  );

  /**
   * Pause scheduling
   */
  const pause = useCallback((): void => {
    setIsActive(false);
    if (frameRequestRef.current !== null) {
      cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    }
  }, []);

  /**
   * Resume scheduling
   */
  const resume = useCallback((): void => {
    setIsActive(true);
    lastFrameTimeRef.current = performance.now();
    frameRequestRef.current = requestAnimationFrame(frameLoop);
  }, [frameLoop]);

  /**
   * Set visibility state
   */
  const setVisibilityState = useCallback(
    (state: VisibilityState): void => {
      setVisibility(state);
      callbacks?.onVisibilityChange?.(state);

      if (state === "hidden" || state === "background") {
        pause();
      } else if (state === "visible") {
        resume();
      }
    },
    [pause, resume, callbacks]
  );

  /**
   * Force throttle
   */
  const forceThrottle = useCallback(
    (reason: ThrottleReason): void => {
      setThrottleReason(reason);
      callbacks?.onThrottleChange?.(reason);
    },
    [callbacks]
  );

  /**
   * Clear throttle
   */
  const clearThrottle = useCallback((): void => {
    setThrottleReason("none");
    callbacks?.onThrottleChange?.("none");
  }, [callbacks]);

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback((): void => {
    setMetrics({
      totalFrames: 0,
      droppedFrames: 0,
      averageFPS: fullConfig.targetFPS,
      averageFrameTimeMs: 1000 / fullConfig.targetFPS,
      p95FrameTimeMs: 1000 / fullConfig.targetFPS,
      totalUpdatesScheduled: 0,
      updatesDeferred: 0,
      updatesDropped: 0,
      throttledFrames: 0,
      overBudgetFrames: 0,
      frameStats: [],
    });
    frameCountRef.current = 0;
    adaptiveTargetFPSRef.current = fullConfig.targetFPS;
  }, [fullConfig.targetFPS]);

  // Handle visibility change
  useEffect(() => {
    if (!fullConfig.visibilityAware || typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setVisibilityState("background");
      } else {
        setVisibilityState("visible");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fullConfig.visibilityAware, setVisibilityState]);

  // Start frame loop
  useEffect(() => {
    if (isActive) {
      lastFrameTimeRef.current = performance.now();
      frameRequestRef.current = requestAnimationFrame(frameLoop);
    }

    return () => {
      if (frameRequestRef.current !== null) {
        cancelAnimationFrame(frameRequestRef.current);
      }
    };
  }, [isActive, frameLoop]);

  // Compile state
  const state: SchedulerState = useMemo(
    () => ({
      isActive,
      currentPhase,
      queueSize: queueRef.current.length,
      currentFPS,
      targetFPS: adaptiveTargetFPSRef.current,
      visibility,
      throttleReason,
      isThrottled: throttleReason !== "none",
      frameBudget: calculateFrameBudget(),
    }),
    [isActive, currentPhase, currentFPS, visibility, throttleReason, calculateFrameBudget]
  );

  // Compile controls
  const controls: SchedulerControls = useMemo(
    () => ({
      scheduleRender,
      cancelRender,
      shouldRenderThisFrame,
      markUpdateStart,
      markUpdateEnd,
      markRenderStart,
      markRenderEnd,
      processQueue,
      getInterpolationFactor,
      pause,
      resume,
      setVisibility: setVisibilityState,
      forceThrottle,
      clearThrottle,
      resetMetrics,
      getFrameBudget: calculateFrameBudget,
    }),
    [
      scheduleRender,
      cancelRender,
      shouldRenderThisFrame,
      markUpdateStart,
      markUpdateEnd,
      markRenderStart,
      markRenderEnd,
      processQueue,
      getInterpolationFactor,
      pause,
      resume,
      setVisibilityState,
      forceThrottle,
      clearThrottle,
      resetMetrics,
      calculateFrameBudget,
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
 * Simple frame budget hook
 */
export function useFrameBudget(targetFPS = 60): FrameBudget {
  const { state } = useAvatarRenderScheduler({ targetFPS });
  return state.frameBudget;
}

/**
 * Render priority hook
 */
export function useRenderPriority(
  update: () => void,
  priority: RenderPriority = "normal",
  deps: unknown[] = []
): void {
  const { controls } = useAvatarRenderScheduler();

  useEffect(() => {
    const id = controls.scheduleRender({
      priority,
      update,
      deadline: performance.now() + 1000,
      canDefer: priority === "low" || priority === "idle",
      estimatedCostMs: 1,
    });

    return () => {
      controls.cancelRender(id);
    };
  }, deps);
}

/**
 * Adaptive FPS hook
 */
export function useAdaptiveFPS(): { current: number; target: number; isThrottled: boolean } {
  const { state } = useAvatarRenderScheduler({ adaptiveTargetFPS: true });

  return {
    current: state.currentFPS,
    target: state.targetFPS,
    isThrottled: state.isThrottled,
  };
}

export default useAvatarRenderScheduler;
