/**
 * useInputLatencyReducer Hook - Sprint 1586
 *
 * Reduces perceived input latency through optimistic updates and prediction.
 * Makes interactions feel instant while actual processing happens in background.
 *
 * Features:
 * - Optimistic UI updates with rollback on failure
 * - Input prediction for text fields
 * - Debounced submission with immediate feedback
 * - Request deduplication and batching
 * - Latency measurement and adaptation
 * - Visual feedback timing optimization
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type OptimisticUpdateStatus = "pending" | "confirmed" | "rolled_back" | "failed";

export interface OptimisticUpdate<T> {
  id: string;
  optimisticValue: T;
  actualValue?: T;
  status: OptimisticUpdateStatus;
  timestamp: number;
  rollbackValue: T;
  retryCount: number;
}

export interface PredictedInput {
  value: string;
  confidence: number;
  source: "autocomplete" | "history" | "pattern" | "common";
}

export interface RequestBatch<T> {
  id: string;
  requests: Array<{ id: string; payload: T }>;
  status: "pending" | "sent" | "completed" | "failed";
  createdAt: number;
  sentAt?: number;
  completedAt?: number;
}

export interface LatencyStats {
  current: number;
  average: number;
  p50: number;
  p95: number;
  samples: number;
  trend: "improving" | "stable" | "degrading";
}

export interface InputLatencyMetrics {
  optimisticUpdates: number;
  successfulPredictions: number;
  rollbacks: number;
  batchesSent: number;
  averageLatency: number;
  perceivedLatency: number;
}

export interface InputLatencyConfig {
  enabled: boolean;
  optimisticEnabled: boolean;
  predictionEnabled: boolean;
  batchingEnabled: boolean;
  batchDelayMs: number;
  maxBatchSize: number;
  rollbackDelayMs: number;
  maxRetries: number;
  predictionConfidenceThreshold: number;
}

export interface InputLatencyState<T> {
  currentValue: T;
  optimisticValue: T;
  isOptimistic: boolean;
  pendingUpdates: OptimisticUpdate<T>[];
  predictions: PredictedInput[];
  latencyStats: LatencyStats;
}

export interface InputLatencyControls<T> {
  setValue: (value: T, commit?: boolean) => void;
  commit: () => Promise<T>;
  rollback: () => void;
  predict: (partial: string) => PredictedInput[];
  acceptPrediction: (prediction: PredictedInput) => void;
  measureLatency: (startTime: number) => void;
  reset: () => void;
}

export interface UseInputLatencyReducerResult<T> {
  state: InputLatencyState<T>;
  metrics: InputLatencyMetrics;
  controls: InputLatencyControls<T>;
  displayValue: T;
  isCommitting: boolean;
  hasPendingChanges: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: InputLatencyConfig = {
  enabled: true,
  optimisticEnabled: true,
  predictionEnabled: true,
  batchingEnabled: true,
  batchDelayMs: 50,
  maxBatchSize: 10,
  rollbackDelayMs: 5000,
  maxRetries: 3,
  predictionConfidenceThreshold: 0.6,
};

// Common word completions for prediction
const COMMON_COMPLETIONS: Record<string, string[]> = {
  hel: ["hello", "help", "helpful"],
  tha: ["thank", "thanks", "that"],
  wha: ["what", "whatever", "whatnot"],
  how: ["how", "however", "howdy"],
  ple: ["please", "pleasure", "plenty"],
  can: ["can", "cannot", "cancel"],
  wou: ["would", "wouldn't"],
  cou: ["could", "couldn't", "count"],
  sho: ["should", "shouldn't", "show"],
};

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `upd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function predictCompletion(partial: string): PredictedInput[] {
  const predictions: PredictedInput[] = [];
  const lowerPartial = partial.toLowerCase();

  // Check common completions
  for (const [prefix, completions] of Object.entries(COMMON_COMPLETIONS)) {
    if (lowerPartial.startsWith(prefix) || prefix.startsWith(lowerPartial)) {
      for (const completion of completions) {
        if (completion.startsWith(lowerPartial) && completion !== lowerPartial) {
          const confidence = lowerPartial.length / completion.length;
          predictions.push({
            value: completion,
            confidence: Math.min(0.9, confidence + 0.3),
            source: "common",
          });
        }
      }
    }
  }

  // Sort by confidence
  predictions.sort((a, b) => b.confidence - a.confidence);
  return predictions.slice(0, 5);
}

// ============================================================================
// Main Hook
// ============================================================================

export function useInputLatencyReducer<T>(
  initialValue: T,
  onCommit: (value: T) => Promise<T>,
  config: Partial<InputLatencyConfig> = {}
): UseInputLatencyReducerResult<T> {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [state, setState] = useState<InputLatencyState<T>>({
    currentValue: initialValue,
    optimisticValue: initialValue,
    isOptimistic: false,
    pendingUpdates: [],
    predictions: [],
    latencyStats: {
      current: 0,
      average: 0,
      p50: 0,
      p95: 0,
      samples: 0,
      trend: "stable",
    },
  });

  const [isCommitting, setIsCommitting] = useState(false);

  // Metrics
  const metricsRef = useRef<InputLatencyMetrics>({
    optimisticUpdates: 0,
    successfulPredictions: 0,
    rollbacks: 0,
    batchesSent: 0,
    averageLatency: 0,
    perceivedLatency: 0,
  });

  // Latency samples
  const latencySamplesRef = useRef<number[]>([]);

  // Batch queue
  const batchQueueRef = useRef<Array<{ id: string; value: T }>>([]);
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Rollback timer
  const rollbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate display value
  const displayValue = useMemo(() => {
    if (mergedConfig.optimisticEnabled && state.isOptimistic) {
      return state.optimisticValue;
    }
    return state.currentValue;
  }, [state.currentValue, state.optimisticValue, state.isOptimistic, mergedConfig.optimisticEnabled]);

  // Has pending changes
  const hasPendingChanges = state.pendingUpdates.length > 0 || state.isOptimistic;

  // Set value (optimistic)
  const setValue = useCallback(
    (value: T, commit: boolean = false) => {
      if (!mergedConfig.enabled) {
        setState((prev) => ({ ...prev, currentValue: value, optimisticValue: value }));
        return;
      }

      const updateId = generateId();

      if (mergedConfig.optimisticEnabled) {
        const update: OptimisticUpdate<T> = {
          id: updateId,
          optimisticValue: value,
          status: "pending",
          timestamp: Date.now(),
          rollbackValue: state.currentValue,
          retryCount: 0,
        };

        metricsRef.current.optimisticUpdates++;

        setState((prev) => ({
          ...prev,
          optimisticValue: value,
          isOptimistic: true,
          pendingUpdates: [...prev.pendingUpdates, update],
        }));

        // Set rollback timer
        if (rollbackTimerRef.current) {
          clearTimeout(rollbackTimerRef.current);
        }
        rollbackTimerRef.current = setTimeout(() => {
          setState((prev) => {
            const pendingUpdate = prev.pendingUpdates.find((u) => u.id === updateId);
            if (pendingUpdate && pendingUpdate.status === "pending") {
              metricsRef.current.rollbacks++;
              return {
                ...prev,
                optimisticValue: prev.currentValue,
                isOptimistic: false,
                pendingUpdates: prev.pendingUpdates.filter((u) => u.id !== updateId),
              };
            }
            return prev;
          });
        }, mergedConfig.rollbackDelayMs);
      } else {
        setState((prev) => ({ ...prev, currentValue: value, optimisticValue: value }));
      }

      // Auto-commit if requested
      if (commit) {
        // Add to batch
        if (mergedConfig.batchingEnabled) {
          batchQueueRef.current.push({ id: updateId, value });

          if (!batchTimerRef.current) {
            batchTimerRef.current = setTimeout(() => {
              processBatch();
            }, mergedConfig.batchDelayMs);
          }
        }
      }
    },
    [
      mergedConfig.enabled,
      mergedConfig.optimisticEnabled,
      mergedConfig.batchingEnabled,
      mergedConfig.batchDelayMs,
      mergedConfig.rollbackDelayMs,
      state.currentValue,
    ]
  );

  // Process batch
  const processBatch = useCallback(async () => {
    if (batchQueueRef.current.length === 0) return;

    const batch = batchQueueRef.current.slice(0, mergedConfig.maxBatchSize);
    batchQueueRef.current = batchQueueRef.current.slice(mergedConfig.maxBatchSize);
    batchTimerRef.current = null;

    metricsRef.current.batchesSent++;

    // Process last value in batch (most recent)
    const lastItem = batch[batch.length - 1];
    if (lastItem) {
      try {
        const startTime = Date.now();
        const result = await onCommit(lastItem.value);
        const latency = Date.now() - startTime;

        measureLatencyInternal(latency);

        setState((prev) => ({
          ...prev,
          currentValue: result,
          optimisticValue: result,
          isOptimistic: false,
          pendingUpdates: prev.pendingUpdates.map((u) =>
            batch.some((b) => b.id === u.id) ? { ...u, status: "confirmed" as const, actualValue: result } : u
          ),
        }));
      } catch {
        // Rollback on failure
        metricsRef.current.rollbacks++;
        setState((prev) => ({
          ...prev,
          optimisticValue: prev.currentValue,
          isOptimistic: false,
          pendingUpdates: prev.pendingUpdates.map((u) =>
            batch.some((b) => b.id === u.id) ? { ...u, status: "failed" as const } : u
          ),
        }));
      }
    }

    // Process remaining if any
    if (batchQueueRef.current.length > 0) {
      batchTimerRef.current = setTimeout(processBatch, mergedConfig.batchDelayMs);
    }
  }, [mergedConfig.maxBatchSize, mergedConfig.batchDelayMs, onCommit]);

  // Commit
  const commit = useCallback(async (): Promise<T> => {
    setIsCommitting(true);
    const startTime = Date.now();

    try {
      const result = await onCommit(state.optimisticValue);
      const latency = Date.now() - startTime;

      measureLatencyInternal(latency);

      setState((prev) => ({
        ...prev,
        currentValue: result,
        optimisticValue: result,
        isOptimistic: false,
        pendingUpdates: prev.pendingUpdates.map((u) =>
          u.status === "pending" ? { ...u, status: "confirmed" as const, actualValue: result } : u
        ),
      }));

      setIsCommitting(false);
      return result;
    } catch (error) {
      metricsRef.current.rollbacks++;
      setState((prev) => ({
        ...prev,
        optimisticValue: prev.currentValue,
        isOptimistic: false,
        pendingUpdates: prev.pendingUpdates.map((u) =>
          u.status === "pending" ? { ...u, status: "failed" as const } : u
        ),
      }));
      setIsCommitting(false);
      throw error;
    }
  }, [state.optimisticValue, onCommit]);

  // Rollback
  const rollback = useCallback(() => {
    if (rollbackTimerRef.current) {
      clearTimeout(rollbackTimerRef.current);
    }

    metricsRef.current.rollbacks++;

    setState((prev) => ({
      ...prev,
      optimisticValue: prev.currentValue,
      isOptimistic: false,
      pendingUpdates: prev.pendingUpdates.map((u) =>
        u.status === "pending" ? { ...u, status: "rolled_back" as const } : u
      ),
    }));
  }, []);

  // Predict
  const predict = useCallback(
    (partial: string): PredictedInput[] => {
      if (!mergedConfig.predictionEnabled || partial.length < 2) {
        return [];
      }

      const predictions = predictCompletion(partial);
      setState((prev) => ({ ...prev, predictions }));
      return predictions;
    },
    [mergedConfig.predictionEnabled]
  );

  // Accept prediction
  const acceptPrediction = useCallback(
    (prediction: PredictedInput) => {
      if (prediction.confidence >= mergedConfig.predictionConfidenceThreshold) {
        metricsRef.current.successfulPredictions++;
        setValue(prediction.value as unknown as T, false);
      }
    },
    [mergedConfig.predictionConfidenceThreshold, setValue]
  );

  // Measure latency (internal)
  const measureLatencyInternal = useCallback((latency: number) => {
    latencySamplesRef.current.push(latency);
    if (latencySamplesRef.current.length > 100) {
      latencySamplesRef.current.shift();
    }

    const samples = latencySamplesRef.current;
    const average = samples.reduce((a, b) => a + b, 0) / samples.length;
    const p50 = calculatePercentile(samples, 50);
    const p95 = calculatePercentile(samples, 95);

    // Determine trend
    let trend: "improving" | "stable" | "degrading" = "stable";
    if (samples.length >= 10) {
      const recent = samples.slice(-5);
      const older = samples.slice(-10, -5);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

      if (recentAvg < olderAvg * 0.8) trend = "improving";
      else if (recentAvg > olderAvg * 1.2) trend = "degrading";
    }

    setState((prev) => ({
      ...prev,
      latencyStats: {
        current: latency,
        average,
        p50,
        p95,
        samples: samples.length,
        trend,
      },
    }));

    metricsRef.current.averageLatency = average;
    // Perceived latency is much lower due to optimistic updates
    metricsRef.current.perceivedLatency = mergedConfig.optimisticEnabled ? 0 : average;
  }, [mergedConfig.optimisticEnabled]);

  // Measure latency (public)
  const measureLatency = useCallback(
    (startTime: number) => {
      const latency = Date.now() - startTime;
      measureLatencyInternal(latency);
    },
    [measureLatencyInternal]
  );

  // Reset
  const reset = useCallback(() => {
    if (rollbackTimerRef.current) {
      clearTimeout(rollbackTimerRef.current);
    }
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
    }

    batchQueueRef.current = [];
    latencySamplesRef.current = [];

    setState({
      currentValue: initialValue,
      optimisticValue: initialValue,
      isOptimistic: false,
      pendingUpdates: [],
      predictions: [],
      latencyStats: {
        current: 0,
        average: 0,
        p50: 0,
        p95: 0,
        samples: 0,
        trend: "stable",
      },
    });
  }, [initialValue]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rollbackTimerRef.current) {
        clearTimeout(rollbackTimerRef.current);
      }
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, []);

  // Controls
  const controls: InputLatencyControls<T> = useMemo(
    () => ({
      setValue,
      commit,
      rollback,
      predict,
      acceptPrediction,
      measureLatency,
      reset,
    }),
    [setValue, commit, rollback, predict, acceptPrediction, measureLatency, reset]
  );

  return {
    state,
    metrics: metricsRef.current,
    controls,
    displayValue,
    isCommitting,
    hasPendingChanges,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for optimistic text input
 */
export function useOptimisticTextInput(
  initialValue: string,
  onSubmit: (value: string) => Promise<string>,
  config?: Partial<InputLatencyConfig>
): {
  value: string;
  setValue: (value: string) => void;
  submit: () => Promise<void>;
  isSubmitting: boolean;
  predictions: PredictedInput[];
} {
  const { displayValue, controls, isCommitting, state } = useInputLatencyReducer(
    initialValue,
    onSubmit,
    config
  );

  const submit = useCallback(async () => {
    await controls.commit();
  }, [controls]);

  return {
    value: displayValue,
    setValue: (v: string) => controls.setValue(v, false),
    submit,
    isSubmitting: isCommitting,
    predictions: state.predictions,
  };
}

/**
 * Hook for debounced auto-save
 */
export function useAutoSaveInput<T>(
  initialValue: T,
  onSave: (value: T) => Promise<T>,
  debounceMs: number = 500,
  config?: Partial<InputLatencyConfig>
): {
  value: T;
  setValue: (value: T) => void;
  isSaving: boolean;
  lastSaved: T;
} {
  const { displayValue, controls, isCommitting, state } = useInputLatencyReducer(
    initialValue,
    onSave,
    { ...config, batchDelayMs: debounceMs, batchingEnabled: true }
  );

  const setValue = useCallback(
    (value: T) => {
      controls.setValue(value, true); // Auto-commit with batching
    },
    [controls]
  );

  return {
    value: displayValue,
    setValue,
    isSaving: isCommitting,
    lastSaved: state.currentValue,
  };
}

export default useInputLatencyReducer;
