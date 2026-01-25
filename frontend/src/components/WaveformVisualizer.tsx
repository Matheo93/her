"use client";

/**
 * Waveform Visualizer - Sprint 578
 *
 * Real-time audio waveform visualization with HER aesthetics.
 * Displays audio levels as animated bars with smooth transitions.
 *
 * Use cases:
 * - Show when EVA is speaking
 * - Display microphone input levels
 * - Create ambient audio visualization
 */

import React, { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface WaveformVisualizerProps {
  /** Audio level (0-1) */
  level: number;
  /** Number of bars to display */
  barCount?: number;
  /** Width of each bar */
  barWidth?: number;
  /** Gap between bars */
  barGap?: number;
  /** Maximum bar height */
  maxHeight?: number;
  /** Minimum bar height */
  minHeight?: number;
  /** Whether audio is active */
  isActive?: boolean;
  /** Color override */
  color?: string;
  /** Variant style */
  variant?: "bars" | "wave" | "dots";
  /** Additional class names */
  className?: string;
}

/**
 * Generate bar heights based on audio level
 * Creates a natural-looking waveform pattern
 */
function generateBarHeights(
  level: number,
  barCount: number,
  minHeight: number,
  maxHeight: number,
  seed: number = 0
): number[] {
  const heights: number[] = [];
  const centerIndex = Math.floor(barCount / 2);

  for (let i = 0; i < barCount; i++) {
    // Distance from center (0 to 1)
    const distanceFromCenter = Math.abs(i - centerIndex) / centerIndex;

    // Base height with center emphasis
    const centerWeight = 1 - distanceFromCenter * 0.6;

    // Add some variation
    const variation = Math.sin((i + seed) * 0.8) * 0.3 + 0.7;

    // Calculate final height
    const heightRatio = level * centerWeight * variation;
    const height = minHeight + (maxHeight - minHeight) * heightRatio;

    heights.push(Math.max(minHeight, Math.min(maxHeight, height)));
  }

  return heights;
}

/**
 * Bars variant - vertical bars like an equalizer
 */
const BarsVariant = memo(function BarsVariant({
  heights,
  barWidth,
  barGap,
  color,
  isActive,
}: {
  heights: number[];
  barWidth: number;
  barGap: number;
  color: string;
  isActive: boolean;
}) {
  return (
    <div
      className="flex items-end justify-center"
      style={{ gap: barGap }}
    >
      {heights.map((height, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: barWidth,
            backgroundColor: color,
          }}
          animate={{
            height: isActive ? height : 2,
            opacity: isActive ? 0.8 + (height / 40) * 0.2 : 0.3,
          }}
          transition={{
            duration: 0.1,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
});

/**
 * Wave variant - sine wave visualization
 */
const WaveVariant = memo(function WaveVariant({
  level,
  color,
  isActive,
  width,
  height,
}: {
  level: number;
  color: string;
  isActive: boolean;
  width: number;
  height: number;
}) {
  // Generate SVG path for wave
  const pathData = useMemo(() => {
    const points = 20;
    const amplitude = isActive ? level * (height / 2 - 2) : 2;
    const frequency = 2;
    let path = `M 0 ${height / 2}`;

    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      const y = height / 2 + Math.sin((i / points) * Math.PI * frequency * 2) * amplitude;
      path += ` L ${x} ${y}`;
    }

    return path;
  }, [level, isActive, width, height]);

  return (
    <svg width={width} height={height} className="overflow-visible">
      <motion.path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        animate={{
          opacity: isActive ? 0.9 : 0.3,
        }}
        transition={{ duration: 0.2 }}
      />
    </svg>
  );
});

/**
 * Dots variant - pulsing dots
 */
const DotsVariant = memo(function DotsVariant({
  heights,
  barGap,
  color,
  isActive,
}: {
  heights: number[];
  barGap: number;
  color: string;
  isActive: boolean;
}) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ gap: barGap }}
    >
      {heights.map((height, i) => {
        const scale = isActive ? 0.5 + (height / 40) * 0.8 : 0.5;
        return (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: color,
            }}
            animate={{
              scale,
              opacity: isActive ? 0.6 + scale * 0.4 : 0.3,
            }}
            transition={{
              duration: 0.15,
              ease: "easeOut",
            }}
          />
        );
      })}
    </div>
  );
});

export const WaveformVisualizer = memo(function WaveformVisualizer({
  level,
  barCount = 7,
  barWidth = 3,
  barGap = 2,
  maxHeight = 24,
  minHeight = 4,
  isActive = true,
  color,
  variant = "bars",
  className = "",
}: WaveformVisualizerProps) {
  const { colors } = useTheme();
  const activeColor = color || colors.coral;

  // Generate bar heights based on current level
  const heights = useMemo(
    () => generateBarHeights(level, barCount, minHeight, maxHeight, Date.now() % 100),
    [level, barCount, minHeight, maxHeight]
  );

  // Calculate total width for wave variant
  const totalWidth = barCount * barWidth + (barCount - 1) * barGap;

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ height: maxHeight }}
    >
      {variant === "bars" && (
        <BarsVariant
          heights={heights}
          barWidth={barWidth}
          barGap={barGap}
          color={activeColor}
          isActive={isActive}
        />
      )}
      {variant === "wave" && (
        <WaveVariant
          level={level}
          color={activeColor}
          isActive={isActive}
          width={totalWidth}
          height={maxHeight}
        />
      )}
      {variant === "dots" && (
        <DotsVariant
          heights={heights}
          barGap={barGap * 1.5}
          color={activeColor}
          isActive={isActive}
        />
      )}
    </div>
  );
});

export default WaveformVisualizer;
