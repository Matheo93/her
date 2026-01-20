"use client";

/**
 * useProsodyMirroring - Emotional Voice Attunement
 *
 * Creates the feeling of emotional attunement by analyzing the user's
 * voice prosody (pitch, rhythm, energy, variability) and generating
 * mirrored prosody recommendations for EVA's responses.
 *
 * When someone speaks excitedly, EVA responds with matching energy.
 * When someone speaks softly and slowly, EVA matches that intimacy.
 *
 * This creates the "perceived attunement" effect where the brain's
 * social circuits don't discriminate between code and consciousness.
 *
 * Based on:
 * - Sesame's "voice presence" research
 * - Hume AI Octave contextual emotion understanding
 * - ScienceDirect prosodic alignment research
 * - Human empathy expression through timing, tone, and validation
 *
 * References:
 * - https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice
 * - https://www.hume.ai/
 * - https://www.sciencedirect.com/science/article/pii/S0167639321001138
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Prosody profile captures voice characteristics
export interface ProsodyProfile {
  // Pitch characteristics (relative, not Hz)
  pitchLevel: "low" | "mid" | "high";
  pitchVariability: number; // 0-1, how much pitch varies

  // Speaking rate
  tempo: "slow" | "moderate" | "fast";
  tempoVariability: number; // 0-1, consistency of pace

  // Energy/volume
  energy: number; // 0-1, overall speaking energy
  energyContour: "flat" | "rising" | "falling" | "varied";

  // Rhythm and pauses
  pauseFrequency: "rare" | "occasional" | "frequent";
  breathiness: number; // 0-1, softer/breathy quality

  // Inferred emotional qualities
  emotionalWarmth: number; // 0-1
  emotionalIntensity: number; // 0-1
  intimacyLevel: number; // 0-1, closeness feeling

  // Overall conversational style
  style: "intimate" | "engaged" | "neutral" | "energetic" | "reflective";
}

// Mirroring recommendations for EVA
export interface MirroringRecommendation {
  // Suggested TTS parameters
  suggestedSpeed: number; // 0.8-1.3, speaking rate multiplier
  suggestedPitch: number; // 0.9-1.1, pitch adjustment
  suggestedVolume: number; // 0.7-1.0, volume level
  suggestedPauseMs: number; // Pause between sentences

  // Emotional tone to convey
  emotionalTone: "warm" | "excited" | "gentle" | "thoughtful" | "playful";

  // Response style
  responseStyle: {
    addHesitations: boolean; // Include "hmm", "well..."
    addBreaths: boolean; // Include breath sounds
    useEmphasis: boolean; // Emphasize key words
    mirrorEnergy: boolean; // Match user's energy level
  };

  // Visual cues for avatar
  avatarHints: {
    eyeContactIntensity: number; // 0-1
    nodFrequency: number; // 0-1, how often to nod
    smileWarmth: number; // 0-1
    breathingSync: boolean; // Sync breathing to user
  };

  // Attunement confidence (how confident we are in the mirroring)
  attunementConfidence: number; // 0-1
}

export interface ProsodyMirroringState {
  // Current analysis of user's prosody
  userProsody: ProsodyProfile;

  // Recommended mirroring for EVA
  mirroring: MirroringRecommendation;

  // Is actively analyzing
  isAnalyzing: boolean;

  // Attunement level (how "in sync" EVA feels)
  attunementLevel: number; // 0-1

  // Human-readable description of current state
  attunementDescription: string;
}

interface UseProsodyMirroringOptions {
  // User's audio level (0-1)
  userAudioLevel: number;

  // Is currently listening to user
  isListening: boolean;

  // Is EVA currently speaking
  isSpeaking: boolean;

  // Current detected emotion (from LLM or inference)
  detectedEmotion?: string;

  // Enable mirroring
  enabled?: boolean;
}

// Default prosody profile for neutral state
const DEFAULT_PROSODY: ProsodyProfile = {
  pitchLevel: "mid",
  pitchVariability: 0.3,
  tempo: "moderate",
  tempoVariability: 0.3,
  energy: 0.5,
  energyContour: "flat",
  pauseFrequency: "occasional",
  breathiness: 0.3,
  emotionalWarmth: 0.5,
  emotionalIntensity: 0.3,
  intimacyLevel: 0.5,
  style: "neutral",
};

// Default mirroring for neutral response
const DEFAULT_MIRRORING: MirroringRecommendation = {
  suggestedSpeed: 1.0,
  suggestedPitch: 1.0,
  suggestedVolume: 0.85,
  suggestedPauseMs: 400,
  emotionalTone: "warm",
  responseStyle: {
    addHesitations: false,
    addBreaths: true,
    useEmphasis: false,
    mirrorEnergy: true,
  },
  avatarHints: {
    eyeContactIntensity: 0.7,
    nodFrequency: 0.3,
    smileWarmth: 0.5,
    breathingSync: true,
  },
  attunementConfidence: 0.5,
};

export function useProsodyMirroring({
  userAudioLevel,
  isListening,
  isSpeaking,
  detectedEmotion = "neutral",
  enabled = true,
}: UseProsodyMirroringOptions): ProsodyMirroringState {
  // State
  const [userProsody, setUserProsody] = useState<ProsodyProfile>(DEFAULT_PROSODY);
  const [mirroring, setMirroring] = useState<MirroringRecommendation>(DEFAULT_MIRRORING);
  const [attunementLevel, setAttunementLevel] = useState(0.5);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Analysis tracking
  const audioHistory = useRef<number[]>([]);
  const peakHistory = useRef<number[]>([]);
  const pauseTimestamps = useRef<number[]>([]);
  const speechStartTime = useRef<number | null>(null);
  const lastSpeakingState = useRef(false);
  const frameRef = useRef<number | null>(null);
  const lastUpdateTime = useRef(Date.now());

  // Thresholds
  const SPEAKING_THRESHOLD = 0.08;
  const ENERGY_HIGH_THRESHOLD = 0.4;
  const ENERGY_LOW_THRESHOLD = 0.15;

  // Calculate energy contour from recent history
  const calculateEnergyContour = useCallback((): ProsodyProfile["energyContour"] => {
    if (audioHistory.current.length < 30) return "flat";

    const recent = audioHistory.current.slice(-30);
    const firstHalf = recent.slice(0, 15);
    const secondHalf = recent.slice(15);

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const diff = avgSecond - avgFirst;

    if (Math.abs(diff) < 0.05) return "flat";
    if (diff > 0.1) return "rising";
    if (diff < -0.1) return "falling";
    return "varied";
  }, []);

  // Calculate pitch level from energy patterns (proxy since we can't access true pitch)
  const inferPitchLevel = useCallback((): ProsodyProfile["pitchLevel"] => {
    // Higher energy often correlates with higher pitch in emotional speech
    const recentEnergy = audioHistory.current.slice(-60);
    if (recentEnergy.length === 0) return "mid";

    const avgEnergy = recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length;
    const peaks = peakHistory.current.slice(-10);
    const avgPeak = peaks.length > 0 ? peaks.reduce((a, b) => a + b, 0) / peaks.length : 0.5;

    // High peaks and energy suggest higher pitch
    if (avgPeak > 0.6 && avgEnergy > 0.3) return "high";
    if (avgPeak < 0.3 && avgEnergy < 0.2) return "low";
    return "mid";
  }, []);

  // Calculate tempo from speaking patterns
  const calculateTempo = useCallback((): ProsodyProfile["tempo"] => {
    const recentEnergy = audioHistory.current.slice(-60);
    if (recentEnergy.length < 30) return "moderate";

    // Count transitions (speaking <-> pause)
    let transitions = 0;
    for (let i = 1; i < recentEnergy.length; i++) {
      const wasSpeaking = recentEnergy[i - 1] > SPEAKING_THRESHOLD;
      const isSpeakingNow = recentEnergy[i] > SPEAKING_THRESHOLD;
      if (wasSpeaking !== isSpeakingNow) transitions++;
    }

    // More transitions = faster, varied speech
    if (transitions > 20) return "fast";
    if (transitions < 5) return "slow";
    return "moderate";
  }, []);

  // Calculate pause frequency
  const calculatePauseFrequency = useCallback((): ProsodyProfile["pauseFrequency"] => {
    const now = Date.now();
    const recentPauses = pauseTimestamps.current.filter((t) => now - t < 10000);

    if (recentPauses.length > 6) return "frequent";
    if (recentPauses.length < 2) return "rare";
    return "occasional";
  }, []);

  // Determine conversational style from prosody
  const determineStyle = useCallback(
    (prosody: Partial<ProsodyProfile>): ProsodyProfile["style"] => {
      const { energy = 0.5, tempo = "moderate", intimacyLevel = 0.5, emotionalIntensity = 0.3 } = prosody;

      if (intimacyLevel > 0.7 && energy < 0.4) return "intimate";
      if (emotionalIntensity > 0.6 && energy > 0.5) return "energetic";
      if (tempo === "slow" && energy < 0.3) return "reflective";
      if (energy > 0.4 && emotionalIntensity > 0.4) return "engaged";
      return "neutral";
    },
    []
  );

  // Generate mirroring recommendations from prosody
  const generateMirroring = useCallback(
    (prosody: ProsodyProfile, emotion: string): MirroringRecommendation => {
      // Base mirroring on prosody
      let suggestedSpeed = 1.0;
      let suggestedPitch = 1.0;
      let suggestedVolume = 0.85;
      let suggestedPauseMs = 400;
      let emotionalTone: MirroringRecommendation["emotionalTone"] = "warm";

      // Tempo mirroring - match user's pace
      if (prosody.tempo === "slow") {
        suggestedSpeed = 0.9;
        suggestedPauseMs = 600;
      } else if (prosody.tempo === "fast") {
        suggestedSpeed = 1.1;
        suggestedPauseMs = 250;
      }

      // Energy mirroring - match user's energy
      if (prosody.energy > ENERGY_HIGH_THRESHOLD) {
        suggestedVolume = 0.95;
        suggestedPitch = 1.05;
        emotionalTone = "excited";
      } else if (prosody.energy < ENERGY_LOW_THRESHOLD) {
        suggestedVolume = 0.75;
        suggestedPitch = 0.95;
        emotionalTone = "gentle";
      }

      // Intimacy adjustment
      if (prosody.intimacyLevel > 0.7) {
        suggestedVolume = Math.min(suggestedVolume, 0.8);
        emotionalTone = "gentle";
      }

      // Emotion-based adjustments
      if (emotion === "joy" || emotion === "excitement") {
        emotionalTone = "excited";
        suggestedPitch = Math.max(suggestedPitch, 1.05);
      } else if (emotion === "sadness" || emotion === "tenderness") {
        emotionalTone = "gentle";
        suggestedSpeed = Math.min(suggestedSpeed, 0.95);
      } else if (emotion === "curiosity") {
        emotionalTone = "playful";
      }

      // Style-based adjustments
      if (prosody.style === "reflective") {
        emotionalTone = "thoughtful";
        suggestedPauseMs = Math.max(suggestedPauseMs, 500);
      }

      // Response style based on prosody
      const responseStyle = {
        addHesitations: prosody.style === "intimate" || prosody.pauseFrequency === "frequent",
        addBreaths: prosody.intimacyLevel > 0.5 || prosody.style === "reflective",
        useEmphasis: prosody.emotionalIntensity > 0.5,
        mirrorEnergy: true,
      };

      // Avatar hints
      const avatarHints = {
        eyeContactIntensity: Math.min(1, 0.5 + prosody.intimacyLevel * 0.3 + prosody.emotionalIntensity * 0.2),
        nodFrequency: prosody.pauseFrequency === "frequent" ? 0.6 : prosody.style === "engaged" ? 0.4 : 0.2,
        smileWarmth: prosody.emotionalWarmth,
        breathingSync: prosody.style === "intimate" || prosody.intimacyLevel > 0.6,
      };

      // Attunement confidence based on data quality
      const attunementConfidence = Math.min(
        1,
        0.3 + audioHistory.current.length / 200 + (prosody.style !== "neutral" ? 0.2 : 0)
      );

      return {
        suggestedSpeed,
        suggestedPitch,
        suggestedVolume,
        suggestedPauseMs,
        emotionalTone,
        responseStyle,
        avatarHints,
        attunementConfidence,
      };
    },
    []
  );

  // Generate attunement description
  const attunementDescription = useMemo(() => {
    if (attunementLevel < 0.3) {
      return "Calibrating...";
    } else if (attunementLevel < 0.5) {
      return "Listening attentively";
    } else if (attunementLevel < 0.7) {
      return "Attuned to your voice";
    } else if (attunementLevel < 0.85) {
      return "Deeply connected";
    }
    return "In perfect sync";
  }, [attunementLevel]);

  // Main analysis loop
  useEffect(() => {
    if (!enabled) return;

    const analyze = () => {
      const now = Date.now();
      const delta = (now - lastUpdateTime.current) / 1000;
      lastUpdateTime.current = now;

      const isSpeakingNow = userAudioLevel > SPEAKING_THRESHOLD;

      // Track speech start/pause
      if (isSpeakingNow && !lastSpeakingState.current) {
        if (speechStartTime.current === null) {
          speechStartTime.current = now;
        }
      } else if (!isSpeakingNow && lastSpeakingState.current) {
        pauseTimestamps.current.push(now);
        pauseTimestamps.current = pauseTimestamps.current.filter((t) => now - t < 30000);
      }
      lastSpeakingState.current = isSpeakingNow;

      // Update audio history
      audioHistory.current.push(userAudioLevel);
      if (audioHistory.current.length > 180) {
        audioHistory.current.shift();
      }

      // Track peaks
      if (isSpeakingNow && userAudioLevel > (peakHistory.current[peakHistory.current.length - 1] || 0) * 0.8) {
        peakHistory.current.push(userAudioLevel);
        if (peakHistory.current.length > 30) {
          peakHistory.current.shift();
        }
      }

      // Only analyze when listening
      if (isListening) {
        setIsAnalyzing(true);

        // Calculate prosody metrics
        const recentEnergy = audioHistory.current.slice(-60);
        const avgEnergy = recentEnergy.length > 0 ? recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length : 0;

        // Calculate variability
        const energyVariance =
          recentEnergy.length > 1
            ? recentEnergy.reduce((sum, val) => sum + Math.pow(val - avgEnergy, 2), 0) / recentEnergy.length
            : 0;
        const energyVariability = Math.min(1, Math.sqrt(energyVariance) * 4);

        // Infer emotional qualities from patterns
        const emotionalIntensity = Math.min(1, avgEnergy * 0.6 + energyVariability * 0.4);
        const emotionalWarmth = Math.min(1, 0.4 + avgEnergy * 0.3 + (detectedEmotion === "joy" ? 0.2 : 0));
        const intimacyLevel = avgEnergy < 0.3 ? 0.4 + (0.3 - avgEnergy) * 2 : 0.3;

        // Breathiness inferred from low energy but consistent speaking
        const breathiness = avgEnergy < 0.2 && isSpeakingNow ? 0.6 : 0.3;

        const newProsody: ProsodyProfile = {
          pitchLevel: inferPitchLevel(),
          pitchVariability: energyVariability,
          tempo: calculateTempo(),
          tempoVariability: energyVariability * 0.8,
          energy: avgEnergy,
          energyContour: calculateEnergyContour(),
          pauseFrequency: calculatePauseFrequency(),
          breathiness,
          emotionalWarmth,
          emotionalIntensity,
          intimacyLevel,
          style: "neutral", // Will be set below
        };

        newProsody.style = determineStyle(newProsody);

        setUserProsody(newProsody);

        // Generate mirroring recommendations
        const newMirroring = generateMirroring(newProsody, detectedEmotion);
        setMirroring(newMirroring);

        // Update attunement level (builds over time while listening)
        const targetAttunement = Math.min(
          1,
          0.3 + audioHistory.current.length / 150 + newMirroring.attunementConfidence * 0.3
        );
        setAttunementLevel((prev) => prev + (targetAttunement - prev) * delta * 0.5);
      } else {
        setIsAnalyzing(false);
        // Decay attunement when not listening
        setAttunementLevel((prev) => Math.max(0.3, prev * 0.995));
      }

      // Slower decay when speaking (maintaining attunement during response)
      if (isSpeaking) {
        setAttunementLevel((prev) => Math.max(0.5, prev * 0.998));
      }

      frameRef.current = requestAnimationFrame(analyze);
    };

    frameRef.current = requestAnimationFrame(analyze);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [
    enabled,
    isListening,
    isSpeaking,
    userAudioLevel,
    detectedEmotion,
    calculateEnergyContour,
    calculatePauseFrequency,
    calculateTempo,
    determineStyle,
    generateMirroring,
    inferPitchLevel,
  ]);

  return {
    userProsody,
    mirroring,
    isAnalyzing,
    attunementLevel,
    attunementDescription,
  };
}

/**
 * Maps attunement level to visual feedback for UI
 */
export function mapAttunementToVisual(attunementLevel: number): {
  glowIntensity: number;
  glowColor: string;
  pulseRate: number; // Seconds per pulse
  connectionStrength: "weak" | "building" | "strong" | "deep";
} {
  // Colors from HER palette
  const coralGlow = "rgba(232, 132, 107, ";
  const warmGlow = "rgba(232, 160, 144, ";

  if (attunementLevel < 0.4) {
    return {
      glowIntensity: 0.2 + attunementLevel * 0.3,
      glowColor: `${coralGlow}${0.2 + attunementLevel * 0.2})`,
      pulseRate: 4,
      connectionStrength: "weak",
    };
  } else if (attunementLevel < 0.6) {
    return {
      glowIntensity: 0.4 + (attunementLevel - 0.4) * 0.5,
      glowColor: `${coralGlow}${0.3 + (attunementLevel - 0.4) * 0.3})`,
      pulseRate: 3,
      connectionStrength: "building",
    };
  } else if (attunementLevel < 0.8) {
    return {
      glowIntensity: 0.6 + (attunementLevel - 0.6) * 0.5,
      glowColor: `${warmGlow}${0.4 + (attunementLevel - 0.6) * 0.3})`,
      pulseRate: 2.5,
      connectionStrength: "strong",
    };
  }

  return {
    glowIntensity: 0.8 + (attunementLevel - 0.8) * 0.4,
    glowColor: `${warmGlow}${0.5 + (attunementLevel - 0.8) * 0.3})`,
    pulseRate: 2,
    connectionStrength: "deep",
  };
}
