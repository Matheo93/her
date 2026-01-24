/**
 * useMobileBatteryOptimizer Hook - Sprint 1586
 *
 * Battery-aware feature management for mobile devices.
 * Automatically adjusts app behavior based on battery level and charging state.
 *
 * Features:
 * - Battery level and charging state monitoring
 * - Automatic feature degradation on low battery
 * - Power mode detection (low power mode)
 * - Battery consumption estimation
 * - Feature toggle recommendations
 * - Usage time remaining estimation
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type BatteryLevel = "full" | "high" | "medium" | "low" | "critical";

export type PowerMode = "normal" | "balanced" | "power_saver" | "ultra_saver";

export type FeatureCategory =
  | "animations"
  | "video"
  | "audio"
  | "sync"
  | "prefetch"
  | "analytics"
  | "location"
  | "haptics"
  | "high_refresh"
  | "background";

export interface BatteryState {
  level: number; // 0-1
  charging: boolean;
  chargingTime: number; // seconds to full (Infinity if not charging)
  dischargingTime: number; // seconds to empty (Infinity if charging)
  supported: boolean;
}

export interface FeatureConfig {
  category: FeatureCategory;
  enabled: boolean;
  powerConsumption: number; // 0-10 (relative power usage)
  minBatteryLevel: number; // 0-1, disable below this level
  degradedMode?: boolean; // true if in reduced functionality mode
  priority: number; // 0-10, higher = more important to keep enabled
}

export interface PowerProfile {
  mode: PowerMode;
  features: Record<FeatureCategory, boolean>;
  animationSpeed: number; // 0-1, multiplier
  syncInterval: number; // ms
  videoQuality: "auto" | "high" | "medium" | "low" | "off";
  audioQuality: "high" | "medium" | "low";
  refreshRate: 30 | 60 | 90 | 120;
}

export interface BatteryMetrics {
  currentLevel: number;
  averageConsumption: number; // %/hour
  estimatedTimeRemaining: number; // minutes
  sessionConsumption: number; // % consumed this session
  sessionDuration: number; // minutes
  chargesCycles: number;
}

export interface BatteryOptimizerConfig {
  enabled: boolean;
  thresholds: {
    full: number; // 0.8
    high: number; // 0.5
    medium: number; // 0.3
    low: number; // 0.15
    critical: number; // 0.05
  };
  autoOptimize: boolean;
  respectSystemPowerMode: boolean;
  features: Partial<Record<FeatureCategory, FeatureConfig>>;
}

export interface BatteryOptimizerState {
  battery: BatteryState;
  level: BatteryLevel;
  powerMode: PowerMode;
  profile: PowerProfile;
  features: Record<FeatureCategory, FeatureConfig>;
  isOptimizing: boolean;
}

export interface BatteryOptimizerControls {
  setPowerMode: (mode: PowerMode) => void;
  setFeatureEnabled: (category: FeatureCategory, enabled: boolean) => void;
  getRecommendedProfile: () => PowerProfile;
  refreshBatteryState: () => Promise<void>;
  estimateTimeForFeature: (category: FeatureCategory) => number; // minutes
  shouldEnableFeature: (category: FeatureCategory) => boolean;
}

export interface UseMobileBatteryOptimizerResult {
  state: BatteryOptimizerState;
  metrics: BatteryMetrics;
  controls: BatteryOptimizerControls;
  batteryLevel: BatteryLevel;
  isLowBattery: boolean;
  isCharging: boolean;
  currentProfile: PowerProfile;
}

// ============================================================================
// Constants
// ============================================================================

// Module-level counter for session IDs (avoids Date.now() overhead)
let sessionIdCounter = 0;

// History size limit
const LEVEL_HISTORY_SIZE = 60;

const DEFAULT_CONFIG: BatteryOptimizerConfig = {
  enabled: true,
  thresholds: {
    full: 0.8,
    high: 0.5,
    medium: 0.3,
    low: 0.15,
    critical: 0.05,
  },
  autoOptimize: true,
  respectSystemPowerMode: true,
  features: {},
};

const DEFAULT_FEATURES: Record<FeatureCategory, FeatureConfig> = {
  animations: { category: "animations", enabled: true, powerConsumption: 3, minBatteryLevel: 0.1, priority: 5 },
  video: { category: "video", enabled: true, powerConsumption: 8, minBatteryLevel: 0.2, priority: 4 },
  audio: { category: "audio", enabled: true, powerConsumption: 4, minBatteryLevel: 0.05, priority: 8 },
  sync: { category: "sync", enabled: true, powerConsumption: 5, minBatteryLevel: 0.1, priority: 7 },
  prefetch: { category: "prefetch", enabled: true, powerConsumption: 4, minBatteryLevel: 0.2, priority: 3 },
  analytics: { category: "analytics", enabled: true, powerConsumption: 2, minBatteryLevel: 0.1, priority: 2 },
  location: { category: "location", enabled: true, powerConsumption: 7, minBatteryLevel: 0.15, priority: 4 },
  haptics: { category: "haptics", enabled: true, powerConsumption: 1, minBatteryLevel: 0.1, priority: 3 },
  high_refresh: { category: "high_refresh", enabled: true, powerConsumption: 6, minBatteryLevel: 0.3, priority: 2 },
  background: { category: "background", enabled: true, powerConsumption: 5, minBatteryLevel: 0.15, priority: 4 },
};

const POWER_PROFILES: Record<PowerMode, Omit<PowerProfile, "mode">> = {
  normal: {
    features: {
      animations: true,
      video: true,
      audio: true,
      sync: true,
      prefetch: true,
      analytics: true,
      location: true,
      haptics: true,
      high_refresh: true,
      background: true,
    },
    animationSpeed: 1,
    syncInterval: 30000,
    videoQuality: "auto",
    audioQuality: "high",
    refreshRate: 60,
  },
  balanced: {
    features: {
      animations: true,
      video: true,
      audio: true,
      sync: true,
      prefetch: true,
      analytics: true,
      location: false,
      haptics: true,
      high_refresh: false,
      background: true,
    },
    animationSpeed: 0.8,
    syncInterval: 60000,
    videoQuality: "medium",
    audioQuality: "high",
    refreshRate: 60,
  },
  power_saver: {
    features: {
      animations: true,
      video: true,
      audio: true,
      sync: true,
      prefetch: false,
      analytics: false,
      location: false,
      haptics: false,
      high_refresh: false,
      background: false,
    },
    animationSpeed: 0.5,
    syncInterval: 120000,
    videoQuality: "low",
    audioQuality: "medium",
    refreshRate: 30,
  },
  ultra_saver: {
    features: {
      animations: false,
      video: false,
      audio: true,
      sync: true,
      prefetch: false,
      analytics: false,
      location: false,
      haptics: false,
      high_refresh: false,
      background: false,
    },
    animationSpeed: 0,
    syncInterval: 300000,
    videoQuality: "off",
    audioQuality: "low",
    refreshRate: 30,
  },
};

// Pre-computed initial states (module-level for performance)
const INITIAL_BATTERY_STATE: BatteryState = {
  level: 1,
  charging: false,
  chargingTime: Infinity,
  dischargingTime: Infinity,
  supported: false,
};

const INITIAL_METRICS: BatteryMetrics = {
  currentLevel: 100,
  averageConsumption: 0,
  estimatedTimeRemaining: Infinity,
  sessionConsumption: 0,
  sessionDuration: 0,
  chargesCycles: 0,
};

// ============================================================================
// Utility Functions
// ============================================================================

export function getBatteryLevel(level: number, thresholds: BatteryOptimizerConfig["thresholds"]): BatteryLevel {
  if (level >= thresholds.full) return "full";
  if (level >= thresholds.high) return "high";
  if (level >= thresholds.medium) return "medium";
  if (level >= thresholds.low) return "low";
  return "critical";
}

export function getRecommendedPowerMode(
  batteryLevel: BatteryLevel,
  isCharging: boolean,
  systemLowPower: boolean
): PowerMode {
  if (isCharging) return "normal";
  if (systemLowPower) return "power_saver";

  switch (batteryLevel) {
    case "full":
    case "high":
      return "normal";
    case "medium":
      return "balanced";
    case "low":
      return "power_saver";
    case "critical":
      return "ultra_saver";
  }
}

export function estimateConsumption(features: Record<FeatureCategory, FeatureConfig>): number {
  let total = 0;
  for (const feature of Object.values(features)) {
    if (feature.enabled) {
      total += feature.powerConsumption;
    }
  }
  // Normalize to % per hour (rough estimate)
  return total * 0.8; // Each unit = ~0.8% per hour
}

// ============================================================================
// Main Hook
// ============================================================================

export function useMobileBatteryOptimizer(
  config: Partial<BatteryOptimizerConfig> = {}
): UseMobileBatteryOptimizerResult {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State - uses module-level constants for initial battery
  const [state, setState] = useState<BatteryOptimizerState>(() => ({
    battery: INITIAL_BATTERY_STATE,
    level: "full" as BatteryLevel,
    powerMode: "normal" as PowerMode,
    profile: { mode: "normal" as PowerMode, ...POWER_PROFILES.normal },
    features: { ...DEFAULT_FEATURES, ...mergedConfig.features },
    isOptimizing: false,
  }));

  // Metrics - uses module-level constant
  const [metrics, setMetrics] = useState<BatteryMetrics>(() => ({
    ...INITIAL_METRICS,
  }));

  // Refs for tracking - use counter-based session ID
  const sessionIdRef = useRef<number>(++sessionIdCounter);
  const sessionStartRef = useRef<{ level: number; time: number }>({ level: 1, time: performance.now() });
  const levelHistoryRef = useRef<Array<{ level: number; time: number }>>([]);

  // Update battery state
  const updateBatteryState = useCallback(async () => {
    try {
      const battery = await (navigator as any).getBattery?.();
      if (!battery) {
        setState((prev) => ({
          ...prev,
          battery: { ...prev.battery, supported: false },
        }));
        return;
      }

      const newBattery: BatteryState = {
        level: battery.level,
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime,
        supported: true,
      };

      const newLevel = getBatteryLevel(battery.level, mergedConfig.thresholds);

      // Track level history - use slice(-N) instead of shift() for O(1) vs O(n)
      const now = performance.now();
      levelHistoryRef.current.push({ level: battery.level, time: now });
      if (levelHistoryRef.current.length > LEVEL_HISTORY_SIZE) {
        levelHistoryRef.current = levelHistoryRef.current.slice(-LEVEL_HISTORY_SIZE);
      }

      // Calculate consumption rate
      let averageConsumption = 0;
      if (levelHistoryRef.current.length >= 2 && !battery.charging) {
        const oldest = levelHistoryRef.current[0];
        const newest = levelHistoryRef.current[levelHistoryRef.current.length - 1];
        const levelDelta = oldest.level - newest.level;
        const timeDeltaHours = (newest.time - oldest.time) / (1000 * 60 * 60);
        if (timeDeltaHours > 0) {
          averageConsumption = (levelDelta * 100) / timeDeltaHours;
        }
      }

      // Session metrics - use performance.now() for consistency
      const sessionDuration = (performance.now() - sessionStartRef.current.time) / (1000 * 60);
      const sessionConsumption = (sessionStartRef.current.level - battery.level) * 100;

      // Time remaining
      const estimatedTimeRemaining = battery.charging
        ? Infinity
        : averageConsumption > 0
          ? (battery.level * 100 * 60) / averageConsumption
          : battery.dischargingTime / 60;

      setMetrics({
        currentLevel: battery.level * 100,
        averageConsumption,
        estimatedTimeRemaining,
        sessionConsumption,
        sessionDuration,
        chargesCycles: 0,
      });

      // Auto-optimize if enabled
      let newPowerMode = state.powerMode;
      let newProfile = state.profile;

      if (mergedConfig.autoOptimize) {
        // Check for system low power mode
        const systemLowPower =
          mergedConfig.respectSystemPowerMode &&
          (navigator as any).deviceMemory !== undefined &&
          (navigator as any).connection?.saveData;

        newPowerMode = getRecommendedPowerMode(newLevel, battery.charging, systemLowPower);
        newProfile = { mode: newPowerMode, ...POWER_PROFILES[newPowerMode] };
      }

      // Update feature states based on battery level
      const newFeatures = { ...state.features };
      for (const [category, feature] of Object.entries(newFeatures)) {
        const cat = category as FeatureCategory;
        if (battery.level < feature.minBatteryLevel && !battery.charging) {
          newFeatures[cat] = { ...feature, enabled: false, degradedMode: true };
        } else if (feature.degradedMode && (battery.level >= feature.minBatteryLevel || battery.charging)) {
          newFeatures[cat] = { ...feature, enabled: newProfile.features[cat], degradedMode: false };
        }
      }

      setState((prev) => ({
        ...prev,
        battery: newBattery,
        level: newLevel,
        powerMode: newPowerMode,
        profile: newProfile,
        features: newFeatures,
        isOptimizing: mergedConfig.autoOptimize,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        battery: { ...prev.battery, supported: false },
      }));
    }
  }, [mergedConfig, state.powerMode, state.profile, state.features]);

  // Initialize and set up listeners
  useEffect(() => {
    if (!mergedConfig.enabled) return;

    const setupBattery = async () => {
      try {
        const battery = await (navigator as any).getBattery?.();
        if (!battery) return;

        // Initial update
        await updateBatteryState();

        // Set up listeners
        battery.addEventListener("levelchange", updateBatteryState);
        battery.addEventListener("chargingchange", updateBatteryState);
        battery.addEventListener("chargingtimechange", updateBatteryState);
        battery.addEventListener("dischargingtimechange", updateBatteryState);

        return () => {
          battery.removeEventListener("levelchange", updateBatteryState);
          battery.removeEventListener("chargingchange", updateBatteryState);
          battery.removeEventListener("chargingtimechange", updateBatteryState);
          battery.removeEventListener("dischargingtimechange", updateBatteryState);
        };
      } catch {
        // Battery API not supported
      }
    };

    const cleanup = setupBattery();
    return () => {
      cleanup?.then((fn) => fn?.());
    };
  }, [mergedConfig.enabled, updateBatteryState]);

  // Periodic update fallback
  useEffect(() => {
    if (!mergedConfig.enabled) return;

    const interval = setInterval(updateBatteryState, 60000); // Every minute
    return () => clearInterval(interval);
  }, [mergedConfig.enabled, updateBatteryState]);

  // Controls
  const setPowerMode = useCallback((mode: PowerMode) => {
    const profile = { mode, ...POWER_PROFILES[mode] };

    setState((prev) => ({
      ...prev,
      powerMode: mode,
      profile,
      isOptimizing: false, // Manual override disables auto
    }));
  }, []);

  const setFeatureEnabled = useCallback((category: FeatureCategory, enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [category]: { ...prev.features[category], enabled, degradedMode: false },
      },
    }));
  }, []);

  const getRecommendedProfile = useCallback((): PowerProfile => {
    const recommended = getRecommendedPowerMode(
      state.level,
      state.battery.charging,
      false
    );
    return { mode: recommended, ...POWER_PROFILES[recommended] };
  }, [state.level, state.battery.charging]);

  const refreshBatteryState = useCallback(async () => {
    await updateBatteryState();
  }, [updateBatteryState]);

  const estimateTimeForFeature = useCallback(
    (category: FeatureCategory): number => {
      const feature = state.features[category];
      if (!feature || !feature.enabled) return Infinity;

      const consumption = feature.powerConsumption * 0.8; // % per hour
      if (consumption === 0) return Infinity;

      return (state.battery.level * 100 * 60) / consumption; // minutes
    },
    [state.features, state.battery.level]
  );

  const shouldEnableFeature = useCallback(
    (category: FeatureCategory): boolean => {
      const feature = state.features[category];
      if (!feature) return true;

      // Always enable if charging
      if (state.battery.charging) return true;

      // Check minimum battery level
      if (state.battery.level < feature.minBatteryLevel) return false;

      // Check profile recommendation
      return state.profile.features[category];
    },
    [state.features, state.battery, state.profile]
  );

  const controls: BatteryOptimizerControls = useMemo(
    () => ({
      setPowerMode,
      setFeatureEnabled,
      getRecommendedProfile,
      refreshBatteryState,
      estimateTimeForFeature,
      shouldEnableFeature,
    }),
    [setPowerMode, setFeatureEnabled, getRecommendedProfile, refreshBatteryState, estimateTimeForFeature, shouldEnableFeature]
  );

  // Derived values
  const isLowBattery = state.level === "low" || state.level === "critical";
  const isCharging = state.battery.charging;

  return {
    state,
    metrics,
    controls,
    batteryLevel: state.level,
    isLowBattery,
    isCharging,
    currentProfile: state.profile,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for simple battery level monitoring
 */
export function useBatteryLevel(): {
  level: number;
  isCharging: boolean;
  isLow: boolean;
  supported: boolean;
} {
  const { state } = useMobileBatteryOptimizer();

  return {
    level: state.battery.level * 100,
    isCharging: state.battery.charging,
    isLow: state.level === "low" || state.level === "critical",
    supported: state.battery.supported,
  };
}

/**
 * Hook for feature-specific battery check
 */
export function useBatteryAwareFeature(
  category: FeatureCategory,
  config?: Partial<BatteryOptimizerConfig>
): { enabled: boolean; shouldEnable: boolean; reason?: string } {
  const { state, controls } = useMobileBatteryOptimizer(config);
  const feature = state.features[category];
  const shouldEnable = controls.shouldEnableFeature(category);

  let reason: string | undefined;
  if (!shouldEnable) {
    if (state.battery.level < (feature?.minBatteryLevel || 0)) {
      reason = "Battery too low";
    } else if (!state.profile.features[category]) {
      reason = `Disabled in ${state.powerMode} mode`;
    }
  }

  return {
    enabled: feature?.enabled || false,
    shouldEnable,
    reason,
  };
}

export default useMobileBatteryOptimizer;
