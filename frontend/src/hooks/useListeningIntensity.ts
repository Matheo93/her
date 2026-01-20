"use client";

/**
 * useListeningIntensity - Dynamic Attention Engagement
 *
 * Tracks and modulates EVA's listening intensity based on:
 * - User's speaking volume and energy
 * - Duration of speech
 * - Pauses and rhythm
 * - Emotional content (inferred from energy patterns)
 *
 * This creates the feeling that EVA is "more engaged" when
 * you're passionate and "more reflective" when you're calm.
 *
 * Based on:
 * - Amazon Nova 2 Sonic voice activity detection
 * - Sesame voice presence research
 * - Human conversational dynamics research
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface ListeningIntensityState {
  // Overall attention level (0-1)
  attention: number;

  // Engagement type
  engagementType: "passive" | "attentive" | "engaged" | "intense";

  // User energy tracking
  userEnergy: number;

  // Speaking rhythm metrics
  speakingRhythm: {
    tempo: "slow" | "normal" | "fast";
    variability: number; // 0-1, how varied the rhythm is
    pauseFrequency: number; // pauses per minute (estimated)
  };

  // Inferred emotional intensity from speech patterns
  emotionalIntensity: number; // 0-1

  // How long user has been speaking
  speakingDuration: number; // seconds
}

interface UseListeningIntensityOptions {
  // User's current audio level (0-1)
  userAudioLevel: number;

  // Is EVA currently listening?
  isListening: boolean;

  // Sensitivity adjustment (0.5-2.0, default 1.0)
  sensitivity?: number;
}

export function useListeningIntensity({
  userAudioLevel,
  isListening,
  sensitivity = 1.0,
}: UseListeningIntensityOptions): ListeningIntensityState {
  // Main state
  const [state, setState] = useState<ListeningIntensityState>({
    attention: 0.5,
    engagementType: "passive",
    userEnergy: 0,
    speakingRhythm: {
      tempo: "normal",
      variability: 0.3,
      pauseFrequency: 0,
    },
    emotionalIntensity: 0.3,
    speakingDuration: 0,
  });

  // Tracking refs
  const energyHistory = useRef<number[]>([]);
  const pauseTimestamps = useRef<number[]>([]);
  const speakingStartTime = useRef<number | null>(null);
  const wasAboveThreshold = useRef(false);
  const frameRef = useRef<number | null>(null);
  const lastUpdateTime = useRef(Date.now());

  // Audio level threshold for "speaking"
  const SPEAKING_THRESHOLD = 0.08 * sensitivity;

  // Calculate speaking rhythm from energy history
  const calculateRhythm = useCallback(() => {
    if (energyHistory.current.length < 10) {
      return { tempo: "normal" as const, variability: 0.3, pauseFrequency: 0 };
    }

    // Calculate average and variance
    const avg = energyHistory.current.reduce((a, b) => a + b, 0) / energyHistory.current.length;
    const variance =
      energyHistory.current.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
      energyHistory.current.length;
    const variability = Math.min(1, Math.sqrt(variance) * 5);

    // Determine tempo from average energy
    let tempo: "slow" | "normal" | "fast" = "normal";
    if (avg < 0.15) {
      tempo = "slow";
    } else if (avg > 0.35) {
      tempo = "fast";
    }

    // Calculate pause frequency (pauses in last 30 seconds)
    const thirtySecondsAgo = Date.now() - 30000;
    const recentPauses = pauseTimestamps.current.filter((t) => t > thirtySecondsAgo);
    const pauseFrequency = recentPauses.length * 2; // Per minute

    return { tempo, variability, pauseFrequency };
  }, []);

  // Determine engagement type from metrics
  const determineEngagementType = useCallback(
    (attention: number, emotionalIntensity: number): ListeningIntensityState["engagementType"] => {
      if (attention > 0.8 || emotionalIntensity > 0.7) {
        return "intense";
      } else if (attention > 0.6) {
        return "engaged";
      } else if (attention > 0.4) {
        return "attentive";
      }
      return "passive";
    },
    []
  );

  // Main update loop
  useEffect(() => {
    if (!isListening) {
      // Reset when not listening
      speakingStartTime.current = null;
      wasAboveThreshold.current = false;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }

      setState((prev) => ({
        ...prev,
        attention: Math.max(0.3, prev.attention * 0.95), // Decay slowly
        speakingDuration: 0,
      }));
      return;
    }

    const update = () => {
      const now = Date.now();
      const delta = (now - lastUpdateTime.current) / 1000;
      lastUpdateTime.current = now;

      const isCurrentlySpeaking = userAudioLevel > SPEAKING_THRESHOLD;

      // Track speaking start/pause
      if (isCurrentlySpeaking && !wasAboveThreshold.current) {
        // User started speaking
        if (speakingStartTime.current === null) {
          speakingStartTime.current = now;
        }
      } else if (!isCurrentlySpeaking && wasAboveThreshold.current) {
        // User paused
        pauseTimestamps.current.push(now);
        // Keep only last 60 seconds of pauses
        pauseTimestamps.current = pauseTimestamps.current.filter((t) => now - t < 60000);
      }
      wasAboveThreshold.current = isCurrentlySpeaking;

      // Update energy history (keep ~2 seconds at 60fps = ~120 samples)
      energyHistory.current.push(userAudioLevel);
      if (energyHistory.current.length > 120) {
        energyHistory.current.shift();
      }

      // Calculate metrics
      const rhythm = calculateRhythm();
      const speakingDuration = speakingStartTime.current
        ? (now - speakingStartTime.current) / 1000
        : 0;

      // Calculate user energy (smoothed)
      const recentEnergy = energyHistory.current.slice(-30);
      const avgEnergy =
        recentEnergy.length > 0
          ? recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length
          : 0;

      // Calculate emotional intensity from energy variance and rhythm
      const emotionalIntensity = Math.min(
        1,
        rhythm.variability * 0.4 + avgEnergy * 0.6 + (rhythm.tempo === "fast" ? 0.2 : 0)
      );

      // Calculate attention (rises with speech, energy, and emotion)
      let targetAttention = 0.5; // Base attention

      if (isCurrentlySpeaking) {
        targetAttention += avgEnergy * 0.3 * sensitivity;
        targetAttention += emotionalIntensity * 0.2;
        targetAttention += Math.min(0.15, speakingDuration / 30 * 0.15); // Builds over 30 seconds
      } else {
        // During pauses, attention dips slightly but stays engaged
        targetAttention -= 0.1;
      }

      targetAttention = Math.max(0.3, Math.min(1, targetAttention));

      // Smooth attention changes
      const smoothedAttention = state.attention + (targetAttention - state.attention) * delta * 2;

      // Determine engagement type
      const engagementType = determineEngagementType(smoothedAttention, emotionalIntensity);

      setState({
        attention: smoothedAttention,
        engagementType,
        userEnergy: avgEnergy,
        speakingRhythm: rhythm,
        emotionalIntensity,
        speakingDuration,
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
    isListening,
    userAudioLevel,
    sensitivity,
    SPEAKING_THRESHOLD,
    calculateRhythm,
    determineEngagementType,
    state.attention,
  ]);

  return state;
}

/**
 * Maps listening intensity to avatar parameters
 */
export function mapIntensityToAvatarParams(intensity: ListeningIntensityState): {
  eyeOpenness: number;      // 0.8-1.2, how open eyes are
  headTilt: number;         // -0.1 to 0.1, tilt toward user
  breathRate: number;       // 0.8-1.3, breathing speed multiplier
  pupilDilation: number;    // 0-0.5, extra dilation from engagement
  blinkRate: number;        // 0.7-1.3, blink frequency multiplier
} {
  const { attention, engagementType, emotionalIntensity } = intensity;

  // Eye openness increases with attention
  const eyeOpenness = 0.95 + attention * 0.1 + (engagementType === "intense" ? 0.05 : 0);

  // Head tilts slightly toward user when engaged
  const headTilt = attention > 0.5 ? 0.03 + (attention - 0.5) * 0.06 : 0;

  // Breathing quickens with emotional intensity
  const breathRate = 1.0 + emotionalIntensity * 0.25;

  // Pupils dilate with engagement
  const pupilDilation =
    engagementType === "intense" ? 0.4 : engagementType === "engaged" ? 0.25 : attention * 0.2;

  // Blink rate decreases with attention (more staring = more engaged)
  const blinkRate =
    engagementType === "intense" ? 0.7 : engagementType === "engaged" ? 0.8 : 1.0 - attention * 0.2;

  return {
    eyeOpenness,
    headTilt,
    breathRate,
    pupilDilation,
    blinkRate,
  };
}
