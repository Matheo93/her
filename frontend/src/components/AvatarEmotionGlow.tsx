"use client";

/**
 * Avatar Emotion Glow - Dynamic emotional aura around avatar
 * Sprint 572 - Frontend Animation Feature
 *
 * Creates a subtle, animated glow effect that reflects EVA's emotional state.
 * Uses HER color palette for warm, intimate feeling.
 */

import React, { memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { HER_SPRINGS, EMOTION_PRESENCE, EMOTION_PRESENCE_DARK } from "@/styles/her-theme";

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

interface AvatarEmotionGlowProps {
  emotion: Emotion;
  intensity?: number; // 0-1, how strong the glow
  size?: number; // Size of the glow area in pixels
  speaking?: boolean; // Is EVA currently speaking
  listening?: boolean; // Is EVA listening to user
  className?: string;
}

/**
 * Get glow configuration based on emotion and mode
 */
function getGlowConfig(emotion: Emotion, isDark: boolean) {
  const presence = isDark ? EMOTION_PRESENCE_DARK : EMOTION_PRESENCE;
  return presence[emotion] || presence.neutral;
}

/**
 * Avatar Emotion Glow Component
 *
 * Creates layered animated glows that respond to emotional state.
 * Uses multiple layers for depth:
 * 1. Base ambient glow (always present)
 * 2. Emotion-specific glow (changes color)
 * 3. Activity pulse (speaking/listening)
 */
export const AvatarEmotionGlow = memo(function AvatarEmotionGlow({
  emotion,
  intensity = 0.5,
  size = 300,
  speaking = false,
  listening = false,
  className = "",
}: AvatarEmotionGlowProps) {
  const { mode, colors } = useTheme();
  const isDark = mode === "dark";

  const glowConfig = useMemo(
    () => getGlowConfig(emotion, isDark),
    [emotion, isDark]
  );

  // Scale intensity based on warmth factor
  const adjustedIntensity = intensity * glowConfig.warmth;

  // Animation variants for the glow
  const glowVariants = {
    idle: {
      scale: 1,
      opacity: adjustedIntensity * 0.3,
    },
    speaking: {
      scale: [1, 1.05, 1.02, 1.08, 1],
      opacity: [adjustedIntensity * 0.4, adjustedIntensity * 0.6, adjustedIntensity * 0.5],
    },
    listening: {
      scale: [1, 1.02, 1],
      opacity: adjustedIntensity * 0.5,
    },
  };

  // Pulse animation for activity indicator
  const pulseVariants = {
    inactive: { scale: 0.8, opacity: 0 },
    active: {
      scale: [1, 1.2, 1],
      opacity: [0.6, 0.3, 0.6],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut" as const,
      },
    },
  };

  const currentState = speaking ? "speaking" : listening ? "listening" : "idle";

  return (
    <div
      className={`relative pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Layer 1: Base ambient glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${colors.glowWarm} 0%, transparent 70%)`,
          filter: "blur(30px)",
        }}
        animate={{
          opacity: isDark ? 0.3 : 0.2,
        }}
        transition={HER_SPRINGS.breathing}
      />

      {/* Layer 2: Emotion-specific glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${glowConfig.glow} 0%, transparent 60%)`,
          filter: "blur(40px)",
        }}
        variants={glowVariants}
        animate={currentState}
        transition={
          speaking
            ? { duration: 0.3, repeat: Infinity, repeatType: "mirror" }
            : HER_SPRINGS.gentle
        }
      />

      {/* Layer 3: Activity pulse ring */}
      <AnimatePresence>
        {(speaking || listening) && (
          <motion.div
            className="absolute inset-4 rounded-full"
            style={{
              border: `2px solid ${colors.coral}`,
              opacity: 0.4,
            }}
            initial="inactive"
            animate="active"
            exit="inactive"
            variants={pulseVariants}
          />
        )}
      </AnimatePresence>

      {/* Layer 4: Speaking wave effect */}
      <AnimatePresence>
        {speaking && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  inset: 20 + i * 15,
                  border: `1px solid ${colors.coral}`,
                }}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{
                  scale: [0.9, 1.1, 0.9],
                  opacity: [0, 0.4 - i * 0.1, 0],
                }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{
                  duration: 1.2,
                  delay: i * 0.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Layer 5: Breathing subtle pulse (always active) */}
      <motion.div
        className="absolute inset-8 rounded-full"
        style={{
          background: `radial-gradient(circle, ${glowConfig.glow} 0%, transparent 70%)`,
          filter: "blur(25px)",
        }}
        animate={{
          scale: [1, 1.03, 1],
          opacity: [adjustedIntensity * 0.2, adjustedIntensity * 0.3, adjustedIntensity * 0.2],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
});

/**
 * Hook to get emotion-based style properties
 */
export function useEmotionGlowStyle(emotion: Emotion, isDark: boolean = false) {
  const glowConfig = getGlowConfig(emotion, isDark);

  return useMemo(
    () => ({
      boxShadow: `0 0 60px 20px ${glowConfig.glow}`,
      warmthMultiplier: glowConfig.warmth,
    }),
    [glowConfig]
  );
}

export default AvatarEmotionGlow;
