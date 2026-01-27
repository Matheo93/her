"use client";

/**
 * Segmented Control Components - Sprint 756
 *
 * Toggle button groups:
 * - Single select
 * - Multi select
 * - Icon buttons
 * - Sizes and variants
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface SegmentOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md" | "lg";
  variant?: "filled" | "outline" | "ghost";
  fullWidth?: boolean;
  className?: string;
}

/**
 * Segmented Control (Single Select)
 */
export const SegmentedControl = memo(function SegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  variant = "filled",
  fullWidth = false,
  className = "",
}: SegmentedControlProps) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const sizeStyles = {
    sm: { padding: "6px 12px", fontSize: 13, height: 32 },
    md: { padding: "8px 16px", fontSize: 14, height: 40 },
    lg: { padding: "10px 20px", fontSize: 15, height: 48 },
  };

  const variantStyles = {
    filled: {
      container: colors.cream,
      active: colors.coral,
      activeText: colors.warmWhite,
      inactiveText: colors.textPrimary,
    },
    outline: {
      container: "transparent",
      active: colors.coral,
      activeText: colors.warmWhite,
      inactiveText: colors.textPrimary,
    },
    ghost: {
      container: "transparent",
      active: colors.cream,
      activeText: colors.coral,
      inactiveText: colors.textMuted,
    },
  };

  const styles = variantStyles[variant];

  // Update indicator position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeIndex = options.findIndex((opt) => opt.value === value);
    if (activeIndex === -1) return;

    const buttons = container.querySelectorAll("button");
    const activeButton = buttons[activeIndex] as HTMLButtonElement;

    if (activeButton) {
      setIndicatorStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      });
    }
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      className={"relative inline-flex rounded-xl p-1 " + (fullWidth ? "w-full " : "") + className}
      style={{
        backgroundColor: styles.container,
        border: variant === "outline" ? "1px solid " + colors.cream : "none",
      }}
    >
      {/* Sliding indicator */}
      {variant !== "ghost" && (
        <motion.div
          className="absolute rounded-lg"
          style={{
            backgroundColor: styles.active,
            height: sizeStyles[size].height - 8,
            top: 4,
          }}
          animate={{
            left: indicatorStyle.left,
            width: indicatorStyle.width,
          }}
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}

      {/* Options */}
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            onClick={() => !option.disabled && onChange(option.value)}
            disabled={option.disabled}
            className={"relative z-10 flex items-center justify-center gap-2 rounded-lg font-medium transition-colors " + (fullWidth ? "flex-1 " : "")}
            style={{
              ...sizeStyles[size],
              color: isActive ? styles.activeText : styles.inactiveText,
              opacity: option.disabled ? 0.5 : 1,
              cursor: option.disabled ? "not-allowed" : "pointer",
              backgroundColor: variant === "ghost" && isActive ? styles.active : "transparent",
            }}
          >
            {option.icon && <span className="w-4 h-4">{option.icon}</span>}
            {option.label}
          </button>
        );
      })}
    </div>
  );
});

interface MultiSegmentedControlProps {
  options: SegmentOption[];
  value: string[];
  onChange: (value: string[]) => void;
  size?: "sm" | "md" | "lg";
  variant?: "filled" | "outline" | "ghost";
  min?: number;
  max?: number;
  className?: string;
}

/**
 * Multi Segmented Control (Multi Select)
 */
export const MultiSegmentedControl = memo(function MultiSegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  variant = "filled",
  min = 0,
  max = Infinity,
  className = "",
}: MultiSegmentedControlProps) {
  const { colors } = useTheme();

  const sizeStyles = {
    sm: { padding: "6px 12px", fontSize: 13, height: 32 },
    md: { padding: "8px 16px", fontSize: 14, height: 40 },
    lg: { padding: "10px 20px", fontSize: 15, height: 48 },
  };

  const handleToggle = useCallback(
    (optionValue: string) => {
      const isSelected = value.includes(optionValue);

      if (isSelected) {
        if (value.length > min) {
          onChange(value.filter((v) => v !== optionValue));
        }
      } else {
        if (value.length < max) {
          onChange([...value, optionValue]);
        }
      }
    },
    [value, onChange, min, max]
  );

  const variantStyles = {
    filled: {
      container: colors.cream,
      active: colors.coral,
      activeText: colors.warmWhite,
      inactiveText: colors.textPrimary,
      inactive: "transparent",
    },
    outline: {
      container: "transparent",
      active: colors.coral,
      activeText: colors.warmWhite,
      inactiveText: colors.textPrimary,
      inactive: "transparent",
    },
    ghost: {
      container: "transparent",
      active: colors.cream,
      activeText: colors.coral,
      inactiveText: colors.textMuted,
      inactive: "transparent",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      className={"inline-flex rounded-xl p-1 gap-1 " + className}
      style={{
        backgroundColor: styles.container,
        border: variant === "outline" ? "1px solid " + colors.cream : "none",
      }}
    >
      {options.map((option) => {
        const isActive = value.includes(option.value);

        return (
          <motion.button
            key={option.value}
            onClick={() => !option.disabled && handleToggle(option.value)}
            disabled={option.disabled}
            className="flex items-center justify-center gap-2 rounded-lg font-medium"
            style={{
              ...sizeStyles[size],
              color: isActive ? styles.activeText : styles.inactiveText,
              backgroundColor: isActive ? styles.active : styles.inactive,
              opacity: option.disabled ? 0.5 : 1,
              cursor: option.disabled ? "not-allowed" : "pointer",
            }}
            whileHover={{ scale: option.disabled ? 1 : 1.02 }}
            whileTap={{ scale: option.disabled ? 1 : 0.98 }}
          >
            {option.icon && <span className="w-4 h-4">{option.icon}</span>}
            {option.label}
          </motion.button>
        );
      })}
    </div>
  );
});

interface IconSegmentedControlProps {
  options: Array<{
    value: string;
    icon: ReactNode;
    label?: string;
    disabled?: boolean;
  }>;
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  className?: string;
}

/**
 * Icon Segmented Control (Icon Only)
 */
export const IconSegmentedControl = memo(function IconSegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  showTooltip = true,
  className = "",
}: IconSegmentedControlProps) {
  const { colors } = useTheme();
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);

  const sizeStyles = {
    sm: { size: 28, iconSize: 16 },
    md: { size: 36, iconSize: 20 },
    lg: { size: 44, iconSize: 24 },
  };

  const s = sizeStyles[size];

  return (
    <div
      className={"inline-flex rounded-xl p-1 gap-1 " + className}
      style={{ backgroundColor: colors.cream }}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const isHovered = hoveredValue === option.value;

        return (
          <div key={option.value} className="relative">
            <motion.button
              onClick={() => !option.disabled && onChange(option.value)}
              disabled={option.disabled}
              onMouseEnter={() => setHoveredValue(option.value)}
              onMouseLeave={() => setHoveredValue(null)}
              className="flex items-center justify-center rounded-lg"
              style={{
                width: s.size,
                height: s.size,
                backgroundColor: isActive ? colors.coral : "transparent",
                color: isActive ? colors.warmWhite : colors.textPrimary,
                opacity: option.disabled ? 0.5 : 1,
                cursor: option.disabled ? "not-allowed" : "pointer",
              }}
              whileHover={{ scale: option.disabled ? 1 : 1.05 }}
              whileTap={{ scale: option.disabled ? 1 : 0.95 }}
            >
              <span style={{ width: s.iconSize, height: s.iconSize }}>{option.icon}</span>
            </motion.button>

            {/* Tooltip */}
            <AnimatePresence>
              {showTooltip && option.label && isHovered && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 rounded text-xs whitespace-nowrap z-10"
                  style={{
                    backgroundColor: colors.textPrimary,
                    color: colors.warmWhite,
                  }}
                >
                  {option.label}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
});

interface ButtonGroupProps {
  children: ReactNode;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/**
 * Button Group Container
 */
export const ButtonGroup = memo(function ButtonGroup({
  children,
  orientation = "horizontal",
  className = "",
}: ButtonGroupProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"inline-flex rounded-xl overflow-hidden " + (orientation === "vertical" ? "flex-col " : "") + className}
      style={{ border: "1px solid " + colors.cream }}
    >
      {React.Children.map(children, (child, index) => (
        <div
          style={{
            borderRight: orientation === "horizontal" && index < React.Children.count(children) - 1 ? "1px solid " + colors.cream : "none",
            borderBottom: orientation === "vertical" && index < React.Children.count(children) - 1 ? "1px solid " + colors.cream : "none",
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
});

interface GroupButtonProps {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Group Button (for use in ButtonGroup)
 */
export const GroupButton = memo(function GroupButton({
  children,
  onClick,
  active = false,
  disabled = false,
  className = "",
}: GroupButtonProps) {
  const { colors } = useTheme();

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={"px-4 py-2 font-medium " + className}
      style={{
        backgroundColor: active ? colors.coral : colors.warmWhite,
        color: active ? colors.warmWhite : colors.textPrimary,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      whileHover={{ backgroundColor: active ? colors.coral : colors.cream }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
    >
      {children}
    </motion.button>
  );
});

interface ToggleButtonProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "filled" | "outline";
  disabled?: boolean;
  className?: string;
}

/**
 * Toggle Button
 */
export const ToggleButton = memo(function ToggleButton({
  pressed,
  onPressedChange,
  children,
  size = "md",
  variant = "outline",
  disabled = false,
  className = "",
}: ToggleButtonProps) {
  const { colors } = useTheme();

  const sizeStyles = {
    sm: { padding: "6px 12px", fontSize: 13 },
    md: { padding: "8px 16px", fontSize: 14 },
    lg: { padding: "12px 20px", fontSize: 16 },
  };

  const getStyles = () => {
    if (variant === "filled") {
      return {
        backgroundColor: pressed ? colors.coral : colors.cream,
        color: pressed ? colors.warmWhite : colors.textPrimary,
        border: "none",
      };
    }
    return {
      backgroundColor: pressed ? colors.coral : "transparent",
      color: pressed ? colors.warmWhite : colors.textPrimary,
      border: "1px solid " + (pressed ? colors.coral : colors.cream),
    };
  };

  return (
    <motion.button
      onClick={() => !disabled && onPressedChange(!pressed)}
      disabled={disabled}
      className={"inline-flex items-center justify-center gap-2 rounded-xl font-medium " + className}
      style={{
        ...sizeStyles[size],
        ...getStyles(),
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
    >
      {children}
    </motion.button>
  );
});

interface TabSegmentedControlProps {
  tabs: Array<{
    value: string;
    label: string;
    icon?: ReactNode;
    badge?: number;
    disabled?: boolean;
  }>;
  value: string;
  onChange: (value: string) => void;
  variant?: "underline" | "pill";
  className?: string;
}

/**
 * Tab Segmented Control
 */
export const TabSegmentedControl = memo(function TabSegmentedControl({
  tabs,
  value,
  onChange,
  variant = "pill",
  className = "",
}: TabSegmentedControlProps) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeIndex = tabs.findIndex((tab) => tab.value === value);
    if (activeIndex === -1) return;

    const buttons = container.querySelectorAll("button");
    const activeButton = buttons[activeIndex] as HTMLButtonElement;

    if (activeButton) {
      setIndicatorStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      });
    }
  }, [value, tabs]);

  return (
    <div
      ref={containerRef}
      className={"relative inline-flex " + (variant === "pill" ? "bg-opacity-50 rounded-xl p-1 " : "border-b ") + className}
      style={{
        backgroundColor: variant === "pill" ? colors.cream : "transparent",
        borderColor: variant === "underline" ? colors.cream : "transparent",
      }}
    >
      {/* Indicator */}
      <motion.div
        className={variant === "pill" ? "absolute rounded-lg z-0" : "absolute bottom-0 h-0.5 z-0"}
        style={{
          backgroundColor: colors.coral,
          height: variant === "pill" ? "calc(100% - 8px)" : 2,
          top: variant === "pill" ? 4 : "auto",
        }}
        animate={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      />

      {/* Tabs */}
      {tabs.map((tab) => {
        const isActive = tab.value === value;

        return (
          <button
            key={tab.value}
            onClick={() => !tab.disabled && onChange(tab.value)}
            disabled={tab.disabled}
            className="relative z-10 px-4 py-2 flex items-center gap-2 font-medium transition-colors"
            style={{
              color: isActive
                ? variant === "pill"
                  ? colors.warmWhite
                  : colors.coral
                : colors.textMuted,
              opacity: tab.disabled ? 0.5 : 1,
              cursor: tab.disabled ? "not-allowed" : "pointer",
            }}
          >
            {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-xs"
                style={{
                  backgroundColor: isActive ? colors.warmWhite : colors.coral,
                  color: isActive ? colors.coral : colors.warmWhite,
                }}
              >
                {tab.badge > 99 ? "99+" : tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

export default SegmentedControl;
