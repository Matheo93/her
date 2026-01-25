"use client";

/**
 * Floating Label Components - Sprint 706
 *
 * Material-style floating labels:
 * - Float on focus
 * - Animated transitions
 * - Validation states
 * - Multiple input types
 * - HER-themed styling
 */

import React, { memo, useState, useRef, forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface FloatingInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  error?: string;
  hint?: string;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  size?: "sm" | "md" | "lg";
}

/**
 * Floating Label Input
 */
export const FloatingInput = memo(
  forwardRef<HTMLInputElement, FloatingInputProps>(function FloatingInput(
    {
      label,
      error,
      hint,
      startIcon,
      endIcon,
      size = "md",
      className = "",
      ...props
    },
    ref
  ) {
    const { colors } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = !!props.value || !!props.defaultValue;

    const shouldFloat = isFocused || hasValue || !!props.placeholder;

    const sizes = {
      sm: { height: 40, padding: "12px", fontSize: 14, labelSize: 12 },
      md: { height: 48, padding: "16px", fontSize: 16, labelSize: 14 },
      lg: { height: 56, padding: "20px", fontSize: 18, labelSize: 16 },
    };

    const s = sizes[size];

    return (
      <div className={"relative " + className}>
        <div
          className="relative rounded-lg overflow-hidden"
          style={{
            height: s.height,
            border: `2px solid ${error ? "#EF4444" : isFocused ? colors.coral : colors.cream}`,
            backgroundColor: colors.warmWhite,
            transition: "border-color 0.2s",
          }}
        >
          {/* Start Icon */}
          {startIcon && (
            <div
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: colors.textMuted }}
            >
              {startIcon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            {...props}
            className="w-full h-full bg-transparent outline-none"
            style={{
              paddingLeft: startIcon ? 40 : s.padding,
              paddingRight: endIcon ? 40 : s.padding,
              paddingTop: shouldFloat ? 18 : 0,
              fontSize: s.fontSize,
              color: colors.textPrimary,
            }}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
          />

          {/* Floating Label */}
          <motion.label
            className="absolute pointer-events-none"
            style={{
              left: startIcon ? 40 : s.padding,
              color: error ? "#EF4444" : isFocused ? colors.coral : colors.textMuted,
            }}
            initial={false}
            animate={{
              y: shouldFloat ? 8 : s.height / 2 - 10,
              scale: shouldFloat ? 0.75 : 1,
              originX: 0,
            }}
            transition={{ duration: 0.15 }}
          >
            {label}
          </motion.label>

          {/* End Icon */}
          {endIcon && (
            <div
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: colors.textMuted }}
            >
              {endIcon}
            </div>
          )}
        </div>

        {/* Error / Hint */}
        <AnimatePresence>
          {(error || hint) && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="mt-1 text-xs"
              style={{ color: error ? "#EF4444" : colors.textMuted }}
            >
              {error || hint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  })
);

interface FloatingTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  label: string;
  error?: string;
  hint?: string;
  minRows?: number;
  maxRows?: number;
}

/**
 * Floating Label Textarea
 */
export const FloatingTextarea = memo(
  forwardRef<HTMLTextAreaElement, FloatingTextareaProps>(function FloatingTextarea(
    {
      label,
      error,
      hint,
      minRows = 3,
      maxRows = 10,
      className = "",
      ...props
    },
    ref
  ) {
    const { colors } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = !!props.value || !!props.defaultValue;

    const shouldFloat = isFocused || hasValue || !!props.placeholder;

    return (
      <div className={"relative " + className}>
        <div
          className="relative rounded-lg overflow-hidden"
          style={{
            border: `2px solid ${error ? "#EF4444" : isFocused ? colors.coral : colors.cream}`,
            backgroundColor: colors.warmWhite,
            transition: "border-color 0.2s",
          }}
        >
          {/* Textarea */}
          <textarea
            ref={ref}
            {...props}
            className="w-full bg-transparent outline-none resize-none"
            style={{
              padding: 16,
              paddingTop: shouldFloat ? 24 : 16,
              fontSize: 16,
              color: colors.textPrimary,
              minHeight: minRows * 24 + 32,
              maxHeight: maxRows * 24 + 32,
            }}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
          />

          {/* Floating Label */}
          <motion.label
            className="absolute pointer-events-none left-4"
            style={{
              color: error ? "#EF4444" : isFocused ? colors.coral : colors.textMuted,
            }}
            initial={false}
            animate={{
              y: shouldFloat ? 8 : 20,
              scale: shouldFloat ? 0.75 : 1,
              originX: 0,
            }}
            transition={{ duration: 0.15 }}
          >
            {label}
          </motion.label>
        </div>

        {/* Error / Hint */}
        <AnimatePresence>
          {(error || hint) && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="mt-1 text-xs"
              style={{ color: error ? "#EF4444" : colors.textMuted }}
            >
              {error || hint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  })
);

interface FloatingSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface FloatingSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label: string;
  options: FloatingSelectOption[];
  error?: string;
  hint?: string;
  size?: "sm" | "md" | "lg";
  placeholder?: string;
}

/**
 * Floating Label Select
 */
export const FloatingSelect = memo(
  forwardRef<HTMLSelectElement, FloatingSelectProps>(function FloatingSelect(
    {
      label,
      options,
      error,
      hint,
      size = "md",
      placeholder,
      className = "",
      ...props
    },
    ref
  ) {
    const { colors } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = !!props.value && props.value !== "";

    const shouldFloat = isFocused || hasValue;

    const sizes = {
      sm: { height: 40, padding: 12, fontSize: 14 },
      md: { height: 48, padding: 16, fontSize: 16 },
      lg: { height: 56, padding: 20, fontSize: 18 },
    };

    const s = sizes[size];

    return (
      <div className={"relative " + className}>
        <div
          className="relative rounded-lg overflow-hidden"
          style={{
            height: s.height,
            border: `2px solid ${error ? "#EF4444" : isFocused ? colors.coral : colors.cream}`,
            backgroundColor: colors.warmWhite,
            transition: "border-color 0.2s",
          }}
        >
          {/* Select */}
          <select
            ref={ref}
            {...props}
            className="w-full h-full bg-transparent outline-none appearance-none cursor-pointer"
            style={{
              paddingLeft: s.padding,
              paddingRight: 40,
              paddingTop: shouldFloat ? 14 : 0,
              fontSize: s.fontSize,
              color: hasValue ? colors.textPrimary : "transparent",
            }}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Floating Label */}
          <motion.label
            className="absolute pointer-events-none"
            style={{
              left: s.padding,
              color: error ? "#EF4444" : isFocused ? colors.coral : colors.textMuted,
            }}
            initial={false}
            animate={{
              y: shouldFloat ? 6 : s.height / 2 - 10,
              scale: shouldFloat ? 0.75 : 1,
              originX: 0,
            }}
            transition={{ duration: 0.15 }}
          >
            {label}
          </motion.label>

          {/* Arrow */}
          <div
            className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: colors.textMuted }}
          >
            <motion.svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              animate={{ rotate: isFocused ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <path d="M6 9l6 6 6-6" />
            </motion.svg>
          </div>
        </div>

        {/* Error / Hint */}
        <AnimatePresence>
          {(error || hint) && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="mt-1 text-xs"
              style={{ color: error ? "#EF4444" : colors.textMuted }}
            >
              {error || hint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  })
);

interface FloatingPasswordProps extends Omit<FloatingInputProps, "type"> {}

/**
 * Floating Label Password with toggle
 */
export const FloatingPassword = memo(
  forwardRef<HTMLInputElement, FloatingPasswordProps>(function FloatingPassword(
    props,
    ref
  ) {
    const { colors } = useTheme();
    const [showPassword, setShowPassword] = useState(false);

    return (
      <FloatingInput
        ref={ref}
        {...props}
        type={showPassword ? "text" : "password"}
        endIcon={
          <motion.button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="p-1"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </motion.button>
        }
      />
    );
  })
);

interface FloatingSearchProps extends Omit<FloatingInputProps, "type"> {
  onSearch?: (value: string) => void;
}

/**
 * Floating Label Search
 */
export const FloatingSearch = memo(
  forwardRef<HTMLInputElement, FloatingSearchProps>(function FloatingSearch(
    { onSearch, ...props },
    ref
  ) {
    const { colors } = useTheme();

    return (
      <FloatingInput
        ref={ref}
        {...props}
        type="search"
        startIcon={<SearchIcon />}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSearch?.((e.target as HTMLInputElement).value);
          }
          props.onKeyDown?.(e);
        }}
      />
    );
  })
);

// Icons
function EyeIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1={1} y1={1} x2={23} y2={23} />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={11} cy={11} r={8} />
      <line x1={21} y1={21} x2={16.65} y2={16.65} />
    </svg>
  );
}

export default FloatingInput;
