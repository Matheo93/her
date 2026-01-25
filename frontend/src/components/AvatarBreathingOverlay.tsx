"use client";

/**
 * Avatar Breathing Overlay - Sprint 574
 *
 * Subtle breathing animation overlay that creates a sense of life
 * and presence. Uses organic timing for natural feel.
 *
 * Features:
 * - Organic breathing rhythm (variable timing)
 * - Adjustable intensity based on emotion
 * - Dark/light mode aware
 */

import React, { memo, useState, useEffect, useMemo } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type BreathingState = "calm" | "active" | "excited" | "relaxed";

interface AvatarBreathingOverlayProps {
  /** Current breathing state */
  state?: BreathingState;
  /** Size of the overlay */
  size?: number;
  /** Whether breathing is active */
  enabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Get breathing parameters based on state
 */
function getBreathingParams(state: BreathingState) {
  switch (state) {
    case "excited":
      return {
        cycleDuration: 2000,
        scaleRange: [1, 1.04],
        opacityRange: [0.2, 0.4],
      };
    case "active":
      return {
        cycleDuration: 3000,
        scaleRange: [1, 1.03],
        opacityRange: [0.15, 0.3],
      };
    case "relaxed":
      return {
        cycleDuration: 5000,
        scaleRange: [1, 1.015],
        opacityRange: [0.1, 0.2],
      };
    case "calm":
    default:
      return {
        cycleDuration: 4000,
        scaleRange: [1, 1.02],
        opacityRange: [0.12, 0.25],
      };
  }
}

export const AvatarBreathingOverlay = memo(function AvatarBreathingOverlay({
  state = "calm",
  size = 200,
  enabled = true,
  className = "",
}: AvatarBreathingOverlayProps) {
  const { colors } = useTheme();
  const params = useMemo(() => getBreathingParams(state), [state]);

  // Breathing cycle phase (0-1)
  const [breathPhase, setBreathPhase] = useState(0);

  // Spring for smooth phase transitions
  const breathSpring = useSpring(0, {
    stiffness: 30,
    damping: 20,
  });

  // Transform spring value to scale and opacity
  const scale = useTransform(
    breathSpring,
    [0, 0.5, 1],
    [params.scaleRange[0], params.scaleRange[1], params.scaleRange[0]]
  );

  const opacity = useTransform(
    breathSpring,
    [0, 0.5, 1],
    [params.opacityRange[0], params.opacityRange[1], params.opacityRange[0]]
  );

  // Animate breathing cycle
  useEffect(() => {
    if (!enabled) return;

    let animationFrame: number;
    let startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const phase = (elapsed % params.cycleDuration) / params.cycleDuration;

      setBreathPhase(phase);
      breathSpring.set(phase);

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [enabled, params.cycleDuration, breathSpring]);

  if (!enabled) return null;

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
      {/* Primary breathing layer */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          scale,
          opacity,
          background: `radial-gradient(circle, ${colors.glowWarm} 0%, transparent 70%)`,
        }}
      />

      {/* Secondary subtle pulse layer */}
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: size * 0.1,
          background: `radial-gradient(circle, ${colors.coral}20 0%, transparent 60%)`,
        }}
        animate={{
          scale: [1, 1.02, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: params.cycleDuration / 1000 * 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Warmth indicator at center */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 8,
          height: 8,
          left: "50%",
          top: "50%",
          marginLeft: -4,
          marginTop: -4,
          backgroundColor: colors.coral,
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.6, 0.8, 0.6],
        }}
        transition={{
          duration: params.cycleDuration / 1000,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
});

export default AvatarBreathingOverlay;
