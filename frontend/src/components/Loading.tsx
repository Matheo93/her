"use client";

/**
 * Loading Components - Sprint 596
 *
 * Collection of loading states:
 * - Spinner variants
 * - Skeleton loaders
 * - Progress indicators
 * - HER-themed styling
 */

import React, { memo } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface LoadingProps {
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Color override */
  color?: string;
  /** Additional class names */
  className?: string;
}

/**
 * Get size values
 */
function getSize(size: "sm" | "md" | "lg") {
  switch (size) {
    case "sm":
      return { spinner: 16, ring: 2, dots: 4 };
    case "lg":
      return { spinner: 48, ring: 4, dots: 8 };
    case "md":
    default:
      return { spinner: 32, ring: 3, dots: 6 };
  }
}

/**
 * Classic Spinner
 */
export const Spinner = memo(function Spinner({
  size = "md",
  color,
  className = "",
}: LoadingProps) {
  const { colors } = useTheme();
  const sizes = getSize(size);
  const activeColor = color || colors.coral;

  return (
    <motion.div
      className={`relative ${className}`}
      style={{ width: sizes.spinner, height: sizes.spinner }}
      animate={{ rotate: 360 }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: "linear",
      }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          border: `${sizes.ring}px solid ${activeColor}20`,
        }}
      />
      <div
        className="absolute inset-0 rounded-full"
        style={{
          border: `${sizes.ring}px solid transparent`,
          borderTopColor: activeColor,
        }}
      />
    </motion.div>
  );
});

/**
 * Bouncing Dots
 */
export const DotsLoader = memo(function DotsLoader({
  size = "md",
  color,
  className = "",
}: LoadingProps) {
  const { colors } = useTheme();
  const sizes = getSize(size);
  const activeColor = color || colors.coral;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: sizes.dots,
            height: sizes.dots,
            backgroundColor: activeColor,
          }}
          animate={{
            y: [0, -sizes.dots, 0],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut" as const,
          }}
        />
      ))}
    </div>
  );
});

/**
 * Pulse Loader
 */
export const PulseLoader = memo(function PulseLoader({
  size = "md",
  color,
  className = "",
}: LoadingProps) {
  const { colors } = useTheme();
  const sizes = getSize(size);
  const activeColor = color || colors.coral;

  return (
    <div
      className={`relative ${className}`}
      style={{ width: sizes.spinner, height: sizes.spinner }}
    >
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: activeColor }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.5, 0, 0.5],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeOut" as const,
          }}
        />
      ))}
      <div
        className="absolute rounded-full"
        style={{
          width: sizes.dots * 2,
          height: sizes.dots * 2,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: activeColor,
        }}
      />
    </div>
  );
});

/**
 * Bar Progress
 */
export const ProgressBar = memo(function ProgressBar({
  progress,
  color,
  showLabel = false,
  className = "",
}: {
  progress: number;
  color?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const activeColor = color || colors.coral;
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className={`w-full ${className}`}>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: `${activeColor}20` }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: activeColor }}
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ duration: 0.3, ease: "easeOut" as const }}
        />
      </div>
      {showLabel && (
        <div
          className="text-xs text-right mt-1"
          style={{ color: colors.textMuted }}
        >
          {Math.round(clampedProgress)}%
        </div>
      )}
    </div>
  );
});

/**
 * Skeleton Box
 */
export const Skeleton = memo(function Skeleton({
  width,
  height,
  rounded = "md",
  className = "",
}: {
  width?: number | string;
  height?: number | string;
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  className?: string;
}) {
  const { colors } = useTheme();

  const roundedClasses = {
    none: "",
    sm: "rounded",
    md: "rounded-lg",
    lg: "rounded-xl",
    full: "rounded-full",
  };

  return (
    <motion.div
      className={`${roundedClasses[rounded]} ${className}`}
      style={{
        width: width || "100%",
        height: height || 16,
        backgroundColor: colors.cream,
      }}
      animate={{
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut" as const,
      }}
    />
  );
});

/**
 * Skeleton Text Lines
 */
export const SkeletonText = memo(function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <motion.div
          key={i}
          className="h-3 rounded"
          style={{
            width: i === lines - 1 ? "60%" : "100%",
            backgroundColor: colors.cream,
          }}
          animate={{
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut" as const,
          }}
        />
      ))}
    </div>
  );
});

/**
 * Skeleton Avatar
 */
export const SkeletonAvatar = memo(function SkeletonAvatar({
  size = 48,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <motion.div
      className={`rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: colors.cream,
      }}
      animate={{
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut" as const,
      }}
    />
  );
});

/**
 * Skeleton Card
 */
export const SkeletonCard = memo(function SkeletonCard({
  className = "",
}: {
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div
      className={`p-4 rounded-xl ${className}`}
      style={{ backgroundColor: colors.warmWhite }}
    >
      <div className="flex items-center gap-3 mb-3">
        <SkeletonAvatar size={40} />
        <div className="flex-1">
          <Skeleton height={12} width="50%" className="mb-2" />
          <Skeleton height={10} width="30%" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
});

/**
 * Full Page Loader
 */
export const PageLoader = memo(function PageLoader({
  message = "Chargement...",
}: {
  message?: string;
}) {
  const { colors } = useTheme();

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-opacity-90 z-50"
      style={{ backgroundColor: colors.warmWhite }}
    >
      <PulseLoader size="lg" />
      <motion.p
        className="mt-4 text-sm"
        style={{ color: colors.textSecondary }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {message}
      </motion.p>
    </div>
  );
});

/**
 * Inline Loader with text
 */
export const InlineLoader = memo(function InlineLoader({
  message,
  size = "sm",
  className = "",
}: {
  message?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Spinner size={size} />
      {message && (
        <span
          className="text-sm"
          style={{ color: colors.textSecondary }}
        >
          {message}
        </span>
      )}
    </div>
  );
});

export default Spinner;
