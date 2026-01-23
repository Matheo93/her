/**
 * useAvatarEyebrowController - Natural eyebrow animation and expression control
 *
 * Sprint 1591 - Provides realistic eyebrow movements synchronized with
 * emotions, speech, and conversation context.
 *
 * Features:
 * - 12 eyebrow expression types
 * - Asymmetric expression support
 * - Emotion-synchronized transitions
 * - Micro-expression generation
 * - Speech emphasis coordination
 * - Natural idle variations
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Eyebrow expression types
export type EyebrowExpression =
  | "neutral" // Relaxed
  | "raised" // Both raised (surprise)
  | "lowered" // Both lowered (anger)
  | "furrowed" // Brows together (concern)
  | "arched" // One or both arched (curiosity)
  | "skeptical" // One raised (doubt)
  | "worried" // Inner raised (anxiety)
  | "confused" // Asymmetric furrow
  | "interested" // Slight raise (engagement)
  | "sad" // Inner raise, outer lower
  | "disgusted" // Asymmetric lower
  | "flirty"; // Quick raise-lower

export type EyebrowSide = "left" | "right" | "both";

export interface EyebrowPose {
  leftInner: number; // -1 to 1 (down to up)
  leftOuter: number; // -1 to 1
  rightInner: number; // -1 to 1
  rightOuter: number; // -1 to 1
  furrow: number; // 0 to 1 (brows together)
}

export interface EyebrowKeyframe {
  pose: EyebrowPose;
  duration: number;
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface EyebrowAnimation {
  id: string;
  expression: EyebrowExpression;
  keyframes: EyebrowKeyframe[];
  loop: boolean;
  startTime: number;
}

export interface EyebrowState {
  currentPose: EyebrowPose;
  currentExpression: EyebrowExpression;
  targetExpression: EyebrowExpression;
  isAnimating: boolean;
  activeAnimation: EyebrowAnimation | null;
  lastTransition: number;
}

export interface EyebrowMetrics {
  totalExpressions: number;
  expressionCounts: Record<EyebrowExpression, number>;
  averageTransitionDuration: number;
  microExpressionsTriggered: number;
  emphasisEvents: number;
}

export interface EyebrowConfig {
  transitionDuration: number; // ms for expression changes
  microExpressionEnabled: boolean;
  microExpressionFrequency: number; // per minute
  idleVariationEnabled: boolean;
  idleVariationIntensity: number; // 0-1
  asymmetryEnabled: boolean;
  speechEmphasisEnabled: boolean;
  emotionSyncEnabled: boolean;
  smoothing: number; // 0-1
}

export interface EyebrowControls {
  setExpression: (expression: EyebrowExpression, side?: EyebrowSide) => void;
  playAnimation: (animation: EyebrowAnimation) => void;
  stopAnimation: () => void;
  triggerMicroExpression: () => void;
  triggerEmphasis: () => void;
  syncWithEmotion: (emotion: string, intensity: number) => void;
  reset: () => void;
  updateConfig: (config: Partial<EyebrowConfig>) => void;
}

export interface UseAvatarEyebrowControllerResult {
  state: EyebrowState;
  metrics: EyebrowMetrics;
  controls: EyebrowControls;
  config: EyebrowConfig;
}

const DEFAULT_CONFIG: EyebrowConfig = {
  transitionDuration: 200,
  microExpressionEnabled: true,
  microExpressionFrequency: 3, // per minute
  idleVariationEnabled: true,
  idleVariationIntensity: 0.15,
  asymmetryEnabled: true,
  speechEmphasisEnabled: true,
  emotionSyncEnabled: true,
  smoothing: 0.85,
};

const NEUTRAL_POSE: EyebrowPose = {
  leftInner: 0,
  leftOuter: 0,
  rightInner: 0,
  rightOuter: 0,
  furrow: 0,
};

// Expression presets
const EXPRESSION_POSES: Record<EyebrowExpression, EyebrowPose> = {
  neutral: { leftInner: 0, leftOuter: 0, rightInner: 0, rightOuter: 0, furrow: 0 },
  raised: { leftInner: 0.7, leftOuter: 0.6, rightInner: 0.7, rightOuter: 0.6, furrow: 0 },
  lowered: { leftInner: -0.5, leftOuter: -0.4, rightInner: -0.5, rightOuter: -0.4, furrow: 0.3 },
  furrowed: { leftInner: -0.2, leftOuter: 0, rightInner: -0.2, rightOuter: 0, furrow: 0.8 },
  arched: { leftInner: 0.3, leftOuter: 0.5, rightInner: 0.3, rightOuter: 0.5, furrow: 0 },
  skeptical: { leftInner: 0.5, leftOuter: 0.6, rightInner: -0.1, rightOuter: -0.2, furrow: 0.1 },
  worried: { leftInner: 0.6, leftOuter: -0.1, rightInner: 0.6, rightOuter: -0.1, furrow: 0.4 },
  confused: { leftInner: 0.2, leftOuter: -0.3, rightInner: -0.2, rightOuter: 0.1, furrow: 0.5 },
  interested: { leftInner: 0.3, leftOuter: 0.2, rightInner: 0.3, rightOuter: 0.2, furrow: 0 },
  sad: { leftInner: 0.5, leftOuter: -0.3, rightInner: 0.5, rightOuter: -0.3, furrow: 0.2 },
  disgusted: { leftInner: -0.3, leftOuter: -0.5, rightInner: -0.1, rightOuter: -0.3, furrow: 0.4 },
  flirty: { leftInner: 0.4, leftOuter: 0.3, rightInner: 0.4, rightOuter: 0.3, furrow: 0 },
};

// Emotion to expression mapping
const EMOTION_EXPRESSION_MAP: Record<string, EyebrowExpression> = {
  happy: "raised",
  sad: "sad",
  angry: "lowered",
  surprised: "raised",
  fearful: "worried",
  disgusted: "disgusted",
  confused: "confused",
  curious: "arched",
  skeptical: "skeptical",
  interested: "interested",
  neutral: "neutral",
};

function generateId(): string {
  return `eyebrow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPose(a: EyebrowPose, b: EyebrowPose, t: number): EyebrowPose {
  return {
    leftInner: lerp(a.leftInner, b.leftInner, t),
    leftOuter: lerp(a.leftOuter, b.leftOuter, t),
    rightInner: lerp(a.rightInner, b.rightInner, t),
    rightOuter: lerp(a.rightOuter, b.rightOuter, t),
    furrow: lerp(a.furrow, b.furrow, t),
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeIn(t: number): number {
  return t * t;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function applyEasing(t: number, easing: EyebrowKeyframe["easing"]): number {
  switch (easing) {
    case "ease-in":
      return easeIn(t);
    case "ease-out":
      return easeOut(t);
    case "ease-in-out":
      return easeInOut(t);
    default:
      return t;
  }
}

export function useAvatarEyebrowController(
  initialConfig: Partial<EyebrowConfig> = {}
): UseAvatarEyebrowControllerResult {
  const [config, setConfig] = useState<EyebrowConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [state, setState] = useState<EyebrowState>({
    currentPose: { ...NEUTRAL_POSE },
    currentExpression: "neutral",
    targetExpression: "neutral",
    isAnimating: false,
    activeAnimation: null,
    lastTransition: Date.now(),
  });

  const [metrics, setMetrics] = useState<EyebrowMetrics>({
    totalExpressions: 0,
    expressionCounts: {
      neutral: 0,
      raised: 0,
      lowered: 0,
      furrowed: 0,
      arched: 0,
      skeptical: 0,
      worried: 0,
      confused: 0,
      interested: 0,
      sad: 0,
      disgusted: 0,
      flirty: 0,
    },
    averageTransitionDuration: 0,
    microExpressionsTriggered: 0,
    emphasisEvents: 0,
  });

  // Refs
  const animationRef = useRef<number | null>(null);
  const targetPoseRef = useRef<EyebrowPose>({ ...NEUTRAL_POSE });
  const currentPoseRef = useRef<EyebrowPose>({ ...NEUTRAL_POSE });
  const transitionStartRef = useRef<number>(0);
  const transitionStartPoseRef = useRef<EyebrowPose>({ ...NEUTRAL_POSE });
  const microExpressionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleVariationRef = useRef<number>(0);
  const transitionDurationsRef = useRef<number[]>([]);

  // Set expression
  const setExpression = useCallback(
    (expression: EyebrowExpression, side: EyebrowSide = "both") => {
      const basePose = EXPRESSION_POSES[expression];
      let newTargetPose: EyebrowPose;

      if (side === "both") {
        newTargetPose = { ...basePose };
      } else if (side === "left") {
        newTargetPose = {
          ...currentPoseRef.current,
          leftInner: basePose.leftInner,
          leftOuter: basePose.leftOuter,
          furrow: basePose.furrow * 0.5,
        };
      } else {
        newTargetPose = {
          ...currentPoseRef.current,
          rightInner: basePose.rightInner,
          rightOuter: basePose.rightOuter,
          furrow: basePose.furrow * 0.5,
        };
      }

      // Add asymmetry if enabled
      if (config.asymmetryEnabled && side === "both") {
        const asymmetry = (Math.random() - 0.5) * 0.1;
        newTargetPose.leftInner += asymmetry;
        newTargetPose.rightInner -= asymmetry;
      }

      targetPoseRef.current = newTargetPose;
      transitionStartRef.current = performance.now();
      transitionStartPoseRef.current = { ...currentPoseRef.current };

      setState((prev) => ({
        ...prev,
        targetExpression: expression,
        isAnimating: true,
        lastTransition: Date.now(),
      }));

      // Update metrics
      setMetrics((prev) => ({
        ...prev,
        totalExpressions: prev.totalExpressions + 1,
        expressionCounts: {
          ...prev.expressionCounts,
          [expression]: prev.expressionCounts[expression] + 1,
        },
      }));
    },
    [config.asymmetryEnabled]
  );

  // Play custom animation
  const playAnimation = useCallback((animation: EyebrowAnimation) => {
    setState((prev) => ({
      ...prev,
      activeAnimation: animation,
      isAnimating: true,
    }));
  }, []);

  // Stop animation
  const stopAnimation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeAnimation: null,
    }));
  }, []);

  // Trigger micro-expression
  const triggerMicroExpression = useCallback(() => {
    if (!config.microExpressionEnabled) return;

    const microExpressions: EyebrowExpression[] = [
      "raised",
      "arched",
      "skeptical",
      "interested",
      "flirty",
    ];
    const expression = microExpressions[Math.floor(Math.random() * microExpressions.length)];
    const originalExpression = state.currentExpression;

    // Quick flash of expression
    setExpression(expression);

    setTimeout(() => {
      setExpression(originalExpression);
    }, 150 + Math.random() * 100);

    setMetrics((prev) => ({
      ...prev,
      microExpressionsTriggered: prev.microExpressionsTriggered + 1,
    }));
  }, [config.microExpressionEnabled, state.currentExpression, setExpression]);

  // Trigger emphasis (for speech)
  const triggerEmphasis = useCallback(() => {
    if (!config.speechEmphasisEnabled) return;

    const intensity = 0.2 + Math.random() * 0.2;
    const currentTarget = { ...targetPoseRef.current };

    // Quick raise
    targetPoseRef.current = {
      ...currentTarget,
      leftInner: currentTarget.leftInner + intensity,
      rightInner: currentTarget.rightInner + intensity,
    };

    transitionStartRef.current = performance.now();
    transitionStartPoseRef.current = { ...currentPoseRef.current };

    setState((prev) => ({ ...prev, isAnimating: true }));

    // Return to normal
    setTimeout(() => {
      targetPoseRef.current = currentTarget;
      transitionStartRef.current = performance.now();
      transitionStartPoseRef.current = { ...currentPoseRef.current };
    }, 100);

    setMetrics((prev) => ({
      ...prev,
      emphasisEvents: prev.emphasisEvents + 1,
    }));
  }, [config.speechEmphasisEnabled]);

  // Sync with emotion
  const syncWithEmotion = useCallback(
    (emotion: string, intensity: number) => {
      if (!config.emotionSyncEnabled) return;

      const expression = EMOTION_EXPRESSION_MAP[emotion.toLowerCase()] || "neutral";
      const basePose = EXPRESSION_POSES[expression];

      // Scale by intensity
      targetPoseRef.current = {
        leftInner: basePose.leftInner * intensity,
        leftOuter: basePose.leftOuter * intensity,
        rightInner: basePose.rightInner * intensity,
        rightOuter: basePose.rightOuter * intensity,
        furrow: basePose.furrow * intensity,
      };

      transitionStartRef.current = performance.now();
      transitionStartPoseRef.current = { ...currentPoseRef.current };

      setState((prev) => ({
        ...prev,
        targetExpression: expression,
        isAnimating: true,
      }));
    },
    [config.emotionSyncEnabled]
  );

  // Reset
  const reset = useCallback(() => {
    targetPoseRef.current = { ...NEUTRAL_POSE };
    currentPoseRef.current = { ...NEUTRAL_POSE };

    setState({
      currentPose: { ...NEUTRAL_POSE },
      currentExpression: "neutral",
      targetExpression: "neutral",
      isAnimating: false,
      activeAnimation: null,
      lastTransition: Date.now(),
    });
  }, []);

  // Update config
  const updateConfig = useCallback((updates: Partial<EyebrowConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Animation loop
  useEffect(() => {
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      // Handle custom animation
      if (state.activeAnimation) {
        const animation = state.activeAnimation;
        const elapsed = currentTime - animation.startTime;

        let totalDuration = 0;
        let currentKeyframeIndex = 0;

        for (let i = 0; i < animation.keyframes.length; i++) {
          if (elapsed < totalDuration + animation.keyframes[i].duration) {
            currentKeyframeIndex = i;
            break;
          }
          totalDuration += animation.keyframes[i].duration;
        }

        if (currentKeyframeIndex < animation.keyframes.length) {
          const keyframe = animation.keyframes[currentKeyframeIndex];
          const prevKeyframe =
            currentKeyframeIndex > 0
              ? animation.keyframes[currentKeyframeIndex - 1]
              : { pose: currentPoseRef.current, duration: 0, easing: "linear" as const };

          const keyframeElapsed = elapsed - totalDuration;
          const rawProgress = Math.min(keyframeElapsed / keyframe.duration, 1);
          const progress = applyEasing(rawProgress, keyframe.easing);

          currentPoseRef.current = lerpPose(prevKeyframe.pose, keyframe.pose, progress);
        } else if (animation.loop) {
          setState((prev) => ({
            ...prev,
            activeAnimation: { ...animation, startTime: currentTime },
          }));
        } else {
          setState((prev) => ({ ...prev, activeAnimation: null }));
        }
      } else {
        // Standard transition
        const transitionElapsed = currentTime - transitionStartRef.current;
        const transitionProgress = Math.min(transitionElapsed / config.transitionDuration, 1);
        const easedProgress = easeInOut(transitionProgress);

        // Interpolate pose
        const interpolatedPose = lerpPose(
          transitionStartPoseRef.current,
          targetPoseRef.current,
          easedProgress
        );

        // Apply idle variation
        if (config.idleVariationEnabled && transitionProgress >= 1) {
          idleVariationRef.current += deltaTime * 0.001;
          const noise = Math.sin(idleVariationRef.current * 0.5) * config.idleVariationIntensity;

          interpolatedPose.leftInner += noise * 0.5;
          interpolatedPose.rightInner += noise * 0.5;
        }

        // Apply smoothing
        currentPoseRef.current = lerpPose(
          currentPoseRef.current,
          interpolatedPose,
          1 - config.smoothing
        );

        // Track transition duration
        if (transitionProgress >= 1 && state.isAnimating) {
          transitionDurationsRef.current.push(transitionElapsed);
          if (transitionDurationsRef.current.length > 50) {
            transitionDurationsRef.current.shift();
          }

          const avgDuration =
            transitionDurationsRef.current.reduce((a, b) => a + b, 0) /
            transitionDurationsRef.current.length;

          setMetrics((prev) => ({
            ...prev,
            averageTransitionDuration: avgDuration,
          }));

          setState((prev) => ({
            ...prev,
            isAnimating: false,
            currentExpression: prev.targetExpression,
          }));
        }
      }

      // Update state with current pose
      setState((prev) => ({
        ...prev,
        currentPose: { ...currentPoseRef.current },
      }));

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [
    state.activeAnimation,
    state.isAnimating,
    config.transitionDuration,
    config.idleVariationEnabled,
    config.idleVariationIntensity,
    config.smoothing,
  ]);

  // Micro-expression timer
  useEffect(() => {
    if (!config.microExpressionEnabled || config.microExpressionFrequency <= 0) return;

    const intervalMs = (60 / config.microExpressionFrequency) * 1000;

    const scheduleNext = () => {
      const variance = intervalMs * 0.5;
      const delay = intervalMs + (Math.random() - 0.5) * variance;

      microExpressionTimerRef.current = setTimeout(() => {
        triggerMicroExpression();
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      if (microExpressionTimerRef.current) {
        clearTimeout(microExpressionTimerRef.current);
      }
    };
  }, [config.microExpressionEnabled, config.microExpressionFrequency, triggerMicroExpression]);

  const controls: EyebrowControls = useMemo(
    () => ({
      setExpression,
      playAnimation,
      stopAnimation,
      triggerMicroExpression,
      triggerEmphasis,
      syncWithEmotion,
      reset,
      updateConfig,
    }),
    [
      setExpression,
      playAnimation,
      stopAnimation,
      triggerMicroExpression,
      triggerEmphasis,
      syncWithEmotion,
      reset,
      updateConfig,
    ]
  );

  return {
    state,
    metrics,
    controls,
    config,
  };
}

// Sub-hook: Simple eyebrow expression
export function useEyebrowExpression(): {
  expression: EyebrowExpression;
  pose: EyebrowPose;
  setExpression: (expression: EyebrowExpression) => void;
} {
  const { state, controls } = useAvatarEyebrowController();

  return {
    expression: state.currentExpression,
    pose: state.currentPose,
    setExpression: controls.setExpression,
  };
}

// Sub-hook: Emotion-synced eyebrows
export function useEmotionSyncedEyebrows(
  emotion: string,
  intensity: number = 1
): UseAvatarEyebrowControllerResult {
  const result = useAvatarEyebrowController();

  useEffect(() => {
    result.controls.syncWithEmotion(emotion, intensity);
  }, [emotion, intensity, result.controls]);

  return result;
}

export default useAvatarEyebrowController;
