"use client";

/**
 * MutualAttentionGlow - The feeling of being seen
 *
 * A subtle visual indicator that EVA is "aware" of your attention.
 * When you look at her, she glows slightly warmer - acknowledging
 * your presence without breaking the fourth wall.
 *
 * This creates the "she sees me" feeling from the film HER.
 * The more sustained the eye contact, the deeper the glow.
 *
 * Based on Lepro Ami's research on creating "in the room" presence.
 */

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";

interface MutualAttentionGlowProps {
  // Is mutual eye contact active?
  isEyeContactActive: boolean;

  // How long has eye contact been held (seconds)?
  contactDuration: number;

  // Intimacy level from eye contact (0-1)
  intimacyLevel: number;

  // Current emotion (affects glow color warmth)
  emotion?: string;

  // Size of the glow area
  className?: string;
}

// Emotion to glow warmth mapping
const EMOTION_GLOW = {
  neutral: { color: HER_COLORS.coral, intensity: 1.0 },
  joy: { color: "#EDA08A", intensity: 1.3 }, // Brighter coral
  tenderness: { color: "#E8A090", intensity: 1.4 }, // Softest, warmest
  excitement: { color: "#E87860", intensity: 1.2 }, // More vibrant
  sadness: { color: HER_COLORS.earth, intensity: 0.8 }, // Subdued
  empathy: { color: "#E89A85", intensity: 1.2 }, // Warm, connecting
  curiosity: { color: HER_COLORS.coral, intensity: 1.1 },
  listening: { color: "#E8907A", intensity: 1.15 }, // Attentive warmth
  thinking: { color: HER_COLORS.softShadow, intensity: 0.7 }, // Inward focus
  playful: { color: "#EE8575", intensity: 1.25 },
} as const;

export function MutualAttentionGlow({
  isEyeContactActive,
  contactDuration,
  intimacyLevel,
  emotion = "neutral",
  className = "",
}: MutualAttentionGlowProps) {
  // Glow intensity builds over time with eye contact
  const [glowIntensity, setGlowIntensity] = useState(0);

  // Pulse phase for subtle animation
  const [pulsePhase, setPulsePhase] = useState(0);

  // Connection moments - special glow flare at intimacy milestones
  const [connectionFlare, setConnectionFlare] = useState(false);
  const lastIntimacyMilestone = useRef(0);

  // Get emotion glow settings
  const emotionGlow = EMOTION_GLOW[emotion as keyof typeof EMOTION_GLOW] || EMOTION_GLOW.neutral;

  // Update glow intensity based on eye contact
  useEffect(() => {
    let frame: number;

    const animate = () => {
      if (isEyeContactActive) {
        // Glow builds up gradually with eye contact
        // Faster at first, then plateaus
        const targetIntensity = Math.min(1, 0.3 + intimacyLevel * 0.5 + contactDuration / 20);
        setGlowIntensity((prev) => prev + (targetIntensity - prev) * 0.05);
      } else {
        // Glow fades when eye contact breaks
        // But doesn't go to zero - residual warmth
        const residualWarmth = intimacyLevel * 0.2;
        setGlowIntensity((prev) => Math.max(residualWarmth, prev - 0.02));
      }

      // Subtle pulse animation (synced with "breathing")
      setPulsePhase((prev) => (prev + 0.02) % (Math.PI * 2));

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isEyeContactActive, contactDuration, intimacyLevel]);

  // Trigger connection flare at intimacy milestones
  useEffect(() => {
    const milestones = [0.25, 0.5, 0.75, 1.0];
    const currentMilestone = milestones.find(
      (m) => intimacyLevel >= m && lastIntimacyMilestone.current < m
    );

    if (currentMilestone) {
      lastIntimacyMilestone.current = currentMilestone;
      setConnectionFlare(true);
      setTimeout(() => setConnectionFlare(false), 600);
    }

    // Reset milestones when intimacy drops significantly
    if (intimacyLevel < lastIntimacyMilestone.current - 0.2) {
      lastIntimacyMilestone.current = Math.floor(intimacyLevel * 4) / 4;
    }
  }, [intimacyLevel]);

  // Calculate visual properties
  const pulseOffset = Math.sin(pulsePhase) * 0.1;
  const finalIntensity = glowIntensity * emotionGlow.intensity * (1 + pulseOffset);
  const glowSize = 40 + intimacyLevel * 30; // Grows with intimacy
  const glowBlur = 20 + intimacyLevel * 15;

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {/* Base ambient glow - always present when connected */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(
            circle at 50% 50%,
            ${emotionGlow.color}${Math.round(finalIntensity * 40).toString(16).padStart(2, "0")} 0%,
            ${emotionGlow.color}${Math.round(finalIntensity * 20).toString(16).padStart(2, "0")} ${glowSize}%,
            transparent ${glowSize + 30}%
          )`,
          filter: `blur(${glowBlur}px)`,
        }}
        animate={{
          opacity: Math.max(0.1, finalIntensity),
        }}
        transition={{ duration: 0.5 }}
      />

      {/* Eye contact active indicator - subtle ring */}
      <AnimatePresence>
        {isEyeContactActive && glowIntensity > 0.2 && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              border: `1px solid ${emotionGlow.color}`,
              opacity: glowIntensity * 0.4,
            }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{
              scale: 1 + pulseOffset * 0.05,
              opacity: glowIntensity * 0.4,
            }}
            exit={{ scale: 1.1, opacity: 0 }}
            transition={HER_SPRINGS.breathing}
          />
        )}
      </AnimatePresence>

      {/* Connection flare - brief glow when intimacy milestone reached */}
      <AnimatePresence>
        {connectionFlare && (
          <motion.div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(
                circle at 50% 50%,
                ${emotionGlow.color}60 0%,
                ${emotionGlow.color}30 30%,
                transparent 60%
              )`,
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 0.6 }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Deep intimacy indicator - appears at high intimacy */}
      <AnimatePresence>
        {intimacyLevel > 0.6 && isEyeContactActive && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Soft inner glow - "her eyes are glowing" */}
            <motion.div
              className="absolute"
              style={{
                width: "30%",
                height: "30%",
                top: "35%",
                left: "35%",
                background: `radial-gradient(
                  circle,
                  ${emotionGlow.color}40 0%,
                  transparent 70%
                )`,
                borderRadius: "50%",
              }}
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.4, 0.6, 0.4],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Simplified version for use with existing avatar
 * Just the glow effect, no positioning
 */
export function useAttentionGlow(
  isEyeContactActive: boolean,
  intimacyLevel: number,
  emotion: string = "neutral"
): {
  glowColor: string;
  glowOpacity: number;
  glowScale: number;
} {
  const [glowOpacity, setGlowOpacity] = useState(0);

  useEffect(() => {
    if (isEyeContactActive) {
      setGlowOpacity((prev) => Math.min(0.6, prev + 0.05));
    } else {
      setGlowOpacity((prev) => Math.max(intimacyLevel * 0.2, prev - 0.03));
    }
  }, [isEyeContactActive, intimacyLevel]);

  const emotionGlow = EMOTION_GLOW[emotion as keyof typeof EMOTION_GLOW] || EMOTION_GLOW.neutral;

  return {
    glowColor: emotionGlow.color,
    glowOpacity: glowOpacity * emotionGlow.intensity,
    glowScale: 1 + intimacyLevel * 0.1,
  };
}
