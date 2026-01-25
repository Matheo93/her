"use client";

/**
 * Avatar Pulse Ring - Sprint 574
 *
 * Animated pulse rings that emanate from the avatar during
 * various states (thinking, processing, responding).
 *
 * Creates a sense of presence and activity without being distracting.
 */

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type PulseState = "idle" | "thinking" | "processing" | "responding" | "listening";

interface AvatarPulseRingProps {
  /** Current state affecting pulse behavior */
  state?: PulseState;
  /** Size of the pulse ring area */
  size?: number;
  /** Custom color (overrides theme) */
  color?: string;
  /** Number of concurrent rings */
  ringCount?: number;
  /** Additional class names */
  className?: string;
}

/**
 * Get pulse configuration based on state
 */
function getPulseConfig(state: PulseState) {
  switch (state) {
    case "thinking":
      return {
        duration: 2.5,
        scale: 1.4,
        opacity: 0.5,
        stagger: 0.8,
      };
    case "processing":
      return {
        duration: 1.5,
        scale: 1.3,
        opacity: 0.6,
        stagger: 0.5,
      };
    case "responding":
      return {
        duration: 1.2,
        scale: 1.2,
        opacity: 0.7,
        stagger: 0.4,
      };
    case "listening":
      return {
        duration: 2.0,
        scale: 1.25,
        opacity: 0.4,
        stagger: 0.6,
      };
    case "idle":
    default:
      return {
        duration: 4.0,
        scale: 1.1,
        opacity: 0.2,
        stagger: 1.3,
      };
  }
}

export const AvatarPulseRing = memo(function AvatarPulseRing({
  state = "idle",
  size = 200,
  color,
  ringCount = 3,
  className = "",
}: AvatarPulseRingProps) {
  const { mode, colors } = useTheme();
  const config = getPulseConfig(state);

  // Use theme color if not overridden
  const ringColor = color || colors.coral;

  // Only show rings when not idle (unless explicitly idle with visible rings)
  const showRings = state !== "idle" || ringCount > 0;

  return (
    <div
      className={`absolute pointer-events-none ${className}`}
      style={{
        width: size,
        height: size,
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      }}
    >
      <AnimatePresence>
        {showRings &&
          Array.from({ length: ringCount }).map((_, index) => (
            <motion.div
              key={`pulse-ring-${index}`}
              className="absolute inset-0 rounded-full"
              style={{
                border: `1.5px solid ${ringColor}`,
              }}
              initial={{
                scale: 0.8,
                opacity: 0,
              }}
              animate={{
                scale: [0.9, config.scale],
                opacity: [config.opacity, 0],
              }}
              exit={{
                scale: 0.8,
                opacity: 0,
              }}
              transition={{
                duration: config.duration,
                repeat: Infinity,
                delay: index * config.stagger,
                ease: "easeOut",
              }}
            />
          ))}
      </AnimatePresence>

      {/* Inner glow for active states */}
      <AnimatePresence>
        {(state === "thinking" || state === "processing") && (
          <motion.div
            className="absolute rounded-full"
            style={{
              inset: size * 0.15,
              background: `radial-gradient(circle, ${ringColor}30 0%, transparent 70%)`,
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: [0.3, 0.5, 0.3],
              scale: [0.95, 1.05, 0.95],
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

export default AvatarPulseRing;
