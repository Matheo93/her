"use client";

import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { HER_COLORS } from "@/styles/her-theme";
import type { AnimationSettings } from "@/hooks/useMobileOptimization";
import {
  useTouchResponseOptimizer,
  type TrackedTouch,
} from "@/hooks/useTouchResponseOptimizer";
import {
  useMobileAvatarLatencyMitigator,
  type AvatarPose,
} from "@/hooks/useMobileAvatarLatencyMitigator";

/**
 * OptimizedAvatar - Sprint 514
 *
 * Mobile-optimized avatar component with:
 * - Adaptive animation complexity based on device capabilities
 * - Throttled frame updates to prevent jank
 * - Memoized expensive computations
 * - Reduced DOM nodes on low-end devices
 */

export interface VisemeWeights {
  [key: string]: number;
}

interface OptimizedAvatarProps {
  visemeWeights: VisemeWeights;
  emotion: string;
  isSpeaking: boolean;
  isListening: boolean;
  audioLevel: number;
  animationSettings: AnimationSettings;
  className?: string;
  /** Callback when avatar is touched (for interaction feedback) */
  onTouch?: (position: { x: number; y: number }) => void;
  /** Callback for latency metrics (Sprint 521) */
  onLatencyMeasured?: (latencyMs: number) => void;
  /** Enable touch interaction feedback */
  enableTouchFeedback?: boolean;
}

// Emotion color mappings
const EMOTION_COLORS: Record<string, { glow: string; cheek: string }> = {
  neutral: { glow: HER_COLORS.coral + "30", cheek: HER_COLORS.blush },
  joy: { glow: HER_COLORS.coral + "50", cheek: HER_COLORS.coral },
  listening: { glow: HER_COLORS.coral + "40", cheek: HER_COLORS.blush },
  curiosity: { glow: HER_COLORS.coral + "35", cheek: HER_COLORS.blush },
  warmth: { glow: HER_COLORS.coral + "45", cheek: HER_COLORS.coral },
  tenderness: { glow: HER_COLORS.coral + "50", cheek: HER_COLORS.coral },
  sadness: { glow: HER_COLORS.softShadow + "30", cheek: HER_COLORS.blush },
};

// Throttle function for frame updates
function useThrottledValue<T>(value: T, fps: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdateRef = useRef(0);
  const frameIdRef = useRef<number | null>(null);

  useEffect(() => {
    const minFrameTime = 1000 / fps;

    const update = () => {
      const now = performance.now();
      if (now - lastUpdateRef.current >= minFrameTime) {
        setThrottledValue(value);
        lastUpdateRef.current = now;
      }
      frameIdRef.current = requestAnimationFrame(update);
    };

    frameIdRef.current = requestAnimationFrame(update);

    return () => {
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, [value, fps]);

  return throttledValue;
}

// Calculate mouth shape from viseme weights (memoized)
function useMouthShape(
  visemeWeights: VisemeWeights,
  audioLevel: number,
  isSpeaking: boolean
): { openness: number; width: number } {
  return useMemo(() => {
    if (!isSpeaking || audioLevel < 0.05) {
      return { openness: 0, width: 0 };
    }

    // Calculate mouth openness from vowel visemes
    const aa = visemeWeights.AA || 0;
    const ee = visemeWeights.EE || 0;
    const oo = visemeWeights.OO || 0;
    const sil = visemeWeights.sil || 0;

    // Weighted combination for openness
    const openness = Math.min(1, (aa * 0.8 + ee * 0.4 + oo * 0.6) * 2.5 + audioLevel * 0.5);

    // Wider mouth for EE, narrower for OO
    const width = ee * 0.5 - oo * 0.3;

    return {
      openness: openness * (1 - sil),
      width: width * (1 - sil),
    };
  }, [visemeWeights, audioLevel, isSpeaking]);
}

// Low quality avatar (minimal DOM, no effects)
const LowQualityAvatar = memo(function LowQualityAvatar({
  emotion,
  isSpeaking,
  isListening,
  mouthOpenness,
}: {
  emotion: string;
  isSpeaking: boolean;
  isListening: boolean;
  mouthOpenness: number;
}) {
  const colors = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;

  return (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      {/* Simple face background */}
      <circle
        cx="100"
        cy="100"
        r="90"
        fill={isListening ? HER_COLORS.blush : HER_COLORS.cream}
      />

      {/* Eyes - simple curves */}
      <path
        d="M 65 90 Q 75 85 85 90"
        stroke={HER_COLORS.earth}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 115 90 Q 125 85 135 90"
        stroke={HER_COLORS.earth}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Mouth - animated for speaking */}
      <path
        d={`M 85 125 Q 100 ${130 + mouthOpenness * 15} 115 125`}
        stroke={HER_COLORS.coral}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />

      {/* Cheek blush - static */}
      <circle cx="60" cy="105" r="12" fill={colors.cheek} opacity="0.15" />
      <circle cx="140" cy="105" r="12" fill={colors.cheek} opacity="0.15" />

      {/* Listening indicator - simple ring */}
      {isListening && (
        <circle
          cx="100"
          cy="100"
          r="95"
          stroke={HER_COLORS.coral}
          strokeWidth="2"
          fill="none"
          opacity="0.5"
        />
      )}
    </svg>
  );
});

// Medium quality avatar (some effects, moderate DOM)
const MediumQualityAvatar = memo(function MediumQualityAvatar({
  emotion,
  isSpeaking,
  isListening,
  audioLevel,
  mouthOpenness,
  enableBreathing,
}: {
  emotion: string;
  isSpeaking: boolean;
  isListening: boolean;
  audioLevel: number;
  mouthOpenness: number;
  enableBreathing: boolean;
}) {
  const colors = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative w-full h-full">
      {/* Glow effect */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: colors.glow }}
        animate={{
          opacity: isSpeaking ? 0.6 + audioLevel * 0.3 : isListening ? 0.5 : 0.3,
          scale: isSpeaking ? 1.1 + audioLevel * 0.1 : 1,
        }}
        transition={{ duration: 0.15 }}
      />

      <motion.svg
        viewBox="0 0 200 200"
        className="relative z-10 w-full h-full"
        animate={enableBreathing && !prefersReducedMotion ? {
          scale: [1, 1.015, 1],
        } : {}}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <defs>
          <radialGradient id="faceGradientOpt" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={HER_COLORS.warmWhite} />
            <stop offset="100%" stopColor={HER_COLORS.cream} />
          </radialGradient>
        </defs>

        {/* Face with gradient */}
        <motion.circle
          cx="100"
          cy="100"
          r="90"
          fill="url(#faceGradientOpt)"
          animate={{
            fill: isListening ? HER_COLORS.blush : undefined,
          }}
          transition={{ duration: 0.3 }}
        />

        {/* Eyes with subtle animation */}
        <motion.path
          d="M 65 90 Q 75 85 85 90"
          stroke={HER_COLORS.earth}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          animate={isListening && !prefersReducedMotion ? {
            d: ["M 65 90 Q 75 85 85 90", "M 65 88 Q 75 83 85 88"],
          } : {}}
          transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse" }}
        />
        <motion.path
          d="M 115 90 Q 125 85 135 90"
          stroke={HER_COLORS.earth}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          animate={isListening && !prefersReducedMotion ? {
            d: ["M 115 90 Q 125 85 135 90", "M 115 88 Q 125 83 135 88"],
          } : {}}
          transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse" }}
        />

        {/* Mouth */}
        <motion.path
          d={`M 85 125 Q 100 ${130 + mouthOpenness * 15} 115 125`}
          stroke={HER_COLORS.coral}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          transition={{ duration: 0.05 }}
        />

        {/* Cheeks */}
        <motion.circle
          cx="60"
          cy="105"
          r="12"
          fill={colors.cheek}
          animate={{
            opacity: emotion === "joy" || emotion === "warmth" ? 0.25 : 0.12,
          }}
          transition={{ duration: 0.5 }}
        />
        <motion.circle
          cx="140"
          cy="105"
          r="12"
          fill={colors.cheek}
          animate={{
            opacity: emotion === "joy" || emotion === "warmth" ? 0.25 : 0.12,
          }}
          transition={{ duration: 0.5 }}
        />
      </motion.svg>

      {/* Listening ring animation */}
      <AnimatePresence>
        {isListening && !prefersReducedMotion && (
          <motion.div
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: HER_COLORS.coral }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: [0.3, 0.5, 0.3],
              scale: [1, 1.03, 1],
            }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

// High quality avatar (full effects)
const HighQualityAvatar = memo(function HighQualityAvatar({
  emotion,
  isSpeaking,
  isListening,
  audioLevel,
  mouthOpenness,
  mouthWidth,
}: {
  emotion: string;
  isSpeaking: boolean;
  isListening: boolean;
  audioLevel: number;
  mouthOpenness: number;
  mouthWidth: number;
}) {
  const colors = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;
  const prefersReducedMotion = useReducedMotion();

  // Blink state
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) return;

    const blink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    };

    // Random blink interval 2-6 seconds
    const scheduleNextBlink = () => {
      const delay = 2000 + Math.random() * 4000;
      return setTimeout(() => {
        blink();
        scheduleNextBlink();
      }, delay);
    };

    const timeoutId = scheduleNextBlink();
    return () => clearTimeout(timeoutId);
  }, [prefersReducedMotion]);

  return (
    <div className="relative w-full h-full">
      {/* Multi-layer glow */}
      <motion.div
        className="absolute inset-0 rounded-full blur-xl"
        style={{ backgroundColor: colors.glow }}
        animate={{
          opacity: isSpeaking ? 0.7 + audioLevel * 0.3 : isListening ? 0.5 : 0.35,
          scale: isSpeaking ? 1.15 + audioLevel * 0.15 : 1,
        }}
        transition={{ duration: 0.1 }}
      />

      {/* Inner glow */}
      <motion.div
        className="absolute inset-2 rounded-full blur-md"
        style={{ backgroundColor: HER_COLORS.coral + "20" }}
        animate={{
          opacity: isSpeaking ? audioLevel * 0.6 : 0,
        }}
        transition={{ duration: 0.05 }}
      />

      <motion.svg
        viewBox="0 0 200 200"
        className="relative z-10 w-full h-full"
        animate={{
          scale: [1, 1.02, 1],
          y: [0, -2, 0],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <defs>
          <radialGradient id="faceGradientHigh" cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor={HER_COLORS.warmWhite} />
            <stop offset="70%" stopColor={HER_COLORS.cream} />
            <stop offset="100%" stopColor={HER_COLORS.blush + "30"} />
          </radialGradient>
          <radialGradient id="speakingGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HER_COLORS.coral} stopOpacity="0.4" />
            <stop offset="100%" stopColor={HER_COLORS.coral} stopOpacity="0" />
          </radialGradient>
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Base face */}
        <circle cx="100" cy="100" r="90" fill="url(#faceGradientHigh)" />

        {/* Speaking glow overlay */}
        <motion.circle
          cx="100"
          cy="100"
          r="85"
          fill="url(#speakingGlow)"
          animate={{
            opacity: isSpeaking ? 0.5 + audioLevel * 0.5 : 0,
          }}
          transition={{ duration: 0.05 }}
        />

        {/* Eyes with pupils */}
        <g filter="url(#softGlow)">
          {/* Left eye */}
          <motion.path
            d={isBlinking ? "M 65 90 Q 75 90 85 90" : "M 65 90 Q 75 85 85 90"}
            stroke={HER_COLORS.earth}
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            animate={isListening ? {
              d: isBlinking
                ? "M 65 90 Q 75 90 85 90"
                : ["M 65 90 Q 75 85 85 90", "M 65 88 Q 75 82 85 88", "M 65 90 Q 75 85 85 90"],
            } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          />

          {/* Right eye */}
          <motion.path
            d={isBlinking ? "M 115 90 Q 125 90 135 90" : "M 115 90 Q 125 85 135 90"}
            stroke={HER_COLORS.earth}
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            animate={isListening ? {
              d: isBlinking
                ? "M 115 90 Q 125 90 135 90"
                : ["M 115 90 Q 125 85 135 90", "M 115 88 Q 125 82 135 88", "M 115 90 Q 125 85 135 90"],
            } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </g>

        {/* Mouth with width variation */}
        <motion.path
          d={`M ${85 - mouthWidth * 5} 125 Q 100 ${130 + mouthOpenness * 18} ${115 + mouthWidth * 5} 125`}
          stroke={HER_COLORS.coral}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          transition={{ duration: 0.03 }}
        />

        {/* Cheeks with gradient */}
        <motion.ellipse
          cx="58"
          cy="108"
          rx="14"
          ry="10"
          fill={colors.cheek}
          animate={{
            opacity: emotion === "joy" || emotion === "warmth" || emotion === "tenderness"
              ? 0.3
              : isSpeaking
                ? 0.15 + audioLevel * 0.1
                : 0.1,
          }}
          transition={{ duration: 0.3 }}
        />
        <motion.ellipse
          cx="142"
          cy="108"
          rx="14"
          ry="10"
          fill={colors.cheek}
          animate={{
            opacity: emotion === "joy" || emotion === "warmth" || emotion === "tenderness"
              ? 0.3
              : isSpeaking
                ? 0.15 + audioLevel * 0.1
                : 0.1,
          }}
          transition={{ duration: 0.3 }}
        />
      </motion.svg>

      {/* Listening rings */}
      <AnimatePresence>
        {isListening && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-full border"
                style={{ borderColor: HER_COLORS.coral }}
                initial={{ opacity: 0, scale: 1 }}
                animate={{
                  opacity: [0.4, 0],
                  scale: [1, 1.3 + i * 0.15],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.5,
                  ease: "easeOut",
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Speaking audio ring */}
      <AnimatePresence>
        {isSpeaking && audioLevel > 0.1 && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: `0 0 ${20 + audioLevel * 40}px ${HER_COLORS.coral}40`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 + audioLevel * 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.05 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

// Main optimized avatar component
export function OptimizedAvatar({
  visemeWeights,
  emotion,
  isSpeaking,
  isListening,
  audioLevel,
  animationSettings,
  className = "",
  onTouch,
  onLatencyMeasured,
  enableTouchFeedback = false,
}: OptimizedAvatarProps) {
  // Touch response optimization (Sprint 521)
  const { state: touchState, controls: touchControls, metrics: touchMetrics } = useTouchResponseOptimizer(
    {
      targetResponseMs: animationSettings.targetFPS <= 30 ? 33 : 16,
      enablePrediction: animationSettings.avatarQuality !== "low",
    },
    {
      onTouchStart: (touches) => {
        if (onTouch && touches.length > 0) {
          onTouch({ x: touches[0].x, y: touches[0].y });
        }
      },
      onSlowResponse: (responseMs) => {
        if (onLatencyMeasured) {
          onLatencyMeasured(responseMs);
        }
      },
    }
  );

  // Latency mitigation for smooth animations (Sprint 521)
  const { state: mitigatorState, controls: mitigatorControls, metrics: mitigatorMetrics } = useMobileAvatarLatencyMitigator(
    {
      targetFrameTimeMs: 1000 / animationSettings.targetFPS,
      strategy: animationSettings.avatarQuality === "low" ? "conservative" : "adaptive",
      monitorFrameTiming: animationSettings.avatarQuality !== "low",
    },
    {
      onHighLatency: (latencyMs) => {
        if (onLatencyMeasured) {
          onLatencyMeasured(latencyMs);
        }
      },
    }
  );

  // Touch feedback state
  const [touchFeedback, setTouchFeedback] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });

  // Handle touch events with optimization
  const handleTouchStart = useCallback(
    (event: React.TouchEvent | React.PointerEvent) => {
      if (!enableTouchFeedback) return;

      const nativeEvent = event.nativeEvent as TouchEvent | PointerEvent;
      const feedback = touchControls.getImmediateFeedbackPosition(nativeEvent);

      if (feedback) {
        setTouchFeedback({ x: feedback.x, y: feedback.y, visible: true });
        touchControls.processTouchStart(nativeEvent);
      }
    },
    [enableTouchFeedback, touchControls]
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent | React.PointerEvent) => {
      if (!enableTouchFeedback) return;

      const nativeEvent = event.nativeEvent as TouchEvent | PointerEvent;
      touchControls.processTouchEnd(nativeEvent);
      setTouchFeedback((prev) => ({ ...prev, visible: false }));
    },
    [enableTouchFeedback, touchControls]
  );

  // Throttle audio level updates based on target FPS
  const throttledAudioLevel = useThrottledValue(audioLevel, animationSettings.targetFPS);

  // Calculate mouth shape
  const { openness: mouthOpenness, width: mouthWidth } = useMouthShape(
    visemeWeights,
    throttledAudioLevel,
    isSpeaking
  );

  // Throttle mouth values for smoother animation
  const throttledMouthOpenness = useThrottledValue(mouthOpenness, animationSettings.targetFPS);

  // Render appropriate quality level
  const renderAvatar = useCallback(() => {
    switch (animationSettings.avatarQuality) {
      case "low":
        return (
          <LowQualityAvatar
            emotion={emotion}
            isSpeaking={isSpeaking}
            isListening={isListening}
            mouthOpenness={throttledMouthOpenness}
          />
        );

      case "medium":
        return (
          <MediumQualityAvatar
            emotion={emotion}
            isSpeaking={isSpeaking}
            isListening={isListening}
            audioLevel={throttledAudioLevel}
            mouthOpenness={throttledMouthOpenness}
            enableBreathing={animationSettings.enableBreathingAnimation}
          />
        );

      case "high":
      default:
        return (
          <HighQualityAvatar
            emotion={emotion}
            isSpeaking={isSpeaking}
            isListening={isListening}
            audioLevel={throttledAudioLevel}
            mouthOpenness={throttledMouthOpenness}
            mouthWidth={mouthWidth}
          />
        );
    }
  }, [
    animationSettings.avatarQuality,
    animationSettings.enableBreathingAnimation,
    emotion,
    isSpeaking,
    isListening,
    throttledAudioLevel,
    throttledMouthOpenness,
    mouthWidth,
  ]);

  return (
    <div
      className={`relative ${className}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handleTouchStart}
      onPointerUp={handleTouchEnd}
    >
      {renderAvatar()}

      {/* Touch feedback indicator (Sprint 521) */}
      {enableTouchFeedback && touchFeedback.visible && (
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 40,
            height: 40,
            backgroundColor: HER_COLORS.coral + "40",
            left: touchFeedback.x - 20,
            top: touchFeedback.y - 20,
          }}
          initial={{ scale: 0.5, opacity: 0.8 }}
          animate={{ scale: 1.2, opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Latency warning indicator (only in development) */}
      {process.env.NODE_ENV === "development" && mitigatorMetrics.averageTouchLatencyMs > 100 && (
        <div
          className="absolute top-0 right-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: HER_COLORS.coral }}
          title={`Latency: ${mitigatorMetrics.averageTouchLatencyMs.toFixed(0)}ms`}
        />
      )}
    </div>
  );
}

export default memo(OptimizedAvatar);
