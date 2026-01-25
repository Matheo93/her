"use client";

/**
 * Slider/Range Components - Sprint 616
 *
 * Range selection components:
 * - Basic slider
 * - Range slider (two handles)
 * - Stepped slider
 * - With marks/labels
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type SliderSize = "sm" | "md" | "lg";

interface SliderProps {
  /** Current value */
  value?: number;
  /** Change callback */
  onChange?: (value: number) => void;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment */
  step?: number;
  /** Size variant */
  size?: SliderSize;
  /** Disabled state */
  disabled?: boolean;
  /** Show value tooltip */
  showTooltip?: boolean;
  /** Custom value formatter */
  formatValue?: (value: number) => string;
  /** Marks to display */
  marks?: { value: number; label?: string }[];
  /** Additional class names */
  className?: string;
}

/**
 * Get size dimensions
 */
function getSizeClasses(size: SliderSize) {
  switch (size) {
    case "sm":
      return { track: 4, thumb: 12 };
    case "lg":
      return { track: 8, thumb: 20 };
    case "md":
    default:
      return { track: 6, thumb: 16 };
  }
}

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Round to nearest step
 */
function roundToStep(value: number, step: number, min: number): number {
  const steps = Math.round((value - min) / step);
  return min + steps * step;
}

/**
 * Basic Slider
 */
export const Slider = memo(function Slider({
  value = 0,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  size = "md",
  disabled = false,
  showTooltip = false,
  formatValue = (v) => v.toString(),
  marks,
  className = "",
}: SliderProps) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const [showTooltipState, setShowTooltipState] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const currentValue = value ?? internalValue;
  const dims = getSizeClasses(size);

  // Calculate percentage
  const percentage = ((currentValue - min) / (max - min)) * 100;

  // Update value from position
  const updateValueFromPosition = useCallback(
    (clientX: number) => {
      if (!trackRef.current || disabled) return;

      const rect = trackRef.current.getBoundingClientRect();
      const percent = clamp((clientX - rect.left) / rect.width, 0, 1);
      const rawValue = min + percent * (max - min);
      const steppedValue = roundToStep(rawValue, step, min);
      const clampedValue = clamp(steppedValue, min, max);

      setInternalValue(clampedValue);
      onChange?.(clampedValue);
    },
    [min, max, step, disabled, onChange]
  );

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      setIsDragging(true);
      setShowTooltipState(true);
      updateValueFromPosition(e.clientX);
    },
    [disabled, updateValueFromPosition]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateValueFromPosition(e.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setShowTooltipState(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, updateValueFromPosition]);

  return (
    <div className={`relative ${className}`}>
      {/* Track */}
      <div
        ref={trackRef}
        className="relative cursor-pointer"
        style={{
          height: dims.track,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Background track */}
        <div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: colors.cream }}
        />

        {/* Filled track */}
        <motion.div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ backgroundColor: colors.coral }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: isDragging ? 0 : 0.1 }}
        />

        {/* Thumb */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 rounded-full shadow-md"
          style={{
            width: dims.thumb,
            height: dims.thumb,
            backgroundColor: "white",
            border: `2px solid ${colors.coral}`,
            cursor: disabled ? "not-allowed" : "grab",
          }}
          animate={{
            left: `calc(${percentage}% - ${dims.thumb / 2}px)`,
            scale: isDragging ? 1.2 : 1,
          }}
          transition={{ duration: isDragging ? 0 : 0.1 }}
          whileHover={!disabled ? { scale: 1.1 } : undefined}
          onMouseEnter={() => showTooltip && setShowTooltipState(true)}
          onMouseLeave={() => !isDragging && setShowTooltipState(false)}
        />

        {/* Tooltip */}
        {showTooltip && showTooltipState && (
          <motion.div
            className="absolute -top-8 px-2 py-1 rounded text-xs font-medium"
            style={{
              left: `${percentage}%`,
              transform: "translateX(-50%)",
              backgroundColor: colors.coral,
              color: "white",
            }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {formatValue(currentValue)}
          </motion.div>
        )}
      </div>

      {/* Marks */}
      {marks && marks.length > 0 && (
        <div className="relative mt-2 h-6">
          {marks.map((mark) => {
            const markPercent = ((mark.value - min) / (max - min)) * 100;
            return (
              <div
                key={mark.value}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${markPercent}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <div
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: colors.textMuted }}
                />
                {mark.label && (
                  <span
                    className="mt-1 text-xs"
                    style={{ color: colors.textMuted }}
                  >
                    {mark.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

/**
 * Range Slider (two handles)
 */
export const RangeSlider = memo(function RangeSlider({
  value = [25, 75],
  onChange,
  min = 0,
  max = 100,
  step = 1,
  size = "md",
  disabled = false,
  showTooltip = false,
  formatValue = (v) => v.toString(),
  minDistance = 0,
  className = "",
}: {
  value?: [number, number];
  onChange?: (value: [number, number]) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: SliderSize;
  disabled?: boolean;
  showTooltip?: boolean;
  formatValue?: (value: number) => string;
  minDistance?: number;
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState<[number, number]>(value);
  const [activeThumb, setActiveThumb] = useState<0 | 1 | null>(null);
  const [showTooltipState, setShowTooltipState] = useState<[boolean, boolean]>([false, false]);
  const trackRef = useRef<HTMLDivElement>(null);
  const currentValue = value ?? internalValue;
  const dims = getSizeClasses(size);

  const percentage1 = ((currentValue[0] - min) / (max - min)) * 100;
  const percentage2 = ((currentValue[1] - min) / (max - min)) * 100;

  const updateValue = useCallback(
    (clientX: number, thumbIndex: 0 | 1) => {
      if (!trackRef.current || disabled) return;

      const rect = trackRef.current.getBoundingClientRect();
      const percent = clamp((clientX - rect.left) / rect.width, 0, 1);
      const rawValue = min + percent * (max - min);
      const steppedValue = roundToStep(rawValue, step, min);

      const newValue: [number, number] = [...currentValue];

      if (thumbIndex === 0) {
        newValue[0] = clamp(steppedValue, min, currentValue[1] - minDistance);
      } else {
        newValue[1] = clamp(steppedValue, currentValue[0] + minDistance, max);
      }

      setInternalValue(newValue);
      onChange?.(newValue);
    },
    [min, max, step, minDistance, disabled, currentValue, onChange]
  );

  useEffect(() => {
    if (activeThumb === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateValue(e.clientX, activeThumb);
    };

    const handleMouseUp = () => {
      setActiveThumb(null);
      setShowTooltipState([false, false]);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeThumb, updateValue]);

  const handleThumbMouseDown = (thumbIndex: 0 | 1) => (e: React.MouseEvent) => {
    if (disabled) return;
    e.stopPropagation();
    setActiveThumb(thumbIndex);
    const newTooltips: [boolean, boolean] = [false, false];
    newTooltips[thumbIndex] = true;
    setShowTooltipState(newTooltips);
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={trackRef}
        className="relative"
        style={{
          height: dims.track,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {/* Background */}
        <div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: colors.cream }}
        />

        {/* Selected range */}
        <motion.div
          className="absolute top-0 h-full rounded-full"
          style={{ backgroundColor: colors.coral }}
          animate={{
            left: `${percentage1}%`,
            width: `${percentage2 - percentage1}%`,
          }}
          transition={{ duration: activeThumb !== null ? 0 : 0.1 }}
        />

        {/* Thumb 1 */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 rounded-full shadow-md z-10"
          style={{
            width: dims.thumb,
            height: dims.thumb,
            backgroundColor: "white",
            border: `2px solid ${colors.coral}`,
            cursor: disabled ? "not-allowed" : "grab",
          }}
          animate={{
            left: `calc(${percentage1}% - ${dims.thumb / 2}px)`,
            scale: activeThumb === 0 ? 1.2 : 1,
          }}
          onMouseDown={handleThumbMouseDown(0)}
          onMouseEnter={() => showTooltip && setShowTooltipState([true, showTooltipState[1]])}
          onMouseLeave={() => activeThumb !== 0 && setShowTooltipState([false, showTooltipState[1]])}
          whileHover={!disabled ? { scale: 1.1 } : undefined}
        />

        {/* Thumb 2 */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 rounded-full shadow-md z-10"
          style={{
            width: dims.thumb,
            height: dims.thumb,
            backgroundColor: "white",
            border: `2px solid ${colors.coral}`,
            cursor: disabled ? "not-allowed" : "grab",
          }}
          animate={{
            left: `calc(${percentage2}% - ${dims.thumb / 2}px)`,
            scale: activeThumb === 1 ? 1.2 : 1,
          }}
          onMouseDown={handleThumbMouseDown(1)}
          onMouseEnter={() => showTooltip && setShowTooltipState([showTooltipState[0], true])}
          onMouseLeave={() => activeThumb !== 1 && setShowTooltipState([showTooltipState[0], false])}
          whileHover={!disabled ? { scale: 1.1 } : undefined}
        />

        {/* Tooltips */}
        {showTooltip && showTooltipState[0] && (
          <motion.div
            className="absolute -top-8 px-2 py-1 rounded text-xs font-medium z-20"
            style={{
              left: `${percentage1}%`,
              transform: "translateX(-50%)",
              backgroundColor: colors.coral,
              color: "white",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {formatValue(currentValue[0])}
          </motion.div>
        )}
        {showTooltip && showTooltipState[1] && (
          <motion.div
            className="absolute -top-8 px-2 py-1 rounded text-xs font-medium z-20"
            style={{
              left: `${percentage2}%`,
              transform: "translateX(-50%)",
              backgroundColor: colors.coral,
              color: "white",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {formatValue(currentValue[1])}
          </motion.div>
        )}
      </div>
    </div>
  );
});

/**
 * Slider with Label
 */
export const LabeledSlider = memo(function LabeledSlider({
  label,
  description,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  size = "md",
  disabled = false,
  showValue = true,
  formatValue = (v) => v.toString(),
  className = "",
}: {
  label: string;
  description?: string;
  value?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: SliderSize;
  disabled?: boolean;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(value ?? min);
  const currentValue = value ?? internalValue;

  const handleChange = useCallback(
    (newValue: number) => {
      setInternalValue(newValue);
      onChange?.(newValue);
    },
    [onChange]
  );

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div
            className="text-sm font-medium"
            style={{ color: colors.textPrimary }}
          >
            {label}
          </div>
          {description && (
            <div
              className="text-xs mt-0.5"
              style={{ color: colors.textMuted }}
            >
              {description}
            </div>
          )}
        </div>
        {showValue && (
          <div
            className="text-sm font-medium tabular-nums"
            style={{ color: colors.coral }}
          >
            {formatValue(currentValue)}
          </div>
        )}
      </div>
      <Slider
        value={currentValue}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        size={size}
        disabled={disabled}
      />
    </div>
  );
});

/**
 * Vertical Slider
 */
export const VerticalSlider = memo(function VerticalSlider({
  value = 0,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  height = 150,
  disabled = false,
  showTooltip = false,
  formatValue = (v) => v.toString(),
  className = "",
}: {
  value?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  height?: number;
  disabled?: boolean;
  showTooltip?: boolean;
  formatValue?: (value: number) => string;
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const [showTooltipState, setShowTooltipState] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const currentValue = value ?? internalValue;

  const percentage = ((currentValue - min) / (max - min)) * 100;

  const updateValueFromPosition = useCallback(
    (clientY: number) => {
      if (!trackRef.current || disabled) return;

      const rect = trackRef.current.getBoundingClientRect();
      const percent = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
      const rawValue = min + percent * (max - min);
      const steppedValue = roundToStep(rawValue, step, min);
      const clampedValue = clamp(steppedValue, min, max);

      setInternalValue(clampedValue);
      onChange?.(clampedValue);
    },
    [min, max, step, disabled, onChange]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      setIsDragging(true);
      setShowTooltipState(true);
      updateValueFromPosition(e.clientY);
    },
    [disabled, updateValueFromPosition]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateValueFromPosition(e.clientY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setShowTooltipState(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, updateValueFromPosition]);

  return (
    <div
      ref={trackRef}
      className={`relative w-2 ${className}`}
      style={{
        height,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Background */}
      <div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: colors.cream }}
      />

      {/* Filled */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 rounded-full"
        style={{ backgroundColor: colors.coral }}
        animate={{ height: `${percentage}%` }}
        transition={{ duration: isDragging ? 0 : 0.1 }}
      />

      {/* Thumb */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full shadow-md"
        style={{
          backgroundColor: "white",
          border: `2px solid ${colors.coral}`,
        }}
        animate={{
          bottom: `calc(${percentage}% - 8px)`,
          scale: isDragging ? 1.2 : 1,
        }}
        transition={{ duration: isDragging ? 0 : 0.1 }}
        onMouseEnter={() => showTooltip && setShowTooltipState(true)}
        onMouseLeave={() => !isDragging && setShowTooltipState(false)}
      />

      {/* Tooltip */}
      {showTooltip && showTooltipState && (
        <motion.div
          className="absolute left-8 px-2 py-1 rounded text-xs font-medium whitespace-nowrap"
          style={{
            bottom: `calc(${percentage}% - 10px)`,
            backgroundColor: colors.coral,
            color: "white",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {formatValue(currentValue)}
        </motion.div>
      )}
    </div>
  );
});

/**
 * Color Slider (Hue selector)
 */
export const ColorSlider = memo(function ColorSlider({
  value = 0,
  onChange,
  size = "md",
  disabled = false,
  className = "",
}: {
  value?: number;
  onChange?: (value: number) => void;
  size?: SliderSize;
  disabled?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const currentValue = value ?? internalValue;
  const dims = getSizeClasses(size);

  const percentage = (currentValue / 360) * 100;

  const updateValue = useCallback(
    (clientX: number) => {
      if (!trackRef.current || disabled) return;

      const rect = trackRef.current.getBoundingClientRect();
      const percent = clamp((clientX - rect.left) / rect.width, 0, 1);
      const hue = Math.round(percent * 360);

      setInternalValue(hue);
      onChange?.(hue);
    },
    [disabled, onChange]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      setIsDragging(true);
      updateValue(e.clientX);
    },
    [disabled, updateValue]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateValue(e.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, updateValue]);

  return (
    <div
      ref={trackRef}
      className={`relative rounded-full ${className}`}
      style={{
        height: dims.track + 4,
        background: "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseDown={handleMouseDown}
    >
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 rounded-full shadow-md"
        style={{
          width: dims.thumb + 4,
          height: dims.thumb + 4,
          backgroundColor: `hsl(${currentValue}, 100%, 50%)`,
          border: "3px solid white",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        }}
        animate={{
          left: `calc(${percentage}% - ${(dims.thumb + 4) / 2}px)`,
          scale: isDragging ? 1.2 : 1,
        }}
        transition={{ duration: isDragging ? 0 : 0.1 }}
      />
    </div>
  );
});

export default Slider;
