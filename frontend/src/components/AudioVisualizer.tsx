"use client";

/**
 * Audio Visualizer Components - Sprint 804
 *
 * Audio visualization effects:
 * - Waveform display
 * - Frequency bars
 * - Circular visualizer
 * - Oscilloscope
 * - VU meter
 * - HER-themed styling
 */

import React, {
  memo,
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface WaveformVisualizerProps {
  audioData?: Float32Array | null;
  width?: number;
  height?: number;
  color?: string;
  lineWidth?: number;
  className?: string;
  smoothing?: number;
}

/**
 * Waveform Visualizer - Display audio waveform
 */
export const WaveformVisualizer = memo(function WaveformVisualizer({
  audioData,
  width = 400,
  height = 100,
  color,
  lineWidth = 2,
  className = "",
  smoothing = 0.8,
}: WaveformVisualizerProps) {
  const { colors } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeColor = color || colors.coral;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();

    if (!audioData || audioData.length === 0) {
      // Draw flat line when no audio
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
    } else {
      const sliceWidth = width / audioData.length;
      let x = 0;

      for (let i = 0; i < audioData.length; i++) {
        const v = audioData[i] * smoothing;
        const y = (v + 1) / 2 * height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }
    }

    ctx.stroke();
  }, [audioData, width, height, strokeColor, lineWidth, smoothing]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ backgroundColor: "transparent" }}
    />
  );
});

interface FrequencyBarsProps {
  frequencyData?: Uint8Array | null;
  barCount?: number;
  width?: number;
  height?: number;
  barColor?: string;
  barWidth?: number;
  gap?: number;
  className?: string;
  rounded?: boolean;
}

/**
 * Frequency Bars - Vertical bar frequency visualizer
 */
export const FrequencyBars = memo(function FrequencyBars({
  frequencyData,
  barCount = 32,
  width = 400,
  height = 100,
  barColor,
  barWidth,
  gap = 2,
  className = "",
  rounded = true,
}: FrequencyBarsProps) {
  const { colors } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fillColor = barColor || colors.coral;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const calculatedBarWidth = barWidth || (width - (barCount - 1) * gap) / barCount;

    if (!frequencyData || frequencyData.length === 0) {
      // Draw minimal bars when no audio
      for (let i = 0; i < barCount; i++) {
        const x = i * (calculatedBarWidth + gap);
        const barHeight = 4;
        const y = height - barHeight;

        ctx.fillStyle = fillColor + "40";

        if (rounded) {
          const radius = Math.min(calculatedBarWidth / 2, barHeight / 2);
          ctx.beginPath();
          ctx.roundRect(x, y, calculatedBarWidth, barHeight, radius);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, calculatedBarWidth, barHeight);
        }
      }
      return;
    }

    // Sample frequency data to match bar count
    const step = Math.floor(frequencyData.length / barCount);

    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.min(i * step, frequencyData.length - 1);
      const value = frequencyData[dataIndex] / 255;
      const barHeight = Math.max(4, value * height);
      const x = i * (calculatedBarWidth + gap);
      const y = height - barHeight;

      // Create gradient based on height
      const gradient = ctx.createLinearGradient(x, height, x, y);
      gradient.addColorStop(0, fillColor);
      gradient.addColorStop(1, fillColor + "80");

      ctx.fillStyle = gradient;

      if (rounded) {
        const radius = Math.min(calculatedBarWidth / 2, 4);
        ctx.beginPath();
        ctx.roundRect(x, y, calculatedBarWidth, barHeight, [radius, radius, 0, 0]);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, calculatedBarWidth, barHeight);
      }
    }
  }, [frequencyData, barCount, width, height, fillColor, barWidth, gap, rounded]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ backgroundColor: "transparent" }}
    />
  );
});

interface CircularVisualizerProps {
  frequencyData?: Uint8Array | null;
  size?: number;
  barCount?: number;
  innerRadius?: number;
  color?: string;
  className?: string;
  rotate?: boolean;
}

/**
 * Circular Visualizer - Radial frequency display
 */
export const CircularVisualizer = memo(function CircularVisualizer({
  frequencyData,
  size = 200,
  barCount = 64,
  innerRadius = 40,
  color,
  className = "",
  rotate = false,
}: CircularVisualizerProps) {
  const { colors } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const animationRef = useRef<number>(0);
  const fillColor = color || colors.coral;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const centerX = size / 2;
    const centerY = size / 2;
    const maxBarLength = (size / 2) - innerRadius - 10;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      ctx.save();
      ctx.translate(centerX, centerY);

      if (rotate) {
        rotationRef.current += 0.005;
        ctx.rotate(rotationRef.current);
      }

      const step = frequencyData ? Math.floor(frequencyData.length / barCount) : 1;
      const angleStep = (Math.PI * 2) / barCount;

      for (let i = 0; i < barCount; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const value = frequencyData ? frequencyData[Math.min(i * step, frequencyData.length - 1)] / 255 : 0.1;
        const barLength = Math.max(4, value * maxBarLength);

        const x1 = Math.cos(angle) * innerRadius;
        const y1 = Math.sin(angle) * innerRadius;
        const x2 = Math.cos(angle) * (innerRadius + barLength);
        const y2 = Math.sin(angle) * (innerRadius + barLength);

        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, fillColor + "60");
        gradient.addColorStop(1, fillColor);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      ctx.restore();

      if (rotate) {
        animationRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [frequencyData, size, barCount, innerRadius, fillColor, rotate]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{ backgroundColor: "transparent" }}
    />
  );
});

interface OscilloscopeProps {
  audioData?: Float32Array | null;
  width?: number;
  height?: number;
  color?: string;
  lineWidth?: number;
  className?: string;
  gridLines?: boolean;
  gridColor?: string;
}

/**
 * Oscilloscope - Classic oscilloscope display
 */
export const Oscilloscope = memo(function Oscilloscope({
  audioData,
  width = 400,
  height = 150,
  color,
  lineWidth = 2,
  className = "",
  gridLines = true,
  gridColor = "rgba(255, 255, 255, 0.1)",
}: OscilloscopeProps) {
  const { colors } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeColor = color || colors.coral;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and draw background
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    if (gridLines) {
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;

      // Vertical lines
      for (let x = 0; x <= width; x += width / 10) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal lines
      for (let y = 0; y <= height; y += height / 6) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center line (brighter)
      ctx.strokeStyle = gridColor.replace("0.1", "0.3");
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }

    // Draw waveform with glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = strokeColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();

    if (!audioData || audioData.length === 0) {
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
    } else {
      const sliceWidth = width / audioData.length;
      let x = 0;

      for (let i = 0; i < audioData.length; i++) {
        const y = ((audioData[i] + 1) / 2) * height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [audioData, width, height, strokeColor, lineWidth, gridLines, gridColor]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={"rounded-lg " + className}
      style={{ backgroundColor: "transparent" }}
    />
  );
});

interface VUMeterProps {
  level?: number;
  peakLevel?: number;
  width?: number;
  height?: number;
  orientation?: "horizontal" | "vertical";
  color?: string;
  peakColor?: string;
  backgroundColor?: string;
  className?: string;
  showPeak?: boolean;
  segments?: number;
}

/**
 * VU Meter - Volume unit meter
 */
export const VUMeter = memo(function VUMeter({
  level = 0,
  peakLevel,
  width = 200,
  height = 20,
  orientation = "horizontal",
  color,
  peakColor = "#FF4444",
  backgroundColor = "rgba(255, 255, 255, 0.1)",
  className = "",
  showPeak = true,
  segments = 20,
}: VUMeterProps) {
  const { colors } = useTheme();
  const fillColor = color || colors.coral;
  const [currentPeak, setCurrentPeak] = useState(peakLevel ?? level);

  useEffect(() => {
    const newLevel = peakLevel ?? level;
    if (newLevel > currentPeak) {
      setCurrentPeak(newLevel);
    } else {
      // Decay peak
      const decay = setInterval(() => {
        setCurrentPeak((prev) => Math.max(newLevel, prev - 0.02));
      }, 50);
      return () => clearInterval(decay);
    }
  }, [level, peakLevel, currentPeak]);

  const isHorizontal = orientation === "horizontal";
  const containerStyle = {
    width: isHorizontal ? width : height,
    height: isHorizontal ? height : width,
    backgroundColor,
    borderRadius: 4,
    overflow: "hidden" as const,
    display: "flex",
    flexDirection: (isHorizontal ? "row" : "column-reverse") as "row" | "column-reverse",
    gap: 2,
    padding: 2,
  };

  const segmentWidth = isHorizontal
    ? (width - (segments + 1) * 2) / segments
    : height - 4;
  const segmentHeight = isHorizontal
    ? height - 4
    : (width - (segments + 1) * 2) / segments;

  const activeSegments = Math.floor(level * segments);
  const peakSegment = Math.floor(currentPeak * segments);

  return (
    <div className={className} style={containerStyle}>
      {Array.from({ length: segments }).map((_, i) => {
        const isActive = i < activeSegments;
        const isPeak = showPeak && i === peakSegment && peakSegment > activeSegments;
        const intensity = i / segments;

        let segmentColor = backgroundColor;
        if (isActive) {
          if (intensity > 0.85) {
            segmentColor = "#FF4444";
          } else if (intensity > 0.7) {
            segmentColor = "#FFAA44";
          } else {
            segmentColor = fillColor;
          }
        } else if (isPeak) {
          segmentColor = peakColor;
        }

        return (
          <motion.div
            key={i}
            style={{
              width: segmentWidth,
              height: segmentHeight,
              backgroundColor: segmentColor,
              borderRadius: 2,
            }}
            animate={{
              opacity: isActive || isPeak ? 1 : 0.3,
            }}
            transition={{ duration: 0.05 }}
          />
        );
      })}
    </div>
  );
});

interface StereoMeterProps {
  leftLevel?: number;
  rightLevel?: number;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

/**
 * Stereo Meter - Left/Right audio level display
 */
export const StereoMeter = memo(function StereoMeter({
  leftLevel = 0,
  rightLevel = 0,
  width = 200,
  height = 40,
  color,
  className = "",
}: StereoMeterProps) {
  const { colors } = useTheme();
  const fillColor = color || colors.coral;

  return (
    <div className={"flex flex-col gap-1 " + className} style={{ width }}>
      <div className="flex items-center gap-2">
        <span className="text-xs w-4" style={{ color: colors.textSecondary }}>L</span>
        <VUMeter
          level={leftLevel}
          width={width - 24}
          height={height / 2 - 4}
          color={fillColor}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs w-4" style={{ color: colors.textSecondary }}>R</span>
        <VUMeter
          level={rightLevel}
          width={width - 24}
          height={height / 2 - 4}
          color={fillColor}
        />
      </div>
    </div>
  );
});

interface SpectrumAnalyzerProps {
  frequencyData?: Uint8Array | null;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
  smoothing?: number;
  logScale?: boolean;
}

/**
 * Spectrum Analyzer - Frequency spectrum display
 */
export const SpectrumAnalyzer = memo(function SpectrumAnalyzer({
  frequencyData,
  width = 400,
  height = 150,
  color,
  className = "",
  smoothing = 0.7,
  logScale = true,
}: SpectrumAnalyzerProps) {
  const { colors } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevDataRef = useRef<number[]>([]);
  const fillColor = color || colors.coral;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (!frequencyData || frequencyData.length === 0) {
      // Draw flat line
      ctx.fillStyle = fillColor + "20";
      ctx.fillRect(0, height - 4, width, 4);
      return;
    }

    // Initialize prev data if needed
    if (prevDataRef.current.length !== frequencyData.length) {
      prevDataRef.current = Array.from(frequencyData).map((v) => v);
    }

    // Apply smoothing
    const smoothedData = Array.from(frequencyData).map((v, i) => {
      const prev = prevDataRef.current[i] || v;
      const smoothed = prev * smoothing + v * (1 - smoothing);
      prevDataRef.current[i] = smoothed;
      return smoothed;
    });

    // Create gradient
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, fillColor + "40");
    gradient.addColorStop(0.5, fillColor + "80");
    gradient.addColorStop(1, fillColor);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, height);

    const dataPoints = Math.min(smoothedData.length, width);

    for (let i = 0; i < dataPoints; i++) {
      let x: number;
      let dataIndex: number;

      if (logScale) {
        // Logarithmic scale for frequency axis
        const logIndex = Math.pow(i / dataPoints, 2) * smoothedData.length;
        dataIndex = Math.floor(logIndex);
        x = (i / dataPoints) * width;
      } else {
        dataIndex = Math.floor((i / dataPoints) * smoothedData.length);
        x = (i / dataPoints) * width;
      }

      const value = smoothedData[Math.min(dataIndex, smoothedData.length - 1)] / 255;
      const y = height - value * height;

      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        // Smooth curve
        const prevX = ((i - 1) / dataPoints) * width;
        const prevDataIndex = logScale
          ? Math.floor(Math.pow((i - 1) / dataPoints, 2) * smoothedData.length)
          : Math.floor(((i - 1) / dataPoints) * smoothedData.length);
        const prevValue = smoothedData[Math.min(prevDataIndex, smoothedData.length - 1)] / 255;
        const prevY = height - prevValue * height;

        const cpX = (prevX + x) / 2;
        ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + y) / 2);
      }
    }

    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Draw outline
    ctx.strokeStyle = fillColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [frequencyData, width, height, fillColor, smoothing, logScale]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ backgroundColor: "transparent" }}
    />
  );
});

interface AudioPulseProps {
  level?: number;
  size?: number;
  color?: string;
  className?: string;
  rings?: number;
}

/**
 * Audio Pulse - Pulsing circle based on audio level
 */
export const AudioPulse = memo(function AudioPulse({
  level = 0,
  size = 100,
  color,
  className = "",
  rings = 3,
}: AudioPulseProps) {
  const { colors } = useTheme();
  const fillColor = color || colors.coral;
  const scale = useMotionValue(1);
  const smoothScale = useSpring(scale, { stiffness: 300, damping: 30 });

  useEffect(() => {
    scale.set(1 + level * 0.5);
  }, [level, scale]);

  return (
    <div
      className={"relative flex items-center justify-center " + className}
      style={{ width: size, height: size }}
    >
      {/* Outer rings */}
      {Array.from({ length: rings }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: size * (0.6 + i * 0.2),
            height: size * (0.6 + i * 0.2),
            border: "2px solid " + fillColor,
            opacity: 0.3 - i * 0.1,
            scale: smoothScale,
          }}
        />
      ))}

      {/* Center circle */}
      <motion.div
        className="rounded-full"
        style={{
          width: size * 0.4,
          height: size * 0.4,
          backgroundColor: fillColor,
          scale: smoothScale,
          boxShadow: "0 0 " + (20 + level * 30) + "px " + fillColor + "80",
        }}
      />
    </div>
  );
});

interface WaveformBarProps {
  values?: number[];
  width?: number;
  height?: number;
  barColor?: string;
  className?: string;
  animated?: boolean;
}

/**
 * Waveform Bar - Animated bar waveform
 */
export const WaveformBar = memo(function WaveformBar({
  values,
  width = 200,
  height = 40,
  barColor,
  className = "",
  animated = true,
}: WaveformBarProps) {
  const { colors } = useTheme();
  const fillColor = barColor || colors.coral;
  const barCount = values?.length || 20;

  const defaultValues = useMemo(() => {
    return Array.from({ length: 20 }).map(() => 0.3 + Math.random() * 0.4);
  }, []);

  const displayValues = values || defaultValues;
  const barWidth = (width - (barCount - 1) * 2) / barCount;

  return (
    <div
      className={"flex items-center gap-0.5 " + className}
      style={{ width, height }}
    >
      {displayValues.map((value, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: barWidth,
            backgroundColor: fillColor,
          }}
          animate={
            animated
              ? {
                  height: [
                    value * height,
                    (value * 0.5 + Math.random() * 0.5) * height,
                    value * height,
                  ],
                }
              : { height: value * height }
          }
          transition={
            animated
              ? {
                  duration: 0.5 + Math.random() * 0.5,
                  repeat: Infinity,
                  delay: i * 0.05,
                }
              : undefined
          }
        />
      ))}
    </div>
  );
});

interface SpeakingIndicatorProps {
  isSpeaking?: boolean;
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Speaking Indicator - Voice activity indicator
 */
export const SpeakingIndicator = memo(function SpeakingIndicator({
  isSpeaking = false,
  size = 24,
  color,
  className = "",
}: SpeakingIndicatorProps) {
  const { colors } = useTheme();
  const fillColor = color || colors.coral;

  const bars = [0.4, 0.7, 1, 0.7, 0.4];

  return (
    <div
      className={"flex items-center justify-center gap-1 " + className}
      style={{ width: size, height: size }}
    >
      {bars.map((maxHeight, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: size / 8,
            backgroundColor: fillColor,
          }}
          animate={
            isSpeaking
              ? {
                  height: [size * 0.2, size * maxHeight, size * 0.2],
                }
              : { height: size * 0.2 }
          }
          transition={
            isSpeaking
              ? {
                  duration: 0.4,
                  repeat: Infinity,
                  delay: i * 0.1,
                }
              : { duration: 0.2 }
          }
        />
      ))}
    </div>
  );
});

export default WaveformVisualizer;
