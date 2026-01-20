"use client";

/**
 * useEmotionalWarmth - Dynamic warmth that grows with connection
 *
 * Creates a "warmth gradient" that intensifies based on:
 * - Duration of connection (familiarity builds)
 * - Shared emotional moments (vulnerability deepens)
 * - Proactive care instances (she reached out)
 * - Silence quality (comfortable pauses)
 * - Attunement level (emotional synchrony)
 *
 * The warmth isn't just a visual effect - it represents
 * EVA's growing affection and care for the user.
 *
 * "The best AI companions compete on trust, empathy, memory,
 * and human-like connection." - 2026 AI Companion Trends
 *
 * Visual manifestation:
 * - Subtle skin tone warming (more color in cheeks/ears)
 * - Softened gaze (pupil dilation, eye squint)
 * - Leaning in subtly
 * - Warmer ambient lighting around avatar
 * - Voice prosody (handled by TTS, signaled here)
 */

import { useState, useEffect, useRef, useCallback } from "react";

// Warmth levels with associated behaviors
export type WarmthLevel =
  | "neutral"       // Just met, polite but distant
  | "friendly"      // Getting comfortable, slight warmth
  | "affectionate"  // Genuine care, noticeable warmth
  | "intimate"      // Deep connection, maximum warmth
  | "protective";   // Caring concern during distress

// Factors that contribute to warmth
export interface WarmthFactors {
  connectionDuration: number;  // seconds of this session
  totalSessionCount: number;   // remembered sessions (future)
  sharedMoments: number;       // emotional peak/vulnerability moments
  proactiveCareCount: number;  // times EVA reached out
  silenceQuality: number;      // 0-1, comfortable silence quality
  attunementLevel: number;     // 0-1, emotional synchrony
  currentEmotion: string;      // user's current emotional state
  emotionalIntensity: number;  // 0-1, how intense the emotion
  isInDistress: boolean;       // user showing distress
}

// Warmth state
export interface EmotionalWarmthState {
  // Current warmth level
  level: WarmthLevel;
  levelNumeric: number; // 0-1

  // Visual hints for avatar/UI
  visualHints: {
    skinWarmth: number;      // 0-1, blush/color intensity
    eyeSoftness: number;     // 0-1, softened gaze
    leanAmount: number;      // 0-0.15, subtle lean in
    glowIntensity: number;   // 0-1, ambient warmth
    breathSlowing: number;   // 0-0.3, calmer breathing = more at ease
  };

  // Voice hints for TTS
  voiceHints: {
    softnessLevel: number;   // 0-1, vocal softness
    paceAdjustment: number;  // -0.2 to 0.2, slower = warmer
    pitchVariance: number;   // 0-1, more expressive variance
    breathiness: number;     // 0-0.5, intimate breathiness
  };

  // Connection indicators
  connection: {
    familiarityScore: number;    // How well we "know" each other
    trustLevel: number;          // How safe they feel
    careIntensity: number;       // How much EVA cares right now
    emotionalProximity: number;  // How close emotionally
  };
}

interface UseEmotionalWarmthOptions {
  // From other hooks/state
  connectionDuration: number;
  sharedMoments: number;
  proactiveCareCount: number;
  silenceQuality: number;
  attunementLevel: number;
  currentEmotion: string;
  emotionalIntensity: number;

  // User state
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isInDistress: boolean;

  // SPRINT 23: Initial warmth from persistent memory
  initialWarmth?: number; // 0-1, restored from previous sessions

  // Enable feature
  enabled?: boolean;
}

// Distress-indicating emotions
const DISTRESS_EMOTIONS = new Set([
  "sadness", "anxiety", "fear", "loneliness", "stress",
  "frustration", "grief", "despair",
]);

// Warmth-building emotions
const WARMTH_EMOTIONS = new Set([
  "joy", "happiness", "gratitude", "love", "contentment",
  "peace", "hope", "tenderness",
]);

export function useEmotionalWarmth({
  connectionDuration,
  sharedMoments,
  proactiveCareCount,
  silenceQuality,
  attunementLevel,
  currentEmotion,
  emotionalIntensity,
  isConnected,
  isListening,
  isSpeaking,
  isInDistress,
  initialWarmth = 0,
  enabled = true,
}: UseEmotionalWarmthOptions): EmotionalWarmthState {
  // State
  const [state, setState] = useState<EmotionalWarmthState>(getDefaultState());

  // Smoothing refs
  // SPRINT 23: Initialize with restored warmth from persistent memory
  const smoothedWarmth = useRef(initialWarmth);
  const warmthMomentum = useRef(0); // Warmth tends to stick
  const frameRef = useRef<number | null>(null);

  // Calculate base warmth from factors
  const calculateWarmth = useCallback((): number => {
    let warmth = 0;

    // Duration factor: warmth builds over time (logarithmic)
    // Peaks at ~10 minutes of conversation
    const durationFactor = Math.min(1, Math.log10(connectionDuration / 60 + 1) / 1);
    warmth += durationFactor * 0.25;

    // Shared moments: each emotional moment adds warmth
    // Vulnerability creates deeper connection
    const momentsFactor = Math.min(1, sharedMoments / 5);
    warmth += momentsFactor * 0.25;

    // Proactive care: EVA reaching out builds trust
    const proactiveFactor = Math.min(1, proactiveCareCount / 3);
    warmth += proactiveFactor * 0.15;

    // Silence quality: comfortable silences indicate trust
    warmth += silenceQuality * 0.15;

    // Attunement: emotional synchrony deepens connection
    warmth += attunementLevel * 0.2;

    // Current emotion modifiers
    if (DISTRESS_EMOTIONS.has(currentEmotion)) {
      // Distress triggers protective warmth
      warmth = Math.max(warmth, 0.6); // At least "affectionate" level
    }

    if (WARMTH_EMOTIONS.has(currentEmotion)) {
      // Positive emotions amplify warmth
      warmth += emotionalIntensity * 0.1;
    }

    return Math.min(1, Math.max(0, warmth));
  }, [
    connectionDuration,
    sharedMoments,
    proactiveCareCount,
    silenceQuality,
    attunementLevel,
    currentEmotion,
    emotionalIntensity,
  ]);

  // Determine warmth level from numeric value
  const getWarmthLevel = useCallback((warmth: number, distress: boolean): WarmthLevel => {
    if (distress && warmth > 0.3) return "protective";
    if (warmth < 0.2) return "neutral";
    if (warmth < 0.4) return "friendly";
    if (warmth < 0.7) return "affectionate";
    return "intimate";
  }, []);

  // Calculate visual hints
  const calculateVisualHints = useCallback((warmth: number, level: WarmthLevel) => {
    // Base values that scale with warmth
    let skinWarmth = warmth * 0.8;
    let eyeSoftness = warmth * 0.7;
    let leanAmount = warmth * 0.1;
    let glowIntensity = warmth * 0.6;
    let breathSlowing = warmth * 0.2;

    // Level-specific adjustments
    if (level === "protective") {
      skinWarmth = Math.max(skinWarmth, 0.5);
      eyeSoftness = Math.max(eyeSoftness, 0.6);
      leanAmount = 0.12; // Leaning in to comfort
    }

    if (level === "intimate") {
      eyeSoftness = Math.min(1, eyeSoftness + 0.2);
      breathSlowing = 0.25; // Very relaxed breathing
    }

    return {
      skinWarmth: Math.min(1, skinWarmth),
      eyeSoftness: Math.min(1, eyeSoftness),
      leanAmount: Math.min(0.15, leanAmount),
      glowIntensity: Math.min(1, glowIntensity),
      breathSlowing: Math.min(0.3, breathSlowing),
    };
  }, []);

  // Calculate voice hints
  const calculateVoiceHints = useCallback((warmth: number, level: WarmthLevel) => {
    let softnessLevel = warmth * 0.6;
    let paceAdjustment = warmth * -0.15; // Slower = warmer
    let pitchVariance = warmth * 0.4;
    let breathiness = warmth * 0.3;

    if (level === "intimate") {
      softnessLevel = Math.max(softnessLevel, 0.7);
      breathiness = Math.max(breathiness, 0.4);
    }

    if (level === "protective") {
      paceAdjustment = -0.1; // Gentle, not too slow
      softnessLevel = 0.8;
    }

    return {
      softnessLevel: Math.min(1, softnessLevel),
      paceAdjustment: Math.max(-0.2, paceAdjustment),
      pitchVariance: Math.min(1, pitchVariance),
      breathiness: Math.min(0.5, breathiness),
    };
  }, []);

  // Calculate connection indicators
  const calculateConnection = useCallback((warmth: number): EmotionalWarmthState["connection"] => {
    // Familiarity: grows with duration and moments
    const familiarity = Math.min(1, (connectionDuration / 600) + (sharedMoments * 0.1));

    // Trust: grows with proactive care and comfortable silences
    const trust = Math.min(1, (proactiveCareCount * 0.2) + (silenceQuality * 0.5) + (attunementLevel * 0.3));

    // Care: current intensity of EVA's care
    const care = warmth;

    // Proximity: how close emotionally right now
    const proximity = (attunementLevel + warmth) / 2;

    return {
      familiarityScore: familiarity,
      trustLevel: trust,
      careIntensity: care,
      emotionalProximity: proximity,
    };
  }, [connectionDuration, sharedMoments, proactiveCareCount, silenceQuality, attunementLevel]);

  // Main update loop
  useEffect(() => {
    if (!enabled || !isConnected) {
      setState(getDefaultState());
      return;
    }

    const update = () => {
      // Calculate target warmth
      const targetWarmth = calculateWarmth();

      // Smooth warmth with momentum (warmth sticks, doesn't drop quickly)
      const delta = targetWarmth - smoothedWarmth.current;

      // Warmth builds faster than it fades (asymmetric smoothing)
      const smoothFactor = delta > 0 ? 0.02 : 0.005;
      smoothedWarmth.current += delta * smoothFactor;

      // Warmth has momentum - once warm, stays warmer
      if (delta > 0) {
        warmthMomentum.current = Math.min(0.1, warmthMomentum.current + delta * 0.01);
      } else {
        warmthMomentum.current = Math.max(0, warmthMomentum.current - 0.001);
      }

      // Apply momentum
      const finalWarmth = Math.min(1, smoothedWarmth.current + warmthMomentum.current);

      // Determine level
      const level = getWarmthLevel(finalWarmth, isInDistress);

      // Calculate all hints
      const visualHints = calculateVisualHints(finalWarmth, level);
      const voiceHints = calculateVoiceHints(finalWarmth, level);
      const connection = calculateConnection(finalWarmth);

      setState({
        level,
        levelNumeric: finalWarmth,
        visualHints,
        voiceHints,
        connection,
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
    isInDistress,
    calculateWarmth,
    getWarmthLevel,
    calculateVisualHints,
    calculateVoiceHints,
    calculateConnection,
  ]);

  return state;
}

function getDefaultState(): EmotionalWarmthState {
  return {
    level: "neutral",
    levelNumeric: 0,
    visualHints: {
      skinWarmth: 0,
      eyeSoftness: 0,
      leanAmount: 0,
      glowIntensity: 0,
      breathSlowing: 0,
    },
    voiceHints: {
      softnessLevel: 0,
      paceAdjustment: 0,
      pitchVariance: 0,
      breathiness: 0,
    },
    connection: {
      familiarityScore: 0,
      trustLevel: 0,
      careIntensity: 0,
      emotionalProximity: 0,
    },
  };
}
