/**
 * useAvatarMicroInteractions Hook - Sprint 511
 *
 * Fine-grained micro-interactions for enhanced avatar UX.
 * Provides subtle, responsive feedback that makes the avatar feel more alive.
 *
 * Features:
 * - Micro-reactions to user input (typing, pausing, hovering)
 * - Attention cues (head tilt, eye widening, focus indicators)
 * - Emotional micro-expressions (subtle smile shifts, brow raises)
 * - Anticipation animations (preparing to speak/listen)
 * - Interruptibility signals (showing readiness for user input)
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type MicroInteractionType =
  | "attention_shift"
  | "typing_acknowledgment"
  | "pause_curiosity"
  | "hover_recognition"
  | "speech_preparation"
  | "listening_readiness"
  | "thought_processing"
  | "empathy_signal"
  | "encouragement"
  | "understanding_nod";

export type InteractionIntensity = "subtle" | "moderate" | "expressive";

export interface MicroInteraction {
  type: MicroInteractionType;
  intensity: InteractionIntensity;
  duration: number; // ms
  blendShapes: Record<string, number>;
  headMovement?: { x: number; y: number; z: number };
  eyeMovement?: { x: number; y: number };
  timestamp: number;
}

export interface MicroInteractionTrigger {
  event: string;
  condition?: () => boolean;
  interaction: MicroInteractionType;
  intensity: InteractionIntensity;
  cooldown: number; // ms
  priority: number;
}

export interface MicroInteractionState {
  active: MicroInteraction | null;
  queue: MicroInteraction[];
  lastTriggered: Record<MicroInteractionType, number>;
  isProcessing: boolean;
}

export interface MicroInteractionMetrics {
  totalTriggered: number;
  averageResponseTime: number;
  interactionCounts: Record<MicroInteractionType, number>;
  userEngagementScore: number;
}

export interface MicroInteractionConfig {
  enabled: boolean;
  maxQueueSize: number;
  baseIntensity: InteractionIntensity;
  responsiveness: number; // 0-1, how quickly to react
  naturalness: number; // 0-1, randomization factor
  reduceOnLowFPS: boolean;
  fpsThreshold: number;
}

export interface MicroInteractionControls {
  trigger: (type: MicroInteractionType, intensity?: InteractionIntensity) => void;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  setIntensity: (intensity: InteractionIntensity) => void;
  clearQueue: () => void;
}

export interface UseAvatarMicroInteractionsResult {
  state: MicroInteractionState;
  metrics: MicroInteractionMetrics;
  controls: MicroInteractionControls;
  currentBlendShapes: Record<string, number>;
  currentHeadMovement: { x: number; y: number; z: number };
  currentEyeMovement: { x: number; y: number };
  isPaused: boolean;
}

// ============================================================================
// Constants - Micro-interaction definitions
// ============================================================================

const INTERACTION_DEFINITIONS: Record<
  MicroInteractionType,
  {
    blendShapes: Record<InteractionIntensity, Record<string, number>>;
    headMovement?: Record<InteractionIntensity, { x: number; y: number; z: number }>;
    eyeMovement?: Record<InteractionIntensity, { x: number; y: number }>;
    duration: Record<InteractionIntensity, number>;
  }
> = {
  attention_shift: {
    blendShapes: {
      subtle: { eyeWideL: 0.05, eyeWideR: 0.05 },
      moderate: { eyeWideL: 0.1, eyeWideR: 0.1, browInnerUp: 0.05 },
      expressive: { eyeWideL: 0.15, eyeWideR: 0.15, browInnerUp: 0.1 },
    },
    headMovement: {
      subtle: { x: 2, y: 0, z: 0 },
      moderate: { x: 5, y: 2, z: 0 },
      expressive: { x: 8, y: 4, z: 2 },
    },
    duration: { subtle: 200, moderate: 300, expressive: 400 },
  },
  typing_acknowledgment: {
    blendShapes: {
      subtle: { mouthSmileL: 0.02, mouthSmileR: 0.02 },
      moderate: { mouthSmileL: 0.05, mouthSmileR: 0.05, eyeSquintL: 0.03, eyeSquintR: 0.03 },
      expressive: { mouthSmileL: 0.1, mouthSmileR: 0.1, eyeSquintL: 0.05, eyeSquintR: 0.05 },
    },
    eyeMovement: {
      subtle: { x: 0, y: -2 },
      moderate: { x: 0, y: -5 },
      expressive: { x: 0, y: -8 },
    },
    duration: { subtle: 150, moderate: 250, expressive: 350 },
  },
  pause_curiosity: {
    blendShapes: {
      subtle: { browInnerUp: 0.05, browOuterUpL: 0.03, browOuterUpR: 0.03 },
      moderate: { browInnerUp: 0.1, browOuterUpL: 0.06, browOuterUpR: 0.06, eyeWideL: 0.05, eyeWideR: 0.05 },
      expressive: { browInnerUp: 0.15, browOuterUpL: 0.1, browOuterUpR: 0.1, eyeWideL: 0.1, eyeWideR: 0.1 },
    },
    headMovement: {
      subtle: { x: 0, y: 3, z: 5 },
      moderate: { x: 0, y: 5, z: 8 },
      expressive: { x: 0, y: 8, z: 12 },
    },
    duration: { subtle: 400, moderate: 600, expressive: 800 },
  },
  hover_recognition: {
    blendShapes: {
      subtle: { eyeSquintL: 0.02, eyeSquintR: 0.02 },
      moderate: { eyeSquintL: 0.05, eyeSquintR: 0.05, mouthSmileL: 0.03, mouthSmileR: 0.03 },
      expressive: { eyeSquintL: 0.08, eyeSquintR: 0.08, mouthSmileL: 0.06, mouthSmileR: 0.06 },
    },
    duration: { subtle: 100, moderate: 150, expressive: 200 },
  },
  speech_preparation: {
    blendShapes: {
      subtle: { jawOpen: 0.02, mouthFunnel: 0.02 },
      moderate: { jawOpen: 0.05, mouthFunnel: 0.04, mouthPucker: 0.02 },
      expressive: { jawOpen: 0.08, mouthFunnel: 0.06, mouthPucker: 0.04 },
    },
    headMovement: {
      subtle: { x: 0, y: 1, z: 0 },
      moderate: { x: 0, y: 2, z: -1 },
      expressive: { x: 0, y: 3, z: -2 },
    },
    duration: { subtle: 100, moderate: 150, expressive: 200 },
  },
  listening_readiness: {
    blendShapes: {
      subtle: { eyeWideL: 0.03, eyeWideR: 0.03 },
      moderate: { eyeWideL: 0.06, eyeWideR: 0.06, browInnerUp: 0.03 },
      expressive: { eyeWideL: 0.1, eyeWideR: 0.1, browInnerUp: 0.06 },
    },
    headMovement: {
      subtle: { x: 3, y: 0, z: 2 },
      moderate: { x: 5, y: 2, z: 4 },
      expressive: { x: 8, y: 4, z: 6 },
    },
    duration: { subtle: 200, moderate: 300, expressive: 400 },
  },
  thought_processing: {
    blendShapes: {
      subtle: { eyeLookUpL: 0.1, eyeLookUpR: 0.1 },
      moderate: { eyeLookUpL: 0.2, eyeLookUpR: 0.2, browInnerUp: 0.05 },
      expressive: { eyeLookUpL: 0.3, eyeLookUpR: 0.3, browInnerUp: 0.1, mouthPucker: 0.05 },
    },
    headMovement: {
      subtle: { x: -2, y: 5, z: 0 },
      moderate: { x: -4, y: 8, z: 2 },
      expressive: { x: -6, y: 12, z: 4 },
    },
    duration: { subtle: 500, moderate: 800, expressive: 1200 },
  },
  empathy_signal: {
    blendShapes: {
      subtle: { browInnerUp: 0.08, eyeSquintL: 0.03, eyeSquintR: 0.03 },
      moderate: { browInnerUp: 0.12, eyeSquintL: 0.06, eyeSquintR: 0.06, mouthSmileL: 0.04, mouthSmileR: 0.04 },
      expressive: { browInnerUp: 0.18, eyeSquintL: 0.1, eyeSquintR: 0.1, mouthSmileL: 0.08, mouthSmileR: 0.08 },
    },
    headMovement: {
      subtle: { x: 5, y: 0, z: 3 },
      moderate: { x: 8, y: 2, z: 5 },
      expressive: { x: 12, y: 4, z: 8 },
    },
    duration: { subtle: 300, moderate: 500, expressive: 700 },
  },
  encouragement: {
    blendShapes: {
      subtle: { mouthSmileL: 0.08, mouthSmileR: 0.08, eyeSquintL: 0.04, eyeSquintR: 0.04 },
      moderate: { mouthSmileL: 0.15, mouthSmileR: 0.15, eyeSquintL: 0.08, eyeSquintR: 0.08, cheekSquintL: 0.05, cheekSquintR: 0.05 },
      expressive: { mouthSmileL: 0.25, mouthSmileR: 0.25, eyeSquintL: 0.12, eyeSquintR: 0.12, cheekSquintL: 0.1, cheekSquintR: 0.1 },
    },
    headMovement: {
      subtle: { x: 0, y: -3, z: 0 },
      moderate: { x: 0, y: -5, z: 2 },
      expressive: { x: 0, y: -8, z: 4 },
    },
    duration: { subtle: 250, moderate: 400, expressive: 600 },
  },
  understanding_nod: {
    blendShapes: {
      subtle: { mouthSmileL: 0.03, mouthSmileR: 0.03 },
      moderate: { mouthSmileL: 0.06, mouthSmileR: 0.06, eyeSquintL: 0.03, eyeSquintR: 0.03 },
      expressive: { mouthSmileL: 0.1, mouthSmileR: 0.1, eyeSquintL: 0.06, eyeSquintR: 0.06 },
    },
    headMovement: {
      subtle: { x: 0, y: -5, z: 0 },
      moderate: { x: 0, y: -10, z: 0 },
      expressive: { x: 0, y: -15, z: 2 },
    },
    duration: { subtle: 200, moderate: 300, expressive: 400 },
  },
};

const DEFAULT_CONFIG: MicroInteractionConfig = {
  enabled: true,
  maxQueueSize: 5,
  baseIntensity: "moderate",
  responsiveness: 0.8,
  naturalness: 0.2,
  reduceOnLowFPS: true,
  fpsThreshold: 30,
};

// ============================================================================
// Utility functions
// ============================================================================

function createInteraction(
  type: MicroInteractionType,
  intensity: InteractionIntensity,
  naturalness: number
): MicroInteraction {
  const definition = INTERACTION_DEFINITIONS[type];

  // Apply naturalness variation
  const applyVariation = (value: number) => {
    const variation = 1 + (Math.random() - 0.5) * naturalness * 0.5;
    return value * variation;
  };

  const blendShapes: Record<string, number> = {};
  for (const [key, value] of Object.entries(definition.blendShapes[intensity])) {
    blendShapes[key] = applyVariation(value);
  }

  const headMovement = definition.headMovement
    ? {
        x: applyVariation(definition.headMovement[intensity].x),
        y: applyVariation(definition.headMovement[intensity].y),
        z: applyVariation(definition.headMovement[intensity].z),
      }
    : undefined;

  const eyeMovement = definition.eyeMovement
    ? {
        x: applyVariation(definition.eyeMovement[intensity].x),
        y: applyVariation(definition.eyeMovement[intensity].y),
      }
    : undefined;

  return {
    type,
    intensity,
    duration: definition.duration[intensity],
    blendShapes,
    headMovement,
    eyeMovement,
    timestamp: Date.now(),
  };
}

function interpolateValue(start: number, end: number, progress: number): number {
  // Ease-in-out cubic
  const t = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
  return start + (end - start) * t;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarMicroInteractions(
  config: Partial<MicroInteractionConfig> = {}
): UseAvatarMicroInteractionsResult {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [state, setState] = useState<MicroInteractionState>({
    active: null,
    queue: [],
    lastTriggered: {} as Record<MicroInteractionType, number>,
    isProcessing: false,
  });

  const [isPaused, setIsPaused] = useState(false);
  const [currentBlendShapes, setCurrentBlendShapes] = useState<Record<string, number>>({});
  const [currentHeadMovement, setCurrentHeadMovement] = useState({ x: 0, y: 0, z: 0 });
  const [currentEyeMovement, setCurrentEyeMovement] = useState({ x: 0, y: 0 });

  // Metrics tracking
  const metricsRef = useRef<MicroInteractionMetrics>({
    totalTriggered: 0,
    averageResponseTime: 0,
    interactionCounts: {} as Record<MicroInteractionType, number>,
    userEngagementScore: 0,
  });

  // Animation frame ref
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Process animation
  const processAnimation = useCallback(() => {
    if (!state.active || isPaused) {
      return;
    }

    const elapsed = Date.now() - startTimeRef.current;
    const progress = Math.min(elapsed / state.active.duration, 1);

    // Calculate current values with easing
    const newBlendShapes: Record<string, number> = {};
    for (const [key, targetValue] of Object.entries(state.active.blendShapes)) {
      if (progress < 0.5) {
        // Ramp up
        newBlendShapes[key] = interpolateValue(0, targetValue, progress * 2);
      } else {
        // Ramp down
        newBlendShapes[key] = interpolateValue(targetValue, 0, (progress - 0.5) * 2);
      }
    }
    setCurrentBlendShapes(newBlendShapes);

    if (state.active.headMovement) {
      const target = state.active.headMovement;
      if (progress < 0.5) {
        setCurrentHeadMovement({
          x: interpolateValue(0, target.x, progress * 2),
          y: interpolateValue(0, target.y, progress * 2),
          z: interpolateValue(0, target.z, progress * 2),
        });
      } else {
        setCurrentHeadMovement({
          x: interpolateValue(target.x, 0, (progress - 0.5) * 2),
          y: interpolateValue(target.y, 0, (progress - 0.5) * 2),
          z: interpolateValue(target.z, 0, (progress - 0.5) * 2),
        });
      }
    }

    if (state.active.eyeMovement) {
      const target = state.active.eyeMovement;
      if (progress < 0.5) {
        setCurrentEyeMovement({
          x: interpolateValue(0, target.x, progress * 2),
          y: interpolateValue(0, target.y, progress * 2),
        });
      } else {
        setCurrentEyeMovement({
          x: interpolateValue(target.x, 0, (progress - 0.5) * 2),
          y: interpolateValue(target.y, 0, (progress - 0.5) * 2),
        });
      }
    }

    if (progress < 1) {
      animationFrameRef.current = requestAnimationFrame(processAnimation);
    } else {
      // Animation complete, process next in queue
      setState((prev) => {
        const nextInteraction = prev.queue[0];
        return {
          ...prev,
          active: nextInteraction || null,
          queue: prev.queue.slice(1),
          isProcessing: !!nextInteraction,
        };
      });

      if (state.queue.length > 0) {
        startTimeRef.current = Date.now();
        animationFrameRef.current = requestAnimationFrame(processAnimation);
      } else {
        setCurrentBlendShapes({});
        setCurrentHeadMovement({ x: 0, y: 0, z: 0 });
        setCurrentEyeMovement({ x: 0, y: 0 });
      }
    }
  }, [state.active, state.queue, isPaused]);

  // Start animation when active changes
  useEffect(() => {
    if (state.active && !isPaused) {
      startTimeRef.current = Date.now();
      animationFrameRef.current = requestAnimationFrame(processAnimation);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.active, isPaused, processAnimation]);

  // Controls
  const trigger = useCallback(
    (type: MicroInteractionType, intensity?: InteractionIntensity) => {
      if (!mergedConfig.enabled || isPaused) return;

      const actualIntensity = intensity || mergedConfig.baseIntensity;
      const interaction = createInteraction(type, actualIntensity, mergedConfig.naturalness);

      // Update metrics
      metricsRef.current.totalTriggered++;
      metricsRef.current.interactionCounts[type] = (metricsRef.current.interactionCounts[type] || 0) + 1;

      setState((prev) => {
        // If no active interaction, start immediately
        if (!prev.active) {
          return {
            ...prev,
            active: interaction,
            lastTriggered: { ...prev.lastTriggered, [type]: Date.now() },
            isProcessing: true,
          };
        }

        // Add to queue if not full
        if (prev.queue.length < mergedConfig.maxQueueSize) {
          return {
            ...prev,
            queue: [...prev.queue, interaction],
            lastTriggered: { ...prev.lastTriggered, [type]: Date.now() },
          };
        }

        return prev;
      });
    },
    [mergedConfig.enabled, mergedConfig.baseIntensity, mergedConfig.naturalness, mergedConfig.maxQueueSize, isPaused]
  );

  const cancel = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setState((prev) => ({
      ...prev,
      active: null,
      isProcessing: false,
    }));
    setCurrentBlendShapes({});
    setCurrentHeadMovement({ x: 0, y: 0, z: 0 });
    setCurrentEyeMovement({ x: 0, y: 0 });
  }, []);

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  const setIntensity = useCallback((intensity: InteractionIntensity) => {
    // This would need config state management for persistence
  }, []);

  const clearQueue = useCallback(() => {
    setState((prev) => ({
      ...prev,
      queue: [],
    }));
  }, []);

  const controls: MicroInteractionControls = useMemo(
    () => ({
      trigger,
      cancel,
      pause,
      resume,
      setIntensity,
      clearQueue,
    }),
    [trigger, cancel, pause, resume, setIntensity, clearQueue]
  );

  return {
    state,
    metrics: metricsRef.current,
    controls,
    currentBlendShapes,
    currentHeadMovement,
    currentEyeMovement,
    isPaused,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for typing acknowledgment interactions
 */
export function useTypingAcknowledgment(
  isTyping: boolean,
  config?: Partial<MicroInteractionConfig>
): { blendShapes: Record<string, number> } {
  const { controls, currentBlendShapes } = useAvatarMicroInteractions(config);
  const wasTypingRef = useRef(false);

  useEffect(() => {
    if (isTyping && !wasTypingRef.current) {
      controls.trigger("typing_acknowledgment", "subtle");
    }
    wasTypingRef.current = isTyping;
  }, [isTyping, controls]);

  return { blendShapes: currentBlendShapes };
}

/**
 * Hook for pause/curiosity interactions when user stops typing
 */
export function usePauseCuriosity(
  isTyping: boolean,
  pauseThreshold: number = 2000,
  config?: Partial<MicroInteractionConfig>
): { blendShapes: Record<string, number>; headMovement: { x: number; y: number; z: number } } {
  const { controls, currentBlendShapes, currentHeadMovement } = useAvatarMicroInteractions(config);
  const lastTypingRef = useRef<number>(Date.now());
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (isTyping) {
      lastTypingRef.current = Date.now();
      hasTriggeredRef.current = false;
    } else {
      const checkPause = () => {
        const elapsed = Date.now() - lastTypingRef.current;
        if (elapsed >= pauseThreshold && !hasTriggeredRef.current) {
          controls.trigger("pause_curiosity", "moderate");
          hasTriggeredRef.current = true;
        }
      };

      const timer = setTimeout(checkPause, pauseThreshold);
      return () => clearTimeout(timer);
    }
  }, [isTyping, pauseThreshold, controls]);

  return { blendShapes: currentBlendShapes, headMovement: currentHeadMovement };
}

/**
 * Hook for attention shift when user scrolls or moves focus
 */
export function useAttentionShift(
  config?: Partial<MicroInteractionConfig>
): {
  onScroll: () => void;
  onFocusChange: () => void;
  blendShapes: Record<string, number>;
  headMovement: { x: number; y: number; z: number };
} {
  const { controls, currentBlendShapes, currentHeadMovement } = useAvatarMicroInteractions(config);
  const lastTriggerRef = useRef<number>(0);
  const cooldown = 1000; // 1 second cooldown

  const onScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastTriggerRef.current > cooldown) {
      controls.trigger("attention_shift", "subtle");
      lastTriggerRef.current = now;
    }
  }, [controls]);

  const onFocusChange = useCallback(() => {
    const now = Date.now();
    if (now - lastTriggerRef.current > cooldown) {
      controls.trigger("attention_shift", "moderate");
      lastTriggerRef.current = now;
    }
  }, [controls]);

  return { onScroll, onFocusChange, blendShapes: currentBlendShapes, headMovement: currentHeadMovement };
}

/**
 * Hook for empathy signals based on message sentiment
 */
export function useEmpathySignals(
  sentiment: "positive" | "negative" | "neutral",
  config?: Partial<MicroInteractionConfig>
): { blendShapes: Record<string, number>; headMovement: { x: number; y: number; z: number } } {
  const { controls, currentBlendShapes, currentHeadMovement } = useAvatarMicroInteractions(config);
  const prevSentimentRef = useRef<string>(sentiment);

  useEffect(() => {
    if (sentiment !== prevSentimentRef.current) {
      if (sentiment === "negative") {
        controls.trigger("empathy_signal", "expressive");
      } else if (sentiment === "positive") {
        controls.trigger("encouragement", "moderate");
      }
      prevSentimentRef.current = sentiment;
    }
  }, [sentiment, controls]);

  return { blendShapes: currentBlendShapes, headMovement: currentHeadMovement };
}

export default useAvatarMicroInteractions;
