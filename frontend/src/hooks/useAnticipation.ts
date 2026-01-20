"use client";

/**
 * useAnticipation - Predictive Context Awareness
 *
 * Creates the feeling that EVA anticipates your thoughts before you finish
 * expressing them. Like a close friend who knows what you're about to say.
 *
 * This hook tracks patterns in:
 * - Speaking patterns (when you typically pause to think)
 * - Emotional trajectories (where your mood is heading)
 * - Conversational rhythm (when you're about to conclude)
 * - Topic continuity (what you might say next)
 *
 * The result is a subtle anticipation that makes EVA feel prescient,
 * not creepy. She's ready before you need her to be.
 *
 * Based on:
 * - ElevenLabs voice agent trends (proactive AI)
 * - Kardome voice engineering research
 * - IDC FutureScape 2026 "Rise of Agentic AI"
 *
 * References:
 * - https://elevenlabs.io/blog/voice-agents-and-conversational-ai-new-developer-trends-2025
 * - https://www.kardome.com/resources/blog/voice-ai-engineering-the-interface-of-2026/
 * - https://masterofcode.com/blog/conversational-ai-trends
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// What EVA anticipates about the user's state
export interface AnticipationState {
  // Is the user about to finish speaking?
  isNearingConclusion: boolean;
  conclusionConfidence: number; // 0-1

  // Is the user searching for words?
  isSearchingForWords: boolean;
  searchDuration: number; // How long they've been pausing

  // Anticipated emotional direction
  emotionalTrajectory: "stable" | "rising" | "falling" | "shifting";
  anticipatedEmotion: string;

  // Topic/intent prediction
  anticipatedIntent: "question" | "statement" | "request" | "sharing" | "unknown";
  intentConfidence: number;

  // Readiness state - how prepared EVA should be
  readinessLevel: "relaxed" | "attentive" | "ready" | "imminent";

  // Should EVA show anticipation visually?
  showAnticipation: boolean;

  // Prediction of when user will finish (seconds from now, or null)
  predictedFinishIn: number | null;
}

// Visual cues for anticipation
export interface AnticipationVisuals {
  // Eye behavior
  eyeWidening: number; // 0-0.3, anticipatory widening
  gazeFocus: number; // 0-1, how focused on user

  // Breathing
  breathHold: boolean; // Subtle breath hold before speaking
  breathQuicken: number; // 0-0.5, slight quickening

  // Posture/lean
  leanForward: number; // 0-0.1, subtle lean toward user

  // Expression
  microExpression: "none" | "curious" | "understanding" | "ready";

  // Glow/presence
  readinessGlow: number; // 0-1, soft anticipatory glow
}

interface UseAnticipationOptions {
  // User's audio level
  userAudioLevel: number;

  // Current conversation state
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;

  // Prosody data (from useProsodyMirroring)
  userEnergy?: number;
  userTempo?: "slow" | "moderate" | "fast";
  emotionalIntensity?: number;

  // Current detected emotion
  currentEmotion?: string;

  // Enable anticipation
  enabled?: boolean;
}

// Pattern recognition for conclusion detection
interface SpeechPattern {
  timestamp: number;
  audioLevel: number;
  wasSpeaking: boolean;
  pauseDuration: number;
}

export function useAnticipation({
  userAudioLevel,
  isListening,
  isSpeaking,
  isThinking,
  userEnergy = 0.5,
  userTempo = "moderate",
  emotionalIntensity = 0.5,
  currentEmotion = "neutral",
  enabled = true,
}: UseAnticipationOptions): AnticipationState {
  // Main state
  const [state, setState] = useState<AnticipationState>({
    isNearingConclusion: false,
    conclusionConfidence: 0,
    isSearchingForWords: false,
    searchDuration: 0,
    emotionalTrajectory: "stable",
    anticipatedEmotion: "neutral",
    anticipatedIntent: "unknown",
    intentConfidence: 0,
    readinessLevel: "relaxed",
    showAnticipation: false,
    predictedFinishIn: null,
  });

  // Pattern tracking
  const speechPatterns = useRef<SpeechPattern[]>([]);
  const emotionHistory = useRef<{ timestamp: number; emotion: string; intensity: number }[]>([]);
  const pauseStartTime = useRef<number | null>(null);
  const lastSpeakingTime = useRef<number>(0);
  const speechStartTime = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastUpdateTime = useRef(Date.now());

  // Constants
  const SPEAKING_THRESHOLD = 0.08;
  const PAUSE_THRESHOLD_MS = 400; // Pause longer than this might indicate searching
  const CONCLUSION_PAUSE_MS = 800; // Pause this long suggests near conclusion
  const MAX_PATTERNS = 100;

  // Detect if user is searching for words (pausing mid-thought)
  const detectWordSearch = useCallback((): { isSearching: boolean; duration: number } => {
    if (!pauseStartTime.current) return { isSearching: false, duration: 0 };

    const pauseDuration = Date.now() - pauseStartTime.current;

    // Short pause after some speech = likely searching for words
    if (pauseDuration > PAUSE_THRESHOLD_MS && pauseDuration < 2000) {
      // Check if there was recent speech
      const recentPatterns = speechPatterns.current.slice(-20);
      const hadRecentSpeech = recentPatterns.some((p) => p.wasSpeaking);

      if (hadRecentSpeech) {
        return { isSearching: true, duration: pauseDuration / 1000 };
      }
    }

    return { isSearching: false, duration: 0 };
  }, []);

  // Detect if user is nearing conclusion
  const detectConclusion = useCallback((): { isNearing: boolean; confidence: number } => {
    if (!speechStartTime.current) return { isNearing: false, confidence: 0 };

    const speechDuration = Date.now() - speechStartTime.current;
    const patterns = speechPatterns.current;

    // Need enough data
    if (patterns.length < 10) return { isNearing: false, confidence: 0 };

    // Factors that suggest conclusion:
    // 1. Energy is decreasing (winding down)
    const recentEnergy = patterns.slice(-20).map((p) => p.audioLevel);
    const avgRecent = recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length;
    const olderEnergy = patterns.slice(-40, -20).map((p) => p.audioLevel);
    const avgOlder = olderEnergy.length > 0 ? olderEnergy.reduce((a, b) => a + b, 0) / olderEnergy.length : avgRecent;
    const energyDecreasing = avgRecent < avgOlder * 0.8;

    // 2. Speech duration (longer speeches tend toward conclusion)
    const durationFactor = Math.min(1, speechDuration / 15000); // Max at 15s

    // 3. Pause patterns (more pauses = nearing end)
    const recentPauses = patterns.slice(-30).filter((p) => !p.wasSpeaking).length;
    const pauseFactor = recentPauses > 10 ? 0.3 : 0;

    // 4. Tempo slowing (from prosody)
    const tempoFactor = userTempo === "slow" ? 0.2 : 0;

    // Combine factors
    let confidence = 0;
    if (energyDecreasing) confidence += 0.3;
    confidence += durationFactor * 0.3;
    confidence += pauseFactor;
    confidence += tempoFactor;

    // Check for actual pause that might indicate conclusion
    if (pauseStartTime.current) {
      const pauseDuration = Date.now() - pauseStartTime.current;
      if (pauseDuration > CONCLUSION_PAUSE_MS) {
        confidence += 0.3;
      }
    }

    confidence = Math.min(1, confidence);

    return {
      isNearing: confidence > 0.5,
      confidence,
    };
  }, [userTempo]);

  // Detect emotional trajectory
  const detectEmotionalTrajectory = useCallback((): {
    trajectory: AnticipationState["emotionalTrajectory"];
    anticipated: string;
  } => {
    const history = emotionHistory.current;

    if (history.length < 3) {
      return { trajectory: "stable", anticipated: currentEmotion };
    }

    // Get recent intensity trend
    const recent = history.slice(-5);
    const intensities = recent.map((h) => h.intensity);
    const avgIntensity = intensities.reduce((a, b) => a + b, 0) / intensities.length;
    const firstHalf = intensities.slice(0, Math.floor(intensities.length / 2));
    const secondHalf = intensities.slice(Math.floor(intensities.length / 2));
    const avgFirst = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
    const avgSecond = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;

    // Check for emotion changes
    const recentEmotions = recent.map((h) => h.emotion);
    const uniqueEmotions = new Set(recentEmotions);

    let trajectory: AnticipationState["emotionalTrajectory"] = "stable";
    if (uniqueEmotions.size > 2) {
      trajectory = "shifting";
    } else if (avgSecond > avgFirst * 1.2) {
      trajectory = "rising";
    } else if (avgSecond < avgFirst * 0.8) {
      trajectory = "falling";
    }

    // Anticipate next emotion based on trajectory
    let anticipated = currentEmotion;
    if (trajectory === "rising" && currentEmotion === "neutral") {
      anticipated = emotionalIntensity > 0.5 ? "excitement" : "curiosity";
    } else if (trajectory === "falling" && currentEmotion !== "neutral") {
      anticipated = "neutral";
    }

    return { trajectory, anticipated };
  }, [currentEmotion, emotionalIntensity]);

  // Determine intent from speech patterns
  const detectIntent = useCallback((): {
    intent: AnticipationState["anticipatedIntent"];
    confidence: number;
  } => {
    const patterns = speechPatterns.current;

    if (patterns.length < 15) return { intent: "unknown", confidence: 0 };

    // Rising intonation (energy) often indicates question
    const recent = patterns.slice(-15);
    const energyTrend = recent.map((p, i) => (i > 0 ? p.audioLevel - recent[i - 1].audioLevel : 0));
    const avgTrend = energyTrend.reduce((a, b) => a + b, 0) / energyTrend.length;

    // Short bursts might indicate questions or requests
    const speechDuration = speechStartTime.current ? Date.now() - speechStartTime.current : 0;

    if (avgTrend > 0.01 && speechDuration < 5000) {
      return { intent: "question", confidence: 0.6 };
    }

    if (speechDuration > 8000 && emotionalIntensity > 0.5) {
      return { intent: "sharing", confidence: 0.5 };
    }

    if (speechDuration < 3000 && userEnergy > 0.5) {
      return { intent: "request", confidence: 0.4 };
    }

    return { intent: "statement", confidence: 0.4 };
  }, [emotionalIntensity, userEnergy]);

  // Determine readiness level
  const determineReadiness = useCallback(
    (conclusionConfidence: number, isSearching: boolean): AnticipationState["readinessLevel"] => {
      if (conclusionConfidence > 0.8) return "imminent";
      if (conclusionConfidence > 0.5 || isSearching) return "ready";
      if (isListening && userAudioLevel > SPEAKING_THRESHOLD) return "attentive";
      return "relaxed";
    },
    [isListening, userAudioLevel]
  );

  // Main update loop
  useEffect(() => {
    if (!enabled) return;

    const update = () => {
      const now = Date.now();
      const delta = (now - lastUpdateTime.current) / 1000;
      lastUpdateTime.current = now;

      const isSpeakingNow = userAudioLevel > SPEAKING_THRESHOLD;

      // Track patterns
      const lastPattern = speechPatterns.current[speechPatterns.current.length - 1];
      speechPatterns.current.push({
        timestamp: now,
        audioLevel: userAudioLevel,
        wasSpeaking: isSpeakingNow,
        pauseDuration: isSpeakingNow ? 0 : lastPattern?.pauseDuration || 0,
      });

      // Trim old patterns
      if (speechPatterns.current.length > MAX_PATTERNS) {
        speechPatterns.current.shift();
      }

      // Track emotion history
      emotionHistory.current.push({
        timestamp: now,
        emotion: currentEmotion,
        intensity: emotionalIntensity,
      });
      if (emotionHistory.current.length > 30) {
        emotionHistory.current.shift();
      }

      // Track speech timing
      if (isSpeakingNow) {
        if (pauseStartTime.current !== null) {
          pauseStartTime.current = null;
        }
        if (speechStartTime.current === null) {
          speechStartTime.current = now;
        }
        lastSpeakingTime.current = now;
      } else {
        if (pauseStartTime.current === null && lastSpeakingTime.current > 0) {
          pauseStartTime.current = now;
        }
      }

      // Only analyze during listening
      if (isListening) {
        const wordSearch = detectWordSearch();
        const conclusion = detectConclusion();
        const emotional = detectEmotionalTrajectory();
        const intent = detectIntent();
        const readiness = determineReadiness(conclusion.confidence, wordSearch.isSearching);

        // Predict finish time
        let predictedFinishIn: number | null = null;
        if (conclusion.isNearing) {
          // Estimate based on confidence
          predictedFinishIn = Math.max(0.5, 3 * (1 - conclusion.confidence));
        }

        // Show anticipation only when relevant
        const showAnticipation =
          readiness !== "relaxed" &&
          (conclusion.confidence > 0.4 || wordSearch.isSearching || intent.intent === "question");

        setState({
          isNearingConclusion: conclusion.isNearing,
          conclusionConfidence: conclusion.confidence,
          isSearchingForWords: wordSearch.isSearching,
          searchDuration: wordSearch.duration,
          emotionalTrajectory: emotional.trajectory,
          anticipatedEmotion: emotional.anticipated,
          anticipatedIntent: intent.intent,
          intentConfidence: intent.confidence,
          readinessLevel: readiness,
          showAnticipation,
          predictedFinishIn,
        });
      } else {
        // Reset when not listening
        speechStartTime.current = null;
        pauseStartTime.current = null;

        setState((prev) => ({
          ...prev,
          readinessLevel: "relaxed",
          showAnticipation: false,
          isSearchingForWords: false,
          isNearingConclusion: false,
        }));
      }

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
    isListening,
    userAudioLevel,
    currentEmotion,
    emotionalIntensity,
    detectWordSearch,
    detectConclusion,
    detectEmotionalTrajectory,
    detectIntent,
    determineReadiness,
  ]);

  return state;
}

/**
 * Maps anticipation state to visual cues for the avatar
 */
export function mapAnticipationToVisuals(state: AnticipationState): AnticipationVisuals {
  const { readinessLevel, isSearchingForWords, isNearingConclusion, conclusionConfidence, anticipatedIntent } = state;

  // Eye behavior
  let eyeWidening = 0;
  let gazeFocus = 0.7;

  if (readinessLevel === "imminent") {
    eyeWidening = 0.2;
    gazeFocus = 1.0;
  } else if (readinessLevel === "ready") {
    eyeWidening = 0.1;
    gazeFocus = 0.9;
  } else if (readinessLevel === "attentive") {
    gazeFocus = 0.85;
  }

  // Curious widening when user is searching for words
  if (isSearchingForWords) {
    eyeWidening = Math.max(eyeWidening, 0.15);
  }

  // Breathing
  const breathHold = readinessLevel === "imminent" || isNearingConclusion;
  const breathQuicken = readinessLevel === "ready" ? 0.2 : readinessLevel === "imminent" ? 0.3 : 0;

  // Lean forward when anticipating
  const leanForward = readinessLevel === "imminent" ? 0.08 : readinessLevel === "ready" ? 0.04 : 0;

  // Micro-expression based on intent
  let microExpression: AnticipationVisuals["microExpression"] = "none";
  if (readinessLevel !== "relaxed") {
    if (isSearchingForWords) {
      microExpression = "understanding";
    } else if (anticipatedIntent === "question") {
      microExpression = "curious";
    } else if (isNearingConclusion) {
      microExpression = "ready";
    }
  }

  // Readiness glow
  const readinessGlow =
    readinessLevel === "imminent"
      ? 0.8
      : readinessLevel === "ready"
        ? 0.5
        : readinessLevel === "attentive"
          ? 0.3
          : 0;

  return {
    eyeWidening,
    gazeFocus,
    breathHold,
    breathQuicken,
    leanForward,
    microExpression,
    readinessGlow,
  };
}
