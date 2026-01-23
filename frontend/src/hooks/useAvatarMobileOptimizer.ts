/**
 * useAvatarMobileOptimizer - Sprint 539
 *
 * Mobile-specific optimizations for avatar UX latency:
 * - Touch event coalescing prediction and interpolation
 * - Thermal throttling detection and quality adjustment
 * - Battery saver mode detection
 * - Viewport visibility-based animation pausing
 * - Adaptive frame rate based on device capability
 * - Memory pressure detection
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type DevicePerformanceTier = "high" | "medium" | "low" | "critical";
export type ThermalState = "nominal" | "fair" | "serious" | "critical";
export type BatteryState = "charging" | "high" | "medium" | "low" | "critical";

export interface TouchPrediction {
  predictedX: number;
  predictedY: number;
  confidence: number;
  latencyCompensationMs: number;
}

export interface CoalescedEvent {
  x: number;
  y: number;
  timestamp: number;
  pressure: number;
}

export interface PerformanceConstraints {
  maxFps: number;
  enableComplexAnimations: boolean;
  enableParticles: boolean;
  enableBlur: boolean;
  textureQuality: "high" | "medium" | "low";
  animationComplexity: number; // 0-1
}

export interface MobileOptimizerConfig {
  enableTouchPrediction: boolean;
  predictionHorizonMs: number;
  thermalCheckIntervalMs: number;
  batteryCheckIntervalMs: number;
  memoryCheckIntervalMs: number;
  visibilityThreshold: number;
  minFps: number;
  targetFps: number;
}

export interface MobileOptimizerCallbacks {
  onPerformanceTierChange?: (tier: DevicePerformanceTier) => void;
  onThermalStateChange?: (state: ThermalState) => void;
  onBatteryStateChange?: (state: BatteryState) => void;
  onVisibilityChange?: (isVisible: boolean) => void;
  onFrameDropDetected?: (droppedFrames: number) => void;
}

export interface MobileOptimizerState {
  isActive: boolean;
  performanceTier: DevicePerformanceTier;
  thermalState: ThermalState;
  batteryState: BatteryState;
  isVisible: boolean;
  isPaused: boolean;
  currentFps: number;
  memoryPressure: number;
}

export interface MobileOptimizerMetrics {
  averageFps: number;
  frameDropCount: number;
  touchLatencyMs: number;
  predictionAccuracy: number;
  thermalThrottleCount: number;
}

export interface MobileOptimizerControls {
  processTouchEvent: (event: TouchEvent) => CoalescedEvent[];
  predictTouchPosition: (events: CoalescedEvent[]) => TouchPrediction;
  getPerformanceConstraints: () => PerformanceConstraints;
  setTargetFps: (fps: number) => void;
  pause: () => void;
  resume: () => void;
  forcePerformanceTier: (tier: DevicePerformanceTier | null) => void;
  resetMetrics: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: MobileOptimizerConfig = {
  enableTouchPrediction: true,
  predictionHorizonMs: 16, // One frame ahead
  thermalCheckIntervalMs: 5000,
  batteryCheckIntervalMs: 10000,
  memoryCheckIntervalMs: 5000,
  visibilityThreshold: 0.1,
  minFps: 24,
  targetFps: 60,
};

const PERFORMANCE_CONSTRAINTS: Record<DevicePerformanceTier, PerformanceConstraints> = {
  high: {
    maxFps: 60,
    enableComplexAnimations: true,
    enableParticles: true,
    enableBlur: true,
    textureQuality: "high",
    animationComplexity: 1.0,
  },
  medium: {
    maxFps: 45,
    enableComplexAnimations: true,
    enableParticles: false,
    enableBlur: false,
    textureQuality: "medium",
    animationComplexity: 0.7,
  },
  low: {
    maxFps: 30,
    enableComplexAnimations: false,
    enableParticles: false,
    enableBlur: false,
    textureQuality: "low",
    animationComplexity: 0.4,
  },
  critical: {
    maxFps: 24,
    enableComplexAnimations: false,
    enableParticles: false,
    enableBlur: false,
    textureQuality: "low",
    animationComplexity: 0.2,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function estimateThermalState(fps: number, targetFps: number): ThermalState {
  const fpsRatio = fps / targetFps;
  if (fpsRatio >= 0.9) return "nominal";
  if (fpsRatio >= 0.7) return "fair";
  if (fpsRatio >= 0.5) return "serious";
  return "critical";
}

function estimateBatteryState(level: number, charging: boolean): BatteryState {
  if (charging) return "charging";
  if (level > 0.5) return "high";
  if (level > 0.2) return "medium";
  if (level > 0.1) return "low";
  return "critical";
}

function calculatePerformanceTier(
  fps: number,
  targetFps: number,
  thermalState: ThermalState,
  batteryState: BatteryState,
  memoryPressure: number
): DevicePerformanceTier {
  // Start with FPS-based tier
  const fpsRatio = fps / targetFps;
  let baseTier: DevicePerformanceTier;

  if (fpsRatio >= 0.9) baseTier = "high";
  else if (fpsRatio >= 0.7) baseTier = "medium";
  else if (fpsRatio >= 0.5) baseTier = "low";
  else baseTier = "critical";

  // Downgrade based on thermal state
  if (thermalState === "critical") return "critical";
  if (thermalState === "serious" && baseTier !== "critical") baseTier = "low";

  // Downgrade based on battery
  if (batteryState === "critical") return "critical";
  if (batteryState === "low" && baseTier === "high") baseTier = "medium";

  // Downgrade based on memory pressure
  if (memoryPressure > 0.9) return "critical";
  if (memoryPressure > 0.7 && baseTier === "high") baseTier = "medium";

  return baseTier;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarMobileOptimizer(
  config: Partial<MobileOptimizerConfig> = {},
  callbacks: MobileOptimizerCallbacks = {}
): { state: MobileOptimizerState; metrics: MobileOptimizerMetrics; controls: MobileOptimizerControls } {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [performanceTier, setPerformanceTier] = useState<DevicePerformanceTier>("high");
  const [thermalState, setThermalState] = useState<ThermalState>("nominal");
  const [batteryState, setBatteryState] = useState<BatteryState>("high");
  const [isVisible, setIsVisible] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [currentFps, setCurrentFps] = useState(60);
  const [memoryPressure, setMemoryPressure] = useState(0);
  const [targetFps, setTargetFps] = useState(mergedConfig.targetFps);

  // Metrics
  const [averageFps, setAverageFps] = useState(60);
  const [frameDropCount, setFrameDropCount] = useState(0);
  const [touchLatencyMs, setTouchLatencyMs] = useState(0);
  const [predictionAccuracy, setPredictionAccuracy] = useState(1);
  const [thermalThrottleCount, setThermalThrottleCount] = useState(0);

  // Refs
  const forcedTierRef = useRef<DevicePerformanceTier | null>(null);
  const lastFrameTimeRef = useRef(performance.now());
  const frameTimesRef = useRef<number[]>([]);
  const touchHistoryRef = useRef<CoalescedEvent[]>([]);
  const predictionHistoryRef = useRef<{ predicted: TouchPrediction; actual: CoalescedEvent }[]>([]);

  // FPS monitoring
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    const frameTimes: number[] = [];

    const measureFrame = (currentTime: number) => {
      const delta = currentTime - lastTime;
      lastTime = currentTime;

      if (delta > 0) {
        frameTimes.push(delta);
        if (frameTimes.length > 60) {
          frameTimes.shift();
        }

        // Calculate average FPS
        const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        const fps = Math.round(1000 / avgDelta);
        setCurrentFps(fps);

        // Update average FPS metric
        frameTimesRef.current = frameTimes;
        setAverageFps(fps);

        // Detect frame drops
        const expectedDelta = 1000 / targetFps;
        if (delta > expectedDelta * 2) {
          const droppedFrames = Math.floor(delta / expectedDelta) - 1;
          setFrameDropCount(prev => prev + droppedFrames);
          callbacks.onFrameDropDetected?.(droppedFrames);
        }
      }

      animationFrameId = requestAnimationFrame(measureFrame);
    };

    if (!isPaused) {
      animationFrameId = requestAnimationFrame(measureFrame);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPaused, targetFps, callbacks]);

  // Battery monitoring
  useEffect(() => {
    let mounted = true;

    const checkBattery = async () => {
      try {
        // @ts-expect-error - Battery API not in all TS definitions
        const battery = await navigator.getBattery?.();
        if (battery && mounted) {
          const newState = estimateBatteryState(battery.level, battery.charging);
          setBatteryState(prev => {
            if (prev !== newState) {
              callbacks.onBatteryStateChange?.(newState);
            }
            return newState;
          });
        }
      } catch {
        // Battery API not available
      }
    };

    checkBattery();
    const intervalId = setInterval(checkBattery, mergedConfig.batteryCheckIntervalMs);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [mergedConfig.batteryCheckIntervalMs, callbacks]);

  // Thermal state estimation (based on FPS drops)
  useEffect(() => {
    const checkThermal = () => {
      const newThermalState = estimateThermalState(currentFps, targetFps);
      setThermalState(prev => {
        if (prev !== newThermalState) {
          callbacks.onThermalStateChange?.(newThermalState);
          if (newThermalState === "serious" || newThermalState === "critical") {
            setThermalThrottleCount(count => count + 1);
          }
        }
        return newThermalState;
      });
    };

    const intervalId = setInterval(checkThermal, mergedConfig.thermalCheckIntervalMs);
    return () => clearInterval(intervalId);
  }, [currentFps, targetFps, mergedConfig.thermalCheckIntervalMs, callbacks]);

  // Memory pressure monitoring
  useEffect(() => {
    const checkMemory = () => {
      // @ts-expect-error - Performance memory not in all TS definitions
      const memory = performance.memory;
      if (memory) {
        const pressure = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
        setMemoryPressure(pressure);
      }
    };

    checkMemory();
    const intervalId = setInterval(checkMemory, mergedConfig.memoryCheckIntervalMs);
    return () => clearInterval(intervalId);
  }, [mergedConfig.memoryCheckIntervalMs]);

  // Visibility monitoring
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const visible = entry.intersectionRatio >= mergedConfig.visibilityThreshold;
        setIsVisible(visible);
        callbacks.onVisibilityChange?.(visible);
      },
      { threshold: [0, mergedConfig.visibilityThreshold, 0.5, 1] }
    );

    // Observe document body as fallback
    observer.observe(document.body);

    return () => observer.disconnect();
  }, [mergedConfig.visibilityThreshold, callbacks]);

  // Calculate performance tier
  useEffect(() => {
    if (forcedTierRef.current !== null) {
      setPerformanceTier(forcedTierRef.current);
      return;
    }

    const newTier = calculatePerformanceTier(
      currentFps,
      targetFps,
      thermalState,
      batteryState,
      memoryPressure
    );

    setPerformanceTier(prev => {
      if (prev !== newTier) {
        callbacks.onPerformanceTierChange?.(newTier);
      }
      return newTier;
    });
  }, [currentFps, targetFps, thermalState, batteryState, memoryPressure, callbacks]);

  // Process coalesced touch events
  const processTouchEvent = useCallback((event: TouchEvent): CoalescedEvent[] => {
    const startTime = performance.now();
    const coalescedEvents: CoalescedEvent[] = [];

    // Use getCoalescedEvents if available
    if ("getCoalescedEvents" in event) {
      // @ts-expect-error - getCoalescedEvents not in all TS definitions
      const coalesced = event.getCoalescedEvents?.() ?? [];
      for (const touch of coalesced) {
        coalescedEvents.push({
          x: touch.clientX,
          y: touch.clientY,
          timestamp: touch.timeStamp || performance.now(),
          pressure: touch.force || 1,
        });
      }
    }

    // Fallback to regular touches
    if (coalescedEvents.length === 0 && event.touches.length > 0) {
      const touch = event.touches[0];
      coalescedEvents.push({
        x: touch.clientX,
        y: touch.clientY,
        timestamp: event.timeStamp,
        pressure: touch.force || 1,
      });
    }

    // Store in history for prediction
    touchHistoryRef.current.push(...coalescedEvents);
    if (touchHistoryRef.current.length > 10) {
      touchHistoryRef.current = touchHistoryRef.current.slice(-10);
    }

    // Measure touch latency
    const latency = performance.now() - startTime;
    setTouchLatencyMs(prev => prev * 0.9 + latency * 0.1);

    return coalescedEvents;
  }, []);

  // Predict touch position
  const predictTouchPosition = useCallback((events: CoalescedEvent[]): TouchPrediction => {
    if (!mergedConfig.enableTouchPrediction || events.length < 2) {
      const lastEvent = events[events.length - 1] || { x: 0, y: 0 };
      return {
        predictedX: lastEvent.x,
        predictedY: lastEvent.y,
        confidence: 0,
        latencyCompensationMs: 0,
      };
    }

    // Simple linear extrapolation based on last two points
    const history = touchHistoryRef.current;
    if (history.length < 2) {
      const lastEvent = events[events.length - 1];
      return {
        predictedX: lastEvent.x,
        predictedY: lastEvent.y,
        confidence: 0.5,
        latencyCompensationMs: 0,
      };
    }

    const recent = history.slice(-3);
    const last = recent[recent.length - 1];
    const prev = recent[recent.length - 2];

    const dt = last.timestamp - prev.timestamp;
    if (dt <= 0) {
      return {
        predictedX: last.x,
        predictedY: last.y,
        confidence: 0.3,
        latencyCompensationMs: 0,
      };
    }

    // Calculate velocity
    const vx = (last.x - prev.x) / dt;
    const vy = (last.y - prev.y) / dt;

    // Predict position at horizon
    const horizonMs = mergedConfig.predictionHorizonMs;
    const predictedX = last.x + vx * horizonMs;
    const predictedY = last.y + vy * horizonMs;

    // Calculate confidence based on velocity consistency
    let confidence = 0.8;
    if (recent.length >= 3) {
      const older = recent[recent.length - 3];
      const oldVx = (prev.x - older.x) / (prev.timestamp - older.timestamp);
      const oldVy = (prev.y - older.y) / (prev.timestamp - older.timestamp);
      const velocityChange = Math.sqrt((vx - oldVx) ** 2 + (vy - oldVy) ** 2);
      confidence = Math.max(0.3, 0.95 - velocityChange * 0.01);
    }

    return {
      predictedX,
      predictedY,
      confidence,
      latencyCompensationMs: horizonMs,
    };
  }, [mergedConfig.enableTouchPrediction, mergedConfig.predictionHorizonMs]);

  // Get performance constraints
  const getPerformanceConstraints = useCallback((): PerformanceConstraints => {
    const tier = forcedTierRef.current ?? performanceTier;
    return PERFORMANCE_CONSTRAINTS[tier];
  }, [performanceTier]);

  // Control functions
  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  const forcePerformanceTier = useCallback((tier: DevicePerformanceTier | null) => {
    forcedTierRef.current = tier;
    if (tier !== null) {
      setPerformanceTier(tier);
      callbacks.onPerformanceTierChange?.(tier);
    }
  }, [callbacks]);

  const setTargetFpsFn = useCallback((fps: number) => {
    setTargetFps(Math.max(mergedConfig.minFps, Math.min(60, fps)));
  }, [mergedConfig.minFps]);

  const resetMetrics = useCallback(() => {
    setFrameDropCount(0);
    setTouchLatencyMs(0);
    setPredictionAccuracy(1);
    setThermalThrottleCount(0);
    frameTimesRef.current = [];
    touchHistoryRef.current = [];
    predictionHistoryRef.current = [];
  }, []);

  const state: MobileOptimizerState = useMemo(() => ({
    isActive: true,
    performanceTier,
    thermalState,
    batteryState,
    isVisible,
    isPaused,
    currentFps,
    memoryPressure,
  }), [performanceTier, thermalState, batteryState, isVisible, isPaused, currentFps, memoryPressure]);

  const metrics: MobileOptimizerMetrics = useMemo(() => ({
    averageFps,
    frameDropCount,
    touchLatencyMs,
    predictionAccuracy,
    thermalThrottleCount,
  }), [averageFps, frameDropCount, touchLatencyMs, predictionAccuracy, thermalThrottleCount]);

  const controls: MobileOptimizerControls = useMemo(() => ({
    processTouchEvent,
    predictTouchPosition,
    getPerformanceConstraints,
    setTargetFps: setTargetFpsFn,
    pause,
    resume,
    forcePerformanceTier,
    resetMetrics,
  }), [
    processTouchEvent,
    predictTouchPosition,
    getPerformanceConstraints,
    setTargetFpsFn,
    pause,
    resume,
    forcePerformanceTier,
    resetMetrics,
  ]);

  return { state, metrics, controls };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useTouchPrediction(): {
  processTouch: (event: TouchEvent) => TouchPrediction;
  lastPrediction: TouchPrediction | null;
  accuracy: number;
} {
  const [lastPrediction, setLastPrediction] = useState<TouchPrediction | null>(null);
  const { controls, metrics } = useAvatarMobileOptimizer();

  const processTouch = useCallback((event: TouchEvent): TouchPrediction => {
    const events = controls.processTouchEvent(event);
    const prediction = controls.predictTouchPosition(events);
    setLastPrediction(prediction);
    return prediction;
  }, [controls]);

  return {
    processTouch,
    lastPrediction,
    accuracy: metrics.predictionAccuracy,
  };
}

export function useAdaptiveFrameRate(): {
  currentFps: number;
  targetFps: number;
  setTargetFps: (fps: number) => void;
  constraints: PerformanceConstraints;
} {
  const { state, controls } = useAvatarMobileOptimizer();

  return {
    currentFps: state.currentFps,
    targetFps: 60,
    setTargetFps: controls.setTargetFps,
    constraints: controls.getPerformanceConstraints(),
  };
}

export function useDevicePerformance(): {
  tier: DevicePerformanceTier;
  thermalState: ThermalState;
  batteryState: BatteryState;
  shouldReduceQuality: boolean;
} {
  const { state } = useAvatarMobileOptimizer();

  const shouldReduceQuality = useMemo(() => {
    return (
      state.performanceTier === "low" ||
      state.performanceTier === "critical" ||
      state.thermalState === "serious" ||
      state.thermalState === "critical" ||
      state.batteryState === "low" ||
      state.batteryState === "critical"
    );
  }, [state.performanceTier, state.thermalState, state.batteryState]);

  return {
    tier: state.performanceTier,
    thermalState: state.thermalState,
    batteryState: state.batteryState,
    shouldReduceQuality,
  };
}

export function useAnimationVisibility(): {
  isVisible: boolean;
  shouldAnimate: boolean;
  pause: () => void;
  resume: () => void;
} {
  const { state, controls } = useAvatarMobileOptimizer();

  const shouldAnimate = useMemo(() => {
    return state.isVisible && !state.isPaused && state.performanceTier !== "critical";
  }, [state.isVisible, state.isPaused, state.performanceTier]);

  return {
    isVisible: state.isVisible,
    shouldAnimate,
    pause: controls.pause,
    resume: controls.resume,
  };
}

export default useAvatarMobileOptimizer;
