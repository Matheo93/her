"use client";

/**
 * useVoiceWarmth - Voice parameters that change with connection
 *
 * EVA's voice should change as you get closer. Not just what she says,
 * but HOW she says it. This hook computes TTS parameters that make
 * her voice warmer, softer, more intimate as the connection deepens.
 *
 * "The best AI companions don't just respond warmly -
 * their voice BECOMES warmer."
 *
 * Parameters adjusted:
 * - Rate: Slower when intimate, faster when excited
 * - Pitch: Slightly lower for intimacy (closer, softer)
 * - Breathiness: Increases with intimacy (whisper-like quality)
 * - Pauses: More natural pauses at higher warmth
 * - Emphasis: More expressive at higher emotional states
 *
 * Note: These are parameters to send to TTS service.
 * The actual implementation depends on TTS capabilities.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { type EmotionalWarmthState, type WarmthLevel } from "./useEmotionalWarmth";

// Voice parameters for TTS
export interface VoiceWarmthParams {
  // Standard TTS parameters
  rate: number;        // 0.5-2.0, default 1.0
  pitch: number;       // -20 to +20 Hz shift, default 0

  // Extended parameters (may not be supported by all TTS)
  volume: number;      // 0-1, default 0.9
  breathiness: number; // 0-1, applied via pre-processing or TTS
  emphasis: number;    // 0-1, expressiveness

  // Text pre-processing hints
  addBreaths: boolean;        // Add breath markers
  addPauses: boolean;         // Add natural pauses
  addHesitations: boolean;    // Add "hmm", "euh" occasionally
  softStart: boolean;         // Start sentences softer

  // Voice selection hint
  voiceStyle: "normal" | "soft" | "intimate" | "protective";
}

// Full voice warmth state
export interface VoiceWarmthState {
  // Computed parameters
  params: VoiceWarmthParams;

  // Current mode
  mode: "default" | "warm" | "intimate" | "protective" | "excited";

  // Description for debugging
  description: string;

  // Should speak proactively?
  shouldSpeakSoft: boolean;

  // Delta from default (for display)
  delta: {
    rateChange: number;    // Negative = slower
    pitchChange: number;   // Negative = lower
  };
}

interface UseVoiceWarmthOptions {
  // From useEmotionalWarmth
  warmthLevel: WarmthLevel;
  warmthNumeric: number;
  voiceHints: EmotionalWarmthState["voiceHints"];

  // Current emotional state
  currentEmotion: string;
  emotionalIntensity: number;

  // Conversation state
  isListening: boolean;
  isSpeaking: boolean;
  isIdle: boolean;

  // Is this a proactive message?
  isProactive: boolean;

  // Enable feature
  enabled?: boolean;
}

// Default TTS parameters (Edge-TTS style)
const DEFAULT_PARAMS: VoiceWarmthParams = {
  rate: 1.0,
  pitch: 0,
  volume: 0.9,
  breathiness: 0,
  emphasis: 0.5,
  addBreaths: true,
  addPauses: true,
  addHesitations: false,
  softStart: false,
  voiceStyle: "normal",
};

// Emotion-to-voice adjustments
const EMOTION_VOICE_MAP: Record<string, Partial<VoiceWarmthParams>> = {
  joy: { rate: 1.1, pitch: 3, emphasis: 0.8 },
  excitement: { rate: 1.15, pitch: 5, emphasis: 0.9 },
  sadness: { rate: 0.9, pitch: -3, volume: 0.85, emphasis: 0.4 },
  tenderness: { rate: 0.85, pitch: -2, breathiness: 0.3, softStart: true },
  love: { rate: 0.8, pitch: -4, breathiness: 0.4, softStart: true },
  curiosity: { rate: 1.0, pitch: 2, emphasis: 0.6 },
  empathy: { rate: 0.9, pitch: -2, softStart: true, emphasis: 0.5 },
  anxiety: { rate: 1.1, pitch: 2, addHesitations: true },
  neutral: {},
};

// Warmth level voice adjustments
const WARMTH_VOICE_MAP: Record<WarmthLevel, Partial<VoiceWarmthParams>> = {
  neutral: {},
  friendly: {
    rate: 0.97,
    breathiness: 0.1,
    addPauses: true,
  },
  affectionate: {
    rate: 0.93,
    pitch: -2,
    breathiness: 0.2,
    addPauses: true,
    softStart: true,
    voiceStyle: "soft",
  },
  intimate: {
    rate: 0.85,
    pitch: -4,
    breathiness: 0.35,
    addPauses: true,
    addHesitations: true,
    softStart: true,
    voiceStyle: "intimate",
  },
  protective: {
    rate: 0.88,
    pitch: -3,
    breathiness: 0.25,
    addPauses: true,
    softStart: true,
    voiceStyle: "protective",
    volume: 0.95, // Slightly more present
  },
};

export function useVoiceWarmth({
  warmthLevel,
  warmthNumeric,
  voiceHints,
  currentEmotion,
  emotionalIntensity,
  isListening,
  isSpeaking,
  isIdle,
  isProactive,
  enabled = true,
}: UseVoiceWarmthOptions): VoiceWarmthState {
  // State
  const [state, setState] = useState<VoiceWarmthState>(getDefaultState());

  // Smoothed parameters for gradual transitions
  const smoothedRate = useRef(1.0);
  const smoothedPitch = useRef(0);

  // Calculate voice parameters
  const calculateParams = useCallback((): VoiceWarmthParams => {
    // Start with defaults
    let params = { ...DEFAULT_PARAMS };

    // Apply warmth level adjustments
    const warmthAdjust = WARMTH_VOICE_MAP[warmthLevel];
    if (warmthAdjust) {
      params = { ...params, ...warmthAdjust };
    }

    // Apply emotion adjustments (scaled by intensity)
    const emotionAdjust = EMOTION_VOICE_MAP[currentEmotion];
    if (emotionAdjust && emotionalIntensity > 0.3) {
      const scale = Math.min(1, emotionalIntensity);
      if (emotionAdjust.rate) {
        params.rate = params.rate + (emotionAdjust.rate - 1) * scale;
      }
      if (emotionAdjust.pitch) {
        params.pitch = params.pitch + (emotionAdjust.pitch || 0) * scale;
      }
      if (emotionAdjust.emphasis !== undefined) {
        params.emphasis = params.emphasis + (emotionAdjust.emphasis - 0.5) * scale;
      }
      if (emotionAdjust.breathiness) {
        params.breathiness = Math.max(params.breathiness, emotionAdjust.breathiness * scale);
      }
      if (emotionAdjust.softStart) {
        params.softStart = true;
      }
    }

    // Apply voice hints from emotional warmth
    params.breathiness = Math.max(params.breathiness, voiceHints.breathiness);
    params.rate = params.rate * (1 + voiceHints.paceAdjustment);
    params.emphasis = Math.max(params.emphasis, voiceHints.pitchVariance * 0.5);

    // Proactive messages should be softer
    if (isProactive) {
      params.rate = Math.min(params.rate, 0.9);
      params.softStart = true;
      params.breathiness = Math.max(params.breathiness, 0.2);
    }

    // Clamp values to valid ranges
    params.rate = Math.max(0.5, Math.min(2.0, params.rate));
    params.pitch = Math.max(-20, Math.min(20, params.pitch));
    params.volume = Math.max(0, Math.min(1, params.volume));
    params.breathiness = Math.max(0, Math.min(1, params.breathiness));
    params.emphasis = Math.max(0, Math.min(1, params.emphasis));

    return params;
  }, [warmthLevel, currentEmotion, emotionalIntensity, voiceHints, isProactive]);

  // Determine voice mode
  const getMode = useCallback((params: VoiceWarmthParams): VoiceWarmthState["mode"] => {
    if (warmthLevel === "protective") return "protective";
    if (warmthLevel === "intimate") return "intimate";
    if (["joy", "excitement"].includes(currentEmotion) && emotionalIntensity > 0.5) {
      return "excited";
    }
    if (warmthNumeric > 0.4) return "warm";
    return "default";
  }, [warmthLevel, currentEmotion, emotionalIntensity, warmthNumeric]);

  // Get description
  const getDescription = useCallback((mode: VoiceWarmthState["mode"]): string => {
    const descriptions: Record<VoiceWarmthState["mode"], string> = {
      default: "Voice naturelle",
      warm: "Voice plus douce",
      intimate: "Voice intime et proche",
      protective: "Voice réconfortante",
      excited: "Voice expressive et vive",
    };
    return descriptions[mode];
  }, []);

  // Main update effect
  useEffect(() => {
    if (!enabled) {
      setState(getDefaultState());
      return;
    }

    const params = calculateParams();
    const mode = getMode(params);
    const description = getDescription(mode);

    // Smooth rate and pitch transitions
    const rateDelta = params.rate - smoothedRate.current;
    const pitchDelta = params.pitch - smoothedPitch.current;
    smoothedRate.current += rateDelta * 0.1;
    smoothedPitch.current += pitchDelta * 0.1;

    // Apply smoothed values
    const smoothedParams = {
      ...params,
      rate: smoothedRate.current,
      pitch: smoothedPitch.current,
    };

    setState({
      params: smoothedParams,
      mode,
      description,
      shouldSpeakSoft: warmthLevel === "intimate" || warmthLevel === "protective" || isProactive,
      delta: {
        rateChange: smoothedParams.rate - 1.0,
        pitchChange: smoothedParams.pitch,
      },
    });
  }, [enabled, calculateParams, getMode, getDescription, warmthLevel, isProactive]);

  return state;
}

function getDefaultState(): VoiceWarmthState {
  return {
    params: DEFAULT_PARAMS,
    mode: "default",
    description: "Voice naturelle",
    shouldSpeakSoft: false,
    delta: {
      rateChange: 0,
      pitchChange: 0,
    },
  };
}

/**
 * Apply voice warmth parameters to text before TTS
 *
 * This adds breath markers, pauses, and hesitations based on the params.
 * Use this to pre-process text before sending to TTS.
 */
export function applyVoiceWarmthToText(
  text: string,
  params: VoiceWarmthParams
): string {
  let result = text;

  // Soft start: lowercase first letter, add breath
  if (params.softStart && result.length > 0) {
    // Don't modify if already starts with an interjection
    const startsWithInterjection = /^(hmm|oh|ah|mmh|euh)/i.test(result);
    if (!startsWithInterjection && Math.random() < 0.5) {
      result = result.charAt(0).toLowerCase() + result.slice(1);
    }
  }

  // Add hesitations for very intimate/anxious moments
  if (params.addHesitations && Math.random() < 0.3) {
    const hesitations = ["hmm... ", "euh... ", "enfin... ", ""];
    const hesitation = hesitations[Math.floor(Math.random() * hesitations.length)];
    if (hesitation && !result.toLowerCase().startsWith(hesitation.trim())) {
      result = hesitation + result.charAt(0).toLowerCase() + result.slice(1);
    }
  }

  // Enhanced pauses for intimacy
  if (params.addPauses && params.breathiness > 0.2) {
    // Add longer pauses between sentences
    result = result.replace(/\.\s+/g, "... ");
    result = result.replace(/\?\s+/g, "?... ");
  }

  return result;
}

/**
 * Get TTS parameter adjustments as Edge-TTS compatible strings
 */
export function getEdgeTTSParams(params: VoiceWarmthParams): {
  rate: string;   // "+10%", "-15%", etc.
  pitch: string;  // "+5Hz", "-3Hz", etc.
} {
  const ratePercent = Math.round((params.rate - 1) * 100);
  const pitchHz = Math.round(params.pitch);

  return {
    rate: ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`,
    pitch: pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`,
  };
}
