/**
 * useMobileInputPipeline - Mobile Input Processing Pipeline Hook
 *
 * Sprint 516 (Iteration 2): Optimizes input processing for mobile avatar by:
 * - Input event debouncing and throttling
 * - Gesture recognition preprocessing
 * - Input prediction for reduced latency
 * - Priority-based input handling
 * - Input buffering during high load
 *
 * @example
 * ```tsx
 * const { controls, state, metrics } = useMobileInputPipeline({
 *   debounceMs: 16,
 *   enablePrediction: true,
 * });
 *
 * // Process input through pipeline
 * const processed = controls.processInput({
 *   type: 'touch',
 *   x: 100,
 *   y: 200,
 * });
 *
 * // Get predicted next input
 * const predicted = controls.getPredictedInput(16);
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Input types
 */
export type InputType = "touch" | "pointer" | "gesture" | "keyboard" | "voice";

/**
 * Gesture types
 */
export type GestureType = "tap" | "double_tap" | "long_press" | "swipe" | "pinch" | "rotate" | "pan";

/**
 * Input priority
 */
export type InputPriority = "critical" | "high" | "normal" | "low";

/**
 * Pipeline stage
 */
export type PipelineStage =
  | "received"
  | "validated"
  | "normalized"
  | "debounced"
  | "predicted"
  | "processed"
  | "dispatched";

/**
 * Raw input event
 */
export interface RawInput {
  type: InputType;
  x?: number;
  y?: number;
  pressure?: number;
  timestamp?: number;
  gestureType?: GestureType;
  velocity?: { x: number; y: number };
  scale?: number;
  rotation?: number;
  key?: string;
  data?: unknown;
}

/**
 * Processed input
 */
export interface ProcessedInput {
  id: string;
  raw: RawInput;
  priority: InputPriority;
  stage: PipelineStage;
  normalized: {
    x: number;
    y: number;
    pressure: number;
  };
  predicted?: {
    x: number;
    y: number;
    confidence: number;
  };
  gesture?: {
    type: GestureType;
    progress: number;
    velocity: number;
    direction?: string;
  };
  latencyMs: number;
  receivedAt: number;
  processedAt: number;
}

/**
 * Input buffer
 */
export interface InputBuffer {
  inputs: ProcessedInput[];
  capacity: number;
  head: number;
  tail: number;
  size: number;
}

/**
 * Gesture state
 */
export interface GestureState {
  currentGesture: GestureType | null;
  startPosition: { x: number; y: number } | null;
  currentPosition: { x: number; y: number } | null;
  velocity: { x: number; y: number };
  duration: number;
  distance: number;
}

/**
 * Pipeline state
 */
export interface PipelineState {
  isActive: boolean;
  currentStage: PipelineStage;
  queueSize: number;
  isProcessing: boolean;
  isPaused: boolean;
  gestureState: GestureState;
  averageLatencyMs: number;
}

/**
 * Pipeline metrics
 */
export interface PipelineMetrics {
  totalInputs: number;
  processedInputs: number;
  droppedInputs: number;
  debouncedInputs: number;
  predictedInputs: number;
  gesturesDetected: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  inputRate: number;
  processingRate: number;
  latencies: number[];
}

/**
 * Pipeline config
 */
export interface PipelineConfig {
  /** Debounce interval in ms */
  debounceMs: number;
  /** Throttle interval in ms */
  throttleMs: number;
  /** Enable input prediction */
  enablePrediction: boolean;
  /** Prediction lookahead in ms */
  predictionLookaheadMs: number;
  /** Input buffer capacity */
  bufferCapacity: number;
  /** Enable gesture recognition */
  enableGestureRecognition: boolean;
  /** Minimum gesture distance */
  minGestureDistance: number;
  /** Long press threshold in ms */
  longPressThreshold: number;
  /** Double tap threshold in ms */
  doubleTapThreshold: number;
  /** Sample window for metrics */
  metricsSampleWindow: number;
  /** Drop low priority when busy */
  dropLowPriorityOnBusy: boolean;
  /** Velocity smoothing factor */
  velocitySmoothingFactor: number;
}

/**
 * Pipeline controls
 */
export interface PipelineControls {
  /** Process raw input through pipeline */
  processInput: (input: RawInput, priority?: InputPriority) => ProcessedInput | null;
  /** Get predicted next input */
  getPredictedInput: (deltaMs: number) => ProcessedInput["predicted"] | null;
  /** Get current gesture */
  getCurrentGesture: () => GestureState;
  /** Start gesture tracking */
  startGesture: (x: number, y: number) => void;
  /** Update gesture position */
  updateGesture: (x: number, y: number) => void;
  /** End gesture tracking */
  endGesture: () => GestureType | null;
  /** Cancel gesture */
  cancelGesture: () => void;
  /** Pause pipeline */
  pause: () => void;
  /** Resume pipeline */
  resume: () => void;
  /** Flush buffer */
  flushBuffer: () => ProcessedInput[];
  /** Clear buffer */
  clearBuffer: () => void;
  /** Reset metrics */
  resetMetrics: () => void;
  /** Get buffer state */
  getBufferState: () => InputBuffer;
}

/**
 * Hook result
 */
export interface UseMobileInputPipelineResult {
  state: PipelineState;
  metrics: PipelineMetrics;
  controls: PipelineControls;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: PipelineConfig = {
  debounceMs: 16,
  throttleMs: 0,
  enablePrediction: true,
  predictionLookaheadMs: 32,
  bufferCapacity: 50,
  enableGestureRecognition: true,
  minGestureDistance: 10,
  longPressThreshold: 500,
  doubleTapThreshold: 300,
  metricsSampleWindow: 100,
  dropLowPriorityOnBusy: true,
  velocitySmoothingFactor: 0.3,
};

const SWIPE_DIRECTIONS: Record<string, { minAngle: number; maxAngle: number }> = {
  right: { minAngle: -45, maxAngle: 45 },
  down: { minAngle: 45, maxAngle: 135 },
  left: { minAngle: 135, maxAngle: -135 },
  up: { minAngle: -135, maxAngle: -45 },
};

// Pre-computed initial states (module-level for performance)
const INITIAL_GESTURE_STATE: GestureState = {
  currentGesture: null,
  startPosition: null,
  currentPosition: null,
  velocity: { x: 0, y: 0 },
  duration: 0,
  distance: 0,
};

const INITIAL_METRICS: PipelineMetrics = {
  totalInputs: 0,
  processedInputs: 0,
  droppedInputs: 0,
  debouncedInputs: 0,
  predictedInputs: 0,
  gesturesDetected: 0,
  averageLatencyMs: 0,
  p50LatencyMs: 0,
  p95LatencyMs: 0,
  inputRate: 0,
  processingRate: 0,
  latencies: [],
};

// ============================================================================
// Utility Functions
// ============================================================================

// Input ID counter for more efficient ID generation (avoids Date.now() syscall)
let inputIdCounter = 0;

function generateInputId(): string {
  return `i-${++inputIdCounter}-${Math.random().toString(36).substring(2, 7)}`;
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  // Use slice() instead of spread for slightly better performance
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function getSwipeDirection(dx: number, dy: number): string | undefined {
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  for (const [direction, range] of Object.entries(SWIPE_DIRECTIONS)) {
    if (range.minAngle <= range.maxAngle) {
      if (angle >= range.minAngle && angle <= range.maxAngle) {
        return direction;
      }
    } else {
      // Handle wrap-around (left direction)
      if (angle >= range.minAngle || angle <= range.maxAngle) {
        return direction;
      }
    }
  }

  return undefined;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Mobile input processing pipeline hook
 */
export function useMobileInputPipeline(
  config: Partial<PipelineConfig> = {},
  callbacks?: {
    onInputProcessed?: (input: ProcessedInput) => void;
    onGestureDetected?: (gesture: GestureType, state: GestureState) => void;
    onInputDropped?: (input: RawInput) => void;
    onBufferFull?: () => void;
  }
): UseMobileInputPipelineResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [isActive, setIsActive] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [currentStage, setCurrentStage] = useState<PipelineStage>("received");
  const [isProcessing, setIsProcessing] = useState(false);

  // Gesture state (using pre-computed initial state)
  const [gestureState, setGestureState] = useState<GestureState>(INITIAL_GESTURE_STATE);

  // Metrics (using pre-computed initial state)
  const [metrics, setMetrics] = useState<PipelineMetrics>({
    ...INITIAL_METRICS,
    latencies: [], // New array to avoid sharing reference
  });

  // Refs
  const bufferRef = useRef<ProcessedInput[]>([]);
  const lastInputTimeRef = useRef<number>(0);
  const lastProcessTimeRef = useRef<number>(0);
  const inputHistoryRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const gestureStartTimeRef = useRef<number>(0);
  const lastTapTimeRef = useRef<number>(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const velocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  /**
   * Normalize input coordinates
   */
  const normalizeInput = useCallback(
    (input: RawInput): { x: number; y: number; pressure: number } => {
      return {
        x: input.x ?? 0,
        y: input.y ?? 0,
        pressure: input.pressure ?? 0.5,
      };
    },
    []
  );

  /**
   * Calculate velocity from history
   */
  const calculateVelocity = useCallback(
    (x: number, y: number, timestamp: number): { x: number; y: number } => {
      const history = inputHistoryRef.current;
      history.push({ x, y, t: timestamp });

      // Keep last 5 samples
      if (history.length > 5) {
        history.shift();
      }

      if (history.length < 2) {
        return { x: 0, y: 0 };
      }

      const oldest = history[0];
      const newest = history[history.length - 1];
      const dt = (newest.t - oldest.t) / 1000;

      if (dt <= 0) {
        return velocityRef.current;
      }

      const rawVx = (newest.x - oldest.x) / dt;
      const rawVy = (newest.y - oldest.y) / dt;

      // Smooth velocity
      velocityRef.current = {
        x:
          velocityRef.current.x * (1 - fullConfig.velocitySmoothingFactor) +
          rawVx * fullConfig.velocitySmoothingFactor,
        y:
          velocityRef.current.y * (1 - fullConfig.velocitySmoothingFactor) +
          rawVy * fullConfig.velocitySmoothingFactor,
      };

      return velocityRef.current;
    },
    [fullConfig.velocitySmoothingFactor]
  );

  /**
   * Predict next input position
   */
  const predictInput = useCallback(
    (
      x: number,
      y: number,
      velocity: { x: number; y: number },
      deltaMs: number
    ): ProcessedInput["predicted"] => {
      if (!fullConfig.enablePrediction) {
        return { x, y, confidence: 1 };
      }

      const dt = deltaMs / 1000;
      const predictedX = x + velocity.x * dt;
      const predictedY = y + velocity.y * dt;

      // Confidence decreases with prediction distance
      const predictionDistance = Math.sqrt(
        Math.pow(predictedX - x, 2) + Math.pow(predictedY - y, 2)
      );
      const confidence = Math.max(0, 1 - predictionDistance / 200);

      return {
        x: predictedX,
        y: predictedY,
        confidence,
      };
    },
    [fullConfig.enablePrediction]
  );

  /**
   * Detect gesture type
   */
  const detectGesture = useCallback(
    (state: GestureState): GestureType | null => {
      if (!fullConfig.enableGestureRecognition) return null;
      if (!state.startPosition || !state.currentPosition) return null;

      const { distance, duration, velocity } = state;

      // Long press
      if (duration >= fullConfig.longPressThreshold && distance < fullConfig.minGestureDistance) {
        return "long_press";
      }

      // Swipe
      if (distance >= fullConfig.minGestureDistance) {
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        if (speed > 100) {
          return "swipe";
        }
        return "pan";
      }

      // Tap (detected on gesture end)
      if (distance < fullConfig.minGestureDistance && duration < fullConfig.longPressThreshold) {
        return "tap";
      }

      return null;
    },
    [fullConfig]
  );

  /**
   * Process input through pipeline
   */
  const processInput = useCallback(
    (input: RawInput, priority: InputPriority = "normal"): ProcessedInput | null => {
      if (!isActive || isPaused) return null;

      const receivedAt = performance.now();
      const timestamp = input.timestamp ?? receivedAt;

      setCurrentStage("received");
      setIsProcessing(true);

      // Check debounce
      if (fullConfig.debounceMs > 0) {
        const timeSinceLastInput = receivedAt - lastInputTimeRef.current;
        if (timeSinceLastInput < fullConfig.debounceMs) {
          setMetrics((prev) => ({
            ...prev,
            debouncedInputs: prev.debouncedInputs + 1,
          }));

          // Still update for priority inputs
          if (priority !== "critical" && priority !== "high") {
            setIsProcessing(false);
            return null;
          }
        }
      }

      // Check throttle
      if (fullConfig.throttleMs > 0) {
        const timeSinceLastProcess = receivedAt - lastProcessTimeRef.current;
        if (timeSinceLastProcess < fullConfig.throttleMs) {
          if (priority !== "critical") {
            setIsProcessing(false);
            return null;
          }
        }
      }

      // Check buffer capacity
      if (bufferRef.current.length >= fullConfig.bufferCapacity) {
        if (fullConfig.dropLowPriorityOnBusy && priority === "low") {
          callbacks?.onInputDropped?.(input);
          setMetrics((prev) => ({
            ...prev,
            droppedInputs: prev.droppedInputs + 1,
          }));
          setIsProcessing(false);
          return null;
        }
        callbacks?.onBufferFull?.();
      }

      setCurrentStage("validated");

      // Normalize
      const normalized = normalizeInput(input);
      setCurrentStage("normalized");

      // Calculate velocity
      const velocity = calculateVelocity(normalized.x, normalized.y, timestamp);

      // Predict
      setCurrentStage("predicted");
      const predicted = predictInput(
        normalized.x,
        normalized.y,
        velocity,
        fullConfig.predictionLookaheadMs
      );

      if (fullConfig.enablePrediction) {
        setMetrics((prev) => ({
          ...prev,
          predictedInputs: prev.predictedInputs + 1,
        }));
      }

      // Create processed input
      const processedAt = performance.now();
      const latencyMs = processedAt - receivedAt;

      const processed: ProcessedInput = {
        id: generateInputId(),
        raw: input,
        priority,
        stage: "processed",
        normalized,
        predicted,
        latencyMs,
        receivedAt,
        processedAt,
      };

      // Add gesture info if tracking
      if (gestureState.currentGesture || gestureState.startPosition) {
        const dx = gestureState.startPosition
          ? normalized.x - gestureState.startPosition.x
          : 0;
        const dy = gestureState.startPosition
          ? normalized.y - gestureState.startPosition.y
          : 0;

        processed.gesture = {
          type: gestureState.currentGesture || "pan",
          progress: 0,
          velocity: Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y),
          direction: getSwipeDirection(dx, dy),
        };
      }

      setCurrentStage("processed");

      // Add to buffer
      bufferRef.current.push(processed);
      if (bufferRef.current.length > fullConfig.bufferCapacity) {
        bufferRef.current.shift();
      }

      // Update timing
      lastInputTimeRef.current = receivedAt;
      lastProcessTimeRef.current = processedAt;

      // Update metrics
      setMetrics((prev) => {
        const newLatencies = [...prev.latencies, latencyMs].slice(
          -fullConfig.metricsSampleWindow
        );
        const avgLatency = newLatencies.reduce((a, b) => a + b, 0) / newLatencies.length;

        return {
          ...prev,
          totalInputs: prev.totalInputs + 1,
          processedInputs: prev.processedInputs + 1,
          averageLatencyMs: avgLatency,
          p50LatencyMs: calculatePercentile(newLatencies, 50),
          p95LatencyMs: calculatePercentile(newLatencies, 95),
          latencies: newLatencies,
        };
      });

      setCurrentStage("dispatched");
      setIsProcessing(false);

      callbacks?.onInputProcessed?.(processed);

      return processed;
    },
    [
      isActive,
      isPaused,
      fullConfig,
      gestureState,
      normalizeInput,
      calculateVelocity,
      predictInput,
      callbacks,
    ]
  );

  /**
   * Get predicted next input
   */
  const getPredictedInput = useCallback(
    (deltaMs: number): ProcessedInput["predicted"] | null => {
      const lastInput = bufferRef.current[bufferRef.current.length - 1];
      if (!lastInput) return null;

      return predictInput(
        lastInput.normalized.x,
        lastInput.normalized.y,
        velocityRef.current,
        deltaMs
      );
    },
    [predictInput]
  );

  /**
   * Start gesture tracking
   */
  const startGesture = useCallback(
    (x: number, y: number): void => {
      gestureStartTimeRef.current = performance.now();
      inputHistoryRef.current = [];
      velocityRef.current = { x: 0, y: 0 };

      setGestureState({
        currentGesture: null,
        startPosition: { x, y },
        currentPosition: { x, y },
        velocity: { x: 0, y: 0 },
        duration: 0,
        distance: 0,
      });

      // Set up long press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }

      longPressTimerRef.current = setTimeout(() => {
        setGestureState((prev) => {
          if (prev.distance < fullConfig.minGestureDistance) {
            const newState = { ...prev, currentGesture: "long_press" as GestureType };
            callbacks?.onGestureDetected?.("long_press", newState);
            return newState;
          }
          return prev;
        });
      }, fullConfig.longPressThreshold);
    },
    [fullConfig, callbacks]
  );

  /**
   * Update gesture position
   */
  const updateGesture = useCallback(
    (x: number, y: number): void => {
      setGestureState((prev) => {
        if (!prev.startPosition) return prev;

        const dx = x - prev.startPosition.x;
        const dy = y - prev.startPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const duration = performance.now() - gestureStartTimeRef.current;

        // Cancel long press if moved too much
        if (distance >= fullConfig.minGestureDistance && longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        return {
          ...prev,
          currentPosition: { x, y },
          velocity: velocityRef.current,
          duration,
          distance,
        };
      });
    },
    [fullConfig.minGestureDistance]
  );

  /**
   * End gesture tracking (using pre-computed initial state)
   */
  const endGesture = useCallback((): GestureType | null => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const gesture = detectGesture(gestureState);

    // Check for double tap
    if (gesture === "tap") {
      const now = performance.now();
      if (now - lastTapTimeRef.current < fullConfig.doubleTapThreshold) {
        callbacks?.onGestureDetected?.("double_tap", gestureState);
        setMetrics((prev) => ({
          ...prev,
          gesturesDetected: prev.gesturesDetected + 1,
        }));
        lastTapTimeRef.current = 0;

        setGestureState(INITIAL_GESTURE_STATE);

        return "double_tap";
      }
      lastTapTimeRef.current = now;
    }

    if (gesture) {
      callbacks?.onGestureDetected?.(gesture, gestureState);
      setMetrics((prev) => ({
        ...prev,
        gesturesDetected: prev.gesturesDetected + 1,
      }));
    }

    setGestureState(INITIAL_GESTURE_STATE);

    return gesture;
  }, [gestureState, fullConfig.doubleTapThreshold, detectGesture, callbacks]);

  /**
   * Cancel gesture (using pre-computed initial state)
   */
  const cancelGesture = useCallback((): void => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    setGestureState(INITIAL_GESTURE_STATE);
  }, []);

  /**
   * Pause pipeline
   */
  const pause = useCallback((): void => {
    setIsPaused(true);
  }, []);

  /**
   * Resume pipeline
   */
  const resume = useCallback((): void => {
    setIsPaused(false);
  }, []);

  /**
   * Flush buffer
   */
  const flushBuffer = useCallback((): ProcessedInput[] => {
    const flushed = [...bufferRef.current];
    bufferRef.current = [];
    return flushed;
  }, []);

  /**
   * Clear buffer
   */
  const clearBuffer = useCallback((): void => {
    bufferRef.current = [];
  }, []);

  /**
   * Reset metrics (using pre-computed initial state)
   */
  const resetMetrics = useCallback((): void => {
    setMetrics({ ...INITIAL_METRICS, latencies: [] });
  }, []);

  /**
   * Get buffer state
   */
  const getBufferState = useCallback((): InputBuffer => {
    return {
      inputs: [...bufferRef.current],
      capacity: fullConfig.bufferCapacity,
      head: 0,
      tail: bufferRef.current.length,
      size: bufferRef.current.length,
    };
  }, [fullConfig.bufferCapacity]);

  /**
   * Get current gesture
   */
  const getCurrentGesture = useCallback((): GestureState => {
    return gestureState;
  }, [gestureState]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Compile state
  const state: PipelineState = useMemo(
    () => ({
      isActive,
      currentStage,
      queueSize: bufferRef.current.length,
      isProcessing,
      isPaused,
      gestureState,
      averageLatencyMs: metrics.averageLatencyMs,
    }),
    [isActive, currentStage, isProcessing, isPaused, gestureState, metrics.averageLatencyMs]
  );

  // Compile controls
  const controls: PipelineControls = useMemo(
    () => ({
      processInput,
      getPredictedInput,
      getCurrentGesture,
      startGesture,
      updateGesture,
      endGesture,
      cancelGesture,
      pause,
      resume,
      flushBuffer,
      clearBuffer,
      resetMetrics,
      getBufferState,
    }),
    [
      processInput,
      getPredictedInput,
      getCurrentGesture,
      startGesture,
      updateGesture,
      endGesture,
      cancelGesture,
      pause,
      resume,
      flushBuffer,
      clearBuffer,
      resetMetrics,
      getBufferState,
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
 * Simple gesture detection hook
 */
export function useGestureDetection(
  onGesture: (gesture: GestureType, state: GestureState) => void
): {
  startTouch: (x: number, y: number) => void;
  moveTouch: (x: number, y: number) => void;
  endTouch: () => GestureType | null;
} {
  const { controls } = useMobileInputPipeline(
    { enableGestureRecognition: true },
    { onGestureDetected: onGesture }
  );

  return {
    startTouch: controls.startGesture,
    moveTouch: controls.updateGesture,
    endTouch: controls.endGesture,
  };
}

/**
 * Input prediction hook
 */
export function useInputPrediction(
  x: number,
  y: number,
  deltaMs: number
): { x: number; y: number; confidence: number } | null {
  const { controls } = useMobileInputPipeline({ enablePrediction: true });
  const processInputRef = useRef(controls.processInput);
  const getPredictedInputRef = useRef(controls.getPredictedInput);

  // Update refs when controls change
  processInputRef.current = controls.processInput;
  getPredictedInputRef.current = controls.getPredictedInput;

  useEffect(() => {
    processInputRef.current({ type: "pointer", x, y });
  }, [x, y]);

  const predicted = getPredictedInputRef.current(deltaMs);
  if (!predicted) return null;
  return predicted;
}

export default useMobileInputPipeline;
