"use client";

/**
 * Stats Components - Sprint 724
 *
 * Statistical displays:
 * - Stat cards
 * - Progress indicators
 * - Trend indicators
 * - Comparison stats
 * - HER-themed styling
 */

import React, { memo, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    isPositive?: boolean;
    label?: string;
  };
  footer?: ReactNode;
  variant?: "default" | "outline" | "filled";
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Stat Card
 */
export const StatCard = memo(function StatCard({
  title,
  value,
  description,
  icon,
  trend,
  footer,
  variant = "default",
  size = "md",
  className = "",
}: StatCardProps) {
  const { colors } = useTheme();

  const sizes = {
    sm: { title: "text-xs", value: "text-xl", padding: "p-3" },
    md: { title: "text-sm", value: "text-3xl", padding: "p-4" },
    lg: { title: "text-base", value: "text-4xl", padding: "p-6" },
  };

  const s = sizes[size];

  const getVariantStyles = () => {
    switch (variant) {
      case "outline":
        return {
          backgroundColor: "transparent",
          border: `1px solid ${colors.cream}`,
        };
      case "filled":
        return {
          backgroundColor: colors.coral,
          color: colors.warmWhite,
        };
      default:
        return {
          backgroundColor: colors.warmWhite,
        };
    }
  };

  const variantStyles = getVariantStyles();

  return (
    <motion.div
      className={`rounded-xl ${s.padding} ${className}`}
      style={variantStyles}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p
            className={`font-medium ${s.title}`}
            style={{
              color: variant === "filled" ? colors.warmWhite : colors.textMuted,
            }}
          >
            {title}
          </p>

          <p
            className={`font-bold mt-1 ${s.value}`}
            style={{
              color: variant === "filled" ? colors.warmWhite : colors.textPrimary,
            }}
          >
            {value}
          </p>

          {description && (
            <p
              className="text-sm mt-1"
              style={{
                color: variant === "filled" ? `${colors.warmWhite}CC` : colors.textMuted,
              }}
            >
              {description}
            </p>
          )}

          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span
                className="text-sm font-medium"
                style={{
                  color: trend.isPositive ? "#10B981" : "#EF4444",
                }}
              >
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
              </span>
              {trend.label && (
                <span
                  className="text-xs"
                  style={{
                    color: variant === "filled" ? `${colors.warmWhite}CC` : colors.textMuted,
                  }}
                >
                  {trend.label}
                </span>
              )}
            </div>
          )}
        </div>

        {icon && (
          <div
            className="p-3 rounded-lg"
            style={{
              backgroundColor: variant === "filled" ? `${colors.warmWhite}20` : colors.cream,
              color: variant === "filled" ? colors.warmWhite : colors.coral,
            }}
          >
            {icon}
          </div>
        )}
      </div>

      {footer && (
        <div
          className="mt-4 pt-4 border-t"
          style={{ borderColor: variant === "filled" ? `${colors.warmWhite}30` : colors.cream }}
        >
          {footer}
        </div>
      )}
    </motion.div>
  );
});

interface StatsGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

/**
 * Stats Grid
 */
export const StatsGrid = memo(function StatsGrid({
  children,
  columns = 4,
  className = "",
}: StatsGridProps) {
  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={`grid gap-4 ${gridCols[columns]} ${className}`}>
      {children}
    </div>
  );
});

interface ProgressStatProps {
  title: string;
  value: number;
  max?: number;
  showPercentage?: boolean;
  showValue?: boolean;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Progress Stat
 */
export const ProgressStat = memo(function ProgressStat({
  title,
  value,
  max = 100,
  showPercentage = true,
  showValue = false,
  color,
  size = "md",
  className = "",
}: ProgressStatProps) {
  const { colors } = useTheme();
  const percentage = Math.min((value / max) * 100, 100);
  const barColor = color || colors.coral;

  const sizes = {
    sm: { height: 4, title: "text-xs", value: "text-sm" },
    md: { height: 8, title: "text-sm", value: "text-lg" },
    lg: { height: 12, title: "text-base", value: "text-xl" },
  };

  const s = sizes[size];

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span
          className={`font-medium ${s.title}`}
          style={{ color: colors.textPrimary }}
        >
          {title}
        </span>
        <span
          className={`font-bold ${s.value}`}
          style={{ color: barColor }}
        >
          {showPercentage ? `${Math.round(percentage)}%` : ""}
          {showValue ? (showPercentage ? ` (${value}/${max})` : `${value}/${max}`) : ""}
        </span>
      </div>

      <div
        className="rounded-full overflow-hidden"
        style={{ height: s.height, backgroundColor: colors.cream }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
});

interface ComparisonStatProps {
  title: string;
  current: number;
  previous: number;
  format?: (value: number) => string;
  positiveIsGood?: boolean;
  className?: string;
}

/**
 * Comparison Stat
 */
export const ComparisonStat = memo(function ComparisonStat({
  title,
  current,
  previous,
  format = (v) => v.toString(),
  positiveIsGood = true,
  className = "",
}: ComparisonStatProps) {
  const { colors } = useTheme();

  const change = previous !== 0 ? ((current - previous) / previous) * 100 : 0;
  const isPositive = change > 0;
  const isGood = positiveIsGood ? isPositive : !isPositive;

  return (
    <div className={className}>
      <p
        className="text-sm font-medium mb-1"
        style={{ color: colors.textMuted }}
      >
        {title}
      </p>

      <div className="flex items-baseline gap-3">
        <span
          className="text-2xl font-bold"
          style={{ color: colors.textPrimary }}
        >
          {format(current)}
        </span>

        <span
          className="text-sm"
          style={{ color: colors.textMuted }}
        >
          vs {format(previous)}
        </span>

        <span
          className="text-sm font-medium px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: isGood ? "#10B98120" : "#EF444420",
            color: isGood ? "#10B981" : "#EF4444",
          }}
        >
          {isPositive ? "+" : ""}{change.toFixed(1)}%
        </span>
      </div>
    </div>
  );
});

interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  showValue?: boolean;
  color?: string;
  className?: string;
}

/**
 * Circular Progress
 */
export const CircularProgress = memo(function CircularProgress({
  value,
  max = 100,
  size = 120,
  strokeWidth = 8,
  label,
  showValue = true,
  color,
  className = "",
}: CircularProgressProps) {
  const { colors } = useTheme();
  const percentage = Math.min((value / max) * 100, 100);
  const progressColor = color || colors.coral;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colors.cream}
            strokeWidth={strokeWidth}
          />
          {/* Progress */}
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
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </svg>

        {showValue && (
          <div
            className="absolute inset-0 flex items-center justify-center"
          >
            <span
              className="text-2xl font-bold"
              style={{ color: colors.textPrimary }}
            >
              {Math.round(percentage)}%
            </span>
          </div>
        )}
      </div>

      {label && (
        <span
          className="mt-2 text-sm font-medium"
          style={{ color: colors.textMuted }}
        >
          {label}
        </span>
      )}
    </div>
  );
});

interface MiniChartProps {
  data: number[];
  type?: "line" | "bar";
  color?: string;
  height?: number;
  className?: string;
}

/**
 * Mini Chart (Sparkline)
 */
export const MiniChart = memo(function MiniChart({
  data,
  type = "line",
  color,
  height = 40,
  className = "",
}: MiniChartProps) {
  const { colors } = useTheme();
  const chartColor = color || colors.coral;

  if (data.length === 0) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const width = data.length * 10;
  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return { x, y, value };
  });

  if (type === "bar") {
    const barWidth = width / data.length - 2;

    return (
      <svg
        width={width}
        height={height}
        className={className}
        viewBox={`0 0 ${width} ${height}`}
      >
        {points.map((point, i) => (
          <motion.rect
            key={i}
            x={i * (barWidth + 2)}
            y={point.y}
            width={barWidth}
            height={height - point.y}
            fill={chartColor}
            rx={2}
            initial={{ height: 0, y: height }}
            animate={{ height: height - point.y, y: point.y }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          />
        ))}
      </svg>
    );
  }

  // Line chart
  const pathD = points.reduce((acc, point, i) => {
    return i === 0
      ? `M ${point.x} ${point.y}`
      : `${acc} L ${point.x} ${point.y}`;
  }, "");

  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
    >
      {/* Area fill */}
      <motion.path
        d={areaD}
        fill={`${chartColor}20`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />
      {/* Line */}
      <motion.path
        d={pathD}
        fill="none"
        stroke={chartColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5 }}
      />
    </svg>
  );
});

interface StatListProps {
  items: Array<{
    label: string;
    value: string | number;
    icon?: ReactNode;
    color?: string;
  }>;
  className?: string;
}

/**
 * Stat List
 */
export const StatList = memo(function StatList({
  items,
  className = "",
}: StatListProps) {
  const { colors } = useTheme();

  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-center justify-between py-2 border-b last:border-0"
          style={{ borderColor: colors.cream }}
        >
          <div className="flex items-center gap-2">
            {item.icon && (
              <span style={{ color: item.color || colors.coral }}>
                {item.icon}
              </span>
            )}
            <span style={{ color: colors.textMuted }}>{item.label}</span>
          </div>
          <span
            className="font-semibold"
            style={{ color: item.color || colors.textPrimary }}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
});

interface RangeStatProps {
  title: string;
  min: number;
  max: number;
  current: number;
  format?: (value: number) => string;
  className?: string;
}

/**
 * Range Stat
 */
export const RangeStat = memo(function RangeStat({
  title,
  min,
  max,
  current,
  format = (v) => v.toString(),
  className = "",
}: RangeStatProps) {
  const { colors } = useTheme();
  const percentage = ((current - min) / (max - min)) * 100;

  return (
    <div className={className}>
      <p
        className="text-sm font-medium mb-2"
        style={{ color: colors.textMuted }}
      >
        {title}
      </p>

      <div className="relative pt-1">
        <div
          className="h-2 rounded-full"
          style={{ backgroundColor: colors.cream }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: colors.coral }}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Current marker */}
        <motion.div
          className="absolute top-0 w-4 h-4 rounded-full border-2 -mt-1"
          style={{
            backgroundColor: colors.warmWhite,
            borderColor: colors.coral,
            left: `calc(${percentage}% - 8px)`,
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3 }}
        />
      </div>

      <div className="flex justify-between mt-2 text-xs" style={{ color: colors.textMuted }}>
        <span>{format(min)}</span>
        <span className="font-semibold" style={{ color: colors.coral }}>
          {format(current)}
        </span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
});

export default StatCard;
