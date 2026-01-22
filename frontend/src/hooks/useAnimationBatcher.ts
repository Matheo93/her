"use client";

/**
 * useAnimationBatcher - Animation Frame Batching for Mobile Performance
 *
 * Batches multiple animation updates into single requestAnimationFrame calls
 * to reduce overhead on mobile devices.
 *
 * Sprint 232: Avatar UX and mobile latency improvements
 *
 * Key features:
 * - Batches multiple animations per frame
 * - Priority-based update ordering
 * - Automatic throttling based on device capability
 * - Memory-efficient update queue
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useMobileDetect } from "./useMobileDetect";
import { useVisibility } from "./useVisibility";

type AnimationPriority = "critical" | "high" | "normal" | "low" | "idle";

interface AnimationUpdate {
  id: string;
  callback: (deltaTime: number) => void;
  priority: AnimationPriority;
  lastRun: number;
  minInterval: number;
}

interface BatchedAnimationState {
  // Whether batching is active
  isActive: boolean;

  // Current frame number
  frameCount: number;

  // Average time spent per frame (ms)
  avgFrameTime: number;

  // Number of updates processed this frame
  updatesThisFrame: number;

  // Number of updates skipped due to throttling
  skippedUpdates: number;
}

interface BatchedAnimationControls {
  // Register an animation callback
  register: (
    id: string,
    callback: (deltaTime: number) => void,
    options?: {
      priority?: AnimationPriority;
      minIntervalMs?: number;
    }
  ) => void;

  // Unregister an animation callback
  unregister: (id: string) => void;

  // Force run all pending updates
  flush: () => void;

  // Pause all animations
  pause: () => void;

  // Resume animations
  resume: () => void;

  // Clear all registered animations
  clear: () => void;
}

interface UseAnimationBatcherOptions {
  // Maximum frame time budget in ms (default: 16ms for 60fps)
  frameBudgetMs?: number;

  // Enable adaptive throttling based on performance
  adaptiveThrottling?: boolean;

  // Minimum FPS to maintain
  minFps?: number;

  // Auto-start the batcher
  autoStart?: boolean;

  // Callback when frame budget is exceeded
  onBudgetExceeded?: (actualTime: number, budget: number) => void;
}

interface UseAnimationBatcherResult {
  state: BatchedAnimationState;
  controls: BatchedAnimationControls;
}

// Priority weights (higher = run first)
const PRIORITY_WEIGHTS: Record<AnimationPriority, number> = {
  critical: 5,
  high: 4,
  normal: 3,
  low: 2,
  idle: 1,
};

// Default intervals by priority (ms)
const DEFAULT_INTERVALS: Record<AnimationPriority, number> = {
  critical: 0,    // Every frame
  high: 16,       // ~60fps
  normal: 33,     // ~30fps
  low: 66,        // ~15fps
  idle: 200,      // ~5fps
};

export function useAnimationBatcher(
  options: UseAnimationBatcherOptions = {}
): UseAnimationBatcherResult {
  const {
    frameBudgetMs = 16,
    adaptiveThrottling = true,
    minFps = 24,
    autoStart = true,
    onBudgetExceeded,
  } = options;

  const { isMobile } = useMobileDetect();
  const visibility = useVisibility();

  // Animation updates registry
  const updatesRef = useRef<Map<string, AnimationUpdate>>(new Map());

  // Frame timing
  const lastFrameTimeRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);
  const rafRef = useRef<number>(0);

  // State
  const [isRunning, setIsRunning] = useState(autoStart);
  const [frameCount, setFrameCount] = useState(0);
  const [avgFrameTime, setAvgFrameTime] = useState(0);
  const [updatesThisFrame, setUpdatesThisFrame] = useState(0);
  const [skippedUpdates, setSkippedUpdates] = useState(0);

  // Calculate adaptive frame budget based on recent performance
  const adaptiveBudget = useMemo(() => {
    if (!adaptiveThrottling || frameTimesRef.current.length === 0) {
      return frameBudgetMs;
    }

    const recentAvg = frameTimesRef.current.slice(-10).reduce((a, b) => a + b, 0) / 10;

    // If we're exceeding budget, reduce it to maintain FPS
    if (recentAvg > frameBudgetMs * 1.5) {
      return frameBudgetMs * 0.8;
    }

    // If we have headroom, allow slightly more
    if (recentAvg < frameBudgetMs * 0.5) {
      return frameBudgetMs * 1.1;
    }

    return frameBudgetMs;
  }, [frameBudgetMs, adaptiveThrottling]);

  // Main animation loop
  const tick = useCallback((timestamp: number) => {
    if (!isRunning) return;

    const deltaTime = timestamp - (lastFrameTimeRef.current || timestamp);
    lastFrameTimeRef.current = timestamp;

    const frameStartTime = performance.now();
    let updatesProcessed = 0;
    let updatesSkipped = 0;

    // Get all updates sorted by priority
    const updates = Array.from(updatesRef.current.values())
      .sort((a, b) => PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority]);

    // Process updates within budget
    for (const update of updates) {
      // Check if we've exceeded budget
      const elapsed = performance.now() - frameStartTime;
      if (elapsed >= adaptiveBudget && updatesProcessed > 0) {
        // Allow at least one critical update even if over budget
        if (update.priority !== "critical") {
          updatesSkipped++;
          continue;
        }
      }

      // Check if enough time has passed since last run
      const timeSinceLastRun = timestamp - update.lastRun;
      if (timeSinceLastRun < update.minInterval) {
        // Skip this update but don't count as "skipped" (it's throttled)
        continue;
      }

      // Run the update
      try {
        update.callback(deltaTime);
        update.lastRun = timestamp;
        updatesProcessed++;
      } catch (error) {
        console.error(`[AnimationBatcher] Error in animation "${update.id}":`, error);
      }
    }

    const frameTime = performance.now() - frameStartTime;

    // Track frame times
    frameTimesRef.current.push(frameTime);
    if (frameTimesRef.current.length > 60) {
      frameTimesRef.current.shift();
    }

    // Update state (throttled to every 10 frames to reduce re-renders)
    if (frameCount % 10 === 0) {
      const avg = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
      setAvgFrameTime(avg);
    }
    setFrameCount((c) => c + 1);
    setUpdatesThisFrame(updatesProcessed);
    setSkippedUpdates((s) => s + updatesSkipped);

    // Notify if budget exceeded
    if (frameTime > frameBudgetMs && onBudgetExceeded) {
      onBudgetExceeded(frameTime, frameBudgetMs);
    }

    // Schedule next frame
    rafRef.current = requestAnimationFrame(tick);
  }, [isRunning, adaptiveBudget, frameBudgetMs, frameCount, onBudgetExceeded]);

  // Start/stop animation loop
  useEffect(() => {
    if (isRunning && visibility.isVisible) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isRunning, visibility.isVisible, tick]);

  // Control functions
  const register = useCallback(
    (
      id: string,
      callback: (deltaTime: number) => void,
      registerOptions?: {
        priority?: AnimationPriority;
        minIntervalMs?: number;
      }
    ) => {
      const priority = registerOptions?.priority || "normal";
      const minInterval = registerOptions?.minIntervalMs ??
        (isMobile ? DEFAULT_INTERVALS[priority] * 1.5 : DEFAULT_INTERVALS[priority]);

      updatesRef.current.set(id, {
        id,
        callback,
        priority,
        lastRun: 0,
        minInterval,
      });
    },
    [isMobile]
  );

  const unregister = useCallback((id: string) => {
    updatesRef.current.delete(id);
  }, []);

  const flush = useCallback(() => {
    const now = performance.now();
    for (const update of updatesRef.current.values()) {
      try {
        update.callback(0);
        update.lastRun = now;
      } catch (error) {
        console.error(`[AnimationBatcher] Error flushing "${update.id}":`, error);
      }
    }
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
  }, []);

  const resume = useCallback(() => {
    setIsRunning(true);
    lastFrameTimeRef.current = 0;
  }, []);

  const clear = useCallback(() => {
    updatesRef.current.clear();
    frameTimesRef.current = [];
    setFrameCount(0);
    setAvgFrameTime(0);
    setUpdatesThisFrame(0);
    setSkippedUpdates(0);
  }, []);

  const state: BatchedAnimationState = {
    isActive: isRunning && visibility.isVisible,
    frameCount,
    avgFrameTime,
    updatesThisFrame,
    skippedUpdates,
  };

  const controls: BatchedAnimationControls = {
    register,
    unregister,
    flush,
    pause,
    resume,
    clear,
  };

  return { state, controls };
}

/**
 * Hook to easily register a single animation with the batcher
 */
export function useBatchedAnimation(
  batcher: BatchedAnimationControls,
  id: string,
  callback: (deltaTime: number) => void,
  options?: {
    priority?: AnimationPriority;
    minIntervalMs?: number;
    enabled?: boolean;
  }
): void {
  const { enabled = true, ...registerOptions } = options || {};
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      batcher.unregister(id);
      return;
    }

    batcher.register(id, (dt) => callbackRef.current(dt), registerOptions);

    return () => {
      batcher.unregister(id);
    };
  }, [batcher, id, enabled, registerOptions?.priority, registerOptions?.minIntervalMs]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Create a shared animation batcher for the entire app
 */
let globalBatcher: UseAnimationBatcherResult | null = null;

export function useGlobalAnimationBatcher(): UseAnimationBatcherResult {
  const batcher = useAnimationBatcher({
    autoStart: true,
    adaptiveThrottling: true,
  });

  // On first call, store globally
  if (!globalBatcher) {
    globalBatcher = batcher;
  }

  return globalBatcher;
}

// Export types
export type {
  AnimationPriority,
  AnimationUpdate,
  BatchedAnimationState,
  BatchedAnimationControls,
  UseAnimationBatcherOptions,
  UseAnimationBatcherResult,
};
