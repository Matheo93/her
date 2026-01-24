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

  // Tracking refs - using circular buffer pattern for O(1) operations
  const energyHistory = useRef<number[]>([]);
  const energyHistoryIndex = useRef(0);  // Circular buffer index
  const energySum = useRef(0);           // Running sum for O(1) average
  const pauseTimestamps = useRef<number[]>([]);
  const speakingStartTime = useRef<number | null>(null);
  const wasAboveThreshold = useRef(false);
  const frameRef = useRef<number | null>(null);
  const lastUpdateTime = useRef(Date.now());
  const lastPauseCleanup = useRef(0);    // Throttle pause cleanup

  // Audio level threshold for "speaking"
  const SPEAKING_THRESHOLD = 0.08 * sensitivity;

  // Calculate speaking rhythm from energy history
  // Optimized: uses running sum for O(1) average calculation
  const calculateRhythm = useCallback(() => {
    const historyLen = energyHistory.current.length;
    if (historyLen < 10) {
      return { tempo: "normal" as const, variability: 0.3, pauseFrequency: 0 };
    }

    // O(1) average calculation using running sum
    const avg = energySum.current / historyLen;

    // Calculate variance in single pass (no intermediate array creation)
    let sumSquaredDiff = 0;
    for (let i = 0; i < historyLen; i++) {
      const diff = energyHistory.current[i] - avg;
      sumSquaredDiff += diff * diff;
    }
    const variance = sumSquaredDiff / historyLen;
    const variability = Math.min(1, Math.sqrt(variance) * 5);

    // Determine tempo from average energy
    const tempo: "slow" | "normal" | "fast" =
      avg < 0.15 ? "slow" : avg > 0.35 ? "fast" : "normal";

    // Calculate pause frequency (pauses in last 30 seconds)
    // Count in-place instead of filter + length
    const thirtySecondsAgo = Date.now() - 30000;
    let recentPauseCount = 0;
    for (let i = 0; i < pauseTimestamps.current.length; i++) {
      if (pauseTimestamps.current[i] > thirtySecondsAgo) {
        recentPauseCount++;
      }
    }
    const pauseFrequency = recentPauseCount * 2; // Per minute

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
        // Throttle pause cleanup to every 5 seconds (avoid filter on every frame)
        if (now - lastPauseCleanup.current > 5000) {
          lastPauseCleanup.current = now;
          // In-place cleanup: remove old pauses
          const sixtySecondsAgo = now - 60000;
          let writeIdx = 0;
          for (let i = 0; i < pauseTimestamps.current.length; i++) {
            if (pauseTimestamps.current[i] >= sixtySecondsAgo) {
              pauseTimestamps.current[writeIdx++] = pauseTimestamps.current[i];
            }
          }
          pauseTimestamps.current.length = writeIdx;
        }
      }
      wasAboveThreshold.current = isCurrentlySpeaking;

      // Update energy history using circular buffer pattern with running sum
      const MAX_HISTORY = 120;
      const history = energyHistory.current;

      if (history.length < MAX_HISTORY) {
        // Still filling the buffer
        history.push(userAudioLevel);
        energySum.current += userAudioLevel;
      } else {
        // Circular buffer: replace oldest value
        const idx = energyHistoryIndex.current;
        energySum.current -= history[idx];  // Remove old value from sum
        energySum.current += userAudioLevel; // Add new value
        history[idx] = userAudioLevel;
        energyHistoryIndex.current = (idx + 1) % MAX_HISTORY;
      }

      // Calculate metrics
      const rhythm = calculateRhythm();
      const speakingDuration = speakingStartTime.current
        ? (now - speakingStartTime.current) / 1000
        : 0;

      // Calculate user energy (smoothed) - use running sum for recent 30 samples
      // For simplicity, calculate recent 30 inline (still O(30) but no array allocation)
      const historyLen = history.length;
      const recentCount = Math.min(30, historyLen);
      let recentSum = 0;
      // Get last 30 values accounting for circular buffer
      const startIdx = historyLen < MAX_HISTORY
        ? historyLen - recentCount
        : (energyHistoryIndex.current - recentCount + MAX_HISTORY) % MAX_HISTORY;
      for (let i = 0; i < recentCount; i++) {
        const idx = historyLen < MAX_HISTORY ? startIdx + i : (startIdx + i) % MAX_HISTORY;
        recentSum += history[idx];
      }
      const avgEnergy = recentCount > 0
        ? recentSum / recentCount
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
