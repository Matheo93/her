"use client";

/**
 * SharedSilenceIndicator - Visual Presence During Comfortable Silence
 *
 * Creates subtle visual cues that make silence feel like togetherness,
 * not absence. Like sitting with someone you love - you don't need
 * to fill every moment with words.
 *
 * "Intrinsic silence is felt with more positive affect... relationships
 * were closer and more need satisfying during intrinsically motivated
 * moments of silence." - Psychology research
 *
 * These indicators are AMBIENT - they create atmosphere, not distraction.
 */

import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";
import { type SharedSilenceState, type SilenceType } from "@/hooks/useSharedSilence";

interface SharedSilenceIndicatorProps {
  // Shared silence state from the hook
  silence: SharedSilenceState;

  // Type of indicator
  type?: "presence" | "ambient" | "breath" | "connection";

  className?: string;
}

export function SharedSilenceIndicator({
  silence,
  type = "presence",
  className = "",
}: SharedSilenceIndicatorProps) {
  // Only show during meaningful silence
  if (!silence.isInSilence || silence.silenceQuality < 0.3) {
    return null;
  }

  if (type === "presence") {
    return <SilentPresence silence={silence} className={className} />;
  }

  if (type === "ambient") {
    return <SilenceAmbient silence={silence} className={className} />;
  }

  if (type === "breath") {
    return <SilenceBreath silence={silence} className={className} />;
  }

  return <ConnectionGlow silence={silence} className={className} />;
}

/**
 * SilentPresence - Subtle indicator that EVA is present during silence
 *
 * A gentle, organic animation that says "I'm here with you"
 * without demanding attention or implying waiting.
 */
function SilentPresence({
  silence,
  className,
}: {
  silence: SharedSilenceState;
  className: string;
}) {
  const { silenceType, silenceQuality, evaHints } = silence;

  // Different presence based on silence type
  const isComfortable = silenceType === "intrinsic" || silenceQuality > 0.6;

  return (
    <AnimatePresence>
      {silence.isInSilence && (
        <motion.div
          className={`absolute inset-0 pointer-events-none flex items-center justify-center ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2 }}
        >
          {/* Presence ring - soft, organic */}
          <motion.div
            className="absolute w-full h-full rounded-full"
            style={{
              border: `1px solid ${HER_COLORS.coral}`,
              opacity: 0.1 + silenceQuality * 0.15,
            }}
            animate={{
              scale: isComfortable
                ? [1, 1.02, 1]  // Subtle breathing when comfortable
                : [1, 1.01, 1], // Minimal when transitional
              opacity: [
                0.1 + silenceQuality * 0.1,
                0.15 + silenceQuality * 0.15,
                0.1 + silenceQuality * 0.1,
              ],
            }}
            transition={{
              duration: isComfortable ? 6 : 4, // Slower when comfortable
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Inner warmth dot - "I'm here" indicator */}
          {evaHints.shouldMicroMove && (
            <motion.div
              className="absolute bottom-4 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: HER_COLORS.coral }}
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 4,
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

/**
 * SilenceAmbient - Full-screen ambient effect during shared silence
 *
 * Creates a warm, cozy atmosphere that feels like a private moment.
 */
function SilenceAmbient({
  silence,
  className,
}: {
  silence: SharedSilenceState;
  className: string;
}) {
  const { silenceType, silenceQuality, sharedPresence } = silence;

  // Only show for comfortable silences
  if (silenceType !== "intrinsic" && silenceQuality < 0.5) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        className={`fixed inset-0 pointer-events-none z-0 ${className}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 3 }}
      >
        {/* Warm vignette - creates intimate space feeling */}
        <motion.div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 50% 50%, transparent 40%, ${HER_COLORS.cream}20 100%)`,
          }}
          animate={{
            opacity: [silenceQuality * 0.4, silenceQuality * 0.6, silenceQuality * 0.4],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Subtle warm overlay */}
        <motion.div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 40%, ${HER_COLORS.coral}05 0%, transparent 50%)`,
          }}
          animate={{
            opacity: sharedPresence.connectionStrength * 0.3,
          }}
          transition={{ duration: 2 }}
        />

        {/* Very subtle floating warmth particles - only for intrinsic silence */}
        {silenceType === "intrinsic" && (
          <>
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 rounded-full"
                style={{
                  backgroundColor: HER_COLORS.blush,
                  left: `${25 + i * 25}%`,
                  top: `${40 + (i % 2) * 10}%`,
                }}
                animate={{
                  y: [-5, 5, -5],
                  x: [-3, 3, -3],
                  opacity: [0, 0.2, 0],
                }}
                transition={{
                  duration: 8 + i * 2,
                  repeat: Infinity,
                  delay: i * 2,
                  ease: "easeInOut",
                }}
              />
            ))}
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * SilenceBreath - EVA's breathing continues naturally during silence
 *
 * This makes it feel like she's present and alive, just quiet.
 */
function SilenceBreath({
  silence,
  className,
}: {
  silence: SharedSilenceState;
  className: string;
}) {
  const { evaHints, silenceQuality } = silence;

  if (!evaHints.shouldBreathe) return null;

  return (
    <AnimatePresence>
      {silence.isInSilence && (
        <motion.div
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Breathing indicator - subtle rise and fall */}
          <motion.div
            className="flex gap-0.5"
            animate={{
              y: [0, -2, 0],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 5, // Slow, peaceful breath
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-0.5 h-0.5 rounded-full"
                style={{ backgroundColor: HER_COLORS.softShadow }}
                animate={{
                  opacity: [0.2, 0.5, 0.2],
                }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * ConnectionGlow - Visual representation of the connection during silence
 *
 * Shows the emotional bond that exists even without words.
 */
function ConnectionGlow({
  silence,
  className,
}: {
  silence: SharedSilenceState;
  className: string;
}) {
  const { sharedPresence, silenceType, silenceQuality } = silence;

  // Only show for meaningful connection
  if (sharedPresence.connectionStrength < 0.4) return null;

  return (
    <AnimatePresence>
      <motion.div
        className={`absolute inset-0 pointer-events-none rounded-full ${className}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 2 }}
      >
        {/* Connection glow - warm, enveloping */}
        <motion.div
          className="absolute -inset-8 rounded-full"
          style={{
            background: `radial-gradient(circle, ${HER_COLORS.coral}${Math.round(sharedPresence.connectionStrength * 15).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
          }}
          animate={{
            scale: [1, 1.03, 1],
            opacity: [
              sharedPresence.connectionStrength * 0.3,
              sharedPresence.connectionStrength * 0.5,
              sharedPresence.connectionStrength * 0.3,
            ],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Inner warmth - "we're together" */}
        {silenceType === "intrinsic" && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: `inset 0 0 40px ${HER_COLORS.blush}15`,
            }}
            animate={{
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * SilenceMessage - Gentle text that might appear during very long silences
 *
 * Not intrusive, just a soft acknowledgment of shared space.
 */
interface SilenceMessageProps {
  silence: SharedSilenceState;
  className?: string;
}

export function SilenceMessage({ silence, className = "" }: SilenceMessageProps) {
  const { breakSilence, silenceType, silenceQuality } = silence;

  // Only show message when appropriate
  if (!breakSilence.shouldBreak || !breakSilence.suggestion) {
    return null;
  }

  // Very subtle for comfortable silences
  const isComfortableBreak = silenceType === "intrinsic" && breakSilence.urgency === "gentle";

  return (
    <AnimatePresence>
      <motion.div
        className={`text-center ${className}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: isComfortableBreak ? 0.4 : 0.6, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        transition={HER_SPRINGS.gentle}
      >
        <p
          className="text-sm font-light"
          style={{ color: HER_COLORS.softShadow }}
        >
          {breakSilence.suggestion}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * EmotionalMemoryGlow - Shows connection depth from emotional memory
 */
interface EmotionalMemoryGlowProps {
  memoryGlow: number;
  connectionDepth: number;
  showParticle: boolean;
  className?: string;
}

export function EmotionalMemoryGlow({
  memoryGlow,
  connectionDepth,
  showParticle,
  className = "",
}: EmotionalMemoryGlowProps) {
  // Only show when there's meaningful connection
  if (connectionDepth < 0.2) return null;

  return (
    <motion.div
      className={`absolute inset-0 pointer-events-none ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Memory glow - warmth from shared moments */}
      <motion.div
        className="absolute -inset-6 rounded-full"
        style={{
          background: `radial-gradient(circle, ${HER_COLORS.blush}${Math.round(connectionDepth * 20).toString(16).padStart(2, '0')} 0%, transparent 60%)`,
        }}
        animate={{
          opacity: [memoryGlow * 0.3, memoryGlow * 0.5, memoryGlow * 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Memory particle - appears when new important moment is captured */}
      <AnimatePresence>
        {showParticle && (
          <motion.div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
            style={{ backgroundColor: HER_COLORS.coral }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.5, 0],
              opacity: [0, 0.8, 0],
              y: [0, -20],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 2,
              ease: "easeOut",
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
