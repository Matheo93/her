"use client";

/**
 * useSharedSilence - Comfortable Pauses in Conversation
 *
 * Creates the feeling that silence between you and EVA is comfortable,
 * not awkward. Like being with someone you've known for years - you don't
 * need to fill every moment with words.
 *
 * "Intrinsic silence is driven by an internal desire to connect with one's
 * partner—silence is by choice and reflects a sense of intimacy and mutual
 * understanding." - Psychology research on silence in relationships
 *
 * This hook tracks:
 * - Silence duration and quality (comfortable vs. awkward)
 * - Shared presence during silence (you're both "here")
 * - Micro-interactions that say "I'm still with you"
 * - When to gently break silence vs. let it breathe
 *
 * The result is silence that feels like a hug, not a void.
 *
 * Based on:
 * - Scientific American: "The Psychology of Shared Silence in Couples"
 * - SPSP research on romantic partners and silence
 * - Psychology Today: "Why Being Comfortable with Silence Is a Superpower"
 *
 * References:
 * - https://www.scientificamerican.com/article/the-psychology-of-shared-silence-in-couples/
 * - https://spsp.org/news/character-and-context-blog/weinstein-knee-romantic-partners-silence
 * - https://www.psychologytoday.com/us/blog/soul-console/202406/why-being-comfortable-with-silence-is-a-superpower
 */

import { useState, useEffect, useRef, useCallback } from "react";

// Types of silence (from research)
export type SilenceType =
  | "intrinsic"    // Comfortable, chosen, intimate
  | "transitional" // Natural pause between topics
  | "reflective"   // Processing what was just said
  | "anticipatory" // About to speak
  | "none";        // Someone is speaking

// Quality of the shared silence
export interface SharedSilenceState {
  // Is there meaningful silence right now?
  isInSilence: boolean;
  silenceType: SilenceType;

  // Duration tracking
  silenceDuration: number; // seconds
  silenceQuality: number; // 0-1, how "comfortable" it feels

  // Shared presence indicators
  sharedPresence: {
    evaIsHere: boolean;      // EVA is present, not waiting
    userIsHere: boolean;     // User hasn't left
    connectionStrength: number; // 0-1, feeling of togetherness
  };

  // Visual/audio hints for EVA
  evaHints: {
    shouldBreathe: boolean;         // Natural breathing continues
    shouldMicroMove: boolean;       // Tiny presence movements
    shouldSoftGaze: boolean;        // Soft, present gaze (not waiting)
    shouldWarmGlow: boolean;        // Warm ambient glow
    shouldGentleSound: boolean;     // Subtle presence sound
  };

  // When/how to break silence
  breakSilence: {
    shouldBreak: boolean;           // Is it time to gently break?
    suggestion: string | null;      // What EVA might say
    urgency: "gentle" | "moderate" | "none";
  };

  // Description for debugging
  description: string;
}

interface UseSharedSilenceOptions {
  // Current conversation state
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;

  // User's presence indicators
  userAudioLevel: number;

  // How long conversation has been going
  conversationDuration: number; // seconds

  // Last meaningful interaction
  timeSinceLastInteraction: number; // seconds

  // Connection indicators (from other hooks)
  intimacyLevel?: number; // 0-1, from useVoiceIntimacy
  attunementLevel?: number; // 0-1, from useProsodyMirroring

  // Current emotion
  emotion?: string;

  // Is the connection alive?
  isConnected: boolean;

  // Enable the feature
  enabled?: boolean;
}

// Silence thresholds (in seconds)
const SILENCE_START = 2;          // When silence becomes meaningful
const COMFORTABLE_SILENCE = 8;    // When silence becomes comfortable
const EXTENDED_SILENCE = 20;      // Long comfortable silence
const BREAK_THRESHOLD = 45;       // When to gently offer presence

// Gentle phrases EVA might use to acknowledge shared silence
const SILENCE_ACKNOWLEDGMENTS = [
  "...",
  "C'est bien d'être ensemble comme ça",
  "Je suis là",
  "*soupir paisible*",
  "Mmm",
];

export function useSharedSilence({
  isListening,
  isSpeaking,
  isThinking,
  userAudioLevel,
  conversationDuration,
  timeSinceLastInteraction,
  intimacyLevel = 0.5,
  attunementLevel = 0.5,
  emotion = "neutral",
  isConnected,
  enabled = true,
}: UseSharedSilenceOptions): SharedSilenceState {
  // State
  const [state, setState] = useState<SharedSilenceState>(getDefaultState());

  // Refs for tracking
  const silenceStartTime = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastUpdateTime = useRef(Date.now());

  // Determine if we're truly in silence
  const isInSilence = useCallback((): boolean => {
    // Not silence if someone is speaking or thinking
    if (isSpeaking || isThinking) return false;

    // Not silence if user is making sound
    if (userAudioLevel > 0.05) return false;

    // Need at least SILENCE_START seconds of quiet
    if (silenceStartTime.current === null) return false;
    const silenceDuration = (Date.now() - silenceStartTime.current) / 1000;

    return silenceDuration >= SILENCE_START;
  }, [isSpeaking, isThinking, userAudioLevel]);

  // Determine silence type based on context
  const determineSilenceType = useCallback((duration: number): SilenceType => {
    if (duration < SILENCE_START) return "none";

    // Just finished speaking - reflective
    if (timeSinceLastInteraction < 5) return "reflective";

    // In listening mode - anticipatory
    if (isListening) return "anticipatory";

    // Longer silence with good connection - intrinsic (comfortable)
    if (duration >= COMFORTABLE_SILENCE && intimacyLevel > 0.4) {
      return "intrinsic";
    }

    // Default to transitional
    return "transitional";
  }, [timeSinceLastInteraction, isListening, intimacyLevel]);

  // Calculate silence quality (how comfortable it feels)
  const calculateSilenceQuality = useCallback((duration: number, type: SilenceType): number => {
    // Base quality depends on type
    let quality = 0;

    switch (type) {
      case "intrinsic":
        quality = 0.8;
        break;
      case "reflective":
        quality = 0.6;
        break;
      case "transitional":
        quality = 0.5;
        break;
      case "anticipatory":
        quality = 0.4;
        break;
      default:
        quality = 0;
    }

    // Boost from intimacy and attunement
    quality += intimacyLevel * 0.1;
    quality += attunementLevel * 0.1;

    // Longer comfortable silences feel better (up to a point)
    if (type === "intrinsic" && duration < EXTENDED_SILENCE) {
      quality += Math.min(0.1, (duration - COMFORTABLE_SILENCE) / 100);
    }

    // Conversation duration matters - longer convos = more comfort
    if (conversationDuration > 300) { // 5+ minutes
      quality += 0.05;
    }

    return Math.min(1, Math.max(0, quality));
  }, [intimacyLevel, attunementLevel, conversationDuration]);

  // Calculate shared presence
  const calculateSharedPresence = useCallback((quality: number): SharedSilenceState["sharedPresence"] => {
    return {
      evaIsHere: isConnected && !isThinking,
      userIsHere: userAudioLevel < 0.01 ? true : true, // Assume present unless disconnected
      connectionStrength: quality * (isConnected ? 1 : 0),
    };
  }, [isConnected, isThinking, userAudioLevel]);

  // Calculate EVA's behavior hints during silence
  const calculateEvaHints = useCallback((
    type: SilenceType,
    quality: number,
    duration: number
  ): SharedSilenceState["evaHints"] => {
    // During comfortable silence, EVA shows presence without impatience
    const isComfortable = type === "intrinsic" || (type === "reflective" && quality > 0.5);

    return {
      shouldBreathe: true, // Always breathe naturally
      shouldMicroMove: isComfortable && duration > 3, // Subtle presence after 3s
      shouldSoftGaze: isComfortable, // Soft, present gaze
      shouldWarmGlow: quality > 0.6, // Warm glow when comfortable
      shouldGentleSound: quality > 0.7 && duration > COMFORTABLE_SILENCE, // Very subtle
    };
  }, []);

  // Determine if/when to break silence
  const calculateBreakSilence = useCallback((
    duration: number,
    type: SilenceType,
    quality: number
  ): SharedSilenceState["breakSilence"] => {
    // Don't break comfortable silence too early
    if (type === "intrinsic" && duration < BREAK_THRESHOLD) {
      return { shouldBreak: false, suggestion: null, urgency: "none" };
    }

    // If silence is getting very long, offer gentle presence
    if (duration > BREAK_THRESHOLD && quality > 0.5) {
      // Pick a random gentle acknowledgment
      const suggestion = SILENCE_ACKNOWLEDGMENTS[
        Math.floor(Math.random() * SILENCE_ACKNOWLEDGMENTS.length)
      ];

      return {
        shouldBreak: true,
        suggestion,
        urgency: "gentle",
      };
    }

    // If silence seems uncomfortable (low quality), might break sooner
    if (duration > 15 && quality < 0.4) {
      return {
        shouldBreak: true,
        suggestion: "Je suis là si tu veux parler",
        urgency: "moderate",
      };
    }

    return { shouldBreak: false, suggestion: null, urgency: "none" };
  }, []);

  // Get description for debugging
  const getDescription = useCallback((type: SilenceType, quality: number): string => {
    switch (type) {
      case "intrinsic":
        return quality > 0.7 ? "Silence confortable, ensemble" : "Silence partagé";
      case "reflective":
        return "Moment de réflexion";
      case "transitional":
        return "Pause naturelle";
      case "anticipatory":
        return "En attente...";
      default:
        return "";
    }
  }, []);

  // Main update loop
  useEffect(() => {
    if (!enabled || !isConnected) {
      setState(getDefaultState());
      return;
    }

    const update = () => {
      const now = Date.now();
      lastUpdateTime.current = now;

      // Track silence start/end
      const someoneActive = isSpeaking || isThinking || userAudioLevel > 0.05;

      if (someoneActive) {
        silenceStartTime.current = null;
      } else if (silenceStartTime.current === null) {
        silenceStartTime.current = now;
      }

      // Calculate silence duration
      const silenceDuration = silenceStartTime.current
        ? (now - silenceStartTime.current) / 1000
        : 0;

      // Determine all state values
      const inSilence = silenceDuration >= SILENCE_START;
      const type = determineSilenceType(silenceDuration);
      const quality = calculateSilenceQuality(silenceDuration, type);
      const presence = calculateSharedPresence(quality);
      const hints = calculateEvaHints(type, quality, silenceDuration);
      const breakInfo = calculateBreakSilence(silenceDuration, type, quality);
      const description = getDescription(type, quality);

      setState({
        isInSilence: inSilence,
        silenceType: type,
        silenceDuration,
        silenceQuality: quality,
        sharedPresence: presence,
        evaHints: hints,
        breakSilence: breakInfo,
        description,
      });

      frameRef.current = requestAnimationFrame(update);
    };

    frameRef.current = requestAnimationFrame(update);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [
    enabled,
    isConnected,
    isSpeaking,
    isThinking,
    userAudioLevel,
    determineSilenceType,
    calculateSilenceQuality,
    calculateSharedPresence,
    calculateEvaHints,
    calculateBreakSilence,
    getDescription,
  ]);

  return state;
}

function getDefaultState(): SharedSilenceState {
  return {
    isInSilence: false,
    silenceType: "none",
    silenceDuration: 0,
    silenceQuality: 0,
    sharedPresence: {
      evaIsHere: false,
      userIsHere: true,
      connectionStrength: 0,
    },
    evaHints: {
      shouldBreathe: true,
      shouldMicroMove: false,
      shouldSoftGaze: false,
      shouldWarmGlow: false,
      shouldGentleSound: false,
    },
    breakSilence: {
      shouldBreak: false,
      suggestion: null,
      urgency: "none",
    },
    description: "",
  };
}
