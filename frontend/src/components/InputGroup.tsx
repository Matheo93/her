"use client";

/**
 * InputGroup Components - Sprint 676
 *
 * Input grouping/addon components:
 * - Prefix/suffix addons
 * - Icon addons
 * - Button addons
 * - Combined inputs
 * - HER-themed styling
 */

import React, { memo, forwardRef, ReactNode, InputHTMLAttributes } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface InputGroupProps {
  children: ReactNode;
  className?: string;
}

/**
 * Input Group Container
 */
export const InputGroup = memo(function InputGroup({
  children,
  className = "",
}: InputGroupProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"flex rounded-lg overflow-hidden " + className}
      style={{ border: "1px solid " + colors.cream }}
    >
      {children}
    </div>
  );
});

interface InputAddonProps {
  children: ReactNode;
  position?: "left" | "right";
  className?: string;
}

/**
 * Static addon (text, icon)
 */
export const InputAddon = memo(function InputAddon({
  children,
  position = "left",
  className = "",
}: InputAddonProps) {
  const { colors } = useTheme();

  return (
    <div
      className={
        "flex items-center justify-center px-3 text-sm font-medium " +
        (position === "left" ? "border-r" : "border-l") +
        " " + className
      }
      style={{
        backgroundColor: colors.cream,
        borderColor: colors.cream,
        color: colors.textMuted,
      }}
    >
      {children}
    </div>
  );
});

interface GroupInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  hasLeftAddon?: boolean;
  hasRightAddon?: boolean;
}

/**
 * Input for use inside InputGroup
 */
export const GroupInput = memo(
  forwardRef<HTMLInputElement, GroupInputProps>(function GroupInput(
    { hasLeftAddon, hasRightAddon, className = "", style, ...props },
    ref
  ) {
    const { colors } = useTheme();

    return (
      <input
        ref={ref}
        className={
          "flex-1 px-3 py-2.5 text-sm outline-none min-w-0 " +
          (hasLeftAddon ? "" : "rounded-l-lg ") +
          (hasRightAddon ? "" : "rounded-r-lg ") +
          className
        }
        style={{
          backgroundColor: colors.warmWhite,
          color: colors.textPrimary,
          ...style,
        }}
        {...props}
      />
    );
  })
);

interface InputButtonProps {
  children: ReactNode;
  onClick?: () => void;
  position?: "left" | "right";
  variant?: "default" | "primary";
  disabled?: boolean;
  className?: string;
}

/**
 * Button addon
 */
export const InputButton = memo(function InputButton({
  children,
  onClick,
  position = "right",
  variant = "default",
  disabled = false,
  className = "",
}: InputButtonProps) {
  const { colors } = useTheme();

  const bgColor = variant === "primary" ? colors.coral : colors.cream;
  const textColor = variant === "primary" ? colors.warmWhite : colors.textPrimary;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "px-4 py-2.5 text-sm font-medium " +
        (position === "left" ? "border-r" : "border-l") +
        " " + className
      }
      style={{
        backgroundColor: bgColor,
        borderColor: colors.cream,
        color: textColor,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      whileHover={disabled ? {} : { opacity: 0.9 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
    >
      {children}
    </motion.button>
  );
});

interface InputSelectProps {
  options: Array<{ value: string; label: string }>;
  value?: string;
  onChange?: (value: string) => void;
  position?: "left" | "right";
  className?: string;
}

/**
 * Select addon
 */
export const InputSelect = memo(function InputSelect({
  options,
  value,
  onChange,
  position = "left",
  className = "",
}: InputSelectProps) {
  const { colors } = useTheme();

  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className={
        "px-3 py-2.5 text-sm outline-none cursor-pointer " +
        (position === "left" ? "border-r" : "border-l") +
        " " + className
      }
      style={{
        backgroundColor: colors.cream,
        borderColor: colors.cream,
        color: colors.textPrimary,
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
});

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: () => void;
  placeholder?: string;
  loading?: boolean;
  className?: string;
}

/**
 * Search input with button
 */
export const SearchInput = memo(function SearchInput({
  value,
  onChange,
  onSearch,
  placeholder = "Search...",
  loading = false,
  className = "",
}: SearchInputProps) {
  const { colors } = useTheme();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && onSearch) {
      onSearch();
    }
  };

  return (
    <InputGroup className={className}>
      <InputAddon position="left">
        <SearchIcon color={colors.textMuted} />
      </InputAddon>
      <GroupInput
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        hasLeftAddon
        hasRightAddon
      />
      <InputButton onClick={onSearch} position="right" variant="primary" disabled={loading}>
        {loading ? <LoadingSpinner size={16} /> : "Search"}
      </InputButton>
    </InputGroup>
  );
});

interface PriceInputProps {
  value: string;
  onChange: (value: string) => void;
  currency?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Price input with currency
 */
export const PriceInput = memo(function PriceInput({
  value,
  onChange,
  currency = "$",
  placeholder = "0.00",
  className = "",
}: PriceInputProps) {
  return (
    <InputGroup className={className}>
      <InputAddon position="left">{currency}</InputAddon>
      <GroupInput
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        hasLeftAddon
      />
    </InputGroup>
  );
});

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  protocol?: string;
  placeholder?: string;
  className?: string;
}

/**
 * URL input with protocol
 */
export const UrlInput = memo(function UrlInput({
  value,
  onChange,
  protocol = "https://",
  placeholder = "example.com",
  className = "",
}: UrlInputProps) {
  return (
    <InputGroup className={className}>
      <InputAddon position="left">{protocol}</InputAddon>
      <GroupInput
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        hasLeftAddon
      />
    </InputGroup>
  );
});

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  domain?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Email input with domain
 */
export const EmailInput = memo(function EmailInput({
  value,
  onChange,
  domain,
  placeholder = "username",
  className = "",
}: EmailInputProps) {
  return (
    <InputGroup className={className}>
      <GroupInput
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        hasRightAddon={!!domain}
      />
      {domain && <InputAddon position="right">@{domain}</InputAddon>}
    </InputGroup>
  );
});

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

/**
 * Quantity input with increment/decrement
 */
export const QuantityInput = memo(function QuantityInput({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  className = "",
}: QuantityInputProps) {
  const { colors } = useTheme();

  const decrement = () => {
    const newValue = value - step;
    if (newValue >= min) onChange(newValue);
  };

  const increment = () => {
    const newValue = value + step;
    if (newValue <= max) onChange(newValue);
  };

  return (
    <InputGroup className={className}>
      <motion.button
        type="button"
        onClick={decrement}
        disabled={value <= min}
        className="px-3 py-2 border-r"
        style={{
          backgroundColor: colors.cream,
          borderColor: colors.cream,
          color: value <= min ? colors.textMuted : colors.textPrimary,
          opacity: value <= min ? 0.5 : 1,
        }}
        whileHover={value > min ? { opacity: 0.8 } : {}}
        whileTap={value > min ? { scale: 0.95 } : {}}
      >
        <MinusIcon />
      </motion.button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const num = parseInt(e.target.value, 10);
          if (!isNaN(num) && num >= min && num <= max) {
            onChange(num);
          }
        }}
        min={min}
        max={max}
        step={step}
        className="w-16 text-center py-2.5 text-sm outline-none"
        style={{
          backgroundColor: colors.warmWhite,
          color: colors.textPrimary,
        }}
      />
      <motion.button
        type="button"
        onClick={increment}
        disabled={value >= max}
        className="px-3 py-2 border-l"
        style={{
          backgroundColor: colors.cream,
          borderColor: colors.cream,
          color: value >= max ? colors.textMuted : colors.textPrimary,
          opacity: value >= max ? 0.5 : 1,
        }}
        whileHover={value < max ? { opacity: 0.8 } : {}}
        whileTap={value < max ? { scale: 0.95 } : {}}
      >
        <PlusIcon />
      </motion.button>
    </InputGroup>
  );
});

interface CopyInputProps {
  value: string;
  className?: string;
}

/**
 * Read-only input with copy button
 */
export const CopyInput = memo(function CopyInput({
  value,
  className = "",
}: CopyInputProps) {
  const { colors } = useTheme();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <InputGroup className={className}>
      <GroupInput
        type="text"
        value={value}
        readOnly
        hasRightAddon
        style={{ color: colors.textMuted }}
      />
      <InputButton onClick={handleCopy} position="right" variant={copied ? "primary" : "default"}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </InputButton>
    </InputGroup>
  );
});

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Password input with show/hide toggle
 */
export const PasswordInput = memo(function PasswordInput({
  value,
  onChange,
  placeholder = "Enter password",
  className = "",
}: PasswordInputProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = React.useState(false);

  return (
    <InputGroup className={className}>
      <InputAddon position="left">
        <LockIcon color={colors.textMuted} />
      </InputAddon>
      <GroupInput
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        hasLeftAddon
        hasRightAddon
      />
      <motion.button
        type="button"
        onClick={() => setVisible(!visible)}
        className="px-3 border-l"
        style={{
          backgroundColor: colors.warmWhite,
          borderColor: colors.cream,
          color: colors.textMuted,
        }}
        whileHover={{ color: colors.textPrimary }}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </motion.button>
    </InputGroup>
  );
});

// Icons
function SearchIcon({ color }: { color: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <circle cx={11} cy={11} r={8} />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 12h14" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x={9} y={9} width={13} height={13} rx={2} />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function LockIcon({ color }: { color: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <rect x={3} y={11} width={18} height={11} rx={2} />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function LoadingSpinner({ size = 16 }: { size?: number }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    >
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </motion.svg>
  );
}

export default InputGroup;
