"use client";

/**
 * Keyboard Shortcut Components - Sprint 762
 *
 * Display keyboard shortcuts:
 * - Key badges
 * - Shortcut combinations
 * - Platform detection
 * - Shortcut hints
 * - HER-themed styling
 */

import React, { memo, useMemo, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type KeyModifier = "cmd" | "ctrl" | "alt" | "shift" | "meta";
type Platform = "mac" | "windows" | "linux";

interface KBDProps {
  children: ReactNode;
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

/**
 * Single Key Badge
 */
export const KBD = memo(function KBD({
  children,
  size = "sm",
  variant = "default",
  className = "",
}: KBDProps) {
  const { colors } = useTheme();

  const sizeStyles = {
    xs: { padding: "1px 4px", fontSize: 10, minWidth: 18, borderRadius: 4 },
    sm: { padding: "2px 6px", fontSize: 11, minWidth: 22, borderRadius: 5 },
    md: { padding: "3px 8px", fontSize: 12, minWidth: 26, borderRadius: 6 },
    lg: { padding: "4px 10px", fontSize: 14, minWidth: 32, borderRadius: 8 },
  };

  const variantStyles = {
    default: {
      backgroundColor: colors.cream,
      color: colors.textPrimary,
      border: "1px solid " + colors.textMuted + "40",
      boxShadow: "0 1px 0 " + colors.textMuted + "30",
    },
    outline: {
      backgroundColor: "transparent",
      color: colors.textPrimary,
      border: "1px solid " + colors.textMuted,
      boxShadow: "none",
    },
    ghost: {
      backgroundColor: colors.cream + "60",
      color: colors.textMuted,
      border: "none",
      boxShadow: "none",
    },
  };

  return (
    <kbd
      className={"inline-flex items-center justify-center font-mono font-medium " + className}
      style={{
        ...sizeStyles[size],
        ...variantStyles[variant],
      }}
    >
      {children}
    </kbd>
  );
});

interface ShortcutProps {
  keys: string[];
  separator?: "+" | "-" | " ";
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

/**
 * Keyboard Shortcut (Multiple Keys)
 */
export const Shortcut = memo(function Shortcut({
  keys,
  separator = "+",
  size = "sm",
  variant = "default",
  className = "",
}: ShortcutProps) {
  const { colors } = useTheme();

  return (
    <span className={"inline-flex items-center gap-1 " + className}>
      {keys.map((key, index) => (
        <span key={index} className="inline-flex items-center gap-1">
          {index > 0 && (
            <span className="text-xs" style={{ color: colors.textMuted }}>
              {separator}
            </span>
          )}
          <KBD size={size} variant={variant}>
            {formatKey(key)}
          </KBD>
        </span>
      ))}
    </span>
  );
});

/**
 * Format key for display
 */
function formatKey(key: string): string {
  const isMac = typeof window !== "undefined" && navigator.platform.includes("Mac");

  const keyMap: Record<string, string> = {
    cmd: isMac ? "⌘" : "Ctrl",
    ctrl: isMac ? "⌃" : "Ctrl",
    alt: isMac ? "⌥" : "Alt",
    shift: isMac ? "⇧" : "Shift",
    meta: isMac ? "⌘" : "Win",
    enter: "↵",
    return: "↵",
    tab: "⇥",
    backspace: "⌫",
    delete: "⌦",
    escape: "Esc",
    esc: "Esc",
    space: "Space",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
    home: "Home",
    end: "End",
    pageup: "PgUp",
    pagedown: "PgDn",
  };

  const lower = key.toLowerCase();
  return keyMap[lower] || key.toUpperCase();
}

interface ShortcutHintProps {
  label: string;
  keys: string[];
  description?: string;
  className?: string;
}

/**
 * Shortcut with Label
 */
export const ShortcutHint = memo(function ShortcutHint({
  label,
  keys,
  description,
  className = "",
}: ShortcutHintProps) {
  const { colors } = useTheme();

  return (
    <div className={"flex items-center justify-between gap-4 " + className}>
      <div className="flex-1 min-w-0">
        <span className="font-medium" style={{ color: colors.textPrimary }}>
          {label}
        </span>
        {description && (
          <p className="text-xs truncate" style={{ color: colors.textMuted }}>
            {description}
          </p>
        )}
      </div>
      <Shortcut keys={keys} size="xs" />
    </div>
  );
});

interface ShortcutListProps {
  shortcuts: Array<{
    label: string;
    keys: string[];
    description?: string;
    category?: string;
  }>;
  grouped?: boolean;
  className?: string;
}

/**
 * List of Shortcuts
 */
export const ShortcutList = memo(function ShortcutList({
  shortcuts,
  grouped = false,
  className = "",
}: ShortcutListProps) {
  const { colors } = useTheme();

  const groupedShortcuts = useMemo(() => {
    if (!grouped) return { "": shortcuts };

    const groups: Record<string, typeof shortcuts> = {};
    shortcuts.forEach((s) => {
      const cat = s.category || "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, [shortcuts, grouped]);

  return (
    <div className={className}>
      {Object.entries(groupedShortcuts).map(([category, items]) => (
        <div key={category} className="mb-4 last:mb-0">
          {category && grouped && (
            <h4
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: colors.textMuted }}
            >
              {category}
            </h4>
          )}
          <div className="space-y-2">
            {items.map((shortcut, index) => (
              <ShortcutHint
                key={index}
                label={shortcut.label}
                keys={shortcut.keys}
                description={shortcut.description}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

interface HotkeyBadgeProps {
  hotkey: string;
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  className?: string;
}

/**
 * Hotkey Badge (for buttons/elements)
 */
export const HotkeyBadge = memo(function HotkeyBadge({
  hotkey,
  position = "top-right",
  className = "",
}: HotkeyBadgeProps) {
  const { colors } = useTheme();

  const positionStyles = {
    "top-right": { top: -8, right: -8 },
    "top-left": { top: -8, left: -8 },
    "bottom-right": { bottom: -8, right: -8 },
    "bottom-left": { bottom: -8, left: -8 },
  };

  return (
    <motion.div
      className={"absolute z-10 " + className}
      style={{
        ...positionStyles[position],
      }}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 500 }}
    >
      <KBD size="xs" variant="default">
        {formatKey(hotkey)}
      </KBD>
    </motion.div>
  );
});

interface KeyComboProps {
  combo: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

/**
 * Parse and display key combination string
 */
export const KeyCombo = memo(function KeyCombo({
  combo,
  size = "sm",
  className = "",
}: KeyComboProps) {
  const keys = useMemo(() => {
    return combo.split("+").map((k) => k.trim());
  }, [combo]);

  return <Shortcut keys={keys} size={size} className={className} />;
});

interface PlatformShortcutProps {
  mac: string[];
  windows: string[];
  linux?: string[];
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

/**
 * Platform-specific Shortcut Display
 */
export const PlatformShortcut = memo(function PlatformShortcut({
  mac,
  windows,
  linux,
  size = "sm",
  className = "",
}: PlatformShortcutProps) {
  const platform = useMemo((): Platform => {
    if (typeof window === "undefined") return "windows";

    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "mac";
    if (ua.includes("linux")) return "linux";
    return "windows";
  }, []);

  const keys = useMemo(() => {
    if (platform === "mac") return mac;
    if (platform === "linux") return linux || windows;
    return windows;
  }, [platform, mac, windows, linux]);

  return <Shortcut keys={keys} size={size} className={className} />;
});

interface ShortcutCardProps {
  title: string;
  shortcuts: Array<{
    label: string;
    keys: string[];
  }>;
  className?: string;
}

/**
 * Shortcut Card (grouped shortcuts)
 */
export const ShortcutCard = memo(function ShortcutCard({
  title,
  shortcuts,
  className = "",
}: ShortcutCardProps) {
  const { colors } = useTheme();

  return (
    <motion.div
      className={"p-4 rounded-xl " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
      whileHover={{ y: -2 }}
    >
      <h3
        className="text-sm font-semibold mb-3"
        style={{ color: colors.coral }}
      >
        {title}
      </h3>
      <div className="space-y-2">
        {shortcuts.map((shortcut, index) => (
          <div
            key={index}
            className="flex items-center justify-between text-sm"
          >
            <span style={{ color: colors.textPrimary }}>{shortcut.label}</span>
            <Shortcut keys={shortcut.keys} size="xs" />
          </div>
        ))}
      </div>
    </motion.div>
  );
});

interface ShortcutOverlayProps {
  visible: boolean;
  onClose: () => void;
  shortcuts: Array<{
    label: string;
    keys: string[];
    category?: string;
  }>;
  title?: string;
}

/**
 * Keyboard Shortcuts Overlay/Modal
 */
export const ShortcutOverlay = memo(function ShortcutOverlay({
  visible,
  onClose,
  shortcuts,
  title = "Keyboard Shortcuts",
}: ShortcutOverlayProps) {
  const { colors } = useTheme();

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="w-full max-w-lg max-h-96 overflow-y-auto rounded-2xl p-6"
        style={{ backgroundColor: colors.warmWhite }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: colors.textPrimary }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-opacity-50 transition-colors"
            style={{ color: colors.textMuted }}
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <ShortcutList shortcuts={shortcuts} grouped />

        <div
          className="mt-4 pt-4 border-t text-center text-xs"
          style={{ borderColor: colors.cream, color: colors.textMuted }}
        >
          Press <KBD size="xs">Esc</KBD> or click outside to close
        </div>
      </motion.div>
    </motion.div>
  );
});

// Icons
const CloseIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export { formatKey };
export default KBD;
