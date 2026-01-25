"use client";

/**
 * Avatar Component - Sprint 592
 *
 * Core avatar display with:
 * - Emotion-based expressions
 * - State animations (idle, listening, speaking)
 * - Glow and breathing effects
 * - HER-themed styling
 */

import React, { memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type AvatarState = "idle" | "listening" | "thinking" | "speaking";
type AvatarEmotion =
  | "neutral"
  | "joy"
  | "sadness"
  | "tenderness"
  | "excitement"
  | "curiosity"
  | "playful"
  | "love";

interface AvatarProps {
  /** Current avatar state */
  state?: AvatarState;
  /** Current emotion */
  emotion?: AvatarEmotion;
  /** Emotion intensity (0-1) */
  intensity?: number;
  /** Avatar size in pixels */
  size?: number;
  /** Image source URL */
  src?: string;
  /** Show breathing animation */
  showBreathing?: boolean;
  /** Show glow effect */
  showGlow?: boolean;
  /** Show pulse ring */
  showPulse?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Emotion color mapping
 */
const EMOTION_COLORS: Record<AvatarEmotion, string> = {
  neutral: "#d4886a",
  joy: "#f0c040",
  sadness: "#6a9cd4",
  tenderness: "#d4a6d4",
  excitement: "#ff6b6b",
  curiosity: "#4ecdc4",
  playful: "#ff9f43",
  love: "#ff6b9d",
};

/**
 * State animation configs
 */
const STATE_CONFIGS: Record<AvatarState, {
  glowIntensity: number;
  pulseSpeed: number;
  breathSpeed: number;
}> = {
  idle: { glowIntensity: 0.3, pulseSpeed: 4, breathSpeed: 4 },
  listening: { glowIntensity: 0.6, pulseSpeed: 2, breathSpeed: 3 },
  thinking: { glowIntensity: 0.5, pulseSpeed: 1.5, breathSpeed: 2 },
  speaking: { glowIntensity: 0.8, pulseSpeed: 1, breathSpeed: 1.5 },
};

/**
 * Breathing overlay animation
 */
const BreathingOverlay = memo(function BreathingOverlay({
  size,
  speed,
  color,
}: {
  size: number;
  speed: number;
  color: string;
}) {
  return (
    <motion.div
      className="absolute inset-0 rounded-full"
      style={{
        background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
      }}
      animate={{
        scale: [1, 1.02, 1],
        opacity: [0.3, 0.5, 0.3],
      }}
      transition={{
        duration: speed,
        repeat: Infinity,
        ease: "easeInOut" as const,
      }}
    />
  );
});

/**
 * Pulse ring animation
 */
const PulseRing = memo(function PulseRing({
  size,
  speed,
  color,
}: {
  size: number;
  speed: number;
  color: string;
}) {
  return (
    <>
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full"
          style={{
            border: `2px solid ${color}`,
          }}
          animate={{
            scale: [1, 1.3, 1.5],
            opacity: [0.6, 0.2, 0],
          }}
          transition={{
            duration: speed,
            repeat: Infinity,
            delay: i * (speed / 2),
            ease: "easeOut" as const,
          }}
        />
      ))}
    </>
  );
});

/**
 * Glow effect
 */
const GlowEffect = memo(function GlowEffect({
  color,
  intensity,
}: {
  color: string;
  intensity: number;
}) {
  return (
    <motion.div
      className="absolute inset-0 rounded-full"
      style={{
        boxShadow: `0 0 ${30 * intensity}px ${10 * intensity}px ${color}40`,
      }}
      animate={{
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut" as const,
      }}
    />
  );
});

/**
 * Default avatar placeholder
 */
const DefaultAvatar = memo(function DefaultAvatar({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  return (
    <svg
      width={size * 0.6}
      height={size * 0.6}
      viewBox="0 0 100 100"
      fill="none"
    >
      {/* Face circle */}
      <circle cx="50" cy="50" r="40" fill={color} opacity="0.2" />

      {/* Eyes */}
      <ellipse cx="35" cy="45" rx="5" ry="6" fill={color} opacity="0.6" />
      <ellipse cx="65" cy="45" rx="5" ry="6" fill={color} opacity="0.6" />

      {/* Smile */}
      <path
        d="M 35 60 Q 50 75 65 60"
        stroke={color}
        strokeWidth="3"
        fill="none"
        opacity="0.6"
        strokeLinecap="round"
      />
    </svg>
  );
});

/**
 * Speaking indicator
 */
const SpeakingIndicator = memo(function SpeakingIndicator({
  color,
}: {
  color: string;
}) {
  return (
    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: 4,
            height: 4,
            backgroundColor: color,
          }}
          animate={{
            y: [0, -4, 0],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut" as const,
          }}
        />
      ))}
    </div>
  );
});

/**
 * Listening indicator
 */
const ListeningIndicator = memo(function ListeningIndicator({
  color,
}: {
  color: string;
}) {
  return (
    <motion.div
      className="absolute -bottom-1 left-1/2 -translate-x-1/2"
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: color,
      }}
      animate={{
        scale: [1, 1.4, 1],
        opacity: [0.8, 0.4, 0.8],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut" as const,
      }}
    />
  );
});

/**
 * Main Avatar Component
 */
export const Avatar = memo(function Avatar({
  state = "idle",
  emotion = "neutral",
  intensity = 0.6,
  size = 120,
  src,
  showBreathing = true,
  showGlow = true,
  showPulse = false,
  className = "",
}: AvatarProps) {
  const { colors } = useTheme();

  const emotionColor = EMOTION_COLORS[emotion] || colors.coral;
  const stateConfig = STATE_CONFIGS[state];
  const adjustedIntensity = intensity * stateConfig.glowIntensity;

  const containerStyle = useMemo(() => ({
    width: size,
    height: size,
  }), [size]);

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={containerStyle}
    >
      {/* Glow effect */}
      {showGlow && (
        <GlowEffect color={emotionColor} intensity={adjustedIntensity} />
      )}

      {/* Pulse rings */}
      <AnimatePresence>
        {showPulse && (state === "listening" || state === "speaking") && (
          <PulseRing
            size={size}
            speed={stateConfig.pulseSpeed}
            color={emotionColor}
          />
        )}
      </AnimatePresence>

      {/* Main avatar container */}
      <motion.div
        className="relative rounded-full overflow-hidden flex items-center justify-center"
        style={{
          width: size,
          height: size,
          backgroundColor: colors.cream,
          border: `3px solid ${emotionColor}40`,
        }}
        animate={{
          scale: state === "speaking" ? [1, 1.02, 1] : 1,
        }}
        transition={{
          duration: 0.5,
          repeat: state === "speaking" ? Infinity : 0,
          ease: "easeInOut" as const,
        }}
      >
        {/* Breathing overlay */}
        {showBreathing && (
          <BreathingOverlay
            size={size}
            speed={stateConfig.breathSpeed}
            color={emotionColor}
          />
        )}

        {/* Avatar image or placeholder */}
        {src ? (
          <img
            src={src}
            alt="EVA"
            className="w-full h-full object-cover"
          />
        ) : (
          <DefaultAvatar size={size} color={emotionColor} />
        )}
      </motion.div>

      {/* State indicators */}
      <AnimatePresence mode="wait">
        {state === "speaking" && (
          <motion.div
            key="speaking"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
          >
            <SpeakingIndicator color={emotionColor} />
          </motion.div>
        )}
        {state === "listening" && (
          <motion.div
            key="listening"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
          >
            <ListeningIndicator color={emotionColor} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thinking indicator */}
      <AnimatePresence>
        {state === "thinking" && (
          <motion.div
            className="absolute -top-2 -right-2"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
          >
            <motion.div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                backgroundColor: emotionColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
              }}
              animate={{
                rotate: [0, 10, -10, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut" as const,
              }}
            >
              💭
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default Avatar;
