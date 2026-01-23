/**
 * useAvatarBreathingSystem - Natural breathing animation system for avatar
 *
 * Sprint 1587 - Provides realistic breathing animations that respond to
 * emotional state, speaking, and activity level for natural avatar presence.
 *
 * Features:
 * - Multiple breathing patterns (relaxed, normal, excited, speaking, holding)
 * - Smooth transitions between patterns
 * - Chest/shoulder movement simulation
 * - Emotional state integration
 * - Speaking-aware breathing pauses
 * - Activity level adaptation
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Breathing pattern types
export type BreathingPattern =
  | "relaxed" // Slow, deep breaths
  | "normal" // Regular breathing
  | "alert" // Slightly faster
  | "excited" // Quick, shallow
  | "speaking" // Pauses during speech
  | "listening" // Attentive, steady
  | "thinking" // Irregular, variable
  | "holding" // Breath held
  | "sighing" // Deep exhale
  | "laughing"; // Rapid, irregular

export type BreathingPhase = "inhale" | "hold_in" | "exhale" | "hold_out";

export interface BreathingKeyframe {
  chestExpansion: number; // 0-1, chest rise
  shoulderRise: number; // 0-1, shoulder elevation
  abdomenExpansion: number; // 0-1, belly movement
  neckTension: number; // 0-1, slight neck movement
}

export interface BreathingCycle {
  inhaleMs: number;
  holdInMs: number;
  exhaleMs: number;
  holdOutMs: number;
  maxExpansion: number; // Peak expansion 0-1
  variationRange: number; // Random variation 0-1
}

export interface BreathingState {
  pattern: BreathingPattern;
  phase: BreathingPhase;
  progress: number; // 0-1 within current phase
  cycleProgress: number; // 0-1 across full cycle
  keyframe: BreathingKeyframe;
  breathsPerMinute: number;
  isTransitioning: boolean;
}

export interface BreathingMetrics {
  totalCycles: number;
  averageCycleMs: number;
  patternChanges: number;
  speakingPauses: number;
  emotionalAdaptations: number;
}

export interface BreathingConfig {
  enabled: boolean;
  baseBreathsPerMinute: number;
  emotionalSensitivity: number; // 0-1
  speakingPauseSensitivity: number; // 0-1
  transitionSmoothness: number; // 0-1
  randomVariation: number; // 0-1
  chestMovementScale: number; // 0-2
  shoulderMovementScale: number; // 0-2
  subtleMode: boolean; // Reduce all movements
}

export interface BreathingControls {
  setPattern: (pattern: BreathingPattern) => void;
  triggerSigh: () => void;
  holdBreath: (durationMs: number) => void;
  resumeBreathing: () => void;
  setEmotionalState: (
    emotion: string,
    intensity: number
  ) => void;
  setSpeaking: (isSpeaking: boolean) => void;
  updateConfig: (config: Partial<BreathingConfig>) => void;
  reset: () => void;
}

export interface UseAvatarBreathingSystemResult {
  state: BreathingState;
  metrics: BreathingMetrics;
  controls: BreathingControls;
  config: BreathingConfig;
}

// Breathing pattern definitions
const BREATHING_PATTERNS: Record<BreathingPattern, BreathingCycle> = {
  relaxed: {
    inhaleMs: 3000,
    holdInMs: 500,
    exhaleMs: 4000,
    holdOutMs: 1000,
    maxExpansion: 0.8,
    variationRange: 0.1,
  },
  normal: {
    inhaleMs: 2000,
    holdInMs: 200,
    exhaleMs: 2500,
    holdOutMs: 300,
    maxExpansion: 0.6,
    variationRange: 0.15,
  },
  alert: {
    inhaleMs: 1500,
    holdInMs: 100,
    exhaleMs: 1800,
    holdOutMs: 200,
    maxExpansion: 0.5,
    variationRange: 0.2,
  },
  excited: {
    inhaleMs: 800,
    holdInMs: 50,
    exhaleMs: 900,
    holdOutMs: 100,
    maxExpansion: 0.4,
    variationRange: 0.25,
  },
  speaking: {
    inhaleMs: 1200,
    holdInMs: 100,
    exhaleMs: 3000,
    holdOutMs: 200,
    maxExpansion: 0.5,
    variationRange: 0.3,
  },
  listening: {
    inhaleMs: 2200,
    holdInMs: 300,
    exhaleMs: 2800,
    holdOutMs: 400,
    maxExpansion: 0.55,
    variationRange: 0.1,
  },
  thinking: {
    inhaleMs: 2500,
    holdInMs: 800,
    exhaleMs: 2000,
    holdOutMs: 500,
    maxExpansion: 0.65,
    variationRange: 0.35,
  },
  holding: {
    inhaleMs: 2000,
    holdInMs: 10000,
    exhaleMs: 2000,
    holdOutMs: 0,
    maxExpansion: 0.7,
    variationRange: 0,
  },
  sighing: {
    inhaleMs: 2500,
    holdInMs: 200,
    exhaleMs: 4500,
    holdOutMs: 800,
    maxExpansion: 0.9,
    variationRange: 0.05,
  },
  laughing: {
    inhaleMs: 400,
    holdInMs: 0,
    exhaleMs: 300,
    holdOutMs: 100,
    maxExpansion: 0.35,
    variationRange: 0.4,
  },
};

// Emotion to breathing pattern mapping
const EMOTION_PATTERNS: Record<string, BreathingPattern> = {
  happy: "normal",
  excited: "excited",
  calm: "relaxed",
  neutral: "normal",
  sad: "relaxed",
  anxious: "alert",
  surprised: "alert",
  thoughtful: "thinking",
  amused: "laughing",
  focused: "listening",
};

const DEFAULT_CONFIG: BreathingConfig = {
  enabled: true,
  baseBreathsPerMinute: 14,
  emotionalSensitivity: 0.7,
  speakingPauseSensitivity: 0.8,
  transitionSmoothness: 0.6,
  randomVariation: 0.15,
  chestMovementScale: 1.0,
  shoulderMovementScale: 0.6,
  subtleMode: false,
};

// Easing functions
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeInQuad(t: number): number {
  return t * t;
}

export function useAvatarBreathingSystem(
  initialConfig: Partial<BreathingConfig> = {}
): UseAvatarBreathingSystemResult {
  const config = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...initialConfig }),
    [initialConfig]
  );

  const [state, setState] = useState<BreathingState>({
    pattern: "normal",
    phase: "inhale",
    progress: 0,
    cycleProgress: 0,
    keyframe: {
      chestExpansion: 0,
      shoulderRise: 0,
      abdomenExpansion: 0,
      neckTension: 0,
    },
    breathsPerMinute: config.baseBreathsPerMinute,
    isTransitioning: false,
  });

  const [metrics, setMetrics] = useState<BreathingMetrics>({
    totalCycles: 0,
    averageCycleMs: 5000,
    patternChanges: 0,
    speakingPauses: 0,
    emotionalAdaptations: 0,
  });

  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const cycleStartRef = useRef<number>(Date.now());
  const targetPatternRef = useRef<BreathingPattern>("normal");
  const transitionStartRef = useRef<number | null>(null);
  const transitionFromRef = useRef<BreathingCycle | null>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const holdUntilRef = useRef<number | null>(null);
  const variationRef = useRef<number>(0);
  const cycleDurationsRef = useRef<number[]>([]);

  // Calculate keyframe from phase and progress
  const calculateKeyframe = useCallback(
    (
      phase: BreathingPhase,
      progress: number,
      cycle: BreathingCycle,
      configRef: BreathingConfig
    ): BreathingKeyframe => {
      const scale = configRef.subtleMode ? 0.5 : 1.0;
      const variation = variationRef.current;
      const maxExp = cycle.maxExpansion * (1 + variation * cycle.variationRange);

      let expansion = 0;

      switch (phase) {
        case "inhale":
          expansion = easeInOutSine(progress) * maxExp;
          break;
        case "hold_in":
          expansion = maxExp;
          break;
        case "exhale":
          expansion = maxExp * (1 - easeOutQuad(progress));
          break;
        case "hold_out":
          expansion = 0;
          break;
      }

      return {
        chestExpansion: expansion * configRef.chestMovementScale * scale,
        shoulderRise: expansion * 0.3 * configRef.shoulderMovementScale * scale,
        abdomenExpansion: expansion * 0.8 * scale,
        neckTension: expansion * 0.15 * scale,
      };
    },
    []
  );

  // Get current cycle with transitions
  const getCurrentCycle = useCallback((): BreathingCycle => {
    const targetCycle = BREATHING_PATTERNS[targetPatternRef.current];

    if (transitionStartRef.current && transitionFromRef.current) {
      const elapsed = Date.now() - transitionStartRef.current;
      const transitionDuration = 2000 * config.transitionSmoothness;
      const t = Math.min(1, elapsed / transitionDuration);

      if (t >= 1) {
        transitionStartRef.current = null;
        transitionFromRef.current = null;
        return targetCycle;
      }

      const from = transitionFromRef.current;
      const blend = easeInOutSine(t);

      return {
        inhaleMs: from.inhaleMs + (targetCycle.inhaleMs - from.inhaleMs) * blend,
        holdInMs: from.holdInMs + (targetCycle.holdInMs - from.holdInMs) * blend,
        exhaleMs: from.exhaleMs + (targetCycle.exhaleMs - from.exhaleMs) * blend,
        holdOutMs:
          from.holdOutMs + (targetCycle.holdOutMs - from.holdOutMs) * blend,
        maxExpansion:
          from.maxExpansion +
          (targetCycle.maxExpansion - from.maxExpansion) * blend,
        variationRange:
          from.variationRange +
          (targetCycle.variationRange - from.variationRange) * blend,
      };
    }

    return targetCycle;
  }, [config.transitionSmoothness]);

  // Animation loop
  useEffect(() => {
    if (!config.enabled) return;

    let lastUpdate = Date.now();

    const animate = () => {
      const now = Date.now();
      const cycle = getCurrentCycle();

      // Check for breath hold
      if (holdUntilRef.current && now < holdUntilRef.current) {
        const keyframe = calculateKeyframe("hold_in", 1, cycle, config);
        setState((prev) => ({
          ...prev,
          phase: "hold_in",
          progress: 1,
          keyframe,
        }));
        animationRef.current = requestAnimationFrame(animate);
        return;
      } else if (holdUntilRef.current) {
        holdUntilRef.current = null;
      }

      const cycleTotal =
        cycle.inhaleMs + cycle.holdInMs + cycle.exhaleMs + cycle.holdOutMs;
      const cycleElapsed = (now - cycleStartRef.current) % cycleTotal;
      const cycleProgress = cycleElapsed / cycleTotal;

      // Determine phase and progress
      let phase: BreathingPhase;
      let phaseProgress: number;

      if (cycleElapsed < cycle.inhaleMs) {
        phase = "inhale";
        phaseProgress = cycleElapsed / cycle.inhaleMs;
      } else if (cycleElapsed < cycle.inhaleMs + cycle.holdInMs) {
        phase = "hold_in";
        phaseProgress = (cycleElapsed - cycle.inhaleMs) / cycle.holdInMs;
      } else if (
        cycleElapsed <
        cycle.inhaleMs + cycle.holdInMs + cycle.exhaleMs
      ) {
        phase = "exhale";
        phaseProgress =
          (cycleElapsed - cycle.inhaleMs - cycle.holdInMs) / cycle.exhaleMs;
      } else {
        phase = "hold_out";
        phaseProgress =
          (cycleElapsed - cycle.inhaleMs - cycle.holdInMs - cycle.exhaleMs) /
          cycle.holdOutMs;
      }

      // Handle cycle completion
      if (cycleProgress < (now - lastUpdate) / cycleTotal) {
        // New variation for next cycle
        variationRef.current =
          (Math.random() - 0.5) * 2 * config.randomVariation;
        cycleStartRef.current = now;

        // Track metrics
        const cycleDuration = now - cycleStartRef.current;
        cycleDurationsRef.current.push(cycleDuration);
        if (cycleDurationsRef.current.length > 20) {
          cycleDurationsRef.current.shift();
        }

        setMetrics((prev) => ({
          ...prev,
          totalCycles: prev.totalCycles + 1,
          averageCycleMs:
            cycleDurationsRef.current.reduce((a, b) => a + b, 0) /
            cycleDurationsRef.current.length,
        }));
      }

      // Speaking pause - extend exhale
      if (isSpeakingRef.current && phase === "exhale") {
        phaseProgress = Math.min(phaseProgress, 0.3);
      }

      const keyframe = calculateKeyframe(phase, phaseProgress, cycle, config);
      const breathsPerMinute = 60000 / cycleTotal;

      setState((prev) => ({
        ...prev,
        pattern: targetPatternRef.current,
        phase,
        progress: phaseProgress,
        cycleProgress,
        keyframe,
        breathsPerMinute,
        isTransitioning: transitionStartRef.current !== null,
      }));

      lastUpdate = now;
      animationRef.current = requestAnimationFrame(animate);
    };

    startTimeRef.current = Date.now();
    cycleStartRef.current = Date.now();
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [config, getCurrentCycle, calculateKeyframe]);

  // Controls
  const setPattern = useCallback(
    (pattern: BreathingPattern) => {
      if (pattern !== targetPatternRef.current) {
        transitionFromRef.current = getCurrentCycle();
        transitionStartRef.current = Date.now();
        targetPatternRef.current = pattern;

        setMetrics((prev) => ({
          ...prev,
          patternChanges: prev.patternChanges + 1,
        }));
      }
    },
    [getCurrentCycle]
  );

  const triggerSigh = useCallback(() => {
    const prevPattern = targetPatternRef.current;
    setPattern("sighing");

    // Return to previous after sigh
    setTimeout(() => {
      setPattern(prevPattern);
    }, 8000);
  }, [setPattern]);

  const holdBreath = useCallback((durationMs: number) => {
    holdUntilRef.current = Date.now() + durationMs;
  }, []);

  const resumeBreathing = useCallback(() => {
    holdUntilRef.current = null;
  }, []);

  const setEmotionalState = useCallback(
    (emotion: string, intensity: number) => {
      if (intensity < config.emotionalSensitivity * 0.5) return;

      const pattern = EMOTION_PATTERNS[emotion.toLowerCase()] || "normal";
      setPattern(pattern);

      setMetrics((prev) => ({
        ...prev,
        emotionalAdaptations: prev.emotionalAdaptations + 1,
      }));
    },
    [config.emotionalSensitivity, setPattern]
  );

  const setSpeaking = useCallback(
    (isSpeaking: boolean) => {
      const wasSpeaking = isSpeakingRef.current;
      isSpeakingRef.current = isSpeaking;

      if (isSpeaking && !wasSpeaking) {
        setPattern("speaking");
        setMetrics((prev) => ({
          ...prev,
          speakingPauses: prev.speakingPauses + 1,
        }));
      } else if (!isSpeaking && wasSpeaking) {
        setPattern("listening");
      }
    },
    [setPattern]
  );

  const updateConfig = useCallback(
    (updates: Partial<BreathingConfig>) => {
      // Config is immutable via useMemo, this is a no-op for external use
      // Would need state-based config to support runtime updates
    },
    []
  );

  const reset = useCallback(() => {
    targetPatternRef.current = "normal";
    transitionStartRef.current = null;
    transitionFromRef.current = null;
    holdUntilRef.current = null;
    isSpeakingRef.current = false;
    cycleStartRef.current = Date.now();
    variationRef.current = 0;

    setMetrics({
      totalCycles: 0,
      averageCycleMs: 5000,
      patternChanges: 0,
      speakingPauses: 0,
      emotionalAdaptations: 0,
    });
  }, []);

  const controls: BreathingControls = useMemo(
    () => ({
      setPattern,
      triggerSigh,
      holdBreath,
      resumeBreathing,
      setEmotionalState,
      setSpeaking,
      updateConfig,
      reset,
    }),
    [
      setPattern,
      triggerSigh,
      holdBreath,
      resumeBreathing,
      setEmotionalState,
      setSpeaking,
      updateConfig,
      reset,
    ]
  );

  return {
    state,
    metrics,
    controls,
    config,
  };
}

// Sub-hook: Simple breathing keyframe access
export function useBreathingKeyframe(
  config?: Partial<BreathingConfig>
): BreathingKeyframe {
  const { state } = useAvatarBreathingSystem(config);
  return state.keyframe;
}

// Sub-hook: Breathing pattern based on conversation
export function useConversationBreathing(
  isUserSpeaking: boolean,
  isAiSpeaking: boolean,
  emotion?: string
): UseAvatarBreathingSystemResult {
  const result = useAvatarBreathingSystem();

  useEffect(() => {
    if (isAiSpeaking) {
      result.controls.setSpeaking(true);
    } else if (isUserSpeaking) {
      result.controls.setPattern("listening");
    } else {
      result.controls.setSpeaking(false);
    }
  }, [isUserSpeaking, isAiSpeaking, result.controls]);

  useEffect(() => {
    if (emotion) {
      result.controls.setEmotionalState(emotion, 0.7);
    }
  }, [emotion, result.controls]);

  return result;
}

export default useAvatarBreathingSystem;
