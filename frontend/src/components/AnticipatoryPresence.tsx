"use client";

/**
 * AnticipatoryPresence - Visual Indicators of EVA's Anticipation
 *
 * Shows that EVA is ready before you need her to be.
 * Creates the feeling of a close friend who knows what you're about to say.
 *
 * These visual cues are subtle - not intrusive or creepy.
 * They communicate readiness without interrupting.
 */

import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";
import {
  type AnticipationState,
  type AnticipationVisuals,
  mapAnticipationToVisuals,
} from "@/hooks/useAnticipation";

interface AnticipatoryPresenceProps {
  // Anticipation state from the hook
  anticipation: AnticipationState;

  // Position relative to avatar
  position?: "glow" | "subtle" | "ring";

  className?: string;
}

export function AnticipatoryPresence({
  anticipation,
  position = "glow",
  className = "",
}: AnticipatoryPresenceProps) {
  const visuals = mapAnticipationToVisuals(anticipation);

  // Don't show if not anticipating
  if (!anticipation.showAnticipation && anticipation.readinessLevel === "relaxed") {
    return null;
  }

  if (position === "glow") {
    return (
      <ReadinessGlow
        anticipation={anticipation}
        visuals={visuals}
        className={className}
      />
    );
  }

  if (position === "ring") {
    return (
      <ReadinessRing
        anticipation={anticipation}
        visuals={visuals}
        className={className}
      />
    );
  }

  // Subtle mode
  return (
    <SubtleAnticipation
      anticipation={anticipation}
      visuals={visuals}
      className={className}
    />
  );
}

// Soft glow that intensifies as EVA becomes ready
function ReadinessGlow({
  anticipation,
  visuals,
  className,
}: {
  anticipation: AnticipationState;
  visuals: AnticipationVisuals;
  className: string;
}) {
  const { readinessLevel, isSearchingForWords, isNearingConclusion } = anticipation;
  const { readinessGlow } = visuals;

  return (
    <AnimatePresence>
      {readinessGlow > 0 && (
        <motion.div
          className={`absolute inset-0 pointer-events-none rounded-full ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Base readiness glow */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 50% 50%, ${HER_COLORS.coral}${Math.round(readinessGlow * 40).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
            }}
            animate={{
              scale: [1, 1.02, 1],
              opacity: [readinessGlow * 0.7, readinessGlow, readinessGlow * 0.7],
            }}
            transition={{
              duration: readinessLevel === "imminent" ? 1.5 : 2.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Searching for words - understanding glow */}
          {isSearchingForWords && (
            <motion.div
              className="absolute inset-4 rounded-full"
              style={{
                background: `radial-gradient(circle, ${HER_COLORS.blush}30 0%, transparent 60%)`,
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{
                opacity: [0.3, 0.5, 0.3],
                scale: [0.95, 1, 0.95],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          {/* Nearing conclusion - ready pulse */}
          {isNearingConclusion && readinessLevel === "imminent" && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                border: `2px solid ${HER_COLORS.coral}`,
                opacity: 0,
              }}
              animate={{
                opacity: [0, 0.6, 0],
                scale: [1, 1.15, 1],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Ring indicator that shows readiness state
function ReadinessRing({
  anticipation,
  visuals,
  className,
}: {
  anticipation: AnticipationState;
  visuals: AnticipationVisuals;
  className: string;
}) {
  const { readinessLevel, conclusionConfidence, isSearchingForWords } = anticipation;

  // Ring color based on state
  const ringColor =
    readinessLevel === "imminent"
      ? HER_COLORS.coral
      : readinessLevel === "ready"
        ? HER_COLORS.blush
        : HER_COLORS.softShadow;

  // Ring thickness based on readiness
  const thickness =
    readinessLevel === "imminent" ? 2 : readinessLevel === "ready" ? 1.5 : 1;

  return (
    <AnimatePresence>
      {readinessLevel !== "relaxed" && (
        <motion.div
          className={`absolute inset-0 pointer-events-none ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Main readiness ring */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              border: `${thickness}px solid ${ringColor}`,
              opacity: 0.3,
            }}
            animate={{
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Progress arc showing conclusion confidence */}
          {conclusionConfidence > 0.3 && (
            <svg
              className="absolute inset-0 w-full h-full -rotate-90"
              viewBox="0 0 100 100"
            >
              <motion.circle
                cx="50"
                cy="50"
                r="48"
                fill="none"
                stroke={HER_COLORS.coral}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={`${conclusionConfidence * 301.6} 301.6`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ duration: 0.3 }}
              />
            </svg>
          )}

          {/* Search indicator - small dots */}
          {isSearchingForWords && (
            <motion.div
              className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-1"
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: HER_COLORS.blush }}
                  animate={{
                    opacity: [0.3, 0.8, 0.3],
                    scale: [0.8, 1, 0.8],
                  }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Very subtle anticipation indicators
function SubtleAnticipation({
  anticipation,
  visuals,
  className,
}: {
  anticipation: AnticipationState;
  visuals: AnticipationVisuals;
  className: string;
}) {
  const { readinessLevel, microExpression } = visuals;

  return (
    <AnimatePresence>
      {anticipation.showAnticipation && (
        <motion.div
          className={`absolute inset-0 pointer-events-none ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Subtle corner glow */}
          <motion.div
            className="absolute -inset-4 rounded-full"
            style={{
              background: `radial-gradient(ellipse at 30% 70%, ${HER_COLORS.coral}15 0%, transparent 50%)`,
            }}
            animate={{
              opacity: [0.5, 0.8, 0.5],
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
  );
}

/**
 * AnticipationText - Shows EVA's readiness state in text (debugging/subtle)
 */
interface AnticipationTextProps {
  anticipation: AnticipationState;
  show?: boolean;
  className?: string;
}

export function AnticipationText({
  anticipation,
  show = true,
  className = "",
}: AnticipationTextProps) {
  if (!show || anticipation.readinessLevel === "relaxed") return null;

  // Generate subtle text based on state
  let text = "";
  if (anticipation.isSearchingForWords) {
    text = "...";
  } else if (anticipation.readinessLevel === "imminent") {
    text = "~";
  }

  if (!text) return null;

  return (
    <motion.span
      className={`text-xs ${className}`}
      style={{ color: HER_COLORS.softShadow, opacity: 0.4 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.4 }}
      exit={{ opacity: 0 }}
    >
      {text}
    </motion.span>
  );
}

/**
 * BreathHoldIndicator - Shows when EVA is holding breath in anticipation
 */
interface BreathHoldIndicatorProps {
  isHolding: boolean;
  className?: string;
}

export function BreathHoldIndicator({
  isHolding,
  className = "",
}: BreathHoldIndicatorProps) {
  return (
    <AnimatePresence>
      {isHolding && (
        <motion.div
          className={`absolute inset-0 pointer-events-none ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Subtle "holding" glow - doesn't pulse */}
          <motion.div
            className="absolute inset-2 rounded-full"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.cream}20 0%, transparent 60%)`,
            }}
            animate={{
              scale: 1.02,
            }}
            transition={{
              duration: 0.5,
              ease: "easeOut",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
