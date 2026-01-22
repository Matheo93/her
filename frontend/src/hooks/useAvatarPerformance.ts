"use client";

/**
 * useAvatarPerformance - Unified Avatar Performance Hook
 *
 * Combines device capabilities, frame rate monitoring, visibility,
 * and wake lock for optimal avatar rendering performance.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useDeviceCapabilities, type RenderingSettings } from "./useDeviceCapabilities";
import { useFrameRate, useAdaptiveQuality } from "./useFrameRate";
import { useVisibility } from "./useVisibility";
import { useCallWakeLock } from "./useWakeLock";
import { useReducedMotion } from "./useReducedMotion";
import { useNetworkStatus } from "./useNetworkStatus";

// Re-export for convenience
export type { RenderingSettings } from "./useDeviceCapabilities";

interface AvatarPerformanceState {
  // Current rendering settings (adapts in real-time)
  settings: AvatarRenderSettings;

  // Performance metrics
  metrics: PerformanceMetrics;

  // Control functions
  controls: PerformanceControls;

  // Status flags
  status: PerformanceStatus;
}

interface AvatarRenderSettings extends RenderingSettings {
  // Avatar-specific settings
  lipSyncEnabled: boolean;
  lipSyncQuality: "high" | "medium" | "low";
  eyeTrackingEnabled: boolean;
  microExpressionsEnabled: boolean;
  breathingAnimationEnabled: boolean;
  blinkAnimationEnabled: boolean;
  idleAnimationsEnabled: boolean;

  // Rendering mode
  renderMode: "full" | "optimized" | "minimal" | "static";

  // Update frequency (ms between animation frames)
  updateInterval: number;

  // Whether to use CSS animations vs JS
  useCSSAnimations: boolean;
}

interface PerformanceMetrics {
  // Current FPS
  fps: number;

  // Average FPS over time
  averageFps: number;

  // Frame time in ms
  frameTime: number;

  // Dropped frames count
  droppedFrames: number;

  // Quality level (0-1)
  qualityLevel: number;

  // Time page has been visible (ms)
  visibleTime: number;

  // Time page has been hidden (ms)
  hiddenTime: number;

  // Performance tier
  tier: "high" | "medium" | "low";
}

interface PerformanceControls {
  // Force a specific quality level (null to auto)
  forceQuality: (level: "high" | "medium" | "low" | null) => void;

  // Pause all animations
  pauseAnimations: () => void;

  // Resume animations
  resumeAnimations: () => void;

  // Reset performance metrics
  resetMetrics: () => void;

  // Toggle specific features
  toggleFeature: (feature: keyof AvatarFeatureFlags, enabled: boolean) => void;
}

interface PerformanceStatus {
  // Whether animations are currently running
  isAnimating: boolean;

  // Whether page is visible
  isVisible: boolean;

  // Whether wake lock is active
  isWakeLockActive: boolean;

  // Whether performance is degraded
  isPerformanceDegraded: boolean;

  // Whether running in low power mode
  isLowPowerMode: boolean;

  // Whether user prefers reduced motion
  prefersReducedMotion: boolean;

  // Connection quality
  connectionQuality: "good" | "slow" | "offline";
}

interface AvatarFeatureFlags {
  lipSync: boolean;
  eyeTracking: boolean;
  microExpressions: boolean;
  breathing: boolean;
  blinking: boolean;
  idleAnimations: boolean;
}

interface UseAvatarPerformanceOptions {
  // Whether avatar is currently active (in a call)
  isActive?: boolean;

  // Target FPS
  targetFps?: number;

  // Callback when quality changes
  onQualityChange?: (quality: "high" | "medium" | "low") => void;

  // Callback when performance degrades
  onPerformanceDegrade?: () => void;

  // Enable automatic quality adjustment
  autoAdjustQuality?: boolean;
}

export function useAvatarPerformance(
  options: UseAvatarPerformanceOptions = {}
): AvatarPerformanceState {
  const {
    isActive = false,
    targetFps = 60,
    onQualityChange,
    onPerformanceDegrade,
    autoAdjustQuality = true,
  } = options;

  // Core hooks
  const deviceCapabilities = useDeviceCapabilities();
  const prefersReducedMotion = useReducedMotion();
  const { isOnline, isSlowConnection } = useNetworkStatus();
  const visibility = useVisibility();
  const wakeLock = useCallWakeLock(isActive);

  // Feature flags state
  const [featureFlags, setFeatureFlags] = useState<AvatarFeatureFlags>({
    lipSync: true,
    eyeTracking: true,
    microExpressions: true,
    breathing: true,
    blinking: true,
    idleAnimations: true,
  });

  // Animation paused state
  const [isPaused, setIsPaused] = useState(false);

  // Forced quality override
  const [forcedQuality, setForcedQuality] = useState<"high" | "medium" | "low" | null>(null);

  // Frame rate monitoring (only when active and visible)
  const frameRate = useFrameRate({
    targetFps,
    autoStart: isActive && visibility.isVisible && !isPaused,
    onLowFps: (fps) => {
      onPerformanceDegrade?.();
    },
  });

  // Adaptive quality (when auto-adjust is enabled)
  const adaptiveQuality = useAdaptiveQuality({
    initialQuality: 1,
    minQuality: 0.3,
    maxQuality: 1,
    targetFps: targetFps - 5, // Slightly below target for headroom
  });

  // Previous tier for change detection
  const prevTierRef = useRef(deviceCapabilities.tier);

  // Calculate effective quality level
  const effectiveQuality = useMemo(() => {
    if (forcedQuality) return forcedQuality;

    // Use device tier as base
    let quality = deviceCapabilities.tier;

    // Downgrade if performance is bad
    if (autoAdjustQuality && adaptiveQuality.quality < 0.5) {
      if (quality === "high") quality = "medium";
      else if (quality === "medium") quality = "low";
    }

    // Downgrade on slow connection
    if (isSlowConnection && quality !== "low") {
      quality = quality === "high" ? "medium" : "low";
    }

    // Force minimal if reduced motion preferred
    if (prefersReducedMotion) {
      quality = "low";
    }

    return quality;
  }, [
    forcedQuality,
    deviceCapabilities.tier,
    autoAdjustQuality,
    adaptiveQuality.quality,
    isSlowConnection,
    prefersReducedMotion,
  ]);

  // Notify on quality change
  useEffect(() => {
    if (prevTierRef.current !== effectiveQuality) {
      onQualityChange?.(effectiveQuality);
      prevTierRef.current = effectiveQuality;
    }
  }, [effectiveQuality, onQualityChange]);

  // Generate avatar-specific render settings
  const settings = useMemo((): AvatarRenderSettings => {
    const baseSettings = deviceCapabilities.settings;

    // Determine render mode
    let renderMode: AvatarRenderSettings["renderMode"] = "full";
    if (!visibility.isVisible || isPaused) {
      renderMode = "static";
    } else if (effectiveQuality === "low" || prefersReducedMotion) {
      renderMode = "minimal";
    } else if (effectiveQuality === "medium") {
      renderMode = "optimized";
    }

    // Calculate update interval based on target FPS and quality
    const baseInterval = 1000 / baseSettings.targetFPS;
    let updateInterval = baseInterval;
    if (effectiveQuality === "medium") updateInterval = baseInterval * 1.5;
    if (effectiveQuality === "low") updateInterval = baseInterval * 2;

    // Determine lip sync quality
    let lipSyncQuality: AvatarRenderSettings["lipSyncQuality"] = "high";
    if (effectiveQuality === "medium") lipSyncQuality = "medium";
    if (effectiveQuality === "low") lipSyncQuality = "low";

    return {
      ...baseSettings,

      // Avatar-specific settings based on quality and features
      lipSyncEnabled: featureFlags.lipSync && renderMode !== "static",
      lipSyncQuality,
      eyeTrackingEnabled:
        featureFlags.eyeTracking &&
        effectiveQuality !== "low" &&
        renderMode !== "static",
      microExpressionsEnabled:
        featureFlags.microExpressions &&
        effectiveQuality === "high" &&
        renderMode === "full",
      breathingAnimationEnabled:
        featureFlags.breathing && renderMode !== "static" && !prefersReducedMotion,
      blinkAnimationEnabled:
        featureFlags.blinking && renderMode !== "static",
      idleAnimationsEnabled:
        featureFlags.idleAnimations &&
        effectiveQuality !== "low" &&
        renderMode !== "static" &&
        !prefersReducedMotion,

      renderMode,
      updateInterval,
      useCSSAnimations: effectiveQuality === "low" || prefersReducedMotion,
    };
  }, [
    deviceCapabilities.settings,
    visibility.isVisible,
    isPaused,
    effectiveQuality,
    prefersReducedMotion,
    featureFlags,
  ]);

  // Performance metrics
  const metrics = useMemo((): PerformanceMetrics => ({
    fps: frameRate.fps,
    averageFps: frameRate.averageFps,
    frameTime: frameRate.frameTime,
    droppedFrames: frameRate.droppedFrames,
    qualityLevel: adaptiveQuality.quality,
    visibleTime: visibility.visibleTime,
    hiddenTime: visibility.hiddenTime,
    tier: effectiveQuality,
  }), [
    frameRate.fps,
    frameRate.averageFps,
    frameRate.frameTime,
    frameRate.droppedFrames,
    adaptiveQuality.quality,
    visibility.visibleTime,
    visibility.hiddenTime,
    effectiveQuality,
  ]);

  // Status flags
  const status = useMemo((): PerformanceStatus => ({
    isAnimating: isActive && visibility.isVisible && !isPaused,
    isVisible: visibility.isVisible,
    isWakeLockActive: wakeLock.isActive,
    isPerformanceDegraded: frameRate.isPerformanceDegraded,
    isLowPowerMode: deviceCapabilities.battery.isLowBattery,
    prefersReducedMotion,
    connectionQuality: !isOnline ? "offline" : isSlowConnection ? "slow" : "good",
  }), [
    isActive,
    visibility.isVisible,
    isPaused,
    wakeLock.isActive,
    frameRate.isPerformanceDegraded,
    deviceCapabilities.battery.isLowBattery,
    prefersReducedMotion,
    isOnline,
    isSlowConnection,
  ]);

  // Control functions
  const controls = useMemo((): PerformanceControls => ({
    forceQuality: setForcedQuality,
    pauseAnimations: () => setIsPaused(true),
    resumeAnimations: () => setIsPaused(false),
    resetMetrics: () => {
      frameRate.reset();
    },
    toggleFeature: (feature, enabled) => {
      setFeatureFlags((prev) => ({
        ...prev,
        [feature]: enabled,
      }));
    },
  }), [frameRate]);

  return {
    settings,
    metrics,
    controls,
    status,
  };
}

/**
 * Simple hook to get avatar render settings
 */
export function useAvatarRenderSettings(isActive: boolean = false): AvatarRenderSettings {
  const { settings } = useAvatarPerformance({ isActive });
  return settings;
}

/**
 * Hook for avatar animation loop with automatic pausing
 */
export function useAvatarAnimationLoop(
  callback: (deltaTime: number) => void,
  options: {
    isActive?: boolean;
    targetFps?: number;
  } = {}
): {
  isPaused: boolean;
  fps: number;
} {
  const { isActive = true, targetFps = 60 } = options;

  const performance = useAvatarPerformance({ isActive, targetFps });
  const callbackRef = useRef(callback);
  const frameRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const shouldRun = performance.status.isAnimating;

  useEffect(() => {
    if (!shouldRun) {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      previousTimeRef.current = 0;
      return;
    }

    // Throttle based on settings
    const minFrameTime = performance.settings.updateInterval;
    let lastFrameTime = 0;

    const animate = (time: number) => {
      const deltaTime = time - (previousTimeRef.current || time);

      // Only call if enough time has passed
      if (time - lastFrameTime >= minFrameTime) {
        callbackRef.current(deltaTime);
        lastFrameTime = time;
      }

      previousTimeRef.current = time;
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [shouldRun, performance.settings.updateInterval]);

  return {
    isPaused: !shouldRun,
    fps: performance.metrics.fps,
  };
}

/**
 * Hook to get whether avatar should render at all
 */
export function useShouldRenderAvatar(isActive: boolean = false): {
  shouldRender: boolean;
  renderMode: AvatarRenderSettings["renderMode"];
} {
  const { settings, status } = useAvatarPerformance({ isActive });

  return {
    shouldRender: status.isVisible && settings.renderMode !== "static",
    renderMode: settings.renderMode,
  };
}
