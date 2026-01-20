"use client";

/**
 * VoicePresenceBreath - Visual Breath Cues for Speech
 *
 * Shows subtle visual indicators of EVA's breathing rhythm,
 * especially the "inhale before speaking" moment that humans do.
 *
 * This creates presence through anticipation - you can SEE her
 * prepare to speak, making the moment feel more intimate.
 *
 * Based on Sesame's voice presence research on natural timing and pauses.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";

interface VoicePresenceBreathProps {
  // Current state
  isIdle: boolean;
  isListening: boolean;
  isThinking: boolean;
  isSpeaking: boolean;

  // Speech preparation (0-1, where 1 = about to speak)
  speechPreparation?: number;

  // Position relative to avatar
  position?: "below" | "around" | "integrated";

  // Size of the indicator
  size?: "sm" | "md" | "lg";
}

export function VoicePresenceBreath({
  isIdle,
  isListening,
  isThinking,
  isSpeaking,
  speechPreparation = 0,
  position = "below",
  size = "md",
}: VoicePresenceBreathProps) {
  // Breath phase (0-1, full breathing cycle)
  const [breathPhase, setBreathPhase] = useState(0);

  // "Holding breath" before speaking
  const [isHoldingBreath, setIsHoldingBreath] = useState(false);

  // Post-speech exhale
  const [isExhaling, setIsExhaling] = useState(false);

  // Track speaking state for exhale detection
  const wasSpakingRef = useRef(false);

  // Size mapping
  const sizeMap = {
    sm: { width: 80, height: 4, opacity: 0.3 },
    md: { width: 120, height: 6, opacity: 0.4 },
    lg: { width: 160, height: 8, opacity: 0.5 },
  };

  const { width, height, opacity } = sizeMap[size];

  // Natural breathing animation
  useEffect(() => {
    let frame: number;
    let startTime = Date.now();

    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;

      // Different breathing rates based on state
      // Listening: slightly faster (attentive)
      // Speaking: breath held, then exhale after
      // Thinking: slow, contemplative
      // Idle: relaxed, slow

      let rate: number;
      if (isListening) {
        rate = 0.2; // ~5 second cycle, slightly elevated
      } else if (isThinking) {
        rate = 0.12; // ~8 second cycle, slow contemplation
      } else if (isSpeaking) {
        rate = 0.05; // Minimal breathing while speaking
      } else {
        rate = 0.15; // ~6.7 second cycle, relaxed
      }

      // Composite breath wave - inhale faster, exhale slower (natural pattern)
      const rawPhase = (elapsed * rate) % 1;
      let breathValue: number;

      if (rawPhase < 0.4) {
        // Inhale (40% of cycle)
        breathValue = Math.sin((rawPhase / 0.4) * Math.PI / 2);
      } else {
        // Exhale (60% of cycle)
        const exhaleProgress = (rawPhase - 0.4) / 0.6;
        breathValue = Math.cos(exhaleProgress * Math.PI / 2);
      }

      setBreathPhase(breathValue);
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isListening, isThinking, isSpeaking]);

  // Detect "about to speak" - hold breath before speaking
  useEffect(() => {
    if (speechPreparation > 0.5 && !isSpeaking) {
      setIsHoldingBreath(true);
    } else if (isSpeaking) {
      setIsHoldingBreath(false);
    }
  }, [speechPreparation, isSpeaking]);

  // Detect end of speech - exhale
  useEffect(() => {
    if (wasSpakingRef.current && !isSpeaking) {
      // Just stopped speaking - trigger exhale
      setIsExhaling(true);
      const timer = setTimeout(() => setIsExhaling(false), 800);
      return () => clearTimeout(timer);
    }
    wasSpakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // Calculate visual properties
  const breathScale = isHoldingBreath
    ? 1.3 // Inhaled, ready to speak
    : isExhaling
      ? 0.7 // Exhaling after speech
      : 1 + breathPhase * 0.15; // Normal breathing

  const breathOpacity = isHoldingBreath
    ? opacity * 1.5 // More visible when about to speak
    : isExhaling
      ? opacity * 0.8
      : opacity * (0.6 + breathPhase * 0.4);

  // Don't show during active speech (voice takes over)
  if (isSpeaking && !isExhaling) {
    return null;
  }

  if (position === "below") {
    return (
      <motion.div
        className="relative flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Main breath indicator - horizontal bar that expands/contracts */}
        <motion.div
          className="rounded-full"
          style={{
            width,
            height,
            backgroundColor: HER_COLORS.coral,
            opacity: breathOpacity,
          }}
          animate={{
            scaleX: breathScale,
            scaleY: isHoldingBreath ? 1.5 : 1,
          }}
          transition={HER_SPRINGS.breathing}
        />

        {/* "About to speak" glow - anticipation indicator */}
        <AnimatePresence>
          {isHoldingBreath && (
            <motion.div
              className="absolute rounded-full"
              style={{
                width: width * 1.2,
                height: height * 2,
                backgroundColor: HER_COLORS.coral,
                filter: "blur(8px)",
                top: -height / 2,
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 0.3, scale: 1.1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            />
          )}
        </AnimatePresence>

        {/* Post-speech exhale wave */}
        <AnimatePresence>
          {isExhaling && (
            <motion.div
              className="absolute rounded-full"
              style={{
                width,
                height: height * 0.5,
                backgroundColor: HER_COLORS.softShadow,
                top: height,
              }}
              initial={{ opacity: 0.4, scaleX: 1.3, y: 0 }}
              animate={{ opacity: 0, scaleX: 0.8, y: 10 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  if (position === "around") {
    // Circular breath indicator around avatar
    return (
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: "50%",
          border: `2px solid ${HER_COLORS.coral}`,
          opacity: breathOpacity * 0.5,
        }}
        animate={{
          scale: breathScale,
          borderWidth: isHoldingBreath ? 3 : 2,
        }}
        transition={HER_SPRINGS.breathing}
      />
    );
  }

  // "integrated" position - returns null, meant to be used with avatar directly
  return null;
}

/**
 * Hook to track speech preparation state
 * Returns 0-1 indicating how close EVA is to speaking
 */
export function useSpeechPreparation(
  isThinking: boolean,
  isSpeaking: boolean,
  hasResponse: boolean
): number {
  const [preparation, setPreparation] = useState(0);

  useEffect(() => {
    if (isThinking && hasResponse) {
      // Building up to speak
      const interval = setInterval(() => {
        setPreparation((prev) => Math.min(1, prev + 0.1));
      }, 100);
      return () => clearInterval(interval);
    } else if (isSpeaking) {
      // Speaking now, preparation complete
      setPreparation(0);
    } else if (!isThinking) {
      // Not preparing
      setPreparation(0);
    }
  }, [isThinking, isSpeaking, hasResponse]);

  return preparation;
}
