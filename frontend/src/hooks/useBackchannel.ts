"use client";

/**
 * useBackchannel - EVA's natural reactions during conversation
 *
 * Fetches /her/backchannel to get reactive sounds like:
 * - "mmhmm" (acknowledgment)
 * - "oh" (surprise)
 * - "ahh" (understanding)
 * - Empathetic sighs
 *
 * These backchannels make EVA feel more present and alive,
 * like a real person who reacts while you're speaking.
 *
 * The backend provides pre-generated audio for instant playback.
 */

import { useState, useCallback, useRef } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Backchannel types
export type BackchannelType =
  | "acknowledgment"   // "mmhmm", "uh huh"
  | "empathy"          // "oh...", sympathetic sounds
  | "interest"         // "ooh", "really?"
  | "understanding"    // "ahh", "I see"
  | "encouragement"    // encouraging sounds
  | "thinking";        // "hmm", thoughtful sounds

// Backchannel response from backend
export interface BackchannelResponse {
  should_backchannel: boolean;
  sound?: string;           // Text representation: "mmhmm", "oh", etc.
  type?: BackchannelType;
  audio_base64?: string;    // Pre-generated audio
  emotion_context?: string; // What emotion triggered this
}

// Hook state
export interface BackchannelState {
  // Current backchannel
  isPlaying: boolean;
  currentSound: string | null;
  currentType: BackchannelType | null;

  // Stats
  backchannelCount: number;
  lastBackchannelAt: Date | null;

  // Error state
  error: string | null;

  // Methods
  triggerBackchannel: (emotion?: string) => Promise<BackchannelResponse | null>;
  playBackchannelAudio: (audioBase64: string) => Promise<void>;
}

interface UseBackchannelOptions {
  apiKey?: string;
  // Include audio in response (default: true)
  withAudio?: boolean;
  // Audio context for playback
  audioContext?: AudioContext | null;
  // Callback when backchannel plays
  onBackchannel?: (sound: string, type: BackchannelType) => void;
}

export function useBackchannel({
  apiKey,
  withAudio = true,
  audioContext: externalAudioContext,
  onBackchannel,
}: UseBackchannelOptions = {}): BackchannelState {
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSound, setCurrentSound] = useState<string | null>(null);
  const [currentType, setCurrentType] = useState<BackchannelType | null>(null);
  const [backchannelCount, setBackchannelCount] = useState(0);
  const [lastBackchannelAt, setLastBackchannelAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Audio context ref
  const audioContextRef = useRef<AudioContext | null>(externalAudioContext ?? null);

  // Get or create audio context
  const getAudioContext = useCallback(() => {
    if (externalAudioContext) {
      return externalAudioContext;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    return audioContextRef.current;
  }, [externalAudioContext]);

  // Play audio from base64
  const playBackchannelAudio = useCallback(async (audioBase64: string) => {
    try {
      setIsPlaying(true);

      const audioContext = getAudioContext();

      // Decode base64 to ArrayBuffer
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);

      // Create and play source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      source.onended = () => {
        setIsPlaying(false);
      };

      source.start(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio playback failed");
      setIsPlaying(false);
    }
  }, [getAudioContext]);

  // Trigger a backchannel reaction
  const triggerBackchannel = useCallback(async (emotion?: string): Promise<BackchannelResponse | null> => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (apiKey) {
        headers["X-API-Key"] = apiKey;
      }

      const url = new URL(`${BACKEND_URL}/her/backchannel`);
      if (emotion) {
        url.searchParams.set("emotion", emotion);
      }
      url.searchParams.set("with_audio", withAudio.toString());

      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        if (response.status === 503) {
          // HER not available
          return { should_backchannel: false };
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: BackchannelResponse = await response.json();

      if (data.should_backchannel && data.sound && data.type) {
        setCurrentSound(data.sound);
        setCurrentType(data.type);
        setBackchannelCount((prev) => prev + 1);
        setLastBackchannelAt(new Date());
        setError(null);

        // Notify callback
        if (onBackchannel) {
          onBackchannel(data.sound, data.type);
        }

        // Play audio if available
        if (data.audio_base64) {
          await playBackchannelAudio(data.audio_base64);
        }
      }

      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get backchannel");
      return null;
    }
  }, [apiKey, withAudio, onBackchannel, playBackchannelAudio]);

  return {
    isPlaying,
    currentSound,
    currentType,
    backchannelCount,
    lastBackchannelAt,
    error,
    triggerBackchannel,
    playBackchannelAudio,
  };
}

/**
 * Get a display-friendly name for backchannel type
 */
export function getBackchannelTypeName(type: BackchannelType): string {
  const names: Record<BackchannelType, string> = {
    acknowledgment: "Acknowledgment",
    empathy: "Empathy",
    interest: "Interest",
    understanding: "Understanding",
    encouragement: "Encouragement",
    thinking: "Thinking",
  };

  return names[type] || type;
}

/**
 * Map emotions to likely backchannel triggers
 */
export function shouldTriggerBackchannel(
  emotion: string,
  lastBackchannelTime: number | null,
  minIntervalMs: number = 5000
): boolean {
  // Don't trigger too frequently
  if (lastBackchannelTime && Date.now() - lastBackchannelTime < minIntervalMs) {
    return false;
  }

  // Emotions that benefit from backchannels
  const backchannelEmotions = new Set([
    "sadness",
    "excitement",
    "surprise",
    "confusion",
    "frustration",
    "curiosity",
    "joy",
  ]);

  // Random chance even for neutral emotions (to feel more natural)
  if (emotion === "neutral") {
    return Math.random() < 0.1; // 10% chance
  }

  return backchannelEmotions.has(emotion) && Math.random() < 0.4; // 40% chance for emotional moments
}
