/**
 * usePredictiveLatency Hook - Sprint 511
 *
 * Predictive latency reduction based on user behavior patterns.
 * Anticipates user actions to pre-warm connections and prefetch resources.
 *
 * Features:
 * - User behavior pattern recognition (typing speed, interaction patterns)
 * - Predictive prefetching of likely responses
 * - Connection pre-warming based on interaction likelihood
 * - Adaptive timeout optimization based on historical latency
 * - Request prioritization based on prediction confidence
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type UserAction =
  | "start_typing"
  | "stop_typing"
  | "send_message"
  | "scroll"
  | "hover"
  | "focus"
  | "blur"
  | "voice_start"
  | "voice_end"
  | "tap"
  | "idle";

export type PredictedAction = {
  action: UserAction;
  confidence: number; // 0-1
  timeframe: number; // ms until likely action
  metadata?: Record<string, unknown>;
};

export interface BehaviorPattern {
  id: string;
  actions: UserAction[];
  frequency: number;
  averageInterval: number;
  lastOccurred: number;
  confidence: number;
}

export interface LatencyMetrics {
  currentLatency: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  minLatency: number;
  maxLatency: number;
  samples: number;
}

export interface PredictionMetrics {
  correctPredictions: number;
  incorrectPredictions: number;
  accuracy: number;
  prefetchHits: number;
  prefetchMisses: number;
  prefetchHitRate: number;
  averageTimeSaved: number;
}

export interface PredictiveLatencyConfig {
  enabled: boolean;
  learningRate: number; // How quickly patterns are learned (0-1)
  predictionThreshold: number; // Minimum confidence to act on prediction (0-1)
  maxPatternAge: number; // ms before patterns expire
  prefetchAhead: number; // ms ahead to prefetch
  connectionPoolSize: number; // Number of pre-warmed connections
  adaptiveTimeout: boolean; // Adjust timeouts based on history
  minTimeout: number; // ms
  maxTimeout: number; // ms
}

export interface PrefetchRequest {
  id: string;
  url: string;
  priority: number;
  confidence: number;
  createdAt: number;
  completedAt?: number;
  status: "pending" | "fetching" | "cached" | "failed";
}

export interface ConnectionState {
  url: string;
  status: "idle" | "warming" | "ready" | "error";
  warmedAt?: number;
  lastUsed?: number;
}

export interface PredictiveLatencyState {
  predictions: PredictedAction[];
  patterns: BehaviorPattern[];
  actionHistory: Array<{ action: UserAction; timestamp: number }>;
  prefetchQueue: PrefetchRequest[];
  connectionPool: ConnectionState[];
  isLearning: boolean;
}

export interface PredictiveLatencyControls {
  recordAction: (action: UserAction, metadata?: Record<string, unknown>) => void;
  prefetch: (url: string, priority?: number) => Promise<void>;
  warmConnection: (url: string) => Promise<void>;
  getPredictions: () => PredictedAction[];
  getOptimalTimeout: () => number;
  clearHistory: () => void;
  resetPatterns: () => void;
}

export interface UsePredictiveLatencyResult {
  state: PredictiveLatencyState;
  latencyMetrics: LatencyMetrics;
  predictionMetrics: PredictionMetrics;
  controls: PredictiveLatencyControls;
  currentPrediction: PredictedAction | null;
  optimalTimeout: number;
  shouldPrefetch: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: PredictiveLatencyConfig = {
  enabled: true,
  learningRate: 0.1,
  predictionThreshold: 0.6,
  maxPatternAge: 30 * 60 * 1000, // 30 minutes
  prefetchAhead: 500, // 500ms
  connectionPoolSize: 3,
  adaptiveTimeout: true,
  minTimeout: 1000,
  maxTimeout: 30000,
};

const PATTERN_SEQUENCES: Record<string, UserAction[]> = {
  typing_to_send: ["start_typing", "stop_typing", "send_message"],
  voice_interaction: ["voice_start", "voice_end", "idle"],
  browse_then_interact: ["scroll", "hover", "tap"],
  focus_then_type: ["focus", "start_typing"],
  quick_response: ["send_message", "start_typing"],
};

const ACTION_WEIGHTS: Record<UserAction, number> = {
  start_typing: 0.9, // High indicator of upcoming message
  stop_typing: 0.7,
  send_message: 1.0, // Definite action
  scroll: 0.3,
  hover: 0.4,
  focus: 0.6,
  blur: 0.2,
  voice_start: 0.9,
  voice_end: 0.8,
  tap: 0.5,
  idle: 0.1,
};

// ============================================================================
// Utility Functions
// ============================================================================

function calculatePatternMatch(history: UserAction[], pattern: UserAction[]): number {
  if (history.length < pattern.length) return 0;

  const recentHistory = history.slice(-pattern.length);
  let matchScore = 0;

  for (let i = 0; i < pattern.length; i++) {
    if (recentHistory[i] === pattern[i]) {
      matchScore += 1 / pattern.length;
    }
  }

  return matchScore;
}

function predictNextAction(
  history: Array<{ action: UserAction; timestamp: number }>,
  patterns: BehaviorPattern[]
): PredictedAction | null {
  if (history.length < 2) return null;

  const actions = history.map((h) => h.action);
  let bestPrediction: PredictedAction | null = null;
  let bestConfidence = 0;

  // Check against known patterns
  for (const pattern of patterns) {
    const matchScore = calculatePatternMatch(actions, pattern.actions.slice(0, -1));
    if (matchScore > 0.5) {
      const nextAction = pattern.actions[pattern.actions.length - 1];
      const confidence = matchScore * pattern.confidence;

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestPrediction = {
          action: nextAction,
          confidence,
          timeframe: pattern.averageInterval,
        };
      }
    }
  }

  // Check standard sequences
  for (const [_name, sequence] of Object.entries(PATTERN_SEQUENCES)) {
    if (actions.length >= sequence.length - 1) {
      const partialSequence = sequence.slice(0, -1);
      const matchScore = calculatePatternMatch(actions, partialSequence);

      if (matchScore > 0.7) {
        const nextAction = sequence[sequence.length - 1];
        const confidence = matchScore * 0.8; // Base confidence for standard patterns

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestPrediction = {
            action: nextAction,
            confidence,
            timeframe: 500, // Default timeframe
          };
        }
      }
    }
  }

  return bestPrediction;
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

export function usePredictiveLatency(
  config: Partial<PredictiveLatencyConfig> = {}
): UsePredictiveLatencyResult {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [state, setState] = useState<PredictiveLatencyState>({
    predictions: [],
    patterns: [],
    actionHistory: [],
    prefetchQueue: [],
    connectionPool: [],
    isLearning: true,
  });

  // Latency tracking
  const latencyHistoryRef = useRef<number[]>([]);
  const [latencyMetrics, setLatencyMetrics] = useState<LatencyMetrics>({
    currentLatency: 0,
    averageLatency: 0,
    p95Latency: 0,
    p99Latency: 0,
    minLatency: Infinity,
    maxLatency: 0,
    samples: 0,
  });

  // Prediction metrics
  const predictionMetricsRef = useRef<PredictionMetrics>({
    correctPredictions: 0,
    incorrectPredictions: 0,
    accuracy: 0,
    prefetchHits: 0,
    prefetchMisses: 0,
    prefetchHitRate: 0,
    averageTimeSaved: 0,
  });

  // Prefetch cache
  const prefetchCacheRef = useRef<Map<string, Response>>(new Map());

  // Current prediction
  const [currentPrediction, setCurrentPrediction] = useState<PredictedAction | null>(null);

  // Calculate optimal timeout based on history
  const optimalTimeout = useMemo(() => {
    if (!mergedConfig.adaptiveTimeout || latencyHistoryRef.current.length < 5) {
      return mergedConfig.maxTimeout;
    }

    // Use p95 + 50% buffer as optimal timeout
    const p95 = calculatePercentile(latencyHistoryRef.current, 95);
    const timeout = Math.round(p95 * 1.5);

    return Math.max(mergedConfig.minTimeout, Math.min(timeout, mergedConfig.maxTimeout));
  }, [latencyMetrics.samples, mergedConfig]);

  // Should prefetch based on prediction confidence
  const shouldPrefetch = useMemo(() => {
    return (
      mergedConfig.enabled &&
      currentPrediction !== null &&
      currentPrediction.confidence >= mergedConfig.predictionThreshold
    );
  }, [currentPrediction, mergedConfig]);

  // Record user action
  const recordAction = useCallback(
    (action: UserAction, metadata?: Record<string, unknown>) => {
      const now = Date.now();

      setState((prev) => {
        // Add to history
        const newHistory = [...prev.actionHistory, { action, timestamp: now }];

        // Keep only last 100 actions
        if (newHistory.length > 100) {
          newHistory.shift();
        }

        // Learn patterns if enabled
        let newPatterns = [...prev.patterns];
        if (newHistory.length >= 3 && mergedConfig.learningRate > 0) {
          const recentActions = newHistory.slice(-3).map((h) => h.action);
          const recentTimestamps = newHistory.slice(-3).map((h) => h.timestamp);
          const avgInterval =
            (recentTimestamps[2] - recentTimestamps[0]) / 2;

          // Check if pattern already exists
          const existingPattern = newPatterns.find(
            (p) => p.actions.join(",") === recentActions.join(",")
          );

          if (existingPattern) {
            // Update existing pattern
            existingPattern.frequency++;
            existingPattern.averageInterval =
              existingPattern.averageInterval * (1 - mergedConfig.learningRate) +
              avgInterval * mergedConfig.learningRate;
            existingPattern.lastOccurred = now;
            existingPattern.confidence = Math.min(
              1,
              existingPattern.confidence + mergedConfig.learningRate * 0.1
            );
          } else if (newPatterns.length < 50) {
            // Add new pattern
            newPatterns.push({
              id: `pattern_${now}`,
              actions: recentActions,
              frequency: 1,
              averageInterval: avgInterval,
              lastOccurred: now,
              confidence: 0.5,
            });
          }

          // Remove old patterns
          newPatterns = newPatterns.filter(
            (p) => now - p.lastOccurred < mergedConfig.maxPatternAge
          );
        }

        // Make prediction
        const prediction = predictNextAction(newHistory, newPatterns);

        return {
          ...prev,
          actionHistory: newHistory,
          patterns: newPatterns,
          predictions: prediction ? [prediction] : [],
        };
      });

      // Update current prediction
      setState((prev) => {
        const prediction = predictNextAction(prev.actionHistory, prev.patterns);
        setCurrentPrediction(prediction);
        return prev;
      });
    },
    [mergedConfig.learningRate, mergedConfig.maxPatternAge]
  );

  // Prefetch URL
  const prefetch = useCallback(
    async (url: string, priority: number = 5): Promise<void> => {
      if (!mergedConfig.enabled) return;

      const id = `prefetch_${Date.now()}`;
      const request: PrefetchRequest = {
        id,
        url,
        priority,
        confidence: currentPrediction?.confidence || 0.5,
        createdAt: Date.now(),
        status: "pending",
      };

      setState((prev) => ({
        ...prev,
        prefetchQueue: [...prev.prefetchQueue, request].sort((a, b) => b.priority - a.priority),
      }));

      try {
        // Update status to fetching
        setState((prev) => ({
          ...prev,
          prefetchQueue: prev.prefetchQueue.map((r) =>
            r.id === id ? { ...r, status: "fetching" as const } : r
          ),
        }));

        const response = await fetch(url, {
          method: "GET",
          cache: "force-cache",
          priority: priority > 7 ? "high" : "low",
        } as RequestInit);

        if (response.ok) {
          prefetchCacheRef.current.set(url, response.clone());

          setState((prev) => ({
            ...prev,
            prefetchQueue: prev.prefetchQueue.map((r) =>
              r.id === id ? { ...r, status: "cached" as const, completedAt: Date.now() } : r
            ),
          }));

          predictionMetricsRef.current.prefetchHits++;
        }
      } catch {
        setState((prev) => ({
          ...prev,
          prefetchQueue: prev.prefetchQueue.map((r) =>
            r.id === id ? { ...r, status: "failed" as const } : r
          ),
        }));

        predictionMetricsRef.current.prefetchMisses++;
      }
    },
    [mergedConfig.enabled, currentPrediction]
  );

  // Warm connection
  const warmConnection = useCallback(
    async (url: string): Promise<void> => {
      if (!mergedConfig.enabled) return;

      const parsedUrl = new URL(url);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

      // Check if already in pool
      const existing = state.connectionPool.find((c) => c.url === baseUrl);
      if (existing?.status === "ready") return;

      setState((prev) => ({
        ...prev,
        connectionPool: [
          ...prev.connectionPool.filter((c) => c.url !== baseUrl),
          { url: baseUrl, status: "warming" as const },
        ].slice(-mergedConfig.connectionPoolSize),
      }));

      try {
        // Send a lightweight request to warm the connection
        await fetch(`${baseUrl}/health`, {
          method: "HEAD",
          mode: "no-cors",
        });

        setState((prev) => ({
          ...prev,
          connectionPool: prev.connectionPool.map((c) =>
            c.url === baseUrl ? { ...c, status: "ready" as const, warmedAt: Date.now() } : c
          ),
        }));
      } catch {
        setState((prev) => ({
          ...prev,
          connectionPool: prev.connectionPool.map((c) =>
            c.url === baseUrl ? { ...c, status: "error" as const } : c
          ),
        }));
      }
    },
    [mergedConfig.enabled, mergedConfig.connectionPoolSize, state.connectionPool]
  );

  // Get current predictions
  const getPredictions = useCallback((): PredictedAction[] => {
    return state.predictions;
  }, [state.predictions]);

  // Get optimal timeout
  const getOptimalTimeout = useCallback((): number => {
    return optimalTimeout;
  }, [optimalTimeout]);

  // Clear history
  const clearHistory = useCallback(() => {
    setState((prev) => ({
      ...prev,
      actionHistory: [],
    }));
    latencyHistoryRef.current = [];
    setLatencyMetrics({
      currentLatency: 0,
      averageLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      samples: 0,
    });
  }, []);

  // Reset patterns
  const resetPatterns = useCallback(() => {
    setState((prev) => ({
      ...prev,
      patterns: [],
      predictions: [],
    }));
    predictionMetricsRef.current = {
      correctPredictions: 0,
      incorrectPredictions: 0,
      accuracy: 0,
      prefetchHits: 0,
      prefetchMisses: 0,
      prefetchHitRate: 0,
      averageTimeSaved: 0,
    };
  }, []);

  // Helper to record latency
  const recordLatency = useCallback((latency: number) => {
    latencyHistoryRef.current.push(latency);

    // Keep only last 100 samples
    if (latencyHistoryRef.current.length > 100) {
      latencyHistoryRef.current.shift();
    }

    const samples = latencyHistoryRef.current;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

    setLatencyMetrics({
      currentLatency: latency,
      averageLatency: Math.round(avg),
      p95Latency: calculatePercentile(samples, 95),
      p99Latency: calculatePercentile(samples, 99),
      minLatency: Math.min(...samples),
      maxLatency: Math.max(...samples),
      samples: samples.length,
    });
  }, []);

  // Expose recordLatency through window for external usage
  useEffect(() => {
    (window as any).__recordLatency = recordLatency;
    return () => {
      delete (window as any).__recordLatency;
    };
  }, [recordLatency]);

  // Controls
  const controls: PredictiveLatencyControls = useMemo(
    () => ({
      recordAction,
      prefetch,
      warmConnection,
      getPredictions,
      getOptimalTimeout,
      clearHistory,
      resetPatterns,
    }),
    [recordAction, prefetch, warmConnection, getPredictions, getOptimalTimeout, clearHistory, resetPatterns]
  );

  return {
    state,
    latencyMetrics,
    predictionMetrics: predictionMetricsRef.current,
    controls,
    currentPrediction,
    optimalTimeout,
    shouldPrefetch,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for automatically recording typing actions
 */
export function useTypingPrediction(
  inputValue: string,
  onPrediction?: (prediction: PredictedAction | null) => void
): { shouldPrefetch: boolean; predictedAction: UserAction | null } {
  const { controls, currentPrediction, shouldPrefetch } = usePredictiveLatency();
  const prevLengthRef = useRef(0);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const currentLength = inputValue.length;

    if (currentLength > prevLengthRef.current) {
      // Started/continued typing
      controls.recordAction("start_typing");

      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set timeout for stop typing
      typingTimeoutRef.current = setTimeout(() => {
        controls.recordAction("stop_typing");
      }, 1000);
    } else if (currentLength === 0 && prevLengthRef.current > 0) {
      // Cleared input
      controls.recordAction("blur");
    }

    prevLengthRef.current = currentLength;

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [inputValue, controls]);

  useEffect(() => {
    onPrediction?.(currentPrediction);
  }, [currentPrediction, onPrediction]);

  return {
    shouldPrefetch,
    predictedAction: currentPrediction?.action || null,
  };
}

/**
 * Hook for adaptive request timeout
 */
export function useAdaptiveTimeout(
  baseTimeout: number = 10000
): { timeout: number; recordLatency: (ms: number) => void } {
  const { optimalTimeout, latencyMetrics } = usePredictiveLatency();
  const recordLatencyRef = useRef((window as any).__recordLatency || (() => {}));

  // Use optimal if we have enough samples, otherwise use base
  const timeout = latencyMetrics.samples >= 5 ? optimalTimeout : baseTimeout;

  return {
    timeout,
    recordLatency: recordLatencyRef.current,
  };
}

/**
 * Hook for connection pre-warming on mount
 */
export function usePrewarmedConnection(
  urls: string[],
  config?: Partial<PredictiveLatencyConfig>
): { isReady: boolean; connectionStates: ConnectionState[] } {
  const { controls, state } = usePredictiveLatency(config);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const warmAll = async () => {
      await Promise.all(urls.map((url) => controls.warmConnection(url)));
      setIsReady(true);
    };

    warmAll();
  }, [urls, controls]);

  return { isReady, connectionStates: state.connectionPool };
}

export default usePredictiveLatency;
