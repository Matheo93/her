"use client";

/**
 * useMobileAudioOptimizer - Mobile Audio Latency and Buffer Optimization
 *
 * Provides adaptive audio buffer management, latency compensation,
 * and efficient audio data handling for mobile devices.
 *
 * Sprint 440: Avatar UX and mobile latency improvements
 *
 * Key optimizations:
 * - Adaptive audio buffer sizing based on network conditions
 * - Jitter buffer for smooth playback on unstable connections
 * - Efficient audio encoding with optional compression
 * - Pre-buffering strategies for voice responses
 * - Battery-aware audio processing
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMobileDetect } from "./useMobileDetect";
import { useNetworkStatus } from "./useNetworkStatus";
import { useLatencyOptimizer } from "./useLatencyOptimizer";
import { useDeviceCapabilities } from "./useDeviceCapabilities";

// Audio quality levels
type AudioQuality = "high" | "medium" | "low" | "ultra-low";

// Connection quality for audio decisions
type ConnectionQuality = "excellent" | "good" | "fair" | "poor" | "offline";

interface AudioBufferConfig {
  // Playback buffer size in seconds
  playbackBufferSec: number;

  // Minimum buffer before starting playback
  minBufferBeforePlay: number;

  // Maximum buffer size (to limit memory)
  maxBufferSec: number;

  // Jitter buffer size in ms
  jitterBufferMs: number;

  // Audio sample rate
  sampleRate: 44100 | 22050 | 16000 | 8000;

  // Bit depth
  bitDepth: 16 | 8;

  // Channels (mono/stereo)
  channels: 1 | 2;

  // Use compression for transmission
  useCompression: boolean;

  // Compression level (0-9)
  compressionLevel: number;
}

interface AudioProcessingConfig {
  // FFT size for visualization
  fftSize: 32 | 64 | 128 | 256 | 512 | 1024;

  // Visualization update rate (Hz)
  visualizationUpdateRate: number;

  // Enable voice activity detection
  enableVAD: boolean;

  // VAD threshold
  vadThreshold: number;

  // Enable echo cancellation
  enableEchoCancellation: boolean;

  // Enable noise suppression
  enableNoiseSuppression: boolean;

  // Enable automatic gain control
  enableAGC: boolean;
}

interface AudioLatencyMetrics {
  // Current estimated audio latency (ms)
  estimatedLatency: number;

  // Network RTT component (ms)
  networkLatency: number;

  // Processing latency component (ms)
  processingLatency: number;

  // Buffer latency component (ms)
  bufferLatency: number;

  // Playback position drift (ms) - positive = ahead, negative = behind
  playbackDrift: number;

  // Number of buffer underruns
  bufferUnderruns: number;

  // Number of buffer overflows
  bufferOverflows: number;

  // Average jitter (ms)
  jitter: number;

  // Connection quality assessment
  connectionQuality: ConnectionQuality;
}

interface AudioOptimizerControls {
  // Update buffer configuration
  setBufferConfig: (config: Partial<AudioBufferConfig>) => void;

  // Update processing configuration
  setProcessingConfig: (config: Partial<AudioProcessingConfig>) => void;

  // Force quality level
  forceQuality: (quality: AudioQuality | "auto") => void;

  // Record a latency sample
  recordLatency: (latencyMs: number) => void;

  // Record buffer event
  recordBufferEvent: (event: "underrun" | "overflow") => void;

  // Reset metrics
  resetMetrics: () => void;

  // Start/stop optimization
  startOptimization: () => void;
  stopOptimization: () => void;

  // Get optimized audio constraints for getUserMedia
  getAudioConstraints: () => MediaTrackConstraints;
}

interface MobileAudioOptimizerResult {
  // Current quality level
  quality: AudioQuality;

  // Buffer configuration
  bufferConfig: AudioBufferConfig;

  // Processing configuration
  processingConfig: AudioProcessingConfig;

  // Latency metrics
  metrics: AudioLatencyMetrics;

  // Controls
  controls: AudioOptimizerControls;

  // Flags
  isMobile: boolean;
  isOptimizing: boolean;
  shouldReduceQuality: boolean;
  shouldPreBuffer: boolean;
}

interface UseMobileAudioOptimizerOptions {
  // Enable optimization
  enabled?: boolean;

  // Target maximum latency (ms)
  targetLatency?: number;

  // Callback when quality changes
  onQualityChange?: (quality: AudioQuality) => void;

  // Callback on buffer issues
  onBufferIssue?: (issue: "underrun" | "overflow") => void;
}

// Quality tier configurations
const QUALITY_CONFIGS: Record<AudioQuality, {
  buffer: Partial<AudioBufferConfig>;
  processing: Partial<AudioProcessingConfig>;
}> = {
  high: {
    buffer: {
      playbackBufferSec: 0.1,
      minBufferBeforePlay: 0.05,
      maxBufferSec: 2,
      jitterBufferMs: 20,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      useCompression: false,
      compressionLevel: 0,
    },
    processing: {
      fftSize: 256,
      visualizationUpdateRate: 60,
      enableVAD: true,
      vadThreshold: 0.01,
      enableEchoCancellation: true,
      enableNoiseSuppression: true,
      enableAGC: true,
    },
  },
  medium: {
    buffer: {
      playbackBufferSec: 0.15,
      minBufferBeforePlay: 0.1,
      maxBufferSec: 3,
      jitterBufferMs: 50,
      sampleRate: 22050,
      bitDepth: 16,
      channels: 1,
      useCompression: true,
      compressionLevel: 3,
    },
    processing: {
      fftSize: 128,
      visualizationUpdateRate: 30,
      enableVAD: true,
      vadThreshold: 0.02,
      enableEchoCancellation: true,
      enableNoiseSuppression: true,
      enableAGC: true,
    },
  },
  low: {
    buffer: {
      playbackBufferSec: 0.3,
      minBufferBeforePlay: 0.2,
      maxBufferSec: 5,
      jitterBufferMs: 100,
      sampleRate: 16000,
      bitDepth: 16,
      channels: 1,
      useCompression: true,
      compressionLevel: 6,
    },
    processing: {
      fftSize: 64,
      visualizationUpdateRate: 15,
      enableVAD: true,
      vadThreshold: 0.03,
      enableEchoCancellation: true,
      enableNoiseSuppression: false,
      enableAGC: true,
    },
  },
  "ultra-low": {
    buffer: {
      playbackBufferSec: 0.5,
      minBufferBeforePlay: 0.3,
      maxBufferSec: 10,
      jitterBufferMs: 200,
      sampleRate: 8000,
      bitDepth: 8,
      channels: 1,
      useCompression: true,
      compressionLevel: 9,
    },
    processing: {
      fftSize: 32,
      visualizationUpdateRate: 5,
      enableVAD: false,
      vadThreshold: 0.05,
      enableEchoCancellation: false,
      enableNoiseSuppression: false,
      enableAGC: false,
    },
  },
};

const DEFAULT_BUFFER_CONFIG: AudioBufferConfig = {
  playbackBufferSec: 0.15,
  minBufferBeforePlay: 0.1,
  maxBufferSec: 3,
  jitterBufferMs: 50,
  sampleRate: 22050,
  bitDepth: 16,
  channels: 1,
  useCompression: true,
  compressionLevel: 3,
};

const DEFAULT_PROCESSING_CONFIG: AudioProcessingConfig = {
  fftSize: 128,
  visualizationUpdateRate: 30,
  enableVAD: true,
  vadThreshold: 0.02,
  enableEchoCancellation: true,
  enableNoiseSuppression: true,
  enableAGC: true,
};

// Latency samples history size limit
const LATENCY_HISTORY_SIZE = 50;

export function useMobileAudioOptimizer(
  options: UseMobileAudioOptimizerOptions = {}
): MobileAudioOptimizerResult {
  const {
    enabled = true,
    targetLatency = 200,
    onQualityChange,
    onBufferIssue,
  } = options;

  // Core hooks
  const { isMobile, isIOS, isAndroid } = useMobileDetect();
  const { isOnline, isSlowConnection, rtt, effectiveType, saveData } = useNetworkStatus();
  const { metrics: latencyMetrics } = useLatencyOptimizer({ autoStart: enabled });
  const deviceCapabilities = useDeviceCapabilities();

  // State
  const [forcedQuality, setForcedQuality] = useState<AudioQuality | "auto">("auto");
  const [isOptimizing, setIsOptimizing] = useState(enabled);
  const [bufferConfig, setBufferConfigState] = useState<AudioBufferConfig>(DEFAULT_BUFFER_CONFIG);
  const [processingConfig, setProcessingConfigState] = useState<AudioProcessingConfig>(DEFAULT_PROCESSING_CONFIG);

  // Metrics state
  const [bufferUnderruns, setBufferUnderruns] = useState(0);
  const [bufferOverflows, setBufferOverflows] = useState(0);
  const [latencySamples, setLatencySamples] = useState<number[]>([]);

  // Refs
  const prevQualityRef = useRef<AudioQuality | null>(null);

  // Calculate connection quality
  const connectionQuality = useMemo((): ConnectionQuality => {
    if (!isOnline) return "offline";

    const avgLatency = latencyMetrics.averageLatency;
    const networkRtt = rtt || avgLatency;

    if (networkRtt < 50 && effectiveType === "4g") return "excellent";
    if (networkRtt < 100) return "good";
    if (networkRtt < 200 || effectiveType === "3g") return "fair";
    return "poor";
  }, [isOnline, latencyMetrics.averageLatency, rtt, effectiveType]);

  // Calculate effective quality
  const calculatedQuality = useMemo((): AudioQuality => {
    if (forcedQuality !== "auto") return forcedQuality;
    if (!enabled) return "high";

    // Start with device tier
    let quality: AudioQuality;
    switch (deviceCapabilities.tier) {
      case "high":
        quality = isMobile ? "medium" : "high";
        break;
      case "medium":
        quality = "medium";
        break;
      case "low":
      default:
        quality = "low";
        break;
    }

    // Downgrade based on network
    if (!isOnline) {
      return "ultra-low";
    }

    if (connectionQuality === "poor") {
      quality = quality === "high" ? "low" : "ultra-low";
    } else if (connectionQuality === "fair") {
      quality = quality === "high" ? "medium" : quality === "medium" ? "low" : quality;
    }

    // Downgrade for data saver
    if (saveData && quality !== "ultra-low") {
      quality = quality === "high" ? "medium" : quality === "medium" ? "low" : "ultra-low";
    }

    // Downgrade for battery
    if (deviceCapabilities.battery.isLowBattery && quality !== "ultra-low") {
      quality = quality === "high" ? "medium" : "low";
    }

    // Downgrade if buffer issues
    if (bufferUnderruns > 5 && quality !== "ultra-low") {
      quality = quality === "high" ? "medium" : quality === "medium" ? "low" : "ultra-low";
    }

    return quality;
  }, [
    forcedQuality,
    enabled,
    deviceCapabilities.tier,
    deviceCapabilities.battery.isLowBattery,
    isMobile,
    isOnline,
    connectionQuality,
    saveData,
    bufferUnderruns,
  ]);

  // Notify on quality change
  useEffect(() => {
    if (prevQualityRef.current !== null && prevQualityRef.current !== calculatedQuality) {
      onQualityChange?.(calculatedQuality);
    }
    prevQualityRef.current = calculatedQuality;
  }, [calculatedQuality, onQualityChange]);

  // Update configs when quality changes
  useEffect(() => {
    if (!isOptimizing) return;

    const qualityConfig = QUALITY_CONFIGS[calculatedQuality];

    setBufferConfigState((prev) => ({
      ...prev,
      ...qualityConfig.buffer,
    }));

    setProcessingConfigState((prev) => ({
      ...prev,
      ...qualityConfig.processing,
    }));
  }, [calculatedQuality, isOptimizing]);

  // Calculate metrics
  const metrics = useMemo((): AudioLatencyMetrics => {
    const networkLatency = latencyMetrics.averageLatency || rtt || 100;
    const processingLatency = calculatedQuality === "high" ? 10 :
      calculatedQuality === "medium" ? 15 :
      calculatedQuality === "low" ? 25 : 40;
    const bufferLatencyMs = bufferConfig.jitterBufferMs + (bufferConfig.minBufferBeforePlay * 1000);

    // Calculate jitter from latency samples
    const jitter = latencySamples.length > 1
      ? Math.sqrt(
          latencySamples
            .map((s) => Math.pow(s - networkLatency, 2))
            .reduce((a, b) => a + b, 0) / latencySamples.length
        )
      : 0;

    return {
      estimatedLatency: networkLatency + processingLatency + bufferLatencyMs,
      networkLatency,
      processingLatency,
      bufferLatency: bufferLatencyMs,
      playbackDrift: 0, // Would need actual audio context to measure
      bufferUnderruns,
      bufferOverflows,
      jitter,
      connectionQuality,
    };
  }, [
    latencyMetrics.averageLatency,
    rtt,
    calculatedQuality,
    bufferConfig.jitterBufferMs,
    bufferConfig.minBufferBeforePlay,
    latencySamples,
    bufferUnderruns,
    bufferOverflows,
    connectionQuality,
  ]);

  // Control functions
  const setBufferConfig = useCallback((config: Partial<AudioBufferConfig>) => {
    setBufferConfigState((prev) => ({ ...prev, ...config }));
  }, []);

  const setProcessingConfig = useCallback((config: Partial<AudioProcessingConfig>) => {
    setProcessingConfigState((prev) => ({ ...prev, ...config }));
  }, []);

  const forceQuality = useCallback((quality: AudioQuality | "auto") => {
    setForcedQuality(quality);
  }, []);

  const recordLatency = useCallback((latencyMs: number) => {
    setLatencySamples((prev) => {
      // Use push + slice(-N) instead of spread for better performance
      // This avoids creating intermediate arrays
      if (prev.length >= LATENCY_HISTORY_SIZE) {
        return [...prev.slice(-(LATENCY_HISTORY_SIZE - 1)), latencyMs];
      }
      return [...prev, latencyMs];
    });
  }, []);

  const recordBufferEvent = useCallback((event: "underrun" | "overflow") => {
    if (event === "underrun") {
      setBufferUnderruns((c) => c + 1);
      onBufferIssue?.("underrun");
    } else {
      setBufferOverflows((c) => c + 1);
      onBufferIssue?.("overflow");
    }
  }, [onBufferIssue]);

  const resetMetrics = useCallback(() => {
    setBufferUnderruns(0);
    setBufferOverflows(0);
    setLatencySamples([]);
  }, []);

  const startOptimization = useCallback(() => {
    setIsOptimizing(true);
  }, []);

  const stopOptimization = useCallback(() => {
    setIsOptimizing(false);
  }, []);

  // Generate optimized audio constraints for getUserMedia
  const getAudioConstraints = useCallback((): MediaTrackConstraints => {
    const base: MediaTrackConstraints = {
      echoCancellation: processingConfig.enableEchoCancellation,
      noiseSuppression: processingConfig.enableNoiseSuppression,
      autoGainControl: processingConfig.enableAGC,
    };

    // Add sample rate if supported
    if (bufferConfig.sampleRate !== 44100) {
      base.sampleRate = bufferConfig.sampleRate;
    }

    // Add channel count
    base.channelCount = bufferConfig.channels;

    // iOS-specific optimizations
    if (isIOS) {
      // iOS Safari has specific behaviors
      base.echoCancellation = true; // Force for iOS
    }

    // Android-specific optimizations
    if (isAndroid) {
      // Some Android devices work better with specific settings
      base.noiseSuppression = calculatedQuality !== "ultra-low";
    }

    return base;
  }, [
    processingConfig.enableEchoCancellation,
    processingConfig.enableNoiseSuppression,
    processingConfig.enableAGC,
    bufferConfig.sampleRate,
    bufferConfig.channels,
    isIOS,
    isAndroid,
    calculatedQuality,
  ]);

  const controls: AudioOptimizerControls = useMemo(() => ({
    setBufferConfig,
    setProcessingConfig,
    forceQuality,
    recordLatency,
    recordBufferEvent,
    resetMetrics,
    startOptimization,
    stopOptimization,
    getAudioConstraints,
  }), [
    setBufferConfig,
    setProcessingConfig,
    forceQuality,
    recordLatency,
    recordBufferEvent,
    resetMetrics,
    startOptimization,
    stopOptimization,
    getAudioConstraints,
  ]);

  // Derived flags
  const shouldReduceQuality = connectionQuality === "poor" ||
    connectionQuality === "fair" ||
    deviceCapabilities.battery.isLowBattery ||
    bufferUnderruns > 3;

  const shouldPreBuffer = connectionQuality !== "excellent" ||
    metrics.jitter > 50;

  return {
    quality: calculatedQuality,
    bufferConfig,
    processingConfig,
    metrics,
    controls,
    isMobile,
    isOptimizing,
    shouldReduceQuality,
    shouldPreBuffer,
  };
}

/**
 * Simple hook for getting audio quality level
 */
export function useMobileAudioQuality(): AudioQuality {
  const { quality } = useMobileAudioOptimizer();
  return quality;
}

/**
 * Hook for audio buffer configuration based on mobile optimization
 */
export function useMobileAudioBufferConfig(): AudioBufferConfig {
  const { bufferConfig } = useMobileAudioOptimizer();
  return bufferConfig;
}

/**
 * Hook for audio processing configuration based on mobile optimization
 */
export function useMobileAudioProcessingConfig(): AudioProcessingConfig {
  const { processingConfig } = useMobileAudioOptimizer();
  return processingConfig;
}

/**
 * Hook for getting optimized audio constraints
 */
export function useOptimizedAudioConstraints(): MediaTrackConstraints {
  const { controls } = useMobileAudioOptimizer();
  return controls.getAudioConstraints();
}

// Export types
export type {
  AudioQuality,
  ConnectionQuality,
  AudioBufferConfig,
  AudioProcessingConfig,
  AudioLatencyMetrics,
  AudioOptimizerControls,
  MobileAudioOptimizerResult,
  UseMobileAudioOptimizerOptions,
};
