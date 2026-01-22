"use client";

/**
 * useLatencyOptimizer - Network Latency Handling and Optimization
 *
 * Monitors network latency and provides adaptive strategies for
 * maintaining responsive avatar interactions.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNetworkStatus } from "./useNetworkStatus";

interface LatencyMetrics {
  // Current RTT (round-trip time) in ms
  currentLatency: number;

  // Average latency over sample window
  averageLatency: number;

  // Minimum latency observed
  minLatency: number;

  // Maximum latency observed
  maxLatency: number;

  // Latency jitter (variance)
  jitter: number;

  // Latency trend: improving, stable, degrading
  trend: "improving" | "stable" | "degrading";

  // Quality tier based on latency
  quality: "excellent" | "good" | "fair" | "poor";

  // Number of samples collected
  sampleCount: number;
}

interface LatencyStrategy {
  // Recommended buffer size for audio (ms)
  audioBufferMs: number;

  // Recommended prefetch ahead time (ms)
  prefetchAheadMs: number;

  // Whether to use optimistic updates
  useOptimisticUpdates: boolean;

  // Whether to batch requests
  useBatchRequests: boolean;

  // Request timeout (ms)
  requestTimeout: number;

  // Retry delay base (ms)
  retryDelayBase: number;

  // Max retries
  maxRetries: number;

  // Animation frame skip threshold
  frameSkipThreshold: number;

  // Whether to preload assets aggressively
  aggressivePreload: boolean;
}

interface LatencyControls {
  // Manually record a latency sample
  recordLatency: (latencyMs: number) => void;

  // Ping the server to measure latency
  ping: () => Promise<number>;

  // Reset metrics
  resetMetrics: () => void;

  // Start continuous monitoring
  startMonitoring: (intervalMs?: number) => void;

  // Stop continuous monitoring
  stopMonitoring: () => void;

  // Force strategy recalculation
  recalculateStrategy: () => void;
}

interface UseLatencyOptimizerOptions {
  // Endpoint to ping for latency measurement
  pingEndpoint?: string;

  // Sample window size
  sampleSize?: number;

  // Auto-start monitoring
  autoStart?: boolean;

  // Monitoring interval (ms)
  monitoringInterval?: number;

  // Callback when latency exceeds threshold
  onHighLatency?: (latency: number) => void;

  // High latency threshold (ms)
  highLatencyThreshold?: number;

  // Callback when quality changes
  onQualityChange?: (quality: LatencyMetrics["quality"]) => void;
}

interface UseLatencyOptimizerResult {
  metrics: LatencyMetrics;
  strategy: LatencyStrategy;
  controls: LatencyControls;
  isMonitoring: boolean;
}

// Latency thresholds for quality tiers
const QUALITY_THRESHOLDS = {
  excellent: 50,   // < 50ms
  good: 100,       // < 100ms
  fair: 200,       // < 200ms
  poor: Infinity,  // >= 200ms
};

export function useLatencyOptimizer(
  options: UseLatencyOptimizerOptions = {}
): UseLatencyOptimizerResult {
  const {
    pingEndpoint = "/api/health",
    sampleSize = 20,
    autoStart = false,
    monitoringInterval = 5000,
    onHighLatency,
    highLatencyThreshold = 300,
    onQualityChange,
  } = options;

  const { isOnline, isSlowConnection, rtt } = useNetworkStatus();

  // Latency samples
  const [samples, setSamples] = useState<number[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(autoStart);
  const monitoringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevQualityRef = useRef<LatencyMetrics["quality"] | null>(null);

  // Calculate metrics from samples
  const metrics = useMemo((): LatencyMetrics => {
    if (samples.length === 0) {
      // Use Network Information API RTT as fallback
      const fallbackLatency = rtt || 100;
      return {
        currentLatency: fallbackLatency,
        averageLatency: fallbackLatency,
        minLatency: fallbackLatency,
        maxLatency: fallbackLatency,
        jitter: 0,
        trend: "stable",
        quality: fallbackLatency < QUALITY_THRESHOLDS.excellent
          ? "excellent"
          : fallbackLatency < QUALITY_THRESHOLDS.good
          ? "good"
          : fallbackLatency < QUALITY_THRESHOLDS.fair
          ? "fair"
          : "poor",
        sampleCount: 0,
      };
    }

    const current = samples[samples.length - 1];
    const average = samples.reduce((a, b) => a + b, 0) / samples.length;
    const min = Math.min(...samples);
    const max = Math.max(...samples);

    // Calculate jitter (standard deviation)
    const squaredDiffs = samples.map((s) => Math.pow(s - average, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / samples.length;
    const jitter = Math.sqrt(avgSquaredDiff);

    // Calculate trend
    let trend: LatencyMetrics["trend"] = "stable";
    if (samples.length >= 5) {
      const recentAvg = samples.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const olderAvg = samples.slice(0, -5).reduce((a, b) => a + b, 0) / Math.max(samples.length - 5, 1);
      if (recentAvg < olderAvg * 0.8) trend = "improving";
      else if (recentAvg > olderAvg * 1.2) trend = "degrading";
    }

    // Determine quality
    let quality: LatencyMetrics["quality"] = "poor";
    if (average < QUALITY_THRESHOLDS.excellent) quality = "excellent";
    else if (average < QUALITY_THRESHOLDS.good) quality = "good";
    else if (average < QUALITY_THRESHOLDS.fair) quality = "fair";

    return {
      currentLatency: current,
      averageLatency: average,
      minLatency: min,
      maxLatency: max,
      jitter,
      trend,
      quality,
      sampleCount: samples.length,
    };
  }, [samples, rtt]);

  // Notify on quality change
  useEffect(() => {
    if (prevQualityRef.current !== null && prevQualityRef.current !== metrics.quality) {
      onQualityChange?.(metrics.quality);
    }
    prevQualityRef.current = metrics.quality;
  }, [metrics.quality, onQualityChange]);

  // Generate strategy based on metrics
  const strategy = useMemo((): LatencyStrategy => {
    const { averageLatency, jitter, quality } = metrics;

    switch (quality) {
      case "excellent":
        return {
          audioBufferMs: 50,
          prefetchAheadMs: 100,
          useOptimisticUpdates: true,
          useBatchRequests: false,
          requestTimeout: 5000,
          retryDelayBase: 100,
          maxRetries: 3,
          frameSkipThreshold: 0,
          aggressivePreload: true,
        };

      case "good":
        return {
          audioBufferMs: 100,
          prefetchAheadMs: 200,
          useOptimisticUpdates: true,
          useBatchRequests: false,
          requestTimeout: 8000,
          retryDelayBase: 200,
          maxRetries: 3,
          frameSkipThreshold: 1,
          aggressivePreload: true,
        };

      case "fair":
        return {
          audioBufferMs: 200 + jitter,
          prefetchAheadMs: 400,
          useOptimisticUpdates: true,
          useBatchRequests: true,
          requestTimeout: 12000,
          retryDelayBase: 500,
          maxRetries: 4,
          frameSkipThreshold: 2,
          aggressivePreload: false,
        };

      case "poor":
      default:
        return {
          audioBufferMs: 400 + jitter * 2,
          prefetchAheadMs: 800,
          useOptimisticUpdates: false,
          useBatchRequests: true,
          requestTimeout: 20000,
          retryDelayBase: 1000,
          maxRetries: 5,
          frameSkipThreshold: 3,
          aggressivePreload: false,
        };
    }
  }, [metrics]);

  // Record a latency sample
  const recordLatency = useCallback(
    (latencyMs: number) => {
      setSamples((prev) => {
        const newSamples = [...prev, latencyMs];
        // Keep only recent samples
        if (newSamples.length > sampleSize) {
          return newSamples.slice(-sampleSize);
        }
        return newSamples;
      });

      // Trigger high latency callback
      if (latencyMs > highLatencyThreshold) {
        onHighLatency?.(latencyMs);
      }
    },
    [sampleSize, highLatencyThreshold, onHighLatency]
  );

  // Ping endpoint to measure latency
  const ping = useCallback(async (): Promise<number> => {
    if (!isOnline) {
      return Infinity;
    }

    const startTime = performance.now();
    try {
      const response = await fetch(pingEndpoint, {
        method: "HEAD",
        cache: "no-store",
      });
      const endTime = performance.now();
      const latency = endTime - startTime;

      if (response.ok) {
        recordLatency(latency);
        return latency;
      }
    } catch {
      // Network error
    }

    // Return high latency on failure
    const fallbackLatency = 1000;
    recordLatency(fallbackLatency);
    return fallbackLatency;
  }, [pingEndpoint, isOnline, recordLatency]);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    setSamples([]);
  }, []);

  // Start continuous monitoring
  const startMonitoring = useCallback(
    (intervalMs: number = monitoringInterval) => {
      if (monitoringIntervalRef.current) {
        clearInterval(monitoringIntervalRef.current);
      }

      setIsMonitoring(true);

      // Initial ping
      ping();

      // Set up interval
      monitoringIntervalRef.current = setInterval(() => {
        ping();
      }, intervalMs);
    },
    [monitoringInterval, ping]
  );

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    if (monitoringIntervalRef.current) {
      clearInterval(monitoringIntervalRef.current);
      monitoringIntervalRef.current = null;
    }
    setIsMonitoring(false);
  }, []);

  // Auto-start if configured
  useEffect(() => {
    if (autoStart) {
      startMonitoring();
    }

    return () => {
      if (monitoringIntervalRef.current) {
        clearInterval(monitoringIntervalRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Also incorporate slow connection detection
  useEffect(() => {
    if (isSlowConnection && metrics.quality !== "poor") {
      // Network API indicates slow connection, adjust samples
      recordLatency(300);
    }
  }, [isSlowConnection, metrics.quality, recordLatency]);

  const controls = useMemo(
    (): LatencyControls => ({
      recordLatency,
      ping,
      resetMetrics,
      startMonitoring,
      stopMonitoring,
      recalculateStrategy: () => {
        // Force a ping to update metrics
        ping();
      },
    }),
    [recordLatency, ping, resetMetrics, startMonitoring, stopMonitoring]
  );

  return {
    metrics,
    strategy,
    controls,
    isMonitoring,
  };
}

/**
 * Hook for request timing with automatic latency recording
 */
export function useRequestTiming(): {
  startTimer: () => () => number;
  recordRequest: (durationMs: number) => void;
  averageRequestTime: number;
} {
  const [requestTimes, setRequestTimes] = useState<number[]>([]);

  const startTimer = useCallback(() => {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      setRequestTimes((prev) => [...prev.slice(-19), duration]);
      return duration;
    };
  }, []);

  const recordRequest = useCallback((durationMs: number) => {
    setRequestTimes((prev) => [...prev.slice(-19), durationMs]);
  }, []);

  const averageRequestTime = useMemo(() => {
    if (requestTimes.length === 0) return 0;
    return requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length;
  }, [requestTimes]);

  return { startTimer, recordRequest, averageRequestTime };
}

/**
 * Hook for adaptive retry with exponential backoff
 */
export function useAdaptiveRetry<T>(
  asyncFn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): {
  execute: () => Promise<T>;
  isRetrying: boolean;
  retryCount: number;
  lastError: Error | null;
} {
  const { maxRetries = 3, baseDelay = 200, maxDelay = 5000, onRetry } = options;

  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState<Error | null>(null);

  const execute = useCallback(async (): Promise<T> => {
    setIsRetrying(false);
    setRetryCount(0);
    setLastError(null);

    let attempt = 0;
    let lastErr: Error;

    while (attempt <= maxRetries) {
      try {
        const result = await asyncFn();
        return result;
      } catch (error) {
        lastErr = error instanceof Error ? error : new Error(String(error));
        setLastError(lastErr);

        if (attempt < maxRetries) {
          setIsRetrying(true);
          setRetryCount(attempt + 1);
          onRetry?.(attempt + 1, lastErr);

          // Exponential backoff with jitter
          const delay = Math.min(
            baseDelay * Math.pow(2, attempt) + Math.random() * 100,
            maxDelay
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        attempt++;
      }
    }

    setIsRetrying(false);
    throw lastError;
  }, [asyncFn, maxRetries, baseDelay, maxDelay, onRetry]);

  return { execute, isRetrying, retryCount, lastError };
}

/**
 * Hook for prefetching data based on latency
 */
export function useLatencyAwarePrefetch<T>(
  fetchFn: () => Promise<T>,
  deps: React.DependencyList = []
): {
  data: T | null;
  isPrefetching: boolean;
  prefetch: () => void;
} {
  const { strategy } = useLatencyOptimizer();
  const [data, setData] = useState<T | null>(null);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const prefetch = useCallback(() => {
    setIsPrefetching(true);
    fetchFn()
      .then(setData)
      .catch(() => {
        // Silently fail prefetch
      })
      .finally(() => setIsPrefetching(false));
  }, [fetchFn]);

  // Auto-prefetch with delay based on strategy
  useEffect(() => {
    if (strategy.aggressivePreload) {
      // Prefetch immediately
      prefetch();
    } else {
      // Delay prefetch
      timeoutRef.current = setTimeout(prefetch, strategy.prefetchAheadMs);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [...deps, strategy.aggressivePreload, strategy.prefetchAheadMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, isPrefetching, prefetch };
}
