"use client";

/**
 * BackchannelIndicator - Visual Acknowledgment Display
 *
 * Shows subtle visual cues when EVA is backchanneling
 * (acknowledging the user's speech with "mmh", "ah", etc.)
 *
 * The visual is intentionally minimal - a brief text flash
 * and a subtle glow, reinforcing the feeling of being heard.
 */

import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";
import type { BackchannelEvent, BackchannelSound } from "@/hooks/useBackchanneling";

interface BackchannelIndicatorProps {
  event: BackchannelEvent | null;
  isPreparingBackchannel: boolean;
  position?: "above" | "below" | "overlay";
  showText?: boolean;
}

// Map sounds to display text (subtle, lowercase, organic)
const SOUND_DISPLAY: Record<BackchannelSound, string> = {
  mmh: "mmh...",
  ah: "ah...",
  oui: "oui...",
  daccord: "d'accord...",
  hmm: "hmm...",
  oh: "oh...",
  aah: "aah...",
  breath: "", // No text for breath, just visual
};

export function BackchannelIndicator({
  event,
  isPreparingBackchannel,
  position = "below",
  showText = true,
}: BackchannelIndicatorProps) {
  const displayText = event?.sound ? SOUND_DISPLAY[event.sound] : "";
  const intensity = event?.intensity ?? 0.3;

  // Position styles
  const positionStyles = {
    above: "bottom-full mb-2",
    below: "top-full mt-2",
    overlay: "absolute inset-0 flex items-center justify-center",
  };

  return (
    <div className={`relative ${position !== "overlay" ? positionStyles[position] : ""}`}>
      {/* Preparing indicator - subtle anticipation glow */}
      <AnimatePresence>
        {isPreparingBackchannel && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral}20 0%, transparent 60%)`,
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      {/* Active backchannel indicator */}
      <AnimatePresence mode="wait">
        {event && (
          <motion.div
            key={event.id}
            className={`flex flex-col items-center ${position === "overlay" ? positionStyles.overlay : ""}`}
            initial={{ opacity: 0, y: position === "above" ? 10 : -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: position === "above" ? -5 : 5 }}
            transition={HER_SPRINGS.gentle}
          >
            {/* Glow pulse - always shown */}
            <motion.div
              className="absolute w-16 h-8 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(ellipse, ${HER_COLORS.coral}${Math.round(intensity * 60).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
                filter: "blur(4px)",
              }}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.6, 1, 0.4],
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />

            {/* Text display - optional, very subtle */}
            {showText && displayText && (
              <motion.span
                className="relative text-sm font-light italic"
                style={{
                  color: HER_COLORS.earth,
                  opacity: intensity * 0.8,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: intensity * 0.8 }}
                exit={{ opacity: 0 }}
              >
                {displayText}
              </motion.span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Compact backchannel indicator for use near avatar
 * Shows just a subtle glow, no text
 */
export function BackchannelGlow({
  event,
  isPreparingBackchannel,
}: {
  event: BackchannelEvent | null;
  isPreparingBackchannel: boolean;
}) {
  const intensity = event?.intensity ?? 0.3;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Preparation pulse */}
      <AnimatePresence>
        {isPreparingBackchannel && !event && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral}15 0%, transparent 50%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

      {/* Active backchannel glow */}
      <AnimatePresence>
        {event && (
          <motion.div
            key={event.id}
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 50% 60%, ${HER_COLORS.coral}${Math.round(intensity * 50).toString(16).padStart(2, "0")} 0%, transparent 40%)`,
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: [0.5, 1, 0.3],
              scale: [1, 1.02, 1],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
