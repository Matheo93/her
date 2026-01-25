"use client";

/**
 * Rating Components - Sprint 666
 *
 * Rating display and input:
 * - Star rating
 * - Heart rating
 * - Numeric rating
 * - Half star support
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface RatingProps {
  value: number;
  onChange?: (value: number) => void;
  max?: number;
  size?: "sm" | "md" | "lg";
  allowHalf?: boolean;
  readonly?: boolean;
  showValue?: boolean;
  icon?: "star" | "heart" | "circle";
  className?: string;
}

/**
 * Rating Component
 */
export const Rating = memo(function Rating({
  value,
  onChange,
  max = 5,
  size = "md",
  allowHalf = false,
  readonly = false,
  showValue = false,
  icon = "star",
  className = "",
}: RatingProps) {
  const { colors } = useTheme();
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const displayValue = hoverValue !== null ? hoverValue : value;

  const sizeMap = {
    sm: { icon: 16, gap: 2 },
    md: { icon: 24, gap: 4 },
    lg: { icon: 32, gap: 6 },
  };

  const dims = sizeMap[size];

  const handleClick = useCallback((index: number, isHalf: boolean) => {
    if (readonly || !onChange) return;
    const newValue = isHalf && allowHalf ? index + 0.5 : index + 1;
    onChange(newValue);
  }, [readonly, onChange, allowHalf]);

  const handleMouseMove = useCallback((e: React.MouseEvent, index: number) => {
    if (readonly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isHalf = allowHalf && x < rect.width / 2;
    setHoverValue(isHalf ? index + 0.5 : index + 1);
  }, [readonly, allowHalf]);

  const handleMouseLeave = useCallback(() => {
    setHoverValue(null);
  }, []);

  const IconComponent = icon === "star" ? StarIcon : icon === "heart" ? HeartIcon : CircleIcon;

  return (
    <div className={"flex items-center " + className} style={{ gap: dims.gap }}>
      {Array.from({ length: max }, (_, index) => {
        const filled = displayValue >= index + 1;
        const halfFilled = allowHalf && displayValue === index + 0.5;

        return (
          <motion.button
            key={index}
            type="button"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const isHalf = allowHalf && x < rect.width / 2;
              handleClick(index, isHalf);
            }}
            onMouseMove={(e) => handleMouseMove(e, index)}
            onMouseLeave={handleMouseLeave}
            className="relative"
            style={{
              width: dims.icon,
              height: dims.icon,
              cursor: readonly ? "default" : "pointer",
            }}
            whileHover={readonly ? {} : { scale: 1.2 }}
            whileTap={readonly ? {} : { scale: 0.9 }}
            disabled={readonly}
          >
            {/* Empty icon */}
            <IconComponent
              size={dims.icon}
              color={colors.cream}
              filled={false}
            />

            {/* Filled icon (full or half) */}
            {(filled || halfFilled) && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: halfFilled ? "50%" : "100%" }}
              >
                <IconComponent
                  size={dims.icon}
                  color={colors.coral}
                  filled={true}
                />
              </div>
            )}
          </motion.button>
        );
      })}

      {showValue && (
        <span
          className="ml-2 text-sm font-medium"
          style={{ color: colors.textPrimary }}
        >
          {value.toFixed(allowHalf ? 1 : 0)} / {max}
        </span>
      )}
    </div>
  );
});

interface RatingDisplayProps {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  showCount?: boolean;
  count?: number;
  className?: string;
}

/**
 * Read-only Rating Display
 */
export const RatingDisplay = memo(function RatingDisplay({
  value,
  max = 5,
  size = "md",
  showCount = false,
  count = 0,
  className = "",
}: RatingDisplayProps) {
  const { colors } = useTheme();

  return (
    <div className={"flex items-center gap-2 " + className}>
      <Rating value={value} max={max} size={size} readonly allowHalf />
      <span className="text-sm font-medium" style={{ color: colors.coral }}>
        {value.toFixed(1)}
      </span>
      {showCount && (
        <span className="text-sm" style={{ color: colors.textMuted }}>
          ({count} reviews)
        </span>
      )}
    </div>
  );
});

interface NumericRatingProps {
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  readonly?: boolean;
  className?: string;
}

/**
 * Numeric Rating (1-10 buttons)
 */
export const NumericRating = memo(function NumericRating({
  value,
  onChange,
  min = 1,
  max = 10,
  readonly = false,
  className = "",
}: NumericRatingProps) {
  const { colors } = useTheme();

  const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className={"flex gap-1 " + className}>
      {numbers.map((num) => (
        <motion.button
          key={num}
          onClick={() => !readonly && onChange?.(num)}
          className="w-8 h-8 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: value === num ? colors.coral : colors.cream,
            color: value === num ? colors.warmWhite : colors.textPrimary,
            cursor: readonly ? "default" : "pointer",
          }}
          whileHover={readonly ? {} : { scale: 1.1 }}
          whileTap={readonly ? {} : { scale: 0.95 }}
          disabled={readonly}
        >
          {num}
        </motion.button>
      ))}
    </div>
  );
});

interface EmojiRatingProps {
  value: number;
  onChange?: (value: number) => void;
  readonly?: boolean;
  className?: string;
}

/**
 * Emoji Rating (5 faces)
 */
export const EmojiRating = memo(function EmojiRating({
  value,
  onChange,
  readonly = false,
  className = "",
}: EmojiRatingProps) {
  const { colors } = useTheme();
  const emojis = ["😞", "😕", "😐", "🙂", "😄"];

  return (
    <div className={"flex gap-2 " + className}>
      {emojis.map((emoji, index) => (
        <motion.button
          key={index}
          onClick={() => !readonly && onChange?.(index + 1)}
          className="text-2xl p-2 rounded-lg"
          style={{
            backgroundColor: value === index + 1 ? colors.cream : "transparent",
            cursor: readonly ? "default" : "pointer",
            opacity: readonly && value !== index + 1 ? 0.5 : 1,
          }}
          whileHover={readonly ? {} : { scale: 1.2 }}
          whileTap={readonly ? {} : { scale: 0.9 }}
          disabled={readonly}
        >
          {emoji}
        </motion.button>
      ))}
    </div>
  );
});

interface ThumbsRatingProps {
  value: "up" | "down" | null;
  onChange?: (value: "up" | "down") => void;
  readonly?: boolean;
  counts?: { up: number; down: number };
  className?: string;
}

/**
 * Thumbs Up/Down Rating
 */
export const ThumbsRating = memo(function ThumbsRating({
  value,
  onChange,
  readonly = false,
  counts,
  className = "",
}: ThumbsRatingProps) {
  const { colors } = useTheme();

  return (
    <div className={"flex gap-4 " + className}>
      <motion.button
        onClick={() => !readonly && onChange?.("up")}
        className="flex items-center gap-1 px-3 py-2 rounded-lg"
        style={{
          backgroundColor: value === "up" ? "#22c55e20" : colors.cream,
          color: value === "up" ? "#22c55e" : colors.textMuted,
          cursor: readonly ? "default" : "pointer",
        }}
        whileHover={readonly ? {} : { scale: 1.05 }}
        disabled={readonly}
      >
        <ThumbUpIcon />
        {counts && <span className="text-sm">{counts.up}</span>}
      </motion.button>

      <motion.button
        onClick={() => !readonly && onChange?.("down")}
        className="flex items-center gap-1 px-3 py-2 rounded-lg"
        style={{
          backgroundColor: value === "down" ? "#ef444420" : colors.cream,
          color: value === "down" ? "#ef4444" : colors.textMuted,
          cursor: readonly ? "default" : "pointer",
        }}
        whileHover={readonly ? {} : { scale: 1.05 }}
        disabled={readonly}
      >
        <ThumbDownIcon />
        {counts && <span className="text-sm">{counts.down}</span>}
      </motion.button>
    </div>
  );
});

// Icons
function StarIcon({ size, color, filled }: { size: number; color: string; filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={2}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function HeartIcon({ size, color, filled }: { size: number; color: string; filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={2}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function CircleIcon({ size, color, filled }: { size: number; color: string; filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  );
}

export default Rating;
