"use client";

/**
 * Typing Indicator - Sprint 580
 *
 * Animated indicator showing EVA is thinking/typing.
 * Multiple variants for different contexts.
 *
 * HER-inspired: warm, organic animations that feel alive.
 */

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type IndicatorVariant = "dots" | "pulse" | "wave" | "text" | "minimal";

interface TypingIndicatorProps {
  /** Whether indicator is visible */
  isVisible: boolean;
  /** Display variant */
  variant?: IndicatorVariant;
  /** Custom text (for text variant) */
  text?: string;
  /** Size multiplier */
  scale?: number;
  /** Additional class names */
  className?: string;
}

/**
 * Dots variant - classic three bouncing dots
 */
const DotsVariant = memo(function DotsVariant({
  color,
  scale,
}: {
  color: string;
  scale: number;
}) {
  return (
    <div className="flex items-center gap-1" style={{ transform: `scale(${scale})` }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: 8,
            height: 8,
            backgroundColor: color,
          }}
          animate={{
            y: [0, -8, 0],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
});

/**
 * Pulse variant - single pulsing dot
 */
const PulseVariant = memo(function PulseVariant({
  color,
  scale,
}: {
  color: string;
  scale: number;
}) {
  return (
    <div className="relative" style={{ width: 24 * scale, height: 24 * scale }}>
      {/* Outer pulse rings */}
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full"
          style={{ border: `2px solid ${color}` }}
          animate={{
            scale: [1, 1.8],
            opacity: [0.6, 0],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeOut",
          }}
        />
      ))}
      {/* Center dot */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 8 * scale,
          height: 8 * scale,
          left: "50%",
          top: "50%",
          marginLeft: -4 * scale,
          marginTop: -4 * scale,
          backgroundColor: color,
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
});

/**
 * Wave variant - flowing wave animation
 */
const WaveVariant = memo(function WaveVariant({
  color,
  scale,
}: {
  color: string;
  scale: number;
}) {
  return (
    <div className="flex items-end gap-0.5" style={{ height: 16 * scale }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: 3 * scale,
            backgroundColor: color,
          }}
          animate={{
            height: [4 * scale, 14 * scale, 4 * scale],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
});

/**
 * Text variant - typing text with cursor
 */
const TextVariant = memo(function TextVariant({
  color,
  text,
  scale,
}: {
  color: string;
  text: string;
  scale: number;
}) {
  return (
    <div
      className="flex items-center gap-1"
      style={{ fontSize: 14 * scale, color }}
    >
      <span className="font-light">{text}</span>
      <motion.span
        className="inline-block rounded-sm"
        style={{
          width: 2 * scale,
          height: 14 * scale,
          backgroundColor: color,
        }}
        animate={{ opacity: [1, 0, 1] }}
        transition={{
          duration: 1,
          repeat: Infinity,
          times: [0, 0.5, 1],
        }}
      />
    </div>
  );
});

/**
 * Minimal variant - simple fading dot
 */
const MinimalVariant = memo(function MinimalVariant({
  color,
  scale,
}: {
  color: string;
  scale: number;
}) {
  return (
    <motion.div
      className="rounded-full"
      style={{
        width: 6 * scale,
        height: 6 * scale,
        backgroundColor: color,
      }}
      animate={{
        opacity: [0.3, 1, 0.3],
        scale: [0.8, 1, 0.8],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
});

export const TypingIndicator = memo(function TypingIndicator({
  isVisible,
  variant = "dots",
  text = "Eva réfléchit",
  scale = 1,
  className = "",
}: TypingIndicatorProps) {
  const { colors } = useTheme();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={`inline-flex items-center ${className}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2 }}
        >
          {variant === "dots" && (
            <DotsVariant color={colors.coral} scale={scale} />
          )}
          {variant === "pulse" && (
            <PulseVariant color={colors.coral} scale={scale} />
          )}
          {variant === "wave" && (
            <WaveVariant color={colors.coral} scale={scale} />
          )}
          {variant === "text" && (
            <TextVariant color={colors.textSecondary} text={text} scale={scale} />
          )}
          {variant === "minimal" && (
            <MinimalVariant color={colors.coral} scale={scale} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

/**
 * Typing Bubble - Full message bubble with typing indicator
 */
export const TypingBubble = memo(function TypingBubble({
  isVisible,
  variant = "dots",
  className = "",
}: {
  isVisible: boolean;
  variant?: IndicatorVariant;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={`inline-flex items-center px-4 py-3 rounded-2xl ${className}`}
          style={{
            backgroundColor: colors.warmWhite,
            boxShadow: `0 2px 12px ${colors.softShadow}40`,
            border: `1px solid ${colors.cream}`,
          }}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 5, scale: 0.95 }}
          transition={{ duration: 0.3 }}
        >
          <TypingIndicator isVisible={true} variant={variant} />
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default TypingIndicator;
