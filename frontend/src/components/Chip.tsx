"use client";

/**
 * Chip Components - Sprint 678
 *
 * Compact elements for:
 * - Tags/labels
 * - Filter chips
 * - Input chips
 * - Choice chips
 * - HER-themed styling
 */

import React, { memo, ReactNode, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type ChipVariant = "filled" | "outlined" | "soft";
type ChipSize = "sm" | "md" | "lg";

interface ChipProps {
  children: ReactNode;
  variant?: ChipVariant;
  size?: ChipSize;
  color?: string;
  icon?: ReactNode;
  onDelete?: () => void;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  className?: string;
}

/**
 * Basic Chip Component
 */
export const Chip = memo(function Chip({
  children,
  variant = "filled",
  size = "md",
  color,
  icon,
  onDelete,
  onClick,
  disabled = false,
  selected = false,
  className = "",
}: ChipProps) {
  const { colors } = useTheme();

  const chipColor = color || colors.coral;

  const sizes = {
    sm: "text-xs px-2 py-0.5 gap-1",
    md: "text-sm px-3 py-1 gap-1.5",
    lg: "text-base px-4 py-1.5 gap-2",
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  const getStyles = () => {
    const base = {
      opacity: disabled ? 0.5 : 1,
      cursor: onClick && !disabled ? "pointer" : disabled ? "not-allowed" : "default",
    };

    if (variant === "filled") {
      return {
        ...base,
        backgroundColor: selected ? chipColor : colors.cream,
        color: selected ? colors.warmWhite : colors.textPrimary,
      };
    }

    if (variant === "outlined") {
      return {
        ...base,
        backgroundColor: "transparent",
        border: "1px solid " + (selected ? chipColor : colors.cream),
        color: selected ? chipColor : colors.textPrimary,
      };
    }

    // soft
    return {
      ...base,
      backgroundColor: chipColor + "20",
      color: chipColor,
    };
  };

  return (
    <motion.div
      className={
        "inline-flex items-center rounded-full font-medium " +
        sizes[size] +
        " " +
        className
      }
      style={getStyles()}
      onClick={!disabled && onClick ? onClick : undefined}
      whileHover={onClick && !disabled ? { scale: 1.02 } : {}}
      whileTap={onClick && !disabled ? { scale: 0.98 } : {}}
    >
      {icon && (
        <span className="flex-shrink-0">{icon}</span>
      )}
      <span>{children}</span>
      {onDelete && !disabled && (
        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-shrink-0 rounded-full p-0.5 hover:bg-black/10"
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
        >
          <CloseIcon size={iconSizes[size]} />
        </motion.button>
      )}
    </motion.div>
  );
});

interface ChipGroupProps {
  children: ReactNode;
  spacing?: number;
  className?: string;
}

/**
 * Chip Group Container
 */
export const ChipGroup = memo(function ChipGroup({
  children,
  spacing = 8,
  className = "",
}: ChipGroupProps) {
  return (
    <div
      className={"flex flex-wrap " + className}
      style={{ gap: spacing }}
    >
      {children}
    </div>
  );
});

interface FilterChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Filter Chip (toggleable)
 */
export const FilterChip = memo(function FilterChip({
  label,
  selected,
  onToggle,
  icon,
  disabled = false,
  className = "",
}: FilterChipProps) {
  const { colors } = useTheme();

  return (
    <motion.button
      type="button"
      onClick={!disabled ? onToggle : undefined}
      disabled={disabled}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium " +
        className
      }
      style={{
        backgroundColor: selected ? colors.coral : colors.cream,
        color: selected ? colors.warmWhite : colors.textPrimary,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
    >
      <AnimatePresence mode="wait">
        {selected ? (
          <motion.span
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
          >
            <CheckIcon size={14} />
          </motion.span>
        ) : icon ? (
          <motion.span
            key="icon"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
          >
            {icon}
          </motion.span>
        ) : null}
      </AnimatePresence>
      {label}
    </motion.button>
  );
});

interface ChoiceChipsProps {
  options: Array<{ value: string; label: string; icon?: ReactNode }>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Choice Chips (single select)
 */
export const ChoiceChips = memo(function ChoiceChips({
  options,
  value,
  onChange,
  disabled = false,
  className = "",
}: ChoiceChipsProps) {
  return (
    <ChipGroup className={className}>
      {options.map((option) => (
        <FilterChip
          key={option.value}
          label={option.label}
          selected={value === option.value}
          onToggle={() => onChange(option.value)}
          icon={option.icon}
          disabled={disabled}
        />
      ))}
    </ChipGroup>
  );
});

interface MultiChoiceChipsProps {
  options: Array<{ value: string; label: string; icon?: ReactNode }>;
  values: string[];
  onChange: (values: string[]) => void;
  max?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Multi-Choice Chips (multi select)
 */
export const MultiChoiceChips = memo(function MultiChoiceChips({
  options,
  values,
  onChange,
  max,
  disabled = false,
  className = "",
}: MultiChoiceChipsProps) {
  const handleToggle = useCallback((value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      if (max && values.length >= max) return;
      onChange([...values, value]);
    }
  }, [values, onChange, max]);

  return (
    <ChipGroup className={className}>
      {options.map((option) => (
        <FilterChip
          key={option.value}
          label={option.label}
          selected={values.includes(option.value)}
          onToggle={() => handleToggle(option.value)}
          icon={option.icon}
          disabled={disabled || (!values.includes(option.value) && max !== undefined && values.length >= max)}
        />
      ))}
    </ChipGroup>
  );
});

interface InputChipsProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  max?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Input Chips (add/remove tags)
 */
export const InputChips = memo(function InputChips({
  values,
  onChange,
  placeholder = "Add tag...",
  max,
  disabled = false,
  className = "",
}: InputChipsProps) {
  const { colors } = useTheme();
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      if (!values.includes(inputValue.trim())) {
        if (!max || values.length < max) {
          onChange([...values, inputValue.trim()]);
        }
      }
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const handleRemove = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  return (
    <div
      className={
        "flex flex-wrap items-center gap-2 p-2 rounded-lg border " + className
      }
      style={{
        backgroundColor: colors.warmWhite,
        borderColor: colors.cream,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <AnimatePresence>
        {values.map((value) => (
          <motion.div
            key={value}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
          >
            <Chip
              variant="filled"
              size="sm"
              onDelete={!disabled ? () => handleRemove(value) : undefined}
            >
              {value}
            </Chip>
          </motion.div>
        ))}
      </AnimatePresence>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={values.length === 0 ? placeholder : ""}
        disabled={disabled || (max !== undefined && values.length >= max)}
        className="flex-1 min-w-20 bg-transparent outline-none text-sm"
        style={{ color: colors.textPrimary }}
      />
    </div>
  );
});

interface StatusChipProps {
  status: "success" | "error" | "warning" | "info" | "pending";
  label?: string;
  size?: ChipSize;
  className?: string;
}

/**
 * Status Chip with predefined colors
 */
export const StatusChip = memo(function StatusChip({
  status,
  label,
  size = "sm",
  className = "",
}: StatusChipProps) {
  const { colors } = useTheme();

  const statusConfig = {
    success: { color: "#22C55E", label: "Success", icon: <CheckIcon size={12} /> },
    error: { color: "#EF4444", label: "Error", icon: <CloseIcon size={12} /> },
    warning: { color: "#F59E0B", label: "Warning", icon: <WarningIcon size={12} /> },
    info: { color: "#3B82F6", label: "Info", icon: <InfoIcon size={12} /> },
    pending: { color: "#8B5CF6", label: "Pending", icon: <ClockIcon size={12} /> },
  };

  const config = statusConfig[status];

  return (
    <Chip
      variant="soft"
      size={size}
      color={config.color}
      icon={config.icon}
      className={className}
    >
      {label || config.label}
    </Chip>
  );
});

interface AvatarChipProps {
  name: string;
  avatar?: string;
  onDelete?: () => void;
  size?: ChipSize;
  className?: string;
}

/**
 * Avatar Chip (user/entity)
 */
export const AvatarChip = memo(function AvatarChip({
  name,
  avatar,
  onDelete,
  size = "md",
  className = "",
}: AvatarChipProps) {
  const { colors } = useTheme();

  const avatarSizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  };

  return (
    <Chip
      variant="outlined"
      size={size}
      onDelete={onDelete}
      className={className}
      icon={
        avatar ? (
          <img
            src={avatar}
            alt={name}
            className="rounded-full object-cover"
            style={{ width: avatarSizes[size], height: avatarSizes[size] }}
          />
        ) : (
          <div
            className="rounded-full flex items-center justify-center text-xs font-medium"
            style={{
              width: avatarSizes[size],
              height: avatarSizes[size],
              backgroundColor: colors.coral,
              color: colors.warmWhite,
            }}
          >
            {getInitials(name)}
          </div>
        )
      }
    >
      {name}
    </Chip>
  );
});

// Icons
function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function WarningIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

function InfoIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={10} />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={10} />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export default Chip;
