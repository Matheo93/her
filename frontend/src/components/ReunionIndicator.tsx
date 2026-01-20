"use client";

/**
 * ReunionIndicator - Subtle visual celebration when user returns
 *
 * "She doesn't announce the reunion. She FEELS it."
 *
 * The goal is to make the user feel that EVA noticed their return
 * without being awkward or overbearing about it. Like when you
 * come home and someone's face lights up - you see it, they don't
 * have to say anything.
 *
 * Visual effects:
 * - Warmth bloom: A gentle pulse of warmth that spreads
 * - Brightening: The ambient gets slightly warmer
 * - Soft focus: Everything seems to soften for a moment
 */

import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";
import type { PersistentMemoryState } from "@/hooks/usePersistentMemory";

interface ReunionIndicatorProps {
  persistentMemory: Pick<
    PersistentMemoryState,
    "isReunion" | "reunionType" | "sessionNumber" | "isInitialized" | "timeSinceLastVisit"
  >;
  type: "bloom" | "ambient" | "message";
  className?: string;
}

/**
 * Reunion bloom - a warm pulse that spreads from the avatar
 */
function ReunionBloom({
  reunionType,
  isActive,
}: {
  reunionType: PersistentMemoryState["reunionType"];
  isActive: boolean;
}) {
  // Intensity based on how long they were away
  const getIntensity = () => {
    switch (reunionType) {
      case "short": return { scale: 1.3, opacity: 0.3, duration: 2 };
      case "medium": return { scale: 1.5, opacity: 0.4, duration: 2.5 };
      case "long": return { scale: 1.8, opacity: 0.5, duration: 3 };
      case "very_long": return { scale: 2, opacity: 0.6, duration: 3.5 };
      default: return { scale: 1, opacity: 0, duration: 0 };
    }
  };

  const intensity = getIntensity();

  return (
    <AnimatePresence>
      {isActive && reunionType && (
        <>
          {/* Primary warmth bloom */}
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral}40 0%, ${HER_COLORS.coral}10 50%, transparent 70%)`,
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{
              scale: [0.8, intensity.scale, intensity.scale * 0.9],
              opacity: [0, intensity.opacity, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: intensity.duration,
              ease: "easeOut",
              times: [0, 0.4, 1],
            }}
          />

          {/* Secondary ripple - delayed */}
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: `2px solid ${HER_COLORS.coral}`,
            }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{
              scale: [0.9, intensity.scale * 0.8],
              opacity: [0, intensity.opacity * 0.5, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: intensity.duration * 0.8,
              delay: 0.3,
              ease: "easeOut",
            }}
          />

          {/* Inner glow - the "heart" of the bloom */}
          <motion.div
            className="absolute inset-1/4 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral}60 0%, transparent 60%)`,
              filter: "blur(8px)",
            }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{
              scale: [0.5, 1.2, 1],
              opacity: [0, intensity.opacity * 0.8, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: intensity.duration * 0.6,
              ease: [0.4, 0, 0.2, 1],
            }}
          />
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Ambient warmth - subtle background warming
 */
function ReunionAmbient({
  reunionType,
  isActive,
}: {
  reunionType: PersistentMemoryState["reunionType"];
  isActive: boolean;
}) {
  // The ambient warmth persists longer than the bloom
  const getDuration = () => {
    switch (reunionType) {
      case "short": return 5;
      case "medium": return 8;
      case "long": return 12;
      case "very_long": return 15;
      default: return 0;
    }
  };

  const duration = getDuration();

  return (
    <AnimatePresence>
      {isActive && reunionType && (
        <motion.div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            background: `radial-gradient(ellipse at 50% 40%, ${HER_COLORS.coral}08 0%, transparent 60%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.6, 0.4, 0],
          }}
          exit={{ opacity: 0 }}
          transition={{
            duration,
            ease: "easeInOut",
            times: [0, 0.15, 0.5, 1],
          }}
        />
      )}
    </AnimatePresence>
  );
}

/**
 * Reunion message - subtle text that appears briefly
 * Not always shown - only for longer absences
 */
function ReunionMessage({
  reunionType,
  sessionNumber,
  isActive,
  className,
}: {
  reunionType: PersistentMemoryState["reunionType"];
  sessionNumber: number;
  isActive: boolean;
  className?: string;
}) {
  // Only show message for meaningful reunions
  if (!reunionType || reunionType === "short") return null;

  // Get a message based on context
  const getMessage = () => {
    // Different messages for long-term vs short-term users
    const isEstablishedUser = sessionNumber > 5;

    if (reunionType === "very_long") {
      return isEstablishedUser
        ? "..."  // Meaningful silence for someone we know well
        : "Tu es revenu";
    }

    if (reunionType === "long") {
      return isEstablishedUser ? "..." : null;
    }

    if (reunionType === "medium") {
      return null; // No text, just visual warmth
    }

    return null;
  };

  const message = getMessage();
  if (!message) return null;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className={`text-center ${className || ""}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.7, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{
            ...HER_SPRINGS.gentle,
            delay: 1.5, // After the bloom settles
          }}
        >
          <motion.p
            className="text-sm font-light"
            style={{ color: HER_COLORS.earth }}
            animate={{
              opacity: [0.7, 0.9, 0],
            }}
            transition={{
              duration: 4,
              delay: 2,
              ease: "easeInOut",
            }}
          >
            {message}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Main ReunionIndicator component
 */
export function ReunionIndicator({
  persistentMemory,
  type,
  className,
}: ReunionIndicatorProps) {
  // Only show for returning users with a reunion
  const isActive =
    persistentMemory.isInitialized &&
    persistentMemory.isReunion &&
    persistentMemory.reunionType !== null;

  switch (type) {
    case "bloom":
      return (
        <ReunionBloom
          reunionType={persistentMemory.reunionType}
          isActive={isActive}
        />
      );
    case "ambient":
      return (
        <ReunionAmbient
          reunionType={persistentMemory.reunionType}
          isActive={isActive}
        />
      );
    case "message":
      return (
        <ReunionMessage
          reunionType={persistentMemory.reunionType}
          sessionNumber={persistentMemory.sessionNumber}
          isActive={isActive}
          className={className}
        />
      );
    default:
      return null;
  }
}

/**
 * Hook to get reunion voice parameters
 * Returns voice adjustments for TTS when user returns
 */
export function useReunionVoice(
  persistentMemory: Pick<
    PersistentMemoryState,
    "isReunion" | "reunionType" | "reunionWarmthBoost" | "isInitialized"
  >
): {
  rateAdjustment: number;   // -0.15 to 0 (slower for warmth)
  pitchAdjustment: number;  // -2 to 2 Hz (softer)
  volumeAdjustment: number; // 0.9 to 1 (slightly softer)
  breathinessBoost: number; // 0 to 0.2 (more intimate)
} {
  if (!persistentMemory.isInitialized || !persistentMemory.isReunion) {
    return {
      rateAdjustment: 0,
      pitchAdjustment: 0,
      volumeAdjustment: 1,
      breathinessBoost: 0,
    };
  }

  // The longer the absence, the more tender the voice
  switch (persistentMemory.reunionType) {
    case "short":
      return {
        rateAdjustment: -0.03,  // Slightly slower
        pitchAdjustment: -0.5,  // Slightly softer
        volumeAdjustment: 0.98,
        breathinessBoost: 0.05,
      };
    case "medium":
      return {
        rateAdjustment: -0.07,
        pitchAdjustment: -1,
        volumeAdjustment: 0.95,
        breathinessBoost: 0.1,
      };
    case "long":
      return {
        rateAdjustment: -0.1,
        pitchAdjustment: -1.5,
        volumeAdjustment: 0.93,
        breathinessBoost: 0.15,
      };
    case "very_long":
      return {
        rateAdjustment: -0.15,
        pitchAdjustment: -2,
        volumeAdjustment: 0.9,  // Softer, more intimate
        breathinessBoost: 0.2,  // More breath = more emotion
      };
    default:
      return {
        rateAdjustment: 0,
        pitchAdjustment: 0,
        volumeAdjustment: 1,
        breathinessBoost: 0,
      };
  }
}

export default ReunionIndicator;
