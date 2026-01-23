/**
 * useAdaptiveStreamingQuality Hook - Sprint 513
 *
 * Dynamic quality adaptation for audio/video streaming based on network conditions.
 * Provides smooth quality transitions without interrupting playback.
 *
 * Features:
 * - Real-time bandwidth estimation
 * - Buffer health monitoring
 * - Quality level selection (adaptive bitrate)
 * - Smooth quality transitions
 * - Rebuffering prevention
 * - Quality history for trend analysis
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type StreamQualityLevel = "auto" | "4k" | "1080p" | "720p" | "480p" | "360p" | "240p" | "audio";

export type BufferHealth = "healthy" | "warning" | "critical" | "empty";

export type QualityTrend = "improving" | "stable" | "degrading";

export interface QualityProfile {
  level: StreamQualityLevel;
  bitrate: number; // kbps
  resolution: { width: number; height: number };
  minBandwidth: number; // kbps required
  bufferTarget: number; // seconds
}

export interface BufferState {
  current: number; // seconds
  target: number; // seconds
  health: BufferHealth;
  fillRate: number; // seconds/second
  drainRate: number; // seconds/second
}

export interface BandwidthEstimate {
  current: number; // kbps
  average: number; // kbps
  peak: number; // kbps
  minimum: number; // kbps
  stability: number; // 0-1
  samples: number;
}

export interface QualityTransition {
  from: StreamQualityLevel;
  to: StreamQualityLevel;
  reason: "bandwidth" | "buffer" | "manual" | "startup";
  timestamp: number;
  seamless: boolean;
}

export interface StreamingMetrics {
  currentQuality: StreamQualityLevel;
  effectiveBitrate: number;
  bufferHealth: BufferHealth;
  rebufferCount: number;
  rebufferDuration: number; // total ms
  qualityChanges: number;
  averageQuality: number; // 0-100 score
  playbackTime: number; // ms
}

export interface AdaptiveStreamingConfig {
  enabled: boolean;
  profiles: QualityProfile[];
  minBufferSeconds: number;
  maxBufferSeconds: number;
  bandwidthSafetyFactor: number; // 0-1, use this fraction of estimated bandwidth
  qualityChangeDelay: number; // ms between quality changes
  enableUpscaling: boolean;
  preferStability: boolean; // Prefer stable quality over optimal
  startupQuality: StreamQualityLevel;
}

export interface AdaptiveStreamingState {
  quality: StreamQualityLevel;
  buffer: BufferState;
  bandwidth: BandwidthEstimate;
  isBuffering: boolean;
  isPlaying: boolean;
  trend: QualityTrend;
  transitions: QualityTransition[];
}

export interface AdaptiveStreamingControls {
  setQuality: (level: StreamQualityLevel) => void;
  forceQuality: (level: StreamQualityLevel | null) => void;
  recordBandwidth: (bytesLoaded: number, durationMs: number) => void;
  updateBuffer: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  getOptimalQuality: () => StreamQualityLevel;
  resetMetrics: () => void;
}

export interface UseAdaptiveStreamingQualityResult {
  state: AdaptiveStreamingState;
  metrics: StreamingMetrics;
  controls: AdaptiveStreamingControls;
  currentProfile: QualityProfile;
  recommendedQuality: StreamQualityLevel;
  shouldUpgrade: boolean;
  shouldDowngrade: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PROFILES: QualityProfile[] = [
  { level: "4k", bitrate: 15000, resolution: { width: 3840, height: 2160 }, minBandwidth: 20000, bufferTarget: 30 },
  { level: "1080p", bitrate: 5000, resolution: { width: 1920, height: 1080 }, minBandwidth: 6500, bufferTarget: 20 },
  { level: "720p", bitrate: 2500, resolution: { width: 1280, height: 720 }, minBandwidth: 3500, bufferTarget: 15 },
  { level: "480p", bitrate: 1000, resolution: { width: 854, height: 480 }, minBandwidth: 1500, bufferTarget: 10 },
  { level: "360p", bitrate: 500, resolution: { width: 640, height: 360 }, minBandwidth: 750, bufferTarget: 8 },
  { level: "240p", bitrate: 250, resolution: { width: 426, height: 240 }, minBandwidth: 400, bufferTarget: 6 },
  { level: "audio", bitrate: 128, resolution: { width: 0, height: 0 }, minBandwidth: 200, bufferTarget: 5 },
];

const DEFAULT_CONFIG: AdaptiveStreamingConfig = {
  enabled: true,
  profiles: DEFAULT_PROFILES,
  minBufferSeconds: 2,
  maxBufferSeconds: 30,
  bandwidthSafetyFactor: 0.8,
  qualityChangeDelay: 5000,
  enableUpscaling: true,
  preferStability: true,
  startupQuality: "720p",
};

// ============================================================================
// Utility Functions
// ============================================================================

function getBufferHealth(current: number, target: number, min: number): BufferHealth {
  if (current <= 0) return "empty";
  if (current < min) return "critical";
  if (current < target * 0.5) return "warning";
  return "healthy";
}

function selectOptimalQuality(
  bandwidth: number,
  bufferHealth: BufferHealth,
  profiles: QualityProfile[],
  safetyFactor: number,
  preferStability: boolean,
  currentQuality: StreamQualityLevel
): StreamQualityLevel {
  const safeBandwidth = bandwidth * safetyFactor;

  // Find highest quality we can sustain
  const sortedProfiles = [...profiles].sort((a, b) => b.bitrate - a.bitrate);

  for (const profile of sortedProfiles) {
    if (safeBandwidth >= profile.minBandwidth) {
      // Buffer health adjustment
      if (bufferHealth === "critical" || bufferHealth === "empty") {
        // Go lower during buffer issues
        const idx = sortedProfiles.indexOf(profile);
        const lowerIdx = Math.min(sortedProfiles.length - 1, idx + 2);
        return sortedProfiles[lowerIdx].level;
      }

      if (bufferHealth === "warning") {
        // Go one level lower during warnings
        const idx = sortedProfiles.indexOf(profile);
        const lowerIdx = Math.min(sortedProfiles.length - 1, idx + 1);
        return sortedProfiles[lowerIdx].level;
      }

      // Stability preference
      if (preferStability && currentQuality !== "auto") {
        const currentProfile = profiles.find((p) => p.level === currentQuality);
        if (currentProfile && profile.bitrate > currentProfile.bitrate * 1.5) {
          // Don't jump more than 1.5x bitrate at once
          return currentQuality;
        }
      }

      return profile.level;
    }
  }

  // Fallback to lowest quality
  return sortedProfiles[sortedProfiles.length - 1].level;
}

function calculateQualityScore(
  quality: StreamQualityLevel,
  profiles: QualityProfile[]
): number {
  const profile = profiles.find((p) => p.level === quality);
  if (!profile) return 50;

  const maxBitrate = Math.max(...profiles.map((p) => p.bitrate));
  return (profile.bitrate / maxBitrate) * 100;
}

function analyzeTrend(transitions: QualityTransition[], windowMs: number = 60000): QualityTrend {
  const now = Date.now();
  const recent = transitions.filter((t) => now - t.timestamp < windowMs);

  if (recent.length < 2) return "stable";

  const profiles = DEFAULT_PROFILES;
  let qualityDelta = 0;

  for (let i = 1; i < recent.length; i++) {
    const fromIdx = profiles.findIndex((p) => p.level === recent[i].from);
    const toIdx = profiles.findIndex((p) => p.level === recent[i].to);
    qualityDelta += fromIdx - toIdx; // Positive = upgrade, negative = downgrade
  }

  if (qualityDelta > 1) return "improving";
  if (qualityDelta < -1) return "degrading";
  return "stable";
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAdaptiveStreamingQuality(
  config: Partial<AdaptiveStreamingConfig> = {}
): UseAdaptiveStreamingQualityResult {
  const mergedConfig = useMemo(
    () => ({
      ...DEFAULT_CONFIG,
      ...config,
      profiles: config.profiles || DEFAULT_CONFIG.profiles,
    }),
    [config]
  );

  // State
  const [state, setState] = useState<AdaptiveStreamingState>({
    quality: mergedConfig.startupQuality,
    buffer: {
      current: 0,
      target: mergedConfig.profiles.find((p) => p.level === mergedConfig.startupQuality)?.bufferTarget || 15,
      health: "empty",
      fillRate: 0,
      drainRate: 1,
    },
    bandwidth: {
      current: 0,
      average: 0,
      peak: 0,
      minimum: Infinity,
      stability: 1,
      samples: 0,
    },
    isBuffering: true,
    isPlaying: false,
    trend: "stable",
    transitions: [],
  });

  // Forced quality (manual override)
  const [forcedQuality, setForcedQuality] = useState<StreamQualityLevel | null>(null);

  // Metrics
  const [metrics, setMetrics] = useState<StreamingMetrics>({
    currentQuality: mergedConfig.startupQuality,
    effectiveBitrate: 0,
    bufferHealth: "empty",
    rebufferCount: 0,
    rebufferDuration: 0,
    qualityChanges: 0,
    averageQuality: 50,
    playbackTime: 0,
  });

  // Refs for bandwidth calculation
  const bandwidthSamplesRef = useRef<number[]>([]);
  const lastQualityChangeRef = useRef<number>(0);
  const rebufferStartRef = useRef<number | null>(null);
  const playbackStartRef = useRef<number | null>(null);

  // Current profile
  const currentProfile = useMemo(
    () =>
      mergedConfig.profiles.find((p) => p.level === state.quality) ||
      mergedConfig.profiles[0],
    [state.quality, mergedConfig.profiles]
  );

  // Calculate optimal quality
  const recommendedQuality = useMemo(() => {
    if (state.bandwidth.samples < 3) return mergedConfig.startupQuality;

    return selectOptimalQuality(
      state.bandwidth.average,
      state.buffer.health,
      mergedConfig.profiles,
      mergedConfig.bandwidthSafetyFactor,
      mergedConfig.preferStability,
      state.quality
    );
  }, [
    state.bandwidth.average,
    state.bandwidth.samples,
    state.buffer.health,
    state.quality,
    mergedConfig,
  ]);

  // Should upgrade/downgrade
  const shouldUpgrade = useMemo(() => {
    if (!mergedConfig.enableUpscaling) return false;
    if (forcedQuality) return false;
    if (state.buffer.health !== "healthy") return false;

    const currentIdx = mergedConfig.profiles.findIndex((p) => p.level === state.quality);
    const recommendedIdx = mergedConfig.profiles.findIndex((p) => p.level === recommendedQuality);

    return recommendedIdx < currentIdx; // Lower index = higher quality
  }, [state.quality, recommendedQuality, state.buffer.health, forcedQuality, mergedConfig]);

  const shouldDowngrade = useMemo(() => {
    if (forcedQuality) return false;

    const currentIdx = mergedConfig.profiles.findIndex((p) => p.level === state.quality);
    const recommendedIdx = mergedConfig.profiles.findIndex((p) => p.level === recommendedQuality);

    return recommendedIdx > currentIdx;
  }, [state.quality, recommendedQuality, forcedQuality, mergedConfig.profiles]);

  // Auto quality adjustment
  useEffect(() => {
    if (!mergedConfig.enabled || forcedQuality) return;

    const now = Date.now();
    if (now - lastQualityChangeRef.current < mergedConfig.qualityChangeDelay) return;

    if (shouldDowngrade || (shouldUpgrade && state.buffer.health === "healthy")) {
      const newQuality = recommendedQuality;

      setState((prev) => {
        const transition: QualityTransition = {
          from: prev.quality,
          to: newQuality,
          reason: prev.buffer.health !== "healthy" ? "buffer" : "bandwidth",
          timestamp: now,
          seamless: prev.buffer.current > mergedConfig.minBufferSeconds,
        };

        return {
          ...prev,
          quality: newQuality,
          transitions: [...prev.transitions.slice(-20), transition],
          trend: analyzeTrend([...prev.transitions, transition]),
        };
      });

      setMetrics((prev) => ({
        ...prev,
        currentQuality: newQuality,
        qualityChanges: prev.qualityChanges + 1,
      }));

      lastQualityChangeRef.current = now;
    }
  }, [
    shouldUpgrade,
    shouldDowngrade,
    recommendedQuality,
    state.buffer.health,
    state.buffer.current,
    forcedQuality,
    mergedConfig,
  ]);

  // Track rebuffering
  useEffect(() => {
    if (state.isBuffering && state.isPlaying && !rebufferStartRef.current) {
      rebufferStartRef.current = Date.now();
      setMetrics((prev) => ({
        ...prev,
        rebufferCount: prev.rebufferCount + 1,
      }));
    } else if (!state.isBuffering && rebufferStartRef.current) {
      const duration = Date.now() - rebufferStartRef.current;
      rebufferStartRef.current = null;
      setMetrics((prev) => ({
        ...prev,
        rebufferDuration: prev.rebufferDuration + duration,
      }));
    }
  }, [state.isBuffering, state.isPlaying]);

  // Track playback time
  useEffect(() => {
    if (state.isPlaying && !state.isBuffering) {
      const interval = setInterval(() => {
        setMetrics((prev) => ({
          ...prev,
          playbackTime: prev.playbackTime + 1000,
        }));
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [state.isPlaying, state.isBuffering]);

  // Controls
  const setQuality = useCallback((level: StreamQualityLevel) => {
    if (level === "auto") {
      setForcedQuality(null);
    } else {
      setState((prev) => ({
        ...prev,
        quality: level,
        transitions: [
          ...prev.transitions.slice(-20),
          { from: prev.quality, to: level, reason: "manual", timestamp: Date.now(), seamless: true },
        ],
      }));
      setMetrics((prev) => ({
        ...prev,
        currentQuality: level,
        qualityChanges: prev.qualityChanges + 1,
      }));
    }
  }, []);

  const forceQuality = useCallback((level: StreamQualityLevel | null) => {
    setForcedQuality(level);
    if (level) {
      setState((prev) => ({ ...prev, quality: level }));
    }
  }, []);

  const recordBandwidth = useCallback((bytesLoaded: number, durationMs: number) => {
    if (durationMs <= 0) return;

    const bandwidthKbps = (bytesLoaded * 8) / durationMs; // kbps

    bandwidthSamplesRef.current.push(bandwidthKbps);
    if (bandwidthSamplesRef.current.length > 30) {
      bandwidthSamplesRef.current.shift();
    }

    const samples = bandwidthSamplesRef.current;
    const average = samples.reduce((a, b) => a + b, 0) / samples.length;
    const peak = Math.max(...samples);
    const minimum = Math.min(...samples);

    // Calculate stability (inverse of variance)
    const variance = samples.reduce((sum, s) => sum + Math.pow(s - average, 2), 0) / samples.length;
    const stability = Math.max(0, 1 - Math.sqrt(variance) / average);

    setState((prev) => ({
      ...prev,
      bandwidth: {
        current: bandwidthKbps,
        average,
        peak,
        minimum,
        stability,
        samples: samples.length,
      },
    }));

    setMetrics((prev) => ({
      ...prev,
      effectiveBitrate: average,
    }));
  }, []);

  const updateBuffer = useCallback(
    (seconds: number) => {
      setState((prev) => {
        const health = getBufferHealth(seconds, prev.buffer.target, mergedConfig.minBufferSeconds);
        const isBuffering = seconds < mergedConfig.minBufferSeconds;

        return {
          ...prev,
          buffer: {
            ...prev.buffer,
            current: seconds,
            health,
          },
          isBuffering,
        };
      });

      setMetrics((prev) => ({
        ...prev,
        bufferHealth: getBufferHealth(seconds, currentProfile.bufferTarget, mergedConfig.minBufferSeconds),
      }));
    },
    [mergedConfig.minBufferSeconds, currentProfile.bufferTarget]
  );

  const play = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: true }));
    if (!playbackStartRef.current) {
      playbackStartRef.current = Date.now();
    }
  }, []);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const getOptimalQuality = useCallback((): StreamQualityLevel => {
    return recommendedQuality;
  }, [recommendedQuality]);

  const resetMetrics = useCallback(() => {
    bandwidthSamplesRef.current = [];
    rebufferStartRef.current = null;
    playbackStartRef.current = null;

    setMetrics({
      currentQuality: state.quality,
      effectiveBitrate: 0,
      bufferHealth: "empty",
      rebufferCount: 0,
      rebufferDuration: 0,
      qualityChanges: 0,
      averageQuality: 50,
      playbackTime: 0,
    });

    setState((prev) => ({
      ...prev,
      transitions: [],
      trend: "stable",
    }));
  }, [state.quality]);

  const controls: AdaptiveStreamingControls = useMemo(
    () => ({
      setQuality,
      forceQuality,
      recordBandwidth,
      updateBuffer,
      play,
      pause,
      getOptimalQuality,
      resetMetrics,
    }),
    [setQuality, forceQuality, recordBandwidth, updateBuffer, play, pause, getOptimalQuality, resetMetrics]
  );

  // Update average quality in metrics
  useEffect(() => {
    const score = calculateQualityScore(state.quality, mergedConfig.profiles);
    setMetrics((prev) => ({
      ...prev,
      averageQuality: prev.averageQuality * 0.9 + score * 0.1,
    }));
  }, [state.quality, mergedConfig.profiles]);

  return {
    state,
    metrics,
    controls,
    currentProfile,
    recommendedQuality,
    shouldUpgrade,
    shouldDowngrade,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple hook for current quality level
 */
export function useStreamingQuality(
  config?: Partial<AdaptiveStreamingConfig>
): { quality: StreamQualityLevel; isBuffering: boolean } {
  const { state } = useAdaptiveStreamingQuality(config);
  return { quality: state.quality, isBuffering: state.isBuffering };
}

/**
 * Hook for buffer monitoring
 */
export function useBufferHealth(
  config?: Partial<AdaptiveStreamingConfig>
): { health: BufferHealth; seconds: number; isHealthy: boolean } {
  const { state } = useAdaptiveStreamingQuality(config);
  return {
    health: state.buffer.health,
    seconds: state.buffer.current,
    isHealthy: state.buffer.health === "healthy",
  };
}

export default useAdaptiveStreamingQuality;
