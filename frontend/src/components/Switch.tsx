"use client";

/**
 * Switch/Toggle Components - Sprint 610
 *
 * On/off toggles and switches:
 * - Basic switch
 * - Switch with label
 * - Radio group
 * - Checkbox
 * - HER-themed styling
 */

import React, { memo, useCallback, useState, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type SwitchSize = "sm" | "md" | "lg";

interface SwitchProps {
  /** Whether switch is on */
  checked?: boolean;
  /** Change callback */
  onChange?: (checked: boolean) => void;
  /** Size variant */
  size?: SwitchSize;
  /** Whether switch is disabled */
  disabled?: boolean;
  /** Active color override */
  activeColor?: string;
  /** Additional class names */
  className?: string;
}

/**
 * Get size dimensions
 */
function getSwitchSize(size: SwitchSize) {
  switch (size) {
    case "sm":
      return { width: 36, height: 20, thumb: 16, padding: 2 };
    case "lg":
      return { width: 60, height: 32, thumb: 28, padding: 2 };
    case "md":
    default:
      return { width: 48, height: 26, thumb: 22, padding: 2 };
  }
}

/**
 * Basic Switch
 */
export const Switch = memo(function Switch({
  checked = false,
  onChange,
  size = "md",
  disabled = false,
  activeColor,
  className = "",
}: SwitchProps) {
  const { colors } = useTheme();
  const [internalChecked, setInternalChecked] = useState(checked);
  const isChecked = checked ?? internalChecked;
  const dims = getSwitchSize(size);
  const color = activeColor || colors.coral;

  const handleToggle = useCallback(() => {
    if (disabled) return;
    const newChecked = !isChecked;
    setInternalChecked(newChecked);
    onChange?.(newChecked);
  }, [isChecked, disabled, onChange]);

  return (
    <motion.button
      className={`relative rounded-full transition-colors ${className}`}
      style={{
        width: dims.width,
        height: dims.height,
        backgroundColor: isChecked ? color : colors.cream,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onClick={handleToggle}
      disabled={disabled}
      role="switch"
      aria-checked={isChecked}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
    >
      <motion.div
        className="absolute rounded-full shadow-sm"
        style={{
          width: dims.thumb,
          height: dims.thumb,
          top: dims.padding,
          backgroundColor: "white",
        }}
        animate={{
          x: isChecked ? dims.width - dims.thumb - dims.padding : dims.padding,
        }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </motion.button>
  );
});

/**
 * Switch with Label
 */
export const LabeledSwitch = memo(function LabeledSwitch({
  label,
  description,
  checked,
  onChange,
  size = "md",
  disabled = false,
  className = "",
}: {
  label: string;
  description?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: SwitchSize;
  disabled?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <label
      className={`flex items-center justify-between gap-4 ${className}`}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div>
        <div
          className="font-medium text-sm"
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
      <Switch
        checked={checked}
        onChange={onChange}
        size={size}
        disabled={disabled}
      />
    </label>
  );
});

/**
 * Checkbox
 */
export const Checkbox = memo(function Checkbox({
  checked = false,
  onChange,
  size = "md",
  disabled = false,
  indeterminate = false,
  className = "",
}: {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: SwitchSize;
  disabled?: boolean;
  indeterminate?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalChecked, setInternalChecked] = useState(checked);
  const isChecked = checked ?? internalChecked;

  const sizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };
  const boxSize = sizes[size];

  const handleToggle = useCallback(() => {
    if (disabled) return;
    const newChecked = !isChecked;
    setInternalChecked(newChecked);
    onChange?.(newChecked);
  }, [isChecked, disabled, onChange]);

  return (
    <motion.button
      className={`relative rounded-md transition-colors ${className}`}
      style={{
        width: boxSize,
        height: boxSize,
        backgroundColor: isChecked || indeterminate ? colors.coral : "transparent",
        border: `2px solid ${isChecked || indeterminate ? colors.coral : colors.textMuted}`,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onClick={handleToggle}
      disabled={disabled}
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : isChecked}
      whileTap={!disabled ? { scale: 0.9 } : undefined}
    >
      {isChecked && !indeterminate && (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3"
          className="absolute inset-0 p-0.5"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <polyline points="20 6 9 17 4 12" />
        </motion.svg>
      )}
      {indeterminate && (
        <motion.div
          className="absolute bg-white rounded-sm"
          style={{
            width: boxSize * 0.5,
            height: 2,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
        />
      )}
    </motion.button>
  );
});

/**
 * Checkbox with Label
 */
export const LabeledCheckbox = memo(function LabeledCheckbox({
  label,
  description,
  checked,
  onChange,
  size = "md",
  disabled = false,
  className = "",
}: {
  label: string;
  description?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: SwitchSize;
  disabled?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <label
      className={`flex items-start gap-3 ${className}`}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Checkbox
        checked={checked}
        onChange={onChange}
        size={size}
        disabled={disabled}
      />
      <div>
        <div
          className="font-medium text-sm"
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
    </label>
  );
});

/**
 * Radio Button
 */
export const Radio = memo(function Radio({
  checked = false,
  onChange,
  size = "md",
  disabled = false,
  className = "",
}: {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: SwitchSize;
  disabled?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();

  const sizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };
  const circleSize = sizes[size];
  const innerSize = circleSize * 0.5;

  return (
    <motion.button
      className={`relative rounded-full transition-colors ${className}`}
      style={{
        width: circleSize,
        height: circleSize,
        backgroundColor: "transparent",
        border: `2px solid ${checked ? colors.coral : colors.textMuted}`,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onClick={() => !disabled && onChange?.(!checked)}
      disabled={disabled}
      role="radio"
      aria-checked={checked}
      whileTap={!disabled ? { scale: 0.9 } : undefined}
    >
      {checked && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: innerSize,
            height: innerSize,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: colors.coral,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
        />
      )}
    </motion.button>
  );
});

/**
 * Radio Group
 */
export const RadioGroup = memo(function RadioGroup({
  options,
  value,
  onChange,
  name,
  size = "md",
  disabled = false,
  className = "",
}: {
  options: Array<{ value: string; label: string; description?: string }>;
  value?: string;
  onChange?: (value: string) => void;
  name: string;
  size?: SwitchSize;
  disabled?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(value || options[0]?.value);
  const selectedValue = value ?? internalValue;

  const handleChange = useCallback(
    (newValue: string) => {
      if (disabled) return;
      setInternalValue(newValue);
      onChange?.(newValue);
    },
    [disabled, onChange]
  );

  return (
    <div className={`space-y-2 ${className}`} role="radiogroup">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex items-start gap-3"
          style={{
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Radio
            checked={selectedValue === option.value}
            onChange={() => handleChange(option.value)}
            size={size}
            disabled={disabled}
          />
          <div>
            <div
              className="font-medium text-sm"
              style={{ color: colors.textPrimary }}
            >
              {option.label}
            </div>
            {option.description && (
              <div
                className="text-xs mt-0.5"
                style={{ color: colors.textMuted }}
              >
                {option.description}
              </div>
            )}
          </div>
        </label>
      ))}
    </div>
  );
});

/**
 * Toggle Button Group
 */
export const ToggleGroup = memo(function ToggleGroup({
  options,
  value,
  onChange,
  size = "md",
  className = "",
}: {
  options: Array<{ value: string; label: string; icon?: ReactNode }>;
  value?: string;
  onChange?: (value: string) => void;
  size?: SwitchSize;
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(value || options[0]?.value);
  const selectedValue = value ?? internalValue;

  const sizes = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
    lg: "px-4 py-2 text-base",
  };

  const handleChange = useCallback(
    (newValue: string) => {
      setInternalValue(newValue);
      onChange?.(newValue);
    },
    [onChange]
  );

  return (
    <div
      className={`inline-flex p-1 rounded-xl ${className}`}
      style={{ backgroundColor: colors.cream }}
      role="group"
    >
      {options.map((option) => (
        <motion.button
          key={option.value}
          className={`relative rounded-lg font-medium ${sizes[size]} flex items-center gap-1.5`}
          style={{
            backgroundColor: selectedValue === option.value ? colors.warmWhite : "transparent",
            color: selectedValue === option.value ? colors.coral : colors.textSecondary,
            boxShadow: selectedValue === option.value ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
          onClick={() => handleChange(option.value)}
          whileTap={{ scale: 0.95 }}
        >
          {option.icon}
          {option.label}
        </motion.button>
      ))}
    </div>
  );
});

export default Switch;
