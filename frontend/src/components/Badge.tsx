"use client";

/**
 * Badge/Chip Components - Sprint 608
 *
 * Status indicators and labels:
 * - Badge: simple status indicator
 * - Chip: removable tag
 * - StatusDot: colored dot indicator
 * - Counter: number badge
 * - HER-themed styling
 */

import React, { memo, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";
type BadgeSize = "sm" | "md" | "lg";

interface BadgeProps {
  /** Badge content */
  children: ReactNode;
  /** Visual variant */
  variant?: BadgeVariant;
  /** Size variant */
  size?: BadgeSize;
  /** Optional icon */
  icon?: ReactNode;
  /** Whether badge is outlined */
  outlined?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Get variant colors
 */
function getVariantColors(variant: BadgeVariant, colors: any) {
  switch (variant) {
    case "success":
      return {
        bg: colors.success || "#7A9E7E",
        text: "white",
      };
    case "warning":
      return {
        bg: colors.warning || "#FF9800",
        text: "white",
      };
    case "error":
      return {
        bg: colors.error || "#FF4444",
        text: "white",
      };
    case "info":
      return {
        bg: colors.coral,
        text: "white",
      };
    case "default":
    default:
      return {
        bg: colors.cream,
        text: colors.textPrimary,
      };
  }
}

/**
 * Get size classes
 */
function getSizeClasses(size: BadgeSize) {
  switch (size) {
    case "sm":
      return "px-1.5 py-0.5 text-[10px]";
    case "lg":
      return "px-3 py-1.5 text-sm";
    case "md":
    default:
      return "px-2 py-1 text-xs";
  }
}

/**
 * Simple Badge
 */
export const Badge = memo(function Badge({
  children,
  variant = "default",
  size = "md",
  icon,
  outlined = false,
  className = "",
}: BadgeProps) {
  const { colors } = useTheme();
  const variantColors = getVariantColors(variant, colors);
  const sizeClasses = getSizeClasses(size);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses} ${className}`}
      style={{
        backgroundColor: outlined ? "transparent" : variantColors.bg,
        color: outlined ? variantColors.bg : variantColors.text,
        border: outlined ? `1px solid ${variantColors.bg}` : "none",
      }}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
});

/**
 * Chip - Removable tag
 */
export const Chip = memo(function Chip({
  children,
  onRemove,
  variant = "default",
  size = "md",
  icon,
  className = "",
}: {
  children: ReactNode;
  onRemove?: () => void;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();
  const variantColors = getVariantColors(variant, colors);
  const sizeClasses = getSizeClasses(size);

  return (
    <motion.span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses} ${className}`}
      style={{
        backgroundColor: `${variantColors.bg}20`,
        color: variantColors.bg === colors.cream ? colors.textPrimary : variantColors.bg,
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      layout
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
      {onRemove && (
        <motion.button
          className="ml-1 rounded-full hover:bg-black/10 p-0.5"
          onClick={onRemove}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
          aria-label="Supprimer"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </motion.button>
      )}
    </motion.span>
  );
});

/**
 * Status Dot - Simple colored indicator
 */
export const StatusDot = memo(function StatusDot({
  status = "default",
  size = "md",
  pulse = false,
  label,
  className = "",
}: {
  status?: BadgeVariant | "online" | "offline" | "busy";
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  label?: string;
  className?: string;
}) {
  const { colors } = useTheme();

  const statusColors: Record<string, string> = {
    default: colors.textMuted || "#999",
    success: colors.success || "#7A9E7E",
    warning: colors.warning || "#FF9800",
    error: colors.error || "#FF4444",
    info: colors.coral,
    online: colors.success || "#7A9E7E",
    offline: colors.textMuted || "#999",
    busy: colors.warning || "#FF9800",
  };

  const sizes = {
    sm: 6,
    md: 8,
    lg: 10,
  };

  const dotSize = sizes[size];
  const color = statusColors[status] || statusColors.default;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative">
        <span
          className="block rounded-full"
          style={{
            width: dotSize,
            height: dotSize,
            backgroundColor: color,
          }}
        />
        {pulse && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: color }}
            animate={{ scale: [1, 1.8], opacity: [0.8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </span>
      {label && (
        <span
          className="text-sm"
          style={{ color: colors.textSecondary }}
        >
          {label}
        </span>
      )}
    </span>
  );
});

/**
 * Counter Badge - Number indicator
 */
export const Counter = memo(function Counter({
  count,
  max = 99,
  variant = "error",
  size = "sm",
  className = "",
}: {
  count: number;
  max?: number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}) {
  const { colors } = useTheme();
  const variantColors = getVariantColors(variant, colors);

  if (count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count.toString();

  const sizes = {
    sm: "min-w-[16px] h-4 text-[10px] px-1",
    md: "min-w-[20px] h-5 text-xs px-1.5",
    lg: "min-w-[24px] h-6 text-sm px-2",
  };

  return (
    <motion.span
      className={`inline-flex items-center justify-center rounded-full font-bold ${sizes[size]} ${className}`}
      style={{
        backgroundColor: variantColors.bg,
        color: variantColors.text,
      }}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 25 }}
    >
      {displayCount}
    </motion.span>
  );
});

/**
 * Badge with Dot - Badge with status dot
 */
export const BadgeWithDot = memo(function BadgeWithDot({
  children,
  dotStatus = "default",
  className = "",
}: {
  children: ReactNode;
  dotStatus?: BadgeVariant;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium ${className}`}
      style={{
        backgroundColor: colors.cream,
        color: colors.textPrimary,
      }}
    >
      <StatusDot status={dotStatus} size="sm" />
      {children}
    </span>
  );
});

/**
 * Icon Badge - Badge attached to icon/avatar
 */
export const IconBadge = memo(function IconBadge({
  children,
  count,
  showDot = false,
  dotColor,
  position = "top-right",
  className = "",
}: {
  children: ReactNode;
  count?: number;
  showDot?: boolean;
  dotColor?: string;
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  className?: string;
}) {
  const { colors } = useTheme();

  const positions = {
    "top-right": "-top-1 -right-1",
    "top-left": "-top-1 -left-1",
    "bottom-right": "-bottom-1 -right-1",
    "bottom-left": "-bottom-1 -left-1",
  };

  return (
    <span className={`relative inline-flex ${className}`}>
      {children}
      {count !== undefined && count > 0 && (
        <span
          className={`absolute ${positions[position]}`}
        >
          <Counter count={count} size="sm" />
        </span>
      )}
      {showDot && !count && (
        <span
          className={`absolute ${positions[position]} w-2.5 h-2.5 rounded-full border-2`}
          style={{
            backgroundColor: dotColor || colors.coral,
            borderColor: colors.warmWhite,
          }}
        />
      )}
    </span>
  );
});

/**
 * Tag Group - Multiple tags
 */
export const TagGroup = memo(function TagGroup({
  tags,
  onRemove,
  variant = "default",
  className = "",
}: {
  tags: string[];
  onRemove?: (tag: string) => void;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {tags.map((tag) => (
        <Chip
          key={tag}
          variant={variant}
          onRemove={onRemove ? () => onRemove(tag) : undefined}
        >
          {tag}
        </Chip>
      ))}
    </div>
  );
});

export default Badge;
