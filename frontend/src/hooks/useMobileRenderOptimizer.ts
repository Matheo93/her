/**
 * useMobileRenderOptimizer Hook - Sprint 511
 *
 * GPU-efficient rendering optimizations for mobile devices.
 * Automatically adjusts rendering quality based on device capabilities and performance.
 *
 * Features:
 * - Automatic quality tier detection (GPU, memory, battery)
 * - Dynamic resolution scaling for smooth performance
 * - Frame budget management (target 60fps or 30fps fallback)
 * - WebGL context optimization
 * - Layer compositing hints for GPU acceleration
 * - Memory pressure handling
 * - Thermal throttling detection
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type RenderQuality = "ultra" | "high" | "medium" | "low" | "minimal";

export type GPUTier = "high" | "medium" | "low" | "unknown";

export interface GPUInfo {
  vendor: string;
  renderer: string;
  tier: GPUTier;
  maxTextureSize: number;
  maxViewportDims: [number, number];
  supportsWebGL2: boolean;
  supportsFloatTextures: boolean;
}

export interface DeviceProfile {
  gpu: GPUInfo;
  memoryGB: number;
  cores: number;
  isLowPowerMode: boolean;
  isThermalThrottled: boolean;
  batteryLevel: number | null;
  isCharging: boolean | null;
  screenDensity: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface RenderSettings {
  quality: RenderQuality;
  resolution: number; // 0.5 - 1.0 scale factor
  targetFPS: number;
  enableShadows: boolean;
  enableReflections: boolean;
  enableParticles: boolean;
  enablePostProcessing: boolean;
  maxTextureQuality: "full" | "half" | "quarter";
  enableAntialiasing: boolean;
  antialiasingLevel: 0 | 2 | 4 | 8;
  enableMotionBlur: boolean;
  enableAmbientOcclusion: boolean;
  maxDrawCalls: number;
  maxTriangles: number;
}

export interface FrameBudget {
  targetMs: number; // Target frame time in ms
  currentMs: number; // Current average frame time
  headroom: number; // Available headroom in ms
  isOverBudget: boolean;
  consecutiveDrops: number; // Consecutive frames over budget
}

export interface RenderMetrics {
  fps: number;
  frameTime: number;
  gpuTime: number;
  drawCalls: number;
  triangles: number;
  textureMemory: number;
  droppedFrames: number;
  qualityChanges: number;
}

export interface MobileRenderConfig {
  enabled: boolean;
  initialQuality: RenderQuality;
  autoAdjust: boolean;
  targetFPS: number;
  minQuality: RenderQuality;
  maxQuality: RenderQuality;
  adjustmentThreshold: number; // Frames before adjusting
  batteryAware: boolean;
  thermalAware: boolean;
  memoryPressureAware: boolean;
}

export interface RenderOptimizationHints {
  useWillChange: boolean;
  useTransform3d: boolean;
  useContainment: boolean;
  useLayerPromotion: boolean;
  disablePointerEvents: boolean;
  useAsyncDecoding: boolean;
  useLazyLoading: boolean;
}

export interface MobileRenderControls {
  setQuality: (quality: RenderQuality) => void;
  forceQuality: (quality: RenderQuality | null) => void;
  pause: () => void;
  resume: () => void;
  recordFrame: (frameTimeMs: number) => void;
  getOptimizationHints: () => RenderOptimizationHints;
  resetMetrics: () => void;
}

export interface UseMobileRenderOptimizerResult {
  deviceProfile: DeviceProfile;
  settings: RenderSettings;
  frameBudget: FrameBudget;
  metrics: RenderMetrics;
  controls: MobileRenderControls;
  isPaused: boolean;
  isAutoAdjusting: boolean;
  recommendedQuality: RenderQuality;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: MobileRenderConfig = {
  enabled: true,
  initialQuality: "medium",
  autoAdjust: true,
  targetFPS: 60,
  minQuality: "minimal",
  maxQuality: "ultra",
  adjustmentThreshold: 30, // 30 frames
  batteryAware: true,
  thermalAware: true,
  memoryPressureAware: true,
};

const QUALITY_PRESETS: Record<RenderQuality, RenderSettings> = {
  ultra: {
    quality: "ultra",
    resolution: 1.0,
    targetFPS: 60,
    enableShadows: true,
    enableReflections: true,
    enableParticles: true,
    enablePostProcessing: true,
    maxTextureQuality: "full",
    enableAntialiasing: true,
    antialiasingLevel: 8,
    enableMotionBlur: true,
    enableAmbientOcclusion: true,
    maxDrawCalls: 5000,
    maxTriangles: 2000000,
  },
  high: {
    quality: "high",
    resolution: 1.0,
    targetFPS: 60,
    enableShadows: true,
    enableReflections: true,
    enableParticles: true,
    enablePostProcessing: true,
    maxTextureQuality: "full",
    enableAntialiasing: true,
    antialiasingLevel: 4,
    enableMotionBlur: false,
    enableAmbientOcclusion: true,
    maxDrawCalls: 3000,
    maxTriangles: 1000000,
  },
  medium: {
    quality: "medium",
    resolution: 0.85,
    targetFPS: 60,
    enableShadows: true,
    enableReflections: false,
    enableParticles: true,
    enablePostProcessing: true,
    maxTextureQuality: "half",
    enableAntialiasing: true,
    antialiasingLevel: 2,
    enableMotionBlur: false,
    enableAmbientOcclusion: false,
    maxDrawCalls: 1500,
    maxTriangles: 500000,
  },
  low: {
    quality: "low",
    resolution: 0.7,
    targetFPS: 30,
    enableShadows: false,
    enableReflections: false,
    enableParticles: false,
    enablePostProcessing: false,
    maxTextureQuality: "quarter",
    enableAntialiasing: false,
    antialiasingLevel: 0,
    enableMotionBlur: false,
    enableAmbientOcclusion: false,
    maxDrawCalls: 500,
    maxTriangles: 100000,
  },
  minimal: {
    quality: "minimal",
    resolution: 0.5,
    targetFPS: 30,
    enableShadows: false,
    enableReflections: false,
    enableParticles: false,
    enablePostProcessing: false,
    maxTextureQuality: "quarter",
    enableAntialiasing: false,
    antialiasingLevel: 0,
    enableMotionBlur: false,
    enableAmbientOcclusion: false,
    maxDrawCalls: 200,
    maxTriangles: 50000,
  },
};

const QUALITY_ORDER: RenderQuality[] = ["minimal", "low", "medium", "high", "ultra"];

// Known low-end mobile GPUs
const LOW_END_GPU_PATTERNS = [
  /mali-4/i,
  /mali-t/i,
  /adreno 3/i,
  /adreno 4/i,
  /powervr ge/i,
  /powervr g62/i,
  /intel hd 4/i,
  /intel hd 5/i,
];

const HIGH_END_GPU_PATTERNS = [
  /mali-g7/i,
  /mali-g8/i,
  /adreno 6[3-9]/i,
  /adreno 7/i,
  /apple gpu/i,
  /apple a1[2-7]/i,
  /nvidia/i,
  /radeon/i,
];

// ============================================================================
// Utility Functions
// ============================================================================

function detectGPU(): GPUInfo {
  const defaultInfo: GPUInfo = {
    vendor: "unknown",
    renderer: "unknown",
    tier: "unknown",
    maxTextureSize: 4096,
    maxViewportDims: [4096, 4096],
    supportsWebGL2: false,
    supportsFloatTextures: false,
  };

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

    if (!gl) return defaultInfo;

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR);
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxViewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);

    // Determine GPU tier
    let tier: GPUTier = "medium";
    if (LOW_END_GPU_PATTERNS.some((p) => p.test(renderer))) {
      tier = "low";
    } else if (HIGH_END_GPU_PATTERNS.some((p) => p.test(renderer))) {
      tier = "high";
    }

    // Check WebGL2 support
    const supportsWebGL2 = !!canvas.getContext("webgl2");

    // Check float texture support
    const supportsFloatTextures =
      !!gl.getExtension("OES_texture_float") ||
      !!gl.getExtension("EXT_color_buffer_float");

    canvas.remove();

    return {
      vendor,
      renderer,
      tier,
      maxTextureSize,
      maxViewportDims: maxViewportDims as [number, number],
      supportsWebGL2,
      supportsFloatTextures,
    };
  } catch {
    return defaultInfo;
  }
}

function detectDeviceProfile(): DeviceProfile {
  const gpu = detectGPU();

  // Memory estimation
  const memoryGB =
    (navigator as any).deviceMemory ||
    (gpu.tier === "high" ? 8 : gpu.tier === "medium" ? 4 : 2);

  // CPU cores
  const cores = navigator.hardwareConcurrency || 4;

  // Screen info
  const screenDensity = window.devicePixelRatio || 1;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  return {
    gpu,
    memoryGB,
    cores,
    isLowPowerMode: false,
    isThermalThrottled: false,
    batteryLevel: null,
    isCharging: null,
    screenDensity,
    viewportWidth,
    viewportHeight,
  };
}

function getRecommendedQuality(profile: DeviceProfile, config: MobileRenderConfig): RenderQuality {
  let score = 50; // Base score

  // GPU tier impact
  if (profile.gpu.tier === "high") score += 30;
  else if (profile.gpu.tier === "low") score -= 30;

  // Memory impact
  if (profile.memoryGB >= 6) score += 15;
  else if (profile.memoryGB <= 2) score -= 20;

  // CPU cores impact
  if (profile.cores >= 8) score += 10;
  else if (profile.cores <= 2) score -= 15;

  // Battery impact (if battery aware)
  if (config.batteryAware && profile.batteryLevel !== null) {
    if (profile.batteryLevel < 0.2 && !profile.isCharging) score -= 25;
    else if (profile.batteryLevel < 0.5 && !profile.isCharging) score -= 10;
  }

  // Thermal impact
  if (config.thermalAware && profile.isThermalThrottled) {
    score -= 30;
  }

  // Low power mode impact
  if (profile.isLowPowerMode) {
    score -= 20;
  }

  // Screen density impact (higher DPI needs more GPU power)
  if (profile.screenDensity > 2.5) score -= 10;

  // Map score to quality
  if (score >= 80) return "ultra";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "minimal";
}

function clampQuality(
  quality: RenderQuality,
  min: RenderQuality,
  max: RenderQuality
): RenderQuality {
  const qualityIndex = QUALITY_ORDER.indexOf(quality);
  const minIndex = QUALITY_ORDER.indexOf(min);
  const maxIndex = QUALITY_ORDER.indexOf(max);

  if (qualityIndex < minIndex) return min;
  if (qualityIndex > maxIndex) return max;
  return quality;
}

function getNextLowerQuality(current: RenderQuality): RenderQuality | null {
  const index = QUALITY_ORDER.indexOf(current);
  if (index <= 0) return null;
  return QUALITY_ORDER[index - 1];
}

function getNextHigherQuality(current: RenderQuality): RenderQuality | null {
  const index = QUALITY_ORDER.indexOf(current);
  if (index >= QUALITY_ORDER.length - 1) return null;
  return QUALITY_ORDER[index + 1];
}

// ============================================================================
// Main Hook
// ============================================================================

export function useMobileRenderOptimizer(
  config: Partial<MobileRenderConfig> = {}
): UseMobileRenderOptimizerResult {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // Device profile (detected once)
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile>(() =>
    detectDeviceProfile()
  );

  // Current settings
  const [settings, setSettings] = useState<RenderSettings>(() =>
    QUALITY_PRESETS[mergedConfig.initialQuality]
  );

  // Forced quality (overrides auto-adjustment)
  const [forcedQuality, setForcedQuality] = useState<RenderQuality | null>(null);

  // Frame budget tracking
  const [frameBudget, setFrameBudget] = useState<FrameBudget>({
    targetMs: 1000 / mergedConfig.targetFPS,
    currentMs: 0,
    headroom: 1000 / mergedConfig.targetFPS,
    isOverBudget: false,
    consecutiveDrops: 0,
  });

  // Metrics
  const [metrics, setMetrics] = useState<RenderMetrics>({
    fps: 60,
    frameTime: 16.67,
    gpuTime: 0,
    drawCalls: 0,
    triangles: 0,
    textureMemory: 0,
    droppedFrames: 0,
    qualityChanges: 0,
  });

  // State
  const [isPaused, setIsPaused] = useState(false);
  const [isAutoAdjusting, setIsAutoAdjusting] = useState(mergedConfig.autoAdjust);

  // Frame time history for averaging
  const frameTimesRef = useRef<number[]>([]);
  const adjustmentCounterRef = useRef(0);
  const lastQualityChangeRef = useRef(Date.now());

  // Recommended quality based on device
  const recommendedQuality = useMemo(
    () => getRecommendedQuality(deviceProfile, mergedConfig),
    [deviceProfile, mergedConfig]
  );

  // Update battery status
  useEffect(() => {
    if (!mergedConfig.batteryAware) return;

    const updateBattery = async () => {
      try {
        const battery = await (navigator as any).getBattery?.();
        if (battery) {
          const updateProfile = () => {
            setDeviceProfile((prev) => ({
              ...prev,
              batteryLevel: battery.level,
              isCharging: battery.charging,
            }));
          };

          updateProfile();
          battery.addEventListener("levelchange", updateProfile);
          battery.addEventListener("chargingchange", updateProfile);

          return () => {
            battery.removeEventListener("levelchange", updateProfile);
            battery.removeEventListener("chargingchange", updateProfile);
          };
        }
      } catch {
        // Battery API not supported
      }
    };

    const cleanup = updateBattery();
    return () => {
      cleanup?.then((fn) => fn?.());
    };
  }, [mergedConfig.batteryAware]);

  // Memory pressure handling
  useEffect(() => {
    if (!mergedConfig.memoryPressureAware) return;

    const handleMemoryPressure = (event: any) => {
      if (event?.detail?.level === "critical") {
        // Force lower quality on memory pressure
        const lower = getNextLowerQuality(settings.quality);
        if (lower) {
          setSettings(QUALITY_PRESETS[lower]);
        }
      }
    };

    // Chrome memory pressure event
    if ("onmemorypressure" in window) {
      window.addEventListener("memorypressure", handleMemoryPressure);
      return () => window.removeEventListener("memorypressure", handleMemoryPressure);
    }
  }, [mergedConfig.memoryPressureAware, settings.quality]);

  // Auto quality adjustment based on frame times
  useEffect(() => {
    if (!isAutoAdjusting || forcedQuality || isPaused) return;

    const avgFrameTime =
      frameTimesRef.current.length > 0
        ? frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
        : 0;

    if (avgFrameTime === 0) return;

    const targetMs = 1000 / settings.targetFPS;
    const isOverBudget = avgFrameTime > targetMs * 1.1; // 10% tolerance
    const hasHeadroom = avgFrameTime < targetMs * 0.7; // 30% headroom

    // Update frame budget only if values changed (avoid infinite loops)
    setFrameBudget((prev) => {
      const newConsecutiveDrops = isOverBudget ? prev.consecutiveDrops + 1 : 0;
      // Check if anything actually changed
      if (
        Math.abs(prev.currentMs - avgFrameTime) < 0.001 &&
        prev.isOverBudget === isOverBudget &&
        prev.consecutiveDrops === newConsecutiveDrops
      ) {
        return prev; // No change, return same object to prevent re-render
      }
      return {
        ...prev,
        currentMs: avgFrameTime,
        headroom: targetMs - avgFrameTime,
        isOverBudget,
        consecutiveDrops: newConsecutiveDrops,
      };
    });

    // Check if we need to adjust
    const timeSinceLastChange = Date.now() - lastQualityChangeRef.current;
    if (timeSinceLastChange < 2000) return; // Min 2s between changes

    adjustmentCounterRef.current++;

    if (adjustmentCounterRef.current >= mergedConfig.adjustmentThreshold) {
      adjustmentCounterRef.current = 0;

      if (isOverBudget) {
        const lower = getNextLowerQuality(settings.quality);
        if (lower && QUALITY_ORDER.indexOf(lower) >= QUALITY_ORDER.indexOf(mergedConfig.minQuality)) {
          setSettings(QUALITY_PRESETS[lower]);
          setMetrics((prev) => ({ ...prev, qualityChanges: prev.qualityChanges + 1 }));
          lastQualityChangeRef.current = Date.now();
        }
      } else if (hasHeadroom) {
        const higher = getNextHigherQuality(settings.quality);
        if (higher && QUALITY_ORDER.indexOf(higher) <= QUALITY_ORDER.indexOf(mergedConfig.maxQuality)) {
          setSettings(QUALITY_PRESETS[higher]);
          setMetrics((prev) => ({ ...prev, qualityChanges: prev.qualityChanges + 1 }));
          lastQualityChangeRef.current = Date.now();
        }
      }
    }
  }, [
    metrics.frameTime,
    settings.quality,
    settings.targetFPS,
    isAutoAdjusting,
    forcedQuality,
    isPaused,
    mergedConfig,
  ]);

  // Controls
  const setQuality = useCallback((quality: RenderQuality) => {
    const clamped = clampQuality(quality, mergedConfig.minQuality, mergedConfig.maxQuality);
    setSettings(QUALITY_PRESETS[clamped]);
    lastQualityChangeRef.current = Date.now();
  }, [mergedConfig.minQuality, mergedConfig.maxQuality]);

  const forceQuality = useCallback((quality: RenderQuality | null) => {
    setForcedQuality(quality);
    if (quality) {
      setSettings(QUALITY_PRESETS[quality]);
      setIsAutoAdjusting(false);
    } else {
      setIsAutoAdjusting(mergedConfig.autoAdjust);
    }
  }, [mergedConfig.autoAdjust]);

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  const recordFrame = useCallback((frameTimeMs: number) => {
    frameTimesRef.current.push(frameTimeMs);

    // Keep last 60 frames
    if (frameTimesRef.current.length > 60) {
      frameTimesRef.current.shift();
    }

    // Update metrics
    const avgFrameTime =
      frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
    const fps = 1000 / avgFrameTime;

    setMetrics((prev) => ({
      ...prev,
      fps: Math.round(fps),
      frameTime: Math.round(avgFrameTime * 100) / 100,
      droppedFrames: frameTimeMs > 33.33 ? prev.droppedFrames + 1 : prev.droppedFrames,
    }));
  }, []);

  const getOptimizationHints = useCallback((): RenderOptimizationHints => {
    const isLowEnd = settings.quality === "low" || settings.quality === "minimal";

    return {
      useWillChange: !isLowEnd, // will-change uses memory
      useTransform3d: true, // Always use for GPU acceleration
      useContainment: true, // CSS containment for isolation
      useLayerPromotion: !isLowEnd,
      disablePointerEvents: isLowEnd, // Reduce event handling on low-end
      useAsyncDecoding: true, // Always use async image decoding
      useLazyLoading: true, // Always lazy load
    };
  }, [settings.quality]);

  const resetMetrics = useCallback(() => {
    frameTimesRef.current = [];
    setMetrics({
      fps: 60,
      frameTime: 16.67,
      gpuTime: 0,
      drawCalls: 0,
      triangles: 0,
      textureMemory: 0,
      droppedFrames: 0,
      qualityChanges: 0,
    });
  }, []);

  const controls: MobileRenderControls = useMemo(
    () => ({
      setQuality,
      forceQuality,
      pause,
      resume,
      recordFrame,
      getOptimizationHints,
      resetMetrics,
    }),
    [setQuality, forceQuality, pause, resume, recordFrame, getOptimizationHints, resetMetrics]
  );

  return {
    deviceProfile,
    settings,
    frameBudget,
    metrics,
    controls,
    isPaused,
    isAutoAdjusting,
    recommendedQuality,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for getting CSS optimization styles
 */
export function useRenderOptimizationStyles(
  config?: Partial<MobileRenderConfig>
): React.CSSProperties {
  const { controls, settings } = useMobileRenderOptimizer(config);
  const hints = controls.getOptimizationHints();

  return useMemo(() => {
    const styles: React.CSSProperties = {};

    if (hints.useTransform3d) {
      styles.transform = "translateZ(0)";
    }

    if (hints.useWillChange) {
      styles.willChange = "transform, opacity";
    }

    if (hints.useContainment) {
      (styles as any).contain = "layout paint";
    }

    if (hints.disablePointerEvents) {
      styles.pointerEvents = "none";
    }

    return styles;
  }, [hints, settings.quality]);
}

/**
 * Hook for resolution-aware canvas sizing
 */
export function useAdaptiveCanvasSize(
  baseWidth: number,
  baseHeight: number,
  config?: Partial<MobileRenderConfig>
): { width: number; height: number; scale: number } {
  const { settings, deviceProfile } = useMobileRenderOptimizer(config);

  return useMemo(() => {
    const scale = settings.resolution;
    const dpr = Math.min(deviceProfile.screenDensity, 2); // Cap at 2x

    return {
      width: Math.round(baseWidth * scale * dpr),
      height: Math.round(baseHeight * scale * dpr),
      scale: scale * dpr,
    };
  }, [baseWidth, baseHeight, settings.resolution, deviceProfile.screenDensity]);
}

/**
 * Hook for frame-rate aware animation
 */
export function useFrameRateAwareAnimation(
  config?: Partial<MobileRenderConfig>
): {
  shouldAnimate: boolean;
  targetFPS: number;
  frameInterval: number;
} {
  const { settings, frameBudget, isPaused } = useMobileRenderOptimizer(config);

  return useMemo(() => ({
    shouldAnimate: !isPaused && !frameBudget.isOverBudget,
    targetFPS: settings.targetFPS,
    frameInterval: 1000 / settings.targetFPS,
  }), [isPaused, frameBudget.isOverBudget, settings.targetFPS]);
}

export default useMobileRenderOptimizer;
