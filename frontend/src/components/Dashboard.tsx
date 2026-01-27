"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  memo,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";

// Types
interface DashboardMetric {
  id: string;
  label: string;
  value: number | string;
  previousValue?: number | string;
  change?: number;
  changeType?: "increase" | "decrease" | "neutral";
  unit?: string;
  icon?: React.ReactNode;
  color?: string;
}

interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface TimeRange {
  label: string;
  value: string;
  days: number;
}

interface DashboardContextValue {
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  refreshData: () => void;
}

// Context
const DashboardContext = createContext<DashboardContextValue | null>(null);

function useDashboardContext(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboardContext must be used within DashboardProvider");
  }
  return context;
}

// Time ranges
const TIME_RANGES: TimeRange[] = [
  { label: "Today", value: "today", days: 1 },
  { label: "7 Days", value: "7d", days: 7 },
  { label: "30 Days", value: "30d", days: 30 },
  { label: "90 Days", value: "90d", days: 90 },
  { label: "1 Year", value: "1y", days: 365 },
];

// Provider
interface DashboardProviderProps {
  defaultTimeRange?: TimeRange;
  onRefresh?: () => void;
  children: React.ReactNode;
}

export const DashboardProvider = memo(function DashboardProvider({
  defaultTimeRange = TIME_RANGES[1],
  onRefresh,
  children,
}: DashboardProviderProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultTimeRange);
  const [isLoading, setLoading] = useState(false);

  const refreshData = useCallback(() => {
    setLoading(true);
    onRefresh?.();
    setTimeout(() => setLoading(false), 500);
  }, [onRefresh]);

  const value = useMemo(
    () => ({
      timeRange,
      setTimeRange,
      isLoading,
      setLoading,
      refreshData,
    }),
    [timeRange, isLoading, refreshData]
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
});

// Dashboard Header
interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const DashboardHeader = memo(function DashboardHeader({
  title,
  subtitle,
  actions,
}: DashboardHeaderProps) {
  const { timeRange, setTimeRange, refreshData, isLoading } = useDashboardContext();

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Time Range Selector */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {TIME_RANGES.map((range) => (
            <motion.button
              key={range.value}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                timeRange.value === range.value
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
              whileTap={{ scale: 0.95 }}
            >
              {range.label}
            </motion.button>
          ))}
        </div>

        {/* Refresh Button */}
        <motion.button
          onClick={refreshData}
          disabled={isLoading}
          className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            animate={isLoading ? { rotate: 360 } : { rotate: 0 }}
            transition={isLoading ? { repeat: Infinity, duration: 1 } : {}}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </motion.svg>
        </motion.button>

        {actions}
      </div>
    </div>
  );
});

// Metric Card
interface MetricCardProps {
  metric: DashboardMetric;
  className?: string;
}

export const MetricCard = memo(function MetricCard({
  metric,
  className = "",
}: MetricCardProps) {
  const formatValue = (val: number | string): string => {
    if (typeof val === "string") return val;
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };

  const changeColor =
    metric.changeType === "increase"
      ? "text-green-500"
      : metric.changeType === "decrease"
      ? "text-red-500"
      : "text-gray-500";

  return (
    <motion.div
      className={`p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}
      whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {metric.label}
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {formatValue(metric.value)}
            {metric.unit && (
              <span className="text-sm font-normal text-gray-500 ml-1">
                {metric.unit}
              </span>
            )}
          </p>
        </div>
        {metric.icon && (
          <div
            className={`p-3 rounded-lg ${
              metric.color || "bg-purple-100 dark:bg-purple-900/30"
            }`}
          >
            {metric.icon}
          </div>
        )}
      </div>

      {metric.change !== undefined && (
        <div className="flex items-center mt-4">
          <span className={`text-sm font-medium ${changeColor}`}>
            {metric.changeType === "increase" ? "+" : ""}
            {metric.change}%
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
            vs previous period
          </span>
        </div>
      )}
    </motion.div>
  );
});

// Metrics Grid
interface MetricsGridProps {
  metrics: DashboardMetric[];
  columns?: 2 | 3 | 4;
}

export const MetricsGrid = memo(function MetricsGrid({
  metrics,
  columns = 4,
}: MetricsGridProps) {
  const gridCols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={`grid grid-cols-1 ${gridCols[columns]} gap-4`}>
      {metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} />
      ))}
    </div>
  );
});

// Simple Bar Chart
interface BarChartProps {
  data: ChartDataPoint[];
  height?: number;
  showValues?: boolean;
  className?: string;
}

export const BarChart = memo(function BarChart({
  data,
  height = 200,
  showValues = true,
  className = "",
}: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className={`${className}`} style={{ height }}>
      <div className="flex items-end justify-between h-full gap-2">
        {data.map((point, index) => {
          const barHeight = (point.value / maxValue) * 100;
          return (
            <div
              key={index}
              className="flex flex-col items-center flex-1"
            >
              <motion.div
                className="w-full rounded-t-md"
                style={{
                  backgroundColor: point.color || "#8b5cf6",
                  height: `${barHeight}%`,
                }}
                initial={{ height: 0 }}
                animate={{ height: `${barHeight}%` }}
                transition={{ delay: index * 0.05 }}
              />
              {showValues && (
                <span className="text-xs text-gray-500 mt-2 truncate w-full text-center">
                  {point.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

// Line Chart (Simple)
interface LineChartProps {
  data: ChartDataPoint[];
  height?: number;
  color?: string;
  showDots?: boolean;
  className?: string;
}

export const LineChart = memo(function LineChart({
  data,
  height = 200,
  color = "#8b5cf6",
  showDots = true,
  className = "",
}: LineChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value));
  const minValue = Math.min(...data.map((d) => d.value));
  const range = maxValue - minValue || 1;

  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((point.value - minValue) / range) * 100;
    return { x, y, value: point.value, label: point.label };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  return (
    <div className={className} style={{ height }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        {/* Area fill */}
        <motion.path
          d={areaD}
          fill={color}
          fillOpacity={0.1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />

        {/* Line */}
        <motion.path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={0.5}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1 }}
        />

        {/* Dots */}
        {showDots &&
          points.map((p, i) => (
            <motion.circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={0.8}
              fill={color}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.05 }}
            />
          ))}
      </svg>
    </div>
  );
});

// Donut Chart
interface DonutChartProps {
  data: ChartDataPoint[];
  size?: number;
  thickness?: number;
  className?: string;
}

export const DonutChart = memo(function DonutChart({
  data,
  size = 200,
  thickness = 30,
  className = "",
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;
  const segments = data.map((point) => {
    const percentage = point.value / total;
    const length = circumference * percentage;
    const offset = currentOffset;
    currentOffset += length;
    return { ...point, percentage, length, offset };
  });

  const defaultColors = [
    "#8b5cf6",
    "#06b6d4",
    "#10b981",
    "#f59e0b",
    "#ef4444",
  ];

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        {segments.map((segment, index) => (
          <motion.circle
            key={index}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={segment.color || defaultColors[index % defaultColors.length]}
            strokeWidth={thickness}
            strokeDasharray={`${segment.length} ${circumference - segment.length}`}
            strokeDashoffset={-segment.offset}
            initial={{ strokeDasharray: `0 ${circumference}` }}
            animate={{ strokeDasharray: `${segment.length} ${circumference - segment.length}` }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {total.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500">Total</p>
        </div>
      </div>
    </div>
  );
});

// Chart Card
interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const ChartCard = memo(function ChartCard({
  title,
  subtitle,
  children,
  actions,
  className = "",
}: ChartCardProps) {
  return (
    <motion.div
      className={`p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </motion.div>
  );
});

// Activity Feed
interface ActivityItem {
  id: string;
  type: string;
  message: string;
  timestamp: Date;
  user?: {
    name: string;
    avatar?: string;
  };
}

interface ActivityFeedProps {
  items: ActivityItem[];
  maxItems?: number;
  className?: string;
}

export const ActivityFeed = memo(function ActivityFeed({
  items,
  maxItems = 5,
  className = "",
}: ActivityFeedProps) {
  const displayItems = items.slice(0, maxItems);

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <AnimatePresence>
        {displayItems.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-start gap-3"
          >
            {item.user?.avatar ? (
              <img
                src={item.user.avatar}
                alt={item.user.name}
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <span className="text-purple-600 text-xs font-medium">
                  {item.user?.name?.[0] || "?"}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {item.message}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {formatTime(item.timestamp)}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});

// Progress Card
interface ProgressCardProps {
  title: string;
  value: number;
  max: number;
  label?: string;
  color?: string;
  className?: string;
}

export const ProgressCard = memo(function ProgressCard({
  title,
  value,
  max,
  label,
  color = "bg-purple-600",
  className = "",
}: ProgressCardProps) {
  const percentage = Math.min((value / max) * 100, 100);

  return (
    <motion.div
      className={`p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900 dark:text-white">{title}</h4>
        <span className="text-sm text-gray-500">
          {value.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${color} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      {label && (
        <p className="text-xs text-gray-500 mt-2">{label}</p>
      )}
    </motion.div>
  );
});

// Stats Row
interface StatItem {
  label: string;
  value: string | number;
  subtext?: string;
}

interface StatsRowProps {
  stats: StatItem[];
  className?: string;
}

export const StatsRow = memo(function StatsRow({
  stats,
  className = "",
}: StatsRowProps) {
  return (
    <div
      className={`flex flex-wrap gap-6 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}
    >
      {stats.map((stat, index) => (
        <div key={index} className="flex-1 min-w-[120px]">
          <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
            {typeof stat.value === "number"
              ? stat.value.toLocaleString()
              : stat.value}
          </p>
          {stat.subtext && (
            <p className="text-xs text-gray-500 mt-1">{stat.subtext}</p>
          )}
        </div>
      ))}
    </div>
  );
});

// Quick Actions
interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  color?: string;
}

interface QuickActionsProps {
  actions: QuickAction[];
  className?: string;
}

export const QuickActions = memo(function QuickActions({
  actions,
  className = "",
}: QuickActionsProps) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${className}`}>
      {actions.map((action) => (
        <motion.button
          key={action.id}
          onClick={action.onClick}
          className={`p-4 rounded-xl text-left transition-colors ${
            action.color ||
            "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="mb-2">{action.icon}</div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {action.label}
          </span>
        </motion.button>
      ))}
    </div>
  );
});

// Dashboard Grid Layout
interface DashboardGridProps {
  children: React.ReactNode;
  className?: string;
}

export const DashboardGrid = memo(function DashboardGrid({
  children,
  className = "",
}: DashboardGridProps) {
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${className}`}>
      {children}
    </div>
  );
});

// Grid Item
interface GridItemProps {
  span?: 1 | 2 | 3;
  children: React.ReactNode;
  className?: string;
}

export const GridItem = memo(function GridItem({
  span = 1,
  children,
  className = "",
}: GridItemProps) {
  const spanClass = {
    1: "lg:col-span-1",
    2: "lg:col-span-2",
    3: "lg:col-span-3",
  };

  return <div className={`${spanClass[span]} ${className}`}>{children}</div>;
});

// Skeleton Loader
interface DashboardSkeletonProps {
  className?: string;
}

export const DashboardSkeleton = memo(function DashboardSkeleton({
  className = "",
}: DashboardSkeletonProps) {
  return (
    <div className={`animate-pulse ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="flex gap-2">
          <div className="h-10 w-64 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl"
          />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-80 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-80 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
    </div>
  );
});

// Empty State
interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState = memo(function EmptyState({
  title,
  description,
  icon,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-12 text-center ${className}`}
    >
      {icon && (
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        {title}
      </h3>
      {description && (
        <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <motion.button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {action.label}
        </motion.button>
      )}
    </div>
  );
});

// Legend
interface LegendItem {
  label: string;
  color: string;
  value?: number | string;
}

interface ChartLegendProps {
  items: LegendItem[];
  className?: string;
}

export const ChartLegend = memo(function ChartLegend({
  items,
  className = "",
}: ChartLegendProps) {
  return (
    <div className={`flex flex-wrap gap-4 ${className}`}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {item.label}
          </span>
          {item.value !== undefined && (
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {typeof item.value === "number"
                ? item.value.toLocaleString()
                : item.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});

// Sparkline
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export const Sparkline = memo(function Sparkline({
  data,
  width = 100,
  height = 30,
  color = "#8b5cf6",
  className = "",
}: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ width, height }}
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

// Export all
export {
  DashboardContext,
  useDashboardContext,
  TIME_RANGES,
  type DashboardMetric,
  type ChartDataPoint,
  type TimeRange,
  type ActivityItem,
  type StatItem,
  type QuickAction,
  type LegendItem,
};
