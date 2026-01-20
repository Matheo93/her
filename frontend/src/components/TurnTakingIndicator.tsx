"use client";

/**
 * TurnTakingIndicator - Conversational Turn Signals
 *
 * Shows subtle visual cues indicating the conversational state:
 * - When EVA is listening attentively
 * - When EVA is ready to speak (detected a transition-relevant point)
 * - When EVA is yielding the floor back to user
 *
 * Based on research from:
 * - Tavus AI turn-taking (TRP detection)
 * - NVIDIA PersonaPlex (full-duplex conversation)
 * - Amazon Nova 2 Sonic (natural turn-taking)
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";

export type TurnState =
  | "user_speaking"     // User is currently speaking
  | "user_pausing"      // User paused briefly (might continue)
  | "trp_detected"      // Transition-relevant point - EVA ready to speak
  | "eva_preparing"     // EVA is about to speak
  | "eva_speaking"      // EVA is speaking
  | "eva_yielding"      // EVA finished, yielding floor
  | "neutral";          // No active turn

interface TurnTakingIndicatorProps {
  turnState: TurnState;
  className?: string;
}

// Visual configuration for each state
const STATE_CONFIG: Record<TurnState, {
  color: string;
  opacity: number;
  scale: number;
  pulse: boolean;
  label?: string; // Hidden, for accessibility
}> = {
  user_speaking: {
    color: HER_COLORS.earth,
    opacity: 0.4,
    scale: 1,
    pulse: false,
    label: "Listening",
  },
  user_pausing: {
    color: HER_COLORS.earth,
    opacity: 0.5,
    scale: 1.02,
    pulse: true,
    label: "Listening",
  },
  trp_detected: {
    color: HER_COLORS.coral,
    opacity: 0.6,
    scale: 1.05,
    pulse: true,
    label: "Ready to respond",
  },
  eva_preparing: {
    color: HER_COLORS.coral,
    opacity: 0.8,
    scale: 1.08,
    pulse: false,
    label: "Preparing response",
  },
  eva_speaking: {
    color: HER_COLORS.coral,
    opacity: 0.3,
    scale: 1,
    pulse: false,
    label: "Speaking",
  },
  eva_yielding: {
    color: HER_COLORS.softShadow,
    opacity: 0.3,
    scale: 0.98,
    pulse: false,
    label: "Your turn",
  },
  neutral: {
    color: HER_COLORS.softShadow,
    opacity: 0.2,
    scale: 1,
    pulse: false,
    label: "",
  },
};

export function TurnTakingIndicator({
  turnState,
  className = "",
}: TurnTakingIndicatorProps) {
  const config = STATE_CONFIG[turnState];

  return (
    <motion.div
      className={`relative ${className}`}
      animate={{
        scale: config.scale,
      }}
      transition={HER_SPRINGS.gentle}
      role="status"
      aria-label={config.label}
    >
      {/* Base ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2"
        style={{
          borderColor: config.color,
        }}
        animate={{
          opacity: config.opacity,
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Pulse effect for certain states */}
      <AnimatePresence>
        {config.pulse && (
          <motion.div
            className="absolute inset-0 rounded-full border"
            style={{
              borderColor: config.color,
            }}
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.5, 0, 0.5],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </AnimatePresence>

      {/* TRP indicator - special glow when ready to speak */}
      <AnimatePresence>
        {turnState === "trp_detected" && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral}30 0%, transparent 60%)`,
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: [0.4, 0.7, 0.4],
              scale: [1, 1.05, 1],
            }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </AnimatePresence>

      {/* Preparing to speak - building intensity */}
      <AnimatePresence>
        {turnState === "eva_preparing" && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral}40 0%, ${HER_COLORS.coral}20 50%, transparent 80%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, repeat: Infinity }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Hook to detect turn-taking state based on audio levels and timing
 */
interface UseTurnTakingOptions {
  userAudioLevel: number;
  isEvaSpeaking: boolean;
  isEvaListening: boolean;
  isEvaThinking: boolean;
  hasEvaResponse: boolean;
}

export function useTurnTaking({
  userAudioLevel,
  isEvaSpeaking,
  isEvaListening,
  isEvaThinking,
  hasEvaResponse,
}: UseTurnTakingOptions): TurnState {
  const [turnState, setTurnState] = useState<TurnState>("neutral");

  // Refs for timing
  const userSilenceStart = useRef<number | null>(null);
  const lastUserAudioLevel = useRef(0);
  const stateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Threshold for user speaking
  const isUserSpeaking = userAudioLevel > 0.1;

  useEffect(() => {
    // Clear any pending state changes
    if (stateTimeoutRef.current) {
      clearTimeout(stateTimeoutRef.current);
    }

    // Determine turn state based on inputs
    if (isEvaSpeaking) {
      setTurnState("eva_speaking");
      userSilenceStart.current = null;
    } else if (isEvaThinking && hasEvaResponse) {
      setTurnState("eva_preparing");
      userSilenceStart.current = null;
    } else if (isEvaListening) {
      if (isUserSpeaking) {
        setTurnState("user_speaking");
        userSilenceStart.current = null;
      } else {
        // User stopped speaking
        if (lastUserAudioLevel.current > 0.1 && userSilenceStart.current === null) {
          // User just stopped - start tracking silence
          userSilenceStart.current = Date.now();
          setTurnState("user_pausing");
        } else if (userSilenceStart.current !== null) {
          const silenceDuration = Date.now() - userSilenceStart.current;

          // TRP detection: 400-1000ms of silence after speech
          if (silenceDuration > 400 && silenceDuration < 1000 && isEvaThinking) {
            setTurnState("trp_detected");
          } else if (silenceDuration >= 1000) {
            // Longer silence - EVA might speak or yield
            if (hasEvaResponse) {
              setTurnState("eva_preparing");
            } else {
              setTurnState("neutral");
            }
          }
        }
      }
    } else {
      // Not in active conversation
      setTurnState("neutral");
      userSilenceStart.current = null;
    }

    lastUserAudioLevel.current = userAudioLevel;

    return () => {
      if (stateTimeoutRef.current) {
        clearTimeout(stateTimeoutRef.current);
      }
    };
  }, [userAudioLevel, isEvaSpeaking, isEvaListening, isEvaThinking, hasEvaResponse, isUserSpeaking]);

  return turnState;
}
