"use client";

/**
 * Kbd Components - Sprint 728
 *
 * Keyboard shortcut displays:
 * - Single key display
 * - Key combinations
 * - Shortcut hints
 * - Platform-aware keys
 * - HER-themed styling
 */

import React, { memo, ReactNode, useMemo } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type KeyVariant = "default" | "outline" | "ghost" | "filled";
type KeySize = "xs" | "sm" | "md" | "lg";

interface KbdProps {
  children: ReactNode;
  variant?: KeyVariant;
  size?: KeySize;
  pressed?: boolean;
  className?: string;
}

/**
 * Single Keyboard Key
 */
export const Kbd = memo(function Kbd({
  children,
  variant = "default",
  size = "sm",
  pressed = false,
  className = "",
}: KbdProps) {
  const { colors } = useTheme();

  const sizes = {
    xs: "px-1 py-0.5 text-xs min-w-4",
    sm: "px-1.5 py-0.5 text-xs min-w-5",
    md: "px-2 py-1 text-sm min-w-6",
    lg: "px-3 py-1.5 text-base min-w-8",
  };

  const getVariantStyles = () => {
    const base = pressed
      ? { transform: "translateY(1px)" }
      : {};

    switch (variant) {
      case "outline":
        return {
          ...base,
          backgroundColor: "transparent",
          border: `1px solid ${colors.cream}`,
          color: colors.textPrimary,
          boxShadow: pressed ? "none" : `0 1px 0 ${colors.cream}`,
        };
      case "ghost":
        return {
          ...base,
          backgroundColor: "transparent",
          color: colors.textMuted,
        };
      case "filled":
        return {
          ...base,
          backgroundColor: colors.coral,
          color: colors.warmWhite,
          boxShadow: pressed ? "none" : `0 2px 0 ${colors.coral}CC`,
        };
      default:
        return {
          ...base,
          backgroundColor: colors.cream,
          color: colors.textPrimary,
          boxShadow: pressed ? "none" : `0 2px 0 ${colors.textMuted}40`,
        };
    }
  };

  return (
    <motion.kbd
      className={`inline-flex items-center justify-center rounded font-mono font-medium ${sizes[size]} ${className}`}
      style={getVariantStyles()}
      animate={pressed ? { y: 1 } : { y: 0 }}
      transition={{ duration: 0.05 }}
    >
      {children}
    </motion.kbd>
  );
});

interface KeyComboProps {
  keys: string[];
  separator?: ReactNode;
  variant?: KeyVariant;
  size?: KeySize;
  className?: string;
}

/**
 * Key Combination Display
 */
export const KeyCombo = memo(function KeyCombo({
  keys,
  separator,
  variant = "default",
  size = "sm",
  className = "",
}: KeyComboProps) {
  const { colors } = useTheme();

  const defaultSeparator = (
    <span className="mx-0.5" style={{ color: colors.textMuted }}>
      +
    </span>
  );

  return (
    <span className={`inline-flex items-center ${className}`}>
      {keys.map((key, index) => (
        <React.Fragment key={index}>
          {index > 0 && (separator || defaultSeparator)}
          <Kbd variant={variant} size={size}>
            {formatKey(key)}
          </Kbd>
        </React.Fragment>
      ))}
    </span>
  );
});

interface ShortcutHintProps {
  shortcut: string | string[];
  label?: string;
  description?: string;
  variant?: KeyVariant;
  size?: KeySize;
  layout?: "inline" | "stacked";
  className?: string;
}

/**
 * Shortcut Hint with Label
 */
export const ShortcutHint = memo(function ShortcutHint({
  shortcut,
  label,
  description,
  variant = "default",
  size = "sm",
  layout = "inline",
  className = "",
}: ShortcutHintProps) {
  const { colors } = useTheme();

  const keys = Array.isArray(shortcut) ? shortcut : shortcut.split("+").map((k) => k.trim());

  if (layout === "stacked") {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {label && (
          <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>
            {label}
          </span>
        )}
        <div className="flex items-center gap-2">
          <KeyCombo keys={keys} variant={variant} size={size} />
          {description && (
            <span className="text-xs" style={{ color: colors.textMuted }}>
              {description}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {label && (
        <span className="text-sm" style={{ color: colors.textMuted }}>
          {label}
        </span>
      )}
      <KeyCombo keys={keys} variant={variant} size={size} />
      {description && (
        <span className="text-xs" style={{ color: colors.textMuted }}>
          {description}
        </span>
      )}
    </div>
  );
});

interface ShortcutListProps {
  shortcuts: Array<{
    keys: string | string[];
    label: string;
    description?: string;
    category?: string;
  }>;
  variant?: KeyVariant;
  size?: KeySize;
  showCategories?: boolean;
  className?: string;
}

/**
 * Shortcut List
 */
export const ShortcutList = memo(function ShortcutList({
  shortcuts,
  variant = "default",
  size = "sm",
  showCategories = true,
  className = "",
}: ShortcutListProps) {
  const { colors } = useTheme();

  const grouped = useMemo(() => {
    if (!showCategories) return { _all: shortcuts };

    return shortcuts.reduce(
      (acc, shortcut) => {
        const cat = shortcut.category || "General";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(shortcut);
        return acc;
      },
      {} as Record<string, typeof shortcuts>
    );
  }, [shortcuts, showCategories]);

  return (
    <div className={`space-y-6 ${className}`}>
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          {showCategories && category !== "_all" && (
            <h3
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: colors.textMuted }}
            >
              {category}
            </h3>
          )}

          <div className="space-y-2">
            {items.map((shortcut, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 px-3 rounded-lg"
                style={{ backgroundColor: `${colors.cream}50` }}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                    {shortcut.label}
                  </p>
                  {shortcut.description && (
                    <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                      {shortcut.description}
                    </p>
                  )}
                </div>

                <KeyCombo
                  keys={
                    Array.isArray(shortcut.keys)
                      ? shortcut.keys
                      : shortcut.keys.split("+").map((k) => k.trim())
                  }
                  variant={variant}
                  size={size}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

interface PlatformShortcutProps {
  mac: string | string[];
  windows: string | string[];
  label?: string;
  variant?: KeyVariant;
  size?: KeySize;
  className?: string;
}

/**
 * Platform-Aware Shortcut
 */
export const PlatformShortcut = memo(function PlatformShortcut({
  mac,
  windows,
  label,
  variant = "default",
  size = "sm",
  className = "",
}: PlatformShortcutProps) {
  const { colors } = useTheme();

  const isMac = useMemo(() => {
    if (typeof navigator !== "undefined") {
      return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    }
    return false;
  }, []);

  const keys = isMac
    ? Array.isArray(mac) ? mac : mac.split("+").map((k) => k.trim())
    : Array.isArray(windows) ? windows : windows.split("+").map((k) => k.trim());

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {label && (
        <span className="text-sm" style={{ color: colors.textMuted }}>
          {label}
        </span>
      )}
      <KeyCombo keys={keys} variant={variant} size={size} />
    </span>
  );
});

interface KeyboardLayoutProps {
  highlightKeys?: string[];
  onKeyClick?: (key: string) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Mini Keyboard Layout
 */
export const KeyboardLayout = memo(function KeyboardLayout({
  highlightKeys = [],
  onKeyClick,
  size = "md",
  className = "",
}: KeyboardLayoutProps) {
  const { colors } = useTheme();

  const rows = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
  ];

  const keySizes = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-10 h-10 text-base",
  };

  const isHighlighted = (key: string) =>
    highlightKeys.map((k) => k.toUpperCase()).includes(key.toUpperCase());

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-1 justify-center"
          style={{ paddingLeft: rowIndex * 8 }}
        >
          {row.map((key) => (
            <motion.button
              key={key}
              onClick={() => onKeyClick?.(key)}
              className={`${keySizes[size]} rounded font-mono font-medium flex items-center justify-center`}
              style={{
                backgroundColor: isHighlighted(key) ? colors.coral : colors.cream,
                color: isHighlighted(key) ? colors.warmWhite : colors.textPrimary,
                boxShadow: `0 2px 0 ${isHighlighted(key) ? colors.coral : colors.textMuted}40`,
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95, y: 2 }}
            >
              {key}
            </motion.button>
          ))}
        </div>
      ))}
    </div>
  );
});

interface ShortcutBadgeProps {
  shortcut: string | string[];
  variant?: KeyVariant;
  className?: string;
}

/**
 * Compact Shortcut Badge
 */
export const ShortcutBadge = memo(function ShortcutBadge({
  shortcut,
  variant = "ghost",
  className = "",
}: ShortcutBadgeProps) {
  const keys = Array.isArray(shortcut) ? shortcut : shortcut.split("+").map((k) => k.trim());

  return (
    <span className={`inline-flex items-center ${className}`}>
      {keys.map((key, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="mx-px opacity-50">+</span>}
          <Kbd variant={variant} size="xs">
            {formatKey(key)}
          </Kbd>
        </React.Fragment>
      ))}
    </span>
  );
});

// Helper function to format key names
function formatKey(key: string): string {
  const keyMap: Record<string, string> = {
    cmd: "⌘",
    command: "⌘",
    ctrl: "Ctrl",
    control: "Ctrl",
    alt: "Alt",
    option: "⌥",
    opt: "⌥",
    shift: "⇧",
    enter: "↵",
    return: "↵",
    backspace: "⌫",
    delete: "⌦",
    tab: "⇥",
    escape: "Esc",
    esc: "Esc",
    space: "␣",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
    meta: "⌘",
  };

  const lowerKey = key.toLowerCase();
  return keyMap[lowerKey] || key.charAt(0).toUpperCase() + key.slice(1);
}

// Export the formatKey helper for external use
export { formatKey };

export default Kbd;
