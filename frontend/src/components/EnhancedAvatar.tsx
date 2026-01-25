"use client";

/**
 * Enhanced Avatar - Sprint 574
 *
 * Combines OptimizedAvatar with AvatarEmotionGlow for a complete
 * emotionally-responsive avatar experience.
 *
 * Features:
 * - Emotional glow aura that responds to mood
 * - Spring-based emotion transitions
 * - Speaking/listening visual feedback
 * - Dark mode support via ThemeContext
 */

import React, { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { OptimizedAvatar, type VisemeWeights } from "./OptimizedAvatar";
import { AvatarEmotionGlow } from "./AvatarEmotionGlow";
import { useAvatarEmotionAnimation } from "@/hooks/useAvatarEmotionAnimation";
import { useTheme } from "@/context/ThemeContext";
import type { AnimationSettings } from "@/hooks/useMobileOptimization";

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

interface EnhancedAvatarProps {
  /** Current emotion state */
  emotion?: Emotion;
  /** Emotion intensity (0-1) */
  emotionIntensity?: number;
  /** Viseme weights for lip sync */
  visemeWeights?: VisemeWeights;
  /** Is the avatar speaking */
  isSpeaking?: boolean;
  /** Is the avatar listening */
  isListening?: boolean;
  /** Audio level for speaking animation */
  audioLevel?: number;
  /** Animation settings for optimization */
  animationSettings?: AnimationSettings;
  /** Size in pixels */
  size?: number;
  /** Additional class names */
  className?: string;
  /** Enable touch feedback */
  enableTouchFeedback?: boolean;
  /** Callback when touched */
  onTouch?: (position: { x: number; y: number }) => void;
  /** Callback for latency measurement */
  onLatencyMeasured?: (latencyMs: number) => void;
}

/**
 * Default animation settings for low-end devices
 */
const DEFAULT_ANIMATION_SETTINGS: AnimationSettings = {
  targetFPS: 30,
  particleCount: 0,
  enableParticles: false,
  enableGlowEffects: true,
  enableBreathingAnimation: true,
  enableIdleAnimations: true,
  enableBlurEffects: false,
  avatarQuality: "medium",
  transitionDuration: 300,
  springStiffness: 100,
  springDamping: 20,
};

/**
 * Enhanced Avatar with emotional glow and smooth transitions
 */
export const EnhancedAvatar = memo(function EnhancedAvatar({
  emotion = "neutral",
  emotionIntensity = 0.6,
  visemeWeights = {},
  isSpeaking = false,
  isListening = false,
  audioLevel = 0,
  animationSettings = DEFAULT_ANIMATION_SETTINGS,
  size = 200,
  className = "",
  enableTouchFeedback = false,
  onTouch,
  onLatencyMeasured,
}: EnhancedAvatarProps) {
  const { mode } = useTheme();
  const isDark = mode === "dark";

  // Use emotion animation hook for smooth transitions
  const {
    state: emotionState,
    values: emotionValues,
    setEmotion,
    triggerMicroExpression,
  } = useAvatarEmotionAnimation({
    initialEmotion: emotion,
    transitionDuration: 400,
    enableMicroExpressions: animationSettings.avatarQuality !== "low",
  });

  // Sync emotion prop with animation state
  React.useEffect(() => {
    if (emotion !== emotionState.current) {
      setEmotion(emotion, emotionIntensity);
    }
  }, [emotion, emotionIntensity, emotionState.current, setEmotion]);

  // Trigger blink on speaking start
  React.useEffect(() => {
    if (isSpeaking) {
      triggerMicroExpression("blink");
    }
  }, [isSpeaking, triggerMicroExpression]);

  // Calculate glow size based on avatar size
  const glowSize = useMemo(() => size * 1.5, [size]);

  // Determine if glow should be shown based on settings
  const showGlow = animationSettings.enableGlowEffects !== false;

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Emotion Glow Layer (behind avatar) */}
      {showGlow && (
        <div
          className="absolute"
          style={{
            width: glowSize,
            height: glowSize,
            left: (size - glowSize) / 2,
            top: (size - glowSize) / 2,
          }}
        >
          <AvatarEmotionGlow
            emotion={emotionState.current as Emotion}
            intensity={emotionIntensity}
            size={glowSize}
            speaking={isSpeaking}
            listening={isListening}
          />
        </div>
      )}

      {/* Avatar Layer */}
      <motion.div
        className="relative z-10"
        style={{ width: size * 0.8, height: size * 0.8 }}
        animate={{
          scale: isSpeaking ? [1, 1.02, 1] : 1,
        }}
        transition={{
          duration: 0.3,
          repeat: isSpeaking ? Infinity : 0,
          ease: "easeInOut",
        }}
      >
        <OptimizedAvatar
          visemeWeights={visemeWeights}
          emotion={emotionState.current}
          isSpeaking={isSpeaking}
          isListening={isListening}
          audioLevel={audioLevel}
          animationSettings={animationSettings}
          className="w-full h-full"
          enableTouchFeedback={enableTouchFeedback}
          onTouch={onTouch}
          onLatencyMeasured={onLatencyMeasured}
        />
      </motion.div>

      {/* Interaction hint overlay (when listening) */}
      {isListening && animationSettings.avatarQuality !== "low" && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-3 h-3 rounded-full"
            style={{
              backgroundColor: isDark ? "#F0A08A" : "#E8846B",
            }}
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.8, 0.4, 0.8],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.div>
      )}
    </div>
  );
});

export default EnhancedAvatar;
