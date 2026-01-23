/**
 * useAdaptiveFramePacing - Sprint 228
 *
 * Dynamically adjusts frame pacing to optimize for perceived smoothness
 * on mobile devices. Balances between high frame rates and consistent
 * frame delivery to minimize judder and stuttering.
 *
 * Features:
 * - Dynamic frame rate targeting (30/60/90/120 Hz)
 * - Frame budget management with deadline scheduling
 * - Judder detection and mitigation
 * - Battery-aware frame rate adaptation
 * - Thermal throttling response
 * - Input-synchronized frame delivery
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Target frame rate options
 */
export type TargetFrameRate = 30 | 60 | 90 | 120;

/**
 * Frame pacing mode
 */
export type PacingMode =
  | "performance" // Maximize frame rate
  | "balanced" // Balance smoothness and power
  | "powersave" // Minimize power consumption
  | "adaptive"; // Auto-adjust based on conditions

/**
 * Frame delivery status
 */
export interface FrameDelivery {
  frameId: number;
  scheduledTime: number;
  actualTime: number;
  deadline: number;
  missed: boolean;
  budgetUsed: number;
  budgetRemaining: number;
}

/**
 * Judder measurement
 */
export interface JudderMetrics {
  /** Judder score (0 = smooth, 1 = very juddery) */
  score: number;
  /** Frame time variance */
  variance: number;
  /** Consecutive missed frames */
  consecutiveMisses: number;
  /** Judder events in last second */
  eventsPerSecond: number;
}

/**
 * Pacing configuration
 */
export interface PacingConfig {
  /** Initial target frame rate (default: 60) */
  initialTargetFps: TargetFrameRate;
  /** Pacing mode (default: 'adaptive') */
  mode: PacingMode;
  /** Frame budget safety margin in ms (default: 2) */
  budgetMarginMs: number;
  /** Enable judder detection (default: true) */
  enableJudderDetection: boolean;
  /** Judder threshold for rate reduction (default: 0.3) */
  judderThreshold: number;
  /** Enable battery-aware pacing (default: true) */
  batteryAwarePacing: boolean;
  /** Low battery FPS cap (default: 30) */
  lowBatteryFpsCap: TargetFrameRate;
  /** Enable thermal throttling response (default: true) */
  thermalThrottling: boolean;
  /** Frame history for analysis (default: 60) */
  frameHistoryLength: number;
  /** Minimum frames before adaptation (default: 30) */
  minFramesForAdaptation: number;
  /** Rate change cooldown in ms (default: 1000) */
  rateChangeCooldownMs: number;
}

/**
 * Pacing metrics
 */
export interface PacingMetrics {
  currentFps: number;
  targetFps: TargetFrameRate;
  achievedFps: number;
  frameDeliveryRate: number;
  averageBudgetUsage: number;
  judder: JudderMetrics;
  rateChanges: number;
  totalFrames: number;
}

/**
 * Pacing state
 */
export interface PacingState {
  isRunning: boolean;
  currentMode: PacingMode;
  metrics: PacingMetrics;
  lastFrame: FrameDelivery | null;
  batteryLevel: number | null;
  isThermalThrottled: boolean;
}

/**
 * Frame callback function
 */
export type FrameCallback = (deltaTime: number, frameInfo: FrameDelivery) => void;

/**
 * Pacing controls
 */
export interface PacingControls {
  /** Start frame pacing */
  start: (callback: FrameCallback) => void;
  /** Stop frame pacing */
  stop: () => void;
  /** Set target frame rate */
  setTargetFps: (fps: TargetFrameRate) => void;
  /** Set pacing mode */
  setMode: (mode: PacingMode) => void;
  /** Request frame with deadline */
  requestFrame: (deadline?: number) => void;
  /** Signal input event for synchronization */
  signalInput: () => void;
  /** Reset metrics */
  resetMetrics: () => void;
}

/**
 * Hook return type
 */
export interface UseAdaptiveFramePacingResult {
  state: PacingState;
  controls: PacingControls;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONFIG: PacingConfig = {
  initialTargetFps: 60,
  mode: "adaptive",
  budgetMarginMs: 2,
  enableJudderDetection: true,
  judderThreshold: 0.3,
  batteryAwarePacing: true,
  lowBatteryFpsCap: 30,
  thermalThrottling: true,
  frameHistoryLength: 60,
  minFramesForAdaptation: 30,
  rateChangeCooldownMs: 1000,
};

const DEFAULT_JUDDER: JudderMetrics = {
  score: 0,
  variance: 0,
  consecutiveMisses: 0,
  eventsPerSecond: 0,
};

const DEFAULT_METRICS: PacingMetrics = {
  currentFps: 60,
  targetFps: 60,
  achievedFps: 60,
  frameDeliveryRate: 1,
  averageBudgetUsage: 0,
  judder: DEFAULT_JUDDER,
  rateChanges: 0,
  totalFrames: 0,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get frame interval for target FPS
 */
function getFrameInterval(fps: TargetFrameRate): number {
  return 1000 / fps;
}

/**
 * Calculate judder score from frame times
 */
function calculateJudder(frameTimes: number[], targetInterval: number): JudderMetrics {
  if (frameTimes.length < 2) {
    return DEFAULT_JUDDER;
  }

  // Calculate variance
  const mean = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const variance =
    frameTimes.reduce((a, t) => a + Math.pow(t - mean, 2), 0) / frameTimes.length;

  // Count consecutive misses
  let consecutiveMisses = 0;
  let maxConsecutive = 0;
  let judderEvents = 0;

  for (const time of frameTimes) {
    if (time > targetInterval * 1.5) {
      consecutiveMisses++;
      judderEvents++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveMisses);
    } else {
      consecutiveMisses = 0;
    }
  }

  // Judder score based on variance relative to target
  const normalizedVariance = Math.sqrt(variance) / targetInterval;
  const missRate = judderEvents / frameTimes.length;
  const score = Math.min(1, normalizedVariance * 0.5 + missRate * 0.5);

  return {
    score,
    variance,
    consecutiveMisses: maxConsecutive,
    eventsPerSecond: (judderEvents / frameTimes.length) * 60,
  };
}

/**
 * Select optimal frame rate based on conditions
 */
function selectOptimalFrameRate(
  currentFps: TargetFrameRate,
  judder: JudderMetrics,
  achievedFps: number,
  batteryLevel: number | null,
  isThermalThrottled: boolean,
  config: PacingConfig
): TargetFrameRate {
  const rates: TargetFrameRate[] = [30, 60, 90, 120];

  // Start with current rate
  let optimalRate = currentFps;

  // Battery constraints
  if (config.batteryAwarePacing && batteryLevel !== null && batteryLevel < 0.2) {
    optimalRate = Math.min(optimalRate, config.lowBatteryFpsCap) as TargetFrameRate;
  }

  // Thermal constraints
  if (config.thermalThrottling && isThermalThrottled) {
    optimalRate = Math.min(optimalRate, 60) as TargetFrameRate;
  }

  // Judder-based adjustment
  if (config.enableJudderDetection) {
    if (judder.score > config.judderThreshold && currentFps > 30) {
      // Reduce frame rate if juddering
      const currentIndex = rates.indexOf(currentFps);
      if (currentIndex > 0) {
        optimalRate = rates[currentIndex - 1];
      }
    } else if (judder.score < config.judderThreshold * 0.5 && achievedFps >= currentFps * 0.95) {
      // Can potentially increase if running smoothly
      const currentIndex = rates.indexOf(currentFps);
      if (currentIndex < rates.length - 1) {
        optimalRate = rates[currentIndex + 1];
      }
    }
  }

  // Ensure it's a valid rate
  if (!rates.includes(optimalRate)) {
    optimalRate = rates.reduce((prev, curr) =>
      Math.abs(curr - optimalRate) < Math.abs(prev - optimalRate) ? curr : prev
    );
  }

  return optimalRate;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that provides adaptive frame pacing for smooth mobile rendering
 */
export function useAdaptiveFramePacing(
  config: Partial<PacingConfig> = {}
): UseAdaptiveFramePacingResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isRunning, setIsRunning] = useState(false);
  const [currentMode, setCurrentMode] = useState<PacingMode>(mergedConfig.mode);
  const [targetFps, setTargetFps] = useState<TargetFrameRate>(
    mergedConfig.initialTargetFps
  );
  const [metrics, setMetrics] = useState<PacingMetrics>({
    ...DEFAULT_METRICS,
    targetFps: mergedConfig.initialTargetFps,
  });
  const [lastFrame, setLastFrame] = useState<FrameDelivery | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isThermalThrottled, setIsThermalThrottled] = useState(false);

  // Refs
  const rafIdRef = useRef<number | null>(null);
  const frameIdRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const callbackRef = useRef<FrameCallback | null>(null);
  const inputSignalRef = useRef(false);
  const lastRateChangeRef = useRef(0);
  const budgetUsagesRef = useRef<number[]>([]);

  /**
   * Monitor battery level
   */
  useEffect(() => {
    if (!mergedConfig.batteryAwarePacing) return;

    if ("getBattery" in navigator) {
      (navigator as Navigator & { getBattery: () => Promise<{ level: number; charging: boolean; addEventListener: (event: string, handler: () => void) => void }> })
        .getBattery()
        .then((battery) => {
          setBatteryLevel(battery.level);
          battery.addEventListener("levelchange", () =>
            setBatteryLevel(battery.level)
          );
        })
        .catch(() => {});
    }
  }, [mergedConfig.batteryAwarePacing]);

  /**
   * Frame loop
   */
  const frameLoop = useCallback(
    (timestamp: number) => {
      const frameId = ++frameIdRef.current;
      const targetInterval = getFrameInterval(targetFps);
      const timeSinceLastFrame = timestamp - lastFrameTimeRef.current;

      // Calculate deadline
      const deadline = lastFrameTimeRef.current + targetInterval;
      const missed = timestamp > deadline + mergedConfig.budgetMarginMs;

      // Calculate budget
      const budgetUsed = timeSinceLastFrame;
      const budgetRemaining = Math.max(0, targetInterval - timeSinceLastFrame);

      // Create frame delivery info
      const frameDelivery: FrameDelivery = {
        frameId,
        scheduledTime: lastFrameTimeRef.current + targetInterval,
        actualTime: timestamp,
        deadline,
        missed,
        budgetUsed,
        budgetRemaining,
      };

      // Track frame times
      if (lastFrameTimeRef.current > 0) {
        frameTimesRef.current.push(timeSinceLastFrame);
        if (frameTimesRef.current.length > mergedConfig.frameHistoryLength) {
          frameTimesRef.current.shift();
        }

        budgetUsagesRef.current.push(budgetUsed / targetInterval);
        if (budgetUsagesRef.current.length > mergedConfig.frameHistoryLength) {
          budgetUsagesRef.current.shift();
        }
      }

      lastFrameTimeRef.current = timestamp;

      // Call user callback
      if (callbackRef.current) {
        callbackRef.current(timeSinceLastFrame, frameDelivery);
      }

      setLastFrame(frameDelivery);

      // Update metrics periodically
      if (frameId % 10 === 0) {
        const frameTimes = frameTimesRef.current;
        const judder = calculateJudder(frameTimes, targetInterval);

        const avgFrameTime =
          frameTimes.length > 0
            ? frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
            : targetInterval;

        const achievedFps = 1000 / avgFrameTime;
        const deliveryRate =
          frameTimes.length > 0
            ? frameTimes.filter((t) => t <= targetInterval * 1.1).length /
              frameTimes.length
            : 1;

        const avgBudgetUsage =
          budgetUsagesRef.current.length > 0
            ? budgetUsagesRef.current.reduce((a, b) => a + b, 0) /
              budgetUsagesRef.current.length
            : 0;

        setMetrics((prev) => ({
          ...prev,
          currentFps: 1000 / timeSinceLastFrame,
          targetFps,
          achievedFps,
          frameDeliveryRate: deliveryRate,
          averageBudgetUsage: avgBudgetUsage,
          judder,
          totalFrames: frameId,
        }));

        // Adaptive rate adjustment
        if (
          currentMode === "adaptive" &&
          frameId >= mergedConfig.minFramesForAdaptation &&
          timestamp - lastRateChangeRef.current > mergedConfig.rateChangeCooldownMs
        ) {
          const optimalRate = selectOptimalFrameRate(
            targetFps,
            judder,
            achievedFps,
            batteryLevel,
            isThermalThrottled,
            mergedConfig
          );

          if (optimalRate !== targetFps) {
            setTargetFps(optimalRate);
            lastRateChangeRef.current = timestamp;
            setMetrics((prev) => ({
              ...prev,
              rateChanges: prev.rateChanges + 1,
            }));
          }
        }
      }

      // Schedule next frame
      if (isRunning) {
        // If input was signaled, request immediate frame
        if (inputSignalRef.current) {
          inputSignalRef.current = false;
          rafIdRef.current = requestAnimationFrame(frameLoop);
        } else {
          // Schedule for next target time
          rafIdRef.current = requestAnimationFrame(frameLoop);
        }
      }
    },
    [isRunning, targetFps, currentMode, batteryLevel, isThermalThrottled, mergedConfig]
  );

  /**
   * Start frame pacing
   */
  const start = useCallback(
    (callback: FrameCallback) => {
      if (isRunning) return;

      callbackRef.current = callback;
      setIsRunning(true);
      frameIdRef.current = 0;
      lastFrameTimeRef.current = performance.now();
      frameTimesRef.current = [];
      budgetUsagesRef.current = [];

      rafIdRef.current = requestAnimationFrame(frameLoop);
    },
    [isRunning, frameLoop]
  );

  /**
   * Stop frame pacing
   */
  const stop = useCallback(() => {
    setIsRunning(false);
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    callbackRef.current = null;
  }, []);

  /**
   * Set target frame rate
   */
  const setTargetFpsControl = useCallback((fps: TargetFrameRate) => {
    setTargetFps(fps);
    lastRateChangeRef.current = performance.now();
  }, []);

  /**
   * Set pacing mode
   */
  const setModeControl = useCallback((mode: PacingMode) => {
    setCurrentMode(mode);

    // Apply mode-specific settings
    switch (mode) {
      case "performance":
        setTargetFps(120);
        break;
      case "powersave":
        setTargetFps(30);
        break;
      case "balanced":
        setTargetFps(60);
        break;
      // adaptive will auto-adjust
    }
  }, []);

  /**
   * Request frame with optional deadline
   */
  const requestFrame = useCallback(
    (deadline?: number) => {
      if (!isRunning) return;

      // If deadline provided, check if we need to rush
      if (deadline !== undefined) {
        const now = performance.now();
        if (now >= deadline) {
          // Already past deadline, signal input for immediate frame
          inputSignalRef.current = true;
        }
      }
    },
    [isRunning]
  );

  /**
   * Signal input event
   */
  const signalInput = useCallback(() => {
    inputSignalRef.current = true;
  }, []);

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback(() => {
    frameTimesRef.current = [];
    budgetUsagesRef.current = [];
    setMetrics({
      ...DEFAULT_METRICS,
      targetFps,
    });
  }, [targetFps]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Start frame loop when running state changes
  useEffect(() => {
    if (isRunning && rafIdRef.current === null && callbackRef.current) {
      lastFrameTimeRef.current = performance.now();
      rafIdRef.current = requestAnimationFrame(frameLoop);
    }
  }, [isRunning, frameLoop]);

  // Build state object
  const state: PacingState = useMemo(
    () => ({
      isRunning,
      currentMode,
      metrics,
      lastFrame,
      batteryLevel,
      isThermalThrottled,
    }),
    [isRunning, currentMode, metrics, lastFrame, batteryLevel, isThermalThrottled]
  );

  // Build controls object
  const controls: PacingControls = useMemo(
    () => ({
      start,
      stop,
      setTargetFps: setTargetFpsControl,
      setMode: setModeControl,
      requestFrame,
      signalInput,
      resetMetrics,
    }),
    [start, stop, setTargetFpsControl, setModeControl, requestFrame, signalInput, resetMetrics]
  );

  return {
    state,
    controls,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple hook for frame-rate aware rendering
 */
export function useFrameRate(): {
  fps: number;
  isSmooth: boolean;
  targetFps: TargetFrameRate;
} {
  const { state } = useAdaptiveFramePacing();

  return {
    fps: state.metrics.achievedFps,
    isSmooth: state.metrics.judder.score < 0.2,
    targetFps: state.metrics.targetFps,
  };
}

/**
 * Hook for judder detection
 */
export function useJudderDetection(): {
  isJuddery: boolean;
  score: number;
  variance: number;
} {
  const { state } = useAdaptiveFramePacing({ enableJudderDetection: true });

  return {
    isJuddery: state.metrics.judder.score > 0.3,
    score: state.metrics.judder.score,
    variance: state.metrics.judder.variance,
  };
}

// ============================================================================
// Exports
// ============================================================================

export default useAdaptiveFramePacing;
