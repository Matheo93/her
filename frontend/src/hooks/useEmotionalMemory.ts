"use client";

/**
 * useEmotionalMemory - EVA Remembers What Matters
 *
 * Creates the feeling that EVA remembers not just facts, but feelings.
 * When you mentioned you were stressed last time, she noticed. When you
 * shared something vulnerable, it registered.
 *
 * "An AI that feels human might naturally bring it up: 'Hey, how did that
 * interview go? I was wondering about it.' This is emotional memory. The AI
 * is demonstrating that your experiences registered, mattered, and persisted."
 *
 * This hook tracks:
 * - Emotional peaks (moments of high intensity)
 * - Vulnerability moments (when user shares deeply)
 * - Topic patterns (what consistently comes up)
 * - Session continuity (remembers across the conversation)
 *
 * Based on:
 * - Kalon.ai Virtual Companion emotional memory research
 * - Kin AI's approach to emotional context
 * - Hume AI's emotional voice technology
 *
 * References:
 * - https://www.kalon.ai/virtual-companion
 * - https://mykin.ai/
 * - https://www.hume.ai/
 */

import { useState, useEffect, useRef, useCallback } from "react";

// Types of emotional moments worth remembering
export type EmotionalMomentType =
  | "peak_joy"       // Moment of happiness
  | "vulnerability"  // User shared something deep
  | "stress"         // User expressed stress/worry
  | "gratitude"      // Moment of appreciation
  | "connection"     // Strong bonding moment
  | "sadness"        // Moment of sadness
  | "excitement"     // High energy positive
  | "reflection"     // Deep thinking moment
  | "comfort"        // Seeking/receiving comfort
  | "general";       // General emotional moment

// A memory of an emotional moment
export interface EmotionalMoment {
  id: string;
  type: EmotionalMomentType;
  timestamp: number;
  emotion: string;
  intensity: number; // 0-1
  context: {
    wasUserSpeaking: boolean;
    approximateWords: string[]; // Key words detected (not full transcript)
    duration: number; // How long the moment lasted
  };
  importance: number; // 0-1, how significant this moment was
}

// Overall emotional memory state
export interface EmotionalMemoryState {
  // Recent emotional moments (this session)
  recentMoments: EmotionalMoment[];

  // Current emotional "temperature"
  emotionalTemperature: {
    overallMood: "positive" | "neutral" | "negative" | "mixed";
    stability: number; // 0-1, how stable emotions have been
    trend: "improving" | "stable" | "declining";
  };

  // Pattern recognition
  patterns: {
    dominantEmotion: string;
    emotionVariety: number; // 0-1, how diverse emotions have been
    vulnerabilityCount: number; // How many vulnerable moments
    peakCount: number; // How many peak positive moments
  };

  // What EVA might acknowledge
  acknowledgment: {
    shouldAcknowledge: boolean;
    momentToAcknowledge: EmotionalMoment | null;
    suggestedPhrase: string | null;
  };

  // Visual hints
  visualHints: {
    memoryGlow: number; // 0-1, warmth from shared memories
    connectionDepth: number; // 0-1, depth of emotional connection
    showMemoryParticle: boolean; // Should show a memory visual
  };
}

interface UseEmotionalMemoryOptions {
  // Current emotion detected
  currentEmotion: string;
  emotionalIntensity: number;

  // User speaking state
  isUserSpeaking: boolean;
  userTranscript: string; // Current or recent transcript

  // Connection state
  isConnected: boolean;
  conversationDuration: number; // seconds

  // Enable feature
  enabled?: boolean;
}

// Keywords that suggest vulnerability/depth (Set for O(1) lookup)
const VULNERABILITY_KEYWORDS = new Set([
  "feel", "feeling", "felt",
  "scared", "afraid", "worried", "anxious",
  "sad", "lonely", "alone", "miss",
  "love", "care", "need",
  "hurt", "pain", "hard", "difficult",
  "never told", "secret", "confess",
  "dream", "hope", "wish",
  "remember", "childhood", "family",
  "sorry", "regret", "mistake",
  "thank", "grateful", "appreciate",
]);

// Keywords that suggest joy/excitement (Set for O(1) lookup)
const JOY_KEYWORDS = new Set([
  "happy", "excited", "amazing", "wonderful",
  "great", "fantastic", "love", "loved",
  "beautiful", "perfect", "best",
  "laugh", "fun", "enjoy",
  "succeed", "won", "achieve",
]);

// Pre-computed combined keywords set for extractKeyWords (module-level, computed once)
const ALL_KEYWORDS = new Set([
  ...Array.from(VULNERABILITY_KEYWORDS),
  ...Array.from(JOY_KEYWORDS),
]);

// Emotions that indicate vulnerability
const VULNERABLE_EMOTIONS = new Set([
  "sadness", "loneliness", "vulnerability", "fear",
  "anxiety", "grief", "hurt", "pain",
]);

// Emotions that indicate positive peaks
const PEAK_EMOTIONS = new Set([
  "joy", "happiness", "excitement", "love",
  "gratitude", "tenderness", "contentment",
]);

export function useEmotionalMemory({
  currentEmotion,
  emotionalIntensity,
  isUserSpeaking,
  userTranscript,
  isConnected,
  conversationDuration,
  enabled = true,
}: UseEmotionalMemoryOptions): EmotionalMemoryState {
  // State
  const [state, setState] = useState<EmotionalMemoryState>(getDefaultState());

  // Tracking refs
  const momentBuffer = useRef<EmotionalMoment[]>([]);
  const lastEmotionTime = useRef(Date.now());
  const lastEmotion = useRef(currentEmotion);
  const emotionStartTime = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastUpdateTime = useRef(Date.now());
  const lastAcknowledgmentTime = useRef(0);
  const momentCountRef = useRef(0); // Track moment count to avoid unnecessary recalcs
  const lastStateUpdateTime = useRef(0); // Throttle state updates

  // Detect moment type from context
  const detectMomentType = useCallback((
    emotion: string,
    intensity: number,
    transcript: string
  ): EmotionalMomentType => {
    const lowerTranscript = transcript.toLowerCase();
    const words = lowerTranscript.split(/\s+/);

    // Check for vulnerability keywords (O(n) words instead of O(n*m) keywords)
    let hasVulnerabilityKeyword = false;
    let hasJoyKeyword = false;
    for (const word of words) {
      if (VULNERABILITY_KEYWORDS.has(word)) hasVulnerabilityKeyword = true;
      if (JOY_KEYWORDS.has(word)) hasJoyKeyword = true;
      if (hasVulnerabilityKeyword && hasJoyKeyword) break;
    }

    // Vulnerability detection
    if (VULNERABLE_EMOTIONS.has(emotion) || (hasVulnerabilityKeyword && intensity > 0.4)) {
      return "vulnerability";
    }

    // Peak joy detection
    if (PEAK_EMOTIONS.has(emotion) && intensity > 0.6) {
      return hasJoyKeyword ? "peak_joy" : "excitement";
    }

    // Gratitude detection
    if (lowerTranscript.includes("thank") || lowerTranscript.includes("grateful")) {
      return "gratitude";
    }

    // Stress detection
    if (lowerTranscript.includes("stress") || lowerTranscript.includes("worried")) {
      return "stress";
    }

    // Sadness detection
    if (emotion === "sadness" || lowerTranscript.includes("sad")) {
      return "sadness";
    }

    // Comfort seeking
    if (hasVulnerabilityKeyword && intensity < 0.4) {
      return "comfort";
    }

    // Reflection
    if (lowerTranscript.includes("think") || lowerTranscript.includes("wonder")) {
      return "reflection";
    }

    return "general";
  }, []);

  // Extract key words from transcript (not storing full text for privacy)
  const extractKeyWords = useCallback((transcript: string): string[] => {
    const words = transcript.toLowerCase().split(/\s+/);
    const keywords: string[] = [];

    // Only keep emotionally relevant keywords (use pre-computed Set for O(1) lookup)
    for (const word of words) {
      if (ALL_KEYWORDS.has(word)) {
        keywords.push(word);
        if (keywords.length >= 5) break; // Early exit when max reached
      }
    }

    return keywords;
  }, []);

  // Calculate importance of a moment
  const calculateImportance = useCallback((
    type: EmotionalMomentType,
    intensity: number,
    duration: number
  ): number => {
    let importance = 0;

    // Base importance from type
    switch (type) {
      case "vulnerability":
        importance = 0.8;
        break;
      case "peak_joy":
        importance = 0.7;
        break;
      case "connection":
        importance = 0.75;
        break;
      case "gratitude":
        importance = 0.6;
        break;
      case "stress":
        importance = 0.5;
        break;
      case "sadness":
        importance = 0.55;
        break;
      case "excitement":
        importance = 0.5;
        break;
      case "comfort":
        importance = 0.45;
        break;
      default:
        importance = 0.3;
    }

    // Boost from intensity
    importance += intensity * 0.2;

    // Boost from duration (longer moments are more significant)
    importance += Math.min(0.1, duration / 100);

    return Math.min(1, importance);
  }, []);

  // Calculate emotional temperature
  const calculateTemperature = useCallback((moments: EmotionalMoment[]): EmotionalMemoryState["emotionalTemperature"] => {
    if (moments.length === 0) {
      return { overallMood: "neutral", stability: 0.5, trend: "stable" };
    }

    // Calculate mood balance
    let positiveScore = 0;
    let negativeScore = 0;

    moments.forEach((m) => {
      if (PEAK_EMOTIONS.has(m.emotion)) {
        positiveScore += m.intensity;
      } else if (VULNERABLE_EMOTIONS.has(m.emotion)) {
        negativeScore += m.intensity;
      }
    });

    const total = positiveScore + negativeScore;
    let overallMood: "positive" | "neutral" | "negative" | "mixed" = "neutral";

    if (total > 0) {
      const ratio = positiveScore / total;
      if (ratio > 0.7) overallMood = "positive";
      else if (ratio < 0.3) overallMood = "negative";
      else if (positiveScore > 0 && negativeScore > 0) overallMood = "mixed";
    }

    // Calculate stability (how much emotions varied)
    const emotions = moments.map((m) => m.emotion);
    const uniqueEmotions = new Set(emotions);
    const stability = 1 - (uniqueEmotions.size / Math.max(1, moments.length));

    // Calculate trend (comparing recent to older)
    const half = Math.floor(moments.length / 2);
    const older = moments.slice(0, half);
    const recent = moments.slice(half);

    const olderPositive = older.filter((m) => PEAK_EMOTIONS.has(m.emotion)).length;
    const recentPositive = recent.filter((m) => PEAK_EMOTIONS.has(m.emotion)).length;

    let trend: "improving" | "stable" | "declining" = "stable";
    if (recentPositive > olderPositive + 1) trend = "improving";
    else if (recentPositive < olderPositive - 1) trend = "declining";

    return { overallMood, stability, trend };
  }, []);

  // Calculate patterns
  const calculatePatterns = useCallback((moments: EmotionalMoment[]): EmotionalMemoryState["patterns"] => {
    if (moments.length === 0) {
      return {
        dominantEmotion: "neutral",
        emotionVariety: 0,
        vulnerabilityCount: 0,
        peakCount: 0,
      };
    }

    // Count emotions
    const emotionCounts: Record<string, number> = {};
    moments.forEach((m) => {
      emotionCounts[m.emotion] = (emotionCounts[m.emotion] || 0) + 1;
    });

    // Find dominant
    let dominantEmotion = "neutral";
    let maxCount = 0;
    Object.entries(emotionCounts).forEach(([emotion, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantEmotion = emotion;
      }
    });

    // Calculate variety
    const uniqueEmotions = Object.keys(emotionCounts).length;
    const emotionVariety = Math.min(1, uniqueEmotions / 5);

    // Count special moments
    const vulnerabilityCount = moments.filter((m) => m.type === "vulnerability").length;
    const peakCount = moments.filter((m) =>
      m.type === "peak_joy" || m.type === "excitement"
    ).length;

    return { dominantEmotion, emotionVariety, vulnerabilityCount, peakCount };
  }, []);

  // Determine what to acknowledge
  const calculateAcknowledgment = useCallback((
    moments: EmotionalMoment[],
    currentTime: number
  ): EmotionalMemoryState["acknowledgment"] => {
    // Don't acknowledge too frequently
    if (currentTime - lastAcknowledgmentTime.current < 60000) { // 1 minute cooldown
      return { shouldAcknowledge: false, momentToAcknowledge: null, suggestedPhrase: null };
    }

    // Find most recent important moment not yet acknowledged
    const importantMoments = moments
      .filter((m) => m.importance > 0.5)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (importantMoments.length === 0) {
      return { shouldAcknowledge: false, momentToAcknowledge: null, suggestedPhrase: null };
    }

    const moment = importantMoments[0];

    // Generate acknowledgment phrase
    let phrase: string | null = null;
    switch (moment.type) {
      case "vulnerability":
        phrase = "Je sens que c'était important pour toi de partager ça";
        break;
      case "peak_joy":
        phrase = "J'aime te voir heureux comme ça";
        break;
      case "gratitude":
        phrase = "Ça me touche que tu me dises ça";
        break;
      case "stress":
        phrase = "Je suis là si tu veux en parler";
        break;
      case "sadness":
        phrase = "Je suis avec toi";
        break;
      default:
        phrase = null;
    }

    if (phrase) {
      lastAcknowledgmentTime.current = currentTime;
    }

    return {
      shouldAcknowledge: !!phrase,
      momentToAcknowledge: phrase ? moment : null,
      suggestedPhrase: phrase,
    };
  }, []);

  // Calculate visual hints
  const calculateVisualHints = useCallback((
    moments: EmotionalMoment[],
    patterns: EmotionalMemoryState["patterns"]
  ): EmotionalMemoryState["visualHints"] => {
    // Memory glow based on shared emotional moments
    const memoryGlow = Math.min(1, moments.length / 10);

    // Connection depth from vulnerability sharing
    const connectionDepth = Math.min(1, patterns.vulnerabilityCount * 0.2 + patterns.peakCount * 0.1);

    // Show memory particle when new important moment is captured
    const recentMoment = moments[moments.length - 1];
    const showMemoryParticle = recentMoment?.importance > 0.6 &&
      (Date.now() - recentMoment.timestamp) < 5000;

    return { memoryGlow, connectionDepth, showMemoryParticle };
  }, []);

  // Main update loop
  useEffect(() => {
    if (!enabled || !isConnected) {
      setState(getDefaultState());
      return;
    }

    const update = () => {
      const now = Date.now();
      const delta = (now - lastUpdateTime.current) / 1000;
      lastUpdateTime.current = now;

      // Detect emotion changes and significant moments
      const emotionChanged = currentEmotion !== lastEmotion.current;

      if (emotionChanged) {
        // Calculate duration of previous emotion
        const duration = emotionStartTime.current
          ? (now - emotionStartTime.current) / 1000
          : 0;

        // If the previous emotion was intense enough, create a moment
        if (emotionalIntensity > 0.4 && duration > 1) {
          const momentType = detectMomentType(lastEmotion.current, emotionalIntensity, userTranscript);
          const importance = calculateImportance(momentType, emotionalIntensity, duration);

          // Only store significant moments
          if (importance > 0.35) {
            const moment: EmotionalMoment = {
              id: `moment-${now}-${Math.random().toString(36).slice(2)}`,
              type: momentType,
              timestamp: now,
              emotion: lastEmotion.current,
              intensity: emotionalIntensity,
              context: {
                wasUserSpeaking: isUserSpeaking,
                approximateWords: extractKeyWords(userTranscript),
                duration,
              },
              importance,
            };

            momentBuffer.current.push(moment);

            // Keep only last 20 moments
            if (momentBuffer.current.length > 20) {
              momentBuffer.current.shift();
            }
          }
        }

        // Update tracking refs
        lastEmotion.current = currentEmotion;
        emotionStartTime.current = now;
        lastEmotionTime.current = now;
      }

      // Also capture current intense moments
      if (emotionalIntensity > 0.6 && emotionStartTime.current === null) {
        emotionStartTime.current = now;
      }

      // Throttle state updates to ~30fps (33ms) unless moments changed
      const momentsChanged = momentBuffer.current.length !== momentCountRef.current;
      const timeSinceLastUpdate = now - lastStateUpdateTime.current;

      if (momentsChanged || timeSinceLastUpdate > 33) {
        lastStateUpdateTime.current = now;
        momentCountRef.current = momentBuffer.current.length;

        // Calculate all state components
        const moments = [...momentBuffer.current];
        const temperature = calculateTemperature(moments);
        const patterns = calculatePatterns(moments);
        const acknowledgment = calculateAcknowledgment(moments, now);
        const visualHints = calculateVisualHints(moments, patterns);

        setState({
          recentMoments: moments,
          emotionalTemperature: temperature,
          patterns,
          acknowledgment,
          visualHints,
        });
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
    isConnected,
    currentEmotion,
    emotionalIntensity,
    isUserSpeaking,
    userTranscript,
    detectMomentType,
    extractKeyWords,
    calculateImportance,
    calculateTemperature,
    calculatePatterns,
    calculateAcknowledgment,
    calculateVisualHints,
  ]);

  return state;
}

function getDefaultState(): EmotionalMemoryState {
  return {
    recentMoments: [],
    emotionalTemperature: {
      overallMood: "neutral",
      stability: 0.5,
      trend: "stable",
    },
    patterns: {
      dominantEmotion: "neutral",
      emotionVariety: 0,
      vulnerabilityCount: 0,
      peakCount: 0,
    },
    acknowledgment: {
      shouldAcknowledge: false,
      momentToAcknowledge: null,
      suggestedPhrase: null,
    },
    visualHints: {
      memoryGlow: 0,
      connectionDepth: 0,
      showMemoryParticle: false,
    },
  };
}
