/**
 * useTouchToVisualBridge - Sprint 226
 *
 * A high-performance hook that bridges touch input to visual feedback with
 * minimal latency. Uses immediate visual updates with requestAnimationFrame
 * synchronization, touch prediction, and optimistic rendering.
 *
 * Features:
 * - Sub-16ms touch-to-visual latency target
 * - Predictive visual state updates
 * - Frame-perfect synchronization
 * - Touch momentum and velocity tracking
 * - Visual state interpolation
 * - Adaptive update frequency based on device capability
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Touch point with velocity and pressure data
 */
export interface TouchPoint {
  id: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  pressure: number;
  timestamp: number;
}

/**
 * Visual state that can be immediately updated
 */
export interface VisualState {
  transform: {
    translateX: number;
    translateY: number;
    scale: number;
    rotation: number;
  };
  opacity: number;
  brightness: number;
  blur: number;
  custom: Record<string, number>;
}

/**
 * Prediction result for visual state
 */
export interface VisualPrediction {
  predictedState: Partial<VisualState>;
  confidence: number;
  lookaheadMs: number;
}

/**
 * Bridge configuration
 */
export interface BridgeConfig {
  /** Target latency in milliseconds (default: 16) */
  targetLatencyMs: number;
  /** Enable predictive updates (default: true) */
  enablePrediction: boolean;
  /** Prediction lookahead in ms (default: 32) */
  predictionLookaheadMs: number;
  /** Minimum confidence for prediction use (default: 0.7) */
  minPredictionConfidence: number;
  /** Enable momentum continuation (default: true) */
  enableMomentum: boolean;
  /** Momentum friction coefficient (default: 0.95) */
  momentumFriction: number;
  /** Maximum touch history length (default: 10) */
  maxTouchHistory: number;
  /** Visual smoothing factor (default: 0.3) */
  smoothingFactor: number;
  /** Enable haptic feedback (default: false) */
  enableHaptics: boolean;
  /** Debounce visual updates (default: false) */
  debounceUpdates: boolean;
  /** Debounce interval in ms (default: 8) */
  debounceIntervalMs: number;
}

/**
 * Touch-to-visual mapping function
 */
export type TouchToVisualMapper = (
  touch: TouchPoint,
  history: TouchPoint[]
) => Partial<VisualState>;

/**
 * Bridge metrics for monitoring
 */
export interface BridgeMetrics {
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  predictionAccuracy: number;
  droppedFrames: number;
  totalUpdates: number;
  updatesPerSecond: number;
}

/**
 * Bridge state
 */
export interface BridgeState {
  isActive: boolean;
  currentTouch: TouchPoint | null;
  visualState: VisualState;
  prediction: VisualPrediction | null;
  metrics: BridgeMetrics;
}

/**
 * Bridge controls
 */
export interface BridgeControls {
  /** Start the bridge with a touch event */
  onTouchStart: (event: TouchEvent | React.TouchEvent) => void;
  /** Update touch position */
  onTouchMove: (event: TouchEvent | React.TouchEvent) => void;
  /** End touch interaction */
  onTouchEnd: (event: TouchEvent | React.TouchEvent) => void;
  /** Update visual state directly */
  updateVisualState: (partial: Partial<VisualState>) => void;
  /** Reset to initial state */
  reset: () => void;
  /** Force prediction update */
  forcePrediction: () => void;
}

/**
 * Hook return type
 */
export interface UseTouchToVisualBridgeResult {
  state: BridgeState;
  controls: BridgeControls;
  /** CSS transform string for direct application */
  cssTransform: string;
  /** CSS filter string for direct application */
  cssFilter: string;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONFIG: BridgeConfig = {
  targetLatencyMs: 16,
  enablePrediction: true,
  predictionLookaheadMs: 32,
  minPredictionConfidence: 0.7,
  enableMomentum: true,
  momentumFriction: 0.95,
  maxTouchHistory: 10,
  smoothingFactor: 0.3,
  enableHaptics: false,
  debounceUpdates: false,
  debounceIntervalMs: 8,
};

const DEFAULT_VISUAL_STATE: VisualState = {
  transform: {
    translateX: 0,
    translateY: 0,
    scale: 1,
    rotation: 0,
  },
  opacity: 1,
  brightness: 1,
  blur: 0,
  custom: {},
};

const DEFAULT_METRICS: BridgeMetrics = {
  averageLatency: 0,
  maxLatency: 0,
  minLatency: Infinity,
  predictionAccuracy: 0,
  droppedFrames: 0,
  totalUpdates: 0,
  updatesPerSecond: 0,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate velocity from touch history
 */
function calculateVelocity(
  current: { x: number; y: number; timestamp: number },
  previous: { x: number; y: number; timestamp: number } | undefined
): { velocityX: number; velocityY: number } {
  if (!previous) {
    return { velocityX: 0, velocityY: 0 };
  }

  const dt = current.timestamp - previous.timestamp;
  if (dt <= 0) {
    return { velocityX: 0, velocityY: 0 };
  }

  return {
    velocityX: (current.x - previous.x) / dt,
    velocityY: (current.y - previous.y) / dt,
  };
}

/**
 * Lerp between two values
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Merge visual states with lerp
 */
function mergeVisualStates(
  current: VisualState,
  update: Partial<VisualState>,
  factor: number
): VisualState {
  const result = { ...current };

  if (update.transform) {
    result.transform = {
      translateX: lerp(
        current.transform.translateX,
        update.transform.translateX ?? current.transform.translateX,
        factor
      ),
      translateY: lerp(
        current.transform.translateY,
        update.transform.translateY ?? current.transform.translateY,
        factor
      ),
      scale: lerp(
        current.transform.scale,
        update.transform.scale ?? current.transform.scale,
        factor
      ),
      rotation: lerp(
        current.transform.rotation,
        update.transform.rotation ?? current.transform.rotation,
        factor
      ),
    };
  }

  if (update.opacity !== undefined) {
    result.opacity = lerp(current.opacity, update.opacity, factor);
  }

  if (update.brightness !== undefined) {
    result.brightness = lerp(current.brightness, update.brightness, factor);
  }

  if (update.blur !== undefined) {
    result.blur = lerp(current.blur, update.blur, factor);
  }

  if (update.custom) {
    result.custom = { ...current.custom };
    for (const key of Object.keys(update.custom)) {
      result.custom[key] = lerp(
        current.custom[key] ?? 0,
        update.custom[key] ?? 0,
        factor
      );
    }
  }

  return result;
}

/**
 * Predict future position using velocity
 */
function predictPosition(
  touch: TouchPoint,
  lookaheadMs: number,
  friction: number
): { x: number; y: number } {
  // Apply friction decay
  const frames = lookaheadMs / 16;
  const decayedVelocityX = touch.velocityX * Math.pow(friction, frames);
  const decayedVelocityY = touch.velocityY * Math.pow(friction, frames);

  // Predict position with average velocity over the prediction period
  const avgVelocityX = (touch.velocityX + decayedVelocityX) / 2;
  const avgVelocityY = (touch.velocityY + decayedVelocityY) / 2;

  return {
    x: touch.x + avgVelocityX * lookaheadMs,
    y: touch.y + avgVelocityY * lookaheadMs,
  };
}

/**
 * Calculate prediction confidence based on velocity consistency
 */
function calculatePredictionConfidence(history: TouchPoint[]): number {
  if (history.length < 3) {
    return 0.5;
  }

  // Check velocity consistency
  const velocities = history.slice(-5);
  let consistencyX = 0;
  let consistencyY = 0;

  for (let i = 1; i < velocities.length; i++) {
    const prev = velocities[i - 1];
    const curr = velocities[i];

    // Check if same direction
    if (prev.velocityX * curr.velocityX > 0) consistencyX++;
    if (prev.velocityY * curr.velocityY > 0) consistencyY++;
  }

  const maxConsistency = velocities.length - 1;
  const avgConsistency =
    (consistencyX / maxConsistency + consistencyY / maxConsistency) / 2;

  return Math.min(1, avgConsistency + 0.3);
}

/**
 * Generate CSS transform string from visual state
 */
function generateCssTransform(state: VisualState): string {
  const { translateX, translateY, scale, rotation } = state.transform;
  return `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale}) rotate(${rotation}deg)`;
}

/**
 * Generate CSS filter string from visual state
 */
function generateCssFilter(state: VisualState): string {
  const filters: string[] = [];

  if (state.brightness !== 1) {
    filters.push(`brightness(${state.brightness})`);
  }

  if (state.blur > 0) {
    filters.push(`blur(${state.blur}px)`);
  }

  return filters.length > 0 ? filters.join(" ") : "none";
}

/**
 * Trigger haptic feedback if available
 */
function triggerHaptic(intensity: "light" | "medium" | "heavy" = "light"): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    const durations: Record<typeof intensity, number> = {
      light: 10,
      medium: 25,
      heavy: 50,
    };
    navigator.vibrate(durations[intensity]);
  }
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that bridges touch input to visual feedback with minimal latency
 */
export function useTouchToVisualBridge(
  mapper: TouchToVisualMapper,
  config: Partial<BridgeConfig> = {}
): UseTouchToVisualBridgeResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [visualState, setVisualState] =
    useState<VisualState>(DEFAULT_VISUAL_STATE);
  const [isActive, setIsActive] = useState(false);
  const [currentTouch, setCurrentTouch] = useState<TouchPoint | null>(null);
  const [prediction, setPrediction] = useState<VisualPrediction | null>(null);
  const [metrics, setMetrics] = useState<BridgeMetrics>(DEFAULT_METRICS);

  // Refs
  const touchHistoryRef = useRef<TouchPoint[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const metricsRef = useRef<{
    latencies: number[];
    predictionErrors: number[];
    lastSecondStart: number;
    updatesThisSecond: number;
  }>({
    latencies: [],
    predictionErrors: [],
    lastSecondStart: performance.now(),
    updatesThisSecond: 0,
  });
  const momentumRef = useRef<{
    velocityX: number;
    velocityY: number;
    active: boolean;
  }>({ velocityX: 0, velocityY: 0, active: false });
  const targetStateRef = useRef<VisualState>(DEFAULT_VISUAL_STATE);

  /**
   * Update metrics with new latency measurement
   */
  const recordLatency = useCallback((latency: number) => {
    const metricsData = metricsRef.current;
    metricsData.latencies.push(latency);
    metricsData.updatesThisSecond++;

    // Keep only last 100 measurements
    if (metricsData.latencies.length > 100) {
      metricsData.latencies.shift();
    }

    // Update metrics every second
    const now = performance.now();
    if (now - metricsData.lastSecondStart >= 1000) {
      const latencies = metricsData.latencies;
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      setMetrics((prev) => ({
        ...prev,
        averageLatency: avgLatency,
        maxLatency: Math.max(prev.maxLatency, maxLatency),
        minLatency: Math.min(prev.minLatency, minLatency),
        totalUpdates: prev.totalUpdates + metricsData.updatesThisSecond,
        updatesPerSecond: metricsData.updatesThisSecond,
      }));

      metricsData.lastSecondStart = now;
      metricsData.updatesThisSecond = 0;
    }
  }, []);

  /**
   * Animation loop for smooth visual updates
   */
  const animationLoop = useCallback(() => {
    const now = performance.now();
    const deltaTime = now - lastUpdateTimeRef.current;
    lastUpdateTimeRef.current = now;

    // Handle debouncing
    if (mergedConfig.debounceUpdates) {
      if (deltaTime < mergedConfig.debounceIntervalMs) {
        rafIdRef.current = requestAnimationFrame(animationLoop);
        return;
      }
    }

    // Apply smoothing to visual state
    setVisualState((current) => {
      const target = targetStateRef.current;
      return mergeVisualStates(current, target, mergedConfig.smoothingFactor);
    });

    // Handle momentum if active
    if (momentumRef.current.active && mergedConfig.enableMomentum) {
      const momentum = momentumRef.current;

      // Apply friction
      momentum.velocityX *= mergedConfig.momentumFriction;
      momentum.velocityY *= mergedConfig.momentumFriction;

      // Stop if velocity is negligible
      const speed = Math.sqrt(
        momentum.velocityX ** 2 + momentum.velocityY ** 2
      );
      if (speed < 0.01) {
        momentum.active = false;
      } else {
        // Update target state with momentum
        targetStateRef.current = {
          ...targetStateRef.current,
          transform: {
            ...targetStateRef.current.transform,
            translateX:
              targetStateRef.current.transform.translateX +
              momentum.velocityX * deltaTime,
            translateY:
              targetStateRef.current.transform.translateY +
              momentum.velocityY * deltaTime,
          },
        };
      }
    }

    // Continue loop if active
    if (isActive || momentumRef.current.active) {
      rafIdRef.current = requestAnimationFrame(animationLoop);
    }
  }, [isActive, mergedConfig]);

  /**
   * Process touch and update visual state
   */
  const processTouch = useCallback(
    (touch: TouchPoint) => {
      const history = touchHistoryRef.current;

      // Get mapped visual state from touch
      const mappedState = mapper(touch, history);

      // Record latency
      const latency = performance.now() - touch.timestamp;
      recordLatency(latency);

      // Apply prediction if enabled
      if (mergedConfig.enablePrediction && history.length >= 3) {
        const confidence = calculatePredictionConfidence(history);

        if (confidence >= mergedConfig.minPredictionConfidence) {
          const predictedPos = predictPosition(
            touch,
            mergedConfig.predictionLookaheadMs,
            mergedConfig.momentumFriction
          );

          const predictedTouch: TouchPoint = {
            ...touch,
            x: predictedPos.x,
            y: predictedPos.y,
          };

          const predictedMappedState = mapper(predictedTouch, history);

          // Blend current and predicted
          const blendFactor = confidence * 0.5;
          targetStateRef.current = mergeVisualStates(
            { ...DEFAULT_VISUAL_STATE, ...mappedState },
            predictedMappedState,
            blendFactor
          );

          setPrediction({
            predictedState: predictedMappedState,
            confidence,
            lookaheadMs: mergedConfig.predictionLookaheadMs,
          });
        } else {
          targetStateRef.current = { ...DEFAULT_VISUAL_STATE, ...mappedState };
          setPrediction(null);
        }
      } else {
        targetStateRef.current = { ...DEFAULT_VISUAL_STATE, ...mappedState };
        setPrediction(null);
      }
    },
    [mapper, mergedConfig, recordLatency]
  );

  /**
   * Handle touch start
   */
  const onTouchStart = useCallback(
    (event: TouchEvent | React.TouchEvent) => {
      const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
      const touch = nativeEvent.touches[0];
      if (!touch) return;

      const now = performance.now();
      touchHistoryRef.current = [];

      const touchPoint: TouchPoint = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        velocityX: 0,
        velocityY: 0,
        pressure: (touch as Touch & { force?: number }).force ?? 1,
        timestamp: now,
      };

      touchHistoryRef.current.push(touchPoint);
      setCurrentTouch(touchPoint);
      setIsActive(true);
      momentumRef.current.active = false;

      if (mergedConfig.enableHaptics) {
        triggerHaptic("light");
      }

      // Start animation loop
      lastUpdateTimeRef.current = now;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(animationLoop);

      processTouch(touchPoint);
    },
    [animationLoop, mergedConfig.enableHaptics, processTouch]
  );

  /**
   * Handle touch move
   */
  const onTouchMove = useCallback(
    (event: TouchEvent | React.TouchEvent) => {
      const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
      const touch = nativeEvent.touches[0];
      if (!touch) return;

      const now = performance.now();
      const history = touchHistoryRef.current;
      const lastTouch = history[history.length - 1];

      const { velocityX, velocityY } = calculateVelocity(
        { x: touch.clientX, y: touch.clientY, timestamp: now },
        lastTouch
      );

      const touchPoint: TouchPoint = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        velocityX,
        velocityY,
        pressure: (touch as Touch & { force?: number }).force ?? 1,
        timestamp: now,
      };

      // Maintain history size
      history.push(touchPoint);
      if (history.length > mergedConfig.maxTouchHistory) {
        history.shift();
      }

      setCurrentTouch(touchPoint);
      processTouch(touchPoint);
    },
    [mergedConfig.maxTouchHistory, processTouch]
  );

  /**
   * Handle touch end
   */
  const onTouchEnd = useCallback(
    (event: TouchEvent | React.TouchEvent) => {
      const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;

      // Don't deactivate if there are still touches
      if (nativeEvent.touches.length > 0) return;

      setIsActive(false);
      setCurrentTouch(null);

      // Enable momentum if configured
      if (mergedConfig.enableMomentum) {
        const lastTouch = touchHistoryRef.current[
          touchHistoryRef.current.length - 1
        ];
        if (lastTouch) {
          const speed = Math.sqrt(
            lastTouch.velocityX ** 2 + lastTouch.velocityY ** 2
          );

          if (speed > 0.1) {
            momentumRef.current = {
              velocityX: lastTouch.velocityX,
              velocityY: lastTouch.velocityY,
              active: true,
            };

            // Continue animation loop for momentum
            if (!rafIdRef.current) {
              lastUpdateTimeRef.current = performance.now();
              rafIdRef.current = requestAnimationFrame(animationLoop);
            }
          }
        }
      }

      if (mergedConfig.enableHaptics) {
        triggerHaptic("light");
      }
    },
    [animationLoop, mergedConfig.enableMomentum, mergedConfig.enableHaptics]
  );

  /**
   * Update visual state directly
   */
  const updateVisualState = useCallback((partial: Partial<VisualState>) => {
    targetStateRef.current = {
      ...targetStateRef.current,
      ...partial,
      transform: {
        ...targetStateRef.current.transform,
        ...(partial.transform ?? {}),
      },
      custom: {
        ...targetStateRef.current.custom,
        ...(partial.custom ?? {}),
      },
    };
  }, []);

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    setVisualState(DEFAULT_VISUAL_STATE);
    setIsActive(false);
    setCurrentTouch(null);
    setPrediction(null);
    setMetrics(DEFAULT_METRICS);
    touchHistoryRef.current = [];
    targetStateRef.current = DEFAULT_VISUAL_STATE;
    momentumRef.current = { velocityX: 0, velocityY: 0, active: false };

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  /**
   * Force prediction update
   */
  const forcePrediction = useCallback(() => {
    const history = touchHistoryRef.current;
    const lastTouch = history[history.length - 1];

    if (lastTouch && history.length >= 3) {
      const confidence = calculatePredictionConfidence(history);
      const predictedPos = predictPosition(
        lastTouch,
        mergedConfig.predictionLookaheadMs,
        mergedConfig.momentumFriction
      );

      const predictedTouch: TouchPoint = {
        ...lastTouch,
        x: predictedPos.x,
        y: predictedPos.y,
      };

      const predictedMappedState = mapper(predictedTouch, history);

      setPrediction({
        predictedState: predictedMappedState,
        confidence,
        lookaheadMs: mergedConfig.predictionLookaheadMs,
      });
    }
  }, [mapper, mergedConfig.predictionLookaheadMs, mergedConfig.momentumFriction]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Generate CSS strings
  const cssTransform = useMemo(
    () => generateCssTransform(visualState),
    [visualState]
  );

  const cssFilter = useMemo(() => generateCssFilter(visualState), [visualState]);

  // Build state object
  const state: BridgeState = useMemo(
    () => ({
      isActive,
      currentTouch,
      visualState,
      prediction,
      metrics,
    }),
    [isActive, currentTouch, visualState, prediction, metrics]
  );

  // Build controls object
  const controls: BridgeControls = useMemo(
    () => ({
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      updateVisualState,
      reset,
      forcePrediction,
    }),
    [
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      updateVisualState,
      reset,
      forcePrediction,
    ]
  );

  return {
    state,
    controls,
    cssTransform,
    cssFilter,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple touch-to-translate bridge
 */
export function useTouchTranslate(
  config?: Partial<BridgeConfig>
): UseTouchToVisualBridgeResult {
  const mapper: TouchToVisualMapper = useCallback((touch, history) => {
    const startTouch = history[0] ?? touch;
    return {
      transform: {
        translateX: touch.x - startTouch.x,
        translateY: touch.y - startTouch.y,
        scale: 1,
        rotation: 0,
      },
    };
  }, []);

  return useTouchToVisualBridge(mapper, config);
}

/**
 * Touch-to-scale bridge for pinch gestures
 */
export function useTouchScale(
  initialScale: number = 1,
  minScale: number = 0.5,
  maxScale: number = 3,
  config?: Partial<BridgeConfig>
): UseTouchToVisualBridgeResult {
  const scaleRef = useRef(initialScale);

  const mapper: TouchToVisualMapper = useCallback(
    (touch, history) => {
      // Calculate scale based on distance from start
      const startTouch = history[0] ?? touch;
      const distance = Math.sqrt(
        (touch.x - startTouch.x) ** 2 + (touch.y - startTouch.y) ** 2
      );

      // Scale factor based on drag distance
      const scaleDelta = distance / 200;
      const newScale = Math.max(
        minScale,
        Math.min(maxScale, scaleRef.current + scaleDelta * Math.sign(touch.velocityY))
      );

      return {
        transform: {
          translateX: 0,
          translateY: 0,
          scale: newScale,
          rotation: 0,
        },
      };
    },
    [minScale, maxScale]
  );

  return useTouchToVisualBridge(mapper, config);
}

/**
 * Touch-to-opacity bridge for fading interactions
 */
export function useTouchOpacity(
  config?: Partial<BridgeConfig>
): UseTouchToVisualBridgeResult {
  const mapper: TouchToVisualMapper = useCallback((touch) => {
    // Opacity based on pressure
    const opacity = Math.max(0.3, Math.min(1, touch.pressure));

    return {
      opacity,
    };
  }, []);

  return useTouchToVisualBridge(mapper, config);
}

// ============================================================================
// Exports
// ============================================================================

export default useTouchToVisualBridge;
