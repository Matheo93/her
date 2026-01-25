"use client";

/**
 * Tooltip Components - Sprint 606
 *
 * Information overlays:
 * - Simple tooltip
 * - Rich tooltip
 * - Popover
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useRef,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type Position = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  /** Tooltip content */
  content: ReactNode;
  /** Trigger element */
  children: ReactNode;
  /** Position relative to trigger */
  position?: Position;
  /** Delay before showing (ms) */
  delay?: number;
  /** Whether tooltip is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Calculate tooltip position
 */
function getPositionStyles(position: Position) {
  const offset = 8;

  switch (position) {
    case "top":
      return {
        bottom: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginBottom: offset,
      };
    case "bottom":
      return {
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginTop: offset,
      };
    case "left":
      return {
        right: "100%",
        top: "50%",
        transform: "translateY(-50%)",
        marginRight: offset,
      };
    case "right":
      return {
        left: "100%",
        top: "50%",
        transform: "translateY(-50%)",
        marginLeft: offset,
      };
  }
}

/**
 * Get arrow styles
 */
function getArrowStyles(position: Position, colors: any) {
  const size = 6;
  const base = {
    width: 0,
    height: 0,
    borderStyle: "solid" as const,
    position: "absolute" as const,
  };

  switch (position) {
    case "top":
      return {
        ...base,
        bottom: -size,
        left: "50%",
        transform: "translateX(-50%)",
        borderWidth: `${size}px ${size}px 0 ${size}px`,
        borderColor: `#2D2D2D transparent transparent transparent`,
      };
    case "bottom":
      return {
        ...base,
        top: -size,
        left: "50%",
        transform: "translateX(-50%)",
        borderWidth: `0 ${size}px ${size}px ${size}px`,
        borderColor: `transparent transparent #2D2D2D transparent`,
      };
    case "left":
      return {
        ...base,
        right: -size,
        top: "50%",
        transform: "translateY(-50%)",
        borderWidth: `${size}px 0 ${size}px ${size}px`,
        borderColor: `transparent transparent transparent #2D2D2D`,
      };
    case "right":
      return {
        ...base,
        left: -size,
        top: "50%",
        transform: "translateY(-50%)",
        borderWidth: `${size}px ${size}px ${size}px 0`,
        borderColor: `transparent #2D2D2D transparent transparent`,
      };
  }
}

/**
 * Animation variants
 */
function getAnimationVariants(position: Position) {
  const offset = 10;
  const initial = {
    opacity: 0,
    scale: 0.95,
    x: 0,
    y: 0,
  };

  switch (position) {
    case "top":
      return { initial: { ...initial, y: offset }, animate: { opacity: 1, scale: 1, y: 0 } };
    case "bottom":
      return { initial: { ...initial, y: -offset }, animate: { opacity: 1, scale: 1, y: 0 } };
    case "left":
      return { initial: { ...initial, x: offset }, animate: { opacity: 1, scale: 1, x: 0 } };
    case "right":
      return { initial: { ...initial, x: -offset }, animate: { opacity: 1, scale: 1, x: 0 } };
  }
}

/**
 * Simple Tooltip
 */
export const Tooltip = memo(function Tooltip({
  content,
  children,
  position = "top",
  delay = 200,
  disabled = false,
  className = "",
}: TooltipProps) {
  const { colors } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback(() => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  }, [delay, disabled]);

  const hide = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const variants = getAnimationVariants(position);

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      <AnimatePresence>
        {isVisible && content && (
          <motion.div
            className="absolute z-50 px-2 py-1 text-xs rounded-lg whitespace-nowrap pointer-events-none"
            style={{
              ...getPositionStyles(position),
              backgroundColor: "#2D2D2D",
              color: "white",
            }}
            initial={variants.initial}
            animate={variants.animate}
            exit={variants.initial}
            transition={{ duration: 0.15 }}
            role="tooltip"
          >
            {content}
            <div style={getArrowStyles(position, colors)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Rich Tooltip - with title and description
 */
export const RichTooltip = memo(function RichTooltip({
  title,
  description,
  children,
  position = "top",
  delay = 200,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  position?: Position;
  delay?: number;
  className?: string;
}) {
  const { colors } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const variants = getAnimationVariants(position);

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}

      <AnimatePresence>
        {isVisible && (
          <motion.div
            className="absolute z-50 p-3 rounded-xl shadow-lg pointer-events-none"
            style={{
              ...getPositionStyles(position),
              backgroundColor: colors.warmWhite,
              border: `1px solid ${colors.cream}`,
              minWidth: 200,
              maxWidth: 280,
            }}
            initial={variants.initial}
            animate={variants.animate}
            exit={variants.initial}
            transition={{ duration: 0.15 }}
          >
            <div
              className="font-semibold text-sm mb-1"
              style={{ color: colors.textPrimary }}
            >
              {title}
            </div>
            {description && (
              <div
                className="text-xs"
                style={{ color: colors.textSecondary }}
              >
                {description}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Popover - interactive tooltip
 */
export const Popover = memo(function Popover({
  trigger,
  content,
  position = "bottom",
  closeOnClick = true,
  className = "",
}: {
  trigger: ReactNode;
  content: ReactNode;
  position?: Position;
  closeOnClick?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        close();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, close]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, close]);

  const variants = getAnimationVariants(position);

  return (
    <div ref={popoverRef} className={`relative inline-flex ${className}`}>
      <div onClick={toggle}>{trigger}</div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute z-50 p-4 rounded-xl shadow-lg"
            style={{
              ...getPositionStyles(position),
              backgroundColor: colors.warmWhite,
              border: `1px solid ${colors.cream}`,
              minWidth: 200,
            }}
            initial={variants.initial}
            animate={variants.animate}
            exit={variants.initial}
            transition={{ duration: 0.15 }}
            onClick={closeOnClick ? close : undefined}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Info Icon with Tooltip
 */
export const InfoTooltip = memo(function InfoTooltip({
  content,
  position = "top",
  size = 16,
  className = "",
}: {
  content: ReactNode;
  position?: Position;
  size?: number;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <Tooltip content={content} position={position} className={className}>
      <span
        className="inline-flex items-center justify-center rounded-full cursor-help"
        style={{
          width: size,
          height: size,
          backgroundColor: `${colors.coral}20`,
          color: colors.coral,
          fontSize: size * 0.75,
        }}
      >
        ?
      </span>
    </Tooltip>
  );
});

/**
 * Shortcut Tooltip - for keyboard shortcuts
 */
export const ShortcutTooltip = memo(function ShortcutTooltip({
  label,
  shortcut,
  children,
  position = "top",
  className = "",
}: {
  label: string;
  shortcut: string;
  children: ReactNode;
  position?: Position;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <Tooltip
      content={
        <div className="flex items-center gap-2">
          <span>{label}</span>
          <kbd
            className="px-1.5 py-0.5 text-[10px] rounded"
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              border: "1px solid rgba(255,255,255,0.3)",
            }}
          >
            {shortcut}
          </kbd>
        </div>
      }
      position={position}
      className={className}
    >
      {children}
    </Tooltip>
  );
});

/**
 * Truncate with Tooltip - show full text on hover
 */
export const TruncateTooltip = memo(function TruncateTooltip({
  text,
  maxLength = 50,
  position = "top",
  className = "",
}: {
  text: string;
  maxLength?: number;
  position?: Position;
  className?: string;
}) {
  const { colors } = useTheme();
  const needsTruncate = text.length > maxLength;
  const truncated = needsTruncate ? text.slice(0, maxLength) + "..." : text;

  if (!needsTruncate) {
    return <span className={className}>{text}</span>;
  }

  return (
    <Tooltip content={text} position={position} className={className}>
      <span className="cursor-help">{truncated}</span>
    </Tooltip>
  );
});

export default Tooltip;
