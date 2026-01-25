"use client";

/**
 * Progress Components - Sprint 626
 *
 * Progress indicator components:
 * - Linear progress bar
 * - Circular progress
 * - Step progress
 * - Countdown progress
 * - Indeterminate loading
 * - HER-themed styling
 */

import React, { memo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  labelPosition?: "inside" | "outside" | "top";
  size?: "sm" | "md" | "lg";
  color?: string;
  animated?: boolean;
  striped?: boolean;
  className?: string;
}

/**
 * Linear Progress Bar
 */
export const ProgressBar = memo(function ProgressBar({
  value,
  max = 100,
  showLabel = false,
  labelPosition = "outside",
  size = "md",
  color,
  animated = true,
  striped = false,
  className = "",
}: ProgressBarProps) {
  const { colors } = useTheme();
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const fillColor = color || colors.coral;

  const heights = {
    sm: "h-1",
    md: "h-2",
    lg: "h-4",
  };

  return (
    <div className={`w-full ${className}`}>
      {showLabel && labelPosition === "top" && (
        <div className="flex justify-between mb-1">
          <span
            className="text-sm font-medium"
            style={{ color: colors.textSecondary }}
          >
            Progression
          </span>
          <span
            className="text-sm font-medium"
            style={{ color: colors.textPrimary }}
          >
            {Math.round(percentage)}%
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div
          className={`flex-1 ${heights[size]} rounded-full overflow-hidden`}
          style={{ backgroundColor: colors.cream }}
        >
          <motion.div
            className={`h-full rounded-full relative ${
              striped
                ? "bg-gradient-to-r from-transparent via-white/20 to-transparent bg-[length:20px_20px]"
                : ""
            }`}
            style={{ backgroundColor: fillColor }}
            initial={animated ? { width: 0 } : false}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {showLabel && labelPosition === "inside" && size === "lg" && (
              <span
                className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white"
              >
                {Math.round(percentage)}%
              </span>
            )}
            {striped && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                style={{ backgroundSize: "20px 20px" }}
                animate={{ backgroundPositionX: ["0px", "20px"] }}
                transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
              />
            )}
          </motion.div>
        </div>

        {showLabel && labelPosition === "outside" && (
          <span
            className="text-sm font-medium min-w-[40px] text-right"
            style={{ color: colors.textPrimary }}
          >
            {Math.round(percentage)}%
          </span>
        )}
      </div>
    </div>
  );
});

/**
 * Circular Progress
 */
export const CircularProgress = memo(function CircularProgress({
  value,
  max = 100,
  size = 64,
  strokeWidth = 4,
  showLabel = true,
  color,
  animated = true,
  className = "",
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  color?: string;
  animated?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const fillColor = color || colors.coral;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.cream}
          strokeWidth={strokeWidth}
        />

        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={animated ? { strokeDashoffset: circumference } : false}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </svg>

      {showLabel && (
        <span
          className="absolute text-sm font-medium"
          style={{ color: colors.textPrimary }}
        >
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
});

/**
 * Indeterminate Progress (Loading)
 */
export const IndeterminateProgress = memo(function IndeterminateProgress({
  type = "bar",
  size = "md",
  color,
  className = "",
}: {
  type?: "bar" | "circular" | "dots";
  size?: "sm" | "md" | "lg";
  color?: string;
  className?: string;
}) {
  const { colors } = useTheme();
  const fillColor = color || colors.coral;

  const heights = {
    sm: "h-1",
    md: "h-2",
    lg: "h-4",
  };

  const circularSizes = {
    sm: 24,
    md: 40,
    lg: 64,
  };

  const dotSizes = {
    sm: 6,
    md: 8,
    lg: 12,
  };

  if (type === "dots") {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: dotSizes[size],
              height: dotSizes[size],
              backgroundColor: fillColor,
            }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
    );
  }

  if (type === "circular") {
    const circSize = circularSizes[size];
    const strokeWidth = size === "sm" ? 2 : size === "md" ? 3 : 4;
    const radius = (circSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    return (
      <div
        className={`relative inline-flex ${className}`}
        style={{ width: circSize, height: circSize }}
      >
        <motion.svg
          width={circSize}
          height={circSize}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <circle
            cx={circSize / 2}
            cy={circSize / 2}
            r={radius}
            fill="none"
            stroke={colors.cream}
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx={circSize / 2}
            cy={circSize / 2}
            r={radius}
            fill="none"
            stroke={fillColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * 0.75}
          />
        </motion.svg>
      </div>
    );
  }

  // Bar type
  return (
    <div
      className={`w-full ${heights[size]} rounded-full overflow-hidden ${className}`}
      style={{ backgroundColor: colors.cream }}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: fillColor, width: "30%" }}
        animate={{
          x: ["0%", "233%", "0%"],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
});

/**
 * Progress with Steps
 */
export const StepProgress = memo(function StepProgress({
  currentStep,
  totalSteps,
  labels,
  showLabels = true,
  color,
  className = "",
}: {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
  showLabels?: boolean;
  color?: string;
  className?: string;
}) {
  const { colors } = useTheme();
  const fillColor = color || colors.coral;
  const percentage = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className={`w-full ${className}`}>
      <div className="relative">
        {/* Background line */}
        <div
          className="absolute top-4 left-0 right-0 h-0.5"
          style={{ backgroundColor: colors.cream }}
        />

        {/* Progress line */}
        <motion.div
          className="absolute top-4 left-0 h-0.5"
          style={{ backgroundColor: fillColor }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.3 }}
        />

        {/* Steps */}
        <div className="relative flex justify-between">
          {Array.from({ length: totalSteps }).map((_, index) => {
            const stepNumber = index + 1;
            const isCompleted = stepNumber < currentStep;
            const isCurrent = stepNumber === currentStep;

            return (
              <div key={index} className="flex flex-col items-center">
                <motion.div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm"
                  style={{
                    backgroundColor: isCompleted || isCurrent ? fillColor : colors.cream,
                    color: isCompleted || isCurrent ? "white" : colors.textMuted,
                  }}
                  animate={{
                    scale: isCurrent ? 1.1 : 1,
                  }}
                >
                  {isCompleted ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    stepNumber
                  )}
                </motion.div>

                {showLabels && labels && labels[index] && (
                  <span
                    className="mt-2 text-xs text-center max-w-[80px]"
                    style={{
                      color: isCurrent ? fillColor : colors.textMuted,
                      fontWeight: isCurrent ? 600 : 400,
                    }}
                  >
                    {labels[index]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

/**
 * Countdown Progress
 */
export const CountdownProgress = memo(function CountdownProgress({
  duration,
  onComplete,
  autoStart = true,
  showTime = true,
  color,
  className = "",
}: {
  duration: number;
  onComplete?: () => void;
  autoStart?: boolean;
  showTime?: boolean;
  color?: string;
  className?: string;
}) {
  const { colors } = useTheme();
  const [remaining, setRemaining] = useState(duration);
  const [isRunning, setIsRunning] = useState(autoStart);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fillColor = color || colors.coral;

  useEffect(() => {
    if (isRunning && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            onComplete?.();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, remaining, onComplete]);

  const percentage = (remaining / duration) * 100;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center gap-3">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: colors.cream }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: fillColor }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {showTime && (
          <span
            className="text-sm font-mono min-w-[40px]"
            style={{ color: colors.textPrimary }}
          >
            {formatTime(remaining)}
          </span>
        )}
      </div>

      <div className="flex gap-2 mt-2">
        <motion.button
          type="button"
          className="px-3 py-1 rounded text-xs font-medium"
          style={{
            backgroundColor: colors.cream,
            color: colors.textPrimary,
          }}
          onClick={() => setIsRunning(!isRunning)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {isRunning ? "Pause" : "Reprendre"}
        </motion.button>

        <motion.button
          type="button"
          className="px-3 py-1 rounded text-xs font-medium"
          style={{
            backgroundColor: colors.cream,
            color: colors.textPrimary,
          }}
          onClick={() => {
            setRemaining(duration);
            setIsRunning(false);
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Réinitialiser
        </motion.button>
      </div>
    </div>
  );
});

/**
 * Multi-segment Progress Bar
 */
export const SegmentedProgress = memo(function SegmentedProgress({
  segments,
  showLabels = true,
  className = "",
}: {
  segments: Array<{
    value: number;
    color: string;
    label?: string;
  }>;
  showLabels?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className={`w-full ${className}`}>
      <div
        className="h-4 rounded-full overflow-hidden flex"
        style={{ backgroundColor: colors.cream }}
      >
        {segments.map((segment, index) => {
          const width = (segment.value / total) * 100;

          return (
            <motion.div
              key={index}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ backgroundColor: segment.color }}
              initial={{ width: 0 }}
              animate={{ width: `${width}%` }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            />
          );
        })}
      </div>

      {showLabels && (
        <div className="flex gap-4 mt-2">
          {segments.map((segment, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: segment.color }}
              />
              <span
                className="text-xs"
                style={{ color: colors.textSecondary }}
              >
                {segment.label || `${Math.round((segment.value / total) * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

/**
 * Upload Progress
 */
export const UploadProgress = memo(function UploadProgress({
  fileName,
  progress,
  status = "uploading",
  onCancel,
  className = "",
}: {
  fileName: string;
  progress: number;
  status?: "uploading" | "completed" | "error";
  onCancel?: () => void;
  className?: string;
}) {
  const { colors } = useTheme();

  const statusColors = {
    uploading: colors.coral,
    completed: colors.success || "#7A9E7E",
    error: colors.error || "#FF4444",
  };

  return (
    <div
      className={`p-3 rounded-xl ${className}`}
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${colors.cream}`,
      }}
    >
      <div className="flex items-center gap-3">
        {/* File icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: colors.cream }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.textMuted}
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium truncate"
            style={{ color: colors.textPrimary }}
          >
            {fileName}
          </p>
          <div className="mt-1.5">
            <ProgressBar
              value={progress}
              size="sm"
              color={statusColors[status]}
              animated={status === "uploading"}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0">
          {status === "uploading" && onCancel && (
            <motion.button
              type="button"
              className="p-1 rounded"
              style={{ color: colors.textMuted }}
              onClick={onCancel}
              whileHover={{ color: colors.error || "#FF4444" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </motion.button>
          )}

          {status === "completed" && (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={statusColors.completed}
              strokeWidth="2"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}

          {status === "error" && (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={statusColors.error}
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
});

export default ProgressBar;
