// HER Color Palette - Warm, intimate, human
// Inspired by the film "Her" (2013) by Spike Jonze

export const HER_COLORS = {
  // Primary palette
  coral: "#E8846B",      // Warmth, emotion, life
  cream: "#F5E6D3",      // Softness, comfort
  warmWhite: "#FAF8F5",  // Calming background
  earth: "#8B7355",      // Grounding, natural
  softShadow: "#D4C4B5", // Subtle depth
  blush: "#E8A090",      // Delicate accent

  // Functional colors (warm variants)
  success: "#7A9E7E",    // Soft green (connected)
  error: "#C97B7B",      // Soft red (warm error)
  warning: "#D4A574",    // Warm amber

  // Text colors
  textPrimary: "#8B7355",   // Earth tone for main text
  textSecondary: "#A89580", // Lighter earth
  textMuted: "#D4C4B5",     // Muted, subtle

  // Background gradients
  bgGradient: "linear-gradient(135deg, #FAF8F5 0%, #F5E6D3 100%)",
  glowCoral: "rgba(232, 132, 107, 0.3)",
  glowWarm: "rgba(232, 160, 144, 0.4)",
} as const;

// Dark mode palette - warm evening tones (not cold/tech)
// Improved contrast for WCAG accessibility
export const HER_COLORS_DARK = {
  // Primary palette - warm dark
  coral: "#EF9A83",       // Slightly lighter coral for better contrast
  cream: "#3D3530",       // Dark warm cream
  warmWhite: "#252120",   // Slightly darker background for contrast
  earth: "#E8DDD0",       // Higher contrast earth text
  softShadow: "#4A4035",  // Dark shadow
  blush: "#EFB0A0",       // Slightly lighter blush

  // Functional colors - improved visibility
  success: "#8CB98F",     // Brighter green
  error: "#D98B8B",       // Brighter red
  warning: "#E4B584",     // Brighter amber

  // Text colors - improved contrast ratios (WCAG AA+)
  textPrimary: "#F0E6DC",    // Lighter for 7:1 contrast
  textSecondary: "#D8CCC0",  // Improved secondary contrast
  textMuted: "#7A6D60",      // Slightly lighter muted

  // Background gradients
  bgGradient: "linear-gradient(135deg, #252120 0%, #3D3530 100%)",
  glowCoral: "rgba(239, 154, 131, 0.25)",
  glowWarm: "rgba(239, 176, 160, 0.3)",
} as const;

// Type for color modes
export type ColorMode = "light" | "dark";

// Get colors based on mode
export function getHerColors(mode: ColorMode) {
  return mode === "dark" ? HER_COLORS_DARK : HER_COLORS;
}

// Emotion to visual presence mapping
// No labels, just feeling through color warmth
export const EMOTION_PRESENCE: Record<string, { glow: string; warmth: number }> = {
  joy: { glow: "rgba(232, 132, 107, 0.4)", warmth: 1.2 },
  sadness: { glow: "rgba(139, 115, 85, 0.3)", warmth: 0.8 },
  tenderness: { glow: "rgba(232, 160, 144, 0.5)", warmth: 1.1 },
  excitement: { glow: "rgba(232, 132, 107, 0.5)", warmth: 1.3 },
  anger: { glow: "rgba(201, 123, 123, 0.4)", warmth: 1.0 },
  fear: { glow: "rgba(168, 149, 128, 0.4)", warmth: 0.9 },
  surprise: { glow: "rgba(232, 160, 144, 0.4)", warmth: 1.1 },
  neutral: { glow: "rgba(212, 196, 181, 0.3)", warmth: 1.0 },
};

// Animation timing - organic, breathing
export const HER_TIMING = {
  breathe: 4000,       // 4 seconds breathing cycle
  blink: 4000,         // Natural blink interval
  transition: 300,     // Quick but smooth
  idle: 6000,          // Subtle idle movement
  speaking: 200,       // Mouth animation
} as const;

// Spring animation configs for framer-motion
export const HER_SPRINGS = {
  gentle: { type: "spring", stiffness: 100, damping: 20 },
  breathing: { type: "spring", stiffness: 50, damping: 15 },
  snappy: { type: "spring", stiffness: 300, damping: 25 },
} as const;

// CSS-in-JS helpers
export const herStyles = {
  // Main background
  background: {
    backgroundColor: HER_COLORS.warmWhite,
  },

  // Ambient gradient overlay
  ambientGradient: {
    background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
  },

  // Input field style
  input: {
    backgroundColor: HER_COLORS.cream,
    color: HER_COLORS.earth,
    border: "none",
    outline: "none",
  },

  // Button styles
  buttonPrimary: {
    backgroundColor: HER_COLORS.coral,
    color: HER_COLORS.warmWhite,
  },

  buttonSecondary: {
    backgroundColor: HER_COLORS.cream,
    color: HER_COLORS.earth,
  },

  // Text styles
  textPrimary: {
    color: HER_COLORS.earth,
  },

  textMuted: {
    color: HER_COLORS.softShadow,
  },
};

// FORBIDDEN COLORS - DO NOT USE
// These create a generic "AI" or "tech" feel that breaks the HER experience
//
// ❌ slate (all variants)  - Too cold
// ❌ zinc (all variants)   - Too dark/tech
// ❌ gray (all variants)   - Lifeless
// ❌ purple/violet         - Generic "AI" color
// ❌ blue (bright)         - Cold tech
// ❌ pink (generic)        - rose-400, pink-500
// ❌ pure black (#000000)  - Too harsh
//
// ❌ animate-pulse         - Generic Tailwind
// ❌ animate-bounce        - Childish
// ❌ blur-3xl              - Overdone
