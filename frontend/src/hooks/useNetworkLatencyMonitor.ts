/**
 * useNetworkLatencyMonitor Hook - Sprint 512
 *
 * Real-time network latency monitoring with adaptive quality recommendations.
 * Provides detailed latency analytics and quality-of-service indicators.
 *
 * Features:
 * - Continuous latency measurement (ping, RTT, jitter)
 * - Network quality scoring (excellent, good, fair, poor, critical)
 * - Bandwidth estimation
 * - Connection stability tracking
 * - Quality degradation alerts
 * - Recommended settings based on network conditions
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type NetworkQuality = "excellent" | "good" | "fair" | "poor" | "critical" | "unknown";

export type ConnectionType = "4g" | "3g" | "2g" | "slow-2g" | "wifi" | "ethernet" | "unknown";

export interface LatencySample {
  timestamp: number;
  latency: number; // ms
  endpoint: string;
  success: boolean;
}

export interface LatencyStats {
  current: number;
  average: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  jitter: number;
  standardDeviation: number;
  sampleCount: number;
}

export interface NetworkMetrics {
  latency: LatencyStats;
  bandwidth: {
    download: number; // Mbps estimate
    upload: number; // Mbps estimate
    effective: number; // Effective bandwidth considering latency
  };
  packetLoss: number; // Percentage 0-100
  connectionType: ConnectionType;
  isMetered: boolean;
  saveData: boolean;
}

export interface QualityAssessment {
  overall: NetworkQuality;
  latencyScore: number; // 0-100
  stabilityScore: number; // 0-100
  bandwidthScore: number; // 0-100
  degradationRisk: "low" | "medium" | "high";
  trend: "improving" | "stable" | "degrading";
}

export interface RecommendedSettings {
  videoQuality: "4k" | "1080p" | "720p" | "480p" | "360p" | "audio-only";
  audioQuality: "high" | "medium" | "low";
  bufferSize: number; // ms
  prefetchEnabled: boolean;
  compressionLevel: "none" | "low" | "medium" | "high";
  pollInterval: number; // ms
  maxConcurrentRequests: number;
}

export interface LatencyAlert {
  id: string;
  type: "high_latency" | "packet_loss" | "jitter" | "degradation" | "recovery";
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: number;
  metrics: Partial<NetworkMetrics>;
}

export interface NetworkLatencyConfig {
  enabled: boolean;
  pingEndpoint: string;
  pingInterval: number; // ms
  sampleSize: number;
  alertThresholds: {
    latency: { warning: number; critical: number };
    packetLoss: { warning: number; critical: number };
    jitter: { warning: number; critical: number };
  };
  enableBandwidthEstimation: boolean;
  enableAlerts: boolean;
}

export interface NetworkLatencyControls {
  ping: () => Promise<number>;
  measureBandwidth: () => Promise<number>;
  clearHistory: () => void;
  pauseMonitoring: () => void;
  resumeMonitoring: () => void;
  getLatencyHistory: () => LatencySample[];
  acknowledgeAlert: (alertId: string) => void;
}

export interface UseNetworkLatencyMonitorResult {
  metrics: NetworkMetrics;
  quality: QualityAssessment;
  recommended: RecommendedSettings;
  alerts: LatencyAlert[];
  controls: NetworkLatencyControls;
  isMonitoring: boolean;
  lastPingTime: number | null;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: NetworkLatencyConfig = {
  enabled: true,
  pingEndpoint: "/api/health",
  pingInterval: 5000,
  sampleSize: 50,
  alertThresholds: {
    latency: { warning: 200, critical: 500 },
    packetLoss: { warning: 2, critical: 5 },
    jitter: { warning: 50, critical: 100 },
  },
  enableBandwidthEstimation: true,
  enableAlerts: true,
};

const QUALITY_THRESHOLDS = {
  excellent: { latency: 50, jitter: 10, packetLoss: 0 },
  good: { latency: 100, jitter: 30, packetLoss: 1 },
  fair: { latency: 200, jitter: 50, packetLoss: 3 },
  poor: { latency: 400, jitter: 100, packetLoss: 5 },
  critical: { latency: Infinity, jitter: Infinity, packetLoss: Infinity },
};

// ============================================================================
// Utility Functions
// ============================================================================

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  // Use slice() instead of spread for slightly better performance
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate multiple percentiles in a single pass (optimization for multiple percentile calculations)
 */
function calculateMultiplePercentiles(
  values: number[],
  percentiles: number[]
): number[] {
  if (values.length === 0) return percentiles.map(() => 0);
  // Sort once, then calculate all percentiles
  const sorted = values.slice().sort((a, b) => a - b);
  return percentiles.map((p) => {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  });
}

function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function calculateJitter(values: number[]): number {
  if (values.length < 2) return 0;
  let jitterSum = 0;
  for (let i = 1; i < values.length; i++) {
    jitterSum += Math.abs(values[i] - values[i - 1]);
  }
  return jitterSum / (values.length - 1);
}

function assessQuality(
  latency: number,
  jitter: number,
  packetLoss: number
): NetworkQuality {
  if (
    latency <= QUALITY_THRESHOLDS.excellent.latency &&
    jitter <= QUALITY_THRESHOLDS.excellent.jitter &&
    packetLoss <= QUALITY_THRESHOLDS.excellent.packetLoss
  ) {
    return "excellent";
  }
  if (
    latency <= QUALITY_THRESHOLDS.good.latency &&
    jitter <= QUALITY_THRESHOLDS.good.jitter &&
    packetLoss <= QUALITY_THRESHOLDS.good.packetLoss
  ) {
    return "good";
  }
  if (
    latency <= QUALITY_THRESHOLDS.fair.latency &&
    jitter <= QUALITY_THRESHOLDS.fair.jitter &&
    packetLoss <= QUALITY_THRESHOLDS.fair.packetLoss
  ) {
    return "fair";
  }
  if (
    latency <= QUALITY_THRESHOLDS.poor.latency &&
    jitter <= QUALITY_THRESHOLDS.poor.jitter &&
    packetLoss <= QUALITY_THRESHOLDS.poor.packetLoss
  ) {
    return "poor";
  }
  return "critical";
}

function getRecommendedSettings(quality: NetworkQuality, bandwidth: number): RecommendedSettings {
  switch (quality) {
    case "excellent":
      return {
        videoQuality: bandwidth > 25 ? "4k" : "1080p",
        audioQuality: "high",
        bufferSize: 1000,
        prefetchEnabled: true,
        compressionLevel: "none",
        pollInterval: 5000,
        maxConcurrentRequests: 10,
      };
    case "good":
      return {
        videoQuality: "1080p",
        audioQuality: "high",
        bufferSize: 2000,
        prefetchEnabled: true,
        compressionLevel: "low",
        pollInterval: 5000,
        maxConcurrentRequests: 6,
      };
    case "fair":
      return {
        videoQuality: "720p",
        audioQuality: "medium",
        bufferSize: 4000,
        prefetchEnabled: true,
        compressionLevel: "medium",
        pollInterval: 3000,
        maxConcurrentRequests: 4,
      };
    case "poor":
      return {
        videoQuality: "480p",
        audioQuality: "medium",
        bufferSize: 6000,
        prefetchEnabled: false,
        compressionLevel: "high",
        pollInterval: 2000,
        maxConcurrentRequests: 2,
      };
    case "critical":
    default:
      return {
        videoQuality: "audio-only",
        audioQuality: "low",
        bufferSize: 10000,
        prefetchEnabled: false,
        compressionLevel: "high",
        pollInterval: 1000,
        maxConcurrentRequests: 1,
      };
  }
}

function detectConnectionType(): ConnectionType {
  const connection = (navigator as any).connection;
  if (!connection) return "unknown";

  const effectiveType = connection.effectiveType;
  if (effectiveType) {
    return effectiveType as ConnectionType;
  }

  const type = connection.type;
  if (type === "wifi") return "wifi";
  if (type === "ethernet") return "ethernet";
  if (type === "cellular") return "4g";

  return "unknown";
}

// ============================================================================
// Main Hook
// ============================================================================

export function useNetworkLatencyMonitor(
  config: Partial<NetworkLatencyConfig> = {}
): UseNetworkLatencyMonitorResult {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [isMonitoring, setIsMonitoring] = useState(mergedConfig.enabled);
  const [lastPingTime, setLastPingTime] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<LatencyAlert[]>([]);

  // Samples history
  const samplesRef = useRef<LatencySample[]>([]);
  const bandwidthEstimateRef = useRef<number>(10); // Default 10 Mbps

  // Calculated metrics
  const [metrics, setMetrics] = useState<NetworkMetrics>({
    latency: {
      current: 0,
      average: 0,
      min: 0,
      max: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      jitter: 0,
      standardDeviation: 0,
      sampleCount: 0,
    },
    bandwidth: {
      download: 10,
      upload: 5,
      effective: 10,
    },
    packetLoss: 0,
    connectionType: detectConnectionType(),
    isMetered: (navigator as any).connection?.saveData || false,
    saveData: (navigator as any).connection?.saveData || false,
  });

  // Quality assessment
  const [quality, setQuality] = useState<QualityAssessment>({
    overall: "unknown",
    latencyScore: 100,
    stabilityScore: 100,
    bandwidthScore: 100,
    degradationRisk: "low",
    trend: "stable",
  });

  // Recommended settings
  const [recommended, setRecommended] = useState<RecommendedSettings>(
    getRecommendedSettings("good", 10)
  );

  // Ping interval ref
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevLatencyRef = useRef<number[]>([]);

  // Update metrics ref for use in ping
  const updateMetricsRef = useRef<(() => void) | null>(null);

  // Ping function
  const ping = useCallback(async (): Promise<number> => {
    const startTime = performance.now();

    try {
      const response = await fetch(mergedConfig.pingEndpoint, {
        method: "HEAD",
        cache: "no-store",
        mode: "cors",
      });

      const latency = performance.now() - startTime;
      const success = response.ok;

      // Record sample
      const sample: LatencySample = {
        timestamp: Date.now(),
        latency,
        endpoint: mergedConfig.pingEndpoint,
        success,
      };

      samplesRef.current.push(sample);

      // Keep only last N samples
      if (samplesRef.current.length > mergedConfig.sampleSize) {
        samplesRef.current.shift();
      }

      setLastPingTime(Date.now());

      // Update metrics after ping
      if (updateMetricsRef.current) {
        updateMetricsRef.current();
      }

      return latency;
    } catch {
      // Record failed sample
      const sample: LatencySample = {
        timestamp: Date.now(),
        latency: -1,
        endpoint: mergedConfig.pingEndpoint,
        success: false,
      };

      samplesRef.current.push(sample);

      if (samplesRef.current.length > mergedConfig.sampleSize) {
        samplesRef.current.shift();
      }

      // Update metrics after failed ping
      if (updateMetricsRef.current) {
        updateMetricsRef.current();
      }

      return -1;
    }
  }, [mergedConfig.pingEndpoint, mergedConfig.sampleSize]);

  // Bandwidth estimation (rough)
  const measureBandwidth = useCallback(async (): Promise<number> => {
    try {
      const testSize = 50000; // 50KB test
      const startTime = performance.now();

      const response = await fetch(`${mergedConfig.pingEndpoint}?size=${testSize}`, {
        method: "GET",
        cache: "no-store",
      });

      const blob = await response.blob();
      const duration = (performance.now() - startTime) / 1000; // seconds
      const bits = blob.size * 8;
      const mbps = bits / duration / 1000000;

      bandwidthEstimateRef.current = mbps;
      return mbps;
    } catch {
      return bandwidthEstimateRef.current;
    }
  }, [mergedConfig.pingEndpoint]);

  // Update metrics from samples
  const updateMetrics = useCallback(() => {
    const samples = samplesRef.current;
    if (samples.length === 0) return;

    const successfulSamples = samples.filter((s) => s.success);
    const latencies = successfulSamples.map((s) => s.latency);
    const failedCount = samples.length - successfulSamples.length;
    const packetLoss = (failedCount / samples.length) * 100;

    if (latencies.length === 0) {
      setQuality((prev) => ({ ...prev, overall: "critical" }));
      return;
    }

    const current = latencies[latencies.length - 1];
    const average = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    const jitter = calculateJitter(latencies);
    const standardDeviation = calculateStandardDeviation(latencies);

    // Calculate all percentiles in a single sort pass (optimization)
    const [p50, p90, p95, p99] = calculateMultiplePercentiles(
      latencies,
      [50, 90, 95, 99]
    );

    const latencyStats: LatencyStats = {
      current,
      average,
      min,
      max,
      p50,
      p90,
      p95,
      p99,
      jitter,
      standardDeviation,
      sampleCount: latencies.length,
    };

    // Update connection info
    const connectionType = detectConnectionType();
    const connection = (navigator as any).connection;
    const downlink = connection?.downlink || bandwidthEstimateRef.current;

    setMetrics({
      latency: latencyStats,
      bandwidth: {
        download: downlink,
        upload: downlink * 0.5, // Estimate
        effective: downlink * (1 - packetLoss / 100),
      },
      packetLoss,
      connectionType,
      isMetered: connection?.saveData || false,
      saveData: connection?.saveData || false,
    });

    // Assess quality
    const overall = assessQuality(average, jitter, packetLoss);
    const latencyScore = Math.max(0, 100 - (average / 5));
    const stabilityScore = Math.max(0, 100 - jitter - packetLoss * 10);
    const bandwidthScore = Math.min(100, downlink * 10);

    // Determine trend
    const recentLatencies = latencies.slice(-10);
    const olderLatencies = latencies.slice(-20, -10);
    let trend: "improving" | "stable" | "degrading" = "stable";

    if (recentLatencies.length > 0 && olderLatencies.length > 0) {
      const recentAvg = recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length;
      const olderAvg = olderLatencies.reduce((a, b) => a + b, 0) / olderLatencies.length;

      if (recentAvg < olderAvg * 0.8) trend = "improving";
      else if (recentAvg > olderAvg * 1.2) trend = "degrading";
    }

    // Degradation risk
    let degradationRisk: "low" | "medium" | "high" = "low";
    if (jitter > mergedConfig.alertThresholds.jitter.warning || trend === "degrading") {
      degradationRisk = "medium";
    }
    if (
      jitter > mergedConfig.alertThresholds.jitter.critical ||
      packetLoss > mergedConfig.alertThresholds.packetLoss.warning
    ) {
      degradationRisk = "high";
    }

    setQuality({
      overall,
      latencyScore,
      stabilityScore,
      bandwidthScore,
      degradationRisk,
      trend,
    });

    // Update recommended settings
    setRecommended(getRecommendedSettings(overall, downlink));

    // Generate alerts
    if (mergedConfig.enableAlerts) {
      const newAlerts: LatencyAlert[] = [];

      if (current > mergedConfig.alertThresholds.latency.critical) {
        newAlerts.push({
          id: `latency_critical_${Date.now()}`,
          type: "high_latency",
          severity: "critical",
          message: `Critical latency detected: ${Math.round(current)}ms`,
          timestamp: Date.now(),
          metrics: { latency: latencyStats },
        });
      } else if (current > mergedConfig.alertThresholds.latency.warning) {
        newAlerts.push({
          id: `latency_warning_${Date.now()}`,
          type: "high_latency",
          severity: "warning",
          message: `High latency detected: ${Math.round(current)}ms`,
          timestamp: Date.now(),
          metrics: { latency: latencyStats },
        });
      }

      if (packetLoss > mergedConfig.alertThresholds.packetLoss.critical) {
        newAlerts.push({
          id: `packetloss_critical_${Date.now()}`,
          type: "packet_loss",
          severity: "critical",
          message: `Critical packet loss: ${packetLoss.toFixed(1)}%`,
          timestamp: Date.now(),
          metrics: { packetLoss },
        });
      }

      if (newAlerts.length > 0) {
        setAlerts((prev) => [...prev.slice(-10), ...newAlerts]);
      }
    }

    prevLatencyRef.current = latencies;
  }, [mergedConfig]);

  // Keep the ref updated with the latest updateMetrics function
  useEffect(() => {
    updateMetricsRef.current = updateMetrics;
  }, [updateMetrics]);

  // Start/stop monitoring
  useEffect(() => {
    if (!isMonitoring) {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      return;
    }

    // Initial ping
    ping().then(() => updateMetrics());

    // Set up interval
    pingIntervalRef.current = setInterval(async () => {
      await ping();
      updateMetrics();
    }, mergedConfig.pingInterval);

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, [isMonitoring, mergedConfig.pingInterval, ping, updateMetrics]);

  // Listen for connection changes
  useEffect(() => {
    const connection = (navigator as any).connection;
    if (!connection) return;

    const handleChange = () => {
      updateMetrics();
    };

    connection.addEventListener("change", handleChange);
    return () => connection.removeEventListener("change", handleChange);
  }, [updateMetrics]);

  // Controls
  const clearHistory = useCallback(() => {
    samplesRef.current = [];
    setAlerts([]);
  }, []);

  const pauseMonitoring = useCallback(() => {
    setIsMonitoring(false);
  }, []);

  const resumeMonitoring = useCallback(() => {
    setIsMonitoring(true);
  }, []);

  const getLatencyHistory = useCallback((): LatencySample[] => {
    return [...samplesRef.current];
  }, []);

  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const controls: NetworkLatencyControls = useMemo(
    () => ({
      ping,
      measureBandwidth,
      clearHistory,
      pauseMonitoring,
      resumeMonitoring,
      getLatencyHistory,
      acknowledgeAlert,
    }),
    [ping, measureBandwidth, clearHistory, pauseMonitoring, resumeMonitoring, getLatencyHistory, acknowledgeAlert]
  );

  return {
    metrics,
    quality,
    recommended,
    alerts,
    controls,
    isMonitoring,
    lastPingTime,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for simple latency value
 */
export function useCurrentLatency(
  config?: Partial<NetworkLatencyConfig>
): { latency: number; quality: NetworkQuality } {
  const { metrics, quality } = useNetworkLatencyMonitor(config);
  return { latency: metrics.latency.current, quality: quality.overall };
}

/**
 * Hook for network quality alerts
 */
export function useNetworkAlerts(
  onAlert?: (alert: LatencyAlert) => void,
  config?: Partial<NetworkLatencyConfig>
): { alerts: LatencyAlert[]; hasActiveAlerts: boolean } {
  const { alerts } = useNetworkLatencyMonitor(config);
  const prevAlertsLengthRef = useRef(0);

  useEffect(() => {
    if (alerts.length > prevAlertsLengthRef.current && onAlert) {
      const newAlerts = alerts.slice(prevAlertsLengthRef.current);
      newAlerts.forEach(onAlert);
    }
    prevAlertsLengthRef.current = alerts.length;
  }, [alerts, onAlert]);

  return {
    alerts,
    hasActiveAlerts: alerts.some((a) => a.severity === "critical" || a.severity === "warning"),
  };
}

/**
 * Hook for adaptive settings based on network
 */
export function useAdaptiveNetworkSettings(
  config?: Partial<NetworkLatencyConfig>
): RecommendedSettings {
  const { recommended } = useNetworkLatencyMonitor(config);
  return recommended;
}

export default useNetworkLatencyMonitor;
