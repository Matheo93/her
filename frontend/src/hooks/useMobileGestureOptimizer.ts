/**
 * useMobileGestureOptimizer Hook - Sprint 512
 *
 * Optimized touch gesture handling for mobile avatar interactions.
 * Reduces latency and improves responsiveness of touch-based interactions.
 *
 * Features:
 * - Passive touch listeners for smooth scrolling
 * - Gesture prediction and early activation
 * - Touch velocity and momentum calculation
 * - Multi-touch gesture recognition
 * - Gesture throttling for performance
 * - Palm rejection and accidental touch filtering
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type GestureType =
  | "tap"
  | "double_tap"
  | "long_press"
  | "swipe_left"
  | "swipe_right"
  | "swipe_up"
  | "swipe_down"
  | "pinch"
  | "spread"
  | "rotate"
  | "pan"
  | "drag";

export type GesturePhase = "possible" | "began" | "changed" | "ended" | "cancelled" | "failed";

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
  timestamp: number;
  force: number;
  radiusX: number;
  radiusY: number;
}

export interface GestureVelocity {
  x: number; // px/ms
  y: number; // px/ms
  magnitude: number;
  angle: number; // radians
}

export interface Gesture {
  type: GestureType;
  phase: GesturePhase;
  startTime: number;
  currentTime: number;
  duration: number;
  startPoint: TouchPoint;
  currentPoint: TouchPoint;
  delta: { x: number; y: number };
  velocity: GestureVelocity;
  scale?: number; // For pinch/spread
  rotation?: number; // For rotate
  touchCount: number;
}

export interface GesturePrediction {
  likelyGesture: GestureType | null;
  confidence: number;
  predictedEndpoint?: { x: number; y: number };
  predictedDuration?: number;
}

export interface GestureFilter {
  minTouchDuration: number; // ms - filter accidental taps
  maxTouchArea: number; // px - filter palm touches
  minSwipeDistance: number; // px
  minSwipeVelocity: number; // px/ms
  doubleTapWindow: number; // ms
  longPressThreshold: number; // ms
}

export interface GestureOptimizerState {
  activeGestures: Gesture[];
  recentGestures: Gesture[];
  prediction: GesturePrediction;
  touchCount: number;
  isGestureActive: boolean;
}

export interface GestureOptimizerMetrics {
  totalGestures: number;
  gesturesByType: Record<GestureType, number>;
  averageLatency: number; // ms from touch to gesture recognition
  predictionAccuracy: number; // 0-1
  filteredTouches: number;
}

export interface GestureOptimizerConfig {
  enabled: boolean;
  filters: GestureFilter;
  enablePrediction: boolean;
  enableMomentum: boolean;
  momentumFriction: number; // 0-1
  throttleInterval: number; // ms
  passiveListeners: boolean;
  preventDefaultGestures: GestureType[];
}

export interface GestureCallbacks {
  onTap?: (gesture: Gesture) => void;
  onDoubleTap?: (gesture: Gesture) => void;
  onLongPress?: (gesture: Gesture) => void;
  onSwipe?: (gesture: Gesture) => void;
  onPinch?: (gesture: Gesture) => void;
  onRotate?: (gesture: Gesture) => void;
  onPan?: (gesture: Gesture) => void;
  onDrag?: (gesture: Gesture) => void;
  onGestureStart?: (gesture: Gesture) => void;
  onGestureEnd?: (gesture: Gesture) => void;
}

export interface GestureOptimizerControls {
  enable: () => void;
  disable: () => void;
  resetState: () => void;
  getActiveGestures: () => Gesture[];
  simulateGesture: (type: GestureType, point: { x: number; y: number }) => void;
}

export interface UseMobileGestureOptimizerResult {
  ref: React.RefObject<HTMLElement | null>;
  state: GestureOptimizerState;
  metrics: GestureOptimizerMetrics;
  controls: GestureOptimizerControls;
  bind: () => { ref: React.RefObject<HTMLElement | null> };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_FILTERS: GestureFilter = {
  minTouchDuration: 50,
  maxTouchArea: 2500, // 50x50 px
  minSwipeDistance: 30,
  minSwipeVelocity: 0.3,
  doubleTapWindow: 300,
  longPressThreshold: 500,
};

const DEFAULT_CONFIG: GestureOptimizerConfig = {
  enabled: true,
  filters: DEFAULT_FILTERS,
  enablePrediction: true,
  enableMomentum: true,
  momentumFriction: 0.95,
  throttleInterval: 16, // ~60fps
  passiveListeners: true,
  preventDefaultGestures: ["pinch", "spread"],
};

// ============================================================================
// Utility Functions (exported for testing)
// ============================================================================

export function createTouchPoint(touch: Touch, timestamp: number): TouchPoint {
  return {
    id: touch.identifier,
    x: touch.clientX,
    y: touch.clientY,
    timestamp,
    force: touch.force || 0,
    radiusX: touch.radiusX || 10,
    radiusY: touch.radiusY || 10,
  };
}

export function calculateVelocity(
  start: TouchPoint,
  end: TouchPoint
): GestureVelocity {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dt = Math.max(1, end.timestamp - start.timestamp);

  const vx = dx / dt;
  const vy = dy / dt;
  const magnitude = Math.sqrt(vx * vx + vy * vy);
  const angle = Math.atan2(vy, vx);

  return { x: vx, y: vy, magnitude, angle };
}

export function calculateDistance(p1: TouchPoint, p2: TouchPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function calculateAngle(p1: TouchPoint, p2: TouchPoint): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

export function detectSwipeDirection(
  velocity: GestureVelocity,
  minVelocity: number
): GestureType | null {
  if (velocity.magnitude < minVelocity) return null;

  const angle = velocity.angle;
  const threshold = Math.PI / 4; // 45 degrees

  if (Math.abs(angle) < threshold) return "swipe_right";
  if (Math.abs(angle - Math.PI) < threshold || Math.abs(angle + Math.PI) < threshold)
    return "swipe_left";
  if (angle > threshold && angle < Math.PI - threshold) return "swipe_down";
  if (angle < -threshold && angle > -Math.PI + threshold) return "swipe_up";

  return null;
}

export function isPalmTouch(touch: Touch, maxArea: number): boolean {
  const area = (touch.radiusX || 10) * (touch.radiusY || 10) * Math.PI;
  return area > maxArea;
}

export function predictGesture(
  touches: TouchPoint[],
  velocity: GestureVelocity,
  duration: number,
  config: GestureOptimizerConfig
): GesturePrediction {
  if (touches.length === 0) {
    return { likelyGesture: null, confidence: 0 };
  }

  // Quick tap detection
  if (duration < 150 && velocity.magnitude < 0.2) {
    return { likelyGesture: "tap", confidence: 0.8 };
  }

  // Long press detection
  if (duration > config.filters.longPressThreshold * 0.5 && velocity.magnitude < 0.1) {
    return {
      likelyGesture: "long_press",
      confidence: Math.min(1, duration / config.filters.longPressThreshold),
    };
  }

  // Swipe detection
  if (velocity.magnitude > config.filters.minSwipeVelocity * 0.5) {
    const swipe = detectSwipeDirection(velocity, config.filters.minSwipeVelocity * 0.5);
    if (swipe) {
      return { likelyGesture: swipe, confidence: Math.min(1, velocity.magnitude / 0.5) };
    }
  }

  // Pan detection for slower movements
  if (velocity.magnitude > 0.1) {
    return { likelyGesture: "pan", confidence: 0.6 };
  }

  return { likelyGesture: null, confidence: 0 };
}

// ============================================================================
// Main Hook
// ============================================================================

export function useMobileGestureOptimizer(
  callbacks: GestureCallbacks = {},
  config: Partial<GestureOptimizerConfig> = {}
): UseMobileGestureOptimizerResult {
  const mergedConfig = useMemo(
    () => ({
      ...DEFAULT_CONFIG,
      ...config,
      filters: { ...DEFAULT_FILTERS, ...config.filters },
    }),
    [config]
  );

  const elementRef = useRef<HTMLElement>(null);

  // State
  const [state, setState] = useState<GestureOptimizerState>({
    activeGestures: [],
    recentGestures: [],
    prediction: { likelyGesture: null, confidence: 0 },
    touchCount: 0,
    isGestureActive: false,
  });

  // Metrics
  const metricsRef = useRef<GestureOptimizerMetrics>({
    totalGestures: 0,
    gesturesByType: {} as Record<GestureType, number>,
    averageLatency: 0,
    predictionAccuracy: 0,
    filteredTouches: 0,
  });

  // Touch tracking
  const touchStartsRef = useRef<Map<number, TouchPoint>>(new Map());
  const lastTapRef = useRef<{ time: number; point: TouchPoint } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const throttleTimeRef = useRef<number>(0);
  const isEnabledRef = useRef<boolean>(mergedConfig.enabled);

  // Callback refs (to avoid effect dependencies)
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Create and emit gesture
  const emitGesture = useCallback(
    (
      type: GestureType,
      phase: GesturePhase,
      startPoint: TouchPoint,
      currentPoint: TouchPoint,
      touchCount: number,
      extra?: { scale?: number; rotation?: number }
    ) => {
      const velocity = calculateVelocity(startPoint, currentPoint);
      const gesture: Gesture = {
        type,
        phase,
        startTime: startPoint.timestamp,
        currentTime: currentPoint.timestamp,
        duration: currentPoint.timestamp - startPoint.timestamp,
        startPoint,
        currentPoint,
        delta: {
          x: currentPoint.x - startPoint.x,
          y: currentPoint.y - startPoint.y,
        },
        velocity,
        scale: extra?.scale,
        rotation: extra?.rotation,
        touchCount,
      };

      // Update metrics
      if (phase === "ended") {
        metricsRef.current.totalGestures++;
        metricsRef.current.gesturesByType[type] =
          (metricsRef.current.gesturesByType[type] || 0) + 1;
      }

      // Call appropriate callback
      const cb = callbacksRef.current;
      if (phase === "began" && cb.onGestureStart) cb.onGestureStart(gesture);
      if (phase === "ended" && cb.onGestureEnd) cb.onGestureEnd(gesture);

      switch (type) {
        case "tap":
          if (phase === "ended" && cb.onTap) cb.onTap(gesture);
          break;
        case "double_tap":
          if (phase === "ended" && cb.onDoubleTap) cb.onDoubleTap(gesture);
          break;
        case "long_press":
          if (cb.onLongPress) cb.onLongPress(gesture);
          break;
        case "swipe_left":
        case "swipe_right":
        case "swipe_up":
        case "swipe_down":
          if (phase === "ended" && cb.onSwipe) cb.onSwipe(gesture);
          break;
        case "pinch":
        case "spread":
          if (cb.onPinch) cb.onPinch(gesture);
          break;
        case "rotate":
          if (cb.onRotate) cb.onRotate(gesture);
          break;
        case "pan":
          if (cb.onPan) cb.onPan(gesture);
          break;
        case "drag":
          if (cb.onDrag) cb.onDrag(gesture);
          break;
      }

      // Update state
      setState((prev) => ({
        ...prev,
        activeGestures:
          phase === "ended" || phase === "cancelled" || phase === "failed"
            ? prev.activeGestures.filter((g) => g.type !== type)
            : phase === "began"
              ? [...prev.activeGestures, gesture]
              : prev.activeGestures.map((g) => (g.type === type ? gesture : g)),
        recentGestures:
          phase === "ended" ? [...prev.recentGestures.slice(-9), gesture] : prev.recentGestures,
        isGestureActive: phase !== "ended" && phase !== "cancelled" && phase !== "failed",
      }));

      return gesture;
    },
    []
  );

  // Touch handlers
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!isEnabledRef.current) return;

      const now = Date.now();

      for (const touch of Array.from(e.changedTouches)) {
        // Palm rejection
        if (isPalmTouch(touch, mergedConfig.filters.maxTouchArea)) {
          metricsRef.current.filteredTouches++;
          continue;
        }

        const point = createTouchPoint(touch, now);
        touchStartsRef.current.set(touch.identifier, point);
      }

      setState((prev) => ({
        ...prev,
        touchCount: e.touches.length,
        isGestureActive: true,
      }));

      // Start long press timer for single touch
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const point = touchStartsRef.current.get(touch.identifier);

        if (point) {
          longPressTimerRef.current = setTimeout(() => {
            if (touchStartsRef.current.has(touch.identifier)) {
              const currentPoint = touchStartsRef.current.get(touch.identifier)!;
              emitGesture("long_press", "ended", point, currentPoint, 1);
            }
          }, mergedConfig.filters.longPressThreshold);
        }
      }

      // Prevent default for configured gestures
      if (
        e.touches.length > 1 &&
        mergedConfig.preventDefaultGestures.includes("pinch")
      ) {
        e.preventDefault();
      }
    },
    [mergedConfig, emitGesture]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isEnabledRef.current) return;

      const now = Date.now();

      // Throttle
      if (now - throttleTimeRef.current < mergedConfig.throttleInterval) {
        return;
      }
      throttleTimeRef.current = now;

      // Cancel long press on movement
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      // Single touch - pan/drag
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const startPoint = touchStartsRef.current.get(touch.identifier);

        if (startPoint) {
          const currentPoint = createTouchPoint(touch, now);
          const velocity = calculateVelocity(startPoint, currentPoint);

          // Update prediction
          if (mergedConfig.enablePrediction) {
            const prediction = predictGesture(
              [currentPoint],
              velocity,
              now - startPoint.timestamp,
              mergedConfig
            );
            setState((prev) => ({ ...prev, prediction }));
          }

          emitGesture("pan", "changed", startPoint, currentPoint, 1);
        }
      }

      // Multi-touch - pinch/rotate
      if (e.touches.length === 2) {
        const [touch1, touch2] = Array.from(e.touches);
        const start1 = touchStartsRef.current.get(touch1.identifier);
        const start2 = touchStartsRef.current.get(touch2.identifier);

        if (start1 && start2) {
          const current1 = createTouchPoint(touch1, now);
          const current2 = createTouchPoint(touch2, now);

          const startDistance = calculateDistance(start1, start2);
          const currentDistance = calculateDistance(current1, current2);
          const scale = currentDistance / startDistance;

          const startAngle = calculateAngle(start1, start2);
          const currentAngle = calculateAngle(current1, current2);
          const rotation = currentAngle - startAngle;

          const gestureType: GestureType = scale > 1 ? "spread" : "pinch";
          emitGesture(gestureType, "changed", start1, current1, 2, { scale, rotation });

          if (Math.abs(rotation) > 0.1) {
            emitGesture("rotate", "changed", start1, current1, 2, { scale, rotation });
          }
        }
      }
    },
    [mergedConfig, emitGesture]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!isEnabledRef.current) return;

      const now = Date.now();

      // Cancel long press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      for (const touch of Array.from(e.changedTouches)) {
        const startPoint = touchStartsRef.current.get(touch.identifier);
        if (!startPoint) continue;

        const currentPoint = createTouchPoint(touch, now);
        const velocity = calculateVelocity(startPoint, currentPoint);
        const distance = calculateDistance(startPoint, currentPoint);
        const duration = now - startPoint.timestamp;

        // Detect gesture type
        if (duration < mergedConfig.filters.minTouchDuration) {
          // Too short - filter out
          metricsRef.current.filteredTouches++;
        } else if (distance < mergedConfig.filters.minSwipeDistance && duration < 300) {
          // Tap
          if (
            lastTapRef.current &&
            now - lastTapRef.current.time < mergedConfig.filters.doubleTapWindow &&
            calculateDistance(lastTapRef.current.point, currentPoint) < 50
          ) {
            emitGesture("double_tap", "ended", startPoint, currentPoint, 1);
            lastTapRef.current = null;
          } else {
            emitGesture("tap", "ended", startPoint, currentPoint, 1);
            lastTapRef.current = { time: now, point: currentPoint };
          }
        } else if (velocity.magnitude >= mergedConfig.filters.minSwipeVelocity) {
          // Swipe
          const swipeType = detectSwipeDirection(velocity, mergedConfig.filters.minSwipeVelocity);
          if (swipeType) {
            emitGesture(swipeType, "ended", startPoint, currentPoint, 1);
          }
        } else if (distance >= mergedConfig.filters.minSwipeDistance) {
          // Drag
          emitGesture("drag", "ended", startPoint, currentPoint, 1);
        }

        touchStartsRef.current.delete(touch.identifier);
      }

      setState((prev) => ({
        ...prev,
        touchCount: e.touches.length,
        isGestureActive: e.touches.length > 0,
        prediction: { likelyGesture: null, confidence: 0 },
      }));
    },
    [mergedConfig, emitGesture]
  );

  const handleTouchCancel = useCallback((e: TouchEvent) => {
    for (const touch of Array.from(e.changedTouches)) {
      touchStartsRef.current.delete(touch.identifier);
    }

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      touchCount: 0,
      isGestureActive: false,
      activeGestures: [],
      prediction: { likelyGesture: null, confidence: 0 },
    }));
  }, []);

  // Attach listeners
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const options: AddEventListenerOptions = {
      passive: mergedConfig.passiveListeners && mergedConfig.preventDefaultGestures.length === 0,
      capture: false,
    };

    element.addEventListener("touchstart", handleTouchStart, options);
    element.addEventListener("touchmove", handleTouchMove, options);
    element.addEventListener("touchend", handleTouchEnd, options);
    element.addEventListener("touchcancel", handleTouchCancel, options);

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    mergedConfig.passiveListeners,
    mergedConfig.preventDefaultGestures,
  ]);

  // Controls
  const enable = useCallback(() => {
    isEnabledRef.current = true;
  }, []);

  const disable = useCallback(() => {
    isEnabledRef.current = false;
    touchStartsRef.current.clear();
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    touchStartsRef.current.clear();
    setState({
      activeGestures: [],
      recentGestures: [],
      prediction: { likelyGesture: null, confidence: 0 },
      touchCount: 0,
      isGestureActive: false,
    });
  }, []);

  const getActiveGestures = useCallback((): Gesture[] => {
    return state.activeGestures;
  }, [state.activeGestures]);

  const simulateGesture = useCallback(
    (type: GestureType, point: { x: number; y: number }) => {
      const now = Date.now();
      const touchPoint: TouchPoint = {
        id: -1,
        x: point.x,
        y: point.y,
        timestamp: now,
        force: 0.5,
        radiusX: 10,
        radiusY: 10,
      };
      emitGesture(type, "ended", touchPoint, touchPoint, 1);
    },
    [emitGesture]
  );

  const controls: GestureOptimizerControls = useMemo(
    () => ({
      enable,
      disable,
      resetState,
      getActiveGestures,
      simulateGesture,
    }),
    [enable, disable, resetState, getActiveGestures, simulateGesture]
  );

  const bind = useCallback(() => ({ ref: elementRef }), []);

  return {
    ref: elementRef,
    state,
    metrics: metricsRef.current,
    controls,
    bind,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple tap handler hook
 */
export function useTapGesture(
  onTap: (point: { x: number; y: number }) => void,
  onDoubleTap?: (point: { x: number; y: number }) => void,
  config?: Partial<GestureOptimizerConfig>
): { ref: React.RefObject<HTMLElement | null> } {
  const { ref } = useMobileGestureOptimizer(
    {
      onTap: (gesture) => onTap({ x: gesture.currentPoint.x, y: gesture.currentPoint.y }),
      onDoubleTap: onDoubleTap
        ? (gesture) => onDoubleTap({ x: gesture.currentPoint.x, y: gesture.currentPoint.y })
        : undefined,
    },
    config
  );
  return { ref };
}

/**
 * Swipe gesture hook
 */
export function useSwipeGesture(
  onSwipe: (direction: "left" | "right" | "up" | "down", velocity: number) => void,
  config?: Partial<GestureOptimizerConfig>
): { ref: React.RefObject<HTMLElement | null> } {
  const { ref } = useMobileGestureOptimizer(
    {
      onSwipe: (gesture) => {
        const directionMap: Record<string, "left" | "right" | "up" | "down"> = {
          swipe_left: "left",
          swipe_right: "right",
          swipe_up: "up",
          swipe_down: "down",
        };
        const direction = directionMap[gesture.type];
        if (direction) {
          onSwipe(direction, gesture.velocity.magnitude);
        }
      },
    },
    config
  );
  return { ref };
}

/**
 * Pinch/zoom gesture hook
 */
export function usePinchGesture(
  onPinch: (scale: number, center: { x: number; y: number }) => void,
  config?: Partial<GestureOptimizerConfig>
): { ref: React.RefObject<HTMLElement | null> } {
  const { ref } = useMobileGestureOptimizer(
    {
      onPinch: (gesture) => {
        if (gesture.scale !== undefined) {
          onPinch(gesture.scale, {
            x: gesture.currentPoint.x,
            y: gesture.currentPoint.y,
          });
        }
      },
    },
    config
  );
  return { ref };
}

export default useMobileGestureOptimizer;
