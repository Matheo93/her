/**
 * useNetworkLatencyAdapter - Network-Aware Avatar Adaptation Hook
 *
 * Sprint 526: Adapts avatar behavior based on network conditions:
 * - RTT-based quality adjustment
 * - Bandwidth estimation
 * - Connection stability monitoring
 * - Prefetch optimization
 * - Graceful degradation strategies
 *
 * @example
 * ```tsx
 * const { state, controls, recommendations } = useNetworkLatencyAdapter({
 *   targetLatencyMs: 100,
 *   measurementIntervalMs: 5000,
 * });
 *
 * // Apply recommended settings
 * if (recommendations.reduceQuality) {
 *   setQualityTier('low');
 * }
 *
 * // Check connection health
 * if (state.connectionHealth < 0.5) {
 *   showConnectionWarning();
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Connection quality level
 */
export type ConnectionQuality = "excellent" | "good" | "fair" | "poor" | "offline";

/**
 * Network type
 */
export type NetworkType = "wifi" | "4g" | "3g" | "2g" | "ethernet" | "unknown" | "offline";

/**
 * Latency sample
 */
export interface LatencySample {
  rtt: number;
  timestamp: number;
  success: boolean;
}

/**
 * Bandwidth estimate
 */
export interface BandwidthEstimate {
  downloadMbps: number;
  uploadMbps: number;
  confidence: number;
  timestamp: number;
}

/**
 * Connection stats
 */
export interface ConnectionStats {
  avgRtt: number;
  minRtt: number;
  maxRtt: number;
  jitter: number;
  packetLoss: number;
  stability: number;
}

/**
 * Network event
 */
export interface NetworkEvent {
  type: "connected" | "disconnected" | "quality_changed" | "latency_spike";
  timestamp: number;
  details?: Record<string, unknown>;
}

/**
 * Adaptation recommendations
 */
export interface AdaptationRecommendations {
  reduceQuality: boolean;
  increaseBuffering: boolean;
  enablePrefetch: boolean;
  disableAnimations: boolean;
  useStaticAvatar: boolean;
  reduceChatPolling: boolean;
  recommendedQualityTier: "ultra" | "high" | "medium" | "low" | "minimal";
  recommendedBufferMs: number;
  recommendedPrefetchDepth: number;
}

/**
 * Adapter metrics
 */
export interface AdapterMetrics {
  samplesTaken: number;
  latencySpikes: number;
  qualityChanges: number;
  disconnections: number;
  avgMeasurementTime: number;
  connectionUptime: number;
  lastMeasurement: number;
}

/**
 * Adapter state
 */
export interface AdapterState {
  connectionQuality: ConnectionQuality;
  networkType: NetworkType;
  isOnline: boolean;
  connectionHealth: number;
  currentRtt: number;
  bandwidth: BandwidthEstimate | null;
  stats: ConnectionStats;
}

/**
 * Adapter config
 */
export interface AdapterConfig {
  /** Target latency threshold (ms) */
  targetLatencyMs: number;
  /** Measurement interval (ms) */
  measurementIntervalMs: number;
  /** Sample window size */
  sampleWindowSize: number;
  /** Latency spike threshold (ms) */
  spikeThresholdMs: number;
  /** Enable continuous monitoring */
  enableMonitoring: boolean;
  /** Ping endpoint for RTT measurement */
  pingEndpoint: string;
  /** Quality thresholds */
  qualityThresholds: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  /** Enable bandwidth estimation */
  enableBandwidthEstimation: boolean;
}

/**
 * Adapter controls
 */
export interface AdapterControls {
  /** Measure latency now */
  measureLatency: () => Promise<number>;
  /** Estimate bandwidth */
  estimateBandwidth: () => Promise<BandwidthEstimate>;
  /** Start monitoring */
  startMonitoring: () => void;
  /** Stop monitoring */
  stopMonitoring: () => void;
  /** Force quality evaluation */
  evaluate: () => void;
  /** Get current recommendations */
  getRecommendations: () => AdaptationRecommendations;
  /** Reset metrics */
  resetMetrics: () => void;
  /** Set custom quality */
  setQualityOverride: (quality: ConnectionQuality | null) => void;
}

/**
 * Hook result
 */
export interface UseNetworkLatencyAdapterResult {
  state: AdapterState;
  metrics: AdapterMetrics;
  recommendations: AdaptationRecommendations;
  controls: AdapterControls;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: AdapterConfig = {
  targetLatencyMs: 100,
  measurementIntervalMs: 5000,
  sampleWindowSize: 20,
  spikeThresholdMs: 300,
  enableMonitoring: true,
  pingEndpoint: "/api/ping",
  qualityThresholds: {
    excellent: 50,
    good: 100,
    fair: 200,
    poor: 500,
  },
  enableBandwidthEstimation: true,
};

// ============================================================================
// Utility Functions
// ============================================================================

function calculateJitter(samples: LatencySample[]): number {
  if (samples.length < 2) return 0;

  let sum = 0;
  for (let i = 1; i < samples.length; i++) {
    sum += Math.abs(samples[i].rtt - samples[i - 1].rtt);
  }

  return sum / (samples.length - 1);
}

function calculatePacketLoss(samples: LatencySample[]): number {
  if (samples.length === 0) return 0;
  const failed = samples.filter((s) => !s.success).length;
  return failed / samples.length;
}

function calculateStability(samples: LatencySample[]): number {
  if (samples.length < 5) return 1;

  const rtts = samples.filter((s) => s.success).map((s) => s.rtt);
  if (rtts.length < 3) return 0;

  const mean = rtts.reduce((a, b) => a + b, 0) / rtts.length;
  const variance = rtts.reduce((sum, rtt) => sum + Math.pow(rtt - mean, 2), 0) / rtts.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // Coefficient of variation

  // Stability is inverse of CV, capped at 0-1
  return Math.max(0, Math.min(1, 1 - cv));
}

function getNetworkType(): NetworkType {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;

  if (!navigator.onLine) return "offline";
  if (!connection) return "unknown";

  const effectiveType = connection.effectiveType;
  if (effectiveType === "4g") return "4g";
  if (effectiveType === "3g") return "3g";
  if (effectiveType === "2g" || effectiveType === "slow-2g") return "2g";

  // Check for ethernet/wifi based on type
  const type = connection.type;
  if (type === "ethernet") return "ethernet";
  if (type === "wifi") return "wifi";

  return "unknown";
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Network latency adapter hook
 */
export function useNetworkLatencyAdapter(
  config: Partial<AdapterConfig> = {},
  callbacks?: {
    onQualityChanged?: (from: ConnectionQuality, to: ConnectionQuality) => void;
    onLatencySpike?: (rtt: number) => void;
    onDisconnect?: () => void;
    onReconnect?: () => void;
  }
): UseNetworkLatencyAdapterResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>("good");
  const [networkType, setNetworkType] = useState<NetworkType>(getNetworkType());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentRtt, setCurrentRtt] = useState(0);
  const [bandwidth, setBandwidth] = useState<BandwidthEstimate | null>(null);
  const [qualityOverride, setQualityOverride] = useState<ConnectionQuality | null>(null);

  // Metrics
  const [metrics, setMetrics] = useState<AdapterMetrics>({
    samplesTaken: 0,
    latencySpikes: 0,
    qualityChanges: 0,
    disconnections: 0,
    avgMeasurementTime: 0,
    connectionUptime: 0,
    lastMeasurement: 0,
  });

  // Refs
  const samplesRef = useRef<LatencySample[]>([]);
  const monitoringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionStartRef = useRef<number>(Date.now());
  const measurementTimesRef = useRef<number[]>([]);
  const wasOnlineRef = useRef<boolean>(true);

  /**
   * Calculate connection stats
   */
  const calculateStats = useCallback((): ConnectionStats => {
    const samples = samplesRef.current.filter((s) => s.success);

    if (samples.length === 0) {
      return {
        avgRtt: 0,
        minRtt: 0,
        maxRtt: 0,
        jitter: 0,
        packetLoss: 0,
        stability: 0,
      };
    }

    const rtts = samples.map((s) => s.rtt);

    return {
      avgRtt: rtts.reduce((a, b) => a + b, 0) / rtts.length,
      minRtt: Math.min(...rtts),
      maxRtt: Math.max(...rtts),
      jitter: calculateJitter(samplesRef.current),
      packetLoss: calculatePacketLoss(samplesRef.current),
      stability: calculateStability(samplesRef.current),
    };
  }, []);

  /**
   * Determine quality level from RTT
   */
  const determineQuality = useCallback(
    (rtt: number): ConnectionQuality => {
      if (!isOnline) return "offline";
      if (rtt <= fullConfig.qualityThresholds.excellent) return "excellent";
      if (rtt <= fullConfig.qualityThresholds.good) return "good";
      if (rtt <= fullConfig.qualityThresholds.fair) return "fair";
      return "poor";
    },
    [isOnline, fullConfig.qualityThresholds]
  );

  /**
   * Measure latency
   */
  const measureLatency = useCallback(async (): Promise<number> => {
    const startTime = performance.now();

    try {
      const response = await fetch(fullConfig.pingEndpoint, {
        method: "HEAD",
        cache: "no-store",
      });

      const rtt = performance.now() - startTime;

      const sample: LatencySample = {
        rtt,
        timestamp: Date.now(),
        success: response.ok,
      };

      samplesRef.current.push(sample);
      if (samplesRef.current.length > fullConfig.sampleWindowSize) {
        samplesRef.current.shift();
      }

      setCurrentRtt(rtt);

      // Check for spike
      if (rtt > fullConfig.spikeThresholdMs) {
        callbacks?.onLatencySpike?.(rtt);
        setMetrics((prev) => ({
          ...prev,
          latencySpikes: prev.latencySpikes + 1,
        }));
      }

      // Update quality
      const newQuality = qualityOverride || determineQuality(rtt);
      if (newQuality !== connectionQuality) {
        callbacks?.onQualityChanged?.(connectionQuality, newQuality);
        setConnectionQuality(newQuality);
        setMetrics((prev) => ({
          ...prev,
          qualityChanges: prev.qualityChanges + 1,
        }));
      }

      // Track measurement time
      const measureTime = performance.now() - startTime;
      measurementTimesRef.current.push(measureTime);
      if (measurementTimesRef.current.length > 50) {
        measurementTimesRef.current.shift();
      }

      setMetrics((prev) => ({
        ...prev,
        samplesTaken: prev.samplesTaken + 1,
        avgMeasurementTime:
          measurementTimesRef.current.reduce((a, b) => a + b, 0) /
          measurementTimesRef.current.length,
        lastMeasurement: Date.now(),
        connectionUptime: Date.now() - connectionStartRef.current,
      }));

      return rtt;
    } catch {
      const sample: LatencySample = {
        rtt: Infinity,
        timestamp: Date.now(),
        success: false,
      };

      samplesRef.current.push(sample);
      if (samplesRef.current.length > fullConfig.sampleWindowSize) {
        samplesRef.current.shift();
      }

      return Infinity;
    }
  }, [
    fullConfig.pingEndpoint,
    fullConfig.sampleWindowSize,
    fullConfig.spikeThresholdMs,
    qualityOverride,
    connectionQuality,
    determineQuality,
    callbacks,
  ]);

  /**
   * Estimate bandwidth
   */
  const estimateBandwidth = useCallback(async (): Promise<BandwidthEstimate> => {
    if (!fullConfig.enableBandwidthEstimation) {
      return {
        downloadMbps: 0,
        uploadMbps: 0,
        confidence: 0,
        timestamp: Date.now(),
      };
    }

    // Use Network Information API if available
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;

    if (connection && connection.downlink) {
      const estimate: BandwidthEstimate = {
        downloadMbps: connection.downlink,
        uploadMbps: connection.downlink * 0.5, // Estimate upload as 50% of download
        confidence: 0.7,
        timestamp: Date.now(),
      };

      setBandwidth(estimate);
      return estimate;
    }

    // Fallback: estimate based on RTT
    const avgRtt = calculateStats().avgRtt;
    let estimatedMbps = 10; // Default

    if (avgRtt < 50) estimatedMbps = 50;
    else if (avgRtt < 100) estimatedMbps = 20;
    else if (avgRtt < 200) estimatedMbps = 10;
    else if (avgRtt < 500) estimatedMbps = 5;
    else estimatedMbps = 1;

    const estimate: BandwidthEstimate = {
      downloadMbps: estimatedMbps,
      uploadMbps: estimatedMbps * 0.5,
      confidence: 0.3,
      timestamp: Date.now(),
    };

    setBandwidth(estimate);
    return estimate;
  }, [fullConfig.enableBandwidthEstimation, calculateStats]);

  /**
   * Generate recommendations
   */
  const getRecommendations = useCallback((): AdaptationRecommendations => {
    const stats = calculateStats();
    const quality = qualityOverride || connectionQuality;

    let recommendedTier: "ultra" | "high" | "medium" | "low" | "minimal" = "high";
    let bufferMs = 100;
    let prefetchDepth = 3;

    switch (quality) {
      case "excellent":
        recommendedTier = "ultra";
        bufferMs = 50;
        prefetchDepth = 5;
        break;
      case "good":
        recommendedTier = "high";
        bufferMs = 100;
        prefetchDepth = 3;
        break;
      case "fair":
        recommendedTier = "medium";
        bufferMs = 200;
        prefetchDepth = 2;
        break;
      case "poor":
        recommendedTier = "low";
        bufferMs = 500;
        prefetchDepth = 1;
        break;
      case "offline":
        recommendedTier = "minimal";
        bufferMs = 1000;
        prefetchDepth = 0;
        break;
    }

    return {
      reduceQuality: quality === "poor" || quality === "offline",
      increaseBuffering: stats.jitter > 50 || quality === "poor",
      enablePrefetch: quality !== "offline" && quality !== "poor",
      disableAnimations: quality === "offline",
      useStaticAvatar: quality === "offline" || stats.packetLoss > 0.1,
      reduceChatPolling: quality === "poor" || quality === "offline",
      recommendedQualityTier: recommendedTier,
      recommendedBufferMs: bufferMs,
      recommendedPrefetchDepth: prefetchDepth,
    };
  }, [connectionQuality, qualityOverride, calculateStats]);

  /**
   * Start monitoring
   */
  const startMonitoring = useCallback((): void => {
    if (monitoringIntervalRef.current) return;

    measureLatency();

    monitoringIntervalRef.current = setInterval(() => {
      measureLatency();
      estimateBandwidth();
    }, fullConfig.measurementIntervalMs);
  }, [measureLatency, estimateBandwidth, fullConfig.measurementIntervalMs]);

  /**
   * Stop monitoring
   */
  const stopMonitoring = useCallback((): void => {
    if (monitoringIntervalRef.current) {
      clearInterval(monitoringIntervalRef.current);
      monitoringIntervalRef.current = null;
    }
  }, []);

  /**
   * Force evaluation
   */
  const evaluate = useCallback((): void => {
    measureLatency();
    estimateBandwidth();
  }, [measureLatency, estimateBandwidth]);

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback((): void => {
    samplesRef.current = [];
    measurementTimesRef.current = [];
    connectionStartRef.current = Date.now();
    setMetrics({
      samplesTaken: 0,
      latencySpikes: 0,
      qualityChanges: 0,
      disconnections: 0,
      avgMeasurementTime: 0,
      connectionUptime: 0,
      lastMeasurement: 0,
    });
  }, []);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setNetworkType(getNetworkType());
      if (!wasOnlineRef.current) {
        callbacks?.onReconnect?.();
        connectionStartRef.current = Date.now();
      }
      wasOnlineRef.current = true;
    };

    const handleOffline = () => {
      setIsOnline(false);
      setNetworkType("offline");
      setConnectionQuality("offline");
      wasOnlineRef.current = false;
      callbacks?.onDisconnect?.();
      setMetrics((prev) => ({
        ...prev,
        disconnections: prev.disconnections + 1,
      }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [callbacks]);

  // Start monitoring on mount if enabled
  useEffect(() => {
    if (fullConfig.enableMonitoring) {
      startMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [fullConfig.enableMonitoring, startMonitoring, stopMonitoring]);

  // Update network type periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const type = getNetworkType();
      if (type !== networkType) {
        setNetworkType(type);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [networkType]);

  // Calculate connection health (0-1)
  const connectionHealth = useMemo(() => {
    if (!isOnline) return 0;

    const stats = calculateStats();
    const qualityScore =
      connectionQuality === "excellent"
        ? 1
        : connectionQuality === "good"
        ? 0.8
        : connectionQuality === "fair"
        ? 0.6
        : connectionQuality === "poor"
        ? 0.3
        : 0;

    const stabilityScore = stats.stability;
    const lossScore = 1 - stats.packetLoss;

    return qualityScore * 0.4 + stabilityScore * 0.3 + lossScore * 0.3;
  }, [isOnline, connectionQuality, calculateStats]);

  // Compile state
  const state: AdapterState = useMemo(
    () => ({
      connectionQuality: qualityOverride || connectionQuality,
      networkType,
      isOnline,
      connectionHealth,
      currentRtt,
      bandwidth,
      stats: calculateStats(),
    }),
    [
      connectionQuality,
      qualityOverride,
      networkType,
      isOnline,
      connectionHealth,
      currentRtt,
      bandwidth,
      calculateStats,
    ]
  );

  // Compile controls
  const controls: AdapterControls = useMemo(
    () => ({
      measureLatency,
      estimateBandwidth,
      startMonitoring,
      stopMonitoring,
      evaluate,
      getRecommendations,
      resetMetrics,
      setQualityOverride,
    }),
    [
      measureLatency,
      estimateBandwidth,
      startMonitoring,
      stopMonitoring,
      evaluate,
      getRecommendations,
      resetMetrics,
    ]
  );

  // Current recommendations
  const recommendations = useMemo(() => getRecommendations(), [getRecommendations]);

  return {
    state,
    metrics,
    recommendations,
    controls,
  };
}

// ============================================================================
// Type definitions for browser APIs
// ============================================================================

interface NetworkInformation {
  effectiveType: "slow-2g" | "2g" | "3g" | "4g";
  type?: "bluetooth" | "cellular" | "ethernet" | "wifi" | "wimax" | "other" | "unknown";
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple connection quality hook
 */
export function useConnectionQuality(): ConnectionQuality {
  const { state } = useNetworkLatencyAdapter();
  return state.connectionQuality;
}

/**
 * Is online hook
 */
export function useIsNetworkOnline(): boolean {
  const { state } = useNetworkLatencyAdapter();
  return state.isOnline;
}

/**
 * Connection health hook (0-1)
 */
export function useConnectionHealth(): number {
  const { state } = useNetworkLatencyAdapter();
  return state.connectionHealth;
}

/**
 * Recommended quality tier hook
 */
export function useRecommendedQualityTier(): "ultra" | "high" | "medium" | "low" | "minimal" {
  const { recommendations } = useNetworkLatencyAdapter();
  return recommendations.recommendedQualityTier;
}

export default useNetworkLatencyAdapter;
