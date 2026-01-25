"use client";

/**
 * Avatar Emotion Animation Hook
 * Sprint 572 - Frontend Animation Feature
 *
 * Manages smooth emotional transitions for avatar animations.
 * Provides spring-based interpolation between emotion states.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSpring, useTransform, MotionValue } from "framer-motion";
import { HER_SPRINGS, EMOTION_PRESENCE } from "@/styles/her-theme";

type Emotion =
  | "joy"
  | "sadness"
  | "tenderness"
  | "excitement"
  | "anger"
  | "fear"
  | "surprise"
  | "neutral"
  | "curiosity"
  | "playful";

interface EmotionState {
  current: Emotion;
  previous: Emotion;
  intensity: number;
  transitionProgress: number;
  isTransitioning: boolean;
}

interface EmotionAnimationValues {
  /** Warmth factor (affects color temperature) */
  warmth: MotionValue<number>;
  /** Glow intensity (affects glow opacity) */
  glowIntensity: MotionValue<number>;
  /** Energy level (affects animation speed) */
  energy: MotionValue<number>;
  /** Eye openness (affects blink rate) */
  eyeOpenness: MotionValue<number>;
  /** Mouth curvature (-1 to 1, sad to happy) */
  mouthCurve: MotionValue<number>;
}

interface UseAvatarEmotionAnimationOptions {
  /** Initial emotion */
  initialEmotion?: Emotion;
  /** Transition duration in ms */
  transitionDuration?: number;
  /** Enable automatic micro-expressions */
  enableMicroExpressions?: boolean;
  /** Callback when emotion changes */
  onEmotionChange?: (from: Emotion, to: Emotion) => void;
}

interface UseAvatarEmotionAnimationResult {
  /** Current emotion state */
  state: EmotionState;
  /** Animated values for use with framer-motion */
  values: EmotionAnimationValues;
  /** Set new emotion */
  setEmotion: (emotion: Emotion, intensity?: number) => void;
  /** Blend between two emotions */
  blendEmotions: (emotionA: Emotion, emotionB: Emotion, ratio: number) => void;
  /** Trigger micro-expression */
  triggerMicroExpression: (type: "blink" | "smirk" | "raise-eyebrow") => void;
  /** Reset to neutral */
  reset: () => void;
}

/**
 * Emotion parameters for animation
 */
const EMOTION_PARAMS: Record<Emotion, {
  warmth: number;
  energy: number;
  eyeOpenness: number;
  mouthCurve: number;
}> = {
  joy: { warmth: 1.2, energy: 0.9, eyeOpenness: 0.7, mouthCurve: 0.8 },
  sadness: { warmth: 0.8, energy: 0.3, eyeOpenness: 0.5, mouthCurve: -0.6 },
  tenderness: { warmth: 1.1, energy: 0.4, eyeOpenness: 0.6, mouthCurve: 0.4 },
  excitement: { warmth: 1.3, energy: 1.0, eyeOpenness: 0.9, mouthCurve: 0.9 },
  anger: { warmth: 1.0, energy: 0.8, eyeOpenness: 0.8, mouthCurve: -0.4 },
  fear: { warmth: 0.9, energy: 0.7, eyeOpenness: 1.0, mouthCurve: -0.3 },
  surprise: { warmth: 1.1, energy: 0.8, eyeOpenness: 1.0, mouthCurve: 0.2 },
  neutral: { warmth: 1.0, energy: 0.5, eyeOpenness: 0.7, mouthCurve: 0.0 },
  curiosity: { warmth: 1.05, energy: 0.6, eyeOpenness: 0.8, mouthCurve: 0.2 },
  playful: { warmth: 1.15, energy: 0.85, eyeOpenness: 0.75, mouthCurve: 0.6 },
};

/**
 * Hook for managing avatar emotion animations
 */
export function useAvatarEmotionAnimation(
  options: UseAvatarEmotionAnimationOptions = {}
): UseAvatarEmotionAnimationResult {
  const {
    initialEmotion = "neutral",
    transitionDuration = 500,
    enableMicroExpressions = true,
    onEmotionChange,
  } = options;

  // State
  const [state, setState] = useState<EmotionState>({
    current: initialEmotion,
    previous: initialEmotion,
    intensity: 1.0,
    transitionProgress: 1.0,
    isTransitioning: false,
  });

  // Refs
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onEmotionChangeRef = useRef(onEmotionChange);
  onEmotionChangeRef.current = onEmotionChange;

  // Spring-based animated values
  const warmthSpring = useSpring(EMOTION_PARAMS[initialEmotion].warmth, {
    stiffness: 100,
    damping: 20,
  });

  const energySpring = useSpring(EMOTION_PARAMS[initialEmotion].energy, {
    stiffness: 80,
    damping: 15,
  });

  const eyeOpennessSpring = useSpring(EMOTION_PARAMS[initialEmotion].eyeOpenness, {
    stiffness: 150,
    damping: 25,
  });

  const mouthCurveSpring = useSpring(EMOTION_PARAMS[initialEmotion].mouthCurve, {
    stiffness: 120,
    damping: 20,
  });

  // Derived glow intensity from warmth
  const glowIntensity = useTransform(warmthSpring, [0.8, 1.3], [0.3, 0.8]);

  // Animated values object
  const values: EmotionAnimationValues = useMemo(
    () => ({
      warmth: warmthSpring,
      glowIntensity,
      energy: energySpring,
      eyeOpenness: eyeOpennessSpring,
      mouthCurve: mouthCurveSpring,
    }),
    [warmthSpring, glowIntensity, energySpring, eyeOpennessSpring, mouthCurveSpring]
  );

  // Set new emotion with smooth transition
  const setEmotion = useCallback(
    (emotion: Emotion, intensity: number = 1.0) => {
      if (emotion === state.current && intensity === state.intensity) {
        return;
      }

      // Clear any pending transition
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }

      const params = EMOTION_PARAMS[emotion];

      // Update springs with intensity scaling
      warmthSpring.set(params.warmth * intensity);
      energySpring.set(params.energy * intensity);
      eyeOpennessSpring.set(params.eyeOpenness);
      mouthCurveSpring.set(params.mouthCurve * intensity);

      // Update state
      setState((prev) => ({
        current: emotion,
        previous: prev.current,
        intensity,
        transitionProgress: 0,
        isTransitioning: true,
      }));

      // Trigger callback
      if (onEmotionChangeRef.current && emotion !== state.current) {
        onEmotionChangeRef.current(state.current, emotion);
      }

      // Complete transition after duration
      transitionTimeoutRef.current = setTimeout(() => {
        setState((prev) => ({
          ...prev,
          transitionProgress: 1,
          isTransitioning: false,
        }));
      }, transitionDuration);
    },
    [state.current, state.intensity, warmthSpring, energySpring, eyeOpennessSpring, mouthCurveSpring, transitionDuration]
  );

  // Blend between two emotions
  const blendEmotions = useCallback(
    (emotionA: Emotion, emotionB: Emotion, ratio: number) => {
      const paramsA = EMOTION_PARAMS[emotionA];
      const paramsB = EMOTION_PARAMS[emotionB];
      const clampedRatio = Math.max(0, Math.min(1, ratio));

      // Interpolate all parameters
      warmthSpring.set(paramsA.warmth + (paramsB.warmth - paramsA.warmth) * clampedRatio);
      energySpring.set(paramsA.energy + (paramsB.energy - paramsA.energy) * clampedRatio);
      eyeOpennessSpring.set(paramsA.eyeOpenness + (paramsB.eyeOpenness - paramsA.eyeOpenness) * clampedRatio);
      mouthCurveSpring.set(paramsA.mouthCurve + (paramsB.mouthCurve - paramsA.mouthCurve) * clampedRatio);

      // Determine primary emotion based on ratio
      const primaryEmotion = clampedRatio > 0.5 ? emotionB : emotionA;

      setState((prev) => ({
        ...prev,
        current: primaryEmotion,
        intensity: 1.0,
      }));
    },
    [warmthSpring, energySpring, eyeOpennessSpring, mouthCurveSpring]
  );

  // Trigger micro-expression
  const triggerMicroExpression = useCallback(
    (type: "blink" | "smirk" | "raise-eyebrow") => {
      if (!enableMicroExpressions) return;

      switch (type) {
        case "blink":
          // Quick blink - close and open eyes
          eyeOpennessSpring.set(0);
          setTimeout(() => {
            eyeOpennessSpring.set(EMOTION_PARAMS[state.current].eyeOpenness);
          }, 150);
          break;

        case "smirk":
          // Asymmetric smile - subtle mouth curve
          const currentCurve = EMOTION_PARAMS[state.current].mouthCurve;
          mouthCurveSpring.set(currentCurve + 0.3);
          setTimeout(() => {
            mouthCurveSpring.set(currentCurve);
          }, 400);
          break;

        case "raise-eyebrow":
          // Raise eyebrows - increase energy briefly
          const currentEnergy = EMOTION_PARAMS[state.current].energy;
          energySpring.set(Math.min(1, currentEnergy + 0.3));
          eyeOpennessSpring.set(Math.min(1, EMOTION_PARAMS[state.current].eyeOpenness + 0.2));
          setTimeout(() => {
            energySpring.set(currentEnergy);
            eyeOpennessSpring.set(EMOTION_PARAMS[state.current].eyeOpenness);
          }, 500);
          break;
      }
    },
    [enableMicroExpressions, state.current, eyeOpennessSpring, mouthCurveSpring, energySpring]
  );

  // Reset to neutral
  const reset = useCallback(() => {
    setEmotion("neutral", 1.0);
  }, [setEmotion]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  // Random micro-expressions when idle
  useEffect(() => {
    if (!enableMicroExpressions) return;

    const interval = setInterval(() => {
      // Random blink every 3-6 seconds
      if (Math.random() < 0.3) {
        triggerMicroExpression("blink");
      }
    }, 3000 + Math.random() * 3000);

    return () => clearInterval(interval);
  }, [enableMicroExpressions, triggerMicroExpression]);

  return {
    state,
    values,
    setEmotion,
    blendEmotions,
    triggerMicroExpression,
    reset,
  };
}

export default useAvatarEmotionAnimation;
