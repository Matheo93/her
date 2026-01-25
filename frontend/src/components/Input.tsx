"use client";

/**
 * Input Components - Sprint 612
 *
 * Form input fields:
 * - Text input
 * - Textarea
 * - Search input
 * - Password input
 * - Number input
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  forwardRef,
  ReactNode,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type InputSize = "sm" | "md" | "lg";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Label text */
  label?: string;
  /** Helper text */
  helper?: string;
  /** Error message */
  error?: string;
  /** Left icon */
  leftIcon?: ReactNode;
  /** Right icon */
  rightIcon?: ReactNode;
  /** Size variant */
  size?: InputSize;
  /** Full width */
  fullWidth?: boolean;
}

/**
 * Get size classes
 */
function getSizeClasses(size: InputSize) {
  switch (size) {
    case "sm":
      return { input: "px-3 py-1.5 text-sm", icon: 16 };
    case "lg":
      return { input: "px-4 py-3 text-base", icon: 22 };
    case "md":
    default:
      return { input: "px-3 py-2 text-sm", icon: 18 };
  }
}

/**
 * Text Input
 */
export const Input = memo(
  forwardRef<HTMLInputElement, InputProps>(function Input(
    {
      label,
      helper,
      error,
      leftIcon,
      rightIcon,
      size = "md",
      fullWidth = false,
      disabled,
      className = "",
      ...props
    },
    ref
  ) {
    const { colors } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const sizeClasses = getSizeClasses(size);

    const borderColor = error
      ? colors.error || "#FF4444"
      : isFocused
      ? colors.coral
      : colors.cream;

    return (
      <div className={`${fullWidth ? "w-full" : ""} ${className}`}>
        {label && (
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: colors.textPrimary }}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: colors.textMuted }}
            >
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            className={`
              w-full rounded-xl outline-none transition-colors
              ${sizeClasses.input}
              ${leftIcon ? "pl-10" : ""}
              ${rightIcon ? "pr-10" : ""}
            `}
            style={{
              backgroundColor: colors.warmWhite,
              border: `2px solid ${borderColor}`,
              color: colors.textPrimary,
              opacity: disabled ? 0.5 : 1,
            }}
            disabled={disabled}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...props}
          />
          {rightIcon && (
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: colors.textMuted }}
            >
              {rightIcon}
            </span>
          )}
        </div>
        <AnimatePresence>
          {(helper || error) && (
            <motion.p
              className="text-xs mt-1"
              style={{ color: error ? colors.error || "#FF4444" : colors.textMuted }}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
            >
              {error || helper}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  })
);

/**
 * Textarea
 */
export const Textarea = memo(
  forwardRef<HTMLTextAreaElement, {
    label?: string;
    helper?: string;
    error?: string;
    rows?: number;
    fullWidth?: boolean;
    className?: string;
  } & TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
    {
      label,
      helper,
      error,
      rows = 4,
      fullWidth = false,
      disabled,
      className = "",
      ...props
    },
    ref
  ) {
    const { colors } = useTheme();
    const [isFocused, setIsFocused] = useState(false);

    const borderColor = error
      ? colors.error || "#FF4444"
      : isFocused
      ? colors.coral
      : colors.cream;

    return (
      <div className={`${fullWidth ? "w-full" : ""} ${className}`}>
        {label && (
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: colors.textPrimary }}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          rows={rows}
          className="w-full px-3 py-2 text-sm rounded-xl outline-none transition-colors resize-none"
          style={{
            backgroundColor: colors.warmWhite,
            border: `2px solid ${borderColor}`,
            color: colors.textPrimary,
            opacity: disabled ? 0.5 : 1,
          }}
          disabled={disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        <AnimatePresence>
          {(helper || error) && (
            <motion.p
              className="text-xs mt-1"
              style={{ color: error ? colors.error || "#FF4444" : colors.textMuted }}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
            >
              {error || helper}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  })
);

/**
 * Search Input
 */
export const SearchInput = memo(function SearchInput({
  value,
  onChange,
  placeholder = "Rechercher...",
  onClear,
  size = "md",
  fullWidth = false,
  className = "",
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  size?: InputSize;
  fullWidth?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(value || "");
  const currentValue = value ?? internalValue;
  const sizeClasses = getSizeClasses(size);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInternalValue(newValue);
      onChange?.(newValue);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    setInternalValue("");
    onChange?.("");
    onClear?.();
  }, [onChange, onClear]);

  return (
    <div className={`relative ${fullWidth ? "w-full" : ""} ${className}`}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2"
        width={sizeClasses.icon}
        height={sizeClasses.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.textMuted}
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={currentValue}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full rounded-xl outline-none transition-colors pl-10 ${
          currentValue ? "pr-10" : ""
        } ${sizeClasses.input}`}
        style={{
          backgroundColor: colors.cream,
          color: colors.textPrimary,
        }}
      />
      <AnimatePresence>
        {currentValue && (
          <motion.button
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full"
            style={{ backgroundColor: colors.textMuted, color: "white" }}
            onClick={handleClear}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Password Input
 */
export const PasswordInput = memo(function PasswordInput({
  label,
  helper,
  error,
  size = "md",
  fullWidth = false,
  className = "",
  ...props
}: Omit<InputProps, "type">) {
  const { colors } = useTheme();
  const [showPassword, setShowPassword] = useState(false);

  const EyeIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {showPassword ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );

  return (
    <Input
      {...props}
      type={showPassword ? "text" : "password"}
      label={label}
      helper={helper}
      error={error}
      size={size}
      fullWidth={fullWidth}
      className={className}
      rightIcon={
        <motion.button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          style={{ color: colors.textMuted }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          tabIndex={-1}
        >
          <EyeIcon />
        </motion.button>
      }
    />
  );
});

/**
 * Number Input
 */
export const NumberInput = memo(function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  helper,
  error,
  size = "md",
  fullWidth = false,
  className = "",
}: {
  value?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  helper?: string;
  error?: string;
  size?: InputSize;
  fullWidth?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(value || 0);
  const currentValue = value ?? internalValue;
  const sizeClasses = getSizeClasses(size);

  const handleChange = useCallback(
    (newValue: number) => {
      let clamped = newValue;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      setInternalValue(clamped);
      onChange?.(clamped);
    },
    [min, max, onChange]
  );

  return (
    <div className={`${fullWidth ? "w-full" : ""} ${className}`}>
      {label && (
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <motion.button
          className="p-2 rounded-lg"
          style={{
            backgroundColor: colors.cream,
            color: colors.textPrimary,
          }}
          onClick={() => handleChange(currentValue - step)}
          disabled={min !== undefined && currentValue <= min}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </motion.button>
        <input
          type="number"
          value={currentValue}
          onChange={(e) => handleChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className={`w-20 text-center rounded-xl outline-none ${sizeClasses.input}`}
          style={{
            backgroundColor: colors.warmWhite,
            border: `2px solid ${error ? colors.error || "#FF4444" : colors.cream}`,
            color: colors.textPrimary,
          }}
        />
        <motion.button
          className="p-2 rounded-lg"
          style={{
            backgroundColor: colors.cream,
            color: colors.textPrimary,
          }}
          onClick={() => handleChange(currentValue + step)}
          disabled={max !== undefined && currentValue >= max}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </motion.button>
      </div>
      <AnimatePresence>
        {(helper || error) && (
          <motion.p
            className="text-xs mt-1"
            style={{ color: error ? colors.error || "#FF4444" : colors.textMuted }}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            {error || helper}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

export default Input;
