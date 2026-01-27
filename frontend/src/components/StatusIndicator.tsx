"use client";

/**
 * Status Indicator Components - Sprint 812
 *
 * Status indicators and badges:
 * - Online/offline status
 * - Progress indicators
 * - Activity badges
 * - Status dots
 * - Animated states
 * - HER-themed styling
 */

import React, { memo, useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type StatusType = "online" | "offline" | "busy" | "away" | "dnd" | "invisible";
type Size = "xs" | "sm" | "md" | "lg" | "xl";

interface StatusDotProps {
  status: StatusType;
  size?: Size;
  pulse?: boolean;
  className?: string;
}

const STATUS_COLORS: Record<StatusType, string> = {
  online: "#22c55e",
  offline: "#6b7280",
  busy: "#ef4444",
  away: "#f59e0b",
  dnd: "#ef4444",
  invisible: "#9ca3af",
};

const SIZE_MAP: Record<Size, number> = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
};

/**
 * StatusDot - Simple status indicator dot
 */
export const StatusDot = memo(function StatusDot({
  status,
  size = "md",
  pulse = true,
  className = "",
}: StatusDotProps) {
  const dotSize = SIZE_MAP[size];
  const color = STATUS_COLORS[status];

  return (
    <div
      className={"relative inline-flex " + className}
      style={{ width: dotSize, height: dotSize }}
    >
      {pulse && (status === "online" || status === "busy") && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.7, 0, 0.7],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
      <span
        className="relative inline-flex rounded-full"
        style={{
          width: dotSize,
          height: dotSize,
          backgroundColor: color,
        }}
      />
    </div>
  );
});

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: Size;
  className?: string;
}

/**
 * StatusBadge - Status with label
 */
export const StatusBadge = memo(function StatusBadge({
  status,
  label,
  size = "md",
  className = "",
}: StatusBadgeProps) {
  const { colors } = useTheme();
  const color = STATUS_COLORS[status];
  const defaultLabels: Record<StatusType, string> = {
    online: "Online",
    offline: "Offline",
    busy: "Busy",
    away: "Away",
    dnd: "Do Not Disturb",
    invisible: "Invisible",
  };

  const displayLabel = label || defaultLabels[status];
  const fontSize = size === "xs" ? 10 : size === "sm" ? 11 : size === "md" ? 12 : size === "lg" ? 14 : 16;

  return (
    <div
      className={"inline-flex items-center gap-2 px-2 py-1 rounded-full " + className}
      style={{
        backgroundColor: color + "20",
        border: "1px solid " + color + "40",
      }}
    >
      <StatusDot status={status} size="sm" pulse={false} />
      <span
        className="font-medium"
        style={{ color, fontSize }}
      >
        {displayLabel}
      </span>
    </div>
  );
});

interface ActivityIndicatorProps {
  active?: boolean;
  type?: "dots" | "spinner" | "pulse" | "bars";
  size?: Size;
  color?: string;
  className?: string;
}

/**
 * ActivityIndicator - Loading/activity indicator
 */
export const ActivityIndicator = memo(function ActivityIndicator({
  active = true,
  type = "dots",
  size = "md",
  color,
  className = "",
}: ActivityIndicatorProps) {
  const { colors } = useTheme();
  const fillColor = color || colors.coral;
  const baseSize = SIZE_MAP[size];

  if (!active) return null;

  if (type === "dots") {
    return (
      <div className={"flex gap-1 " + className}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: baseSize * 0.6,
              height: baseSize * 0.6,
              backgroundColor: fillColor,
            }}
            animate={{
              y: [0, -baseSize * 0.5, 0],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
    );
  }

  if (type === "spinner") {
    return (
      <motion.div
        className={className}
        style={{
          width: baseSize,
          height: baseSize,
          border: "2px solid " + fillColor + "30",
          borderTopColor: fillColor,
          borderRadius: "50%",
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    );
  }

  if (type === "pulse") {
    return (
      <motion.div
        className={"rounded-full " + className}
        style={{
          width: baseSize,
          height: baseSize,
          backgroundColor: fillColor,
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [1, 0.5, 1],
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
        }}
      />
    );
  }

  if (type === "bars") {
    return (
      <div className={"flex gap-0.5 items-end " + className} style={{ height: baseSize }}>
        {[0.4, 0.7, 1, 0.7, 0.4].map((height, i) => (
          <motion.div
            key={i}
            className="rounded-sm"
            style={{
              width: baseSize * 0.15,
              backgroundColor: fillColor,
            }}
            animate={{
              height: [baseSize * 0.3, baseSize * height, baseSize * 0.3],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
    );
  }

  return null;
});

interface ProgressBarProps {
  value: number;
  max?: number;
  size?: Size;
  color?: string;
  backgroundColor?: string;
  showLabel?: boolean;
  labelPosition?: "inside" | "outside";
  animated?: boolean;
  striped?: boolean;
  className?: string;
}

/**
 * ProgressBar - Horizontal progress bar
 */
export const ProgressBar = memo(function ProgressBar({
  value,
  max = 100,
  size = "md",
  color,
  backgroundColor,
  showLabel = false,
  labelPosition = "outside",
  animated = true,
  striped = false,
  className = "",
}: ProgressBarProps) {
  const { colors } = useTheme();
  const fillColor = color || colors.coral;
  const bgColor = backgroundColor || colors.textSecondary + "20";
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  const heightMap: Record<Size, number> = {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
  };

  const height = heightMap[size];

  return (
    <div className={"flex items-center gap-2 " + className}>
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ backgroundColor: bgColor, height }}
      >
        <motion.div
          className="h-full rounded-full relative overflow-hidden"
          style={{ backgroundColor: fillColor }}
          initial={animated ? { width: 0 } : { width: percent + "%" }}
          animate={{ width: percent + "%" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {striped && (
            <motion.div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)",
                backgroundSize: height * 2 + "px " + height * 2 + "px",
              }}
              animate={{ backgroundPosition: [0, height * 4 + "px"] }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          )}
          {showLabel && labelPosition === "inside" && percent > 10 && (
            <span
              className="absolute inset-0 flex items-center justify-center text-white font-medium"
              style={{ fontSize: height - 2 }}
            >
              {Math.round(percent)}%
            </span>
          )}
        </motion.div>
      </div>
      {showLabel && labelPosition === "outside" && (
        <span
          className="text-sm font-medium min-w-10 text-right"
          style={{ color: colors.textPrimary }}
        >
          {Math.round(percent)}%
        </span>
      )}
    </div>
  );
});

interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

/**
 * CircularProgress - Circular progress indicator
 */
export const CircularProgress = memo(function CircularProgress({
  value,
  max = 100,
  size = 64,
  strokeWidth = 4,
  color,
  backgroundColor,
  showLabel = true,
  animated = true,
  className = "",
}: CircularProgressProps) {
  const { colors } = useTheme();
  const fillColor = color || colors.coral;
  const bgColor = backgroundColor || colors.textSecondary + "20";

  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  const progress = useMotionValue(animated ? circumference : strokeDashoffset);
  const smoothProgress = useSpring(progress, { stiffness: 100, damping: 30 });

  useEffect(() => {
    progress.set(strokeDashoffset);
  }, [strokeDashoffset, progress]);

  return (
    <div
      className={"relative inline-flex items-center justify-center " + className}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
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
          style={{ strokeDashoffset: smoothProgress }}
        />
      </svg>
      {showLabel && (
        <span
          className="absolute font-semibold"
          style={{
            color: colors.textPrimary,
            fontSize: size * 0.25,
          }}
        >
          {Math.round(percent)}%
        </span>
      )}
    </div>
  );
});

interface ConnectionStatusProps {
  connected: boolean;
  showLabel?: boolean;
  size?: Size;
  className?: string;
}

/**
 * ConnectionStatus - Network connection indicator
 */
export const ConnectionStatus = memo(function ConnectionStatus({
  connected,
  showLabel = true,
  size = "md",
  className = "",
}: ConnectionStatusProps) {
  const { colors } = useTheme();
  const barCount = size === "xs" || size === "sm" ? 3 : 4;
  const baseSize = SIZE_MAP[size];

  return (
    <div className={"flex items-center gap-2 " + className}>
      <div className="flex items-end gap-0.5" style={{ height: baseSize }}>
        {Array.from({ length: barCount }).map((_, i) => {
          const height = ((i + 1) / barCount) * 100;
          const isActive = connected && i < barCount;

          return (
            <motion.div
              key={i}
              className="rounded-sm"
              style={{
                width: baseSize * 0.2,
                height: height + "%",
                backgroundColor: isActive
                  ? colors.coral
                  : colors.textSecondary + "30",
              }}
              animate={
                connected
                  ? { opacity: [0.5, 1, 0.5] }
                  : { opacity: 0.3 }
              }
              transition={
                connected
                  ? {
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
      {showLabel && (
        <span
          className="text-sm font-medium"
          style={{ color: connected ? colors.coral : colors.textSecondary }}
        >
          {connected ? "Connected" : "Disconnected"}
        </span>
      )}
    </div>
  );
});

interface NotificationBadgeProps {
  count: number;
  max?: number;
  size?: Size;
  color?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * NotificationBadge - Badge with count overlay
 */
export const NotificationBadge = memo(function NotificationBadge({
  count,
  max = 99,
  size = "md",
  color,
  className = "",
  children,
}: NotificationBadgeProps) {
  const { colors } = useTheme();
  const fillColor = color || colors.coral;
  const displayCount = count > max ? max + "+" : count.toString();
  const badgeSize = SIZE_MAP[size] * 1.5;

  return (
    <div className={"relative inline-flex " + className}>
      {children}
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -top-1 -right-1 flex items-center justify-center rounded-full font-bold text-white"
            style={{
              minWidth: badgeSize,
              height: badgeSize,
              backgroundColor: fillColor,
              fontSize: badgeSize * 0.6,
              padding: "0 4px",
            }}
          >
            {displayCount}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface LiveIndicatorProps {
  live?: boolean;
  size?: Size;
  label?: string;
  className?: string;
}

/**
 * LiveIndicator - Live streaming indicator
 */
export const LiveIndicator = memo(function LiveIndicator({
  live = true,
  size = "md",
  label = "LIVE",
  className = "",
}: LiveIndicatorProps) {
  const baseSize = SIZE_MAP[size];
  const fontSize = baseSize - 2;

  if (!live) return null;

  return (
    <div
      className={"inline-flex items-center gap-1 px-2 py-0.5 rounded " + className}
      style={{ backgroundColor: "#ef4444" }}
    >
      <motion.div
        className="rounded-full bg-white"
        style={{ width: baseSize * 0.5, height: baseSize * 0.5 }}
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <span className="font-bold text-white" style={{ fontSize }}>
        {label}
      </span>
    </div>
  );
});

interface TypingIndicatorProps {
  active?: boolean;
  users?: string[];
  size?: Size;
  className?: string;
}

/**
 * TypingIndicator - User typing indicator
 */
export const TypingIndicator = memo(function TypingIndicator({
  active = true,
  users = [],
  size = "md",
  className = "",
}: TypingIndicatorProps) {
  const { colors } = useTheme();
  const baseSize = SIZE_MAP[size];

  if (!active) return null;

  const userText = useMemo(() => {
    if (users.length === 0) return "Someone is typing";
    if (users.length === 1) return users[0] + " is typing";
    if (users.length === 2) return users.join(" and ") + " are typing";
    return users[0] + " and " + (users.length - 1) + " others are typing";
  }, [users]);

  return (
    <div
      className={"flex items-center gap-2 " + className}
      style={{ color: colors.textSecondary }}
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: baseSize * 0.4,
              height: baseSize * 0.4,
              backgroundColor: colors.textSecondary,
            }}
            animate={{
              y: [0, -baseSize * 0.3, 0],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
      <span className="text-sm">{userText}</span>
    </div>
  );
});

interface HealthIndicatorProps {
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  label?: string;
  size?: Size;
  className?: string;
}

/**
 * HealthIndicator - System health status
 */
export const HealthIndicator = memo(function HealthIndicator({
  status,
  label,
  size = "md",
  className = "",
}: HealthIndicatorProps) {
  const { colors } = useTheme();
  const baseSize = SIZE_MAP[size];

  const statusConfig = {
    healthy: { color: "#22c55e", label: "Healthy", icon: "checkmark" },
    degraded: { color: "#f59e0b", label: "Degraded", icon: "warning" },
    unhealthy: { color: "#ef4444", label: "Unhealthy", icon: "x" },
    unknown: { color: "#6b7280", label: "Unknown", icon: "question" },
  };

  const config = statusConfig[status];
  const displayLabel = label || config.label;

  return (
    <div
      className={"inline-flex items-center gap-2 px-3 py-1.5 rounded-lg " + className}
      style={{
        backgroundColor: config.color + "15",
        border: "1px solid " + config.color + "30",
      }}
    >
      <motion.div
        className="rounded-full"
        style={{
          width: baseSize,
          height: baseSize,
          backgroundColor: config.color,
        }}
        animate={
          status === "healthy"
            ? { scale: [1, 1.1, 1] }
            : status === "degraded"
            ? { opacity: [1, 0.5, 1] }
            : undefined
        }
        transition={{
          duration: 2,
          repeat: Infinity,
        }}
      />
      <span className="font-medium" style={{ color: config.color }}>
        {displayLabel}
      </span>
    </div>
  );
});

interface SyncStatusProps {
  status: "synced" | "syncing" | "error" | "offline";
  lastSynced?: Date;
  size?: Size;
  className?: string;
}

/**
 * SyncStatus - Data synchronization status
 */
export const SyncStatus = memo(function SyncStatus({
  status,
  lastSynced,
  size = "md",
  className = "",
}: SyncStatusProps) {
  const { colors } = useTheme();
  const baseSize = SIZE_MAP[size];

  const statusConfig = {
    synced: { color: "#22c55e", label: "Synced" },
    syncing: { color: colors.coral, label: "Syncing..." },
    error: { color: "#ef4444", label: "Sync Error" },
    offline: { color: "#6b7280", label: "Offline" },
  };

  const config = statusConfig[status];

  const formatTime = useCallback((date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return minutes + "m ago";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h ago";
    return Math.floor(hours / 24) + "d ago";
  }, []);

  return (
    <div
      className={"flex items-center gap-2 " + className}
      style={{ color: config.color }}
    >
      {status === "syncing" ? (
        <motion.div
          style={{
            width: baseSize,
            height: baseSize,
            border: "2px solid " + config.color + "30",
            borderTopColor: config.color,
            borderRadius: "50%",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      ) : (
        <div
          className="rounded-full"
          style={{
            width: baseSize,
            height: baseSize,
            backgroundColor: config.color,
          }}
        />
      )}
      <div className="flex flex-col">
        <span className="text-sm font-medium">{config.label}</span>
        {lastSynced && status === "synced" && (
          <span className="text-xs" style={{ color: colors.textSecondary }}>
            {formatTime(lastSynced)}
          </span>
        )}
      </div>
    </div>
  );
});

export default StatusDot;
