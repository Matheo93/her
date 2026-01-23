/**
 * useAvatarEmotionalTransitions Hook - Sprint 512
 *
 * Smooth emotional state transitions for natural avatar expressions.
 * Creates fluid, believable emotional changes with proper timing and blending.
 *
 * Features:
 * - Emotion state machine with transition rules
 * - Blend shape interpolation with customizable easing
 * - Micro-expression layering during transitions
 * - Emotional memory for context-aware transitions
 * - Natural timing variation to avoid robotic feel
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type EmotionType =
  | "neutral"
  | "happy"
  | "sad"
  | "surprised"
  | "thoughtful"
  | "concerned"
  | "excited"
  | "calm"
  | "curious"
  | "empathetic"
  | "playful"
  | "focused";

export type TransitionEasing =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "spring"
  | "bounce";

export interface EmotionBlendShapes {
  // Eyebrows
  browInnerUp: number;
  browOuterUpL: number;
  browOuterUpR: number;
  browDownL: number;
  browDownR: number;
  // Eyes
  eyeWideL: number;
  eyeWideR: number;
  eyeSquintL: number;
  eyeSquintR: number;
  eyeLookUpL: number;
  eyeLookUpR: number;
  eyeLookDownL: number;
  eyeLookDownR: number;
  // Mouth
  mouthSmileL: number;
  mouthSmileR: number;
  mouthFrownL: number;
  mouthFrownR: number;
  mouthOpen: number;
  mouthPucker: number;
  jawOpen: number;
  // Cheeks
  cheekSquintL: number;
  cheekSquintR: number;
  cheekPuff: number;
  // Nose
  noseSneerL: number;
  noseSneerR: number;
}

export interface TransitionConfig {
  duration: number; // ms
  easing: TransitionEasing;
  delay: number; // ms
  overshoot: number; // 0-1 for spring/bounce
}

export interface EmotionTransition {
  from: EmotionType;
  to: EmotionType;
  config: TransitionConfig;
  progress: number;
  startedAt: number;
  microExpressions: MicroExpressionOverlay[];
}

export interface MicroExpressionOverlay {
  blendShapes: Partial<EmotionBlendShapes>;
  intensity: number;
  startProgress: number;
  endProgress: number;
}

export interface EmotionalMemory {
  recentEmotions: Array<{ emotion: EmotionType; timestamp: number; duration: number }>;
  dominantEmotion: EmotionType;
  emotionalVolatility: number; // 0-1
  averageTransitionSpeed: number;
}

export interface EmotionalTransitionState {
  currentEmotion: EmotionType;
  targetEmotion: EmotionType;
  transition: EmotionTransition | null;
  blendShapes: EmotionBlendShapes;
  isTransitioning: boolean;
  transitionQueue: EmotionType[];
}

export interface EmotionalTransitionMetrics {
  totalTransitions: number;
  averageTransitionDuration: number;
  emotionCounts: Record<EmotionType, number>;
  smoothnessScore: number; // 0-100
}

export interface EmotionalTransitionConfig {
  enabled: boolean;
  defaultDuration: number;
  defaultEasing: TransitionEasing;
  enableMicroExpressions: boolean;
  naturalVariation: number; // 0-1
  queueTransitions: boolean;
  maxQueueSize: number;
}

export interface EmotionalTransitionControls {
  transitionTo: (emotion: EmotionType, config?: Partial<TransitionConfig>) => void;
  setImmediate: (emotion: EmotionType) => void;
  cancelTransition: () => void;
  clearQueue: () => void;
  getBlendShapesForEmotion: (emotion: EmotionType) => EmotionBlendShapes;
}

export interface UseAvatarEmotionalTransitionsResult {
  state: EmotionalTransitionState;
  memory: EmotionalMemory;
  metrics: EmotionalTransitionMetrics;
  controls: EmotionalTransitionControls;
  currentBlendShapes: EmotionBlendShapes;
  transitionProgress: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BLEND_SHAPES: EmotionBlendShapes = {
  browInnerUp: 0,
  browOuterUpL: 0,
  browOuterUpR: 0,
  browDownL: 0,
  browDownR: 0,
  eyeWideL: 0,
  eyeWideR: 0,
  eyeSquintL: 0,
  eyeSquintR: 0,
  eyeLookUpL: 0,
  eyeLookUpR: 0,
  eyeLookDownL: 0,
  eyeLookDownR: 0,
  mouthSmileL: 0,
  mouthSmileR: 0,
  mouthFrownL: 0,
  mouthFrownR: 0,
  mouthOpen: 0,
  mouthPucker: 0,
  jawOpen: 0,
  cheekSquintL: 0,
  cheekSquintR: 0,
  cheekPuff: 0,
  noseSneerL: 0,
  noseSneerR: 0,
};

const EMOTION_PRESETS: Record<EmotionType, Partial<EmotionBlendShapes>> = {
  neutral: {},
  happy: {
    mouthSmileL: 0.6,
    mouthSmileR: 0.6,
    eyeSquintL: 0.3,
    eyeSquintR: 0.3,
    cheekSquintL: 0.2,
    cheekSquintR: 0.2,
  },
  sad: {
    browInnerUp: 0.4,
    mouthFrownL: 0.4,
    mouthFrownR: 0.4,
    eyeLookDownL: 0.2,
    eyeLookDownR: 0.2,
  },
  surprised: {
    browInnerUp: 0.6,
    browOuterUpL: 0.5,
    browOuterUpR: 0.5,
    eyeWideL: 0.6,
    eyeWideR: 0.6,
    mouthOpen: 0.3,
    jawOpen: 0.2,
  },
  thoughtful: {
    browInnerUp: 0.2,
    eyeLookUpL: 0.3,
    eyeLookUpR: 0.3,
    mouthPucker: 0.1,
  },
  concerned: {
    browInnerUp: 0.5,
    browDownL: 0.2,
    browDownR: 0.2,
    mouthFrownL: 0.2,
    mouthFrownR: 0.2,
  },
  excited: {
    mouthSmileL: 0.8,
    mouthSmileR: 0.8,
    eyeWideL: 0.3,
    eyeWideR: 0.3,
    browOuterUpL: 0.3,
    browOuterUpR: 0.3,
    cheekSquintL: 0.3,
    cheekSquintR: 0.3,
  },
  calm: {
    eyeSquintL: 0.1,
    eyeSquintR: 0.1,
    mouthSmileL: 0.15,
    mouthSmileR: 0.15,
  },
  curious: {
    browInnerUp: 0.3,
    browOuterUpL: 0.2,
    browOuterUpR: 0.4,
    eyeWideL: 0.15,
    eyeWideR: 0.25,
  },
  empathetic: {
    browInnerUp: 0.35,
    eyeSquintL: 0.15,
    eyeSquintR: 0.15,
    mouthSmileL: 0.2,
    mouthSmileR: 0.2,
  },
  playful: {
    mouthSmileL: 0.5,
    mouthSmileR: 0.7,
    eyeSquintL: 0.2,
    eyeSquintR: 0.35,
    browOuterUpL: 0.15,
  },
  focused: {
    browDownL: 0.25,
    browDownR: 0.25,
    eyeSquintL: 0.2,
    eyeSquintR: 0.2,
  },
};

const TRANSITION_RULES: Record<string, Partial<TransitionConfig>> = {
  "neutral_to_happy": { duration: 400, easing: "ease-out" },
  "neutral_to_sad": { duration: 600, easing: "ease-in-out" },
  "happy_to_sad": { duration: 800, easing: "ease-in-out" },
  "sad_to_happy": { duration: 700, easing: "ease-out" },
  "neutral_to_surprised": { duration: 200, easing: "spring", overshoot: 0.2 },
  "surprised_to_neutral": { duration: 500, easing: "ease-out" },
  "neutral_to_thoughtful": { duration: 500, easing: "ease-in-out" },
  "neutral_to_excited": { duration: 300, easing: "spring", overshoot: 0.15 },
};

const DEFAULT_CONFIG: EmotionalTransitionConfig = {
  enabled: true,
  defaultDuration: 400,
  defaultEasing: "ease-in-out",
  enableMicroExpressions: true,
  naturalVariation: 0.15,
  queueTransitions: true,
  maxQueueSize: 3,
};

// ============================================================================
// Utility Functions
// ============================================================================

function getEasingFunction(easing: TransitionEasing): (t: number) => number {
  switch (easing) {
    case "linear":
      return (t) => t;
    case "ease-in":
      return (t) => t * t * t;
    case "ease-out":
      return (t) => 1 - Math.pow(1 - t, 3);
    case "ease-in-out":
      return (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    case "spring":
      return (t) => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
      };
    case "bounce":
      return (t) => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) return n1 * t * t;
        if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
        if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
      };
    default:
      return (t) => t;
  }
}

function interpolateBlendShapes(
  from: EmotionBlendShapes,
  to: EmotionBlendShapes,
  progress: number
): EmotionBlendShapes {
  const result = { ...DEFAULT_BLEND_SHAPES };

  for (const key of Object.keys(result) as (keyof EmotionBlendShapes)[]) {
    result[key] = from[key] + (to[key] - from[key]) * progress;
  }

  return result;
}

function getBlendShapesForEmotion(emotion: EmotionType): EmotionBlendShapes {
  const preset = EMOTION_PRESETS[emotion];
  return { ...DEFAULT_BLEND_SHAPES, ...preset };
}

function generateMicroExpressions(
  from: EmotionType,
  to: EmotionType
): MicroExpressionOverlay[] {
  const overlays: MicroExpressionOverlay[] = [];

  // Add blink during transition
  if (Math.random() > 0.3) {
    overlays.push({
      blendShapes: { eyeSquintL: 0.9, eyeSquintR: 0.9 },
      intensity: 1,
      startProgress: 0.3,
      endProgress: 0.5,
    });
  }

  // Add subtle head movement indicator (represented by asymmetric brow)
  if (from !== to && Math.random() > 0.5) {
    overlays.push({
      blendShapes: { browOuterUpL: 0.1 },
      intensity: 0.5,
      startProgress: 0.1,
      endProgress: 0.4,
    });
  }

  return overlays;
}

function applyNaturalVariation(
  blendShapes: EmotionBlendShapes,
  variation: number
): EmotionBlendShapes {
  const result = { ...blendShapes };

  for (const key of Object.keys(result) as (keyof EmotionBlendShapes)[]) {
    if (result[key] !== 0) {
      const randomFactor = 1 + (Math.random() - 0.5) * variation * 2;
      result[key] = Math.max(0, Math.min(1, result[key] * randomFactor));
    }
  }

  return result;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarEmotionalTransitions(
  config: Partial<EmotionalTransitionConfig> = {}
): UseAvatarEmotionalTransitionsResult {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [state, setState] = useState<EmotionalTransitionState>({
    currentEmotion: "neutral",
    targetEmotion: "neutral",
    transition: null,
    blendShapes: DEFAULT_BLEND_SHAPES,
    isTransitioning: false,
    transitionQueue: [],
  });

  // Memory
  const [memory, setMemory] = useState<EmotionalMemory>({
    recentEmotions: [],
    dominantEmotion: "neutral",
    emotionalVolatility: 0,
    averageTransitionSpeed: mergedConfig.defaultDuration,
  });

  // Metrics
  const metricsRef = useRef<EmotionalTransitionMetrics>({
    totalTransitions: 0,
    averageTransitionDuration: mergedConfig.defaultDuration,
    emotionCounts: {} as Record<EmotionType, number>,
    smoothnessScore: 100,
  });

  // Animation refs
  const animationFrameRef = useRef<number | null>(null);
  const transitionStartRef = useRef<number>(0);

  // Process transition animation
  const processTransition = useCallback(() => {
    setState((prev) => {
      if (!prev.transition || !prev.isTransitioning) {
        return prev;
      }

      const elapsed = Date.now() - transitionStartRef.current;
      const { duration, easing } = prev.transition.config;
      const rawProgress = Math.min(elapsed / duration, 1);
      const easingFn = getEasingFunction(easing);
      const progress = easingFn(rawProgress);

      // Calculate base blend shapes
      const fromShapes = getBlendShapesForEmotion(prev.transition.from);
      const toShapes = getBlendShapesForEmotion(prev.transition.to);
      let blendShapes = interpolateBlendShapes(fromShapes, toShapes, progress);

      // Apply micro-expressions
      if (mergedConfig.enableMicroExpressions) {
        for (const overlay of prev.transition.microExpressions) {
          if (rawProgress >= overlay.startProgress && rawProgress <= overlay.endProgress) {
            const overlayProgress =
              (rawProgress - overlay.startProgress) /
              (overlay.endProgress - overlay.startProgress);
            const overlayIntensity =
              overlay.intensity * Math.sin(overlayProgress * Math.PI);

            for (const [key, value] of Object.entries(overlay.blendShapes)) {
              const k = key as keyof EmotionBlendShapes;
              blendShapes[k] = blendShapes[k] + (value as number) * overlayIntensity;
            }
          }
        }
      }

      // Apply natural variation
      if (mergedConfig.naturalVariation > 0) {
        blendShapes = applyNaturalVariation(blendShapes, mergedConfig.naturalVariation * 0.1);
      }

      // Check if transition complete
      if (rawProgress >= 1) {
        // Process queue
        const nextEmotion = prev.transitionQueue[0];
        if (nextEmotion && mergedConfig.queueTransitions) {
          // Start next transition
          return {
            ...prev,
            currentEmotion: prev.transition.to,
            targetEmotion: nextEmotion,
            transition: {
              from: prev.transition.to,
              to: nextEmotion,
              config: {
                duration: mergedConfig.defaultDuration,
                easing: mergedConfig.defaultEasing,
                delay: 0,
                overshoot: 0,
              },
              progress: 0,
              startedAt: Date.now(),
              microExpressions: generateMicroExpressions(prev.transition.to, nextEmotion),
            },
            blendShapes: getBlendShapesForEmotion(prev.transition.to),
            transitionQueue: prev.transitionQueue.slice(1),
          };
        }

        return {
          ...prev,
          currentEmotion: prev.transition.to,
          targetEmotion: prev.transition.to,
          transition: null,
          blendShapes: getBlendShapesForEmotion(prev.transition.to),
          isTransitioning: false,
        };
      }

      return {
        ...prev,
        transition: { ...prev.transition, progress },
        blendShapes,
      };
    });

    animationFrameRef.current = requestAnimationFrame(processTransition);
  }, [mergedConfig]);

  // Start animation loop when transitioning
  useEffect(() => {
    if (state.isTransitioning && state.transition) {
      transitionStartRef.current = state.transition.startedAt;
      animationFrameRef.current = requestAnimationFrame(processTransition);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.isTransitioning, state.transition?.startedAt, processTransition]);

  // Update memory when emotion changes
  useEffect(() => {
    if (!state.isTransitioning && state.currentEmotion) {
      setMemory((prev) => {
        const now = Date.now();
        const lastEntry = prev.recentEmotions[prev.recentEmotions.length - 1];
        const duration = lastEntry ? now - lastEntry.timestamp : 0;

        const newEntry = {
          emotion: state.currentEmotion,
          timestamp: now,
          duration,
        };

        const recentEmotions = [...prev.recentEmotions, newEntry].slice(-20);

        // Calculate dominant emotion
        const counts: Record<string, number> = {};
        for (const entry of recentEmotions) {
          counts[entry.emotion] = (counts[entry.emotion] || 0) + 1;
        }
        const dominantEmotion = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
          "neutral") as EmotionType;

        // Calculate volatility (how often emotions change)
        const volatility = Math.min(1, recentEmotions.length / 20);

        return {
          ...prev,
          recentEmotions,
          dominantEmotion,
          emotionalVolatility: volatility,
        };
      });
    }
  }, [state.currentEmotion, state.isTransitioning]);

  // Controls
  const transitionTo = useCallback(
    (emotion: EmotionType, transitionConfig?: Partial<TransitionConfig>) => {
      if (!mergedConfig.enabled) return;
      if (emotion === state.currentEmotion && !state.isTransitioning) return;

      // Get transition rule if exists
      const ruleKey = `${state.currentEmotion}_to_${emotion}`;
      const rule = TRANSITION_RULES[ruleKey] || {};

      const config: TransitionConfig = {
        duration: transitionConfig?.duration ?? rule.duration ?? mergedConfig.defaultDuration,
        easing: transitionConfig?.easing ?? rule.easing ?? mergedConfig.defaultEasing,
        delay: transitionConfig?.delay ?? 0,
        overshoot: transitionConfig?.overshoot ?? rule.overshoot ?? 0,
      };

      // Add natural variation to duration
      if (mergedConfig.naturalVariation > 0) {
        const variation = 1 + (Math.random() - 0.5) * mergedConfig.naturalVariation;
        config.duration = Math.round(config.duration * variation);
      }

      setState((prev) => {
        // If currently transitioning and queueing enabled
        if (prev.isTransitioning && mergedConfig.queueTransitions) {
          if (prev.transitionQueue.length < mergedConfig.maxQueueSize) {
            return {
              ...prev,
              transitionQueue: [...prev.transitionQueue, emotion],
            };
          }
          return prev;
        }

        // Start new transition
        const transition: EmotionTransition = {
          from: prev.currentEmotion,
          to: emotion,
          config,
          progress: 0,
          startedAt: Date.now() + config.delay,
          microExpressions: mergedConfig.enableMicroExpressions
            ? generateMicroExpressions(prev.currentEmotion, emotion)
            : [],
        };

        // Update metrics
        metricsRef.current.totalTransitions++;
        metricsRef.current.emotionCounts[emotion] =
          (metricsRef.current.emotionCounts[emotion] || 0) + 1;

        return {
          ...prev,
          targetEmotion: emotion,
          transition,
          isTransitioning: true,
        };
      });
    },
    [state.currentEmotion, state.isTransitioning, mergedConfig]
  );

  const setImmediate = useCallback((emotion: EmotionType) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setState({
      currentEmotion: emotion,
      targetEmotion: emotion,
      transition: null,
      blendShapes: getBlendShapesForEmotion(emotion),
      isTransitioning: false,
      transitionQueue: [],
    });
  }, []);

  const cancelTransition = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setState((prev) => ({
      ...prev,
      targetEmotion: prev.currentEmotion,
      transition: null,
      isTransitioning: false,
    }));
  }, []);

  const clearQueue = useCallback(() => {
    setState((prev) => ({
      ...prev,
      transitionQueue: [],
    }));
  }, []);

  const controls: EmotionalTransitionControls = useMemo(
    () => ({
      transitionTo,
      setImmediate,
      cancelTransition,
      clearQueue,
      getBlendShapesForEmotion,
    }),
    [transitionTo, setImmediate, cancelTransition, clearQueue]
  );

  return {
    state,
    memory,
    metrics: metricsRef.current,
    controls,
    currentBlendShapes: state.blendShapes,
    transitionProgress: state.transition?.progress ?? (state.isTransitioning ? 0 : 1),
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for sentiment-based emotional transitions
 */
export function useSentimentEmotions(
  sentiment: number, // -1 to 1
  config?: Partial<EmotionalTransitionConfig>
): { blendShapes: EmotionBlendShapes; emotion: EmotionType } {
  const { controls, currentBlendShapes, state } = useAvatarEmotionalTransitions(config);
  const prevSentimentRef = useRef(0);

  useEffect(() => {
    const delta = Math.abs(sentiment - prevSentimentRef.current);
    if (delta > 0.2) {
      let emotion: EmotionType = "neutral";

      if (sentiment > 0.6) emotion = "happy";
      else if (sentiment > 0.3) emotion = "calm";
      else if (sentiment < -0.6) emotion = "sad";
      else if (sentiment < -0.3) emotion = "concerned";
      else emotion = "neutral";

      controls.transitionTo(emotion);
      prevSentimentRef.current = sentiment;
    }
  }, [sentiment, controls]);

  return { blendShapes: currentBlendShapes, emotion: state.currentEmotion };
}

/**
 * Hook for conversation context emotions
 */
export function useConversationEmotions(
  isListening: boolean,
  isSpeaking: boolean,
  isThinking: boolean,
  config?: Partial<EmotionalTransitionConfig>
): { blendShapes: EmotionBlendShapes; emotion: EmotionType } {
  const { controls, currentBlendShapes, state } = useAvatarEmotionalTransitions(config);

  useEffect(() => {
    if (isThinking) {
      controls.transitionTo("thoughtful");
    } else if (isSpeaking) {
      controls.transitionTo("calm");
    } else if (isListening) {
      controls.transitionTo("curious");
    } else {
      controls.transitionTo("neutral");
    }
  }, [isListening, isSpeaking, isThinking, controls]);

  return { blendShapes: currentBlendShapes, emotion: state.currentEmotion };
}

export default useAvatarEmotionalTransitions;
