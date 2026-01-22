"use client";

/**
 * useAvatarBreathing - Natural Breathing Animation
 *
 * Generates realistic breathing patterns for avatar animations.
 * Includes variation, activity-based rate changes, and subtle movements.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// Breathing pattern types
export type BreathingPattern =
  | "relaxed"      // Slow, deep breaths (at rest)
  | "normal"       // Regular breathing
  | "alert"        // Slightly faster (engaged)
  | "speaking"     // Irregular, speech-adapted
  | "listening"    // Calm, attentive
  | "excited"      // Faster, shallower
  | "calm"         // Very slow, meditative
  | "sighing";     // Deep sigh breath

interface BreathingState {
  // Current breath phase (0-1, 0=exhale complete, 0.5=inhale complete)
  phase: number;

  // Current breath intensity (0-1)
  intensity: number;

  // Whether currently inhaling
  isInhaling: boolean;

  // Current breathing rate (breaths per minute)
  rate: number;

  // Chest/torso expansion amount (0-1)
  chestExpansion: number;

  // Shoulder rise amount (0-1)
  shoulderRise: number;

  // Subtle head movement from breathing
  headMovement: { x: number; y: number };

  // Current pattern
  pattern: BreathingPattern;
}

interface BreathingControls {
  // Set breathing pattern
  setPattern: (pattern: BreathingPattern) => void;

  // Set custom rate (breaths per minute)
  setRate: (rate: number) => void;

  // Trigger a sigh
  triggerSigh: () => void;

  // Trigger a deep breath
  triggerDeepBreath: () => void;

  // Hold breath
  holdBreath: (durationMs: number) => void;

  // Pause breathing
  pause: () => void;

  // Resume breathing
  resume: () => void;

  // Reset to default
  reset: () => void;
}

interface UseAvatarBreathingOptions {
  // Initial breathing pattern
  initialPattern?: BreathingPattern;

  // Whether to auto-start
  autoStart?: boolean;

  // Intensity multiplier (affects expansion amounts)
  intensityMultiplier?: number;

  // Whether to add natural variation
  addVariation?: boolean;

  // Variation amount (0-1)
  variationAmount?: number;

  // Callback on inhale start
  onInhale?: () => void;

  // Callback on exhale start
  onExhale?: () => void;
}

interface UseAvatarBreathingResult {
  state: BreathingState;
  controls: BreathingControls;
  isActive: boolean;
}

// Pattern configurations
const PATTERN_CONFIGS: Record<BreathingPattern, {
  rate: number;           // Breaths per minute
  inhaleRatio: number;    // Portion of cycle spent inhaling (0-1)
  intensity: number;      // Base intensity
  variation: number;      // Amount of natural variation
}> = {
  relaxed: { rate: 10, inhaleRatio: 0.4, intensity: 0.8, variation: 0.15 },
  normal: { rate: 14, inhaleRatio: 0.45, intensity: 0.6, variation: 0.1 },
  alert: { rate: 16, inhaleRatio: 0.45, intensity: 0.7, variation: 0.12 },
  speaking: { rate: 18, inhaleRatio: 0.35, intensity: 0.4, variation: 0.25 },
  listening: { rate: 12, inhaleRatio: 0.45, intensity: 0.5, variation: 0.08 },
  excited: { rate: 22, inhaleRatio: 0.4, intensity: 0.9, variation: 0.2 },
  calm: { rate: 6, inhaleRatio: 0.5, intensity: 0.7, variation: 0.05 },
  sighing: { rate: 8, inhaleRatio: 0.3, intensity: 1.0, variation: 0.1 },
};

export function useAvatarBreathing(
  options: UseAvatarBreathingOptions = {}
): UseAvatarBreathingResult {
  const {
    initialPattern = "normal",
    autoStart = true,
    intensityMultiplier = 1,
    addVariation = true,
    variationAmount = 0.1,
    onInhale,
    onExhale,
  } = options;

  // State
  const [pattern, setPatternState] = useState<BreathingPattern>(initialPattern);
  const [customRate, setCustomRate] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(autoStart);
  const [phase, setPhase] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  // Refs
  const animationFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const wasInhalingRef = useRef(false);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const variationOffsetRef = useRef(Math.random() * Math.PI * 2);

  // Get current config
  const config = PATTERN_CONFIGS[pattern];
  const effectiveRate = customRate ?? config.rate;

  // Calculate cycle duration in ms
  const cycleDuration = (60 / effectiveRate) * 1000;

  // Animation loop
  const animate = useCallback(
    (timestamp: number) => {
      if (!isActive || isHolding) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      }

      const deltaTime = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      // Update phase
      setPhase((prevPhase) => {
        let newPhase = prevPhase + deltaTime / cycleDuration;

        // Add natural variation
        if (addVariation) {
          const variationWave = Math.sin(timestamp / 5000 + variationOffsetRef.current);
          newPhase += variationWave * variationAmount * 0.01;
        }

        // Wrap around
        if (newPhase >= 1) {
          newPhase = newPhase % 1;
        }

        return newPhase;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [isActive, isHolding, cycleDuration, addVariation, variationAmount]
  );

  // Start animation loop
  useEffect(() => {
    if (isActive) {
      lastTimeRef.current = 0;
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, animate]);

  // Detect breath phase changes and trigger callbacks
  useEffect(() => {
    const isInhaling = phase < config.inhaleRatio;

    if (isInhaling && !wasInhalingRef.current) {
      onInhale?.();
    } else if (!isInhaling && wasInhalingRef.current) {
      onExhale?.();
    }

    wasInhalingRef.current = isInhaling;
  }, [phase, config.inhaleRatio, onInhale, onExhale]);

  // Calculate derived state values
  const state = useMemo((): BreathingState => {
    const isInhaling = phase < config.inhaleRatio;

    // Calculate breath curve (smooth sine-based)
    let breathCurve: number;
    if (isInhaling) {
      // Inhale: 0 to 1
      const inhaleProgress = phase / config.inhaleRatio;
      breathCurve = Math.sin(inhaleProgress * Math.PI / 2);
    } else {
      // Exhale: 1 to 0
      const exhaleProgress = (phase - config.inhaleRatio) / (1 - config.inhaleRatio);
      breathCurve = Math.cos(exhaleProgress * Math.PI / 2);
    }

    // Apply intensity
    const intensity = breathCurve * config.intensity * intensityMultiplier;

    // Calculate physical movements
    const chestExpansion = intensity * 0.8;
    const shoulderRise = intensity * 0.3;

    // Subtle head movement from breathing
    const headMovement = {
      x: Math.sin(phase * Math.PI * 2) * 0.005 * intensity,
      y: intensity * 0.01,
    };

    return {
      phase,
      intensity,
      isInhaling,
      rate: effectiveRate,
      chestExpansion,
      shoulderRise,
      headMovement,
      pattern,
    };
  }, [phase, config, effectiveRate, intensityMultiplier, pattern]);

  // Controls
  const setPattern = useCallback((newPattern: BreathingPattern) => {
    setPatternState(newPattern);
    setCustomRate(null);
  }, []);

  const setRate = useCallback((rate: number) => {
    setCustomRate(Math.max(4, Math.min(30, rate)));
  }, []);

  const triggerSigh = useCallback(() => {
    setPatternState("sighing");
    setCustomRate(null);
    setPhase(0);

    // Return to previous pattern after one cycle
    setTimeout(() => {
      setPatternState("normal");
    }, (60 / PATTERN_CONFIGS.sighing.rate) * 1000);
  }, []);

  const triggerDeepBreath = useCallback(() => {
    const previousPattern = pattern;
    setPatternState("calm");
    setCustomRate(4); // Very slow
    setPhase(0);

    // Return to previous pattern after one cycle
    setTimeout(() => {
      setPatternState(previousPattern);
      setCustomRate(null);
    }, 15000); // 4 bpm = 15s cycle
  }, [pattern]);

  const holdBreath = useCallback((durationMs: number) => {
    setIsHolding(true);

    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
    }

    holdTimeoutRef.current = setTimeout(() => {
      setIsHolding(false);
      holdTimeoutRef.current = null;
    }, durationMs);
  }, []);

  const pause = useCallback(() => {
    setIsActive(false);
  }, []);

  const resume = useCallback(() => {
    setIsActive(true);
    lastTimeRef.current = 0;
  }, []);

  const reset = useCallback(() => {
    setPatternState(initialPattern);
    setCustomRate(null);
    setPhase(0);
    setIsActive(autoStart);
    setIsHolding(false);

    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }, [initialPattern, autoStart]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
      }
    };
  }, []);

  const controls = useMemo(
    (): BreathingControls => ({
      setPattern,
      setRate,
      triggerSigh,
      triggerDeepBreath,
      holdBreath,
      pause,
      resume,
      reset,
    }),
    [setPattern, setRate, triggerSigh, triggerDeepBreath, holdBreath, pause, resume, reset]
  );

  return { state, controls, isActive };
}

/**
 * Hook for simple breathing intensity value
 */
export function useBreathingIntensity(
  pattern: BreathingPattern = "normal"
): number {
  const { state } = useAvatarBreathing({ initialPattern: pattern });
  return state.intensity;
}

/**
 * Hook for breathing that responds to activity
 */
export function useActivityBreathing(
  activity: "idle" | "speaking" | "listening" | "excited"
): BreathingState {
  const patternMap: Record<string, BreathingPattern> = {
    idle: "relaxed",
    speaking: "speaking",
    listening: "listening",
    excited: "excited",
  };

  const { state, controls } = useAvatarBreathing({
    initialPattern: patternMap[activity] || "normal",
  });

  // Update pattern when activity changes
  useEffect(() => {
    controls.setPattern(patternMap[activity] || "normal");
  }, [activity, controls]);

  return state;
}

/**
 * Hook for breathing CSS transform values
 */
export function useBreathingTransform(
  pattern: BreathingPattern = "normal"
): {
  transform: string;
  style: React.CSSProperties;
} {
  const { state } = useAvatarBreathing({ initialPattern: pattern });

  return useMemo(() => {
    const scaleY = 1 + state.chestExpansion * 0.02;
    const translateY = -state.shoulderRise * 2;

    return {
      transform: `scaleY(${scaleY}) translateY(${translateY}px)`,
      style: {
        transform: `scaleY(${scaleY}) translateY(${translateY}px)`,
        transition: "transform 0.1s ease-out",
      },
    };
  }, [state.chestExpansion, state.shoulderRise]);
}

// Export pattern configs for external use
export { PATTERN_CONFIGS };
