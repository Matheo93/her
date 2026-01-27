"use client";

/**
 * Metric Card Components - Sprint 786
 *
 * Dashboard metric display:
 * - Stat cards
 * - Trend indicators
 * - Sparkline charts
 * - Progress metrics
 * - Comparison metrics
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface MetricCardProps {
  title: string;
  value: string | number;
  previousValue?: number;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  suffix?: string;
  prefix?: string;
  description?: string;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Basic Metric Card
 */
export const MetricCard = memo(function MetricCard({
  title,
  value,
  previousValue,
  icon,
  trend,
  trendValue,
  suffix,
  prefix,
  description,
  loading = false,
  onClick,
  className = "",
}: MetricCardProps) {
  const { colors } = useTheme();

  const trendColors = {
    up: "#22c55e",
    down: "#ef4444",
    neutral: colors.textMuted,
  };

  const trendIcons = {
    up: <ArrowUpIcon />,
    down: <ArrowDownIcon />,
    neutral: <ArrowRightIcon />,
  };

  return (
    <motion.div
      className={
        "p-6 rounded-2xl " +
        (onClick ? "cursor-pointer " : "") +
        className
      }
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
      onClick={onClick}
      whileHover={onClick ? { scale: 1.02, y: -2 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span
          className="text-sm font-medium"
          style={{ color: colors.textMuted }}
        >
          {title}
        </span>
        {icon && (
          <span
            className="p-2 rounded-xl"
            style={{
              backgroundColor: colors.coral + "15",
              color: colors.coral,
            }}
          >
            {icon}
          </span>
        )}
      </div>

      {/* Value */}
      {loading ? (
        <div
          className="h-10 w-24 rounded animate-pulse"
          style={{ backgroundColor: colors.cream }}
        />
      ) : (
        <div className="flex items-baseline gap-1">
          {prefix && (
            <span
              className="text-xl"
              style={{ color: colors.textMuted }}
            >
              {prefix}
            </span>
          )}
          <motion.span
            className="text-3xl font-bold"
            style={{ color: colors.textPrimary }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {typeof value === "number" ? value.toLocaleString() : value}
          </motion.span>
          {suffix && (
            <span
              className="text-lg"
              style={{ color: colors.textMuted }}
            >
              {suffix}
            </span>
          )}
        </div>
      )}

      {/* Trend */}
      {(trend || trendValue) && !loading && (
        <div className="flex items-center gap-2 mt-3">
          {trend && (
            <span
              className="flex items-center gap-1 text-sm font-medium"
              style={{ color: trendColors[trend] }}
            >
              {trendIcons[trend]}
              {trendValue}
            </span>
          )}
          {description && (
            <span
              className="text-sm"
              style={{ color: colors.textMuted }}
            >
              {description}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
});

interface SparklineMetricProps {
  title: string;
  value: string | number;
  data: number[];
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: string;
  className?: string;
}

/**
 * Metric Card with Sparkline
 */
export const SparklineMetric = memo(function SparklineMetric({
  title,
  value,
  data,
  trend,
  trendValue,
  color,
  className = "",
}: SparklineMetricProps) {
  const { colors } = useTheme();
  const lineColor = color || colors.coral;

  // Generate SVG path for sparkline
  const generatePath = () => {
    if (data.length < 2) return "";

    const width = 100;
    const height = 40;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return { x, y };
    });

    let path = "M " + points[0].x + " " + points[0].y;
    for (let i = 1; i < points.length; i++) {
      path += " L " + points[i].x + " " + points[i].y;
    }

    return path;
  };

  const trendColors = {
    up: "#22c55e",
    down: "#ef4444",
    neutral: colors.textMuted,
  };

  return (
    <motion.div
      className={"p-6 rounded-2xl " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <span
            className="text-sm font-medium"
            style={{ color: colors.textMuted }}
          >
            {title}
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span
              className="text-2xl font-bold"
              style={{ color: colors.textPrimary }}
            >
              {typeof value === "number" ? value.toLocaleString() : value}
            </span>
            {trend && trendValue && (
              <span
                className="text-sm font-medium"
                style={{ color: trendColors[trend] }}
              >
                {trend === "up" ? "+" : trend === "down" ? "-" : ""}
                {trendValue}
              </span>
            )}
          </div>
        </div>

        {/* Sparkline */}
        <svg width="100" height="40" className="overflow-visible">
          <defs>
            <linearGradient id={"gradient-" + title.replace(/\s/g, "")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Area fill */}
          <path
            d={generatePath() + " L 100 40 L 0 40 Z"}
            fill={"url(#gradient-" + title.replace(/\s/g, "") + ")"}
          />
          {/* Line */}
          <path
            d={generatePath()}
            fill="none"
            stroke={lineColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* End dot */}
          {data.length > 0 && (
            <circle
              cx="100"
              cy={40 - ((data[data.length - 1] - Math.min(...data)) / (Math.max(...data) - Math.min(...data) || 1)) * 40}
              r="3"
              fill={lineColor}
            />
          )}
        </svg>
      </div>
    </motion.div>
  );
});

interface ProgressMetricProps {
  title: string;
  value: number;
  max: number;
  format?: (value: number, max: number) => string;
  color?: string;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Progress Metric Card
 */
export const ProgressMetric = memo(function ProgressMetric({
  title,
  value,
  max,
  format,
  color,
  showPercentage = true,
  size = "md",
  className = "",
}: ProgressMetricProps) {
  const { colors } = useTheme();
  const progressColor = color || colors.coral;
  const percentage = Math.min(100, (value / max) * 100);

  const heights = {
    sm: 4,
    md: 8,
    lg: 12,
  };

  const displayValue = format
    ? format(value, max)
    : value.toLocaleString() + " / " + max.toLocaleString();

  return (
    <div
      className={"p-6 rounded-2xl " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-sm font-medium"
          style={{ color: colors.textMuted }}
        >
          {title}
        </span>
        {showPercentage && (
          <span
            className="text-sm font-semibold"
            style={{ color: progressColor }}
          >
            {Math.round(percentage)}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{
          height: heights[size],
          backgroundColor: colors.cream,
        }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: progressColor }}
          initial={{ width: 0 }}
          animate={{ width: percentage + "%" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      <div
        className="mt-2 text-sm"
        style={{ color: colors.textMuted }}
      >
        {displayValue}
      </div>
    </div>
  );
});

interface ComparisonMetricProps {
  title: string;
  current: number;
  previous: number;
  format?: (value: number) => string;
  labels?: { current: string; previous: string };
  className?: string;
}

/**
 * Comparison Metric Card
 */
export const ComparisonMetric = memo(function ComparisonMetric({
  title,
  current,
  previous,
  format,
  labels = { current: "Current", previous: "Previous" },
  className = "",
}: ComparisonMetricProps) {
  const { colors } = useTheme();

  const change = previous !== 0 ? ((current - previous) / previous) * 100 : 0;
  const isPositive = change > 0;
  const isNeutral = change === 0;

  const formatValue = format || ((v: number) => v.toLocaleString());

  return (
    <div
      className={"p-6 rounded-2xl " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
    >
      <span
        className="text-sm font-medium"
        style={{ color: colors.textMuted }}
      >
        {title}
      </span>

      <div className="mt-4 grid grid-cols-2 gap-4">
        {/* Current */}
        <div>
          <span
            className="text-xs"
            style={{ color: colors.textMuted }}
          >
            {labels.current}
          </span>
          <div
            className="text-2xl font-bold mt-1"
            style={{ color: colors.textPrimary }}
          >
            {formatValue(current)}
          </div>
        </div>

        {/* Previous */}
        <div>
          <span
            className="text-xs"
            style={{ color: colors.textMuted }}
          >
            {labels.previous}
          </span>
          <div
            className="text-2xl font-bold mt-1"
            style={{ color: colors.textMuted }}
          >
            {formatValue(previous)}
          </div>
        </div>
      </div>

      {/* Change indicator */}
      <div
        className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{
          backgroundColor: isNeutral
            ? colors.cream
            : isPositive
            ? "#22c55e20"
            : "#ef444420",
        }}
      >
        {!isNeutral && (isPositive ? <ArrowUpIcon /> : <ArrowDownIcon />)}
        <span
          className="text-sm font-medium"
          style={{
            color: isNeutral
              ? colors.textMuted
              : isPositive
              ? "#22c55e"
              : "#ef4444",
          }}
        >
          {isNeutral
            ? "No change"
            : (isPositive ? "+" : "") + change.toFixed(1) + "% from previous"}
        </span>
      </div>
    </div>
  );
});

interface MetricGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

/**
 * Metric Grid Layout
 */
export const MetricGrid = memo(function MetricGrid({
  children,
  columns = 4,
  className = "",
}: MetricGridProps) {
  const colClasses = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={"grid gap-4 " + colClasses[columns] + " " + className}>
      {children}
    </div>
  );
});

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Animated Counter
 */
export const AnimatedCounter = memo(function AnimatedCounter({
  value,
  duration = 1000,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
}: AnimatedCounterProps) {
  const { colors } = useTheme();
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = displayValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (value - startValue) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <span className={className} style={{ color: colors.textPrimary }}>
      {prefix}
      {displayValue.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
      {suffix}
    </span>
  );
});

interface DonutMetricProps {
  title: string;
  value: number;
  max: number;
  color?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * Donut Chart Metric
 */
export const DonutMetric = memo(function DonutMetric({
  title,
  value,
  max,
  color,
  size = 120,
  strokeWidth = 12,
  className = "",
}: DonutMetricProps) {
  const { colors } = useTheme();
  const progressColor = color || colors.coral;
  const percentage = Math.min(100, (value / max) * 100);

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className={"p-6 rounded-2xl flex flex-col items-center " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
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
            stroke={progressColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-2xl font-bold"
            style={{ color: colors.textPrimary }}
          >
            {Math.round(percentage)}%
          </span>
        </div>
      </div>

      <span
        className="mt-4 text-sm font-medium"
        style={{ color: colors.textMuted }}
      >
        {title}
      </span>
      <span
        className="text-sm"
        style={{ color: colors.textMuted }}
      >
        {value.toLocaleString()} / {max.toLocaleString()}
      </span>
    </div>
  );
});

// Icons
const ArrowUpIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const ArrowDownIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default MetricCard;
