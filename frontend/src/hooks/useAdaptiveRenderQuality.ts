/**
 * useAdaptiveRenderQuality - Dynamic Render Quality Adjustment Hook
 *
 * Sprint 524: Adjusts render quality in real-time based on device performance:
 * - FPS-based quality scaling
 * - Battery-aware adjustments
 * - Thermal throttling response
 * - Memory pressure handling
 * - Network condition adaptation
 *
 * @example
 * ```tsx
 * const { state, controls, quality } = useAdaptiveRenderQuality({
 *   targetFps: 60,
 *   minFps: 30,
 * });
 *
 * // Apply quality settings to renderer
 * renderer.setResolutionScale(quality.resolutionScale);
 * renderer.setShadowQuality(quality.shadowQuality);
 * renderer.setTextureQuality(quality.textureQuality);
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Quality tier
 */
export type QualityTier = "ultra" | "high" | "medium" | "low" | "minimal";

/**
 * Quality factor (0-1 scale)
 */
export type QualityFactor = number;

/**
 * Adjustment reason
 */
export type AdjustmentReason =
  | "fps_low"
  | "fps_high"
  | "battery_low"
  | "thermal_hot"
  | "memory_pressure"
  | "network_slow"
  | "user_request"
  | "initial";

/**
 * Quality settings
 */
export interface QualitySettings {
  tier: QualityTier;
  resolutionScale: QualityFactor;
  textureQuality: QualityFactor;
  shadowQuality: QualityFactor;
  effectsQuality: QualityFactor;
  antialiasing: QualityFactor;
  drawDistance: QualityFactor;
  particleCount: QualityFactor;
  animationDetail: QualityFactor;
  postProcessing: QualityFactor;
}

/**
 * Performance sample
 */
export interface PerformanceSample {
  fps: number;
  frameTimeMs: number;
  timestamp: number;
  gpuTime?: number;
  cpuTime?: number;
}

/**
 * Device conditions
 */
export interface DeviceConditions {
  batteryLevel: number;
  isCharging: boolean;
  thermalState: "nominal" | "fair" | "serious" | "critical";
  memoryPressure: "none" | "low" | "medium" | "high";
  networkType: "wifi" | "4g" | "3g" | "2g" | "offline";
}

/**
 * Quality adjustment
 */
export interface QualityAdjustment {
  from: QualityTier;
  to: QualityTier;
  reason: AdjustmentReason;
  timestamp: number;
  fpsAtAdjustment: number;
}

/**
 * Quality metrics
 */
export interface QualityMetrics {
  adjustmentsUp: number;
  adjustmentsDown: number;
  totalAdjustments: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  timeAtTier: Record<QualityTier, number>;
  currentTierDuration: number;
}

/**
 * Quality state
 */
export interface QualityState {
  currentTier: QualityTier;
  previousTier: QualityTier | null;
  isStable: boolean;
  lastAdjustmentReason: AdjustmentReason | null;
  conditions: DeviceConditions;
  performanceScore: number;
}

/**
 * Quality config
 */
export interface QualityConfig {
  /** Target FPS */
  targetFps: number;
  /** Minimum acceptable FPS */
  minFps: number;
  /** FPS samples before adjustment */
  sampleWindow: number;
  /** Cooldown between adjustments (ms) */
  adjustmentCooldownMs: number;
  /** FPS variance threshold for stability */
  stabilityThreshold: number;
  /** Enable battery-aware adjustments */
  enableBatteryAware: boolean;
  /** Battery threshold for quality reduction */
  lowBatteryThreshold: number;
  /** Enable thermal throttling response */
  enableThermalResponse: boolean;
  /** Enable memory pressure response */
  enableMemoryResponse: boolean;
  /** Initial quality tier */
  initialTier: QualityTier;
  /** Quality presets */
  presets: Record<QualityTier, QualitySettings>;
}

/**
 * Quality controls
 */
export interface QualityControls {
  /** Request specific quality tier */
  setQualityTier: (tier: QualityTier) => void;
  /** Report frame time for adjustment */
  reportFrameTime: (timeMs: number) => void;
  /** Force quality evaluation */
  evaluate: () => void;
  /** Lock quality (disable auto-adjustment) */
  lock: () => void;
  /** Unlock quality (enable auto-adjustment) */
  unlock: () => void;
  /** Get current quality settings */
  getSettings: () => QualitySettings;
  /** Reset to initial quality */
  reset: () => void;
  /** Override specific quality setting */
  overrideSetting: <K extends keyof QualitySettings>(
    key: K,
    value: QualitySettings[K]
  ) => void;
}

/**
 * Hook result
 */
export interface UseAdaptiveRenderQualityResult {
  state: QualityState;
  metrics: QualityMetrics;
  quality: QualitySettings;
  controls: QualityControls;
}

// ============================================================================
// Constants
// ============================================================================

const QUALITY_TIERS: QualityTier[] = ["ultra", "high", "medium", "low", "minimal"];

const DEFAULT_PRESETS: Record<QualityTier, QualitySettings> = {
  ultra: {
    tier: "ultra",
    resolutionScale: 1.0,
    textureQuality: 1.0,
    shadowQuality: 1.0,
    effectsQuality: 1.0,
    antialiasing: 1.0,
    drawDistance: 1.0,
    particleCount: 1.0,
    animationDetail: 1.0,
    postProcessing: 1.0,
  },
  high: {
    tier: "high",
    resolutionScale: 1.0,
    textureQuality: 0.85,
    shadowQuality: 0.75,
    effectsQuality: 0.85,
    antialiasing: 0.75,
    drawDistance: 0.9,
    particleCount: 0.8,
    animationDetail: 1.0,
    postProcessing: 0.85,
  },
  medium: {
    tier: "medium",
    resolutionScale: 0.85,
    textureQuality: 0.65,
    shadowQuality: 0.5,
    effectsQuality: 0.6,
    antialiasing: 0.5,
    drawDistance: 0.7,
    particleCount: 0.5,
    animationDetail: 0.85,
    postProcessing: 0.5,
  },
  low: {
    tier: "low",
    resolutionScale: 0.7,
    textureQuality: 0.4,
    shadowQuality: 0.25,
    effectsQuality: 0.3,
    antialiasing: 0.25,
    drawDistance: 0.5,
    particleCount: 0.25,
    animationDetail: 0.7,
    postProcessing: 0.25,
  },
  minimal: {
    tier: "minimal",
    resolutionScale: 0.5,
    textureQuality: 0.2,
    shadowQuality: 0,
    effectsQuality: 0.1,
    antialiasing: 0,
    drawDistance: 0.3,
    particleCount: 0.1,
    animationDetail: 0.5,
    postProcessing: 0,
  },
};

const DEFAULT_CONFIG: QualityConfig = {
  targetFps: 60,
  minFps: 30,
  sampleWindow: 30,
  adjustmentCooldownMs: 2000,
  stabilityThreshold: 5,
  enableBatteryAware: true,
  lowBatteryThreshold: 20,
  enableThermalResponse: true,
  enableMemoryResponse: true,
  initialTier: "high",
  presets: DEFAULT_PRESETS,
};

// ============================================================================
// Utility Functions
// ============================================================================

function getTierIndex(tier: QualityTier): number {
  return QUALITY_TIERS.indexOf(tier);
}

function getTierByIndex(index: number): QualityTier {
  return QUALITY_TIERS[Math.max(0, Math.min(QUALITY_TIERS.length - 1, index))];
}

function lowerTier(current: QualityTier): QualityTier {
  const index = getTierIndex(current);
  return getTierByIndex(index + 1);
}

function higherTier(current: QualityTier): QualityTier {
  const index = getTierIndex(current);
  return getTierByIndex(index - 1);
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Adaptive render quality hook
 */
export function useAdaptiveRenderQuality(
  config: Partial<QualityConfig> = {},
  callbacks?: {
    onQualityChanged?: (adjustment: QualityAdjustment) => void;
    onConditionsChanged?: (conditions: DeviceConditions) => void;
    onPerformanceWarning?: (fps: number, targetFps: number) => void;
  }
): UseAdaptiveRenderQualityResult {
  const fullConfig = useMemo(
    () => ({
      ...DEFAULT_CONFIG,
      ...config,
      presets: { ...DEFAULT_PRESETS, ...config.presets },
    }),
    [config]
  );

  // State
  const [currentTier, setCurrentTier] = useState<QualityTier>(fullConfig.initialTier);
  const [previousTier, setPreviousTier] = useState<QualityTier | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lastAdjustmentReason, setLastAdjustmentReason] = useState<AdjustmentReason | null>(
    "initial"
  );
  const [conditions, setConditions] = useState<DeviceConditions>({
    batteryLevel: 100,
    isCharging: true,
    thermalState: "nominal",
    memoryPressure: "none",
    networkType: "wifi",
  });
  const [settingOverrides, setSettingOverrides] = useState<Partial<QualitySettings>>({});

  // Metrics
  const [metrics, setMetrics] = useState<QualityMetrics>({
    adjustmentsUp: 0,
    adjustmentsDown: 0,
    totalAdjustments: 0,
    avgFps: fullConfig.targetFps,
    minFps: fullConfig.targetFps,
    maxFps: fullConfig.targetFps,
    timeAtTier: {
      ultra: 0,
      high: 0,
      medium: 0,
      low: 0,
      minimal: 0,
    },
    currentTierDuration: 0,
  });

  // Refs
  const samplesRef = useRef<PerformanceSample[]>([]);
  const lastAdjustmentTimeRef = useRef<number>(0);
  const tierStartTimeRef = useRef<number>(Date.now());
  const isStableRef = useRef<boolean>(true);

  /**
   * Update device conditions
   */
  useEffect(() => {
    const updateConditions = async () => {
      const newConditions: DeviceConditions = { ...conditions };

      // Battery API
      if ("getBattery" in navigator) {
        try {
          const battery = await (navigator as Navigator & { getBattery: () => Promise<BatteryManager> }).getBattery();
          newConditions.batteryLevel = battery.level * 100;
          newConditions.isCharging = battery.charging;
        } catch {
          // Battery API not available
        }
      }

      // Network API
      const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
      if (connection) {
        const effectiveType = connection.effectiveType;
        if (effectiveType === "4g") newConditions.networkType = "4g";
        else if (effectiveType === "3g") newConditions.networkType = "3g";
        else if (effectiveType === "2g") newConditions.networkType = "2g";
        else if (effectiveType === "slow-2g") newConditions.networkType = "2g";
        else newConditions.networkType = "wifi";
      }

      // Memory pressure (if available)
      if ("memory" in performance) {
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        if (memory) {
          const usage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
          if (usage > 0.9) newConditions.memoryPressure = "high";
          else if (usage > 0.7) newConditions.memoryPressure = "medium";
          else if (usage > 0.5) newConditions.memoryPressure = "low";
          else newConditions.memoryPressure = "none";
        }
      }

      setConditions(newConditions);
      callbacks?.onConditionsChanged?.(newConditions);
    };

    updateConditions();
    const interval = setInterval(updateConditions, 5000);
    return () => clearInterval(interval);
  }, [callbacks]);

  /**
   * Adjust quality based on conditions
   */
  const adjustQuality = useCallback(
    (reason: AdjustmentReason, direction: "up" | "down"): void => {
      if (isLocked) return;

      const now = Date.now();
      if (now - lastAdjustmentTimeRef.current < fullConfig.adjustmentCooldownMs) {
        return;
      }

      const newTier = direction === "up" ? higherTier(currentTier) : lowerTier(currentTier);
      if (newTier === currentTier) return;

      // Get FPS at time of adjustment
      const samples = samplesRef.current;
      const currentFps = samples.length > 0
        ? samples.reduce((sum, s) => sum + s.fps, 0) / samples.length
        : fullConfig.targetFps;

      const adjustment: QualityAdjustment = {
        from: currentTier,
        to: newTier,
        reason,
        timestamp: now,
        fpsAtAdjustment: currentFps,
      };

      // Update tier time tracking
      const tierDuration = now - tierStartTimeRef.current;
      setMetrics((prev) => ({
        ...prev,
        timeAtTier: {
          ...prev.timeAtTier,
          [currentTier]: prev.timeAtTier[currentTier] + tierDuration,
        },
        adjustmentsUp: direction === "up" ? prev.adjustmentsUp + 1 : prev.adjustmentsUp,
        adjustmentsDown: direction === "down" ? prev.adjustmentsDown + 1 : prev.adjustmentsDown,
        totalAdjustments: prev.totalAdjustments + 1,
        currentTierDuration: 0,
      }));

      setPreviousTier(currentTier);
      setCurrentTier(newTier);
      setLastAdjustmentReason(reason);
      lastAdjustmentTimeRef.current = now;
      tierStartTimeRef.current = now;

      callbacks?.onQualityChanged?.(adjustment);
    },
    [currentTier, isLocked, fullConfig, callbacks]
  );

  /**
   * Evaluate and adjust quality based on performance
   */
  const evaluate = useCallback((): void => {
    if (isLocked) return;

    const samples = samplesRef.current;
    if (samples.length < fullConfig.sampleWindow / 2) return;

    // Calculate average FPS
    const avgFps = samples.reduce((sum, s) => sum + s.fps, 0) / samples.length;
    const minFps = Math.min(...samples.map((s) => s.fps));
    const maxFps = Math.max(...samples.map((s) => s.fps));

    // Calculate stability (variance)
    const variance =
      samples.reduce((sum, s) => sum + Math.pow(s.fps - avgFps, 2), 0) / samples.length;
    const stdDev = Math.sqrt(variance);
    isStableRef.current = stdDev < fullConfig.stabilityThreshold;

    // Update metrics
    setMetrics((prev) => ({
      ...prev,
      avgFps,
      minFps: Math.min(prev.minFps, minFps),
      maxFps: Math.max(prev.maxFps, maxFps),
      currentTierDuration: Date.now() - tierStartTimeRef.current,
    }));

    // Check for low FPS
    if (avgFps < fullConfig.minFps) {
      callbacks?.onPerformanceWarning?.(avgFps, fullConfig.targetFps);
      adjustQuality("fps_low", "down");
      return;
    }

    // Check for FPS headroom (can increase quality)
    if (avgFps > fullConfig.targetFps * 1.2 && isStableRef.current) {
      adjustQuality("fps_high", "up");
      return;
    }

    // Check battery conditions
    if (
      fullConfig.enableBatteryAware &&
      !conditions.isCharging &&
      conditions.batteryLevel < fullConfig.lowBatteryThreshold
    ) {
      adjustQuality("battery_low", "down");
      return;
    }

    // Check thermal conditions
    if (fullConfig.enableThermalResponse) {
      if (conditions.thermalState === "critical") {
        adjustQuality("thermal_hot", "down");
        return;
      } else if (conditions.thermalState === "serious") {
        adjustQuality("thermal_hot", "down");
        return;
      }
    }

    // Check memory pressure
    if (fullConfig.enableMemoryResponse && conditions.memoryPressure === "high") {
      adjustQuality("memory_pressure", "down");
      return;
    }
  }, [fullConfig, conditions, isLocked, adjustQuality, callbacks]);

  /**
   * Report frame time
   */
  const reportFrameTime = useCallback(
    (timeMs: number): void => {
      const fps = 1000 / Math.max(1, timeMs);
      const sample: PerformanceSample = {
        fps,
        frameTimeMs: timeMs,
        timestamp: Date.now(),
      };

      samplesRef.current.push(sample);
      if (samplesRef.current.length > fullConfig.sampleWindow) {
        samplesRef.current.shift();
      }

      // Auto-evaluate periodically
      if (samplesRef.current.length >= fullConfig.sampleWindow) {
        evaluate();
      }
    },
    [fullConfig.sampleWindow, evaluate]
  );

  /**
   * Set quality tier manually
   */
  const setQualityTier = useCallback(
    (tier: QualityTier): void => {
      if (tier === currentTier) return;

      const adjustment: QualityAdjustment = {
        from: currentTier,
        to: tier,
        reason: "user_request",
        timestamp: Date.now(),
        fpsAtAdjustment: metrics.avgFps,
      };

      setPreviousTier(currentTier);
      setCurrentTier(tier);
      setLastAdjustmentReason("user_request");
      tierStartTimeRef.current = Date.now();

      callbacks?.onQualityChanged?.(adjustment);
    },
    [currentTier, metrics.avgFps, callbacks]
  );

  /**
   * Lock quality
   */
  const lock = useCallback((): void => {
    setIsLocked(true);
  }, []);

  /**
   * Unlock quality
   */
  const unlock = useCallback((): void => {
    setIsLocked(false);
  }, []);

  /**
   * Get current quality settings
   */
  const getSettings = useCallback((): QualitySettings => {
    return {
      ...fullConfig.presets[currentTier],
      ...settingOverrides,
    };
  }, [currentTier, fullConfig.presets, settingOverrides]);

  /**
   * Reset to initial quality
   */
  const reset = useCallback((): void => {
    setCurrentTier(fullConfig.initialTier);
    setPreviousTier(null);
    setLastAdjustmentReason("initial");
    setSettingOverrides({});
    samplesRef.current = [];
    tierStartTimeRef.current = Date.now();
    setMetrics({
      adjustmentsUp: 0,
      adjustmentsDown: 0,
      totalAdjustments: 0,
      avgFps: fullConfig.targetFps,
      minFps: fullConfig.targetFps,
      maxFps: fullConfig.targetFps,
      timeAtTier: {
        ultra: 0,
        high: 0,
        medium: 0,
        low: 0,
        minimal: 0,
      },
      currentTierDuration: 0,
    });
  }, [fullConfig.initialTier, fullConfig.targetFps]);

  /**
   * Override specific setting
   */
  const overrideSetting = useCallback(
    <K extends keyof QualitySettings>(key: K, value: QualitySettings[K]): void => {
      setSettingOverrides((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  // Calculate performance score (0-100)
  const performanceScore = useMemo(() => {
    const fpsScore = Math.min(100, (metrics.avgFps / fullConfig.targetFps) * 100);
    const stabilityScore = isStableRef.current ? 100 : 50;
    return (fpsScore * 0.7 + stabilityScore * 0.3);
  }, [metrics.avgFps, fullConfig.targetFps]);

  // Current quality settings
  const quality = useMemo(() => getSettings(), [getSettings]);

  // Compile state
  const state: QualityState = useMemo(
    () => ({
      currentTier,
      previousTier,
      isStable: isStableRef.current,
      lastAdjustmentReason,
      conditions,
      performanceScore,
    }),
    [currentTier, previousTier, lastAdjustmentReason, conditions, performanceScore]
  );

  // Compile controls
  const controls: QualityControls = useMemo(
    () => ({
      setQualityTier,
      reportFrameTime,
      evaluate,
      lock,
      unlock,
      getSettings,
      reset,
      overrideSetting,
    }),
    [setQualityTier, reportFrameTime, evaluate, lock, unlock, getSettings, reset, overrideSetting]
  );

  return {
    state,
    metrics,
    quality,
    controls,
  };
}

// ============================================================================
// Type definitions for browser APIs
// ============================================================================

interface BatteryManager {
  charging: boolean;
  level: number;
}

interface NetworkInformation {
  effectiveType: "slow-2g" | "2g" | "3g" | "4g";
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple quality tier hook
 */
export function useQualityTier(
  targetFps: number = 60
): {
  tier: QualityTier;
  setTier: (tier: QualityTier) => void;
} {
  const { state, controls } = useAdaptiveRenderQuality({ targetFps });

  return {
    tier: state.currentTier,
    setTier: controls.setQualityTier,
  };
}

/**
 * Resolution scale hook
 */
export function useResolutionScale(targetFps: number = 60): number {
  const { quality } = useAdaptiveRenderQuality({ targetFps });
  return quality.resolutionScale;
}

/**
 * Performance score hook
 */
export function usePerformanceScore(): number {
  const { state } = useAdaptiveRenderQuality();
  return state.performanceScore;
}

export default useAdaptiveRenderQuality;
