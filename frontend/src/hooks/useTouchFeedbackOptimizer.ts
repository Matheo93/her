/**
 * useTouchFeedbackOptimizer - Optimized touch feedback for mobile interactions
 *
 * Sprint 1588 - Provides immediate, responsive feedback for touch interactions
 * with haptic patterns, visual effects, and latency optimization.
 *
 * Features:
 * - Haptic feedback patterns (tap, press, success, error, etc.)
 * - Visual touch ripple effects
 * - Touch prediction for reduced perceived latency
 * - Gesture-specific feedback
 * - Battery-aware haptic intensity
 * - Accessibility considerations
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Haptic pattern types
export type HapticPattern =
  | "light_tap" // Brief, light vibration
  | "medium_tap" // Standard tap
  | "heavy_tap" // Strong tap
  | "double_tap" // Two quick taps
  | "long_press" // Extended vibration
  | "success" // Positive feedback pattern
  | "error" // Negative feedback pattern
  | "warning" // Attention-getting pattern
  | "selection" // Item selection
  | "impact_light" // Light impact
  | "impact_medium" // Medium impact
  | "impact_heavy"; // Heavy impact

export type FeedbackType =
  | "haptic" // Vibration only
  | "visual" // Visual ripple only
  | "audio" // Sound only
  | "combined"; // All feedback types

export interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
  force?: number; // 0-1 if available
  radiusX?: number;
  radiusY?: number;
}

export interface RippleEffect {
  id: string;
  x: number;
  y: number;
  startTime: number;
  duration: number;
  maxRadius: number;
  color: string;
  opacity: number;
}

export interface FeedbackEvent {
  type: FeedbackType;
  pattern: HapticPattern;
  point: TouchPoint;
  timestamp: number;
  predicted: boolean;
}

export interface TouchFeedbackState {
  isActive: boolean;
  lastTouch: TouchPoint | null;
  activeRipples: RippleEffect[];
  hapticSupported: boolean;
  currentPattern: HapticPattern | null;
  feedbackQueue: FeedbackEvent[];
}

export interface FeedbackMetrics {
  totalFeedbacks: number;
  hapticCount: number;
  visualCount: number;
  averageLatency: number;
  predictedTouches: number;
  missedFeedbacks: number;
}

export interface TouchFeedbackConfig {
  enabled: boolean;
  hapticEnabled: boolean;
  visualEnabled: boolean;
  audioEnabled: boolean;
  hapticIntensity: number; // 0-1
  rippleDuration: number; // ms
  rippleMaxRadius: number; // px
  rippleColor: string;
  rippleOpacity: number; // 0-1
  predictionEnabled: boolean;
  predictionThreshold: number; // ms
  batteryAware: boolean;
  lowPowerIntensity: number; // 0-1 intensity in low power mode
  accessibilityMode: boolean;
}

export interface TouchFeedbackControls {
  trigger: (
    pattern: HapticPattern,
    point?: TouchPoint,
    feedbackType?: FeedbackType
  ) => void;
  triggerRipple: (x: number, y: number, options?: Partial<RippleEffect>) => void;
  cancelRipple: (id: string) => void;
  clearAllRipples: () => void;
  setHapticIntensity: (intensity: number) => void;
  registerTouchArea: (
    element: HTMLElement,
    pattern: HapticPattern
  ) => () => void;
  updateConfig: (config: Partial<TouchFeedbackConfig>) => void;
  checkHapticSupport: () => boolean;
}

export interface UseTouchFeedbackOptimizerResult {
  state: TouchFeedbackState;
  metrics: FeedbackMetrics;
  controls: TouchFeedbackControls;
  config: TouchFeedbackConfig;
}

// Haptic pattern definitions (duration in ms, intensity 0-1)
const HAPTIC_PATTERNS: Record<HapticPattern, { durations: number[]; intensities: number[] }> = {
  light_tap: { durations: [10], intensities: [0.3] },
  medium_tap: { durations: [15], intensities: [0.6] },
  heavy_tap: { durations: [25], intensities: [1.0] },
  double_tap: { durations: [10, 50, 10], intensities: [0.5, 0, 0.5] },
  long_press: { durations: [100], intensities: [0.7] },
  success: { durations: [10, 30, 15], intensities: [0.3, 0, 0.8] },
  error: { durations: [50, 30, 50], intensities: [0.8, 0, 0.8] },
  warning: { durations: [30, 20, 30], intensities: [0.6, 0, 0.6] },
  selection: { durations: [5], intensities: [0.4] },
  impact_light: { durations: [8], intensities: [0.2] },
  impact_medium: { durations: [12], intensities: [0.5] },
  impact_heavy: { durations: [20], intensities: [0.9] },
};

const DEFAULT_CONFIG: TouchFeedbackConfig = {
  enabled: true,
  hapticEnabled: true,
  visualEnabled: true,
  audioEnabled: false,
  hapticIntensity: 0.7,
  rippleDuration: 400,
  rippleMaxRadius: 150,
  rippleColor: "rgba(255, 255, 255, 0.3)",
  rippleOpacity: 0.6,
  predictionEnabled: true,
  predictionThreshold: 50,
  batteryAware: true,
  lowPowerIntensity: 0.3,
  accessibilityMode: false,
};

// Generate unique ID
function generateId(): string {
  return `ripple-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useTouchFeedbackOptimizer(
  initialConfig: Partial<TouchFeedbackConfig> = {}
): UseTouchFeedbackOptimizerResult {
  const [config, setConfig] = useState<TouchFeedbackConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [state, setState] = useState<TouchFeedbackState>({
    isActive: false,
    lastTouch: null,
    activeRipples: [],
    hapticSupported: false,
    currentPattern: null,
    feedbackQueue: [],
  });

  const [metrics, setMetrics] = useState<FeedbackMetrics>({
    totalFeedbacks: 0,
    hapticCount: 0,
    visualCount: 0,
    averageLatency: 0,
    predictedTouches: 0,
    missedFeedbacks: 0,
  });

  // Refs
  const latencyHistoryRef = useRef<number[]>([]);
  const touchAreasRef = useRef<Map<HTMLElement, HapticPattern>>(new Map());
  const isLowPowerRef = useRef(false);
  const animationRef = useRef<number | null>(null);

  // Check haptic support
  const checkHapticSupport = useCallback((): boolean => {
    return "vibrate" in navigator;
  }, []);

  // Initialize haptic support check
  useEffect(() => {
    const supported = checkHapticSupport();
    setState((prev) => ({ ...prev, hapticSupported: supported }));
  }, [checkHapticSupport]);

  // Monitor battery for power-aware mode
  useEffect(() => {
    if (!config.batteryAware) return;

    const checkBattery = async () => {
      try {
        // @ts-ignore - Battery API
        const battery = await navigator.getBattery?.();
        if (battery) {
          const updatePowerMode = () => {
            isLowPowerRef.current = battery.level < 0.2 && !battery.charging;
          };

          updatePowerMode();
          battery.addEventListener("levelchange", updatePowerMode);
          battery.addEventListener("chargingchange", updatePowerMode);

          return () => {
            battery.removeEventListener("levelchange", updatePowerMode);
            battery.removeEventListener("chargingchange", updatePowerMode);
          };
        }
      } catch {
        // Battery API not supported
      }
    };

    checkBattery();
  }, [config.batteryAware]);

  // Trigger haptic feedback
  const triggerHaptic = useCallback(
    (pattern: HapticPattern) => {
      if (!config.hapticEnabled || !state.hapticSupported) return;

      const patternDef = HAPTIC_PATTERNS[pattern];
      if (!patternDef) return;

      // Calculate effective intensity
      let intensity = config.hapticIntensity;
      if (isLowPowerRef.current) {
        intensity = config.lowPowerIntensity;
      }

      // Create vibration pattern
      const vibrationPattern: number[] = [];
      patternDef.durations.forEach((duration, i) => {
        const adjustedDuration = Math.round(
          duration * patternDef.intensities[i] * intensity
        );
        vibrationPattern.push(adjustedDuration);
      });

      try {
        navigator.vibrate(vibrationPattern);
        setState((prev) => ({ ...prev, currentPattern: pattern }));

        setMetrics((prev) => ({
          ...prev,
          hapticCount: prev.hapticCount + 1,
        }));
      } catch (error) {
        setMetrics((prev) => ({
          ...prev,
          missedFeedbacks: prev.missedFeedbacks + 1,
        }));
      }
    },
    [config.hapticEnabled, config.hapticIntensity, config.lowPowerIntensity, state.hapticSupported]
  );

  // Trigger ripple effect
  const triggerRipple = useCallback(
    (x: number, y: number, options?: Partial<RippleEffect>) => {
      if (!config.visualEnabled) return;

      const ripple: RippleEffect = {
        id: generateId(),
        x,
        y,
        startTime: Date.now(),
        duration: options?.duration || config.rippleDuration,
        maxRadius: options?.maxRadius || config.rippleMaxRadius,
        color: options?.color || config.rippleColor,
        opacity: options?.opacity || config.rippleOpacity,
      };

      setState((prev) => ({
        ...prev,
        activeRipples: [...prev.activeRipples, ripple],
      }));

      setMetrics((prev) => ({
        ...prev,
        visualCount: prev.visualCount + 1,
      }));

      // Auto-remove after duration
      setTimeout(() => {
        setState((prev) => ({
          ...prev,
          activeRipples: prev.activeRipples.filter((r) => r.id !== ripple.id),
        }));
      }, ripple.duration);
    },
    [config.visualEnabled, config.rippleDuration, config.rippleMaxRadius, config.rippleColor, config.rippleOpacity]
  );

  // Cancel specific ripple
  const cancelRipple = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      activeRipples: prev.activeRipples.filter((r) => r.id !== id),
    }));
  }, []);

  // Clear all ripples
  const clearAllRipples = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeRipples: [],
    }));
  }, []);

  // Main trigger function
  const trigger = useCallback(
    (
      pattern: HapticPattern,
      point?: TouchPoint,
      feedbackType: FeedbackType = "combined"
    ) => {
      if (!config.enabled) return;

      const now = Date.now();
      const touchPoint: TouchPoint = point || {
        x: 0,
        y: 0,
        timestamp: now,
      };

      // Track latency
      const latency = now - touchPoint.timestamp;
      latencyHistoryRef.current.push(latency);
      if (latencyHistoryRef.current.length > 50) {
        latencyHistoryRef.current.shift();
      }

      // Update last touch
      setState((prev) => ({
        ...prev,
        isActive: true,
        lastTouch: touchPoint,
      }));

      // Trigger appropriate feedback
      if (feedbackType === "haptic" || feedbackType === "combined") {
        triggerHaptic(pattern);
      }

      if (feedbackType === "visual" || feedbackType === "combined") {
        triggerRipple(touchPoint.x, touchPoint.y);
      }

      // Update metrics
      setMetrics((prev) => ({
        ...prev,
        totalFeedbacks: prev.totalFeedbacks + 1,
        averageLatency:
          latencyHistoryRef.current.reduce((a, b) => a + b, 0) /
          latencyHistoryRef.current.length,
      }));

      // Reset active state
      setTimeout(() => {
        setState((prev) => ({
          ...prev,
          isActive: false,
          currentPattern: null,
        }));
      }, 100);
    },
    [config.enabled, triggerHaptic, triggerRipple]
  );

  // Set haptic intensity
  const setHapticIntensity = useCallback((intensity: number) => {
    setConfig((prev) => ({
      ...prev,
      hapticIntensity: Math.max(0, Math.min(1, intensity)),
    }));
  }, []);

  // Register touch area for automatic feedback
  const registerTouchArea = useCallback(
    (element: HTMLElement, pattern: HapticPattern): (() => void) => {
      touchAreasRef.current.set(element, pattern);

      const handleTouchStart = (e: TouchEvent) => {
        const touch = e.touches[0];
        if (touch) {
          const point: TouchPoint = {
            x: touch.clientX,
            y: touch.clientY,
            timestamp: Date.now(),
            force: (touch as unknown as { force?: number }).force,
            radiusX: touch.radiusX,
            radiusY: touch.radiusY,
          };

          trigger(pattern, point);
        }
      };

      element.addEventListener("touchstart", handleTouchStart, { passive: true });

      return () => {
        element.removeEventListener("touchstart", handleTouchStart);
        touchAreasRef.current.delete(element);
      };
    },
    [trigger]
  );

  // Update config
  const updateConfig = useCallback((updates: Partial<TouchFeedbackConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const controls: TouchFeedbackControls = useMemo(
    () => ({
      trigger,
      triggerRipple,
      cancelRipple,
      clearAllRipples,
      setHapticIntensity,
      registerTouchArea,
      updateConfig,
      checkHapticSupport,
    }),
    [
      trigger,
      triggerRipple,
      cancelRipple,
      clearAllRipples,
      setHapticIntensity,
      registerTouchArea,
      updateConfig,
      checkHapticSupport,
    ]
  );

  return {
    state,
    metrics,
    controls,
    config,
  };
}

// Sub-hook: Simple haptic trigger
export function useHapticFeedback(
  config?: Partial<TouchFeedbackConfig>
): {
  trigger: (pattern: HapticPattern) => void;
  isSupported: boolean;
} {
  const { state, controls } = useTouchFeedbackOptimizer(config);

  const simpleTrigger = useCallback(
    (pattern: HapticPattern) => {
      controls.trigger(pattern, undefined, "haptic");
    },
    [controls]
  );

  return {
    trigger: simpleTrigger,
    isSupported: state.hapticSupported,
  };
}

// Sub-hook: Touch ripple effect
export function useTouchRipple(
  config?: Partial<TouchFeedbackConfig>
): {
  ripples: RippleEffect[];
  trigger: (x: number, y: number) => void;
  clear: () => void;
} {
  const { state, controls } = useTouchFeedbackOptimizer(config);

  return {
    ripples: state.activeRipples,
    trigger: controls.triggerRipple,
    clear: controls.clearAllRipples,
  };
}

export default useTouchFeedbackOptimizer;
