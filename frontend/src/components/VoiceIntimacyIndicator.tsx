"use client";

/**
 * VoiceIntimacyIndicator - Visual Feedback for Voice Proximity
 *
 * Shows the level of vocal intimacy through subtle visual cues.
 * Like how a room feels different when someone speaks softly.
 *
 * These indicators are FELT, not seen. They're ambient adjustments
 * that create the feeling of closeness without being explicit.
 */

import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";
import { type VoiceIntimacyState, type IntimacyLevel } from "@/hooks/useVoiceIntimacy";

interface VoiceIntimacyIndicatorProps {
  // Intimacy state from the hook
  intimacy: VoiceIntimacyState;

  // Type of indicator
  type?: "ambient" | "glow" | "proximity";

  className?: string;
}

export function VoiceIntimacyIndicator({
  intimacy,
  type = "ambient",
  className = "",
}: VoiceIntimacyIndicatorProps) {
  // Don't show for normal level
  if (intimacy.level === "normal" && intimacy.levelNumeric < 0.15) {
    return null;
  }

  if (type === "ambient") {
    return <AmbientIntimacy intimacy={intimacy} className={className} />;
  }

  if (type === "glow") {
    return <IntimacyGlow intimacy={intimacy} className={className} />;
  }

  return <ProximityIndicator intimacy={intimacy} className={className} />;
}

// Ambient dimming and warmth for intimate moments
function AmbientIntimacy({
  intimacy,
  className,
}: {
  intimacy: VoiceIntimacyState;
  className: string;
}) {
  const { visualHints, levelNumeric } = intimacy;

  return (
    <AnimatePresence>
      {levelNumeric > 0.2 && (
        <motion.div
          className={`fixed inset-0 pointer-events-none z-0 ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
        >
          {/* Warm vignette - darker edges for intimacy */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at 50% 45%, transparent 30%, ${HER_COLORS.softShadow}${Math.round(visualHints.ambientDim * 40).toString(16).padStart(2, '0')} 100%)`,
            }}
            animate={{
              opacity: visualHints.ambientDim * 2,
            }}
            transition={{ duration: 2 }}
          />

          {/* Warm color overlay for intimate feeling */}
          {levelNumeric > 0.4 && (
            <motion.div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at 50% 40%, ${HER_COLORS.coral}08 0%, transparent 60%)`,
              }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: (levelNumeric - 0.4) * 0.5,
              }}
              transition={{ duration: 1.5 }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Warm glow around avatar that intensifies with intimacy
function IntimacyGlow({
  intimacy,
  className,
}: {
  intimacy: VoiceIntimacyState;
  className: string;
}) {
  const { visualHints, levelNumeric, level } = intimacy;

  // Color shifts warmer with intimacy
  const glowColor =
    level === "whisper"
      ? HER_COLORS.blush
      : level === "intimate"
        ? `${HER_COLORS.coral}90`
        : HER_COLORS.coral;

  return (
    <AnimatePresence>
      {levelNumeric > 0.15 && (
        <motion.div
          className={`absolute inset-0 pointer-events-none rounded-full ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Inner warm glow */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: `inset 0 0 ${20 + levelNumeric * 30}px ${glowColor}${Math.round(visualHints.glowWarmth * 50).toString(16).padStart(2, '0')}`,
            }}
            animate={{
              opacity: [0.6, 0.8, 0.6],
            }}
            transition={{
              duration: 4 - levelNumeric * 1.5, // Slower breathing with intimacy
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Outer soft glow */}
          <motion.div
            className="absolute -inset-4 rounded-full"
            style={{
              background: `radial-gradient(circle, ${glowColor}${Math.round(levelNumeric * 25).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
            }}
            animate={{
              scale: [1, 1.02, 1],
              opacity: [visualHints.glowWarmth * 0.7, visualHints.glowWarmth, visualHints.glowWarmth * 0.7],
            }}
            transition={{
              duration: 5 - levelNumeric * 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Whisper mode - extra soft inner light */}
          {level === "whisper" && (
            <motion.div
              className="absolute inset-6 rounded-full"
              style={{
                background: `radial-gradient(circle, ${HER_COLORS.cream}30 0%, transparent 70%)`,
              }}
              animate={{
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Subtle proximity indicator
function ProximityIndicator({
  intimacy,
  className,
}: {
  intimacy: VoiceIntimacyState;
  className: string;
}) {
  const { visualHints, level, description } = intimacy;

  // Only show for close+ levels
  if (intimacy.levelNumeric < 0.4) return null;

  return (
    <motion.div
      className={`flex flex-col items-center gap-1 ${className}`}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      transition={HER_SPRINGS.gentle}
    >
      {/* Proximity dots - closer = more lit */}
      <div className="flex gap-1">
        {[0.3, 0.5, 0.7, 0.9].map((threshold, i) => (
          <motion.div
            key={i}
            className="w-1 h-1 rounded-full"
            style={{
              backgroundColor: intimacy.levelNumeric >= threshold ? HER_COLORS.coral : HER_COLORS.softShadow,
            }}
            animate={{
              opacity: intimacy.levelNumeric >= threshold ? [0.6, 1, 0.6] : 0.3,
              scale: intimacy.levelNumeric >= threshold ? [1, 1.2, 1] : 1,
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Very subtle description - only at high intimacy */}
      {level === "intimate" || level === "whisper" ? (
        <motion.span
          className="text-xs mt-1"
          style={{ color: HER_COLORS.softShadow, opacity: 0.3 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
        >
          {level === "whisper" ? "..." : "~"}
        </motion.span>
      ) : null}
    </motion.div>
  );
}

/**
 * IntimacyBackdrop - Full-screen ambient backdrop for intimate moments
 *
 * Creates a subtle dimming and warmth that makes the space feel more private.
 */
interface IntimacyBackdropProps {
  intimacy: VoiceIntimacyState;
  children: React.ReactNode;
}

export function IntimacyBackdrop({ intimacy, children }: IntimacyBackdropProps) {
  const { visualHints, levelNumeric } = intimacy;

  return (
    <div className="relative">
      {/* Backdrop layer */}
      <AnimatePresence>
        {levelNumeric > 0.3 && (
          <motion.div
            className="fixed inset-0 pointer-events-none"
            style={{
              backgroundColor: `${HER_COLORS.earth}`,
              mixBlendMode: "multiply",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: visualHints.ambientDim * 0.15 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
          />
        )}
      </AnimatePresence>

      {/* Content */}
      {children}
    </div>
  );
}

/**
 * WhisperModeIndicator - Special indicator when in whisper mode
 */
interface WhisperModeIndicatorProps {
  isActive: boolean;
  className?: string;
}

export function WhisperModeIndicator({ isActive, className = "" }: WhisperModeIndicatorProps) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className={`absolute inset-0 pointer-events-none ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* Soft particles that float gently */}
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full"
              style={{
                backgroundColor: HER_COLORS.blush,
                left: `${20 + i * 15}%`,
                top: `${30 + (i % 3) * 20}%`,
              }}
              animate={{
                y: [0, -20, 0],
                opacity: [0, 0.4, 0],
                scale: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 4 + i * 0.5,
                repeat: Infinity,
                delay: i * 0.8,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
