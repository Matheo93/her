"use client";

/**
 * Voice Waveform Visualizer - Sprint 598
 *
 * Audio visualization components:
 * - Live microphone waveform
 * - Static audio waveform
 * - Frequency bars
 * - HER-themed styling
 */

import React, { memo, useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface WaveformProps {
  /** Audio source (mic or audio element) */
  audioSource?: MediaStream | HTMLAudioElement | null;
  /** Width of canvas */
  width?: number;
  /** Height of canvas */
  height?: number;
  /** Bar or line style */
  style?: "bars" | "line" | "dots";
  /** Primary color override */
  color?: string;
  /** Additional class names */
  className?: string;
  /** Whether actively recording/playing */
  isActive?: boolean;
}

/**
 * Live Waveform - Real-time audio visualization
 */
export const LiveWaveform = memo(function LiveWaveform({
  audioSource,
  width = 200,
  height = 60,
  style = "bars",
  color,
  className = "",
  isActive = false,
}: WaveformProps) {
  const { colors } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const activeColor = color || colors.coral;

  useEffect(() => {
    if (!audioSource || !isActive) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, width, height);
        }
      }
      return;
    }

    // Set up audio context and analyzer
    const audioContext = new AudioContext();
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 64;
    analyzer.smoothingTimeConstant = 0.8;

    let source: AudioNode;
    if (audioSource instanceof MediaStream) {
      source = audioContext.createMediaStreamSource(audioSource);
    } else {
      source = audioContext.createMediaElementSource(audioSource);
      source.connect(audioContext.destination);
    }
    source.connect(analyzer);

    analyzerRef.current = analyzer;
    dataArrayRef.current = new Uint8Array(analyzer.frequencyBinCount);

    const draw = () => {
      if (!analyzerRef.current || !dataArrayRef.current || !canvasRef.current) {
        return;
      }

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      analyzerRef.current.getByteFrequencyData(dataArrayRef.current);

      ctx.clearRect(0, 0, width, height);

      const barCount = dataArrayRef.current.length;

      if (style === "bars") {
        const barWidth = width / barCount - 2;
        for (let i = 0; i < barCount; i++) {
          const value = dataArrayRef.current[i];
          const barHeight = (value / 255) * height * 0.9;
          const x = i * (barWidth + 2);
          const y = height - barHeight;

          ctx.fillStyle = activeColor;
          ctx.globalAlpha = 0.3 + (value / 255) * 0.7;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        }
      } else if (style === "line") {
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();

        for (let i = 0; i < barCount; i++) {
          const value = dataArrayRef.current[i];
          const x = (i / barCount) * width;
          const y = height - (value / 255) * height * 0.8;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      } else if (style === "dots") {
        for (let i = 0; i < barCount; i++) {
          const value = dataArrayRef.current[i];
          const x = (i / barCount) * width + 4;
          const y = height / 2;
          const radius = 2 + (value / 255) * 6;

          ctx.fillStyle = activeColor;
          ctx.globalAlpha = 0.4 + (value / 255) * 0.6;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      audioContext.close();
    };
  }, [audioSource, isActive, width, height, style, activeColor]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ display: "block" }}
    />
  );
});

/**
 * Simulated Waveform - Animated placeholder when no audio
 */
export const SimulatedWaveform = memo(function SimulatedWaveform({
  width = 200,
  height = 60,
  barCount = 20,
  color,
  className = "",
  isActive = true,
}: {
  width?: number;
  height?: number;
  barCount?: number;
  color?: string;
  className?: string;
  isActive?: boolean;
}) {
  const { colors } = useTheme();
  const activeColor = color || colors.coral;

  return (
    <div
      className={`flex items-end justify-center gap-[2px] ${className}`}
      style={{ width, height }}
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <motion.div
          key={i}
          className="rounded-sm"
          style={{
            width: width / barCount - 2,
            backgroundColor: activeColor,
          }}
          animate={
            isActive
              ? {
                  height: [
                    height * 0.2,
                    height * (0.3 + Math.random() * 0.6),
                    height * 0.2,
                  ],
                  opacity: [0.4, 0.9, 0.4],
                }
              : { height: height * 0.15, opacity: 0.3 }
          }
          transition={
            isActive
              ? {
                  duration: 0.3 + Math.random() * 0.4,
                  repeat: Infinity,
                  delay: i * 0.05,
                  ease: "easeInOut" as const,
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
});

/**
 * Frequency Bars - Simple frequency display
 */
export const FrequencyBars = memo(function FrequencyBars({
  levels = [0.3, 0.5, 0.8, 0.6, 0.4],
  height = 40,
  color,
  className = "",
}: {
  levels?: number[];
  height?: number;
  color?: string;
  className?: string;
}) {
  const { colors } = useTheme();
  const activeColor = color || colors.coral;

  return (
    <div className={`flex items-end gap-1 ${className}`}>
      {levels.map((level, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full"
          style={{ backgroundColor: activeColor }}
          animate={{
            height: height * Math.max(0.1, level),
            opacity: 0.4 + level * 0.6,
          }}
          transition={{ duration: 0.1 }}
        />
      ))}
    </div>
  );
});

/**
 * Voice Activity Indicator - Simple speaking indicator
 */
export const VoiceActivityIndicator = memo(function VoiceActivityIndicator({
  isActive = false,
  size = 24,
  color,
  className = "",
}: {
  isActive?: boolean;
  size?: number;
  color?: string;
  className?: string;
}) {
  const { colors } = useTheme();
  const activeColor = color || colors.coral;

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ border: `2px solid ${activeColor}` }}
        animate={
          isActive
            ? {
                scale: [1, 1.3, 1],
                opacity: [0.8, 0.2, 0.8],
              }
            : { scale: 1, opacity: 0.3 }
        }
        transition={
          isActive
            ? {
                duration: 0.8,
                repeat: Infinity,
                ease: "easeOut" as const,
              }
            : { duration: 0.3 }
        }
      />
      {/* Inner circle */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 0.5,
          height: size * 0.5,
          left: "50%",
          top: "50%",
          x: "-50%",
          y: "-50%",
          backgroundColor: activeColor,
        }}
        animate={
          isActive
            ? { scale: [0.8, 1.1, 0.8], opacity: 1 }
            : { scale: 0.8, opacity: 0.5 }
        }
        transition={
          isActive
            ? {
                duration: 0.6,
                repeat: Infinity,
                ease: "easeInOut" as const,
              }
            : { duration: 0.3 }
        }
      />
    </div>
  );
});

/**
 * Speaking Animation - Dots that animate while speaking
 */
export const SpeakingDots = memo(function SpeakingDots({
  isActive = false,
  dotCount = 3,
  dotSize = 8,
  color,
  className = "",
}: {
  isActive?: boolean;
  dotCount?: number;
  dotSize?: number;
  color?: string;
  className?: string;
}) {
  const { colors } = useTheme();
  const activeColor = color || colors.coral;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {Array.from({ length: dotCount }).map((_, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: dotSize,
            height: dotSize,
            backgroundColor: activeColor,
          }}
          animate={
            isActive
              ? {
                  scale: [1, 1.4, 1],
                  opacity: [0.5, 1, 0.5],
                }
              : { scale: 1, opacity: 0.3 }
          }
          transition={
            isActive
              ? {
                  duration: 0.5,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut" as const,
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
});

/**
 * Microphone Level Meter - Vertical level indicator
 */
export const MicLevelMeter = memo(function MicLevelMeter({
  level = 0,
  height = 80,
  width = 12,
  color,
  className = "",
}: {
  level?: number; // 0-1
  height?: number;
  width?: number;
  color?: string;
  className?: string;
}) {
  const { colors } = useTheme();
  const activeColor = color || colors.coral;
  const clampedLevel = Math.max(0, Math.min(1, level));

  return (
    <div
      className={`relative rounded-full overflow-hidden ${className}`}
      style={{
        width,
        height,
        backgroundColor: `${activeColor}20`,
      }}
    >
      <motion.div
        className="absolute bottom-0 left-0 right-0 rounded-full"
        style={{ backgroundColor: activeColor }}
        animate={{ height: `${clampedLevel * 100}%` }}
        transition={{ duration: 0.05 }}
      />
      {/* Peak indicator */}
      {clampedLevel > 0.8 && (
        <motion.div
          className="absolute top-1 left-1 right-1 h-1 rounded-full"
          style={{ backgroundColor: colors.error || "#FF4444" }}
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 0.3, repeat: Infinity }}
        />
      )}
    </div>
  );
});

/**
 * Circular Voice Visualizer - Ring-based visualization
 */
export const CircularVisualizer = memo(function CircularVisualizer({
  levels = [0.3, 0.5, 0.7, 0.6, 0.4, 0.5, 0.8, 0.4],
  size = 80,
  color,
  className = "",
  isActive = true,
}: {
  levels?: number[];
  size?: number;
  color?: string;
  className?: string;
  isActive?: boolean;
}) {
  const { colors } = useTheme();
  const activeColor = color || colors.coral;
  const ringCount = levels.length;

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      {levels.map((level, i) => {
        const angle = (i / ringCount) * 360;
        const distance = size * 0.35;
        const x = Math.cos((angle * Math.PI) / 180) * distance;
        const y = Math.sin((angle * Math.PI) / 180) * distance;
        const dotSize = 4 + level * 8;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: dotSize,
              height: dotSize,
              left: "50%",
              top: "50%",
              x: x - dotSize / 2,
              y: y - dotSize / 2,
              backgroundColor: activeColor,
            }}
            animate={
              isActive
                ? {
                    scale: [1, 1 + level * 0.5, 1],
                    opacity: [0.5, 1, 0.5],
                  }
                : { scale: 1, opacity: 0.3 }
            }
            transition={
              isActive
                ? {
                    duration: 0.4 + level * 0.3,
                    repeat: Infinity,
                    delay: i * 0.05,
                    ease: "easeInOut" as const,
                  }
                : { duration: 0.3 }
            }
          />
        );
      })}
      {/* Center dot */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 12,
          height: 12,
          left: "50%",
          top: "50%",
          x: -6,
          y: -6,
          backgroundColor: activeColor,
        }}
        animate={isActive ? { scale: [0.9, 1.1, 0.9] } : { scale: 1 }}
        transition={
          isActive
            ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" as const }
            : { duration: 0.3 }
        }
      />
    </div>
  );
});

export default LiveWaveform;
