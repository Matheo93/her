"use client";

/**
 * Glass Card Components - Sprint 798
 *
 * Glassmorphism UI elements:
 * - Glass card
 * - Glass button
 * - Glass panel
 * - Glass modal
 * - Frosted glass
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useRef,
  ReactNode,
  forwardRef,
} from "react";
import { motion, AnimatePresence, HTMLMotionProps } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface GlassCardProps {
  children: ReactNode;
  blur?: number;
  opacity?: number;
  borderOpacity?: number;
  hoverEffect?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * Glass Card - Glassmorphism card component
 */
export const GlassCard = memo(function GlassCard({
  children,
  blur = 10,
  opacity = 0.2,
  borderOpacity = 0.3,
  hoverEffect = false,
  className = "",
  onClick,
}: GlassCardProps) {
  const { colors } = useTheme();

  return (
    <motion.div
      className={"rounded-2xl p-6 " + className}
      style={{
        backgroundColor: colors.warmWhite + Math.round(opacity * 255).toString(16).padStart(2, "0"),
        backdropFilter: "blur(" + blur + "px)",
        WebkitBackdropFilter: "blur(" + blur + "px)",
        border: "1px solid " + colors.warmWhite + Math.round(borderOpacity * 255).toString(16).padStart(2, "0"),
        boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.1)",
      }}
      whileHover={
        hoverEffect
          ? {
              scale: 1.02,
              boxShadow: "0 12px 40px 0 rgba(0, 0, 0, 0.15)",
            }
          : undefined
      }
      transition={{ duration: 0.2 }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
});

interface GlassButtonProps {
  children: ReactNode;
  blur?: number;
  opacity?: number;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
}

/**
 * Glass Button - Glassmorphism button
 */
export const GlassButton = memo(function GlassButton({
  children,
  blur = 8,
  opacity = 0.25,
  className = "",
  onClick,
  disabled = false,
  size = "md",
  variant = "primary",
}: GlassButtonProps) {
  const { colors } = useTheme();

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5 text-base",
    lg: "px-7 py-3.5 text-lg",
  };

  const variants = {
    primary: {
      backgroundColor: colors.coral + Math.round(opacity * 255).toString(16).padStart(2, "0"),
      color: colors.warmWhite,
      border: "1px solid " + colors.coral + "50",
    },
    secondary: {
      backgroundColor: colors.warmWhite + Math.round(opacity * 255).toString(16).padStart(2, "0"),
      color: colors.textPrimary,
      border: "1px solid " + colors.warmWhite + "50",
    },
    ghost: {
      backgroundColor: "transparent",
      color: colors.textPrimary,
      border: "1px solid " + colors.warmWhite + "30",
    },
  };

  return (
    <motion.button
      className={
        "rounded-xl font-medium transition-all " +
        sizes[size] +
        " " +
        (disabled ? "opacity-50 cursor-not-allowed " : "cursor-pointer ") +
        className
      }
      style={{
        ...variants[variant],
        backdropFilter: "blur(" + blur + "px)",
        WebkitBackdropFilter: "blur(" + blur + "px)",
      }}
      whileHover={
        disabled
          ? undefined
          : {
              scale: 1.02,
              boxShadow: "0 4px 20px 0 rgba(0, 0, 0, 0.1)",
            }
      }
      whileTap={disabled ? undefined : { scale: 0.98 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {children}
    </motion.button>
  );
});

interface GlassPanelProps {
  children: ReactNode;
  blur?: number;
  opacity?: number;
  direction?: "horizontal" | "vertical";
  className?: string;
}

/**
 * Glass Panel - Horizontal or vertical glass panel
 */
export const GlassPanel = memo(function GlassPanel({
  children,
  blur = 12,
  opacity = 0.15,
  direction = "vertical",
  className = "",
}: GlassPanelProps) {
  const { colors } = useTheme();

  return (
    <div
      className={
        "rounded-xl p-4 " +
        (direction === "horizontal" ? "flex items-center gap-4 " : "flex flex-col gap-4 ") +
        className
      }
      style={{
        backgroundColor: colors.warmWhite + Math.round(opacity * 255).toString(16).padStart(2, "0"),
        backdropFilter: "blur(" + blur + "px)",
        WebkitBackdropFilter: "blur(" + blur + "px)",
        border: "1px solid " + colors.warmWhite + "30",
      }}
    >
      {children}
    </div>
  );
});

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  blur?: number;
  opacity?: number;
  className?: string;
}

/**
 * Glass Modal - Glassmorphism modal dialog
 */
export const GlassModal = memo(function GlassModal({
  isOpen,
  onClose,
  children,
  title,
  blur = 16,
  opacity = 0.25,
  className = "",
}: GlassModalProps) {
  const { colors } = useTheme();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
          />

          {/* Modal */}
          <motion.div
            className={
              "fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 " +
              className
            }
            style={{
              backgroundColor: colors.warmWhite + Math.round(opacity * 255).toString(16).padStart(2, "0"),
              backdropFilter: "blur(" + blur + "px)",
              WebkitBackdropFilter: "blur(" + blur + "px)",
              border: "1px solid " + colors.warmWhite + "30",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
            initial={{ opacity: 0, scale: 0.95, y: "-45%" }}
            animate={{ opacity: 1, scale: 1, y: "-50%" }}
            exit={{ opacity: 0, scale: 0.95, y: "-45%" }}
            transition={{ duration: 0.2 }}
          >
            {title && (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold" style={{ color: colors.textPrimary }}>
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg hover:bg-black/10 transition-colors"
                  style={{ color: colors.textSecondary }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

interface GlassInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "password" | "number";
  blur?: number;
  opacity?: number;
  className?: string;
  disabled?: boolean;
}

/**
 * Glass Input - Glassmorphism text input
 */
export const GlassInput = memo(function GlassInput({
  value,
  onChange,
  placeholder,
  type = "text",
  blur = 8,
  opacity = 0.15,
  className = "",
  disabled = false,
}: GlassInputProps) {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={
        "w-full rounded-xl px-4 py-3 outline-none transition-all " +
        (disabled ? "opacity-50 cursor-not-allowed " : "") +
        className
      }
      style={{
        backgroundColor: colors.warmWhite + Math.round(opacity * 255).toString(16).padStart(2, "0"),
        backdropFilter: "blur(" + blur + "px)",
        WebkitBackdropFilter: "blur(" + blur + "px)",
        border: isFocused ? "2px solid " + colors.coral : "1px solid " + colors.warmWhite + "30",
        color: colors.textPrimary,
      }}
    />
  );
});

interface GlassSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  blur?: number;
  opacity?: number;
  className?: string;
  disabled?: boolean;
}

/**
 * Glass Select - Glassmorphism select dropdown
 */
export const GlassSelect = memo(function GlassSelect({
  value,
  onChange,
  options,
  placeholder,
  blur = 8,
  opacity = 0.15,
  className = "",
  disabled = false,
}: GlassSelectProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={"relative " + className}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={
          "w-full rounded-xl px-4 py-3 text-left flex items-center justify-between " +
          (disabled ? "opacity-50 cursor-not-allowed " : "cursor-pointer ")
        }
        style={{
          backgroundColor: colors.warmWhite + Math.round(opacity * 255).toString(16).padStart(2, "0"),
          backdropFilter: "blur(" + blur + "px)",
          WebkitBackdropFilter: "blur(" + blur + "px)",
          border: isOpen ? "2px solid " + colors.coral : "1px solid " + colors.warmWhite + "30",
          color: selectedOption ? colors.textPrimary : colors.textSecondary,
        }}
      >
        <span>{selectedOption?.label || placeholder || "Select..."}</span>
        <svg
          className={"w-4 h-4 transition-transform " + (isOpen ? "rotate-180" : "")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50"
            style={{
              backgroundColor: colors.warmWhite + Math.round((opacity + 0.2) * 255).toString(16).padStart(2, "0"),
              backdropFilter: "blur(" + (blur + 4) + "px)",
              WebkitBackdropFilter: "blur(" + (blur + 4) + "px)",
              border: "1px solid " + colors.warmWhite + "30",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.1)",
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2.5 text-left hover:bg-black/5 transition-colors"
                style={{
                  color: option.value === value ? colors.coral : colors.textPrimary,
                }}
              >
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface GlassNavbarProps {
  children: ReactNode;
  blur?: number;
  opacity?: number;
  sticky?: boolean;
  className?: string;
}

/**
 * Glass Navbar - Glassmorphism navigation bar
 */
export const GlassNavbar = memo(function GlassNavbar({
  children,
  blur = 12,
  opacity = 0.2,
  sticky = true,
  className = "",
}: GlassNavbarProps) {
  const { colors } = useTheme();

  return (
    <nav
      className={
        "w-full px-6 py-4 " +
        (sticky ? "sticky top-0 z-40 " : "") +
        className
      }
      style={{
        backgroundColor: colors.warmWhite + Math.round(opacity * 255).toString(16).padStart(2, "0"),
        backdropFilter: "blur(" + blur + "px)",
        WebkitBackdropFilter: "blur(" + blur + "px)",
        borderBottom: "1px solid " + colors.warmWhite + "20",
      }}
    >
      {children}
    </nav>
  );
});

interface GlassSidebarProps {
  children: ReactNode;
  isOpen?: boolean;
  onClose?: () => void;
  position?: "left" | "right";
  blur?: number;
  opacity?: number;
  width?: number | string;
  className?: string;
}

/**
 * Glass Sidebar - Glassmorphism sidebar panel
 */
export const GlassSidebar = memo(function GlassSidebar({
  children,
  isOpen = true,
  onClose,
  position = "left",
  blur = 16,
  opacity = 0.25,
  width = 280,
  className = "",
}: GlassSidebarProps) {
  const { colors } = useTheme();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {onClose && (
            <motion.div
              className="fixed inset-0 z-30 bg-black/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
          )}
          <motion.aside
            className={
              "fixed top-0 bottom-0 z-40 p-4 " +
              (position === "left" ? "left-0 " : "right-0 ") +
              className
            }
            style={{
              width,
              backgroundColor: colors.warmWhite + Math.round(opacity * 255).toString(16).padStart(2, "0"),
              backdropFilter: "blur(" + blur + "px)",
              WebkitBackdropFilter: "blur(" + blur + "px)",
              borderRight: position === "left" ? "1px solid " + colors.warmWhite + "20" : undefined,
              borderLeft: position === "right" ? "1px solid " + colors.warmWhite + "20" : undefined,
            }}
            initial={{ x: position === "left" ? -width : width }}
            animate={{ x: 0 }}
            exit={{ x: position === "left" ? -width : width }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
});

interface GlassTooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  blur?: number;
  opacity?: number;
  className?: string;
}

/**
 * Glass Tooltip - Glassmorphism tooltip
 */
export const GlassTooltip = memo(function GlassTooltip({
  content,
  children,
  position = "top",
  blur = 8,
  opacity = 0.3,
  className = "",
}: GlassTooltipProps) {
  const { colors } = useTheme();
  const [isVisible, setIsVisible] = useState(false);

  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      className={"relative inline-block " + className}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            className={
              "absolute z-50 px-3 py-2 rounded-lg whitespace-nowrap pointer-events-none " +
              positions[position]
            }
            style={{
              backgroundColor: colors.warmWhite + Math.round(opacity * 255).toString(16).padStart(2, "0"),
              backdropFilter: "blur(" + blur + "px)",
              WebkitBackdropFilter: "blur(" + blur + "px)",
              border: "1px solid " + colors.warmWhite + "30",
              color: colors.textPrimary,
              fontSize: "0.875rem",
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface GlassBadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info";
  blur?: number;
  className?: string;
}

/**
 * Glass Badge - Glassmorphism badge/tag
 */
export const GlassBadge = memo(function GlassBadge({
  children,
  variant = "default",
  blur = 6,
  className = "",
}: GlassBadgeProps) {
  const { colors } = useTheme();

  const variants = {
    default: colors.warmWhite,
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#3b82f6",
  };

  const color = variants[variant];

  return (
    <span
      className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium " + className}
      style={{
        backgroundColor: color + "30",
        backdropFilter: "blur(" + blur + "px)",
        WebkitBackdropFilter: "blur(" + blur + "px)",
        border: "1px solid " + color + "40",
        color: variant === "default" ? colors.textPrimary : color,
      }}
    >
      {children}
    </span>
  );
});

export default GlassCard;
