"use client";

/**
 * Magnetic Button Components - Sprint 792
 *
 * Interactive button effects:
 * - Magnetic hover effect
 * - Ripple effect
 * - Pulse animation
 * - Glow effect
 * - Press animation
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useRef,
  ReactNode,
  MouseEvent,
  TouchEvent,
} from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface MagneticButtonProps {
  children: ReactNode;
  strength?: number;
  radius?: number;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * Magnetic Button - Attracts to cursor
 */
export const MagneticButton = memo(function MagneticButton({
  children,
  strength = 0.3,
  radius = 200,
  className = "",
  onClick,
  disabled = false,
}: MagneticButtonProps) {
  const { colors } = useTheme();
  const ref = useRef<HTMLButtonElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { stiffness: 150, damping: 15, mass: 0.1 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (disabled || !ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const distanceX = e.clientX - centerX;
      const distanceY = e.clientY - centerY;
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

      if (distance < radius) {
        const factor = (1 - distance / radius) * strength;
        x.set(distanceX * factor);
        y.set(distanceY * factor);
      }
    },
    [disabled, radius, strength, x, y]
  );

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.button
      ref={ref}
      className={
        "relative px-6 py-3 rounded-full font-medium transition-colors " +
        (disabled ? "opacity-50 cursor-not-allowed " : "cursor-pointer ") +
        className
      }
      style={{
        x: springX,
        y: springY,
        backgroundColor: colors.coral,
        color: colors.warmWhite,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={disabled ? undefined : onClick}
      whileTap={disabled ? undefined : { scale: 0.95 }}
    >
      {children}
    </motion.button>
  );
});

interface RippleButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  rippleColor?: string;
  duration?: number;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

/**
 * Ripple Button - Material Design ripple effect
 */
export const RippleButton = memo(function RippleButton({
  children,
  className = "",
  onClick,
  disabled = false,
  rippleColor,
  duration = 600,
}: RippleButtonProps) {
  const { colors } = useTheme();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);

  const createRipple = useCallback(
    (e: MouseEvent<HTMLButtonElement> | TouchEvent<HTMLButtonElement>) => {
      if (disabled) return;

      const button = e.currentTarget;
      const rect = button.getBoundingClientRect();

      let clientX: number;
      let clientY: number;

      if ("touches" in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const size = Math.max(rect.width, rect.height) * 2;

      const ripple: Ripple = {
        id: nextId.current++,
        x,
        y,
        size,
      };

      setRipples((prev) => [...prev, ripple]);

      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== ripple.id));
      }, duration);
    },
    [disabled, duration]
  );

  const color = rippleColor || colors.warmWhite + "40";

  return (
    <button
      className={
        "relative overflow-hidden px-6 py-3 rounded-lg font-medium " +
        (disabled ? "opacity-50 cursor-not-allowed " : "cursor-pointer ") +
        className
      }
      style={{
        backgroundColor: colors.coral,
        color: colors.warmWhite,
      }}
      onMouseDown={createRipple}
      onTouchStart={createRipple}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span className="relative z-10">{children}</span>
      {ripples.map((ripple) => (
        <motion.span
          key={ripple.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            backgroundColor: color,
            width: ripple.size,
            height: ripple.size,
            marginLeft: -ripple.size / 2,
            marginTop: -ripple.size / 2,
          }}
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: duration / 1000, ease: "easeOut" }}
        />
      ))}
    </button>
  );
});

interface PulseButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  pulseColor?: string;
  pulseScale?: number;
}

/**
 * Pulse Button - Continuous pulse animation
 */
export const PulseButton = memo(function PulseButton({
  children,
  className = "",
  onClick,
  disabled = false,
  pulseColor,
  pulseScale = 1.2,
}: PulseButtonProps) {
  const { colors } = useTheme();
  const color = pulseColor || colors.coral;

  return (
    <div className="relative inline-block">
      {/* Pulse rings */}
      {!disabled && (
        <>
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: color }}
            animate={{
              scale: [1, pulseScale],
              opacity: [0.4, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: color }}
            animate={{
              scale: [1, pulseScale],
              opacity: [0.4, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeOut",
              delay: 0.5,
            }}
          />
        </>
      )}
      <motion.button
        className={
          "relative px-6 py-3 rounded-full font-medium " +
          (disabled ? "opacity-50 cursor-not-allowed " : "cursor-pointer ") +
          className
        }
        style={{
          backgroundColor: color,
          color: colors.warmWhite,
        }}
        onClick={disabled ? undefined : onClick}
        whileHover={disabled ? undefined : { scale: 1.05 }}
        whileTap={disabled ? undefined : { scale: 0.95 }}
      >
        {children}
      </motion.button>
    </div>
  );
});

interface GlowButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  glowColor?: string;
  glowIntensity?: number;
}

/**
 * Glow Button - Neon glow effect on hover
 */
export const GlowButton = memo(function GlowButton({
  children,
  className = "",
  onClick,
  disabled = false,
  glowColor,
  glowIntensity = 20,
}: GlowButtonProps) {
  const { colors } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const color = glowColor || colors.coral;

  return (
    <motion.button
      className={
        "relative px-6 py-3 rounded-lg font-medium transition-all " +
        (disabled ? "opacity-50 cursor-not-allowed " : "cursor-pointer ") +
        className
      }
      style={{
        backgroundColor: color,
        color: colors.warmWhite,
        boxShadow:
          isHovered && !disabled
            ? `0 0 ${glowIntensity}px ${color}, 0 0 ${glowIntensity * 2}px ${color}50, 0 0 ${glowIntensity * 3}px ${color}30`
            : `0 0 0px ${color}`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={disabled ? undefined : onClick}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      animate={{
        boxShadow:
          isHovered && !disabled
            ? `0 0 ${glowIntensity}px ${color}, 0 0 ${glowIntensity * 2}px ${color}50, 0 0 ${glowIntensity * 3}px ${color}30`
            : `0 0 0px transparent`,
      }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.button>
  );
});

interface ExpandButtonProps {
  children: ReactNode;
  expandedContent?: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * Expand Button - Expands on hover to reveal more content
 */
export const ExpandButton = memo(function ExpandButton({
  children,
  expandedContent,
  className = "",
  onClick,
  disabled = false,
}: ExpandButtonProps) {
  const { colors } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.button
      className={
        "relative overflow-hidden px-6 py-3 rounded-lg font-medium " +
        (disabled ? "opacity-50 cursor-not-allowed " : "cursor-pointer ") +
        className
      }
      style={{
        backgroundColor: colors.coral,
        color: colors.warmWhite,
      }}
      onMouseEnter={() => !disabled && setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      onClick={disabled ? undefined : onClick}
      animate={{ width: isExpanded && expandedContent ? "auto" : undefined }}
      transition={{ duration: 0.3 }}
    >
      <motion.span
        className="inline-flex items-center gap-2"
        animate={{ x: isExpanded && expandedContent ? 0 : 0 }}
      >
        {children}
        {expandedContent && (
          <motion.span
            initial={{ width: 0, opacity: 0 }}
            animate={{
              width: isExpanded ? "auto" : 0,
              opacity: isExpanded ? 1 : 0,
            }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden whitespace-nowrap"
          >
            {expandedContent}
          </motion.span>
        )}
      </motion.span>
    </motion.button>
  );
});

interface IconButtonProps {
  icon: ReactNode;
  label?: string;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "filled" | "outlined" | "ghost";
}

/**
 * Icon Button - Circular button with icon
 */
export const IconButton = memo(function IconButton({
  icon,
  label,
  className = "",
  onClick,
  disabled = false,
  size = "md",
  variant = "filled",
}: IconButtonProps) {
  const { colors } = useTheme();

  const sizes = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-12 h-12 text-lg",
  };

  const variants = {
    filled: {
      backgroundColor: colors.coral,
      color: colors.warmWhite,
      border: "none",
    },
    outlined: {
      backgroundColor: "transparent",
      color: colors.coral,
      border: "2px solid " + colors.coral,
    },
    ghost: {
      backgroundColor: "transparent",
      color: colors.coral,
      border: "none",
    },
  };

  return (
    <motion.button
      className={
        "relative rounded-full flex items-center justify-center " +
        sizes[size] +
        " " +
        (disabled ? "opacity-50 cursor-not-allowed " : "cursor-pointer ") +
        className
      }
      style={variants[variant]}
      onClick={disabled ? undefined : onClick}
      whileHover={
        disabled
          ? undefined
          : {
              scale: 1.1,
              backgroundColor:
                variant === "ghost" ? colors.coral + "20" : undefined,
            }
      }
      whileTap={disabled ? undefined : { scale: 0.9 }}
      title={label}
      aria-label={label}
    >
      {icon}
    </motion.button>
  );
});

interface FloatingActionButtonProps {
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  className?: string;
}

/**
 * Floating Action Button (FAB)
 */
export const FloatingActionButton = memo(function FloatingActionButton({
  icon,
  onClick,
  disabled = false,
  position = "bottom-right",
  className = "",
}: FloatingActionButtonProps) {
  const { colors } = useTheme();

  const positions = {
    "bottom-right": "bottom-6 right-6",
    "bottom-left": "bottom-6 left-6",
    "top-right": "top-6 right-6",
    "top-left": "top-6 left-6",
  };

  return (
    <motion.button
      className={
        "fixed w-14 h-14 rounded-full flex items-center justify-center shadow-lg " +
        positions[position] +
        " " +
        (disabled ? "opacity-50 cursor-not-allowed " : "cursor-pointer ") +
        className
      }
      style={{
        backgroundColor: colors.coral,
        color: colors.warmWhite,
        zIndex: 50,
      }}
      onClick={disabled ? undefined : onClick}
      whileHover={disabled ? undefined : { scale: 1.1, rotate: 90 }}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      {icon}
    </motion.button>
  );
});

interface ToggleButtonProps {
  isOn: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Toggle Button / Switch
 */
export const ToggleButton = memo(function ToggleButton({
  isOn,
  onToggle,
  disabled = false,
  size = "md",
  className = "",
}: ToggleButtonProps) {
  const { colors } = useTheme();

  const sizes = {
    sm: { track: "w-10 h-5", knob: "w-4 h-4", translate: 20 },
    md: { track: "w-12 h-6", knob: "w-5 h-5", translate: 24 },
    lg: { track: "w-14 h-7", knob: "w-6 h-6", translate: 28 },
  };

  const { track, knob, translate } = sizes[size];

  return (
    <button
      className={
        "relative rounded-full p-0.5 transition-colors " +
        track +
        " " +
        (disabled ? "opacity-50 cursor-not-allowed " : "cursor-pointer ") +
        className
      }
      style={{
        backgroundColor: isOn ? colors.coral : colors.cream,
      }}
      onClick={() => !disabled && onToggle(!isOn)}
      role="switch"
      aria-checked={isOn}
    >
      <motion.span
        className={"block rounded-full shadow " + knob}
        style={{ backgroundColor: colors.warmWhite }}
        animate={{ x: isOn ? translate : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
});

interface ButtonGroupProps {
  children: ReactNode;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/**
 * Button Group - Groups buttons together
 */
export const ButtonGroup = memo(function ButtonGroup({
  children,
  orientation = "horizontal",
  className = "",
}: ButtonGroupProps) {
  return (
    <div
      className={
        "inline-flex " +
        (orientation === "vertical" ? "flex-col " : "flex-row ") +
        className
      }
      role="group"
    >
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;

        const isFirst = index === 0;
        const isLast = index === React.Children.count(children) - 1;

        let borderRadius = "";
        if (orientation === "horizontal") {
          if (isFirst) borderRadius = "rounded-l-lg rounded-r-none";
          else if (isLast) borderRadius = "rounded-r-lg rounded-l-none";
          else borderRadius = "rounded-none";
        } else {
          if (isFirst) borderRadius = "rounded-t-lg rounded-b-none";
          else if (isLast) borderRadius = "rounded-b-lg rounded-t-none";
          else borderRadius = "rounded-none";
        }

        return React.cloneElement(child as React.ReactElement<{ className?: string }>, {
          className:
            ((child as React.ReactElement<{ className?: string }>).props.className || "") +
            " " +
            borderRadius +
            " " +
            (!isLast ? (orientation === "horizontal" ? "border-r-0" : "border-b-0") : ""),
        });
      })}
    </div>
  );
});

interface LoadingButtonProps {
  children: ReactNode;
  isLoading?: boolean;
  loadingText?: string;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * Loading Button - Shows loading state
 */
export const LoadingButton = memo(function LoadingButton({
  children,
  isLoading = false,
  loadingText = "Loading...",
  className = "",
  onClick,
  disabled = false,
}: LoadingButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || isLoading;

  return (
    <motion.button
      className={
        "relative px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 " +
        (isDisabled ? "opacity-70 cursor-not-allowed " : "cursor-pointer ") +
        className
      }
      style={{
        backgroundColor: colors.coral,
        color: colors.warmWhite,
      }}
      onClick={isDisabled ? undefined : onClick}
      whileTap={isDisabled ? undefined : { scale: 0.98 }}
    >
      {isLoading && (
        <motion.span
          className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      )}
      <span>{isLoading ? loadingText : children}</span>
    </motion.button>
  );
});

export default MagneticButton;
