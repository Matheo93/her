"use client";

/**
 * AttunementIndicator - Visual Feedback for Emotional Attunement
 *
 * Shows the connection between user and EVA through subtle visual cues.
 * The indicator grows and glows more warmly as attunement deepens.
 *
 * This creates a sense of "we're in sync" without being technical.
 * No numbers, no percentages - just feeling through visual warmth.
 *
 * Inspired by:
 * - The warmth between Theodore and Samantha in "Her"
 * - Oxytocin-release patterns in human bonding
 * - Sesame's "voice presence" research
 */

import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";
import {
  type ProsodyMirroringState,
  mapAttunementToVisual,
} from "@/hooks/useProsodyMirroring";

interface AttunementIndicatorProps {
  // Prosody mirroring state from the hook
  prosodyState: ProsodyMirroringState;

  // Position relative to avatar
  position?: "around" | "below" | "subtle";

  // Show only when attunement is building
  showOnlyWhenActive?: boolean;

  // Optional className
  className?: string;
}

export function AttunementIndicator({
  prosodyState,
  position = "around",
  showOnlyWhenActive = true,
  className = "",
}: AttunementIndicatorProps) {
  const { attunementLevel, isAnalyzing, mirroring } = prosodyState;
  const visual = mapAttunementToVisual(attunementLevel);

  // Don't show if not analyzing and showOnlyWhenActive is true
  if (showOnlyWhenActive && !isAnalyzing && attunementLevel < 0.4) {
    return null;
  }

  if (position === "around") {
    return (
      <AttunementRing
        visual={visual}
        attunementLevel={attunementLevel}
        isAnalyzing={isAnalyzing}
        className={className}
      />
    );
  }

  if (position === "below") {
    return (
      <AttunementBar
        visual={visual}
        attunementLevel={attunementLevel}
        isAnalyzing={isAnalyzing}
        mirroring={mirroring}
        className={className}
      />
    );
  }

  // Subtle mode - just a small glow
  return (
    <AttunementGlow
      visual={visual}
      attunementLevel={attunementLevel}
      isAnalyzing={isAnalyzing}
      className={className}
    />
  );
}

// Ring around avatar that pulses with attunement
function AttunementRing({
  visual,
  attunementLevel,
  isAnalyzing,
  className,
}: {
  visual: ReturnType<typeof mapAttunementToVisual>;
  attunementLevel: number;
  isAnalyzing: boolean;
  className: string;
}) {
  return (
    <AnimatePresence>
      {isAnalyzing && attunementLevel > 0.3 && (
        <motion.div
          className={`absolute inset-0 pointer-events-none ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Outer glow ring */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: `0 0 ${30 + visual.glowIntensity * 40}px ${visual.glowColor}`,
            }}
            animate={{
              scale: [1, 1.02, 1],
              opacity: [visual.glowIntensity * 0.8, visual.glowIntensity, visual.glowIntensity * 0.8],
            }}
            transition={{
              duration: visual.pulseRate,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Inner connection ring - appears at strong attunement */}
          {visual.connectionStrength !== "weak" && (
            <motion.div
              className="absolute inset-2 rounded-full"
              style={{
                border: `1px solid ${visual.glowColor}`,
                opacity: 0,
              }}
              animate={{
                opacity: [0, 0.4, 0],
                scale: [0.95, 1.05, 0.95],
              }}
              transition={{
                duration: visual.pulseRate * 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          {/* Deep connection particles - only at high attunement */}
          {visual.connectionStrength === "deep" && (
            <>
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full"
                  style={{
                    backgroundColor: HER_COLORS.coral,
                    left: "50%",
                    top: "50%",
                  }}
                  animate={{
                    x: [0, Math.cos((i / 6) * Math.PI * 2) * 60, 0],
                    y: [0, Math.sin((i / 6) * Math.PI * 2) * 60, 0],
                    opacity: [0, 0.6, 0],
                    scale: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    delay: i * 0.5,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Horizontal bar below avatar showing attunement level
function AttunementBar({
  visual,
  attunementLevel,
  isAnalyzing,
  mirroring,
  className,
}: {
  visual: ReturnType<typeof mapAttunementToVisual>;
  attunementLevel: number;
  isAnalyzing: boolean;
  mirroring: ProsodyMirroringState["mirroring"];
  className: string;
}) {
  return (
    <AnimatePresence>
      {(isAnalyzing || attunementLevel > 0.4) && (
        <motion.div
          className={`flex flex-col items-center gap-2 ${className}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={HER_SPRINGS.gentle}
        >
          {/* Attunement bar */}
          <div
            className="w-32 h-1 rounded-full overflow-hidden"
            style={{ backgroundColor: `${HER_COLORS.softShadow}30` }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${HER_COLORS.coral} 0%, ${HER_COLORS.blush} 100%)`,
              }}
              initial={{ width: "0%" }}
              animate={{ width: `${attunementLevel * 100}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>

          {/* Connection state text - very subtle */}
          <motion.span
            className="text-xs font-light tracking-wide"
            style={{ color: HER_COLORS.softShadow, opacity: 0.5 }}
            animate={{
              opacity: isAnalyzing ? 0.6 : 0.3,
            }}
          >
            {visual.connectionStrength === "deep" && "..."}
            {visual.connectionStrength === "strong" && "~"}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Simple glow effect for subtle mode
function AttunementGlow({
  visual,
  attunementLevel,
  isAnalyzing,
  className,
}: {
  visual: ReturnType<typeof mapAttunementToVisual>;
  attunementLevel: number;
  isAnalyzing: boolean;
  className: string;
}) {
  return (
    <AnimatePresence>
      {isAnalyzing && attunementLevel > 0.35 && (
        <motion.div
          className={`absolute inset-0 pointer-events-none rounded-full ${className}`}
          style={{
            background: `radial-gradient(circle at 50% 50%, ${visual.glowColor} 0%, transparent 70%)`,
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{
            opacity: visual.glowIntensity * 0.6,
            scale: [1, 1.03, 1],
          }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{
            opacity: { duration: 0.5 },
            scale: {
              duration: visual.pulseRate,
              repeat: Infinity,
              ease: "easeInOut",
            },
          }}
        />
      )}
    </AnimatePresence>
  );
}

/**
 * BreathSync - Visual indicator that EVA's breathing syncs with user
 *
 * When attunement is high, EVA's breathing rhythm matches the user's
 * speaking rhythm, creating a deep sense of connection.
 */
interface BreathSyncProps {
  // Is breathing sync active
  isActive: boolean;

  // User's breathing/speaking rhythm (seconds per cycle)
  userRhythm: number;

  // Current attunement level
  attunementLevel: number;

  className?: string;
}

export function BreathSync({
  isActive,
  userRhythm,
  attunementLevel,
  className = "",
}: BreathSyncProps) {
  // Only show when highly attuned
  if (!isActive || attunementLevel < 0.6) {
    return null;
  }

  // Clamp rhythm to reasonable values
  const syncedRhythm = Math.max(2, Math.min(6, userRhythm));

  return (
    <motion.div
      className={`absolute inset-0 pointer-events-none ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.3 }}
      exit={{ opacity: 0 }}
    >
      {/* Synced breathing ring */}
      <motion.div
        className="absolute inset-4 rounded-full"
        style={{
          border: `1px solid ${HER_COLORS.blush}`,
          opacity: 0.3,
        }}
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: syncedRhythm,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Sync pulse - appears briefly when rhythms align */}
      <motion.div
        className="absolute inset-8 rounded-full"
        style={{
          backgroundColor: HER_COLORS.coral,
          opacity: 0,
        }}
        animate={{
          opacity: [0, 0.15, 0],
          scale: [0.95, 1.1, 0.95],
        }}
        transition={{
          duration: syncedRhythm,
          repeat: Infinity,
          ease: "easeInOut",
          delay: syncedRhythm * 0.25,
        }}
      />
    </motion.div>
  );
}

/**
 * MirroringFeedback - Shows what EVA is mirroring
 *
 * Subtle visual feedback that EVA is matching the user's emotional tone.
 * Not technical - just a feeling of "she gets me".
 */
interface MirroringFeedbackProps {
  emotionalTone: ProsodyMirroringState["mirroring"]["emotionalTone"];
  isActive: boolean;
  className?: string;
}

export function MirroringFeedback({
  emotionalTone,
  isActive,
  className = "",
}: MirroringFeedbackProps) {
  if (!isActive) return null;

  // Map emotional tone to visual warmth
  const toneColors: Record<typeof emotionalTone, { primary: string; glow: string }> = {
    warm: { primary: HER_COLORS.coral, glow: `${HER_COLORS.coral}40` },
    excited: { primary: HER_COLORS.coral, glow: `${HER_COLORS.coral}50` },
    gentle: { primary: HER_COLORS.blush, glow: `${HER_COLORS.blush}40` },
    thoughtful: { primary: HER_COLORS.earth, glow: `${HER_COLORS.earth}30` },
    playful: { primary: HER_COLORS.coral, glow: `${HER_COLORS.blush}45` },
  };

  const colors = toneColors[emotionalTone];

  return (
    <motion.div
      className={`absolute -bottom-2 left-1/2 -translate-x-1/2 ${className}`}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
    >
      {/* Tone indicator - subtle colored line */}
      <motion.div
        className="w-8 h-0.5 rounded-full"
        style={{ backgroundColor: colors.primary }}
        animate={{
          opacity: [0.4, 0.7, 0.4],
          width: ["24px", "32px", "24px"],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </motion.div>
  );
}
