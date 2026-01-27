"use client";

/**
 * Number Input Components - Sprint 760
 *
 * Numeric input system:
 * - Stepper input
 * - Slider input
 * - Range slider
 * - Currency input
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  label?: string;
  prefix?: string;
  suffix?: string;
  showButtons?: boolean;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  error?: string;
  className?: string;
}

/**
 * Number Input with Stepper Buttons
 */
export const NumberInput = memo(function NumberInput({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  precision = 0,
  label,
  prefix,
  suffix,
  showButtons = true,
  size = "md",
  disabled = false,
  error,
  className = "",
}: NumberInputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [inputValue, setInputValue] = useState(value.toFixed(precision));

  const sizeStyles = {
    sm: { padding: "6px 10px", fontSize: 14, buttonSize: 28 },
    md: { padding: "10px 14px", fontSize: 14, buttonSize: 36 },
    lg: { padding: "12px 16px", fontSize: 16, buttonSize: 44 },
  };

  const s = sizeStyles[size];

  useEffect(() => {
    setInputValue(value.toFixed(precision));
  }, [value, precision]);

  const clamp = useCallback(
    (val: number) => Math.min(max, Math.max(min, val)),
    [min, max]
  );

  const handleIncrement = useCallback(() => {
    if (disabled) return;
    const newValue = clamp(value + step);
    onChange(parseFloat(newValue.toFixed(precision)));
  }, [value, step, clamp, onChange, precision, disabled]);

  const handleDecrement = useCallback(() => {
    if (disabled) return;
    const newValue = clamp(value - step);
    onChange(parseFloat(newValue.toFixed(precision)));
  }, [value, step, clamp, onChange, precision, disabled]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setInputValue(raw);

      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        const clamped = clamp(parsed);
        onChange(parseFloat(clamped.toFixed(precision)));
      }
    },
    [clamp, onChange, precision]
  );

  const handleBlur = useCallback(() => {
    setFocused(false);
    setInputValue(value.toFixed(precision));
  }, [value, precision]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        handleIncrement();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        handleDecrement();
      }
    },
    [handleIncrement, handleDecrement]
  );

  return (
    <div className={className}>
      {label && (
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}

      <div
        className="flex items-center rounded-xl border-2 overflow-hidden"
        style={{
          borderColor: error ? "#ef4444" : focused ? colors.coral : colors.cream,
          backgroundColor: colors.warmWhite,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {showButtons && (
          <motion.button
            onClick={handleDecrement}
            disabled={disabled || value <= min}
            className="flex items-center justify-center border-r"
            style={{
              width: s.buttonSize,
              height: s.buttonSize,
              borderColor: colors.cream,
              color: value <= min ? colors.textMuted : colors.textPrimary,
              cursor: disabled || value <= min ? "not-allowed" : "pointer",
            }}
            whileHover={{ backgroundColor: colors.cream }}
            whileTap={{ scale: 0.95 }}
          >
            <MinusIcon size={16} />
          </motion.button>
        )}

        <div className="flex-1 flex items-center">
          {prefix && (
            <span className="pl-3" style={{ color: colors.textMuted }}>
              {prefix}
            </span>
          )}
          <input
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="w-full text-center bg-transparent outline-none"
            style={{
              padding: s.padding,
              fontSize: s.fontSize,
              color: colors.textPrimary,
            }}
          />
          {suffix && (
            <span className="pr-3" style={{ color: colors.textMuted }}>
              {suffix}
            </span>
          )}
        </div>

        {showButtons && (
          <motion.button
            onClick={handleIncrement}
            disabled={disabled || value >= max}
            className="flex items-center justify-center border-l"
            style={{
              width: s.buttonSize,
              height: s.buttonSize,
              borderColor: colors.cream,
              color: value >= max ? colors.textMuted : colors.textPrimary,
              cursor: disabled || value >= max ? "not-allowed" : "pointer",
            }}
            whileHover={{ backgroundColor: colors.cream }}
            whileTap={{ scale: 0.95 }}
          >
            <PlusIcon size={16} />
          </motion.button>
        )}
      </div>

      {error && (
        <p className="text-xs mt-1" style={{ color: "#ef4444" }}>
          {error}
        </p>
      )}
    </div>
  );
});

interface SliderInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  showValue?: boolean;
  showTicks?: boolean;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

/**
 * Slider Input
 */
export const SliderInput = memo(function SliderInput({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = true,
  showTicks = false,
  formatValue,
  disabled = false,
  className = "",
}: SliderInputProps) {
  const { colors } = useTheme();
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const percentage = ((value - min) / (max - min)) * 100;

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || !trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = x / rect.width;
      const newValue = min + pct * (max - min);
      const stepped = Math.round(newValue / step) * step;
      onChange(Math.min(max, Math.max(min, stepped)));
    },
    [min, max, step, onChange, disabled]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      setIsDragging(true);
    },
    [disabled]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
      const pct = x / rect.width;
      const newValue = min + pct * (max - min);
      const stepped = Math.round(newValue / step) * step;
      onChange(Math.min(max, Math.max(min, stepped)));
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
  }, [isDragging, min, max, step, onChange]);

  const displayValue = formatValue ? formatValue(value) : value.toString();

  const tickCount = Math.min(10, (max - min) / step);
  const ticks = showTicks
    ? Array.from({ length: tickCount + 1 }, (_, i) => min + (i * (max - min)) / tickCount)
    : [];

  return (
    <div className={className} style={{ opacity: disabled ? 0.6 : 1 }}>
      {(label || showValue) && (
        <div className="flex justify-between mb-2">
          {label && (
            <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>
              {label}
            </span>
          )}
          {showValue && (
            <span className="text-sm font-mono" style={{ color: colors.coral }}>
              {displayValue}
            </span>
          )}
        </div>
      )}

      <div
        ref={trackRef}
        onClick={handleTrackClick}
        className="relative h-2 rounded-full cursor-pointer"
        style={{ backgroundColor: colors.cream }}
      >
        <motion.div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ backgroundColor: colors.coral, width: percentage + "%" }}
        />

        <motion.div
          onMouseDown={handleMouseDown}
          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full shadow-md cursor-grab active:cursor-grabbing"
          style={{
            backgroundColor: colors.coral,
            left: "calc(" + percentage + "% - 10px)",
            boxShadow: isDragging ? "0 0 0 4px " + colors.coral + "40" : undefined,
          }}
          whileHover={{ scale: 1.1 }}
        />

        {showTicks && (
          <div className="absolute w-full top-4 flex justify-between px-2">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="text-xs"
                style={{ color: colors.textMuted }}
              >
                {formatValue ? formatValue(tick) : tick}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

interface RangeSliderProps {
  value: [number, number];
  onChange: (value: [number, number]) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

/**
 * Range Slider (Two Thumbs)
 */
export const RangeSlider = memo(function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  formatValue,
  disabled = false,
  className = "",
}: RangeSliderProps) {
  const { colors } = useTheme();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);

  const minPct = ((value[0] - min) / (max - min)) * 100;
  const maxPct = ((value[1] - min) / (max - min)) * 100;

  const handleMouseDown = useCallback(
    (thumb: "min" | "max") => (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      setDragging(thumb);
    },
    [disabled]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
      const pct = x / rect.width;
      const newValue = min + pct * (max - min);
      const stepped = Math.round(newValue / step) * step;

      if (dragging === "min") {
        onChange([Math.min(stepped, value[1] - step), value[1]]);
      } else {
        onChange([value[0], Math.max(stepped, value[0] + step)]);
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, min, max, step, value, onChange]);

  const format = formatValue || ((v: number) => v.toString());

  return (
    <div className={className} style={{ opacity: disabled ? 0.6 : 1 }}>
      {label && (
        <div className="flex justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>
            {label}
          </span>
          <span className="text-sm font-mono" style={{ color: colors.coral }}>
            {format(value[0])} - {format(value[1])}
          </span>
        </div>
      )}

      <div
        ref={trackRef}
        className="relative h-2 rounded-full"
        style={{ backgroundColor: colors.cream }}
      >
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            backgroundColor: colors.coral,
            left: minPct + "%",
            width: (maxPct - minPct) + "%",
          }}
        />

        <motion.div
          onMouseDown={handleMouseDown("min")}
          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full shadow-md cursor-grab active:cursor-grabbing z-10"
          style={{
            backgroundColor: colors.warmWhite,
            border: "2px solid " + colors.coral,
            left: "calc(" + minPct + "% - 10px)",
            boxShadow: dragging === "min" ? "0 0 0 4px " + colors.coral + "40" : undefined,
          }}
          whileHover={{ scale: 1.1 }}
        />

        <motion.div
          onMouseDown={handleMouseDown("max")}
          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full shadow-md cursor-grab active:cursor-grabbing z-10"
          style={{
            backgroundColor: colors.warmWhite,
            border: "2px solid " + colors.coral,
            left: "calc(" + maxPct + "% - 10px)",
            boxShadow: dragging === "max" ? "0 0 0 4px " + colors.coral + "40" : undefined,
          }}
          whileHover={{ scale: 1.1 }}
        />
      </div>
    </div>
  );
});

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  currency?: string;
  locale?: string;
  min?: number;
  max?: number;
  label?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
}

/**
 * Currency Input
 */
export const CurrencyInput = memo(function CurrencyInput({
  value,
  onChange,
  currency = "USD",
  locale = "en-US",
  min = 0,
  max = Infinity,
  label,
  disabled = false,
  error,
  className = "",
}: CurrencyInputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });

  const currencySymbol = formatter.formatToParts(0).find((p) => p.type === "currency")?.value || "$";

  useEffect(() => {
    if (!focused) {
      setInputValue(value.toFixed(2));
    }
  }, [value, focused]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^\d.]/g, "");
      setInputValue(raw);

      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        const clamped = Math.min(max, Math.max(min, parsed));
        onChange(clamped);
      }
    },
    [min, max, onChange]
  );

  const handleBlur = useCallback(() => {
    setFocused(false);
    setInputValue(value.toFixed(2));
  }, [value]);

  return (
    <div className={className}>
      {label && (
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}

      <div
        className="flex items-center rounded-xl border-2 overflow-hidden"
        style={{
          borderColor: error ? "#ef4444" : focused ? colors.coral : colors.cream,
          backgroundColor: colors.warmWhite,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span
          className="px-3 py-2 border-r"
          style={{
            borderColor: colors.cream,
            backgroundColor: colors.cream,
            color: colors.textMuted,
          }}
        >
          {currencySymbol}
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          disabled={disabled}
          className="flex-1 px-4 py-3 bg-transparent outline-none text-right"
          style={{ color: colors.textPrimary }}
        />
      </div>

      {error && (
        <p className="text-xs mt-1" style={{ color: "#ef4444" }}>
          {error}
        </p>
      )}
    </div>
  );
});

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Quantity Selector (Compact Stepper)
 */
export const QuantitySelector = memo(function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
  className = "",
}: QuantitySelectorProps) {
  const { colors } = useTheme();

  const handleDecrement = useCallback(() => {
    if (value > min) onChange(value - 1);
  }, [value, min, onChange]);

  const handleIncrement = useCallback(() => {
    if (value < max) onChange(value + 1);
  }, [value, max, onChange]);

  return (
    <div
      className={"inline-flex items-center rounded-full overflow-hidden " + className}
      style={{
        backgroundColor: colors.cream,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <motion.button
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        className="w-8 h-8 flex items-center justify-center"
        style={{
          color: value <= min ? colors.textMuted : colors.textPrimary,
          cursor: disabled || value <= min ? "not-allowed" : "pointer",
        }}
        whileHover={{ backgroundColor: colors.warmWhite }}
        whileTap={{ scale: 0.9 }}
      >
        <MinusIcon size={14} />
      </motion.button>

      <span
        className="w-10 text-center font-medium"
        style={{ color: colors.textPrimary }}
      >
        {value}
      </span>

      <motion.button
        onClick={handleIncrement}
        disabled={disabled || value >= max}
        className="w-8 h-8 flex items-center justify-center"
        style={{
          color: value >= max ? colors.textMuted : colors.textPrimary,
          cursor: disabled || value >= max ? "not-allowed" : "pointer",
        }}
        whileHover={{ backgroundColor: colors.warmWhite }}
        whileTap={{ scale: 0.9 }}
      >
        <PlusIcon size={14} />
      </motion.button>
    </div>
  );
});

// Icons
const PlusIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const MinusIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default NumberInput;
