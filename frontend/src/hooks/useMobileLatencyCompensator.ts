/**
 * useMobileLatencyCompensator - Mobile Latency Compensation Hook
 *
 * Sprint 515 (Iteration 2): Improves perceived performance on mobile by
 * compensating for network latency with:
 * - Optimistic UI updates with rollback
 * - Skeleton states and shimmer effects
 * - Request timing prediction
 * - Adaptive timeout management
 * - Smooth transition animations during delays
 *
 * @example
 * ```tsx
 * const { compensate, rollback, state, showSkeleton } = useMobileLatencyCompensator({
 *   expectedLatencyMs: 300,
 *   skeletonThreshold: 200,
 * });
 *
 * // Make optimistic update
 * const { commit, rollback: undo } = compensate(
 *   () => setMessages([...messages, newMessage]),
 *   () => setMessages(messages)
 * );
 *
 * try {
 *   await sendMessage(newMessage);
 *   commit();
 * } catch {
 *   undo();
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Compensation state
 */
export type CompensationState =
  | "idle"
  | "optimistic"
  | "pending"
  | "confirming"
  | "committed"
  | "rolling_back"
  | "rolled_back";

/**
 * Latency level classification
 */
export type LatencyLevel = "fast" | "normal" | "slow" | "very_slow" | "timeout";

/**
 * UI hint for latency compensation
 */
export type UIHint =
  | "instant"
  | "show_spinner"
  | "show_skeleton"
  | "show_placeholder"
  | "reduce_animations";

/**
 * Optimistic update record
 */
export interface OptimisticUpdate<T = unknown> {
  id: string;
  state: CompensationState;
  optimisticValue: T;
  previousValue: T;
  applyFn: () => void;
  rollbackFn: () => void;
  startTime: number;
  commitTime: number | null;
  rollbackTime: number | null;
  latencyMs: number | null;
}

/**
 * Latency sample
 */
export interface LatencySample {
  timestamp: number;
  latencyMs: number;
  success: boolean;
  endpoint?: string;
}

/**
 * Latency prediction
 */
export interface LatencyPrediction {
  expectedMs: number;
  confidence: number;
  level: LatencyLevel;
  uiHint: UIHint;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
}

/**
 * Compensator metrics
 */
export interface CompensatorMetrics {
  totalUpdates: number;
  committedUpdates: number;
  rolledBackUpdates: number;
  averageLatencyMs: number;
  averageCommitTimeMs: number;
  rollbackRate: number;
  latencySamples: number;
  skeletonsShown: number;
  spinnersShown: number;
}

/**
 * Compensator configuration
 */
export interface CompensatorConfig {
  /** Expected latency for UI hints (ms) */
  expectedLatencyMs: number;
  /** Threshold to show skeleton (ms) */
  skeletonThreshold: number;
  /** Threshold to show spinner (ms) */
  spinnerThreshold: number;
  /** Timeout threshold (ms) */
  timeoutThreshold: number;
  /** Rolling window size for latency prediction */
  predictionWindowSize: number;
  /** Enable adaptive timeouts */
  adaptiveTimeouts: boolean;
  /** Minimum confidence for predictions */
  minPredictionConfidence: number;
  /** Auto-rollback on timeout */
  autoRollbackOnTimeout: boolean;
  /** Rollback animation duration (ms) */
  rollbackAnimationMs: number;
  /** Maximum pending updates */
  maxPendingUpdates: number;
}

/**
 * Compensator controls
 */
export interface CompensatorControls {
  /** Apply optimistic update */
  compensate: <T>(
    applyFn: () => void,
    rollbackFn: () => void,
    optimisticValue?: T,
    previousValue?: T
  ) => {
    updateId: string;
    commit: () => void;
    rollback: () => void;
    getState: () => CompensationState;
  };
  /** Commit a pending update */
  commit: (updateId: string) => void;
  /** Rollback an update */
  rollback: (updateId: string) => void;
  /** Record a latency sample */
  recordLatency: (latencyMs: number, success?: boolean, endpoint?: string) => void;
  /** Get latency prediction */
  predictLatency: (endpoint?: string) => LatencyPrediction;
  /** Get UI hint based on prediction */
  getUIHint: () => UIHint;
  /** Clear all pending updates */
  clearPending: () => void;
  /** Reset metrics */
  resetMetrics: () => void;
}

/**
 * Compensator state
 */
export interface CompensatorStateInfo {
  pendingUpdates: number;
  currentLatencyLevel: LatencyLevel;
  showSkeleton: boolean;
  showSpinner: boolean;
  isCompensating: boolean;
  prediction: LatencyPrediction;
}

/**
 * Hook result
 */
export interface UseMobileLatencyCompensatorResult {
  state: CompensatorStateInfo;
  metrics: CompensatorMetrics;
  controls: CompensatorControls;
  showSkeleton: boolean;
  showSpinner: boolean;
  latencyLevel: LatencyLevel;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: CompensatorConfig = {
  expectedLatencyMs: 300,
  skeletonThreshold: 200,
  spinnerThreshold: 100,
  timeoutThreshold: 10000,
  predictionWindowSize: 20,
  adaptiveTimeouts: true,
  minPredictionConfidence: 0.6,
  autoRollbackOnTimeout: true,
  rollbackAnimationMs: 300,
  maxPendingUpdates: 10,
};

const LATENCY_THRESHOLDS: Record<LatencyLevel, number> = {
  fast: 100,
  normal: 300,
  slow: 1000,
  very_slow: 3000,
  timeout: 10000,
};

// ============================================================================
// Utility Functions
// ============================================================================

// Update ID counter (more efficient than Date.now() for unique IDs)
let updateIdCounter = 0;

function generateUpdateId(): string {
  return `update-${++updateIdCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

function classifyLatency(latencyMs: number): LatencyLevel {
  if (latencyMs < LATENCY_THRESHOLDS.fast) return "fast";
  if (latencyMs < LATENCY_THRESHOLDS.normal) return "normal";
  if (latencyMs < LATENCY_THRESHOLDS.slow) return "slow";
  if (latencyMs < LATENCY_THRESHOLDS.very_slow) return "very_slow";
  return "timeout";
}

function getUIHintFromLatency(latencyMs: number, config: CompensatorConfig): UIHint {
  if (latencyMs < config.spinnerThreshold) return "instant";
  if (latencyMs < config.skeletonThreshold) return "show_spinner";
  if (latencyMs < config.timeoutThreshold) return "show_skeleton";
  return "show_placeholder";
}

function calculatePercentile(samples: number[], percentile: number): number {
  if (samples.length === 0) return 0;
  // Optimization: avoid spread + sort for small arrays by using slice
  const sorted = samples.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Mobile latency compensation hook for perceived performance
 */
export function useMobileLatencyCompensator(
  config: Partial<CompensatorConfig> = {},
  callbacks?: {
    onCompensate?: (updateId: string) => void;
    onCommit?: (updateId: string, latencyMs: number) => void;
    onRollback?: (updateId: string, reason: string) => void;
    onLatencyChange?: (level: LatencyLevel) => void;
    onSkeletonShow?: () => void;
    onSkeletonHide?: () => void;
  }
): UseMobileLatencyCompensatorResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [updates, setUpdates] = useState<Map<string, OptimisticUpdate>>(new Map());
  const [latencySamples, setLatencySamples] = useState<LatencySample[]>([]);
  const [currentLatencyLevel, setCurrentLatencyLevel] = useState<LatencyLevel>("normal");
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);

  // Metrics
  const [metrics, setMetrics] = useState<CompensatorMetrics>({
    totalUpdates: 0,
    committedUpdates: 0,
    rolledBackUpdates: 0,
    averageLatencyMs: 0,
    averageCommitTimeMs: 0,
    rollbackRate: 0,
    latencySamples: 0,
    skeletonsShown: 0,
    spinnersShown: 0,
  });

  // Refs
  const updatesRef = useRef<Map<string, OptimisticUpdate>>(new Map());
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Keep updates ref in sync
  useEffect(() => {
    updatesRef.current = updates;
  }, [updates]);

  /**
   * Calculate latency prediction from samples
   */
  const calculatePrediction = useCallback(
    (endpoint?: string): LatencyPrediction => {
      let relevantSamples = latencySamples;

      // Filter by endpoint if provided
      if (endpoint) {
        relevantSamples = relevantSamples.filter((s) => s.endpoint === endpoint);
      }

      // Use only recent samples within window
      const recentSamples = relevantSamples
        .slice(-fullConfig.predictionWindowSize)
        .filter((s) => s.success);

      if (recentSamples.length === 0) {
        return {
          expectedMs: fullConfig.expectedLatencyMs,
          confidence: 0,
          level: "normal",
          uiHint: getUIHintFromLatency(fullConfig.expectedLatencyMs, fullConfig),
          p50Ms: fullConfig.expectedLatencyMs,
          p90Ms: fullConfig.expectedLatencyMs * 2,
          p99Ms: fullConfig.expectedLatencyMs * 3,
        };
      }

      const latencies = recentSamples.map((s) => s.latencyMs);
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p50 = calculatePercentile(latencies, 50);
      const p90 = calculatePercentile(latencies, 90);
      const p99 = calculatePercentile(latencies, 99);

      // Calculate confidence based on sample size and variance
      const variance =
        latencies.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / latencies.length;
      const stdDev = Math.sqrt(variance);
      const coeffOfVariation = stdDev / avgLatency;

      // Confidence decreases with high variance and increases with sample size
      const sampleConfidence = Math.min(recentSamples.length / fullConfig.predictionWindowSize, 1);
      const varianceConfidence = Math.max(0, 1 - coeffOfVariation);
      const confidence = (sampleConfidence + varianceConfidence) / 2;

      const level = classifyLatency(avgLatency);
      const uiHint = getUIHintFromLatency(avgLatency, fullConfig);

      return {
        expectedMs: Math.round(avgLatency),
        confidence,
        level,
        uiHint,
        p50Ms: Math.round(p50),
        p90Ms: Math.round(p90),
        p99Ms: Math.round(p99),
      };
    },
    [latencySamples, fullConfig]
  );

  /**
   * Record a latency sample
   */
  const recordLatency = useCallback(
    (latencyMs: number, success = true, endpoint?: string) => {
      const sample: LatencySample = {
        timestamp: Date.now(),
        latencyMs,
        success,
        endpoint,
      };

      setLatencySamples((prev) => {
        const next = [...prev, sample];
        // Keep only recent samples
        if (next.length > fullConfig.predictionWindowSize * 2) {
          return next.slice(-fullConfig.predictionWindowSize * 2);
        }
        return next;
      });

      setMetrics((prev) => ({
        ...prev,
        latencySamples: prev.latencySamples + 1,
        averageLatencyMs:
          (prev.averageLatencyMs * prev.latencySamples + latencyMs) /
          (prev.latencySamples + 1),
      }));

      // Update latency level
      const newLevel = classifyLatency(latencyMs);
      if (newLevel !== currentLatencyLevel) {
        setCurrentLatencyLevel(newLevel);
        callbacks?.onLatencyChange?.(newLevel);
      }
    },
    [fullConfig.predictionWindowSize, currentLatencyLevel, callbacks]
  );

  /**
   * Apply optimistic update with compensation
   */
  const compensate = useCallback(
    <T>(
      applyFn: () => void,
      rollbackFn: () => void,
      optimisticValue?: T,
      previousValue?: T
    ) => {
      const updateId = generateUpdateId();

      const update: OptimisticUpdate<T> = {
        id: updateId,
        state: "optimistic",
        optimisticValue: optimisticValue as T,
        previousValue: previousValue as T,
        applyFn,
        rollbackFn,
        startTime: Date.now(),
        commitTime: null,
        rollbackTime: null,
        latencyMs: null,
      };

      // Apply optimistic update immediately
      applyFn();

      setUpdates((prev) => {
        const next = new Map(prev);
        // Enforce max pending updates
        if (next.size >= fullConfig.maxPendingUpdates) {
          // Remove oldest pending update
          const oldest = Array.from(next.values())
            .filter((u) => u.state === "optimistic" || u.state === "pending")
            .sort((a, b) => a.startTime - b.startTime)[0];
          if (oldest) {
            next.delete(oldest.id);
          }
        }
        next.set(updateId, update);
        return next;
      });

      setMetrics((prev) => ({
        ...prev,
        totalUpdates: prev.totalUpdates + 1,
      }));

      callbacks?.onCompensate?.(updateId);

      // Set up auto-rollback timeout
      if (fullConfig.autoRollbackOnTimeout) {
        const timeoutId = setTimeout(() => {
          const current = updatesRef.current.get(updateId);
          if (current && (current.state === "optimistic" || current.state === "pending")) {
            rollbackUpdate(updateId, "timeout");
          }
        }, fullConfig.timeoutThreshold);

        timeoutsRef.current.set(updateId, timeoutId);
      }

      // Show UI feedback based on prediction
      const prediction = calculatePrediction();
      if (prediction.expectedMs >= fullConfig.skeletonThreshold) {
        setShowSkeleton(true);
        setMetrics((prev) => ({ ...prev, skeletonsShown: prev.skeletonsShown + 1 }));
        callbacks?.onSkeletonShow?.();
      } else if (prediction.expectedMs >= fullConfig.spinnerThreshold) {
        setShowSpinner(true);
        setMetrics((prev) => ({ ...prev, spinnersShown: prev.spinnersShown + 1 }));
      }

      const commit = () => commitUpdate(updateId);
      const rollback = () => rollbackUpdate(updateId, "user");
      const getState = () => updatesRef.current.get(updateId)?.state || "committed";

      return { updateId, commit, rollback, getState };
    },
    [fullConfig, calculatePrediction, callbacks]
  );

  /**
   * Commit an update
   */
  const commitUpdate = useCallback(
    (updateId: string) => {
      const update = updatesRef.current.get(updateId);
      if (!update) return;

      // Clear timeout
      const timeoutId = timeoutsRef.current.get(updateId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutsRef.current.delete(updateId);
      }

      const latencyMs = Date.now() - update.startTime;

      setUpdates((prev) => {
        const next = new Map(prev);
        const u = next.get(updateId);
        if (u) {
          u.state = "committed";
          u.commitTime = Date.now();
          u.latencyMs = latencyMs;
          next.set(updateId, { ...u });
        }
        return next;
      });

      // Record latency
      recordLatency(latencyMs, true);

      setMetrics((prev) => ({
        ...prev,
        committedUpdates: prev.committedUpdates + 1,
        averageCommitTimeMs:
          (prev.averageCommitTimeMs * prev.committedUpdates + latencyMs) /
          (prev.committedUpdates + 1),
      }));

      // Hide UI feedback
      setShowSkeleton(false);
      setShowSpinner(false);
      callbacks?.onSkeletonHide?.();

      callbacks?.onCommit?.(updateId, latencyMs);

      // Clean up old committed updates
      setTimeout(() => {
        setUpdates((prev) => {
          const next = new Map(prev);
          next.delete(updateId);
          return next;
        });
      }, 1000);
    },
    [recordLatency, callbacks]
  );

  /**
   * Rollback an update
   */
  const rollbackUpdate = useCallback(
    (updateId: string, reason = "error") => {
      const update = updatesRef.current.get(updateId);
      if (!update) return;

      // Clear timeout
      const timeoutId = timeoutsRef.current.get(updateId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutsRef.current.delete(updateId);
      }

      // Execute rollback
      update.rollbackFn();

      const latencyMs = Date.now() - update.startTime;

      setUpdates((prev) => {
        const next = new Map(prev);
        const u = next.get(updateId);
        if (u) {
          u.state = "rolled_back";
          u.rollbackTime = Date.now();
          u.latencyMs = latencyMs;
          next.set(updateId, { ...u });
        }
        return next;
      });

      // Record as failed latency
      recordLatency(latencyMs, false);

      setMetrics((prev) => {
        const totalCompleted = prev.committedUpdates + prev.rolledBackUpdates + 1;
        return {
          ...prev,
          rolledBackUpdates: prev.rolledBackUpdates + 1,
          rollbackRate: (prev.rolledBackUpdates + 1) / totalCompleted,
        };
      });

      // Hide UI feedback
      setShowSkeleton(false);
      setShowSpinner(false);
      callbacks?.onSkeletonHide?.();

      callbacks?.onRollback?.(updateId, reason);

      // Clean up
      setTimeout(() => {
        setUpdates((prev) => {
          const next = new Map(prev);
          next.delete(updateId);
          return next;
        });
      }, fullConfig.rollbackAnimationMs);
    },
    [fullConfig.rollbackAnimationMs, recordLatency, callbacks]
  );

  /**
   * Get UI hint based on current prediction
   */
  const getUIHint = useCallback((): UIHint => {
    const prediction = calculatePrediction();
    return prediction.uiHint;
  }, [calculatePrediction]);

  /**
   * Clear all pending updates
   */
  const clearPending = useCallback(() => {
    for (const [updateId, update] of updatesRef.current) {
      if (update.state === "optimistic" || update.state === "pending") {
        rollbackUpdate(updateId, "cleared");
      }
    }

    // Clear all timeouts
    for (const timeoutId of timeoutsRef.current.values()) {
      clearTimeout(timeoutId);
    }
    timeoutsRef.current.clear();
  }, [rollbackUpdate]);

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback(() => {
    setMetrics({
      totalUpdates: 0,
      committedUpdates: 0,
      rolledBackUpdates: 0,
      averageLatencyMs: 0,
      averageCommitTimeMs: 0,
      rollbackRate: 0,
      latencySamples: 0,
      skeletonsShown: 0,
      spinnersShown: 0,
    });
    setLatencySamples([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // Compute state
  const prediction = calculatePrediction();

  const state: CompensatorStateInfo = useMemo(
    () => ({
      pendingUpdates: Array.from(updates.values()).filter(
        (u) => u.state === "optimistic" || u.state === "pending"
      ).length,
      currentLatencyLevel,
      showSkeleton,
      showSpinner,
      isCompensating: updates.size > 0,
      prediction,
    }),
    [updates, currentLatencyLevel, showSkeleton, showSpinner, prediction]
  );

  const controls: CompensatorControls = useMemo(
    () => ({
      compensate,
      commit: commitUpdate,
      rollback: rollbackUpdate,
      recordLatency,
      predictLatency: calculatePrediction,
      getUIHint,
      clearPending,
      resetMetrics,
    }),
    [compensate, commitUpdate, rollbackUpdate, recordLatency, calculatePrediction, getUIHint, clearPending, resetMetrics]
  );

  return {
    state,
    metrics,
    controls,
    showSkeleton,
    showSpinner,
    latencyLevel: currentLatencyLevel,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple optimistic update hook
 */
export function useOptimisticUpdate<T>(
  value: T,
  onUpdate: (newValue: T) => Promise<void>
): {
  optimisticValue: T;
  update: (newValue: T) => Promise<void>;
  isUpdating: boolean;
  error: Error | null;
} {
  const [optimisticValue, setOptimisticValue] = useState(value);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const previousRef = useRef(value);

  useEffect(() => {
    setOptimisticValue(value);
    previousRef.current = value;
  }, [value]);

  const update = useCallback(
    async (newValue: T) => {
      const previous = previousRef.current;
      setOptimisticValue(newValue);
      setIsUpdating(true);
      setError(null);

      try {
        await onUpdate(newValue);
        previousRef.current = newValue;
      } catch (err) {
        setOptimisticValue(previous);
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },
    [onUpdate]
  );

  return { optimisticValue, update, isUpdating, error };
}

/**
 * Latency-aware loading state hook
 */
export function useLatencyAwareLoading(
  isLoading: boolean,
  expectedLatencyMs = 300
): {
  showSkeleton: boolean;
  showSpinner: boolean;
  showContent: boolean;
} {
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      startTimeRef.current = Date.now();

      // Show spinner after 100ms
      const spinnerTimeout = setTimeout(() => {
        setShowSpinner(true);
      }, 100);

      // Show skeleton after expected latency / 2
      const skeletonTimeout = setTimeout(() => {
        setShowSkeleton(true);
        setShowSpinner(false);
      }, Math.max(200, expectedLatencyMs / 2));

      return () => {
        clearTimeout(spinnerTimeout);
        clearTimeout(skeletonTimeout);
      };
    } else {
      setShowSkeleton(false);
      setShowSpinner(false);
      startTimeRef.current = null;
    }
  }, [isLoading, expectedLatencyMs]);

  return {
    showSkeleton,
    showSpinner,
    showContent: !isLoading,
  };
}

export default useMobileLatencyCompensator;
