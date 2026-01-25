"use client";

/**
 * Voice Mode Panel - Sprint 582
 *
 * Comprehensive voice interaction UI combining:
 * - Push-to-talk / voice activation toggle
 * - Waveform visualizer (user & EVA)
 * - Voice status indicator
 * - Microphone controls
 *
 * HER-inspired: intimate, warm, approachable.
 */

import React, { memo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { WaveformVisualizer } from "./WaveformVisualizer";

type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

interface VoiceModeProps {
  /** Current voice state */
  state: VoiceState;
  /** User's microphone audio level (0-1) */
  userLevel?: number;
  /** EVA's audio output level (0-1) */
  evaLevel?: number;
  /** Whether voice mode is enabled */
  isEnabled?: boolean;
  /** Push-to-talk mode vs voice activation */
  pushToTalk?: boolean;
  /** Whether currently holding PTT button */
  isPTTActive?: boolean;
  /** Callback when PTT starts */
  onPTTStart?: () => void;
  /** Callback when PTT ends */
  onPTTEnd?: () => void;
  /** Callback to toggle voice mode */
  onToggle?: () => void;
  /** Callback to toggle PTT mode */
  onTogglePTT?: () => void;
  /** Callback to mute/unmute */
  onMuteToggle?: () => void;
  /** Whether muted */
  isMuted?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * State config for visual styling
 */
function getStateConfig(state: VoiceState, colors: any) {
  switch (state) {
    case "listening":
      return {
        color: colors.coral,
        label: "À l'écoute...",
        icon: "mic",
        pulse: true,
      };
    case "processing":
      return {
        color: colors.warmWhite,
        label: "Réflexion...",
        icon: "processing",
        pulse: true,
      };
    case "speaking":
      return {
        color: colors.success,
        label: "EVA parle",
        icon: "speaker",
        pulse: false,
      };
    case "error":
      return {
        color: colors.error,
        label: "Erreur micro",
        icon: "error",
        pulse: false,
      };
    case "idle":
    default:
      return {
        color: colors.textMuted,
        label: "Voix désactivée",
        icon: "mic-off",
        pulse: false,
      };
  }
}

/**
 * Microphone Icon Component
 */
const MicIcon = memo(function MicIcon({
  active,
  color,
}: {
  active: boolean;
  color: string;
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {active ? (
        <>
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </>
      ) : (
        <>
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </>
      )}
    </svg>
  );
});

/**
 * Push-to-Talk Button
 */
const PTTButton = memo(function PTTButton({
  isActive,
  isEnabled,
  color,
  onStart,
  onEnd,
}: {
  isActive: boolean;
  isEnabled: boolean;
  color: string;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const { colors } = useTheme();

  const handlePointerDown = useCallback(() => {
    if (isEnabled && onStart) onStart();
  }, [isEnabled, onStart]);

  const handlePointerUp = useCallback(() => {
    if (isEnabled && onEnd) onEnd();
  }, [isEnabled, onEnd]);

  return (
    <motion.button
      className="relative rounded-full flex items-center justify-center touch-none select-none"
      style={{
        width: 64,
        height: 64,
        backgroundColor: isActive ? color : colors.cream,
        border: `2px solid ${isActive ? color : colors.textMuted}`,
        cursor: isEnabled ? "pointer" : "not-allowed",
        opacity: isEnabled ? 1 : 0.5,
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      whileHover={isEnabled ? { scale: 1.05 } : {}}
      whileTap={isEnabled ? { scale: 0.95 } : {}}
      animate={{
        boxShadow: isActive
          ? `0 0 20px ${color}60`
          : `0 2px 8px ${colors.softShadow}40`,
      }}
      aria-label="Maintenir pour parler"
    >
      <MicIcon active={isActive} color={isActive ? colors.warmWhite : colors.textMuted} />

      {/* Active pulse ring */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ border: `2px solid ${color}` }}
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.8, 0, 0.8],
            }}
            exit={{ scale: 1, opacity: 0 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeOut" as const,
            }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
});

/**
 * Voice Toggle Button (for voice activation mode)
 */
const VoiceToggle = memo(function VoiceToggle({
  isEnabled,
  state,
  color,
  onToggle,
}: {
  isEnabled: boolean;
  state: VoiceState;
  color: string;
  onToggle?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <motion.button
      className="relative rounded-full flex items-center justify-center"
      style={{
        width: 48,
        height: 48,
        backgroundColor: isEnabled ? color : colors.cream,
        border: `2px solid ${isEnabled ? color : colors.textMuted}`,
      }}
      onClick={onToggle}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={isEnabled ? "Désactiver la voix" : "Activer la voix"}
    >
      <MicIcon
        active={isEnabled}
        color={isEnabled ? colors.warmWhite : colors.textMuted}
      />

      {/* Listening pulse */}
      <AnimatePresence>
        {state === "listening" && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ border: `2px solid ${color}` }}
            initial={{ scale: 1, opacity: 0 }}
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.6, 0, 0.6],
            }}
            exit={{ scale: 1, opacity: 0 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut" as const,
            }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
});

/**
 * Main Voice Mode Panel
 */
export const VoiceModePanel = memo(function VoiceModePanel({
  state = "idle",
  userLevel = 0,
  evaLevel = 0,
  isEnabled = false,
  pushToTalk = false,
  isPTTActive = false,
  onPTTStart,
  onPTTEnd,
  onToggle,
  onTogglePTT,
  onMuteToggle,
  isMuted = false,
  className = "",
}: VoiceModeProps) {
  const { colors } = useTheme();
  const config = getStateConfig(state, colors);

  return (
    <motion.div
      className={`flex flex-col items-center gap-4 p-4 rounded-2xl ${className}`}
      style={{
        backgroundColor: `${colors.warmWhite}f0`,
        boxShadow: `0 4px 20px ${colors.softShadow}30`,
        border: `1px solid ${colors.cream}`,
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <motion.div
          className="rounded-full"
          style={{
            width: 8,
            height: 8,
            backgroundColor: config.color,
          }}
          animate={
            config.pulse
              ? { scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }
              : {}
          }
          transition={
            config.pulse
              ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" as const }
              : {}
          }
        />
        <span
          className="text-sm font-light"
          style={{ color: colors.textSecondary }}
        >
          {config.label}
        </span>
      </div>

      {/* Waveform visualizers */}
      <div className="flex items-center gap-6">
        {/* User waveform */}
        <div className="flex flex-col items-center gap-1">
          <WaveformVisualizer
            level={userLevel}
            isActive={state === "listening" || isPTTActive}
            variant="bars"
            barCount={5}
            maxHeight={20}
            color={colors.coral}
          />
          <span
            className="text-xs"
            style={{ color: colors.textMuted }}
          >
            Vous
          </span>
        </div>

        {/* Main control */}
        {pushToTalk ? (
          <PTTButton
            isActive={isPTTActive}
            isEnabled={isEnabled}
            color={colors.coral}
            onStart={onPTTStart}
            onEnd={onPTTEnd}
          />
        ) : (
          <VoiceToggle
            isEnabled={isEnabled}
            state={state}
            color={colors.coral}
            onToggle={onToggle}
          />
        )}

        {/* EVA waveform */}
        <div className="flex flex-col items-center gap-1">
          <WaveformVisualizer
            level={evaLevel}
            isActive={state === "speaking"}
            variant="wave"
            barCount={5}
            maxHeight={20}
            color={colors.success}
          />
          <span
            className="text-xs"
            style={{ color: colors.textMuted }}
          >
            EVA
          </span>
        </div>
      </div>

      {/* Mode toggle and mute */}
      <div className="flex items-center gap-4">
        {/* PTT mode toggle */}
        <button
          className="text-xs px-3 py-1 rounded-full transition-colors"
          style={{
            backgroundColor: pushToTalk ? colors.coral : colors.cream,
            color: pushToTalk ? colors.warmWhite : colors.textSecondary,
          }}
          onClick={onTogglePTT}
        >
          {pushToTalk ? "PTT" : "Auto"}
        </button>

        {/* Mute toggle */}
        <button
          className="text-xs px-3 py-1 rounded-full transition-colors"
          style={{
            backgroundColor: isMuted ? colors.error : colors.cream,
            color: isMuted ? colors.warmWhite : colors.textSecondary,
          }}
          onClick={onMuteToggle}
        >
          {isMuted ? "Muet" : "Son"}
        </button>
      </div>
    </motion.div>
  );
});

/**
 * Compact Voice Button - For use in header/footer
 */
export const CompactVoiceButton = memo(function CompactVoiceButton({
  state,
  isEnabled,
  onToggle,
  className = "",
}: {
  state: VoiceState;
  isEnabled: boolean;
  onToggle?: () => void;
  className?: string;
}) {
  const { colors } = useTheme();
  const config = getStateConfig(state, colors);

  return (
    <motion.button
      className={`relative rounded-full p-2 ${className}`}
      style={{
        backgroundColor: isEnabled ? `${config.color}20` : "transparent",
      }}
      onClick={onToggle}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      aria-label={isEnabled ? "Désactiver la voix" : "Activer la voix"}
    >
      <MicIcon active={isEnabled && state !== "error"} color={config.color} />

      {/* Active indicator dot */}
      {isEnabled && state === "listening" && (
        <motion.div
          className="absolute -top-0.5 -right-0.5 rounded-full"
          style={{
            width: 8,
            height: 8,
            backgroundColor: colors.coral,
          }}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [1, 0.6, 1],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: "easeInOut" as const,
          }}
        />
      )}
    </motion.button>
  );
});

export default VoiceModePanel;
