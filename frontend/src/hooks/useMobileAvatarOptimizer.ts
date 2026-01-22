"use client";

/**
 * useMobileAvatarOptimizer - Mobile-Specific Avatar Performance Optimization
 *
 * Combines mobile detection, latency optimization, and performance management
 * into a single hook for optimal avatar UX on mobile devices.
 *
 * Sprint 232: Avatar UX and mobile latency improvements
 *
 * Key optimizations:
 * - Adaptive animation frame rate based on device battery and temperature
 * - Touch-optimized interaction delays
 * - Network-aware quality adjustment
 * - Memory-conscious asset management
 * - Gesture-based performance triggers
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMobileDetect } from "./useMobileDetect";
import { useNetworkStatus } from "./useNetworkStatus";
import { useDeviceCapabilities } from "./useDeviceCapabilities";
import { useLatencyOptimizer } from "./useLatencyOptimizer";
import { useFrameRate } from "./useFrameRate";
import { useVisibility } from "./useVisibility";
import { useReducedMotion } from "./useReducedMotion";

// Mobile-specific quality tiers with granular controls
type MobileQualityTier = "ultra-low" | "low" | "medium" | "high";

interface MobileAvatarSettings {
  // Animation settings
  targetFPS: number;
  animationUpdateMs: number;
  enableLipSync: boolean;
  lipSyncQuality: "off" | "simple" | "full";
  enableEyeTracking: boolean;
  enableBreathing: boolean;
  enableIdleAnimations: boolean;
  enableMicroExpressions: boolean;
  enableBlinking: boolean;
  enableGestures: boolean;

  // Touch interaction settings
  touchDebounceMs: number;
  touchThrottleMs: number;
  enableHapticFeedback: boolean;
  tapDelayMs: number;

  // Asset loading settings
  textureScale: number;
  useCompressedTextures: boolean;
  maxTextureMemoryMB: number;
  prefetchAssets: boolean;

  // Network-aware settings
  audioBufferMs: number;
  requestTimeoutMs: number;
  enableOptimisticUpdates: boolean;
  batchAnimationUpdates: boolean;

  // Power-saving settings
  reduceAnimationsOnLowBattery: boolean;
  pauseOnBackground: boolean;
  maxIdleTimeMs: number;
}

interface MobileAvatarMetrics {
  currentQuality: MobileQualityTier;
  fps: number;
  frameDropRate: number;
  memoryPressure: "normal" | "moderate" | "high";
  thermalState: "nominal" | "fair" | "serious" | "critical";
  batteryLevel: number | null;
  isCharging: boolean;
  networkQuality: "excellent" | "good" | "fair" | "poor" | "offline";
  latencyMs: number;
  touchResponsiveness: "excellent" | "good" | "degraded";
}

interface MobileAvatarControls {
  forceQuality: (tier: MobileQualityTier | "auto") => void;
  pauseAnimations: () => void;
  resumeAnimations: () => void;
  setLowPowerMode: (enabled: boolean) => void;
  preloadAssets: () => Promise<void>;
  clearCache: () => void;
  reportInteraction: (type: "tap" | "swipe" | "long-press") => void;
}

interface MobileAvatarOptimization {
  // Optimization state
  isOptimized: boolean;
  isMobile: boolean;
  isLowPowerMode: boolean;
  isPaused: boolean;

  // Calculated settings
  settings: MobileAvatarSettings;

  // Performance metrics
  metrics: MobileAvatarMetrics;

  // Controls
  controls: MobileAvatarControls;

  // Quick access flags
  shouldReduceAnimations: boolean;
  shouldUseCSSAnimations: boolean;
  shouldPrefetchAudio: boolean;
  shouldBatchUpdates: boolean;
}

interface UseMobileAvatarOptimizerOptions {
  enabled?: boolean;
  onQualityChange?: (quality: MobileQualityTier) => void;
  onPerformanceWarning?: (message: string) => void;
  isAvatarActive?: boolean;
}

// Quality tier configurations
const QUALITY_CONFIGS: Record<MobileQualityTier, Partial<MobileAvatarSettings>> = {
  "ultra-low": {
    targetFPS: 15,
    animationUpdateMs: 67, // ~15fps
    enableLipSync: false,
    lipSyncQuality: "off",
    enableEyeTracking: false,
    enableBreathing: false,
    enableIdleAnimations: false,
    enableMicroExpressions: false,
    enableBlinking: true,
    enableGestures: false,
    touchDebounceMs: 200,
    touchThrottleMs: 100,
    enableHapticFeedback: false,
    tapDelayMs: 0,
    textureScale: 0.25,
    useCompressedTextures: true,
    maxTextureMemoryMB: 32,
    prefetchAssets: false,
    audioBufferMs: 500,
    requestTimeoutMs: 30000,
    enableOptimisticUpdates: false,
    batchAnimationUpdates: true,
    reduceAnimationsOnLowBattery: true,
    pauseOnBackground: true,
    maxIdleTimeMs: 30000,
  },
  low: {
    targetFPS: 24,
    animationUpdateMs: 42, // ~24fps
    enableLipSync: true,
    lipSyncQuality: "simple",
    enableEyeTracking: false,
    enableBreathing: true,
    enableIdleAnimations: false,
    enableMicroExpressions: false,
    enableBlinking: true,
    enableGestures: false,
    touchDebounceMs: 150,
    touchThrottleMs: 80,
    enableHapticFeedback: true,
    tapDelayMs: 0,
    textureScale: 0.5,
    useCompressedTextures: true,
    maxTextureMemoryMB: 64,
    prefetchAssets: false,
    audioBufferMs: 300,
    requestTimeoutMs: 20000,
    enableOptimisticUpdates: true,
    batchAnimationUpdates: true,
    reduceAnimationsOnLowBattery: true,
    pauseOnBackground: true,
    maxIdleTimeMs: 60000,
  },
  medium: {
    targetFPS: 30,
    animationUpdateMs: 33, // ~30fps
    enableLipSync: true,
    lipSyncQuality: "simple",
    enableEyeTracking: true,
    enableBreathing: true,
    enableIdleAnimations: true,
    enableMicroExpressions: false,
    enableBlinking: true,
    enableGestures: true,
    touchDebounceMs: 100,
    touchThrottleMs: 50,
    enableHapticFeedback: true,
    tapDelayMs: 0,
    textureScale: 0.75,
    useCompressedTextures: true,
    maxTextureMemoryMB: 128,
    prefetchAssets: true,
    audioBufferMs: 150,
    requestTimeoutMs: 12000,
    enableOptimisticUpdates: true,
    batchAnimationUpdates: false,
    reduceAnimationsOnLowBattery: true,
    pauseOnBackground: true,
    maxIdleTimeMs: 120000,
  },
  high: {
    targetFPS: 60,
    animationUpdateMs: 16, // ~60fps
    enableLipSync: true,
    lipSyncQuality: "full",
    enableEyeTracking: true,
    enableBreathing: true,
    enableIdleAnimations: true,
    enableMicroExpressions: true,
    enableBlinking: true,
    enableGestures: true,
    touchDebounceMs: 50,
    touchThrottleMs: 16,
    enableHapticFeedback: true,
    tapDelayMs: 0,
    textureScale: 1,
    useCompressedTextures: false,
    maxTextureMemoryMB: 256,
    prefetchAssets: true,
    audioBufferMs: 50,
    requestTimeoutMs: 8000,
    enableOptimisticUpdates: true,
    batchAnimationUpdates: false,
    reduceAnimationsOnLowBattery: false,
    pauseOnBackground: false,
    maxIdleTimeMs: 300000,
  },
};

// Default settings (medium quality baseline)
const DEFAULT_SETTINGS: MobileAvatarSettings = {
  ...QUALITY_CONFIGS.medium,
} as MobileAvatarSettings;

export function useMobileAvatarOptimizer(
  options: UseMobileAvatarOptimizerOptions = {}
): MobileAvatarOptimization {
  const {
    enabled = true,
    onQualityChange,
    onPerformanceWarning,
    isAvatarActive = false,
  } = options;

  // Core hooks
  const { isMobile, isTablet, isIOS, isAndroid, isTouchDevice } = useMobileDetect();
  const { isOnline, isSlowConnection, rtt, downlink, saveData } = useNetworkStatus();
  const deviceCapabilities = useDeviceCapabilities();
  const { metrics: latencyMetrics, strategy: latencyStrategy } = useLatencyOptimizer({
    autoStart: enabled && isMobile,
    monitoringInterval: 10000, // Check every 10s on mobile to save battery
  });
  const frameRate = useFrameRate({
    autoStart: enabled && isMobile && isAvatarActive,
    targetFps: 60,
  });
  const visibility = useVisibility();
  const prefersReducedMotion = useReducedMotion();

  // State
  const [forcedQuality, setForcedQuality] = useState<MobileQualityTier | "auto">("auto");
  const [isLowPowerMode, setIsLowPowerMode] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [thermalState, setThermalState] = useState<"nominal" | "fair" | "serious" | "critical">("nominal");
  const [interactionCount, setInteractionCount] = useState(0);

  // Refs
  const prevQualityRef = useRef<MobileQualityTier | null>(null);
  const lastInteractionRef = useRef<number>(Date.now());
  const frameDropsRef = useRef<number[]>([]);

  // Track frame drops
  useEffect(() => {
    if (frameRate.droppedFrames > 0) {
      frameDropsRef.current.push(frameRate.droppedFrames);
      if (frameDropsRef.current.length > 60) {
        frameDropsRef.current.shift();
      }
    }
  }, [frameRate.droppedFrames]);

  // Detect thermal state (Android only, simulated for iOS)
  useEffect(() => {
    if (!isAndroid || typeof navigator === "undefined") return;

    // Try to detect thermal state from battery/CPU
    const checkThermal = () => {
      const avgFps = frameRate.averageFps;
      const droppedRecently = frameDropsRef.current.slice(-10).reduce((a, b) => a + b, 0);

      // Heuristic: if FPS is consistently low and frames are dropping, device may be hot
      if (avgFps < 20 && droppedRecently > 20) {
        setThermalState("critical");
      } else if (avgFps < 30 && droppedRecently > 10) {
        setThermalState("serious");
      } else if (avgFps < 45 && droppedRecently > 5) {
        setThermalState("fair");
      } else {
        setThermalState("nominal");
      }
    };

    const interval = setInterval(checkThermal, 5000);
    return () => clearInterval(interval);
  }, [isAndroid, frameRate.averageFps]);

  // Calculate memory pressure
  const memoryPressure = useMemo((): "normal" | "moderate" | "high" => {
    const deviceMem = deviceCapabilities.memory.deviceMemory;
    if (deviceMem === null) return "normal";
    if (deviceMem <= 2) return "high";
    if (deviceMem <= 4) return "moderate";
    return "normal";
  }, [deviceCapabilities.memory.deviceMemory]);

  // Calculate effective quality tier
  const calculatedQuality = useMemo((): MobileQualityTier => {
    // If not mobile or not enabled, use high quality
    if (!enabled || (!isMobile && !isTablet)) return "high";

    // If forced, use that
    if (forcedQuality !== "auto") return forcedQuality;

    // Start with device tier mapping
    let quality: MobileQualityTier;
    switch (deviceCapabilities.tier) {
      case "high":
        quality = "high";
        break;
      case "medium":
        quality = "medium";
        break;
      case "low":
      default:
        quality = "low";
        break;
    }

    // Downgrade based on conditions
    const downgradeReasons: string[] = [];

    // Reduced motion preference
    if (prefersReducedMotion) {
      quality = "ultra-low";
      downgradeReasons.push("reduced motion preference");
    }

    // Battery concerns
    if (deviceCapabilities.battery.isLowBattery && quality !== "ultra-low") {
      quality = quality === "high" ? "medium" : quality === "medium" ? "low" : "ultra-low";
      downgradeReasons.push("low battery");
    }

    // Low power mode
    if (isLowPowerMode && quality !== "ultra-low") {
      quality = quality === "high" ? "low" : "ultra-low";
      downgradeReasons.push("low power mode");
    }

    // Network concerns
    if (!isOnline) {
      quality = "ultra-low";
      downgradeReasons.push("offline");
    } else if (isSlowConnection && quality !== "ultra-low") {
      quality = quality === "high" ? "medium" : quality === "medium" ? "low" : quality;
      downgradeReasons.push("slow connection");
    }

    // Save data mode
    if (saveData && quality !== "ultra-low") {
      quality = quality === "high" ? "medium" : "low";
      downgradeReasons.push("data saver enabled");
    }

    // Memory pressure
    if (memoryPressure === "high" && quality !== "ultra-low") {
      quality = "ultra-low";
      downgradeReasons.push("high memory pressure");
    } else if (memoryPressure === "moderate" && quality === "high") {
      quality = "medium";
      downgradeReasons.push("moderate memory pressure");
    }

    // Thermal throttling
    if (thermalState === "critical" && quality !== "ultra-low") {
      quality = "ultra-low";
      downgradeReasons.push("device overheating");
    } else if (thermalState === "serious" && quality !== "ultra-low") {
      quality = quality === "high" ? "low" : "ultra-low";
      downgradeReasons.push("thermal throttling");
    }

    // Frame rate concerns
    if (frameRate.isLowFps && frameRate.averageFps < 25) {
      if (quality === "high") quality = "medium";
      else if (quality === "medium") quality = "low";
      downgradeReasons.push("low frame rate");
    }

    // Notify about downgrade reasons
    if (downgradeReasons.length > 0 && onPerformanceWarning) {
      onPerformanceWarning(`Quality reduced: ${downgradeReasons.join(", ")}`);
    }

    return quality;
  }, [
    enabled,
    isMobile,
    isTablet,
    forcedQuality,
    deviceCapabilities.tier,
    deviceCapabilities.battery.isLowBattery,
    prefersReducedMotion,
    isLowPowerMode,
    isOnline,
    isSlowConnection,
    saveData,
    memoryPressure,
    thermalState,
    frameRate.isLowFps,
    frameRate.averageFps,
    onPerformanceWarning,
  ]);

  // Notify on quality change
  useEffect(() => {
    if (prevQualityRef.current !== null && prevQualityRef.current !== calculatedQuality) {
      onQualityChange?.(calculatedQuality);
    }
    prevQualityRef.current = calculatedQuality;
  }, [calculatedQuality, onQualityChange]);

  // Generate settings based on quality tier
  const settings = useMemo((): MobileAvatarSettings => {
    const baseConfig = QUALITY_CONFIGS[calculatedQuality];

    // Merge with defaults and apply dynamic adjustments
    const result: MobileAvatarSettings = {
      ...DEFAULT_SETTINGS,
      ...baseConfig,
    };

    // Dynamic adjustments based on latency
    if (latencyMetrics.quality === "poor") {
      result.audioBufferMs = Math.max(result.audioBufferMs, latencyStrategy.audioBufferMs);
      result.requestTimeoutMs = latencyStrategy.requestTimeout;
      result.enableOptimisticUpdates = latencyStrategy.useOptimisticUpdates;
    }

    // iOS-specific optimizations
    if (isIOS) {
      // iOS handles 120Hz well on newer devices
      if (deviceCapabilities.gpu.isHighPerformance && calculatedQuality === "high") {
        result.animationUpdateMs = 8; // 120fps capable
      }
      // iOS haptics are excellent
      result.enableHapticFeedback = calculatedQuality !== "ultra-low";
    }

    // Android-specific optimizations
    if (isAndroid) {
      // Many Android devices struggle with haptics
      result.enableHapticFeedback = calculatedQuality === "high";
      // Batch more aggressively on Android
      if (calculatedQuality !== "high") {
        result.batchAnimationUpdates = true;
      }
    }

    // Pause settings when not visible
    if (!visibility.isVisible && result.pauseOnBackground) {
      result.targetFPS = 0;
      result.animationUpdateMs = 1000;
    }

    return result;
  }, [
    calculatedQuality,
    latencyMetrics.quality,
    latencyStrategy,
    isIOS,
    isAndroid,
    deviceCapabilities.gpu.isHighPerformance,
    visibility.isVisible,
  ]);

  // Build metrics object
  const metrics = useMemo((): MobileAvatarMetrics => {
    const frameDropRate = frameDropsRef.current.length > 0
      ? frameDropsRef.current.reduce((a, b) => a + b, 0) / frameDropsRef.current.length
      : 0;

    let networkQuality: MobileAvatarMetrics["networkQuality"];
    if (!isOnline) networkQuality = "offline";
    else if (latencyMetrics.quality === "excellent") networkQuality = "excellent";
    else if (latencyMetrics.quality === "good") networkQuality = "good";
    else if (latencyMetrics.quality === "fair") networkQuality = "fair";
    else networkQuality = "poor";

    // Touch responsiveness based on frame rate and latency
    let touchResponsiveness: MobileAvatarMetrics["touchResponsiveness"] = "excellent";
    if (frameRate.averageFps < 30 || latencyMetrics.averageLatency > 200) {
      touchResponsiveness = "degraded";
    } else if (frameRate.averageFps < 45 || latencyMetrics.averageLatency > 100) {
      touchResponsiveness = "good";
    }

    return {
      currentQuality: calculatedQuality,
      fps: frameRate.fps,
      frameDropRate,
      memoryPressure,
      thermalState,
      batteryLevel: deviceCapabilities.battery.level,
      isCharging: deviceCapabilities.battery.charging,
      networkQuality,
      latencyMs: latencyMetrics.averageLatency,
      touchResponsiveness,
    };
  }, [
    calculatedQuality,
    frameRate.fps,
    frameRate.averageFps,
    memoryPressure,
    thermalState,
    deviceCapabilities.battery.level,
    deviceCapabilities.battery.charging,
    isOnline,
    latencyMetrics.quality,
    latencyMetrics.averageLatency,
  ]);

  // Control functions
  const controls = useMemo((): MobileAvatarControls => ({
    forceQuality: setForcedQuality,
    pauseAnimations: () => setIsPaused(true),
    resumeAnimations: () => setIsPaused(false),
    setLowPowerMode,
    preloadAssets: async () => {
      // Placeholder for asset preloading
      // In production, this would trigger prefetching of textures, audio, etc.
      if (!settings.prefetchAssets) return;
      console.log("[MobileAvatarOptimizer] Preloading assets...");
    },
    clearCache: () => {
      // Placeholder for cache clearing
      console.log("[MobileAvatarOptimizer] Cache cleared");
      frameDropsRef.current = [];
    },
    reportInteraction: (type) => {
      lastInteractionRef.current = Date.now();
      setInteractionCount((c) => c + 1);
    },
  }), [settings.prefetchAssets]);

  // Derived flags
  const shouldReduceAnimations = settings.targetFPS <= 24 ||
    prefersReducedMotion ||
    thermalState === "critical" ||
    !visibility.isVisible;

  const shouldUseCSSAnimations = settings.targetFPS <= 30 ||
    deviceCapabilities.tier === "low" ||
    isLowPowerMode;

  const shouldPrefetchAudio = settings.prefetchAssets &&
    isOnline &&
    !isSlowConnection &&
    !saveData;

  const shouldBatchUpdates = settings.batchAnimationUpdates ||
    isSlowConnection ||
    frameRate.isLowFps;

  return {
    isOptimized: enabled && (isMobile || isTablet),
    isMobile: isMobile || isTablet,
    isLowPowerMode,
    isPaused: isPaused || !visibility.isVisible,
    settings,
    metrics,
    controls,
    shouldReduceAnimations,
    shouldUseCSSAnimations,
    shouldPrefetchAudio,
    shouldBatchUpdates,
  };
}

/**
 * Simple hook for checking if mobile optimizations are active
 */
export function useIsMobileOptimized(): boolean {
  const { isOptimized } = useMobileAvatarOptimizer();
  return isOptimized;
}

/**
 * Hook for getting mobile-optimized animation frame interval
 */
export function useMobileAnimationInterval(): number {
  const { settings, isOptimized } = useMobileAvatarOptimizer();
  return isOptimized ? settings.animationUpdateMs : 16; // Default to 60fps
}

/**
 * Hook for mobile touch debounce settings
 */
export function useMobileTouchSettings(): {
  debounceMs: number;
  throttleMs: number;
  enableHaptic: boolean;
} {
  const { settings, isOptimized } = useMobileAvatarOptimizer();

  return {
    debounceMs: isOptimized ? settings.touchDebounceMs : 50,
    throttleMs: isOptimized ? settings.touchThrottleMs : 16,
    enableHaptic: settings.enableHapticFeedback,
  };
}

/**
 * Hook for avatar feature flags based on mobile optimization
 */
export function useMobileAvatarFeatures(): {
  lipSync: boolean;
  eyeTracking: boolean;
  breathing: boolean;
  idleAnimations: boolean;
  microExpressions: boolean;
  gestures: boolean;
} {
  const { settings } = useMobileAvatarOptimizer();

  return {
    lipSync: settings.enableLipSync,
    eyeTracking: settings.enableEyeTracking,
    breathing: settings.enableBreathing,
    idleAnimations: settings.enableIdleAnimations,
    microExpressions: settings.enableMicroExpressions,
    gestures: settings.enableGestures,
  };
}

// Export types
export type {
  MobileQualityTier,
  MobileAvatarSettings,
  MobileAvatarMetrics,
  MobileAvatarControls,
  MobileAvatarOptimization,
  UseMobileAvatarOptimizerOptions,
};
