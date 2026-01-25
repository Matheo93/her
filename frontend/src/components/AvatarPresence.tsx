"use client";

/**
 * Avatar Presence - Sprint 576
 *
 * Unified avatar component that combines all avatar features:
 * - Emotion-based glow (AvatarEmotionGlow)
 * - Pulse rings for states (AvatarPulseRing)
 * - Breathing animation (AvatarBreathingOverlay)
 *
 * This is the main avatar component for the chat interface.
 */

import React, { memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { AvatarEmotionGlow } from "./AvatarEmotionGlow";
import { AvatarPulseRing } from "./AvatarPulseRing";
import { AvatarBreathingOverlay } from "./AvatarBreathingOverlay";
import { HER_SPRINGS } from "@/styles/her-theme";

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

type AvatarState = "idle" | "listening" | "thinking" | "speaking";

interface AvatarPresenceProps {
  /** Current emotional state */
  emotion?: Emotion;
  /** Current activity state */
  state?: AvatarState;
  /** Size in pixels */
  size?: number;
  /** Emotion intensity (0-1) */
  intensity?: number;
  /** Show breathing animation */
  showBreathing?: boolean;
  /** Show pulse rings */
  showPulse?: boolean;
  /** Show emotion glow */
  showGlow?: boolean;
  /** Additional class names */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Get breathing state based on avatar state and emotion
 */
function getBreathingState(state: AvatarState, emotion: Emotion): "calm" | "active" | "excited" | "relaxed" {
  if (state === "speaking") return "active";
  if (state === "listening") return "calm";
  if (state === "thinking") return "calm";

  // Idle - based on emotion
  switch (emotion) {
    case "excitement":
    case "joy":
      return "excited";
    case "sadness":
    case "fear":
      return "relaxed";
    default:
      return "calm";
  }
}

/**
 * Get pulse state based on avatar state
 */
function getPulseState(state: AvatarState): "idle" | "thinking" | "processing" | "responding" | "listening" {
  switch (state) {
    case "speaking":
      return "responding";
    case "listening":
      return "listening";
    case "thinking":
      return "thinking";
    default:
      return "idle";
  }
}

export const AvatarPresence = memo(function AvatarPresence({
  emotion = "neutral",
  state = "idle",
  size = 120,
  intensity = 0.6,
  showBreathing = true,
  showPulse = true,
  showGlow = true,
  className = "",
  onClick,
}: AvatarPresenceProps) {
  const { mode, colors } = useTheme();
  const isDark = mode === "dark";

  // Derived states
  const breathingState = useMemo(() => getBreathingState(state, emotion), [state, emotion]);
  const pulseState = useMemo(() => getPulseState(state), [state]);

  // Avatar inner size (glow extends beyond)
  const avatarInnerSize = size * 0.7;
  const glowSize = size * 1.2;

  // Speaking animation scale
  const speakingScale = state === "speaking" ? [1, 1.03, 1] : 1;

  return (
    <motion.div
      className={`relative cursor-pointer ${className}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Layer 1: Breathing Overlay (background) */}
      {showBreathing && (
        <AvatarBreathingOverlay
          state={breathingState}
          size={glowSize}
          enabled={state !== "idle" || emotion !== "neutral"}
        />
      )}

      {/* Layer 2: Pulse Rings */}
      {showPulse && state !== "idle" && (
        <AvatarPulseRing
          state={pulseState}
          size={glowSize}
          ringCount={state === "speaking" ? 2 : 3}
        />
      )}

      {/* Layer 3: Emotion Glow */}
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
            emotion={emotion}
            intensity={intensity}
            size={glowSize}
            speaking={state === "speaking"}
            listening={state === "listening"}
          />
        </div>
      )}

      {/* Layer 4: Avatar Core (the visible orb) */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: avatarInnerSize,
          height: avatarInnerSize,
          left: (size - avatarInnerSize) / 2,
          top: (size - avatarInnerSize) / 2,
          background: `radial-gradient(circle at 40% 35%, ${colors.warmWhite} 0%, ${colors.cream} 40%, ${colors.coral}40 100%)`,
          boxShadow: `
            0 0 40px ${colors.coral}30,
            inset 0 -10px 30px ${colors.coral}20
          `,
        }}
        animate={{
          scale: speakingScale,
        }}
        transition={
          state === "speaking"
            ? { duration: 0.4, repeat: Infinity, ease: "easeInOut" }
            : HER_SPRINGS.gentle
        }
      >
        {/* Highlight spot */}
        <div
          className="absolute rounded-full"
          style={{
            width: avatarInnerSize * 0.15,
            height: avatarInnerSize * 0.15,
            left: avatarInnerSize * 0.25,
            top: avatarInnerSize * 0.2,
            backgroundColor: colors.warmWhite,
            opacity: 0.6,
            filter: "blur(3px)",
          }}
        />

        {/* Secondary highlight */}
        <div
          className="absolute rounded-full"
          style={{
            width: avatarInnerSize * 0.08,
            height: avatarInnerSize * 0.08,
            left: avatarInnerSize * 0.35,
            top: avatarInnerSize * 0.32,
            backgroundColor: colors.warmWhite,
            opacity: 0.4,
            filter: "blur(2px)",
          }}
        />
      </motion.div>

      {/* Layer 5: State Indicator */}
      <AnimatePresence>
        {(state === "listening" || state === "thinking") && (
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 8,
              height: 8,
              left: size / 2 - 4,
              bottom: size * 0.15,
              backgroundColor: state === "listening" ? colors.success : colors.coral,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.8, 1, 0.8],
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </AnimatePresence>

      {/* Speaking audio bars */}
      <AnimatePresence>
        {state === "speaking" && (
          <motion.div
            className="absolute flex items-end justify-center gap-0.5"
            style={{
              width: 24,
              height: 12,
              left: size / 2 - 12,
              bottom: size * 0.1,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="rounded-full"
                style={{
                  width: 3,
                  backgroundColor: colors.coral,
                }}
                animate={{
                  height: [4, 10, 6, 12, 4],
                }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default AvatarPresence;
