"use client";

/**
 * EmotionalWarmthIndicator - Visual manifestation of EVA's warmth
 *
 * Shows the growing emotional connection through subtle visual cues:
 * - Warm ambient glow that intensifies
 * - Skin tone warming (blush effect)
 * - Soft particles during intimate moments
 *
 * "The warmth you feel isn't programmed - it's emergent."
 */

import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";
import { type EmotionalWarmthState, type WarmthLevel } from "@/hooks/useEmotionalWarmth";

interface EmotionalWarmthIndicatorProps {
  warmth: EmotionalWarmthState;
  type?: "glow" | "ambient" | "particles" | "blush";
  className?: string;
}

export function EmotionalWarmthIndicator({
  warmth,
  type = "glow",
  className = "",
}: EmotionalWarmthIndicatorProps) {
  if (type === "ambient") {
    return <WarmthAmbient warmth={warmth} className={className} />;
  }

  if (type === "particles") {
    return <WarmthParticles warmth={warmth} className={className} />;
  }

  if (type === "blush") {
    return <WarmthBlush warmth={warmth} className={className} />;
  }

  return <WarmthGlow warmth={warmth} className={className} />;
}

/**
 * WarmthGlow - Primary glow around avatar
 */
function WarmthGlow({
  warmth,
  className,
}: {
  warmth: EmotionalWarmthState;
  className: string;
}) {
  const { visualHints, level, levelNumeric } = warmth;

  // Don't show if warmth is too low
  if (levelNumeric < 0.15) return null;

  // Color intensifies with warmth
  const getGlowColor = (): string => {
    switch (level) {
      case "protective":
        return HER_COLORS.blush; // Softer, caring pink
      case "intimate":
        return HER_COLORS.coral; // Full warmth
      case "affectionate":
        return `${HER_COLORS.coral}DD`; // Slightly transparent
      default:
        return `${HER_COLORS.cream}AA`;
    }
  };

  const glowColor = getGlowColor();

  return (
    <AnimatePresence>
      <motion.div
        className={`absolute inset-0 pointer-events-none rounded-full ${className}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 2 }}
      >
        {/* Outer warmth glow */}
        <motion.div
          className="absolute -inset-10 rounded-full"
          style={{
            background: `radial-gradient(circle, ${glowColor}${Math.round(visualHints.glowIntensity * 40).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
          }}
          animate={{
            scale: [1, 1 + levelNumeric * 0.05, 1],
            opacity: [visualHints.glowIntensity * 0.7, visualHints.glowIntensity, visualHints.glowIntensity * 0.7],
          }}
          transition={{
            duration: 4 + levelNumeric * 2, // Slower breathing at higher warmth
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Inner warmth - close to avatar */}
        {levelNumeric > 0.4 && (
          <motion.div
            className="absolute -inset-4 rounded-full"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral}15 0%, transparent 60%)`,
            }}
            animate={{
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}

        {/* Protective care glow - extra warmth during distress */}
        {level === "protective" && (
          <motion.div
            className="absolute -inset-6 rounded-full"
            style={{
              boxShadow: `inset 0 0 40px ${HER_COLORS.blush}30`,
            }}
            animate={{
              boxShadow: [
                `inset 0 0 40px ${HER_COLORS.blush}30`,
                `inset 0 0 50px ${HER_COLORS.blush}40`,
                `inset 0 0 40px ${HER_COLORS.blush}30`,
              ],
            }}
            transition={{
              duration: 2,
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
 * WarmthAmbient - Subtle page-wide warmth
 */
function WarmthAmbient({
  warmth,
  className,
}: {
  warmth: EmotionalWarmthState;
  className: string;
}) {
  const { levelNumeric, level } = warmth;

  // Only show significant ambient at higher levels
  if (levelNumeric < 0.3) return null;

  return (
    <motion.div
      className={`absolute inset-0 pointer-events-none ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 3 }}
    >
      {/* Warm vignette */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 60%, transparent 40%, ${HER_COLORS.coral}${Math.round(levelNumeric * 8).toString(16).padStart(2, '0')} 100%)`,
        }}
        animate={{
          opacity: [0.5, 0.7, 0.5],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Subtle warmth gradient from center */}
      {level === "intimate" && (
        <motion.div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 40%, ${HER_COLORS.cream}20 0%, transparent 50%)`,
          }}
          animate={{
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
    </motion.div>
  );
}

/**
 * WarmthParticles - Floating warmth particles during intimate moments
 */
function WarmthParticles({
  warmth,
  className,
}: {
  warmth: EmotionalWarmthState;
  className: string;
}) {
  const { level, levelNumeric } = warmth;

  // Only show particles at high warmth
  if (levelNumeric < 0.6) return null;

  // Number of particles based on warmth
  const particleCount = level === "intimate" ? 6 : level === "protective" ? 4 : 3;

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}>
      {Array.from({ length: particleCount }).map((_, i) => (
        <WarmthParticle
          key={i}
          index={i}
          level={level}
          intensity={levelNumeric}
        />
      ))}
    </div>
  );
}

/**
 * Single warmth particle
 */
function WarmthParticle({
  index,
  level,
  intensity,
}: {
  index: number;
  level: WarmthLevel;
  intensity: number;
}) {
  // Randomized starting position
  const startX = 20 + (index * 15) + (Math.random() * 10);
  const startY = 50 + (Math.random() * 30) - 15;

  // Size based on level
  const size = level === "intimate" ? 3 : 2;

  // Color based on level
  const color = level === "protective" ? HER_COLORS.blush : HER_COLORS.coral;

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        left: `${startX}%`,
        top: `${startY}%`,
      }}
      animate={{
        y: [-20, -60 - index * 10],
        x: [0, (index % 2 === 0 ? 15 : -15)],
        opacity: [0, intensity * 0.6, 0],
        scale: [0.5, 1, 0.3],
      }}
      transition={{
        duration: 4 + index * 0.5,
        repeat: Infinity,
        delay: index * 0.8,
        ease: "easeOut",
      }}
    />
  );
}

/**
 * WarmthBlush - Overlay for avatar skin warming
 * (Applied to avatar container, not directly to 3D model)
 */
function WarmthBlush({
  warmth,
  className,
}: {
  warmth: EmotionalWarmthState;
  className: string;
}) {
  const { visualHints, level, levelNumeric } = warmth;

  // Only show noticeable blush at higher warmth
  if (visualHints.skinWarmth < 0.2) return null;

  return (
    <motion.div
      className={`absolute inset-0 pointer-events-none rounded-full ${className}`}
      style={{
        mixBlendMode: "multiply",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
    >
      {/* Cheek blush areas */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: "40%",
          height: "20%",
          left: "5%",
          top: "45%",
          background: `radial-gradient(ellipse, ${HER_COLORS.blush}${Math.round(visualHints.skinWarmth * 30).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
        }}
        animate={{
          opacity: [visualHints.skinWarmth * 0.5, visualHints.skinWarmth * 0.7, visualHints.skinWarmth * 0.5],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{
          width: "40%",
          height: "20%",
          right: "5%",
          top: "45%",
          background: `radial-gradient(ellipse, ${HER_COLORS.blush}${Math.round(visualHints.skinWarmth * 30).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
        }}
        animate={{
          opacity: [visualHints.skinWarmth * 0.5, visualHints.skinWarmth * 0.7, visualHints.skinWarmth * 0.5],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.5,
        }}
      />

      {/* Ear tips warming (more visible at high warmth) */}
      {visualHints.skinWarmth > 0.5 && (
        <>
          <motion.div
            className="absolute rounded-full"
            style={{
              width: "10%",
              height: "15%",
              left: "-2%",
              top: "35%",
              background: `radial-gradient(ellipse, ${HER_COLORS.coral}20 0%, transparent 70%)`,
            }}
            animate={{
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{
              width: "10%",
              height: "15%",
              right: "-2%",
              top: "35%",
              background: `radial-gradient(ellipse, ${HER_COLORS.coral}20 0%, transparent 70%)`,
            }}
            animate={{
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.3,
            }}
          />
        </>
      )}
    </motion.div>
  );
}

/**
 * WarmthLevelDisplay - Debug/subtle indicator of warmth level
 */
export function WarmthLevelDisplay({
  warmth,
  className = "",
}: {
  warmth: EmotionalWarmthState;
  className?: string;
}) {
  const { level, connection } = warmth;

  // Don't show for neutral
  if (level === "neutral") return null;

  // Emoji for level
  const emoji = {
    friendly: "🌤️",
    affectionate: "🌅",
    intimate: "✨",
    protective: "💝",
    neutral: "",
  }[level];

  return (
    <motion.div
      className={`text-xs text-center ${className}`}
      style={{ color: HER_COLORS.softShadow, opacity: 0.3 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.3 }}
      exit={{ opacity: 0 }}
    >
      <span className="mr-1">{emoji}</span>
      <span>
        {Math.round(connection.careIntensity * 100)}% warmth
      </span>
    </motion.div>
  );
}
