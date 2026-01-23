/**
 * useAvatarGestureResponseAccelerator - Sprint 533
 *
 * Optimizes gesture-to-avatar response pipeline for minimal latency.
 * Provides predictive gesture recognition, instant visual feedback,
 * and priority-based avatar response scheduling.
 *
 * Features:
 * - Predictive gesture recognition from partial touch data
 * - Instant visual feedback (< 16ms target)
 * - Priority-based avatar response scheduling
 * - Latency compensation for network and device capability
 * - Custom gesture-to-avatar response mapping
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type GestureType = "tap" | "swipe" | "longPress" | "pinch" | "pan" | "rotate";

export type AvatarResponseType =
  | "acknowledge"
  | "track"
  | "focus"
  | "scale"
  | "turn"
  | "smile"
  | "nod"
  | "blink"
  | "custom";

export type FeedbackMode = "instant" | "predictive" | "delayed";

export type ResponsePriority = "high" | "normal" | "low";

export type DeviceCapability = "high" | "medium" | "low";

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  x: number;
  y: number;
}

export interface GestureInput {
  type: GestureType;
  position: Position;
  timestamp: number;
  direction?: string;
  velocity?: number;
  duration?: number;
  scale?: number;
  center?: Position;
}

export interface GestureIntent {
  gestureType: GestureType;
  avatarResponse: AvatarResponseType | string;
  confidence: number;
  position: Position;
  timestamp: number;
}

export interface PredictionInput {
  touchStart: Position;
  currentPosition: Position;
  velocity: Velocity;
  elapsed: number;
}

export interface ScheduledResponse {
  id: string;
  type: AvatarResponseType | string;
  priority: ResponsePriority;
  delay: number;
  createdAt: number;
  scheduledAt: number;
}

export interface InstantFeedback {
  feedbackType: string;
  position: Position;
  timestamp: number;
}

export interface AcceleratorConfig {
  feedbackMode: FeedbackMode;
  targetResponseTimeMs: number;
  maxQueuedResponses: number;
  deviceCapability: DeviceCapability;
  gestureMapping: Partial<Record<GestureType, AvatarResponseType | string>>;
}

export interface AcceleratorCallbacks {
  onInstantFeedback?: (feedback: InstantFeedback) => void;
  onResponseExecuted?: (response: ScheduledResponse) => void;
  onGestureRecognized?: (intent: GestureIntent) => void;
}

export interface AcceleratorState {
  isActive: boolean;
  currentGesture: GestureType | null;
  pendingResponses: number;
  feedbackMode: FeedbackMode;
  predictionConfidence: number;
  latencyCompensation: number;
  targetFrameTimeMs: number;
}

export interface AcceleratorMetrics {
  averageResponseTimeMs: number;
  gesturesProcessed: number;
  feedbackLatencyMs: number;
  predictionAccuracy: number;
  responsesExecuted: number;
}

export interface AcceleratorControls {
  recognizeGesture: (input: GestureInput) => GestureIntent | null;
  triggerInstantFeedback: (gesture: GestureType, position: Position) => void;
  scheduleAvatarResponse: (response: {
    type: AvatarResponseType | string;
    priority: ResponsePriority;
    delay: number;
  }) => string;
  cancelResponse: (id: string) => void;
  predictGestureIntent: (input: PredictionInput) => GestureIntent | null;
  confirmPrediction: (correct: boolean) => void;
  setNetworkLatency: (latencyMs: number) => void;
  markResponseComplete: (id: string) => void;
  getAvatarResponseForGesture: (gesture: GestureType) => AvatarResponseType | string;
  resetMetrics: () => void;
}

export interface UseAvatarGestureResponseAcceleratorResult {
  state: AcceleratorState;
  metrics: AcceleratorMetrics;
  controls: AcceleratorControls;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: AcceleratorConfig = {
  feedbackMode: "instant",
  targetResponseTimeMs: 16,
  maxQueuedResponses: 10,
  deviceCapability: "high",
  gestureMapping: {},
};

const DEFAULT_GESTURE_MAPPING: Record<GestureType, AvatarResponseType> = {
  tap: "acknowledge",
  swipe: "track",
  longPress: "focus",
  pinch: "scale",
  pan: "track",
  rotate: "turn",
};

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return "response_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

function getTargetFrameTime(capability: DeviceCapability): number {
  switch (capability) {
    case "high":
      return 16.67;
    case "medium":
      return 20;
    case "low":
      return 33.33;
    default:
      return 16.67;
  }
}

function predictGestureFromVelocity(velocity: Velocity, elapsed: number): GestureType {
  const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

  if (speed > 100 && elapsed < 300) {
    return "swipe";
  } else if (elapsed > 500) {
    return "longPress";
  }
  return "tap";
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarGestureResponseAccelerator(
  config: Partial<AcceleratorConfig> = {},
  callbacks: AcceleratorCallbacks = {}
): UseAvatarGestureResponseAcceleratorResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  const gestureMapping = useMemo(
    () => ({ ...DEFAULT_GESTURE_MAPPING, ...mergedConfig.gestureMapping }),
    [mergedConfig.gestureMapping]
  );

  const [isActive] = useState(true);
  const [currentGesture, setCurrentGesture] = useState<GestureType | null>(null);
  const [pendingResponses, setPendingResponses] = useState(0);
  const [predictionConfidence, setPredictionConfidence] = useState(0);
  const [latencyCompensation, setLatencyCompensation] = useState(0);

  const [gesturesProcessed, setGesturesProcessed] = useState(0);
  const [feedbackLatencyMs, setFeedbackLatencyMs] = useState(0);
  const [responsesExecuted, setResponsesExecuted] = useState(0);

  const responseQueueRef = useRef<ScheduledResponse[]>([]);
  const responseTimesRef = useRef<number[]>([]);
  const predictionResultsRef = useRef<boolean[]>([]);
  const lastFeedbackTimeRef = useRef(0);
  const timerIdsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    return () => {
      timerIdsRef.current.forEach((timerId) => clearTimeout(timerId));
      timerIdsRef.current.clear();
    };
  }, []);

  const targetFrameTimeMs = useMemo(
    () => getTargetFrameTime(mergedConfig.deviceCapability),
    [mergedConfig.deviceCapability]
  );

  const getAvatarResponseForGesture = useCallback(
    (gesture: GestureType): AvatarResponseType | string => {
      return gestureMapping[gesture] || "acknowledge";
    },
    [gestureMapping]
  );

  const recognizeGesture = useCallback(
    (input: GestureInput): GestureIntent | null => {
      const avatarResponse = getAvatarResponseForGesture(input.type);

      const intent: GestureIntent = {
        gestureType: input.type,
        avatarResponse,
        confidence: 1.0,
        position: input.position,
        timestamp: input.timestamp,
      };

      setCurrentGesture(input.type);
      setGesturesProcessed((prev) => prev + 1);
      callbacks.onGestureRecognized?.(intent);

      return intent;
    },
    [getAvatarResponseForGesture, callbacks]
  );

  const triggerInstantFeedback = useCallback(
    (gesture: GestureType, position: Position) => {
      const now = performance.now();
      const latency = now - lastFeedbackTimeRef.current;
      lastFeedbackTimeRef.current = now;

      if (latency > 0 && latency < 1000) {
        setFeedbackLatencyMs(latency);
      }

      const feedback: InstantFeedback = {
        feedbackType: "highlight",
        position,
        timestamp: now,
      };

      callbacks.onInstantFeedback?.(feedback);
      setPendingResponses((prev) => prev + 1);
    },
    [callbacks]
  );

  const scheduleAvatarResponse = useCallback(
    (response: {
      type: AvatarResponseType | string;
      priority: ResponsePriority;
      delay: number;
    }): string => {
      const id = generateId();
      const now = performance.now();

      const scheduledResponse: ScheduledResponse = {
        id,
        type: response.type,
        priority: response.priority,
        delay: response.delay,
        createdAt: now,
        scheduledAt: now + response.delay,
      };

      if (responseQueueRef.current.length >= mergedConfig.maxQueuedResponses) {
        responseQueueRef.current.sort((a, b) => {
          const priorityOrder = { high: 0, normal: 1, low: 2 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
        const removed = responseQueueRef.current.pop();
        if (removed) {
          const timerId = timerIdsRef.current.get(removed.id);
          if (timerId) {
            clearTimeout(timerId);
            timerIdsRef.current.delete(removed.id);
          }
        }
      }

      responseQueueRef.current.push(scheduledResponse);
      setPendingResponses(responseQueueRef.current.length);

      const timerId = setTimeout(() => {
        callbacks.onResponseExecuted?.(scheduledResponse);
        responseQueueRef.current = responseQueueRef.current.filter((r) => r.id !== id);
        setPendingResponses(responseQueueRef.current.length);
        setResponsesExecuted((prev) => prev + 1);
        timerIdsRef.current.delete(id);
      }, response.delay + latencyCompensation);

      timerIdsRef.current.set(id, timerId);

      return id;
    },
    [mergedConfig.maxQueuedResponses, latencyCompensation, callbacks]
  );

  const cancelResponse = useCallback((id: string) => {
    const timerId = timerIdsRef.current.get(id);
    if (timerId) {
      clearTimeout(timerId);
      timerIdsRef.current.delete(id);
    }

    responseQueueRef.current = responseQueueRef.current.filter((r) => r.id !== id);
    setPendingResponses(responseQueueRef.current.length);
  }, []);

  const predictGestureIntent = useCallback(
    (input: PredictionInput): GestureIntent | null => {
      const predictedGesture = predictGestureFromVelocity(input.velocity, input.elapsed);
      const avatarResponse = getAvatarResponseForGesture(predictedGesture);

      const speed = Math.sqrt(
        input.velocity.x * input.velocity.x + input.velocity.y * input.velocity.y
      );
      const confidence = Math.min(0.9, speed / 500);

      setPredictionConfidence(confidence);

      return {
        gestureType: predictedGesture,
        avatarResponse,
        confidence,
        position: input.currentPosition,
        timestamp: performance.now(),
      };
    },
    [getAvatarResponseForGesture]
  );

  const confirmPrediction = useCallback((correct: boolean) => {
    predictionResultsRef.current.push(correct);

    if (predictionResultsRef.current.length > 20) {
      predictionResultsRef.current.shift();
    }

    const correctCount = predictionResultsRef.current.filter((r) => r).length;
    const accuracy = correctCount / predictionResultsRef.current.length;

    setPredictionConfidence(accuracy);
  }, []);

  const setNetworkLatency = useCallback((latencyMs: number) => {
    setLatencyCompensation(latencyMs * 0.5);
  }, []);

  const markResponseComplete = useCallback((id: string) => {
    const response = responseQueueRef.current.find((r) => r.id === id);
    if (response) {
      const responseTime = performance.now() - response.createdAt;
      responseTimesRef.current.push(responseTime);

      if (responseTimesRef.current.length > 50) {
        responseTimesRef.current.shift();
      }

      responseQueueRef.current = responseQueueRef.current.filter((r) => r.id !== id);
      setPendingResponses(responseQueueRef.current.length);
      setResponsesExecuted((prev) => prev + 1);
    }
  }, []);

  const resetMetrics = useCallback(() => {
    setGesturesProcessed(0);
    setFeedbackLatencyMs(0);
    setResponsesExecuted(0);
    responseTimesRef.current = [];
    predictionResultsRef.current = [];
    setPredictionConfidence(0);
  }, []);

  const averageResponseTimeMs = useMemo(() => {
    if (responseTimesRef.current.length === 0) return 0;
    return (
      responseTimesRef.current.reduce((a, b) => a + b, 0) /
      responseTimesRef.current.length
    );
  }, [responsesExecuted]);

  const predictionAccuracy = useMemo(() => {
    if (predictionResultsRef.current.length === 0) return 0;
    const correct = predictionResultsRef.current.filter((r) => r).length;
    return correct / predictionResultsRef.current.length;
  }, [predictionConfidence]);

  const state: AcceleratorState = useMemo(
    () => ({
      isActive,
      currentGesture,
      pendingResponses,
      feedbackMode: mergedConfig.feedbackMode,
      predictionConfidence,
      latencyCompensation,
      targetFrameTimeMs,
    }),
    [
      isActive,
      currentGesture,
      pendingResponses,
      mergedConfig.feedbackMode,
      predictionConfidence,
      latencyCompensation,
      targetFrameTimeMs,
    ]
  );

  const metrics: AcceleratorMetrics = useMemo(
    () => ({
      averageResponseTimeMs,
      gesturesProcessed,
      feedbackLatencyMs,
      predictionAccuracy,
      responsesExecuted,
    }),
    [
      averageResponseTimeMs,
      gesturesProcessed,
      feedbackLatencyMs,
      predictionAccuracy,
      responsesExecuted,
    ]
  );

  const controls: AcceleratorControls = useMemo(
    () => ({
      recognizeGesture,
      triggerInstantFeedback,
      scheduleAvatarResponse,
      cancelResponse,
      predictGestureIntent,
      confirmPrediction,
      setNetworkLatency,
      markResponseComplete,
      getAvatarResponseForGesture,
      resetMetrics,
    }),
    [
      recognizeGesture,
      triggerInstantFeedback,
      scheduleAvatarResponse,
      cancelResponse,
      predictGestureIntent,
      confirmPrediction,
      setNetworkLatency,
      markResponseComplete,
      getAvatarResponseForGesture,
      resetMetrics,
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

export function useInstantAvatarFeedback(
  onFeedback?: (feedback: InstantFeedback) => void
): {
  trigger: (position: Position) => void;
  cancel: () => void;
  isActive: boolean;
} {
  const [isActive, setIsActive] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const trigger = useCallback(
    (position: Position) => {
      setIsActive(true);

      const feedback: InstantFeedback = {
        feedbackType: "highlight",
        position,
        timestamp: performance.now(),
      };

      onFeedback?.(feedback);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setIsActive(false);
      }, 100);
    },
    [onFeedback]
  );

  const cancel = useCallback(() => {
    setIsActive(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    trigger,
    cancel,
    isActive,
  };
}

export function useGesturePrioritizedResponse(): {
  schedule: (type: AvatarResponseType | string, priority: ResponsePriority) => string;
  cancel: (id: string) => void;
  flush: () => void;
  pending: number;
} {
  const [pending, setPending] = useState(0);
  const queueRef = useRef<{ id: string; timerId: NodeJS.Timeout }[]>([]);

  const schedule = useCallback(
    (type: AvatarResponseType | string, priority: ResponsePriority): string => {
      const id = "response_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      const delay = priority === "high" ? 0 : priority === "normal" ? 16 : 50;

      const timerId = setTimeout(() => {
        queueRef.current = queueRef.current.filter((item) => item.id !== id);
        setPending(queueRef.current.length);
      }, delay);

      queueRef.current.push({ id, timerId });
      setPending(queueRef.current.length);

      return id;
    },
    []
  );

  const cancel = useCallback((id: string) => {
    const item = queueRef.current.find((i) => i.id === id);
    if (item) {
      clearTimeout(item.timerId);
      queueRef.current = queueRef.current.filter((i) => i.id !== id);
      setPending(queueRef.current.length);
    }
  }, []);

  const flush = useCallback(() => {
    queueRef.current.forEach((item) => clearTimeout(item.timerId));
    queueRef.current = [];
    setPending(0);
  }, []);

  useEffect(() => {
    return () => {
      queueRef.current.forEach((item) => clearTimeout(item.timerId));
    };
  }, []);

  return {
    schedule,
    cancel,
    flush,
    pending,
  };
}

export default useAvatarGestureResponseAccelerator;
