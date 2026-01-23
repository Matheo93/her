/**
 * useAvatarBlinkController - Natural blinking behavior for avatar
 *
 * Sprint 1589 - Provides realistic, context-aware blinking animations
 * for natural avatar presence and emotional expression.
 *
 * Features:
 * - Natural blink timing with variation
 * - Emotional state influence on blink rate
 * - Multiple blink types (normal, slow, rapid, double)
 * - Eye strain prevention (forced blinks)
 * - Gaze-synchronized blinking
 * - Conversation-aware timing
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Blink types
export type BlinkType =
  | "normal" // Standard blink
  | "slow" // Elongated blink (tired, relaxed)
  | "rapid" // Quick blink
  | "double" // Double blink (surprise, emphasis)
  | "half" // Partial close (thinking, skeptical)
  | "long" // Extended close (emphatic, dramatic)
  | "flutter" // Multiple rapid partial blinks
  | "wink_left" // Left eye only
  | "wink_right"; // Right eye only

export type BlinkPhase = "open" | "closing" | "closed" | "opening";

export interface BlinkKeyframe {
  leftEye: number; // 0 = open, 1 = closed
  rightEye: number;
  duration: number; // ms for this keyframe
}

export interface BlinkAnimation {
  type: BlinkType;
  keyframes: BlinkKeyframe[];
  totalDuration: number;
}

export interface BlinkState {
  isBlinking: boolean;
  phase: BlinkPhase;
  progress: number; // 0-1 through animation
  leftEye: number; // 0-1 closure amount
  rightEye: number;
  currentType: BlinkType | null;
  timeSinceLastBlink: number;
  nextBlinkIn: number;
}

export interface BlinkMetrics {
  totalBlinks: number;
  blinksPerMinute: number;
  averageInterval: number;
  blinksByType: Record<BlinkType, number>;
  forcedBlinks: number;
}

export interface BlinkConfig {
  enabled: boolean;
  baseIntervalMs: number; // Base time between blinks
  intervalVariation: number; // Random variation (0-1)
  closeDurationMs: number; // How long eyes stay closed
  transitionDurationMs: number; // Open/close transition time
  emotionalSensitivity: number; // 0-1
  maxIntervalMs: number; // Force blink if exceeded
  gapeSensitivity: number; // Reduce blink rate when staring
  doubleBlinkChance: number; // 0-1 probability
  smoothing: number; // 0-1 animation smoothing
}

export interface BlinkControls {
  triggerBlink: (type?: BlinkType) => void;
  triggerWink: (side: "left" | "right") => void;
  setEmotionalState: (emotion: string, intensity: number) => void;
  setFocused: (isFocused: boolean) => void;
  setSpeaking: (isSpeaking: boolean) => void;
  setListening: (isListening: boolean) => void;
  pause: () => void;
  resume: () => void;
  updateConfig: (config: Partial<BlinkConfig>) => void;
  reset: () => void;
}

export interface UseAvatarBlinkControllerResult {
  state: BlinkState;
  metrics: BlinkMetrics;
  controls: BlinkControls;
  config: BlinkConfig;
}

// Blink animation definitions
const BLINK_ANIMATIONS: Record<BlinkType, (config: BlinkConfig) => BlinkAnimation> = {
  normal: (config) => ({
    type: "normal",
    keyframes: [
      { leftEye: 0, rightEye: 0, duration: 0 },
      { leftEye: 1, rightEye: 1, duration: config.transitionDurationMs },
      { leftEye: 1, rightEye: 1, duration: config.closeDurationMs },
      { leftEye: 0, rightEye: 0, duration: config.transitionDurationMs },
    ],
    totalDuration: config.transitionDurationMs * 2 + config.closeDurationMs,
  }),
  slow: (config) => ({
    type: "slow",
    keyframes: [
      { leftEye: 0, rightEye: 0, duration: 0 },
      { leftEye: 1, rightEye: 1, duration: config.transitionDurationMs * 1.5 },
      { leftEye: 1, rightEye: 1, duration: config.closeDurationMs * 2 },
      { leftEye: 0, rightEye: 0, duration: config.transitionDurationMs * 1.5 },
    ],
    totalDuration: config.transitionDurationMs * 3 + config.closeDurationMs * 2,
  }),
  rapid: (config) => ({
    type: "rapid",
    keyframes: [
      { leftEye: 0, rightEye: 0, duration: 0 },
      { leftEye: 1, rightEye: 1, duration: config.transitionDurationMs * 0.5 },
      { leftEye: 1, rightEye: 1, duration: config.closeDurationMs * 0.5 },
      { leftEye: 0, rightEye: 0, duration: config.transitionDurationMs * 0.5 },
    ],
    totalDuration: config.transitionDurationMs + config.closeDurationMs * 0.5,
  }),
  double: (config) => ({
    type: "double",
    keyframes: [
      { leftEye: 0, rightEye: 0, duration: 0 },
      { leftEye: 1, rightEye: 1, duration: config.transitionDurationMs },
      { leftEye: 1, rightEye: 1, duration: config.closeDurationMs * 0.5 },
      { leftEye: 0, rightEye: 0, duration: config.transitionDurationMs * 0.7 },
      { leftEye: 0, rightEye: 0, duration: 50 },
      { leftEye: 1, rightEye: 1, duration: config.transitionDurationMs },
      { leftEye: 1, rightEye: 1, duration: config.closeDurationMs * 0.5 },
      { leftEye: 0, rightEye: 0, duration: config.transitionDurationMs },
    ],
    totalDuration: config.transitionDurationMs * 3.7 + config.closeDurationMs + 50,
  }),
  half: (config) => ({
    type: "half",
    keyframes: [
      { leftEye: 0, rightEye: 0, duration: 0 },
      { leftEye: 0.5, rightEye: 0.5, duration: config.transitionDurationMs * 0.8 },
      { leftEye: 0.5, rightEye: 0.5, duration: config.closeDurationMs * 1.5 },
      { leftEye: 0, rightEye: 0, duration: config.transitionDurationMs * 0.8 },
    ],
    totalDuration: config.transitionDurationMs * 1.6 + config.closeDurationMs * 1.5,
  }),
  long: (config) => ({
    type: "long",
    keyframes: [
      { leftEye: 0, rightEye: 0, duration: 0 },
      { leftEye: 1, rightEye: 1, duration: config.transitionDurationMs },
      { leftEye: 1, rightEye: 1, duration: config.closeDurationMs * 4 },
      { leftEye: 0, rightEye: 0, duration: config.transitionDurationMs * 1.2 },
    ],
    totalDuration: config.transitionDurationMs * 2.2 + config.closeDurationMs * 4,
  }),
  flutter: (config) => ({
    type: "flutter",
    keyframes: [
      { leftEye: 0, rightEye: 0, duration: 0 },
      { leftEye: 0.7, rightEye: 0.7, duration: 30 },
      { leftEye: 0.3, rightEye: 0.3, duration: 30 },
      { leftEye: 0.8, rightEye: 0.8, duration: 30 },
      { leftEye: 0.4, rightEye: 0.4, duration: 30 },
      { leftEye: 0.9, rightEye: 0.9, duration: 30 },
      { leftEye: 0, rightEye: 0, duration: 50 },
    ],
    totalDuration: 200,
  }),
  wink_left: (config) => ({
    type: "wink_left",
    keyframes: [
      { leftEye: 0, rightEye: 0, duration: 0 },
      { leftEye: 1, rightEye: 0, duration: config.transitionDurationMs },
      { leftEye: 1, rightEye: 0, duration: config.closeDurationMs * 1.5 },
      { leftEye: 0, rightEye: 0, duration: config.transitionDurationMs },
    ],
    totalDuration: config.transitionDurationMs * 2 + config.closeDurationMs * 1.5,
  }),
  wink_right: (config) => ({
    type: "wink_right",
    keyframes: [
      { leftEye: 0, rightEye: 0, duration: 0 },
      { leftEye: 0, rightEye: 1, duration: config.transitionDurationMs },
      { leftEye: 0, rightEye: 1, duration: config.closeDurationMs * 1.5 },
      { leftEye: 0, rightEye: 0, duration: config.transitionDurationMs },
    ],
    totalDuration: config.transitionDurationMs * 2 + config.closeDurationMs * 1.5,
  }),
};

// Emotion to blink rate multiplier
const EMOTION_BLINK_MULTIPLIERS: Record<string, number> = {
  neutral: 1.0,
  happy: 1.1,
  excited: 1.3,
  sad: 0.8,
  tired: 0.6,
  anxious: 1.4,
  focused: 0.7,
  surprised: 0.5,
  thoughtful: 0.9,
  amused: 1.2,
};

const DEFAULT_CONFIG: BlinkConfig = {
  enabled: true,
  baseIntervalMs: 4000, // ~15 blinks per minute
  intervalVariation: 0.4,
  closeDurationMs: 100,
  transitionDurationMs: 70,
  emotionalSensitivity: 0.7,
  maxIntervalMs: 10000,
  gapeSensitivity: 0.5,
  doubleBlinkChance: 0.08,
  smoothing: 0.85,
};

// Easing function for natural movement
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function useAvatarBlinkController(
  initialConfig: Partial<BlinkConfig> = {}
): UseAvatarBlinkControllerResult {
  const [config, setConfig] = useState<BlinkConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [state, setState] = useState<BlinkState>({
    isBlinking: false,
    phase: "open",
    progress: 0,
    leftEye: 0,
    rightEye: 0,
    currentType: null,
    timeSinceLastBlink: 0,
    nextBlinkIn: config.baseIntervalMs,
  });

  const [metrics, setMetrics] = useState<BlinkMetrics>({
    totalBlinks: 0,
    blinksPerMinute: 0,
    averageInterval: config.baseIntervalMs,
    blinksByType: {
      normal: 0,
      slow: 0,
      rapid: 0,
      double: 0,
      half: 0,
      long: 0,
      flutter: 0,
      wink_left: 0,
      wink_right: 0,
    },
    forcedBlinks: 0,
  });

  // Refs
  const animationRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);
  const lastBlinkTimeRef = useRef(Date.now());
  const nextBlinkTimeRef = useRef(Date.now() + config.baseIntervalMs);
  const currentAnimationRef = useRef<BlinkAnimation | null>(null);
  const animationStartRef = useRef<number>(0);
  const blinkTimestampsRef = useRef<number[]>([]);
  const intervalHistoryRef = useRef<number[]>([]);
  const emotionMultiplierRef = useRef(1.0);
  const isFocusedRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isListeningRef = useRef(false);

  // Calculate next blink interval
  const calculateNextInterval = useCallback((): number => {
    let interval = config.baseIntervalMs;

    // Apply emotion multiplier
    interval *= emotionMultiplierRef.current;

    // Apply focus adjustment
    if (isFocusedRef.current) {
      interval *= 1.3;
    }

    // Apply speaking adjustment (blink less while speaking)
    if (isSpeakingRef.current) {
      interval *= 1.2;
    }

    // Apply listening adjustment
    if (isListeningRef.current) {
      interval *= 0.9;
    }

    // Add random variation
    const variation = 1 + (Math.random() - 0.5) * 2 * config.intervalVariation;
    interval *= variation;

    return Math.min(config.maxIntervalMs, Math.max(500, interval));
  }, [config.baseIntervalMs, config.intervalVariation, config.maxIntervalMs]);

  // Execute blink animation
  const executeBlink = useCallback(
    (type: BlinkType = "normal") => {
      if (currentAnimationRef.current) return; // Already blinking

      // Determine blink type (chance for double blink)
      let actualType = type;
      if (type === "normal" && Math.random() < config.doubleBlinkChance) {
        actualType = "double";
      }

      const animation = BLINK_ANIMATIONS[actualType](config);
      currentAnimationRef.current = animation;
      animationStartRef.current = Date.now();

      // Track interval
      const interval = Date.now() - lastBlinkTimeRef.current;
      intervalHistoryRef.current.push(interval);
      if (intervalHistoryRef.current.length > 20) {
        intervalHistoryRef.current.shift();
      }

      // Track blink timestamps
      blinkTimestampsRef.current.push(Date.now());
      if (blinkTimestampsRef.current.length > 60) {
        blinkTimestampsRef.current.shift();
      }

      lastBlinkTimeRef.current = Date.now();
      nextBlinkTimeRef.current = Date.now() + calculateNextInterval();

      // Update metrics
      setMetrics((prev) => {
        const blinksInLastMinute = blinkTimestampsRef.current.filter(
          (t) => Date.now() - t < 60000
        ).length;

        return {
          ...prev,
          totalBlinks: prev.totalBlinks + 1,
          blinksPerMinute: blinksInLastMinute,
          averageInterval:
            intervalHistoryRef.current.reduce((a, b) => a + b, 0) /
            intervalHistoryRef.current.length,
          blinksByType: {
            ...prev.blinksByType,
            [actualType]: prev.blinksByType[actualType] + 1,
          },
        };
      });

      setState((prev) => ({
        ...prev,
        isBlinking: true,
        currentType: actualType,
      }));
    },
    [config, calculateNextInterval]
  );

  // Animation loop
  useEffect(() => {
    if (!config.enabled) return;

    let lastFrameTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const deltaTime = now - lastFrameTime;
      lastFrameTime = now;

      if (isPausedRef.current) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Handle ongoing blink animation
      if (currentAnimationRef.current) {
        const elapsed = now - animationStartRef.current;
        const animation = currentAnimationRef.current;

        if (elapsed >= animation.totalDuration) {
          // Animation complete
          currentAnimationRef.current = null;
          setState((prev) => ({
            ...prev,
            isBlinking: false,
            phase: "open",
            progress: 0,
            leftEye: 0,
            rightEye: 0,
            currentType: null,
          }));
        } else {
          // Find current keyframe
          let accumulatedTime = 0;
          let currentKeyframeIndex = 0;
          let keyframeProgress = 0;

          for (let i = 0; i < animation.keyframes.length; i++) {
            if (elapsed < accumulatedTime + animation.keyframes[i].duration) {
              currentKeyframeIndex = i;
              keyframeProgress =
                i === 0
                  ? 0
                  : (elapsed - accumulatedTime) / animation.keyframes[i].duration;
              break;
            }
            accumulatedTime += animation.keyframes[i].duration;
          }

          // Interpolate between keyframes
          const current = animation.keyframes[currentKeyframeIndex];
          const next =
            animation.keyframes[
              Math.min(currentKeyframeIndex + 1, animation.keyframes.length - 1)
            ];
          const t = easeInOutQuad(keyframeProgress);

          const leftEye = current.leftEye + (next.leftEye - current.leftEye) * t;
          const rightEye = current.rightEye + (next.rightEye - current.rightEye) * t;

          // Determine phase
          let phase: BlinkPhase = "open";
          if (leftEye > 0.9) {
            phase = "closed";
          } else if (leftEye > 0.1) {
            phase = leftEye > (state.leftEye || 0) ? "closing" : "opening";
          }

          setState((prev) => ({
            ...prev,
            phase,
            progress: elapsed / animation.totalDuration,
            leftEye,
            rightEye,
          }));
        }
      } else {
        // Check if it's time for next blink
        const timeSinceLast = now - lastBlinkTimeRef.current;
        const timeUntilNext = nextBlinkTimeRef.current - now;

        setState((prev) => ({
          ...prev,
          timeSinceLastBlink: timeSinceLast,
          nextBlinkIn: Math.max(0, timeUntilNext),
        }));

        // Force blink if too long
        if (timeSinceLast > config.maxIntervalMs) {
          executeBlink("normal");
          setMetrics((prev) => ({
            ...prev,
            forcedBlinks: prev.forcedBlinks + 1,
          }));
        } else if (now >= nextBlinkTimeRef.current) {
          executeBlink("normal");
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [config, executeBlink, state.leftEye]);

  // Controls
  const triggerBlink = useCallback(
    (type: BlinkType = "normal") => {
      executeBlink(type);
    },
    [executeBlink]
  );

  const triggerWink = useCallback(
    (side: "left" | "right") => {
      executeBlink(side === "left" ? "wink_left" : "wink_right");
    },
    [executeBlink]
  );

  const setEmotionalState = useCallback(
    (emotion: string, intensity: number) => {
      const multiplier = EMOTION_BLINK_MULTIPLIERS[emotion.toLowerCase()] || 1.0;
      emotionMultiplierRef.current =
        1 + (multiplier - 1) * intensity * config.emotionalSensitivity;
    },
    [config.emotionalSensitivity]
  );

  const setFocused = useCallback((isFocused: boolean) => {
    isFocusedRef.current = isFocused;
  }, []);

  const setSpeaking = useCallback((isSpeaking: boolean) => {
    isSpeakingRef.current = isSpeaking;
  }, []);

  const setListening = useCallback((isListening: boolean) => {
    isListeningRef.current = isListening;
  }, []);

  const pause = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
  }, []);

  const updateConfig = useCallback((updates: Partial<BlinkConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const reset = useCallback(() => {
    currentAnimationRef.current = null;
    lastBlinkTimeRef.current = Date.now();
    nextBlinkTimeRef.current = Date.now() + config.baseIntervalMs;
    blinkTimestampsRef.current = [];
    intervalHistoryRef.current = [];
    emotionMultiplierRef.current = 1.0;

    setState({
      isBlinking: false,
      phase: "open",
      progress: 0,
      leftEye: 0,
      rightEye: 0,
      currentType: null,
      timeSinceLastBlink: 0,
      nextBlinkIn: config.baseIntervalMs,
    });

    setMetrics({
      totalBlinks: 0,
      blinksPerMinute: 0,
      averageInterval: config.baseIntervalMs,
      blinksByType: {
        normal: 0,
        slow: 0,
        rapid: 0,
        double: 0,
        half: 0,
        long: 0,
        flutter: 0,
        wink_left: 0,
        wink_right: 0,
      },
      forcedBlinks: 0,
    });
  }, [config.baseIntervalMs]);

  const controls: BlinkControls = useMemo(
    () => ({
      triggerBlink,
      triggerWink,
      setEmotionalState,
      setFocused,
      setSpeaking,
      setListening,
      pause,
      resume,
      updateConfig,
      reset,
    }),
    [
      triggerBlink,
      triggerWink,
      setEmotionalState,
      setFocused,
      setSpeaking,
      setListening,
      pause,
      resume,
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

// Sub-hook: Simple eye closure values
export function useEyeClosure(config?: Partial<BlinkConfig>): {
  left: number;
  right: number;
  isBlinking: boolean;
} {
  const { state } = useAvatarBlinkController(config);

  return {
    left: state.leftEye,
    right: state.rightEye,
    isBlinking: state.isBlinking,
  };
}

// Sub-hook: Conversation-aware blinking
export function useConversationBlink(
  isSpeaking: boolean,
  isListening: boolean,
  emotion?: string
): UseAvatarBlinkControllerResult {
  const result = useAvatarBlinkController();

  useEffect(() => {
    result.controls.setSpeaking(isSpeaking);
  }, [isSpeaking, result.controls]);

  useEffect(() => {
    result.controls.setListening(isListening);
  }, [isListening, result.controls]);

  useEffect(() => {
    if (emotion) {
      result.controls.setEmotionalState(emotion, 0.7);
    }
  }, [emotion, result.controls]);

  return result;
}

export default useAvatarBlinkController;
