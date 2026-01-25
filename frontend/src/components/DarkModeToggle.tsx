"use client";

/**
 * Dark Mode Toggle - HER-style theme switcher
 * Sprint 572 - Frontend Feature
 *
 * Features:
 * - Animated sun/moon icons
 * - Smooth transitions
 * - Accessible (keyboard, aria)
 * - HER warm color palette
 */

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { HER_SPRINGS } from "@/styles/her-theme";

interface DarkModeToggleProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { button: "w-8 h-8", icon: 14 },
  md: { button: "w-10 h-10", icon: 18 },
  lg: { button: "w-12 h-12", icon: 22 },
};

/**
 * Sun icon with animated rays
 */
const SunIcon = memo(({ size }: { size: number }) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    initial={{ rotate: -90, scale: 0 }}
    animate={{ rotate: 0, scale: 1 }}
    exit={{ rotate: 90, scale: 0 }}
    transition={HER_SPRINGS.themeSwitch}
  >
    {/* Sun core */}
    <circle cx="12" cy="12" r="4" />
    {/* Sun rays */}
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
    >
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
    </motion.g>
  </motion.svg>
));
SunIcon.displayName = "SunIcon";

/**
 * Moon icon with stars
 */
const MoonIcon = memo(({ size }: { size: number }) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    initial={{ rotate: 90, scale: 0 }}
    animate={{ rotate: 0, scale: 1 }}
    exit={{ rotate: -90, scale: 0 }}
    transition={HER_SPRINGS.themeSwitch}
  >
    {/* Moon crescent */}
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    {/* Stars */}
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.15 }}
    >
      <circle cx="18" cy="5" r="1" fill="currentColor" />
      <circle cx="20" cy="9" r="0.5" fill="currentColor" />
    </motion.g>
  </motion.svg>
));
MoonIcon.displayName = "MoonIcon";

/**
 * Dark Mode Toggle Button
 *
 * Uses HER warm color palette for both modes.
 * Smooth spring animations for icon transition.
 */
export const DarkModeToggle = memo(function DarkModeToggle({
  size = "md",
  className = "",
}: DarkModeToggleProps) {
  const { mode, toggleMode, isTransitioning, colors } = useTheme();
  const isDark = mode === "dark";
  const sizeConfig = SIZES[size];

  return (
    <motion.button
      onClick={toggleMode}
      disabled={isTransitioning}
      className={`
        ${sizeConfig.button}
        relative rounded-full
        flex items-center justify-center
        transition-colors duration-300
        focus:outline-none focus:ring-2 focus:ring-offset-2
        disabled:opacity-70 disabled:cursor-wait
        ${className}
      `}
      style={{
        backgroundColor: isDark ? colors.softShadow : colors.cream,
        color: isDark ? colors.coral : colors.earth,
        boxShadow: `0 2px 8px ${isDark ? "rgba(0,0,0,0.3)" : "rgba(139,115,85,0.15)"}`,
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <MoonIcon key="moon" size={sizeConfig.icon} />
        ) : (
          <SunIcon key="sun" size={sizeConfig.icon} />
        )}
      </AnimatePresence>

      {/* Subtle glow effect */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${colors.glowCoral} 0%, transparent 70%)`,
        }}
        animate={{
          opacity: isDark ? 0.4 : 0.2,
          scale: isDark ? 1.2 : 1,
        }}
        transition={HER_SPRINGS.gentle}
      />
    </motion.button>
  );
});

export default DarkModeToggle;
