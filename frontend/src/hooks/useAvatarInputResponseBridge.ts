/**
 * useAvatarInputResponseBridge - Sprint 536
 *
 * Bridges user input to avatar visual response with minimal perceived lag.
 * Features:
 * - Input queue management for smooth processing
 * - Immediate visual feedback while processing
 * - Response interpolation for smooth transitions
 * - Input coalescing for performance
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type InputType = "tap" | "move" | "swipe" | "pinch" | "press";
export type EasingType = "linear" | "easeIn" | "easeOut" | "easeInOut";

export interface Position {
  x: number;
  y: number;
}

export interface QueuedInput {
  type: InputType;
  position: Position;
  timestamp: number;
  id?: string;
}

export interface ImmediateFeedback {
  isActive: boolean;
  position: Position;
  inputType: InputType | null;
}

export interface BridgeConfig {
  maxQueueSize: number;
  coalesceThresholdMs: number;
  immediateResponseEnabled: boolean;
}

export interface BridgeCallbacks {
  onInputQueued?: (input: QueuedInput) => void;
  onResponseSent?: (input: QueuedInput, responseTime: number) => void;
  onInputDropped?: (input: QueuedInput) => void;
}

export interface BridgeState {
  isActive: boolean;
  pendingInputs: number;
  isProcessing: boolean;
  lastResponseTime: number;
}

export interface BridgeMetrics {
  inputsProcessed: number;
  droppedInputs: number;
  averageResponseTime: number;
  totalResponseTime: number;
}

export interface BridgeControls {
  queueInput: (input: QueuedInput) => void;
  processQueue: () => void;
  clearQueue: () => void;
  getImmediateFeedback: () => ImmediateFeedback;
  clearFeedback: () => void;
  interpolateResponse: (start: Position, end: Position, t: number) => Position;
  resetMetrics: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: BridgeConfig = {
  maxQueueSize: 10,
  coalesceThresholdMs: 16,
  immediateResponseEnabled: true,
};

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarInputResponseBridge(
  config: Partial<BridgeConfig> = {},
  callbacks: BridgeCallbacks = {}
): { state: BridgeState; metrics: BridgeMetrics; controls: BridgeControls } {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [pendingInputs, setPendingInputs] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResponseTime, setLastResponseTime] = useState(0);

  // Metrics state
  const [inputsProcessed, setInputsProcessed] = useState(0);
  const [droppedInputs, setDroppedInputs] = useState(0);
  const [totalResponseTime, setTotalResponseTime] = useState(0);

  // Feedback state
  const [feedbackActive, setFeedbackActive] = useState(false);
  const [feedbackPosition, setFeedbackPosition] = useState<Position>({ x: 0, y: 0 });
  const [feedbackInputType, setFeedbackInputType] = useState<InputType | null>(null);

  // Refs
  const queueRef = useRef<QueuedInput[]>([]);
  const lastInputTimeRef = useRef(0);
  const lastInputTypeRef = useRef<InputType | null>(null);

  // Cleanup
  useEffect(() => {
    return () => {
      queueRef.current = [];
    };
  }, []);

  // Queue input
  const queueInput = useCallback((input: QueuedInput) => {
    const now = performance.now();
    const timeSinceLastInput = now - lastInputTimeRef.current;

    // Check if we should coalesce with previous input
    if (
      lastInputTypeRef.current === input.type &&
      timeSinceLastInput < mergedConfig.coalesceThresholdMs &&
      queueRef.current.length > 0
    ) {
      // Update the last input instead of adding new one
      const lastIdx = queueRef.current.length - 1;
      queueRef.current[lastIdx] = input;
      // Don't increment pending count since we replaced
    } else {
      // Check queue size
      if (queueRef.current.length >= mergedConfig.maxQueueSize) {
        // Drop oldest input
        const dropped = queueRef.current.shift();
        if (dropped) {
          setDroppedInputs(prev => prev + 1);
          callbacks.onInputDropped?.(dropped);
        }
      }

      queueRef.current.push(input);
      setPendingInputs(queueRef.current.length);
    }

    lastInputTimeRef.current = now;
    lastInputTypeRef.current = input.type;

    // Set immediate feedback
    if (mergedConfig.immediateResponseEnabled) {
      setFeedbackActive(true);
      setFeedbackPosition(input.position);
      setFeedbackInputType(input.type);
    }

    callbacks.onInputQueued?.(input);
  }, [mergedConfig.maxQueueSize, mergedConfig.coalesceThresholdMs, mergedConfig.immediateResponseEnabled, callbacks]);

  // Process queue
  const processQueue = useCallback(() => {
    if (queueRef.current.length === 0) return;

    setIsProcessing(true);

    while (queueRef.current.length > 0) {
      const input = queueRef.current.shift();
      if (input) {
        const responseTime = performance.now() - input.timestamp;
        setLastResponseTime(responseTime);
        setTotalResponseTime(prev => prev + responseTime);
        setInputsProcessed(prev => prev + 1);
        callbacks.onResponseSent?.(input, responseTime);
      }
    }

    setPendingInputs(0);
    setIsProcessing(false);
  }, [callbacks]);

  // Clear queue
  const clearQueue = useCallback(() => {
    queueRef.current = [];
    setPendingInputs(0);
  }, []);

  // Get immediate feedback
  const getImmediateFeedback = useCallback((): ImmediateFeedback => {
    return {
      isActive: feedbackActive,
      position: feedbackPosition,
      inputType: feedbackInputType,
    };
  }, [feedbackActive, feedbackPosition, feedbackInputType]);

  // Clear feedback
  const clearFeedback = useCallback(() => {
    setFeedbackActive(false);
    setFeedbackInputType(null);
  }, []);

  // Interpolate response
  const interpolateResponse = useCallback((start: Position, end: Position, t: number): Position => {
    const clamped = Math.max(0, Math.min(1, t));
    return {
      x: start.x + (end.x - start.x) * clamped,
      y: start.y + (end.y - start.y) * clamped,
    };
  }, []);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    setInputsProcessed(0);
    setDroppedInputs(0);
    setTotalResponseTime(0);
    setLastResponseTime(0);
  }, []);

  // Computed values
  const averageResponseTime = useMemo(() => {
    if (inputsProcessed === 0) return 0;
    return totalResponseTime / inputsProcessed;
  }, [totalResponseTime, inputsProcessed]);

  // Return values
  const state: BridgeState = useMemo(() => ({
    isActive: true,
    pendingInputs,
    isProcessing,
    lastResponseTime,
  }), [pendingInputs, isProcessing, lastResponseTime]);

  const metrics: BridgeMetrics = useMemo(() => ({
    inputsProcessed,
    droppedInputs,
    averageResponseTime,
    totalResponseTime,
  }), [inputsProcessed, droppedInputs, averageResponseTime, totalResponseTime]);

  const controls: BridgeControls = useMemo(() => ({
    queueInput,
    processQueue,
    clearQueue,
    getImmediateFeedback,
    clearFeedback,
    interpolateResponse,
    resetMetrics,
  }), [
    queueInput,
    processQueue,
    clearQueue,
    getImmediateFeedback,
    clearFeedback,
    interpolateResponse,
    resetMetrics,
  ]);

  return { state, metrics, controls };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useInputQueue<T = unknown>(): {
  enqueue: (item: T) => void;
  dequeue: () => T | undefined;
  clear: () => void;
  size: number;
  peek: () => T | undefined;
} {
  const [size, setSize] = useState(0);
  const queueRef = useRef<T[]>([]);

  const enqueue = useCallback((item: T) => {
    queueRef.current.push(item);
    setSize(queueRef.current.length);
  }, []);

  const dequeue = useCallback((): T | undefined => {
    const item = queueRef.current.shift();
    setSize(queueRef.current.length);
    return item;
  }, []);

  const clear = useCallback(() => {
    queueRef.current = [];
    setSize(0);
  }, []);

  const peek = useCallback((): T | undefined => {
    return queueRef.current[0];
  }, []);

  return { enqueue, dequeue, clear, size, peek };
}

export function useResponseInterpolator(): {
  lerp: (a: number, b: number, t: number) => number;
  lerpPosition: (start: Position, end: Position, t: number) => Position;
  ease: (t: number, type: EasingType) => number;
} {
  const lerp = useCallback((a: number, b: number, t: number): number => {
    const clamped = Math.max(0, Math.min(1, t));
    return a + (b - a) * clamped;
  }, []);

  const lerpPosition = useCallback((start: Position, end: Position, t: number): Position => {
    const clamped = Math.max(0, Math.min(1, t));
    return {
      x: start.x + (end.x - start.x) * clamped,
      y: start.y + (end.y - start.y) * clamped,
    };
  }, []);

  const ease = useCallback((t: number, type: EasingType): number => {
    const clamped = Math.max(0, Math.min(1, t));
    switch (type) {
      case "easeIn":
        return clamped * clamped;
      case "easeOut":
        return clamped * (2 - clamped);
      case "easeInOut":
        return clamped < 0.5 
          ? 2 * clamped * clamped 
          : -1 + (4 - 2 * clamped) * clamped;
      case "linear":
      default:
        return clamped;
    }
  }, []);

  return { lerp, lerpPosition, ease };
}

export default useAvatarInputResponseBridge;
