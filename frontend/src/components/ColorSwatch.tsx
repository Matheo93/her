"use client";

/**
 * Color Swatch Components - Sprint 738
 *
 * Color display and selection:
 * - Single swatch
 * - Swatch grid
 * - Color palette
 * - Color info tooltip
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface Color {
  name?: string;
  hex: string;
  rgb?: { r: number; g: number; b: number };
}

interface ColorSwatchProps {
  color: string | Color;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  shape?: "square" | "rounded" | "circle";
  selected?: boolean;
  showInfo?: boolean;
  showLabel?: boolean;
  onClick?: (color: string) => void;
  className?: string;
}

/**
 * Color Swatch
 */
export const ColorSwatch = memo(function ColorSwatch({
  color,
  size = "md",
  shape = "rounded",
  selected = false,
  showInfo = false,
  showLabel = false,
  onClick,
  className = "",
}: ColorSwatchProps) {
  const { colors } = useTheme();
  const [showTooltip, setShowTooltip] = useState(false);

  const colorValue = typeof color === "string" ? color : color.hex;
  const colorName = typeof color === "object" ? color.name : undefined;

  const sizes = {
    xs: "w-4 h-4",
    sm: "w-6 h-6",
    md: "w-10 h-10",
    lg: "w-14 h-14",
    xl: "w-20 h-20",
  };

  const shapes = {
    square: "rounded-none",
    rounded: "rounded-lg",
    circle: "rounded-full",
  };

  const isLight = isColorLight(colorValue);

  return (
    <div className={`relative inline-flex flex-col items-center gap-1 ${className}`}>
      <motion.button
        onClick={() => onClick?.(colorValue)}
        onMouseEnter={() => showInfo && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`${sizes[size]} ${shapes[shape]} relative overflow-hidden transition-shadow`}
        style={{
          backgroundColor: colorValue,
          boxShadow: selected
            ? `0 0 0 3px ${colors.warmWhite}, 0 0 0 5px ${colors.coral}`
            : "0 2px 4px rgba(0,0,0,0.1)",
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Checkmark for selected */}
        {selected && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <svg
              width={size === "xs" ? 10 : size === "sm" ? 12 : 16}
              height={size === "xs" ? 10 : size === "sm" ? 12 : 16}
              viewBox="0 0 24 24"
              fill="none"
              stroke={isLight ? "#000" : "#fff"}
              strokeWidth={3}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </motion.span>
        )}

        {/* Transparent pattern for transparency */}
        {colorValue.toLowerCase() === "transparent" && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(45deg, #ccc 25%, transparent 25%),
                linear-gradient(-45deg, #ccc 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #ccc 75%),
                linear-gradient(-45deg, transparent 75%, #ccc 75%)
              `,
              backgroundSize: "8px 8px",
              backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
            }}
          />
        )}
      </motion.button>

      {/* Label */}
      {showLabel && colorName && (
        <span
          className="text-xs font-medium text-center truncate max-w-full"
          style={{ color: colors.textMuted }}
        >
          {colorName}
        </span>
      )}

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute -bottom-16 left-1/2 -translate-x-1/2 z-10 p-2 rounded-lg shadow-lg whitespace-nowrap"
            style={{ backgroundColor: colors.textPrimary }}
          >
            <ColorInfo color={colorValue} name={colorName} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface ColorInfoProps {
  color: string;
  name?: string;
}

/**
 * Color Info Display
 */
const ColorInfo = memo(function ColorInfo({ color, name }: ColorInfoProps) {
  const rgb = hexToRgb(color);

  return (
    <div className="text-xs text-white">
      {name && <p className="font-medium mb-1">{name}</p>}
      <p className="font-mono">{color.toUpperCase()}</p>
      {rgb && (
        <p className="font-mono text-white/70">
          rgb({rgb.r}, {rgb.g}, {rgb.b})
        </p>
      )}
    </div>
  );
});

interface SwatchGridProps {
  colors: (string | Color)[];
  selected?: string;
  columns?: number;
  size?: "xs" | "sm" | "md" | "lg";
  shape?: "square" | "rounded" | "circle";
  onSelect?: (color: string) => void;
  className?: string;
}

/**
 * Swatch Grid
 */
export const SwatchGrid = memo(function SwatchGrid({
  colors,
  selected,
  columns = 6,
  size = "md",
  shape = "rounded",
  onSelect,
  className = "",
}: SwatchGridProps) {
  return (
    <div
      className={`grid gap-2 ${className}`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {colors.map((color, index) => {
        const colorValue = typeof color === "string" ? color : color.hex;
        return (
          <ColorSwatch
            key={colorValue + index}
            color={color}
            size={size}
            shape={shape}
            selected={selected === colorValue}
            onClick={onSelect}
          />
        );
      })}
    </div>
  );
});

interface ColorPaletteProps {
  name: string;
  colors: (string | Color)[];
  selected?: string;
  onSelect?: (color: string) => void;
  showLabels?: boolean;
  className?: string;
}

/**
 * Color Palette
 */
export const ColorPalette = memo(function ColorPalette({
  name,
  colors,
  selected,
  onSelect,
  showLabels = false,
  className = "",
}: ColorPaletteProps) {
  const { colors: themeColors } = useTheme();

  return (
    <div className={className}>
      <h3
        className="text-sm font-semibold mb-2"
        style={{ color: themeColors.textPrimary }}
      >
        {name}
      </h3>
      <div className="flex gap-1">
        {colors.map((color, index) => {
          const colorValue = typeof color === "string" ? color : color.hex;
          return (
            <ColorSwatch
              key={colorValue + index}
              color={color}
              size="md"
              shape="rounded"
              selected={selected === colorValue}
              showLabel={showLabels}
              onClick={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
});

interface GradientSwatchProps {
  colors: string[];
  direction?: "horizontal" | "vertical" | "diagonal";
  size?: "sm" | "md" | "lg";
  shape?: "square" | "rounded" | "circle";
  onClick?: () => void;
  className?: string;
}

/**
 * Gradient Swatch
 */
export const GradientSwatch = memo(function GradientSwatch({
  colors,
  direction = "horizontal",
  size = "md",
  shape = "rounded",
  onClick,
  className = "",
}: GradientSwatchProps) {
  const { colors: themeColors } = useTheme();

  const sizes = {
    sm: "w-16 h-6",
    md: "w-24 h-10",
    lg: "w-32 h-14",
  };

  const shapes = {
    square: "rounded-none",
    rounded: "rounded-lg",
    circle: "rounded-full",
  };

  const gradientDirection = {
    horizontal: "to right",
    vertical: "to bottom",
    diagonal: "to bottom right",
  };

  const gradient = `linear-gradient(${gradientDirection[direction]}, ${colors.join(", ")})`;

  return (
    <motion.button
      onClick={onClick}
      className={`${sizes[size]} ${shapes[shape]} ${className}`}
      style={{
        background: gradient,
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    />
  );
});

interface ColorScaleProps {
  baseColor: string;
  steps?: number;
  includeBlack?: boolean;
  includeWhite?: boolean;
  onSelect?: (color: string) => void;
  className?: string;
}

/**
 * Color Scale (Shades/Tints)
 */
export const ColorScale = memo(function ColorScale({
  baseColor,
  steps = 9,
  includeBlack = true,
  includeWhite = true,
  onSelect,
  className = "",
}: ColorScaleProps) {
  const { colors: themeColors } = useTheme();

  const scale = generateColorScale(baseColor, steps, includeWhite, includeBlack);

  return (
    <div className={`flex ${className}`}>
      {scale.map((color, index) => (
        <motion.button
          key={index}
          onClick={() => onSelect?.(color)}
          className="flex-1 h-10 first:rounded-l-lg last:rounded-r-lg"
          style={{ backgroundColor: color }}
          whileHover={{ scale: 1.05, zIndex: 1 }}
          whileTap={{ scale: 0.95 }}
        />
      ))}
    </div>
  );
});

interface ColorContrastProps {
  foreground: string;
  background: string;
  showRatio?: boolean;
  className?: string;
}

/**
 * Color Contrast Preview
 */
export const ColorContrast = memo(function ColorContrast({
  foreground,
  background,
  showRatio = true,
  className = "",
}: ColorContrastProps) {
  const { colors } = useTheme();
  const ratio = getContrastRatio(foreground, background);
  const wcagLevel = getWcagLevel(ratio);

  return (
    <div className={className}>
      <div
        className="p-4 rounded-lg"
        style={{ backgroundColor: background }}
      >
        <p
          className="text-lg font-medium"
          style={{ color: foreground }}
        >
          Sample Text
        </p>
        <p
          className="text-sm"
          style={{ color: foreground }}
        >
          The quick brown fox jumps over the lazy dog.
        </p>
      </div>

      {showRatio && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm" style={{ color: colors.textMuted }}>
            Contrast: {ratio.toFixed(2)}:1
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              wcagLevel === "AAA"
                ? "bg-green-100 text-green-700"
                : wcagLevel === "AA"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {wcagLevel || "Fail"}
          </span>
        </div>
      )}
    </div>
  );
});

// Utility functions
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function isColorLight(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5;
}

function generateColorScale(
  baseColor: string,
  steps: number,
  includeWhite: boolean,
  includeBlack: boolean
): string[] {
  const rgb = hexToRgb(baseColor);
  if (!rgb) return [baseColor];

  const scale: string[] = [];
  const totalSteps = steps + (includeWhite ? 1 : 0) + (includeBlack ? 1 : 0);

  for (let i = 0; i < totalSteps; i++) {
    const ratio = i / (totalSteps - 1);

    let r, g, b;
    if (ratio < 0.5) {
      // Tint (towards white)
      const tintRatio = ratio * 2;
      r = Math.round(rgb.r + (255 - rgb.r) * (1 - tintRatio));
      g = Math.round(rgb.g + (255 - rgb.g) * (1 - tintRatio));
      b = Math.round(rgb.b + (255 - rgb.b) * (1 - tintRatio));
    } else {
      // Shade (towards black)
      const shadeRatio = (ratio - 0.5) * 2;
      r = Math.round(rgb.r * (1 - shadeRatio));
      g = Math.round(rgb.g * (1 - shadeRatio));
      b = Math.round(rgb.b * (1 - shadeRatio));
    }

    scale.push(`#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`);
  }

  return scale;
}

function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(fg: string, bg: string): number {
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getWcagLevel(ratio: number): string | null {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return null;
}

export default ColorSwatch;
