/**
 * useMobileThermalManager - Thermal state management for mobile devices
 *
 * Sprint 1587 - Monitors device thermal state and adjusts application behavior
 * to prevent throttling and maintain smooth performance.
 *
 * Features:
 * - Thermal state detection (nominal, fair, serious, critical)
 * - CPU/GPU workload estimation
 * - Automatic performance scaling
 * - Cooldown period management
 * - Feature-specific thermal budgets
 * - Predictive thermal trend analysis
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Thermal states
export type ThermalState =
  | "nominal" // Normal operation
  | "fair" // Slightly warm
  | "serious" // Hot, performance may be affected
  | "critical"; // Very hot, aggressive throttling needed

export type WorkloadType =
  | "rendering" // GPU-intensive
  | "computation" // CPU-intensive
  | "network" // I/O bound
  | "media" // Audio/video processing
  | "idle"; // Minimal activity

export type ThermalTrend = "cooling" | "stable" | "warming" | "heating_fast";

export interface ThermalReading {
  state: ThermalState;
  estimatedTemp: number; // 0-100 normalized
  trend: ThermalTrend;
  timestamp: number;
}

export interface WorkloadProfile {
  type: WorkloadType;
  intensity: number; // 0-1
  duration: number; // ms running
  thermalCost: number; // Heat contribution estimate
}

export interface ThermalBudget {
  category: string;
  allocated: number; // 0-1 of total budget
  used: number; // 0-1 of allocated
  priority: number; // Higher = more important
}

export interface CooldownPeriod {
  active: boolean;
  startTime: number | null;
  duration: number;
  targetState: ThermalState;
  restrictions: string[];
}

export interface ThermalManagerState {
  thermal: ThermalReading;
  workloads: WorkloadProfile[];
  budgets: ThermalBudget[];
  cooldown: CooldownPeriod;
  performanceScale: number; // 0-1, recommended performance level
  throttleLevel: number; // 0-1, how much to reduce activity
}

export interface ThermalMetrics {
  timeInNominal: number;
  timeInFair: number;
  timeInSerious: number;
  timeInCritical: number;
  cooldownsTriggered: number;
  peakTemp: number;
  averageTemp: number;
  thermalEvents: number;
}

export interface ThermalConfig {
  enabled: boolean;
  sampleIntervalMs: number;
  fairThreshold: number; // 0-100
  seriousThreshold: number;
  criticalThreshold: number;
  cooldownDurationMs: number;
  autoThrottle: boolean;
  budgetEnforcement: boolean;
  predictiveScaling: boolean;
  historySize: number;
}

export interface ThermalControls {
  reportWorkload: (type: WorkloadType, intensity: number) => void;
  clearWorkload: (type: WorkloadType) => void;
  allocateBudget: (category: string, amount: number, priority: number) => void;
  releaseBudget: (category: string) => void;
  triggerCooldown: (durationMs?: number) => void;
  cancelCooldown: () => void;
  setPerformanceScale: (scale: number) => void;
  updateConfig: (config: Partial<ThermalConfig>) => void;
  getRecommendedScale: (workloadType: WorkloadType) => number;
  reset: () => void;
}

export interface UseMobileThermalManagerResult {
  state: ThermalManagerState;
  metrics: ThermalMetrics;
  controls: ThermalControls;
  config: ThermalConfig;
}

const DEFAULT_CONFIG: ThermalConfig = {
  enabled: true,
  sampleIntervalMs: 1000,
  fairThreshold: 40,
  seriousThreshold: 65,
  criticalThreshold: 85,
  cooldownDurationMs: 30000,
  autoThrottle: true,
  budgetEnforcement: true,
  predictiveScaling: true,
  historySize: 60,
};

// Workload thermal costs (heat generation rate)
const WORKLOAD_COSTS: Record<WorkloadType, number> = {
  rendering: 0.8,
  computation: 1.0,
  network: 0.3,
  media: 0.6,
  idle: 0.1,
};

// Cooling rates per state
const COOLING_RATES: Record<ThermalState, number> = {
  nominal: 0.5,
  fair: 0.3,
  serious: 0.2,
  critical: 0.1,
};

// Determine thermal state from normalized temp
function getThermalState(temp: number, config: ThermalConfig): ThermalState {
  if (temp >= config.criticalThreshold) return "critical";
  if (temp >= config.seriousThreshold) return "serious";
  if (temp >= config.fairThreshold) return "fair";
  return "nominal";
}

// Determine trend from history
function getThermalTrend(history: number[]): ThermalTrend {
  if (history.length < 3) return "stable";

  const recent = history.slice(-5);
  const earlier = history.slice(-10, -5);

  if (earlier.length === 0) return "stable";

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const diff = recentAvg - earlierAvg;

  if (diff > 5) return "heating_fast";
  if (diff > 1) return "warming";
  if (diff < -2) return "cooling";
  return "stable";
}

// Calculate recommended performance scale
function calculatePerformanceScale(
  thermal: ThermalReading,
  config: ThermalConfig
): number {
  const { state, trend, estimatedTemp } = thermal;

  let baseScale = 1.0;

  switch (state) {
    case "nominal":
      baseScale = 1.0;
      break;
    case "fair":
      baseScale = 0.85;
      break;
    case "serious":
      baseScale = 0.6;
      break;
    case "critical":
      baseScale = 0.3;
      break;
  }

  // Adjust for trend
  if (trend === "heating_fast") {
    baseScale *= 0.8;
  } else if (trend === "warming") {
    baseScale *= 0.9;
  } else if (trend === "cooling") {
    baseScale *= 1.1;
  }

  // Predictive adjustment based on where we're heading
  if (config.predictiveScaling) {
    const headroom = config.seriousThreshold - estimatedTemp;
    if (headroom < 10) {
      baseScale *= 0.9;
    }
  }

  return Math.max(0.1, Math.min(1.0, baseScale));
}

export function useMobileThermalManager(
  initialConfig: Partial<ThermalConfig> = {}
): UseMobileThermalManagerResult {
  const [config, setConfig] = useState<ThermalConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [state, setState] = useState<ThermalManagerState>({
    thermal: {
      state: "nominal",
      estimatedTemp: 25,
      trend: "stable",
      timestamp: Date.now(),
    },
    workloads: [],
    budgets: [],
    cooldown: {
      active: false,
      startTime: null,
      duration: 0,
      targetState: "nominal",
      restrictions: [],
    },
    performanceScale: 1.0,
    throttleLevel: 0,
  });

  const [metrics, setMetrics] = useState<ThermalMetrics>({
    timeInNominal: 0,
    timeInFair: 0,
    timeInSerious: 0,
    timeInCritical: 0,
    cooldownsTriggered: 0,
    peakTemp: 25,
    averageTemp: 25,
    thermalEvents: 0,
  });

  // Refs for tracking
  const tempHistoryRef = useRef<number[]>([25]);
  const workloadsMapRef = useRef<Map<WorkloadType, WorkloadProfile>>(new Map());
  const budgetsMapRef = useRef<Map<string, ThermalBudget>>(new Map());
  const lastStateRef = useRef<ThermalState>("nominal");
  const manualScaleRef = useRef<number | null>(null);

  // Report workload activity
  const reportWorkload = useCallback((type: WorkloadType, intensity: number) => {
    const existing = workloadsMapRef.current.get(type);
    const now = Date.now();

    const profile: WorkloadProfile = {
      type,
      intensity: Math.max(0, Math.min(1, intensity)),
      duration: existing ? existing.duration + (now - existing.duration) : 0,
      thermalCost: WORKLOAD_COSTS[type] * intensity,
    };

    workloadsMapRef.current.set(type, profile);
  }, []);

  // Clear workload
  const clearWorkload = useCallback((type: WorkloadType) => {
    workloadsMapRef.current.delete(type);
  }, []);

  // Allocate thermal budget
  const allocateBudget = useCallback(
    (category: string, amount: number, priority: number) => {
      budgetsMapRef.current.set(category, {
        category,
        allocated: Math.max(0, Math.min(1, amount)),
        used: 0,
        priority,
      });
    },
    []
  );

  // Release budget
  const releaseBudget = useCallback((category: string) => {
    budgetsMapRef.current.delete(category);
  }, []);

  // Trigger manual cooldown
  const triggerCooldown = useCallback(
    (durationMs?: number) => {
      setState((prev) => ({
        ...prev,
        cooldown: {
          active: true,
          startTime: Date.now(),
          duration: durationMs || config.cooldownDurationMs,
          targetState: "nominal",
          restrictions: ["rendering", "computation", "media"],
        },
      }));

      setMetrics((prev) => ({
        ...prev,
        cooldownsTriggered: prev.cooldownsTriggered + 1,
      }));
    },
    [config.cooldownDurationMs]
  );

  // Cancel cooldown
  const cancelCooldown = useCallback(() => {
    setState((prev) => ({
      ...prev,
      cooldown: {
        active: false,
        startTime: null,
        duration: 0,
        targetState: "nominal",
        restrictions: [],
      },
    }));
  }, []);

  // Manual performance scale override
  const setPerformanceScale = useCallback((scale: number) => {
    manualScaleRef.current = Math.max(0.1, Math.min(1.0, scale));
  }, []);

  // Update config
  const updateConfig = useCallback((updates: Partial<ThermalConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Get recommended scale for specific workload
  const getRecommendedScale = useCallback(
    (workloadType: WorkloadType): number => {
      const baseScale = state.performanceScale;
      const workloadCost = WORKLOAD_COSTS[workloadType];

      // Higher cost workloads get more aggressive scaling
      return baseScale * (1 - workloadCost * 0.2 * state.throttleLevel);
    },
    [state.performanceScale, state.throttleLevel]
  );

  // Reset
  const reset = useCallback(() => {
    tempHistoryRef.current = [25];
    workloadsMapRef.current.clear();
    budgetsMapRef.current.clear();
    manualScaleRef.current = null;

    setState({
      thermal: {
        state: "nominal",
        estimatedTemp: 25,
        trend: "stable",
        timestamp: Date.now(),
      },
      workloads: [],
      budgets: [],
      cooldown: {
        active: false,
        startTime: null,
        duration: 0,
        targetState: "nominal",
        restrictions: [],
      },
      performanceScale: 1.0,
      throttleLevel: 0,
    });

    setMetrics({
      timeInNominal: 0,
      timeInFair: 0,
      timeInSerious: 0,
      timeInCritical: 0,
      cooldownsTriggered: 0,
      peakTemp: 25,
      averageTemp: 25,
      thermalEvents: 0,
    });
  }, []);

  // Main thermal simulation loop
  useEffect(() => {
    if (!config.enabled) return;

    const interval = setInterval(() => {
      const now = Date.now();

      // Calculate total heat generation from workloads
      let heatGeneration = 0;
      workloadsMapRef.current.forEach((profile) => {
        heatGeneration += profile.thermalCost * profile.intensity;
      });

      // Get current temp
      const currentTemp =
        tempHistoryRef.current[tempHistoryRef.current.length - 1] || 25;
      const currentState = getThermalState(currentTemp, config);

      // Calculate cooling rate
      const coolingRate = COOLING_RATES[currentState];

      // Apply cooldown multiplier
      let cooldownMultiplier = 1.0;
      if (state.cooldown.active && state.cooldown.startTime) {
        const elapsed = now - state.cooldown.startTime;
        if (elapsed >= state.cooldown.duration) {
          // Cooldown complete
          setState((prev) => ({
            ...prev,
            cooldown: {
              ...prev.cooldown,
              active: false,
              startTime: null,
            },
          }));
        } else {
          cooldownMultiplier = 0.3; // Significantly reduce heat during cooldown
        }
      }

      // Simulate temperature change
      const heatChange =
        heatGeneration * cooldownMultiplier * 2 - coolingRate;
      const newTemp = Math.max(
        20,
        Math.min(100, currentTemp + heatChange)
      );

      // Update history
      tempHistoryRef.current.push(newTemp);
      if (tempHistoryRef.current.length > config.historySize) {
        tempHistoryRef.current.shift();
      }

      // Calculate thermal reading
      const thermalState = getThermalState(newTemp, config);
      const trend = getThermalTrend(tempHistoryRef.current);

      const thermal: ThermalReading = {
        state: thermalState,
        estimatedTemp: newTemp,
        trend,
        timestamp: now,
      };

      // Calculate performance scale
      const autoScale = calculatePerformanceScale(thermal, config);
      const performanceScale = manualScaleRef.current ?? autoScale;

      // Calculate throttle level
      const throttleLevel =
        thermalState === "critical"
          ? 0.7
          : thermalState === "serious"
            ? 0.4
            : thermalState === "fair"
              ? 0.15
              : 0;

      // Check for state changes
      if (thermalState !== lastStateRef.current) {
        setMetrics((prev) => ({
          ...prev,
          thermalEvents: prev.thermalEvents + 1,
        }));

        // Auto-trigger cooldown on critical
        if (thermalState === "critical" && config.autoThrottle) {
          triggerCooldown();
        }

        lastStateRef.current = thermalState;
      }

      // Update metrics
      setMetrics((prev) => {
        const newMetrics = { ...prev };

        switch (thermalState) {
          case "nominal":
            newMetrics.timeInNominal += config.sampleIntervalMs;
            break;
          case "fair":
            newMetrics.timeInFair += config.sampleIntervalMs;
            break;
          case "serious":
            newMetrics.timeInSerious += config.sampleIntervalMs;
            break;
          case "critical":
            newMetrics.timeInCritical += config.sampleIntervalMs;
            break;
        }

        newMetrics.peakTemp = Math.max(newMetrics.peakTemp, newTemp);
        newMetrics.averageTemp =
          (newMetrics.averageTemp *
            (tempHistoryRef.current.length - 1) +
            newTemp) /
          tempHistoryRef.current.length;

        return newMetrics;
      });

      // Update state
      setState((prev) => ({
        ...prev,
        thermal,
        workloads: Array.from(workloadsMapRef.current.values()),
        budgets: Array.from(budgetsMapRef.current.values()),
        performanceScale,
        throttleLevel,
      }));
    }, config.sampleIntervalMs);

    return () => clearInterval(interval);
  }, [config, state.cooldown, triggerCooldown]);

  const controls: ThermalControls = useMemo(
    () => ({
      reportWorkload,
      clearWorkload,
      allocateBudget,
      releaseBudget,
      triggerCooldown,
      cancelCooldown,
      setPerformanceScale,
      updateConfig,
      getRecommendedScale,
      reset,
    }),
    [
      reportWorkload,
      clearWorkload,
      allocateBudget,
      releaseBudget,
      triggerCooldown,
      cancelCooldown,
      setPerformanceScale,
      updateConfig,
      getRecommendedScale,
      reset,
    ]
  );

  return {
    state,
    metrics,
    controls,
    config,
  };
}

// Sub-hook: Simple thermal state
export function useThermalState(
  config?: Partial<ThermalConfig>
): {
  state: ThermalState;
  temp: number;
  trend: ThermalTrend;
  shouldThrottle: boolean;
} {
  const { state } = useMobileThermalManager(config);

  return {
    state: state.thermal.state,
    temp: state.thermal.estimatedTemp,
    trend: state.thermal.trend,
    shouldThrottle: state.throttleLevel > 0.3,
  };
}

// Sub-hook: Thermal-aware feature
export function useThermalAwareFeature(
  featureName: string,
  workloadType: WorkloadType,
  config?: Partial<ThermalConfig>
): {
  enabled: boolean;
  intensity: number;
  reportActivity: (active: boolean, intensity?: number) => void;
} {
  const { state, controls } = useMobileThermalManager(config);
  const [intensity, setIntensity] = useState(1.0);

  // Check if feature is restricted during cooldown
  const restricted = state.cooldown.active &&
    state.cooldown.restrictions.includes(workloadType);

  // Calculate if feature should be enabled
  const enabled =
    !restricted &&
    state.thermal.state !== "critical" &&
    state.performanceScale > 0.3;

  const reportActivity = useCallback(
    (active: boolean, activityIntensity: number = 1.0) => {
      if (active) {
        const scaledIntensity =
          activityIntensity * controls.getRecommendedScale(workloadType);
        setIntensity(scaledIntensity);
        controls.reportWorkload(workloadType, scaledIntensity);
      } else {
        controls.clearWorkload(workloadType);
        setIntensity(0);
      }
    },
    [controls, workloadType]
  );

  return {
    enabled,
    intensity,
    reportActivity,
  };
}

export default useMobileThermalManager;
