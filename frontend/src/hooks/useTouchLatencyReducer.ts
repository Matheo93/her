/**
 * useTouchLatencyReducer - Sprint 228
 *
 * Comprehensive touch latency reduction system that combines multiple
 * techniques to minimize perceived input lag on mobile devices.
 *
 * Features:
 * - Touch event coalescing bypass
 * - Pointer event prioritization
 * - Input queue optimization
 * - Touch move prediction
 * - Immediate visual feedback
 * - Latency measurement and reporting
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Touch event with timing metadata
 */
export interface TimedTouchEvent {
  id: number;
  type: "start" | "move" | "end" | "cancel";
  x: number;
  y: number;
  timestamp: number;
  processingTime: number;
  coalescedCount: number;
  predicted: boolean;
}

/**
 * Latency breakdown
 */
export interface LatencyBreakdown {
  /** Time from touch to event dispatch */
  inputLatency: number;
  /** Time to process the event */
  processingLatency: number;
  /** Time to update visual state */
  renderLatency: number;
  /** Total end-to-end latency */
  totalLatency: number;
}

/**
 * Touch queue entry
 */
export interface QueueEntry {
  event: TimedTouchEvent;
  priority: number;
  deadline: number;
  processed: boolean;
}

/**
 * Reducer configuration
 */
export interface ReducerConfig {
  /** Enable coalesced event processing (default: true) */
  processCoalescedEvents: boolean;
  /** Enable predicted events (default: true) */
  usePredictedEvents: boolean;
  /** Maximum queue size (default: 10) */
  maxQueueSize: number;
  /** Event deadline in ms (default: 8) */
  eventDeadlineMs: number;
  /** Enable immediate feedback mode (default: true) */
  immediateFeedback: boolean;
  /** Prediction lookahead in ms (default: 16) */
  predictionLookaheadMs: number;
  /** Enable latency measurement (default: true) */
  measureLatency: boolean;
  /** Latency sample size (default: 30) */
  latencySampleSize: number;
  /** High priority threshold velocity (default: 100) */
  highPriorityVelocity: number;
}

/**
 * Reducer metrics
 */
export interface ReducerMetrics {
  averageLatency: LatencyBreakdown;
  minLatency: number;
  maxLatency: number;
  eventsProcessed: number;
  eventsDropped: number;
  coalescedEventsUsed: number;
  predictedEventsUsed: number;
  queueOverflows: number;
}

/**
 * Reducer state
 */
export interface ReducerState {
  isActive: boolean;
  currentTouch: TimedTouchEvent | null;
  latestPosition: { x: number; y: number } | null;
  velocity: { x: number; y: number };
  metrics: ReducerMetrics;
  queueLength: number;
}

/**
 * Touch event handler
 */
export type TouchEventHandler = (event: TimedTouchEvent) => void;

/**
 * Reducer controls
 */
export interface ReducerControls {
  /** Attach to element for optimized touch handling */
  attachToElement: (element: HTMLElement) => () => void;
  /** Process touch event directly */
  processTouch: (event: TouchEvent | PointerEvent) => void;
  /** Set event handler */
  onTouch: (handler: TouchEventHandler) => void;
  /** Get predicted position */
  getPredictedPosition: (lookaheadMs?: number) => { x: number; y: number } | null;
  /** Reset state and metrics */
  reset: () => void;
  /** Force process queue */
  flushQueue: () => void;
}

/**
 * Hook return type
 */
export interface UseTouchLatencyReducerResult {
  state: ReducerState;
  controls: ReducerControls;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONFIG: ReducerConfig = {
  processCoalescedEvents: true,
  usePredictedEvents: true,
  maxQueueSize: 10,
  eventDeadlineMs: 8,
  immediateFeedback: true,
  predictionLookaheadMs: 16,
  measureLatency: true,
  latencySampleSize: 30,
  highPriorityVelocity: 100,
};

const DEFAULT_LATENCY: LatencyBreakdown = {
  inputLatency: 0,
  processingLatency: 0,
  renderLatency: 0,
  totalLatency: 0,
};

const DEFAULT_METRICS: ReducerMetrics = {
  averageLatency: DEFAULT_LATENCY,
  minLatency: Infinity,
  maxLatency: 0,
  eventsProcessed: 0,
  eventsDropped: 0,
  coalescedEventsUsed: 0,
  predictedEventsUsed: 0,
  queueOverflows: 0,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract touch/pointer position
 */
function getEventPosition(
  event: TouchEvent | PointerEvent
): { x: number; y: number } | null {
  if ("touches" in event) {
    const touch = event.touches[0] || event.changedTouches[0];
    if (touch) {
      return { x: touch.clientX, y: touch.clientY };
    }
  } else {
    return { x: event.clientX, y: event.clientY };
  }
  return null;
}

/**
 * Get coalesced events if available
 */
function getCoalescedEvents(event: PointerEvent): PointerEvent[] {
  if ("getCoalescedEvents" in event) {
    try {
      return event.getCoalescedEvents();
    } catch {
      return [event];
    }
  }
  return [event];
}

/**
 * Get predicted events if available
 */
function getPredictedEvents(event: PointerEvent): PointerEvent[] {
  if ("getPredictedEvents" in event) {
    try {
      return event.getPredictedEvents();
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Calculate velocity from two points
 */
function calculateVelocity(
  current: { x: number; y: number; timestamp: number },
  previous: { x: number; y: number; timestamp: number }
): { x: number; y: number } {
  const dt = (current.timestamp - previous.timestamp) / 1000;
  if (dt <= 0) return { x: 0, y: 0 };

  return {
    x: (current.x - previous.x) / dt,
    y: (current.y - previous.y) / dt,
  };
}

/**
 * Calculate event priority based on velocity and type
 */
function calculatePriority(
  event: TimedTouchEvent,
  velocity: { x: number; y: number },
  config: ReducerConfig
): number {
  let priority = 1;

  // Start and end events are highest priority
  if (event.type === "start" || event.type === "end") {
    priority = 3;
  }

  // Fast movements get higher priority
  const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
  if (speed > config.highPriorityVelocity) {
    priority += 1;
  }

  return priority;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that reduces touch input latency through multiple optimization techniques
 */
export function useTouchLatencyReducer(
  config: Partial<ReducerConfig> = {}
): UseTouchLatencyReducerResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isActive, setIsActive] = useState(false);
  const [currentTouch, setCurrentTouch] = useState<TimedTouchEvent | null>(null);
  const [latestPosition, setLatestPosition] = useState<{ x: number; y: number } | null>(null);
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const [metrics, setMetrics] = useState<ReducerMetrics>(DEFAULT_METRICS);
  const [queueLength, setQueueLength] = useState(0);

  // Refs
  const touchIdRef = useRef(0);
  const queueRef = useRef<QueueEntry[]>([]);
  const handlerRef = useRef<TouchEventHandler | null>(null);
  const lastTouchRef = useRef<TimedTouchEvent | null>(null);
  const latencySamplesRef = useRef<LatencyBreakdown[]>([]);
  const processingStartRef = useRef(0);

  /**
   * Record latency sample
   */
  const recordLatency = useCallback(
    (breakdown: LatencyBreakdown) => {
      if (!mergedConfig.measureLatency) return;

      const samples = latencySamplesRef.current;
      samples.push(breakdown);

      if (samples.length > mergedConfig.latencySampleSize) {
        samples.shift();
      }

      // Calculate averages
      const avgLatency: LatencyBreakdown = {
        inputLatency: samples.reduce((a, s) => a + s.inputLatency, 0) / samples.length,
        processingLatency:
          samples.reduce((a, s) => a + s.processingLatency, 0) / samples.length,
        renderLatency: samples.reduce((a, s) => a + s.renderLatency, 0) / samples.length,
        totalLatency: samples.reduce((a, s) => a + s.totalLatency, 0) / samples.length,
      };

      setMetrics((prev) => ({
        ...prev,
        averageLatency: avgLatency,
        minLatency: Math.min(prev.minLatency, breakdown.totalLatency),
        maxLatency: Math.max(prev.maxLatency, breakdown.totalLatency),
      }));
    },
    [mergedConfig.measureLatency, mergedConfig.latencySampleSize]
  );

  /**
   * Process a single touch event
   */
  const processEvent = useCallback(
    (event: TimedTouchEvent) => {
      const processStart = performance.now();

      // Update state
      setCurrentTouch(event);
      setLatestPosition({ x: event.x, y: event.y });

      // Calculate velocity
      if (lastTouchRef.current && event.type === "move") {
        const newVelocity = calculateVelocity(
          { x: event.x, y: event.y, timestamp: event.timestamp },
          {
            x: lastTouchRef.current.x,
            y: lastTouchRef.current.y,
            timestamp: lastTouchRef.current.timestamp,
          }
        );
        setVelocity(newVelocity);
      }

      lastTouchRef.current = event;

      // Call handler
      if (handlerRef.current) {
        handlerRef.current(event);
      }

      // Update activity state
      if (event.type === "start") {
        setIsActive(true);
      } else if (event.type === "end" || event.type === "cancel") {
        setIsActive(false);
        setVelocity({ x: 0, y: 0 });
      }

      // Record latency
      const processEnd = performance.now();
      const processingLatency = processEnd - processStart;

      recordLatency({
        inputLatency: event.processingTime,
        processingLatency,
        renderLatency: 0, // Will be measured on next frame
        totalLatency: event.processingTime + processingLatency,
      });

      // Update metrics
      setMetrics((prev) => ({
        ...prev,
        eventsProcessed: prev.eventsProcessed + 1,
        coalescedEventsUsed: prev.coalescedEventsUsed + (event.coalescedCount > 1 ? 1 : 0),
        predictedEventsUsed: prev.predictedEventsUsed + (event.predicted ? 1 : 0),
      }));
    },
    [recordLatency]
  );

  /**
   * Add event to queue
   */
  const enqueue = useCallback(
    (event: TimedTouchEvent) => {
      const queue = queueRef.current;
      const priority = calculatePriority(event, velocity, mergedConfig);
      const deadline = event.timestamp + mergedConfig.eventDeadlineMs;

      // Check queue overflow
      if (queue.length >= mergedConfig.maxQueueSize) {
        // Remove lowest priority expired event
        const now = performance.now();
        const expiredIndex = queue.findIndex(
          (e) => e.deadline < now && e.priority < priority
        );

        if (expiredIndex !== -1) {
          queue.splice(expiredIndex, 1);
          setMetrics((prev) => ({
            ...prev,
            eventsDropped: prev.eventsDropped + 1,
          }));
        } else if (queue[queue.length - 1].priority < priority) {
          queue.pop();
          setMetrics((prev) => ({
            ...prev,
            eventsDropped: prev.eventsDropped + 1,
            queueOverflows: prev.queueOverflows + 1,
          }));
        } else {
          // Drop this event
          setMetrics((prev) => ({
            ...prev,
            eventsDropped: prev.eventsDropped + 1,
          }));
          return;
        }
      }

      // Insert in priority order
      const entry: QueueEntry = {
        event,
        priority,
        deadline,
        processed: false,
      };

      let inserted = false;
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].priority < priority) {
          queue.splice(i, 0, entry);
          inserted = true;
          break;
        }
      }

      if (!inserted) {
        queue.push(entry);
      }

      setQueueLength(queue.length);
    },
    [velocity, mergedConfig]
  );

  /**
   * Process queue
   */
  const processQueue = useCallback(() => {
    const queue = queueRef.current;
    const now = performance.now();

    while (queue.length > 0) {
      const entry = queue[0];

      // Skip if past deadline and not high priority
      if (entry.deadline < now && entry.priority < 2) {
        queue.shift();
        setMetrics((prev) => ({
          ...prev,
          eventsDropped: prev.eventsDropped + 1,
        }));
        continue;
      }

      // Process event
      queue.shift();
      processEvent(entry.event);
    }

    setQueueLength(queue.length);
  }, [processEvent]);

  /**
   * Process incoming touch/pointer event
   */
  const processTouch = useCallback(
    (event: TouchEvent | PointerEvent) => {
      const receiveTime = performance.now();
      const position = getEventPosition(event);

      if (!position) return;

      // Determine event type
      let type: TimedTouchEvent["type"];
      if (event.type.includes("start") || event.type.includes("down")) {
        type = "start";
      } else if (event.type.includes("end") || event.type.includes("up")) {
        type = "end";
      } else if (event.type.includes("cancel")) {
        type = "cancel";
      } else {
        type = "move";
      }

      // Process coalesced events for pointer events
      let coalescedCount = 1;
      if ("pointerId" in event && mergedConfig.processCoalescedEvents) {
        const coalesced = getCoalescedEvents(event);
        coalescedCount = coalesced.length;

        // Process all coalesced events for accuracy
        for (const coalescedEvent of coalesced) {
          const timedEvent: TimedTouchEvent = {
            id: ++touchIdRef.current,
            type,
            x: coalescedEvent.clientX,
            y: coalescedEvent.clientY,
            timestamp: coalescedEvent.timeStamp || receiveTime,
            processingTime: receiveTime - (coalescedEvent.timeStamp || receiveTime),
            coalescedCount,
            predicted: false,
          };

          if (mergedConfig.immediateFeedback) {
            processEvent(timedEvent);
          } else {
            enqueue(timedEvent);
          }
        }

        // Process predicted events
        if (mergedConfig.usePredictedEvents && type === "move") {
          const predicted = getPredictedEvents(event);
          for (const predictedEvent of predicted) {
            const timedEvent: TimedTouchEvent = {
              id: ++touchIdRef.current,
              type: "move",
              x: predictedEvent.clientX,
              y: predictedEvent.clientY,
              timestamp: predictedEvent.timeStamp || receiveTime,
              processingTime: 0,
              coalescedCount: 1,
              predicted: true,
            };

            if (mergedConfig.immediateFeedback) {
              processEvent(timedEvent);
            } else {
              enqueue(timedEvent);
            }
          }
        }
      } else {
        // Regular touch event
        const timedEvent: TimedTouchEvent = {
          id: ++touchIdRef.current,
          type,
          x: position.x,
          y: position.y,
          timestamp: event.timeStamp || receiveTime,
          processingTime: receiveTime - (event.timeStamp || receiveTime),
          coalescedCount: 1,
          predicted: false,
        };

        if (mergedConfig.immediateFeedback) {
          processEvent(timedEvent);
        } else {
          enqueue(timedEvent);
        }
      }

      // Process queue if not in immediate mode
      if (!mergedConfig.immediateFeedback) {
        processQueue();
      }
    },
    [mergedConfig, processEvent, enqueue, processQueue]
  );

  /**
   * Attach optimized handlers to element
   */
  const attachToElement = useCallback(
    (element: HTMLElement) => {
      const options: AddEventListenerOptions = {
        passive: false,
        capture: true,
      };

      const handlePointerDown = (e: PointerEvent) => {
        e.preventDefault();
        processTouch(e);
      };

      const handlePointerMove = (e: PointerEvent) => {
        if (isActive) {
          e.preventDefault();
          processTouch(e);
        }
      };

      const handlePointerUp = (e: PointerEvent) => {
        processTouch(e);
      };

      const handlePointerCancel = (e: PointerEvent) => {
        processTouch(e);
      };

      // Use pointer events for better coalesced/predicted support
      element.addEventListener("pointerdown", handlePointerDown, options);
      element.addEventListener("pointermove", handlePointerMove, options);
      element.addEventListener("pointerup", handlePointerUp, options);
      element.addEventListener("pointercancel", handlePointerCancel, options);

      // Set touch-action for immediate response
      element.style.touchAction = "none";

      // Return cleanup function
      return () => {
        element.removeEventListener("pointerdown", handlePointerDown, options);
        element.removeEventListener("pointermove", handlePointerMove, options);
        element.removeEventListener("pointerup", handlePointerUp, options);
        element.removeEventListener("pointercancel", handlePointerCancel, options);
      };
    },
    [isActive, processTouch]
  );

  /**
   * Set touch event handler
   */
  const onTouch = useCallback((handler: TouchEventHandler) => {
    handlerRef.current = handler;
  }, []);

  /**
   * Get predicted position
   */
  const getPredictedPosition = useCallback(
    (lookaheadMs?: number): { x: number; y: number } | null => {
      if (!latestPosition) return null;

      const lookahead = lookaheadMs ?? mergedConfig.predictionLookaheadMs;
      const t = lookahead / 1000;

      return {
        x: latestPosition.x + velocity.x * t,
        y: latestPosition.y + velocity.y * t,
      };
    },
    [latestPosition, velocity, mergedConfig.predictionLookaheadMs]
  );

  /**
   * Reset state and metrics
   */
  const reset = useCallback(() => {
    queueRef.current = [];
    latencySamplesRef.current = [];
    lastTouchRef.current = null;
    touchIdRef.current = 0;

    setIsActive(false);
    setCurrentTouch(null);
    setLatestPosition(null);
    setVelocity({ x: 0, y: 0 });
    setMetrics(DEFAULT_METRICS);
    setQueueLength(0);
  }, []);

  /**
   * Force process queue
   */
  const flushQueue = useCallback(() => {
    processQueue();
  }, [processQueue]);

  // Build state object
  const state: ReducerState = useMemo(
    () => ({
      isActive,
      currentTouch,
      latestPosition,
      velocity,
      metrics,
      queueLength,
    }),
    [isActive, currentTouch, latestPosition, velocity, metrics, queueLength]
  );

  // Build controls object
  const controls: ReducerControls = useMemo(
    () => ({
      attachToElement,
      processTouch,
      onTouch,
      getPredictedPosition,
      reset,
      flushQueue,
    }),
    [attachToElement, processTouch, onTouch, getPredictedPosition, reset, flushQueue]
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
 * Simple hook for low-latency touch tracking
 */
export function useLowLatencyTouch(): {
  position: { x: number; y: number } | null;
  isActive: boolean;
  attachTo: (element: HTMLElement) => () => void;
} {
  const { state, controls } = useTouchLatencyReducer({
    immediateFeedback: true,
    processCoalescedEvents: true,
    usePredictedEvents: true,
  });

  return {
    position: state.latestPosition,
    isActive: state.isActive,
    attachTo: controls.attachToElement,
  };
}

/**
 * Hook for touch latency measurement
 */
export function useTouchLatencyMetrics(): {
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  breakdown: LatencyBreakdown;
} {
  const { state } = useTouchLatencyReducer({ measureLatency: true });

  return {
    averageLatency: state.metrics.averageLatency.totalLatency,
    minLatency: state.metrics.minLatency === Infinity ? 0 : state.metrics.minLatency,
    maxLatency: state.metrics.maxLatency,
    breakdown: state.metrics.averageLatency,
  };
}

// ============================================================================
// Exports
// ============================================================================

export default useTouchLatencyReducer;
