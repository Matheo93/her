"use client";

/**
 * useBackchanneling - Natural Acknowledgment Sounds
 *
 * Creates the feeling that EVA is actively listening by
 * producing subtle acknowledgment sounds ("mmh", "ah", "oui", etc.)
 * at natural intervals during the user's speech.
 *
 * This is based on human conversational patterns where listeners
 * provide "backchannel responses" to signal engagement.
 *
 * Based on research:
 * - NVIDIA PersonaPlex full-duplex model
 * - Amazon Nova 2 Sonic turn-taking
 * - Tavus AI turn-taking guide
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface BackchannelEvent {
  id: string;
  type: "verbal" | "visual";
  sound?: BackchannelSound;
  timestamp: number;
  intensity: number; // 0-1, affects volume/visibility
}

// Backchannel sounds - French variations for EVA
export type BackchannelSound =
  | "mmh"       // Soft acknowledgment
  | "ah"        // Understanding
  | "oui"       // Agreement (subtle)
  | "daccord"   // Agreement (stronger)
  | "hmm"       // Contemplating
  | "oh"        // Mild surprise
  | "aah"       // Realization
  | "breath";   // Just a small breath/sigh

// Sound characteristics
const BACKCHANNEL_CONFIG: Record<BackchannelSound, {
  frequency: number;    // How often this can occur (0-1)
  minGap: number;       // Minimum ms since last backchannel
  intensity: number;    // Base intensity (0-1)
  duration: number;     // How long the sound lasts (ms)
  emotionalMatch: string[]; // Emotions that favor this sound
}> = {
  mmh: {
    frequency: 0.4,
    minGap: 2000,
    intensity: 0.3,
    duration: 300,
    emotionalMatch: ["listening", "neutral", "empathy"],
  },
  ah: {
    frequency: 0.3,
    minGap: 3000,
    intensity: 0.4,
    duration: 250,
    emotionalMatch: ["curiosity", "listening"],
  },
  oui: {
    frequency: 0.2,
    minGap: 4000,
    intensity: 0.5,
    duration: 200,
    emotionalMatch: ["listening", "joy", "tenderness"],
  },
  daccord: {
    frequency: 0.1,
    minGap: 6000,
    intensity: 0.6,
    duration: 400,
    emotionalMatch: ["empathy", "listening"],
  },
  hmm: {
    frequency: 0.25,
    minGap: 3500,
    intensity: 0.35,
    duration: 400,
    emotionalMatch: ["thinking", "curiosity"],
  },
  oh: {
    frequency: 0.15,
    minGap: 5000,
    intensity: 0.5,
    duration: 200,
    emotionalMatch: ["surprise", "curiosity"],
  },
  aah: {
    frequency: 0.1,
    minGap: 5000,
    intensity: 0.45,
    duration: 300,
    emotionalMatch: ["curiosity", "joy"],
  },
  breath: {
    frequency: 0.5,
    minGap: 1500,
    intensity: 0.15,
    duration: 500,
    emotionalMatch: ["listening", "neutral", "empathy", "tenderness"],
  },
};

interface UseBackchannelingOptions {
  // Is EVA currently listening to user?
  isListening: boolean;

  // User's audio level (0-1)
  userAudioLevel: number;

  // Current emotion context
  emotion: string;

  // Enable/disable backchanneling
  enabled?: boolean;

  // Callback when a backchannel event occurs
  onBackchannel?: (event: BackchannelEvent) => void;
}

interface UseBackchannelingReturn {
  // Current backchannel event (if any)
  currentEvent: BackchannelEvent | null;

  // History of recent events
  recentEvents: BackchannelEvent[];

  // Is EVA about to backchannel?
  isPreparingBackchannel: boolean;

  // Manually trigger a backchannel (for testing/override)
  triggerBackchannel: (sound: BackchannelSound) => void;
}

export function useBackchanneling({
  isListening,
  userAudioLevel,
  emotion,
  enabled = true,
  onBackchannel,
}: UseBackchannelingOptions): UseBackchannelingReturn {
  const [currentEvent, setCurrentEvent] = useState<BackchannelEvent | null>(null);
  const [recentEvents, setRecentEvents] = useState<BackchannelEvent[]>([]);
  const [isPreparingBackchannel, setIsPreparingBackchannel] = useState(false);

  // Refs for timing
  const lastBackchannelTime = useRef<number>(0);
  const userSpeakingDuration = useRef<number>(0);
  const userWasSpeaking = useRef<boolean>(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pauseDetectionRef = useRef<number>(0);

  // Check if user is actively speaking (audio level above threshold)
  const isUserSpeaking = userAudioLevel > 0.1;

  // Select appropriate backchannel sound based on context
  const selectBackchannelSound = useCallback((): BackchannelSound | null => {
    const now = Date.now();
    const timeSinceLastBackchannel = now - lastBackchannelTime.current;

    // Find eligible sounds based on timing and emotion
    const eligible = Object.entries(BACKCHANNEL_CONFIG)
      .filter(([sound, config]) => {
        // Check minimum gap
        if (timeSinceLastBackchannel < config.minGap) return false;

        // Check emotional match (boost probability if matches)
        const emotionBoost = config.emotionalMatch.includes(emotion) ? 1.5 : 0.5;

        // Random chance based on frequency
        return Math.random() < config.frequency * emotionBoost;
      })
      .map(([sound]) => sound as BackchannelSound);

    if (eligible.length === 0) return null;

    // Weight towards softer sounds (breath, mmh) more often
    const softSounds = eligible.filter((s) => ["breath", "mmh", "hmm"].includes(s));
    if (softSounds.length > 0 && Math.random() < 0.6) {
      return softSounds[Math.floor(Math.random() * softSounds.length)];
    }

    return eligible[Math.floor(Math.random() * eligible.length)];
  }, [emotion]);

  // Trigger a backchannel event
  const triggerBackchannel = useCallback((sound: BackchannelSound) => {
    const config = BACKCHANNEL_CONFIG[sound];
    const event: BackchannelEvent = {
      id: `bc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "verbal",
      sound,
      timestamp: Date.now(),
      intensity: config.intensity,
    };

    setCurrentEvent(event);
    setRecentEvents((prev) => [...prev.slice(-5), event]);
    lastBackchannelTime.current = Date.now();

    onBackchannel?.(event);

    // Clear after duration
    setTimeout(() => {
      setCurrentEvent(null);
    }, config.duration);
  }, [onBackchannel]);

  // Main backchanneling logic
  useEffect(() => {
    if (!enabled || !isListening) {
      // Reset when not listening
      userSpeakingDuration.current = 0;
      pauseDetectionRef.current = 0;
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      return;
    }

    // Check at regular intervals for backchannel opportunities
    checkIntervalRef.current = setInterval(() => {
      const now = Date.now();

      if (isUserSpeaking) {
        // User is speaking - track duration
        if (!userWasSpeaking.current) {
          userSpeakingDuration.current = now;
        }
        userWasSpeaking.current = true;
        pauseDetectionRef.current = 0;

        // Backchanneling opportunities during speech:
        // - After 2+ seconds of continuous speaking
        // - At random intervals that feel natural
        const speakingDuration = now - userSpeakingDuration.current;
        const timeSinceLastBackchannel = now - lastBackchannelTime.current;

        if (speakingDuration > 2000 && timeSinceLastBackchannel > 3000) {
          // Small chance to backchannel during speech
          if (Math.random() < 0.1) {
            const sound = selectBackchannelSound();
            if (sound) {
              setIsPreparingBackchannel(true);
              // Brief delay before backchanneling
              setTimeout(() => {
                setIsPreparingBackchannel(false);
                triggerBackchannel(sound);
              }, 200 + Math.random() * 300);
            }
          }
        }
      } else {
        // User paused - this is a natural backchannel opportunity
        if (userWasSpeaking.current) {
          // User just stopped speaking
          pauseDetectionRef.current = now;
        }

        const pauseDuration = pauseDetectionRef.current > 0 ? now - pauseDetectionRef.current : 0;

        // Natural backchannel after 300-800ms pause
        if (pauseDuration > 300 && pauseDuration < 1200 && userWasSpeaking.current) {
          const timeSinceLastBackchannel = now - lastBackchannelTime.current;

          if (timeSinceLastBackchannel > 1500 && Math.random() < 0.4) {
            const sound = selectBackchannelSound();
            if (sound) {
              triggerBackchannel(sound);
            }
          }
        }

        // Reset user speaking state after longer pause
        if (pauseDuration > 1200) {
          userWasSpeaking.current = false;
        }
      }
    }, 200); // Check every 200ms

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [enabled, isListening, isUserSpeaking, selectBackchannelSound, triggerBackchannel]);

  return {
    currentEvent,
    recentEvents,
    isPreparingBackchannel,
    triggerBackchannel,
  };
}

/**
 * Visual-only backchannel component props
 * For showing acknowledgment without audio
 */
export interface BackchannelDisplayProps {
  event: BackchannelEvent | null;
  isPreparingBackchannel: boolean;
}
