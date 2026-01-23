/**
 * useTouchResponseOptimizer - Touch Response Optimization Hook
 *
 * Sprint 516: Optimizes touch response latency for mobile avatar interactions:
 * - Touch event coalescing and prioritization
 * - Immediate visual feedback before processing
 * - Gesture prediction for faster response
 * - Input buffering and smoothing
 * - Priority-based event handling
 *
 * @example
 * ```tsx
 * const { controls, state, metrics } = useTouchResponseOptimizer({
 *   targetResponseMs: 16,  // 1 frame target
 *   enablePrediction: true,
 * });
 *
 * // Apply to touch handler
 * const handleTouch = controls.wrapTouchHandler((e) => {
 *   // Your touch logic - runs with optimized timing
 * });
 *
 * // Get immediate feedback position
 * const feedbackPos = controls.getImmediateFeedbackPosition(touchEvent);
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Touch event priority levels
 */
export type TouchPriority = "critical" | "high" | "normal" | "low" | "deferred";

/**
 * Touch event type
 */
export type TouchEventType =
  | "touchstart"
  | "touchmove"
  | "touchend"
  | "touchcancel"
  | "pointerdown"
  | "pointermove"
  | "pointerup"
  | "pointercancel";

/**
 * Tracked touch point
 */
export interface TrackedTouch {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  velocityX: number;
  velocityY: number;
  pressure: number;
  timestamp: number;
  startTimestamp: number;
  isActive: boolean;
  predictedX: number;
  predictedY: number;
  eventCount: number;
}

/**
 * Touch event wrapper
 */
export interface OptimizedTouchEvent {
  originalEvent: TouchEvent | PointerEvent;
  touches: TrackedTouch[];
  priority: TouchPriority;
  timestamp: number;
  coalesced: boolean;
  coalescedCount: number;
  predictedPosition: { x: number; y: number } | null;
  latencyMs: number;
}

/**
 * Immediate feedback info
 */
export interface ImmediateFeedback {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  isVisible: boolean;
  touchId: number;
}

/**
 * Response timing metrics
 */
export interface ResponseTiming {
  touchToHandler: number;
  handlerExecution: number;
  handlerToFeedback: number;
  totalResponse: number;
  timestamp: number;
}

/**
 * Optimizer state
 */
export interface OptimizerState {
  activeTouches: TrackedTouch[];
  isPendingFeedback: boolean;
  currentPriority: TouchPriority;
  queueSize: number;
  isProcessing: boolean;
  lastResponseMs: number;
}

/**
 * Optimizer metrics
 */
export interface OptimizerMetrics {
  totalTouches: number;
  coalescedEvents: number;
  predictedEvents: number;
  averageResponseMs: number;
  p50ResponseMs: number;
  p95ResponseMs: number;
  droppedLowPriority: number;
  handlerExecutionAvgMs: number;
  feedbackDelayAvgMs: number;
  timings: ResponseTiming[];
}

/**
 * Optimizer config
 */
export interface OptimizerConfig {
  /** Target response time in ms */
  targetResponseMs: number;
  /** Enable gesture prediction */
  enablePrediction: boolean;
  /** Prediction lookahead in ms */
  predictionLookaheadMs: number;
  /** Enable event coalescing */
  enableCoalescing: boolean;
  /** Max events to coalesce */
  maxCoalescedEvents: number;
  /** Enable priority-based handling */
  enablePrioritization: boolean;
  /** Drop low-priority events under pressure */
  dropLowPriority: boolean;
  /** Touch history size */
  touchHistorySize: number;
  /** Immediate feedback delay threshold (ms) */
  immediateFeedbackThreshold: number;
  /** Sample window for metrics */
  metricsSampleWindow: number;
  /** Velocity smoothing factor (0-1) */
  velocitySmoothingFactor: number;
}

/**
 * Optimizer controls
 */
export interface OptimizerControls {
  /** Wrap a touch handler for optimization */
  wrapTouchHandler: <T extends (event: OptimizedTouchEvent) => void>(
    handler: T,
    priority?: TouchPriority
  ) => (event: TouchEvent | PointerEvent) => void;
  /** Get immediate feedback position for a touch */
  getImmediateFeedbackPosition: (
    event: TouchEvent | PointerEvent
  ) => ImmediateFeedback | null;
  /** Process touch start */
  processTouchStart: (event: TouchEvent | PointerEvent) => TrackedTouch[];
  /** Process touch move */
  processTouchMove: (event: TouchEvent | PointerEvent) => TrackedTouch[];
  /** Process touch end */
  processTouchEnd: (event: TouchEvent | PointerEvent) => TrackedTouch[];
  /** Get predicted position */
  getPredictedPosition: (touchId: number, deltaMs: number) => { x: number; y: number } | null;
  /** Set event priority */
  setPriority: (priority: TouchPriority) => void;
  /** Clear touch state */
  clearTouches: () => void;
  /** Reset metrics */
  resetMetrics: () => void;
  /** Get active touch by ID */
  getTouch: (touchId: number) => TrackedTouch | null;
  /** Force process queued events */
  flushQueue: () => void;
}

/**
 * Hook result
 */
export interface UseTouchResponseOptimizerResult {
  state: OptimizerState;
  metrics: OptimizerMetrics;
  controls: OptimizerControls;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: OptimizerConfig = {
  targetResponseMs: 16,
  enablePrediction: true,
  predictionLookaheadMs: 50,
  enableCoalescing: true,
  maxCoalescedEvents: 5,
  enablePrioritization: true,
  dropLowPriority: false,
  touchHistorySize: 20,
  immediateFeedbackThreshold: 8,
  metricsSampleWindow: 100,
  velocitySmoothingFactor: 0.3,
};

const PRIORITY_ORDER: Record<TouchPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  deferred: 4,
};

// ============================================================================
// Utility Functions
// ============================================================================

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function getTouchFromEvent(
  event: TouchEvent | PointerEvent,
  index = 0
): { id: number; x: number; y: number; pressure: number } | null {
  if ("touches" in event) {
    const touch = event.touches[index];
    if (!touch) return null;
    return {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      pressure: touch.force || 0.5,
    };
  } else {
    return {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pressure: event.pressure || 0.5,
    };
  }
}

function getAllTouchesFromEvent(
  event: TouchEvent | PointerEvent
): { id: number; x: number; y: number; pressure: number }[] {
  const touches: { id: number; x: number; y: number; pressure: number }[] = [];

  if ("touches" in event) {
    for (let i = 0; i < event.touches.length; i++) {
      const touch = getTouchFromEvent(event, i);
      if (touch) touches.push(touch);
    }
  } else {
    const touch = getTouchFromEvent(event);
    if (touch) touches.push(touch);
  }

  return touches;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Touch response optimization hook
 */
export function useTouchResponseOptimizer(
  config: Partial<OptimizerConfig> = {},
  callbacks?: {
    onTouchStart?: (touches: TrackedTouch[]) => void;
    onTouchMove?: (touches: TrackedTouch[]) => void;
    onTouchEnd?: (touches: TrackedTouch[]) => void;
    onSlowResponse?: (responseMs: number) => void;
    onPredictionUsed?: (touchId: number, accuracy: number) => void;
  }
): UseTouchResponseOptimizerResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [activeTouches, setActiveTouches] = useState<TrackedTouch[]>([]);
  const [currentPriority, setCurrentPriority] = useState<TouchPriority>("normal");
  const [isPendingFeedback, setIsPendingFeedback] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResponseMs, setLastResponseMs] = useState(0);

  // Metrics
  const [metrics, setMetrics] = useState<OptimizerMetrics>({
    totalTouches: 0,
    coalescedEvents: 0,
    predictedEvents: 0,
    averageResponseMs: 0,
    p50ResponseMs: 0,
    p95ResponseMs: 0,
    droppedLowPriority: 0,
    handlerExecutionAvgMs: 0,
    feedbackDelayAvgMs: 0,
    timings: [],
  });

  // Refs
  const touchMapRef = useRef<Map<number, TrackedTouch>>(new Map());
  const touchHistoryRef = useRef<Map<number, { x: number; y: number; t: number }[]>>(
    new Map()
  );
  const eventQueueRef = useRef<{ event: TouchEvent | PointerEvent; priority: TouchPriority }[]>([]);
  const processingRef = useRef(false);
  const lastProcessTimeRef = useRef(0);

  /**
   * Update touch position with velocity calculation
   */
  const updateTouchPosition = useCallback(
    (touchData: { id: number; x: number; y: number; pressure: number }): TrackedTouch => {
      const existing = touchMapRef.current.get(touchData.id);
      const now = performance.now();

      if (existing) {
        // Calculate velocity with smoothing
        const dt = (now - existing.timestamp) / 1000;
        const rawVelocityX = dt > 0 ? (touchData.x - existing.x) / dt : 0;
        const rawVelocityY = dt > 0 ? (touchData.y - existing.y) / dt : 0;

        const smoothedVelocityX =
          existing.velocityX * (1 - fullConfig.velocitySmoothingFactor) +
          rawVelocityX * fullConfig.velocitySmoothingFactor;
        const smoothedVelocityY =
          existing.velocityY * (1 - fullConfig.velocitySmoothingFactor) +
          rawVelocityY * fullConfig.velocitySmoothingFactor;

        // Update history
        const history = touchHistoryRef.current.get(touchData.id) || [];
        history.push({ x: touchData.x, y: touchData.y, t: now });
        if (history.length > fullConfig.touchHistorySize) {
          history.shift();
        }
        touchHistoryRef.current.set(touchData.id, history);

        // Predict position
        const predictedX =
          touchData.x + (smoothedVelocityX * fullConfig.predictionLookaheadMs) / 1000;
        const predictedY =
          touchData.y + (smoothedVelocityY * fullConfig.predictionLookaheadMs) / 1000;

        const updated: TrackedTouch = {
          ...existing,
          x: touchData.x,
          y: touchData.y,
          velocityX: smoothedVelocityX,
          velocityY: smoothedVelocityY,
          pressure: touchData.pressure,
          timestamp: now,
          predictedX,
          predictedY,
          eventCount: existing.eventCount + 1,
        };

        touchMapRef.current.set(touchData.id, updated);
        return updated;
      } else {
        // New touch
        const newTouch: TrackedTouch = {
          id: touchData.id,
          x: touchData.x,
          y: touchData.y,
          startX: touchData.x,
          startY: touchData.y,
          velocityX: 0,
          velocityY: 0,
          pressure: touchData.pressure,
          timestamp: now,
          startTimestamp: now,
          isActive: true,
          predictedX: touchData.x,
          predictedY: touchData.y,
          eventCount: 1,
        };

        touchMapRef.current.set(touchData.id, newTouch);
        touchHistoryRef.current.set(touchData.id, [{ x: touchData.x, y: touchData.y, t: now }]);

        return newTouch;
      }
    },
    [fullConfig]
  );

  /**
   * Process touch start
   */
  const processTouchStart = useCallback(
    (event: TouchEvent | PointerEvent): TrackedTouch[] => {
      const touchData = getAllTouchesFromEvent(event);
      const processed: TrackedTouch[] = [];

      for (const data of touchData) {
        const touch = updateTouchPosition(data);
        processed.push(touch);
      }

      setActiveTouches(Array.from(touchMapRef.current.values()).filter((t) => t.isActive));
      setMetrics((prev) => ({
        ...prev,
        totalTouches: prev.totalTouches + processed.length,
      }));

      callbacks?.onTouchStart?.(processed);
      return processed;
    },
    [updateTouchPosition, callbacks]
  );

  /**
   * Process touch move
   */
  const processTouchMove = useCallback(
    (event: TouchEvent | PointerEvent): TrackedTouch[] => {
      const touchData = getAllTouchesFromEvent(event);
      const processed: TrackedTouch[] = [];

      for (const data of touchData) {
        const touch = updateTouchPosition(data);
        processed.push(touch);
      }

      setActiveTouches(Array.from(touchMapRef.current.values()).filter((t) => t.isActive));

      callbacks?.onTouchMove?.(processed);
      return processed;
    },
    [updateTouchPosition, callbacks]
  );

  /**
   * Process touch end
   */
  const processTouchEnd = useCallback(
    (event: TouchEvent | PointerEvent): TrackedTouch[] => {
      const touchData = getAllTouchesFromEvent(event);
      const processed: TrackedTouch[] = [];

      // Get IDs of touches that ended
      const endedIds = new Set<number>();
      if ("changedTouches" in event) {
        for (let i = 0; i < event.changedTouches.length; i++) {
          endedIds.add(event.changedTouches[i].identifier);
        }
      } else {
        endedIds.add(event.pointerId);
      }

      // Mark as inactive
      for (const id of endedIds) {
        const touch = touchMapRef.current.get(id);
        if (touch) {
          touch.isActive = false;
          processed.push(touch);
        }
      }

      setActiveTouches(Array.from(touchMapRef.current.values()).filter((t) => t.isActive));

      // Cleanup after a short delay
      setTimeout(() => {
        for (const id of endedIds) {
          touchMapRef.current.delete(id);
          touchHistoryRef.current.delete(id);
        }
      }, 100);

      callbacks?.onTouchEnd?.(processed);
      return processed;
    },
    [callbacks]
  );

  /**
   * Get predicted position for a touch
   */
  const getPredictedPosition = useCallback(
    (touchId: number, deltaMs: number): { x: number; y: number } | null => {
      const touch = touchMapRef.current.get(touchId);
      if (!touch) return null;

      if (!fullConfig.enablePrediction) {
        return { x: touch.x, y: touch.y };
      }

      const predictedX = touch.x + (touch.velocityX * deltaMs) / 1000;
      const predictedY = touch.y + (touch.velocityY * deltaMs) / 1000;

      setMetrics((prev) => ({
        ...prev,
        predictedEvents: prev.predictedEvents + 1,
      }));

      return { x: predictedX, y: predictedY };
    },
    [fullConfig.enablePrediction]
  );

  /**
   * Get immediate feedback position
   */
  const getImmediateFeedbackPosition = useCallback(
    (event: TouchEvent | PointerEvent): ImmediateFeedback | null => {
      const touchData = getTouchFromEvent(event);
      if (!touchData) return null;

      const existing = touchMapRef.current.get(touchData.id);
      const predicted = fullConfig.enablePrediction
        ? getPredictedPosition(touchData.id, fullConfig.immediateFeedbackThreshold)
        : null;

      return {
        x: predicted?.x ?? touchData.x,
        y: predicted?.y ?? touchData.y,
        scale: touchData.pressure > 0 ? 0.9 + touchData.pressure * 0.2 : 1,
        opacity: 1,
        isVisible: true,
        touchId: touchData.id,
      };
    },
    [fullConfig, getPredictedPosition]
  );

  /**
   * Wrap a touch handler for optimization
   */
  const wrapTouchHandler = useCallback(
    <T extends (event: OptimizedTouchEvent) => void>(
      handler: T,
      priority: TouchPriority = "normal"
    ): ((event: TouchEvent | PointerEvent) => void) => {
      return (event: TouchEvent | PointerEvent) => {
        const startTime = performance.now();

        // Determine event type and process
        let touches: TrackedTouch[] = [];
        const eventType = event.type as TouchEventType;

        if (eventType === "touchstart" || eventType === "pointerdown") {
          touches = processTouchStart(event);
        } else if (eventType === "touchmove" || eventType === "pointermove") {
          touches = processTouchMove(event);
        } else if (
          eventType === "touchend" ||
          eventType === "touchcancel" ||
          eventType === "pointerup" ||
          eventType === "pointercancel"
        ) {
          touches = processTouchEnd(event);
        }

        // Check priority handling
        if (fullConfig.enablePrioritization) {
          const currentPriorityOrder = PRIORITY_ORDER[currentPriority];
          const eventPriorityOrder = PRIORITY_ORDER[priority];

          if (fullConfig.dropLowPriority && eventPriorityOrder > currentPriorityOrder + 1) {
            setMetrics((prev) => ({
              ...prev,
              droppedLowPriority: prev.droppedLowPriority + 1,
            }));
            return;
          }
        }

        // Coalesce events if enabled
        let coalescedCount = 1;
        if (fullConfig.enableCoalescing && "getCoalescedEvents" in event) {
          const coalesced = (event as PointerEvent).getCoalescedEvents?.();
          if (coalesced && coalesced.length > 1) {
            coalescedCount = Math.min(coalesced.length, fullConfig.maxCoalescedEvents);
            setMetrics((prev) => ({
              ...prev,
              coalescedEvents: prev.coalescedEvents + coalescedCount - 1,
            }));
          }
        }

        const handlerStartTime = performance.now();

        // Create optimized event
        const optimizedEvent: OptimizedTouchEvent = {
          originalEvent: event,
          touches,
          priority,
          timestamp: startTime,
          coalesced: coalescedCount > 1,
          coalescedCount,
          predictedPosition: touches[0]
            ? { x: touches[0].predictedX, y: touches[0].predictedY }
            : null,
          latencyMs: 0,
        };

        // Execute handler
        setIsProcessing(true);
        try {
          handler(optimizedEvent);
        } finally {
          setIsProcessing(false);
        }

        const handlerEndTime = performance.now();
        const feedbackTime = performance.now();

        // Record timing
        const timing: ResponseTiming = {
          touchToHandler: handlerStartTime - startTime,
          handlerExecution: handlerEndTime - handlerStartTime,
          handlerToFeedback: feedbackTime - handlerEndTime,
          totalResponse: feedbackTime - startTime,
          timestamp: Date.now(),
        };

        setLastResponseMs(timing.totalResponse);

        // Update metrics
        setMetrics((prev) => {
          const newTimings = [...prev.timings, timing].slice(
            -fullConfig.metricsSampleWindow
          );
          const totalResponses = newTimings.map((t) => t.totalResponse);
          const handlerExecs = newTimings.map((t) => t.handlerExecution);
          const feedbackDelays = newTimings.map((t) => t.handlerToFeedback);

          const avgResponse = totalResponses.reduce((a, b) => a + b, 0) / totalResponses.length;

          return {
            ...prev,
            timings: newTimings,
            averageResponseMs: avgResponse,
            p50ResponseMs: calculatePercentile(totalResponses, 50),
            p95ResponseMs: calculatePercentile(totalResponses, 95),
            handlerExecutionAvgMs:
              handlerExecs.reduce((a, b) => a + b, 0) / handlerExecs.length,
            feedbackDelayAvgMs:
              feedbackDelays.reduce((a, b) => a + b, 0) / feedbackDelays.length,
          };
        });

        // Callback for slow response
        if (timing.totalResponse > fullConfig.targetResponseMs * 2) {
          callbacks?.onSlowResponse?.(timing.totalResponse);
        }

        lastProcessTimeRef.current = feedbackTime;
      };
    },
    [
      fullConfig,
      currentPriority,
      processTouchStart,
      processTouchMove,
      processTouchEnd,
      callbacks,
    ]
  );

  /**
   * Set current priority
   */
  const setPriority = useCallback((priority: TouchPriority): void => {
    setCurrentPriority(priority);
  }, []);

  /**
   * Clear all touches
   */
  const clearTouches = useCallback((): void => {
    touchMapRef.current.clear();
    touchHistoryRef.current.clear();
    setActiveTouches([]);
  }, []);

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback((): void => {
    setMetrics({
      totalTouches: 0,
      coalescedEvents: 0,
      predictedEvents: 0,
      averageResponseMs: 0,
      p50ResponseMs: 0,
      p95ResponseMs: 0,
      droppedLowPriority: 0,
      handlerExecutionAvgMs: 0,
      feedbackDelayAvgMs: 0,
      timings: [],
    });
  }, []);

  /**
   * Get touch by ID
   */
  const getTouch = useCallback((touchId: number): TrackedTouch | null => {
    return touchMapRef.current.get(touchId) || null;
  }, []);

  /**
   * Flush queued events
   */
  const flushQueue = useCallback((): void => {
    while (eventQueueRef.current.length > 0) {
      const queued = eventQueueRef.current.shift();
      if (queued) {
        // Process would go here if we were queuing
      }
    }
  }, []);

  // Compile state
  const state: OptimizerState = useMemo(
    () => ({
      activeTouches,
      isPendingFeedback,
      currentPriority,
      queueSize: eventQueueRef.current.length,
      isProcessing,
      lastResponseMs,
    }),
    [activeTouches, isPendingFeedback, currentPriority, isProcessing, lastResponseMs]
  );

  // Compile controls
  const controls: OptimizerControls = useMemo(
    () => ({
      wrapTouchHandler,
      getImmediateFeedbackPosition,
      processTouchStart,
      processTouchMove,
      processTouchEnd,
      getPredictedPosition,
      setPriority,
      clearTouches,
      resetMetrics,
      getTouch,
      flushQueue,
    }),
    [
      wrapTouchHandler,
      getImmediateFeedbackPosition,
      processTouchStart,
      processTouchMove,
      processTouchEnd,
      getPredictedPosition,
      setPriority,
      clearTouches,
      resetMetrics,
      getTouch,
      flushQueue,
    ]
  );

  return {
    state,
    metrics,
    controls,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple optimized touch handler hook
 */
export function useOptimizedTouchHandler<T extends (event: OptimizedTouchEvent) => void>(
  handler: T,
  priority: TouchPriority = "normal"
): (event: TouchEvent | PointerEvent) => void {
  const { controls } = useTouchResponseOptimizer();
  return useMemo(() => controls.wrapTouchHandler(handler, priority), [controls, handler, priority]);
}

/**
 * Touch feedback position hook
 */
export function useTouchFeedbackPosition(): {
  getFeedback: (event: TouchEvent | PointerEvent) => ImmediateFeedback | null;
  activeTouches: TrackedTouch[];
} {
  const { controls, state } = useTouchResponseOptimizer();

  return {
    getFeedback: controls.getImmediateFeedbackPosition,
    activeTouches: state.activeTouches,
  };
}

/**
 * Touch velocity tracking hook
 */
export function useTouchVelocity(touchId: number): { x: number; y: number } | null {
  const { controls } = useTouchResponseOptimizer();
  const touch = controls.getTouch(touchId);

  if (!touch) return null;
  return { x: touch.velocityX, y: touch.velocityY };
}

export default useTouchResponseOptimizer;
