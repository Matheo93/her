"use client";

/**
 * Connection Status - Sprint 578
 *
 * Visual indicator for WebSocket connection quality.
 * Shows connection state with HER-themed animations.
 *
 * States:
 * - Disconnected: Gray, static
 * - Connecting: Coral, pulsing
 * - Connected: Green, subtle breathing
 * - Reconnecting: Orange, fast pulse
 */

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

interface ConnectionStatusProps {
  /** Current connection state */
  state: ConnectionState;
  /** Ping latency in ms (if known) */
  pingMs?: number;
  /** Show latency text */
  showLatency?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional class names */
  className?: string;
}

/**
 * Get color and animation based on state
 */
function getStateConfig(state: ConnectionState, colors: any) {
  switch (state) {
    case "connected":
      return {
        color: colors.success,
        animation: {
          scale: [1, 1.1, 1],
          opacity: [0.8, 1, 0.8],
        },
        transition: {
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut" as const,
        },
        label: "Connecté",
      };
    case "connecting":
      return {
        color: colors.coral,
        animation: {
          scale: [1, 1.3, 1],
          opacity: [0.5, 1, 0.5],
        },
        transition: {
          duration: 1,
          repeat: Infinity,
          ease: "easeInOut" as const,
        },
        label: "Connexion...",
      };
    case "reconnecting":
      return {
        color: colors.warning,
        animation: {
          scale: [1, 1.2, 1],
          opacity: [0.6, 1, 0.6],
        },
        transition: {
          duration: 0.6,
          repeat: Infinity,
          ease: "easeInOut" as const,
        },
        label: "Reconnexion...",
      };
    case "disconnected":
    default:
      return {
        color: colors.textMuted,
        animation: {},
        transition: {},
        label: "Déconnecté",
      };
  }
}

/**
 * Get size values
 */
function getSizeConfig(size: "sm" | "md" | "lg") {
  switch (size) {
    case "sm":
      return { dot: 6, ring: 14, fontSize: "text-xs" };
    case "lg":
      return { dot: 12, ring: 24, fontSize: "text-sm" };
    case "md":
    default:
      return { dot: 8, ring: 18, fontSize: "text-xs" };
  }
}

export const ConnectionStatus = memo(function ConnectionStatus({
  state,
  pingMs,
  showLatency = false,
  size = "md",
  className = "",
}: ConnectionStatusProps) {
  const { colors } = useTheme();
  const config = getStateConfig(state, colors);
  const sizeConfig = getSizeConfig(size);

  // Determine latency quality
  const latencyQuality = pingMs
    ? pingMs < 100 ? "excellent" : pingMs < 300 ? "good" : "poor"
    : null;

  const latencyColor = latencyQuality === "excellent"
    ? colors.success
    : latencyQuality === "good"
      ? colors.coral
      : colors.warning;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Status indicator */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: sizeConfig.ring, height: sizeConfig.ring }}
      >
        {/* Outer ring (for connecting/reconnecting states) */}
        <AnimatePresence>
          {(state === "connecting" || state === "reconnecting") && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: `1px solid ${config.color}` }}
              initial={{ scale: 1, opacity: 0 }}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 0, 0.5],
              }}
              exit={{ scale: 1, opacity: 0 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
          )}
        </AnimatePresence>

        {/* Main dot */}
        <motion.div
          className="rounded-full"
          style={{
            width: sizeConfig.dot,
            height: sizeConfig.dot,
            backgroundColor: config.color,
          }}
          animate={config.animation}
          transition={config.transition}
        />
      </div>

      {/* Latency display */}
      {showLatency && state === "connected" && pingMs !== undefined && (
        <motion.span
          className={`${sizeConfig.fontSize} font-mono`}
          style={{ color: latencyColor }}
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          {pingMs}ms
        </motion.span>
      )}

      {/* State label (for non-connected states) */}
      {state !== "connected" && (
        <motion.span
          className={`${sizeConfig.fontSize}`}
          style={{ color: config.color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {config.label}
        </motion.span>
      )}
    </div>
  );
});

export default ConnectionStatus;
