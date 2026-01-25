"use client";

/**
 * Badge Components - Sprint 642
 *
 * Badge and chip components:
 * - Basic badge
 * - Status badge
 * - Counter badge
 * - Tag chips
 * - HER-themed styling
 */

import React, { memo, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type BadgeVariant = "default" | "primary" | "success" | "warning" | "error" | "info";
type BadgeSize = "sm" | "md" | "lg";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  rounded?: boolean;
  outline?: boolean;
  dot?: boolean;
  className?: string;
}

/**
 * Badge Component
 */
export const Badge = memo(function Badge({
  children,
  variant = "default",
  size = "md",
  rounded = false,
  outline = false,
  dot = false,
  className = "",
}: BadgeProps) {
  const { colors } = useTheme();

  const variantStyles = {
    default: {
      bg: colors.cream,
      text: colors.textPrimary,
      border: colors.cream,
    },
    primary: {
      bg: colors.coral,
      text: colors.warmWhite,
      border: colors.coral,
    },
    success: {
      bg: "#22c55e",
      text: "#fff",
      border: "#22c55e",
    },
    warning: {
      bg: "#f59e0b",
      text: "#fff",
      border: "#f59e0b",
    },
    error: {
      bg: "#ef4444",
      text: "#fff",
      border: "#ef4444",
    },
    info: {
      bg: "#3b82f6",
      text: "#fff",
      border: "#3b82f6",
    },
  };

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-xs",
    md: "px-2 py-1 text-xs",
    lg: "px-3 py-1 text-sm",
  };

  const style = variantStyles[variant];

  return (
    <span
      className={
        "inline-flex items-center gap-1 font-medium " +
        sizeClasses[size] + " " +
        (rounded ? "rounded-full" : "rounded") + " " +
        className
      }
      style={{
        backgroundColor: outline ? "transparent" : style.bg,
        color: outline ? style.bg : style.text,
        border: outline ? "1px solid " + style.border : "none",
      }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: outline ? style.bg : style.text }}
        />
      )}
      {children}
    </span>
  );
});

interface StatusBadgeProps {
  status: "online" | "offline" | "busy" | "away" | "dnd";
  showLabel?: boolean;
  size?: BadgeSize;
  className?: string;
}

/**
 * Status Badge
 */
export const StatusBadge = memo(function StatusBadge({
  status,
  showLabel = true,
  size = "md",
  className = "",
}: StatusBadgeProps) {
  const statusConfig = {
    online: { color: "#22c55e", label: "Online" },
    offline: { color: "#9ca3af", label: "Offline" },
    busy: { color: "#ef4444", label: "Busy" },
    away: { color: "#f59e0b", label: "Away" },
    dnd: { color: "#ef4444", label: "Do Not Disturb" },
  };

  const config = statusConfig[status];
  const dotSize = size === "sm" ? "w-2 h-2" : size === "lg" ? "w-3 h-3" : "w-2.5 h-2.5";

  return (
    <span className={"inline-flex items-center gap-1.5 " + className}>
      <motion.span
        className={dotSize + " rounded-full"}
        style={{ backgroundColor: config.color }}
        animate={status === "online" ? { scale: [1, 1.2, 1] } : undefined}
        transition={status === "online" ? { duration: 2, repeat: Infinity } : undefined}
      />
      {showLabel && (
        <span className={"text-" + size}>{config.label}</span>
      )}
    </span>
  );
});

interface CounterBadgeProps {
  count: number;
  max?: number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

/**
 * Counter Badge
 */
export const CounterBadge = memo(function CounterBadge({
  count,
  max = 99,
  variant = "primary",
  size = "md",
  className = "",
}: CounterBadgeProps) {
  const displayCount = count > max ? max + "+" : count.toString();

  return (
    <Badge variant={variant} size={size} rounded className={className}>
      {displayCount}
    </Badge>
  );
});

interface NotificationBadgeProps {
  count?: number;
  show?: boolean;
  max?: number;
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

/**
 * Notification Badge (wraps content)
 */
export const NotificationBadge = memo(function NotificationBadge({
  count,
  show = true,
  max = 99,
  variant = "error",
  children,
  className = "",
}: NotificationBadgeProps) {
  const { colors } = useTheme();

  const variantColors = {
    default: colors.cream,
    primary: colors.coral,
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#3b82f6",
  };

  if (!show || (count !== undefined && count <= 0)) {
    return <>{children}</>;
  }

  const displayCount = count !== undefined
    ? (count > max ? max + "+" : count.toString())
    : undefined;

  return (
    <span className={"relative inline-flex " + className}>
      {children}
      <motion.span
        className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-white px-1"
        style={{ backgroundColor: variantColors[variant] }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
      >
        {displayCount}
      </motion.span>
    </span>
  );
});

interface TagProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  removable?: boolean;
  onRemove?: () => void;
  icon?: ReactNode;
  className?: string;
}

/**
 * Tag Component
 */
export const Tag = memo(function Tag({
  children,
  variant = "default",
  size = "md",
  removable = false,
  onRemove,
  icon,
  className = "",
}: TagProps) {
  const { colors } = useTheme();

  const variantStyles = {
    default: {
      bg: colors.cream,
      text: colors.textPrimary,
    },
    primary: {
      bg: colors.coral + "20",
      text: colors.coral,
    },
    success: {
      bg: "#22c55e20",
      text: "#22c55e",
    },
    warning: {
      bg: "#f59e0b20",
      text: "#f59e0b",
    },
    error: {
      bg: "#ef444420",
      text: "#ef4444",
    },
    info: {
      bg: "#3b82f620",
      text: "#3b82f6",
    },
  };

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
    lg: "px-3 py-1.5 text-sm gap-2",
  };

  const style = variantStyles[variant];

  return (
    <span
      className={
        "inline-flex items-center rounded-full font-medium " +
        sizeClasses[size] + " " +
        className
      }
      style={{
        backgroundColor: style.bg,
        color: style.text,
      }}
    >
      {icon}
      {children}
      {removable && (
        <button
          type="button"
          className="p-0.5 rounded-full hover:bg-black/10 transition-colors"
          onClick={onRemove}
          aria-label="Remove"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </span>
  );
});

interface TagGroupProps {
  tags: string[];
  variant?: BadgeVariant;
  size?: BadgeSize;
  removable?: boolean;
  onRemove?: (tag: string) => void;
  max?: number;
  className?: string;
}

/**
 * Tag Group
 */
export const TagGroup = memo(function TagGroup({
  tags,
  variant = "default",
  size = "md",
  removable = false,
  onRemove,
  max,
  className = "",
}: TagGroupProps) {
  const { colors } = useTheme();
  const displayTags = max ? tags.slice(0, max) : tags;
  const remaining = max ? tags.length - max : 0;

  return (
    <div className={"flex flex-wrap gap-1.5 " + className}>
      {displayTags.map((tag) => (
        <Tag
          key={tag}
          variant={variant}
          size={size}
          removable={removable}
          onRemove={() => onRemove?.(tag)}
        >
          {tag}
        </Tag>
      ))}
      {remaining > 0 && (
        <span
          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
          style={{
            backgroundColor: colors.cream,
            color: colors.textMuted,
          }}
        >
          +{remaining}
        </span>
      )}
    </div>
  );
});

interface DotIndicatorProps {
  color?: string;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}

/**
 * Dot Indicator
 */
export const DotIndicator = memo(function DotIndicator({
  color,
  size = "md",
  pulse = false,
  className = "",
}: DotIndicatorProps) {
  const { colors } = useTheme();

  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
  };

  return (
    <span className={"relative inline-flex " + className}>
      <motion.span
        className={sizeClasses[size] + " rounded-full"}
        style={{ backgroundColor: color || colors.coral }}
        animate={pulse ? { scale: [1, 1.2, 1], opacity: [1, 0.7, 1] } : undefined}
        transition={pulse ? { duration: 1.5, repeat: Infinity } : undefined}
      />
      {pulse && (
        <span
          className={"absolute " + sizeClasses[size] + " rounded-full animate-ping"}
          style={{ backgroundColor: color || colors.coral, opacity: 0.5 }}
        />
      )}
    </span>
  );
});

interface LabelBadgeProps {
  label: string;
  value: string | number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

/**
 * Label Badge (label + value)
 */
export const LabelBadge = memo(function LabelBadge({
  label,
  value,
  variant = "default",
  size = "md",
  className = "",
}: LabelBadgeProps) {
  const { colors } = useTheme();

  const variantStyles = {
    default: { bg: colors.cream, labelBg: colors.textMuted, valueBg: colors.warmWhite },
    primary: { bg: colors.coral, labelBg: colors.coral, valueBg: colors.warmWhite },
    success: { bg: "#22c55e", labelBg: "#22c55e", valueBg: "#fff" },
    warning: { bg: "#f59e0b", labelBg: "#f59e0b", valueBg: "#fff" },
    error: { bg: "#ef4444", labelBg: "#ef4444", valueBg: "#fff" },
    info: { bg: "#3b82f6", labelBg: "#3b82f6", valueBg: "#fff" },
  };

  const sizeClasses = {
    sm: "text-xs",
    md: "text-xs",
    lg: "text-sm",
  };

  const style = variantStyles[variant];

  return (
    <span
      className={
        "inline-flex overflow-hidden rounded " +
        sizeClasses[size] + " " +
        className
      }
    >
      <span
        className="px-2 py-0.5 font-medium text-white"
        style={{ backgroundColor: style.labelBg }}
      >
        {label}
      </span>
      <span
        className="px-2 py-0.5 font-medium"
        style={{
          backgroundColor: style.valueBg,
          color: style.labelBg,
        }}
      >
        {value}
      </span>
    </span>
  );
});

export default Badge;
