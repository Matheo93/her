"use client";

/**
 * useVoiceIntimacy - Dynamic Voice Proximity Modes
 *
 * Creates the feeling of varying vocal intimacy based on:
 * - Emotional context (tender moments → closer voice)
 * - Time of conversation (longer → more intimate)
 * - User's speaking style (soft → soft response)
 * - Topic depth (personal → intimate tone)
 *
 * Like how a real partner speaks:
 * - Normally in regular conversation
 * - Softly when sharing something personal
 * - Whispering in intimate moments
 *
 * This creates the feeling of physical proximity through voice.
 *
 * Based on:
 * - ElevenLabs Whisper Voice Library
 * - Murf AI Intimate Voice Styles
 * - ASMR research on vocal intimacy
 *
 * References:
 * - https://elevenlabs.io/voice-library/whisper
 * - https://murf.ai/voice-styles/whispering-voice
 * - https://voices.directory/pages/intimate-whisper-ai-voice-generator-text-to-speech-tts
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Voice intimacy levels
export type IntimacyLevel = "normal" | "warm" | "close" | "intimate" | "whisper";

// Voice intimacy state
export interface VoiceIntimacyState {
  // Current intimacy level
  level: IntimacyLevel;
  levelNumeric: number; // 0-1 for smooth transitions

  // What triggered this level
  trigger: "default" | "emotion" | "duration" | "user_style" | "topic_depth";

  // TTS parameters
  ttsParams: {
    speed: number; // 0.7-1.0
    pitch: number; // 0.9-1.0
    volume: number; // 0.5-1.0
    breathiness: number; // 0-1, adds breathy quality
    proximity: number; // 0-1, "closeness" of voice
  };

  // Visual hints
  visualHints: {
    glowWarmth: number; // 0-1
    avatarProximity: number; // 0-1, how "close" avatar feels
    ambientDim: number; // 0-0.3, dimming for intimate moments
  };

  // Audio hints
  audioHints: {
    addBreaths: boolean;
    addPauses: boolean;
    softenConsonants: boolean;
    reduceVolume: number; // 0-0.5 reduction
  };

  // Description for debugging
  description: string;
}

interface UseVoiceIntimacyOptions {
  // Current emotion detected
  emotion: string;

  // Emotional intensity (0-1)
  emotionalIntensity: number;

  // How long conversation has been going (seconds)
  conversationDuration: number;

  // User's speaking energy (0-1, from prosody)
  userEnergy: number;

  // Is this a personal/deep topic? (can be inferred)
  isPersonalTopic?: boolean;

  // Current conversation state
  isListening: boolean;
  isSpeaking: boolean;

  // Time of day (for ambient adjustments)
  timeOfDay?: "morning" | "afternoon" | "evening" | "night";

  // Enable intimacy adaptation
  enabled?: boolean;
}

// Emotions that suggest intimacy
const INTIMATE_EMOTIONS = new Set([
  "tenderness",
  "love",
  "care",
  "comfort",
  "vulnerability",
  "sadness",
  "loneliness",
  "nostalgia",
  "gratitude",
  "trust",
]);

// Emotions that suggest warmth
const WARM_EMOTIONS = new Set([
  "joy",
  "happiness",
  "affection",
  "contentment",
  "calm",
  "peaceful",
  "curiosity",
  "interest",
]);

export function useVoiceIntimacy({
  emotion,
  emotionalIntensity,
  conversationDuration,
  userEnergy,
  isPersonalTopic = false,
  isListening,
  isSpeaking,
  timeOfDay = "afternoon",
  enabled = true,
}: UseVoiceIntimacyOptions): VoiceIntimacyState {
  // State
  const [state, setState] = useState<VoiceIntimacyState>(getDefaultState());

  // Smooth transition tracking
  const targetLevelRef = useRef(0);
  const currentLevelRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastUpdateTime = useRef(Date.now());

  // Calculate target intimacy level
  const calculateTargetLevel = useCallback((): {
    level: IntimacyLevel;
    numeric: number;
    trigger: VoiceIntimacyState["trigger"];
  } => {
    let numeric = 0;
    let trigger: VoiceIntimacyState["trigger"] = "default";

    // Base level from time of day
    if (timeOfDay === "night") {
      numeric += 0.15;
    } else if (timeOfDay === "evening") {
      numeric += 0.1;
    }

    // Emotion-based intimacy
    if (INTIMATE_EMOTIONS.has(emotion)) {
      numeric += 0.3 + emotionalIntensity * 0.2;
      trigger = "emotion";
    } else if (WARM_EMOTIONS.has(emotion)) {
      numeric += 0.15 + emotionalIntensity * 0.1;
      if (trigger === "default") trigger = "emotion";
    }

    // Duration-based intimacy (builds over time)
    const durationFactor = Math.min(0.2, conversationDuration / 600); // Max at 10 minutes
    if (durationFactor > 0.1) {
      numeric += durationFactor;
      if (trigger === "default") trigger = "duration";
    }

    // User style matching - soft voice from user → soft response
    if (userEnergy < 0.2) {
      numeric += 0.2;
      if (trigger === "default") trigger = "user_style";
    } else if (userEnergy < 0.35) {
      numeric += 0.1;
      if (trigger === "default") trigger = "user_style";
    }

    // Personal topic boost
    if (isPersonalTopic) {
      numeric += 0.25;
      trigger = "topic_depth";
    }

    // Clamp and determine level
    numeric = Math.min(1, Math.max(0, numeric));

    let level: IntimacyLevel;
    if (numeric > 0.8) {
      level = "whisper";
    } else if (numeric > 0.6) {
      level = "intimate";
    } else if (numeric > 0.4) {
      level = "close";
    } else if (numeric > 0.2) {
      level = "warm";
    } else {
      level = "normal";
    }

    return { level, numeric, trigger };
  }, [emotion, emotionalIntensity, conversationDuration, userEnergy, isPersonalTopic, timeOfDay]);

  // Generate TTS parameters from level
  const generateTTSParams = useCallback(
    (levelNumeric: number): VoiceIntimacyState["ttsParams"] => {
      // Lower speed as intimacy increases
      const speed = 1.0 - levelNumeric * 0.25; // 1.0 → 0.75

      // Slightly lower pitch for intimacy
      const pitch = 1.0 - levelNumeric * 0.08; // 1.0 → 0.92

      // Lower volume for intimate moments
      const volume = 1.0 - levelNumeric * 0.35; // 1.0 → 0.65

      // More breathiness with intimacy
      const breathiness = levelNumeric * 0.7;

      // Proximity feeling
      const proximity = levelNumeric;

      return { speed, pitch, volume, breathiness, proximity };
    },
    []
  );

  // Generate visual hints from level
  const generateVisualHints = useCallback(
    (levelNumeric: number): VoiceIntimacyState["visualHints"] => {
      return {
        glowWarmth: 0.3 + levelNumeric * 0.5, // Warmer glow with intimacy
        avatarProximity: levelNumeric, // Closer feeling
        ambientDim: levelNumeric * 0.25, // Slight dimming for intimacy
      };
    },
    []
  );

  // Generate audio hints
  const generateAudioHints = useCallback(
    (levelNumeric: number): VoiceIntimacyState["audioHints"] => {
      return {
        addBreaths: levelNumeric > 0.4,
        addPauses: levelNumeric > 0.3,
        softenConsonants: levelNumeric > 0.6,
        reduceVolume: levelNumeric * 0.4,
      };
    },
    []
  );

  // Get description
  const getDescription = useCallback((level: IntimacyLevel, trigger: string): string => {
    const triggerText = {
      default: "",
      emotion: "from emotion",
      duration: "from connection",
      user_style: "matching you",
      topic_depth: "for this moment",
    }[trigger];

    const levelText = {
      normal: "Speaking normally",
      warm: "Warm tone",
      close: "Closer now",
      intimate: "Just for you",
      whisper: "...",
    }[level];

    return triggerText ? `${levelText} ${triggerText}` : levelText;
  }, []);

  // Update loop with smooth transitions
  useEffect(() => {
    if (!enabled) return;

    const update = () => {
      const now = Date.now();
      const delta = (now - lastUpdateTime.current) / 1000;
      lastUpdateTime.current = now;

      // Calculate target
      const target = calculateTargetLevel();
      targetLevelRef.current = target.numeric;

      // Smooth transition (faster when increasing, slower when decreasing)
      const transitionSpeed = target.numeric > currentLevelRef.current ? 0.8 : 0.4;
      currentLevelRef.current +=
        (targetLevelRef.current - currentLevelRef.current) * delta * transitionSpeed;

      // Clamp
      currentLevelRef.current = Math.max(0, Math.min(1, currentLevelRef.current));

      // Generate state
      const ttsParams = generateTTSParams(currentLevelRef.current);
      const visualHints = generateVisualHints(currentLevelRef.current);
      const audioHints = generateAudioHints(currentLevelRef.current);
      const description = getDescription(target.level, target.trigger);

      setState({
        level: target.level,
        levelNumeric: currentLevelRef.current,
        trigger: target.trigger,
        ttsParams,
        visualHints,
        audioHints,
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
    calculateTargetLevel,
    generateTTSParams,
    generateVisualHints,
    generateAudioHints,
    getDescription,
  ]);

  return state;
}

function getDefaultState(): VoiceIntimacyState {
  return {
    level: "normal",
    levelNumeric: 0,
    trigger: "default",
    ttsParams: {
      speed: 1.0,
      pitch: 1.0,
      volume: 1.0,
      breathiness: 0,
      proximity: 0,
    },
    visualHints: {
      glowWarmth: 0.3,
      avatarProximity: 0,
      ambientDim: 0,
    },
    audioHints: {
      addBreaths: false,
      addPauses: false,
      softenConsonants: false,
      reduceVolume: 0,
    },
    description: "Speaking normally",
  };
}

/**
 * Detects if a topic seems personal based on keywords
 * This is a simple heuristic - could be enhanced with NLP
 */
export function detectPersonalTopic(text: string): boolean {
  const personalKeywords = [
    "feel",
    "feeling",
    "feelings",
    "love",
    "miss",
    "scared",
    "afraid",
    "worried",
    "happy",
    "sad",
    "lonely",
    "alone",
    "heart",
    "soul",
    "dream",
    "hope",
    "trust",
    "hurt",
    "pain",
    "memory",
    "remember",
    "family",
    "mom",
    "dad",
    "mother",
    "father",
    "child",
    "childhood",
    "past",
    "future",
    "death",
    "life",
    "meaning",
    "purpose",
    "secret",
    "confess",
    "never told",
    "first time",
  ];

  const lowerText = text.toLowerCase();
  return personalKeywords.some((keyword) => lowerText.includes(keyword));
}
