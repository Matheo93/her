"use client";

/**
 * Chart Components - Sprint 656
 *
 * Data visualization charts:
 * - Line chart
 * - Bar chart
 * - Pie chart
 * - Area chart
 * - HER-themed styling
 */

import React, { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface LineChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  showGrid?: boolean;
  showDots?: boolean;
  smooth?: boolean;
  animate?: boolean;
  className?: string;
}

/**
 * Line Chart
 */
export const LineChart = memo(function LineChart({
  data,
  width = 400,
  height = 200,
  showGrid = true,
  showDots = true,
  smooth = true,
  animate = true,
  className = "",
}: LineChartProps) {
  const { colors } = useTheme();

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { minValue, maxValue, points, path } = useMemo(() => {
    if (data.length === 0) return { minValue: 0, maxValue: 100, points: [], path: "" };

    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const pts = data.map((d, i) => ({
      x: padding.left + (i / (data.length - 1 || 1)) * chartWidth,
      y: padding.top + chartHeight - ((d.value - min) / range) * chartHeight,
      ...d,
    }));

    let pathD = "";
    if (smooth && pts.length > 1) {
      pathD = pts.reduce((acc, point, i, arr) => {
        if (i === 0) return "M " + point.x + " " + point.y;
        const prev = arr[i - 1];
        const cpx = (prev.x + point.x) / 2;
        return acc + " C " + cpx + " " + prev.y + ", " + cpx + " " + point.y + ", " + point.x + " " + point.y;
      }, "");
    } else {
      pathD = pts.map((p, i) => (i === 0 ? "M" : "L") + " " + p.x + " " + p.y).join(" ");
    }

    return { minValue: min, maxValue: max, points: pts, path: pathD };
  }, [data, chartWidth, chartHeight, padding, smooth]);

  const yTicks = useMemo(() => {
    const ticks = [];
    const step = (maxValue - minValue) / 4 || 1;
    for (let i = 0; i <= 4; i++) {
      ticks.push(minValue + step * i);
    }
    return ticks;
  }, [minValue, maxValue]);

  return (
    <svg width={width} height={height} className={className}>
      {showGrid && (
        <g>
          {yTicks.map((tick, i) => {
            const y = padding.top + chartHeight - ((tick - minValue) / (maxValue - minValue || 1)) * chartHeight;
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke={colors.cream}
                  strokeDasharray="4"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={10}
                  fill={colors.textMuted}
                >
                  {tick.toFixed(0)}
                </text>
              </g>
            );
          })}
        </g>
      )}

      <motion.path
        d={path}
        fill="none"
        stroke={colors.coral}
        strokeWidth={2}
        strokeLinecap="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />

      {showDots &&
        points.map((point, i) => (
          <motion.circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={4}
            fill={colors.coral}
            initial={animate ? { scale: 0 } : undefined}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.1 }}
          />
        ))}

      {data.map((d, i) => (
        <text
          key={i}
          x={points[i]?.x || 0}
          y={height - 10}
          textAnchor="middle"
          fontSize={10}
          fill={colors.textMuted}
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
});

interface BarChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  horizontal?: boolean;
  showValues?: boolean;
  animate?: boolean;
  className?: string;
}

/**
 * Bar Chart
 */
export const BarChart = memo(function BarChart({
  data,
  width = 400,
  height = 200,
  horizontal = false,
  showValues = true,
  animate = true,
  className = "",
}: BarChartProps) {
  const { colors } = useTheme();

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barWidth = horizontal
    ? chartHeight / data.length - 8
    : chartWidth / data.length - 8;

  const defaultColors = [
    colors.coral,
    "#3b82f6",
    "#22c55e",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
  ];

  return (
    <svg width={width} height={height} className={className}>
      {data.map((d, i) => {
        const barColor = d.color || defaultColors[i % defaultColors.length];
        const ratio = d.value / maxValue;

        if (horizontal) {
          const barHeight = ratio * chartWidth;
          const y = padding.top + i * (chartHeight / data.length) + 4;

          return (
            <g key={i}>
              <motion.rect
                x={padding.left}
                y={y}
                width={barHeight}
                height={barWidth}
                fill={barColor}
                rx={4}
                initial={animate ? { width: 0 } : undefined}
                animate={{ width: barHeight }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              />
              <text
                x={padding.left - 10}
                y={y + barWidth / 2 + 4}
                textAnchor="end"
                fontSize={10}
                fill={colors.textMuted}
              >
                {d.label}
              </text>
              {showValues && (
                <text
                  x={padding.left + barHeight + 5}
                  y={y + barWidth / 2 + 4}
                  fontSize={10}
                  fill={colors.textPrimary}
                >
                  {d.value}
                </text>
              )}
            </g>
          );
        }

        const barHeight = ratio * chartHeight;
        const x = padding.left + i * (chartWidth / data.length) + 4;

        return (
          <g key={i}>
            <motion.rect
              x={x}
              y={padding.top + chartHeight - barHeight}
              width={barWidth}
              height={barHeight}
              fill={barColor}
              rx={4}
              initial={animate ? { height: 0, y: padding.top + chartHeight } : undefined}
              animate={{ height: barHeight, y: padding.top + chartHeight - barHeight }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            />
            <text
              x={x + barWidth / 2}
              y={height - 10}
              textAnchor="middle"
              fontSize={10}
              fill={colors.textMuted}
            >
              {d.label}
            </text>
            {showValues && (
              <text
                x={x + barWidth / 2}
                y={padding.top + chartHeight - barHeight - 5}
                textAnchor="middle"
                fontSize={10}
                fill={colors.textPrimary}
              >
                {d.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});

interface PieChartProps {
  data: DataPoint[];
  size?: number;
  donut?: boolean;
  showLabels?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
}

/**
 * Pie Chart
 */
export const PieChart = memo(function PieChart({
  data,
  size = 200,
  donut = false,
  showLabels = true,
  showLegend = true,
  animate = true,
  className = "",
}: PieChartProps) {
  const { colors } = useTheme();

  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const radius = size / 2 - 10;
  const innerRadius = donut ? radius * 0.6 : 0;
  const center = size / 2;

  const defaultColors = [
    colors.coral,
    "#3b82f6",
    "#22c55e",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
  ];

  const slices = useMemo(() => {
    let currentAngle = -90;
    return data.map((d, i) => {
      const angle = (d.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);

      const ix1 = center + innerRadius * Math.cos(startRad);
      const iy1 = center + innerRadius * Math.sin(startRad);
      const ix2 = center + innerRadius * Math.cos(endRad);
      const iy2 = center + innerRadius * Math.sin(endRad);

      const largeArc = angle > 180 ? 1 : 0;

      let path = "";
      if (donut) {
        path =
          "M " + x1 + " " + y1 +
          " A " + radius + " " + radius + " 0 " + largeArc + " 1 " + x2 + " " + y2 +
          " L " + ix2 + " " + iy2 +
          " A " + innerRadius + " " + innerRadius + " 0 " + largeArc + " 0 " + ix1 + " " + iy1 +
          " Z";
      } else {
        path =
          "M " + center + " " + center +
          " L " + x1 + " " + y1 +
          " A " + radius + " " + radius + " 0 " + largeArc + " 1 " + x2 + " " + y2 +
          " Z";
      }

      const midAngle = (startAngle + endAngle) / 2;
      const midRad = (midAngle * Math.PI) / 180;
      const labelRadius = radius * 0.7;
      const labelX = center + labelRadius * Math.cos(midRad);
      const labelY = center + labelRadius * Math.sin(midRad);

      return {
        ...d,
        path,
        color: d.color || defaultColors[i % defaultColors.length],
        percentage: ((d.value / total) * 100).toFixed(1),
        labelX,
        labelY,
      };
    });
  }, [data, total, radius, innerRadius, center, donut, defaultColors]);

  return (
    <div className={"flex items-center gap-4 " + className}>
      <svg width={size} height={size}>
        {slices.map((slice, i) => (
          <motion.path
            key={i}
            d={slice.path}
            fill={slice.color}
            initial={animate ? { opacity: 0, scale: 0.8 } : undefined}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
          />
        ))}
        {showLabels &&
          slices.map((slice, i) => (
            <text
              key={i}
              x={slice.labelX}
              y={slice.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="white"
              fontWeight="bold"
            >
              {slice.percentage}%
            </text>
          ))}
        {donut && (
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={16}
            fontWeight="bold"
            fill={colors.textPrimary}
          >
            {total}
          </text>
        )}
      </svg>

      {showLegend && (
        <div className="space-y-2">
          {slices.map((slice, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-sm" style={{ color: colors.textPrimary }}>
                {slice.label}
              </span>
              <span className="text-sm" style={{ color: colors.textMuted }}>
                ({slice.value})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

interface AreaChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  gradient?: boolean;
  animate?: boolean;
  className?: string;
}

/**
 * Area Chart
 */
export const AreaChart = memo(function AreaChart({
  data,
  width = 400,
  height = 200,
  gradient = true,
  animate = true,
  className = "",
}: AreaChartProps) {
  const { colors } = useTheme();

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { path, areaPath } = useMemo(() => {
    if (data.length === 0) return { path: "", areaPath: "" };

    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = data.map((d, i) => ({
      x: padding.left + (i / (data.length - 1 || 1)) * chartWidth,
      y: padding.top + chartHeight - ((d.value - min) / range) * chartHeight,
    }));

    const linePath = points.map((p, i) => (i === 0 ? "M" : "L") + " " + p.x + " " + p.y).join(" ");

    const area =
      linePath +
      " L " + (padding.left + chartWidth) + " " + (padding.top + chartHeight) +
      " L " + padding.left + " " + (padding.top + chartHeight) +
      " Z";

    return { path: linePath, areaPath: area };
  }, [data, chartWidth, chartHeight, padding]);

  const gradientId = "area-gradient-" + Math.random().toString(36).slice(2);

  return (
    <svg width={width} height={height} className={className}>
      {gradient && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.coral} stopOpacity={0.4} />
            <stop offset="100%" stopColor={colors.coral} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}

      <motion.path
        d={areaPath}
        fill={gradient ? "url(#" + gradientId + ")" : colors.coral + "40"}
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />

      <motion.path
        d={path}
        fill="none"
        stroke={colors.coral}
        strokeWidth={2}
        initial={animate ? { pathLength: 0 } : undefined}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1 }}
      />

      {data.map((d, i) => (
        <text
          key={i}
          x={padding.left + (i / (data.length - 1 || 1)) * chartWidth}
          y={height - 10}
          textAnchor="middle"
          fontSize={10}
          fill={colors.textMuted}
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
});

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

/**
 * Sparkline (mini chart)
 */
export const Sparkline = memo(function Sparkline({
  data,
  width = 100,
  height = 30,
  color,
  className = "",
}: SparklineProps) {
  const { colors } = useTheme();
  const lineColor = color || colors.coral;

  const path = useMemo(() => {
    if (data.length === 0) return "";

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    return data
      .map((v, i) => {
        const x = (i / (data.length - 1 || 1)) * width;
        const y = height - ((v - min) / range) * height;
        return (i === 0 ? "M" : "L") + " " + x + " " + y;
      })
      .join(" ");
  }, [data, width, height]);

  return (
    <svg width={width} height={height} className={className}>
      <path d={path} fill="none" stroke={lineColor} strokeWidth={1.5} />
    </svg>
  );
});

export default LineChart;
