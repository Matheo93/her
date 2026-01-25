"use client";

/**
 * Skeleton Components - Sprint 630
 *
 * Loading placeholder components:
 * - Basic skeleton
 * - Text skeleton
 * - Avatar skeleton
 * - Card skeleton
 * - List skeleton
 * - HER-themed styling
 */

import React, { memo, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  variant?: "rectangular" | "circular" | "rounded" | "text";
  animation?: "pulse" | "wave" | "none";
  className?: string;
}

/**
 * Base Skeleton
 */
export const Skeleton = memo(function Skeleton({
  width = "100%",
  height = 20,
  variant = "rectangular",
  animation = "pulse",
  className = "",
}: SkeletonProps) {
  const { colors } = useTheme();

  const borderRadius = {
    rectangular: "0",
    circular: "50%",
    rounded: "0.5rem",
    text: "0.25rem",
  };

  const baseStyle = {
    width,
    height,
    borderRadius: borderRadius[variant],
    backgroundColor: colors.cream,
    overflow: "hidden" as const,
  };

  if (animation === "none") {
    return <div className={className} style={baseStyle} />;
  }

  if (animation === "wave") {
    return (
      <div className={`relative ${className}`} style={baseStyle}>
        <motion.div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.warmWhite}80, transparent)`,
          }}
          animate={{
            x: ["-100%", "100%"],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>
    );
  }

  // Pulse animation
  return (
    <motion.div
      className={className}
      style={baseStyle}
      animate={{
        opacity: [1, 0.5, 1],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
});

/**
 * Text Skeleton (multiple lines)
 */
export const SkeletonText = memo(function SkeletonText({
  lines = 3,
  spacing = 8,
  lastLineWidth = "60%",
  animation = "pulse",
  className = "",
}: {
  lines?: number;
  spacing?: number;
  lastLineWidth?: number | string;
  animation?: "pulse" | "wave" | "none";
  className?: string;
}) {
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: spacing }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={16}
          width={index === lines - 1 ? lastLineWidth : "100%"}
          variant="text"
          animation={animation}
        />
      ))}
    </div>
  );
});

/**
 * Avatar Skeleton
 */
export const SkeletonAvatar = memo(function SkeletonAvatar({
  size = 40,
  animation = "pulse",
  className = "",
}: {
  size?: number;
  animation?: "pulse" | "wave" | "none";
  className?: string;
}) {
  return (
    <Skeleton
      width={size}
      height={size}
      variant="circular"
      animation={animation}
      className={className}
    />
  );
});

/**
 * Card Skeleton
 */
export const SkeletonCard = memo(function SkeletonCard({
  hasImage = true,
  imageHeight = 200,
  lines = 3,
  animation = "pulse",
  className = "",
}: {
  hasImage?: boolean;
  imageHeight?: number;
  lines?: number;
  animation?: "pulse" | "wave" | "none";
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${colors.cream}`,
      }}
    >
      {hasImage && (
        <Skeleton
          height={imageHeight}
          variant="rectangular"
          animation={animation}
        />
      )}
      <div className="p-4 space-y-3">
        <Skeleton height={24} width="70%" variant="text" animation={animation} />
        <SkeletonText lines={lines} animation={animation} />
      </div>
    </div>
  );
});

/**
 * List Item Skeleton
 */
export const SkeletonListItem = memo(function SkeletonListItem({
  hasAvatar = true,
  avatarSize = 40,
  lines = 2,
  animation = "pulse",
  className = "",
}: {
  hasAvatar?: boolean;
  avatarSize?: number;
  lines?: number;
  animation?: "pulse" | "wave" | "none";
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div
      className={`flex items-start gap-3 p-3 ${className}`}
      style={{ borderBottom: `1px solid ${colors.cream}` }}
    >
      {hasAvatar && <SkeletonAvatar size={avatarSize} animation={animation} />}
      <div className="flex-1 min-w-0">
        <Skeleton height={18} width="50%" variant="text" animation={animation} />
        <div className="mt-2">
          <SkeletonText lines={lines - 1} spacing={6} animation={animation} />
        </div>
      </div>
    </div>
  );
});

/**
 * List Skeleton
 */
export const SkeletonList = memo(function SkeletonList({
  count = 5,
  hasAvatar = true,
  animation = "pulse",
  className = "",
}: {
  count?: number;
  hasAvatar?: boolean;
  animation?: "pulse" | "wave" | "none";
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonListItem
          key={index}
          hasAvatar={hasAvatar}
          animation={animation}
        />
      ))}
    </div>
  );
});

/**
 * Table Skeleton
 */
export const SkeletonTable = memo(function SkeletonTable({
  rows = 5,
  columns = 4,
  hasHeader = true,
  animation = "pulse",
  className = "",
}: {
  rows?: number;
  columns?: number;
  hasHeader?: boolean;
  animation?: "pulse" | "wave" | "none";
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${colors.cream}`,
      }}
    >
      <table className="w-full">
        {hasHeader && (
          <thead>
            <tr style={{ backgroundColor: colors.cream }}>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <Skeleton height={16} width="60%" variant="text" animation={animation} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr
              key={rowIndex}
              style={{ borderBottom: `1px solid ${colors.cream}` }}
            >
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={colIndex} className="px-4 py-3">
                  <Skeleton
                    height={16}
                    width={colIndex === 0 ? "80%" : "50%"}
                    variant="text"
                    animation={animation}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

/**
 * Form Skeleton
 */
export const SkeletonForm = memo(function SkeletonForm({
  fields = 3,
  hasButton = true,
  animation = "pulse",
  className = "",
}: {
  fields?: number;
  hasButton?: boolean;
  animation?: "pulse" | "wave" | "none";
  className?: string;
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton height={14} width={100} variant="text" animation={animation} />
          <Skeleton height={40} variant="rounded" animation={animation} />
        </div>
      ))}
      {hasButton && (
        <div className="pt-2">
          <Skeleton height={44} width={120} variant="rounded" animation={animation} />
        </div>
      )}
    </div>
  );
});

/**
 * Stats Card Skeleton
 */
export const SkeletonStats = memo(function SkeletonStats({
  count = 4,
  animation = "pulse",
  className = "",
}: {
  count?: number;
  animation?: "pulse" | "wave" | "none";
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="p-4 rounded-xl"
          style={{
            backgroundColor: colors.warmWhite,
            border: `1px solid ${colors.cream}`,
          }}
        >
          <Skeleton height={14} width="60%" variant="text" animation={animation} />
          <div className="mt-2">
            <Skeleton height={32} width="40%" variant="text" animation={animation} />
          </div>
          <div className="mt-2">
            <Skeleton height={12} width="80%" variant="text" animation={animation} />
          </div>
        </div>
      ))}
    </div>
  );
});

/**
 * Profile Skeleton
 */
export const SkeletonProfile = memo(function SkeletonProfile({
  animation = "pulse",
  className = "",
}: {
  animation?: "pulse" | "wave" | "none";
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div
      className={`p-6 rounded-xl text-center ${className}`}
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${colors.cream}`,
      }}
    >
      <div className="flex justify-center">
        <SkeletonAvatar size={80} animation={animation} />
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex justify-center">
          <Skeleton height={20} width={150} variant="text" animation={animation} />
        </div>
        <div className="flex justify-center">
          <Skeleton height={14} width={100} variant="text" animation={animation} />
        </div>
      </div>
      <div className="flex justify-center gap-8 mt-6 pt-4" style={{ borderTop: `1px solid ${colors.cream}` }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="text-center">
            <Skeleton height={24} width={40} variant="text" animation={animation} />
            <div className="mt-1">
              <Skeleton height={12} width={50} variant="text" animation={animation} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Skeleton Wrapper
 */
export const SkeletonWrapper = memo(function SkeletonWrapper({
  isLoading,
  skeleton,
  children,
}: {
  isLoading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  return isLoading ? <>{skeleton}</> : <>{children}</>;
});

export default Skeleton;
