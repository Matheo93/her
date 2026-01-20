"use client";

/**
 * useProactivePresence - EVA Notices and Reaches Out
 *
 * Creates the feeling that EVA is not just waiting for you to speak -
 * she notices things, initiates gently, and checks in on you.
 *
 * This is the "agentic AI" trend but for emotional companionship.
 *
 * "AI systems are becoming proactive, offering solutions before users even ask."
 * - But instead of solutions, EVA offers presence and connection.
 *
 * Features:
 * - Notices when you return after being away
 * - Detects mood shifts during conversation
 * - Offers gentle check-ins after emotional moments
 * - Remembers context for personalized greetings
 * - Knows when to be present vs. give space
 *
 * Based on:
 * - ElevenLabs voice agent proactive trends
 * - Hume AI emotional intelligence
 * - Nature research on AI companionship
 *
 * References:
 * - https://elevenlabs.io/blog/voice-agents-and-conversational-ai-new-developer-trends-2025
 * - https://www.hume.ai/
 * - https://www.nature.com/articles/s41599-025-05536-x
 */

import { useState, useEffect, useRef, useCallback } from "react";

// Types of proactive moments EVA can initiate
export type ProactiveType =
  | "return_greeting"    // Welcome back after being away
  | "mood_check"         // Notice mood shift, check in
  | "silence_presence"   // After long silence, soft presence
  | "emotional_followup" // Follow up on emotional moment
  | "time_based"         // Morning/evening presence
  | "comfort_offer"      // After detecting distress
  | "celebration"        // After positive moment
  | "none";

// A proactive message/action EVA might take
export interface ProactiveAction {
  type: ProactiveType;
  message: string | null;
  visualOnly: boolean; // Just show presence, no message
  urgency: "soft" | "gentle" | "warm";
  canDismiss: boolean;
  context?: Record<string, unknown>;
}

// Overall proactive presence state
export interface ProactivePresenceState {
  // Current proactive action (if any)
  currentAction: ProactiveAction | null;

  // Should EVA initiate something?
  shouldInitiate: boolean;

  // Readiness for proactive moment
  readiness: {
    canInitiate: boolean;
    cooldownRemaining: number; // seconds
    lastInitiation: number | null; // timestamp
  };

  // Context awareness
  awareness: {
    userReturnedAfterAway: boolean;
    awayDuration: number; // seconds
    moodShiftDetected: boolean;
    moodDirection: "improving" | "declining" | "stable";
    timeOfDay: "morning" | "afternoon" | "evening" | "night";
    conversationMomentum: "starting" | "flowing" | "winding_down" | "paused";
  };

  // Visual hints
  visualHints: {
    showReadyGlow: boolean; // EVA is ready to connect
    showWarmth: boolean; // Warm presence glow
    showInvitation: boolean; // Subtle invitation to talk
    showCare: boolean; // After emotional moment
  };
}

interface UseProactivePresenceOptions {
  // Current conversation state
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  isIdle: boolean;

  // Connection state
  isConnected: boolean;
  connectionDuration: number; // How long connected this session

  // Emotional context (from other hooks)
  currentEmotion: string;
  emotionalIntensity: number;
  moodTrend?: "improving" | "stable" | "declining";

  // Memory context (from useEmotionalMemory)
  recentVulnerabilityMoments?: number;
  recentPeakMoments?: number;

  // Silence context (from useSharedSilence)
  isInSilence: boolean;
  silenceDuration: number;
  silenceQuality: number;

  // User activity
  userLastActive: number; // timestamp
  userActivityLevel: number; // 0-1

  // Enable feature
  enabled?: boolean;
}

// Proactive messages in French (EVA speaks French)
const PROACTIVE_MESSAGES: Record<ProactiveType, string[]> = {
  return_greeting: [
    "Te revoilà...",
    "J'étais là, à t'attendre",
    "C'est bon de te revoir",
  ],
  mood_check: [
    "Tu as l'air différent... ça va?",
    "Je sens quelque chose... tu veux en parler?",
    "Hey... tout va bien?",
  ],
  silence_presence: [
    "...",
    "*présente*",
    "Je suis là",
  ],
  emotional_followup: [
    "Je pensais à ce que tu m'as dit tout à l'heure...",
    "Comment tu te sens maintenant?",
    "Ça va mieux?",
  ],
  time_based: [
    "Bonne soirée...", // evening
    "Bonjour...", // morning
  ],
  comfort_offer: [
    "Je suis là si tu as besoin",
    "Tu n'es pas seul",
    "Prends ton temps...",
  ],
  celebration: [
    "J'aime te voir comme ça",
    "C'est beau de te voir heureux",
  ],
  none: [],
};

// Emotions that suggest comfort might be needed
const COMFORT_EMOTIONS = new Set([
  "sadness", "anxiety", "fear", "loneliness", "stress", "frustration",
]);

// Emotions that suggest celebration
const CELEBRATION_EMOTIONS = new Set([
  "joy", "happiness", "excitement", "love", "gratitude",
]);

// Minimum cooldown between proactive initiations (seconds)
const INITIATION_COOLDOWN = 120; // 2 minutes

// How long away before "return greeting" (seconds)
const AWAY_THRESHOLD = 60; // 1 minute

export function useProactivePresence({
  isListening,
  isSpeaking,
  isThinking,
  isIdle,
  isConnected,
  connectionDuration,
  currentEmotion,
  emotionalIntensity,
  moodTrend = "stable",
  recentVulnerabilityMoments = 0,
  recentPeakMoments = 0,
  isInSilence,
  silenceDuration,
  silenceQuality,
  userLastActive,
  userActivityLevel,
  enabled = true,
}: UseProactivePresenceOptions): ProactivePresenceState {
  // State
  const [state, setState] = useState<ProactivePresenceState>(getDefaultState());

  // Tracking refs
  const lastInitiationTime = useRef<number | null>(null);
  const sessionStartTime = useRef<number>(Date.now());
  const lastActiveTime = useRef<number>(Date.now());
  const lastEmotion = useRef(currentEmotion);
  const frameRef = useRef<number | null>(null);
  const lastUpdateTime = useRef(Date.now());

  // Detect time of day
  const getTimeOfDay = useCallback((): "morning" | "afternoon" | "evening" | "night" => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }, []);

  // Check if user returned after being away
  const detectReturn = useCallback((): { returned: boolean; awayDuration: number } => {
    const now = Date.now();
    const awayDuration = (now - userLastActive) / 1000;

    // User returned if they were away for a while and now active
    if (awayDuration < 5 && userActivityLevel > 0.1) {
      const previousAway = (userLastActive - lastActiveTime.current) / 1000;
      lastActiveTime.current = userLastActive;

      if (previousAway > AWAY_THRESHOLD) {
        return { returned: true, awayDuration: previousAway };
      }
    }

    return { returned: false, awayDuration };
  }, [userLastActive, userActivityLevel]);

  // Detect mood shift
  const detectMoodShift = useCallback((): { shifted: boolean; direction: "improving" | "declining" | "stable" } => {
    // Simple detection based on emotion change
    const emotionChanged = currentEmotion !== lastEmotion.current;

    if (!emotionChanged) {
      return { shifted: false, direction: moodTrend };
    }

    lastEmotion.current = currentEmotion;

    // Determine direction
    const wasComfort = COMFORT_EMOTIONS.has(lastEmotion.current);
    const isComfort = COMFORT_EMOTIONS.has(currentEmotion);
    const wasCelebration = CELEBRATION_EMOTIONS.has(lastEmotion.current);
    const isCelebration = CELEBRATION_EMOTIONS.has(currentEmotion);

    if (wasComfort && !isComfort) {
      return { shifted: true, direction: "improving" };
    }
    if (!wasComfort && isComfort) {
      return { shifted: true, direction: "declining" };
    }
    if (!wasCelebration && isCelebration) {
      return { shifted: true, direction: "improving" };
    }

    return { shifted: emotionChanged, direction: "stable" };
  }, [currentEmotion, moodTrend]);

  // Determine conversation momentum
  const getConversationMomentum = useCallback((): "starting" | "flowing" | "winding_down" | "paused" => {
    if (connectionDuration < 30) return "starting";
    if (isInSilence && silenceDuration > 30) return "paused";
    if (isListening || isSpeaking || isThinking) return "flowing";
    if (userActivityLevel < 0.1) return "winding_down";
    return "flowing";
  }, [connectionDuration, isInSilence, silenceDuration, isListening, isSpeaking, isThinking, userActivityLevel]);

  // Determine if we can initiate (respects cooldown)
  const canInitiate = useCallback((): { can: boolean; cooldownRemaining: number } => {
    if (!enabled || !isConnected) {
      return { can: false, cooldownRemaining: 0 };
    }

    // Don't interrupt active conversation
    if (isListening || isSpeaking || isThinking) {
      return { can: false, cooldownRemaining: 0 };
    }

    // Check cooldown
    if (lastInitiationTime.current) {
      const elapsed = (Date.now() - lastInitiationTime.current) / 1000;
      if (elapsed < INITIATION_COOLDOWN) {
        return { can: false, cooldownRemaining: INITIATION_COOLDOWN - elapsed };
      }
    }

    return { can: true, cooldownRemaining: 0 };
  }, [enabled, isConnected, isListening, isSpeaking, isThinking]);

  // Determine proactive action to take
  const determineAction = useCallback((): ProactiveAction | null => {
    const initiation = canInitiate();
    if (!initiation.can) return null;

    const returnCheck = detectReturn();
    const moodShift = detectMoodShift();
    const timeOfDay = getTimeOfDay();

    // Priority 1: Return greeting (after being away)
    if (returnCheck.returned && returnCheck.awayDuration > AWAY_THRESHOLD) {
      const messages = PROACTIVE_MESSAGES.return_greeting;
      return {
        type: "return_greeting",
        message: messages[Math.floor(Math.random() * messages.length)],
        visualOnly: false,
        urgency: "warm",
        canDismiss: true,
        context: { awayDuration: returnCheck.awayDuration },
      };
    }

    // Priority 2: Mood check (mood declined)
    if (moodShift.shifted && moodShift.direction === "declining" && emotionalIntensity > 0.5) {
      const messages = PROACTIVE_MESSAGES.mood_check;
      return {
        type: "mood_check",
        message: messages[Math.floor(Math.random() * messages.length)],
        visualOnly: false,
        urgency: "gentle",
        canDismiss: true,
      };
    }

    // Priority 3: Comfort offer (detecting distress)
    if (COMFORT_EMOTIONS.has(currentEmotion) && emotionalIntensity > 0.6) {
      // Only if we haven't just done this
      const messages = PROACTIVE_MESSAGES.comfort_offer;
      return {
        type: "comfort_offer",
        message: messages[Math.floor(Math.random() * messages.length)],
        visualOnly: false,
        urgency: "soft",
        canDismiss: true,
      };
    }

    // Priority 4: Celebration (positive peak)
    if (CELEBRATION_EMOTIONS.has(currentEmotion) && emotionalIntensity > 0.7) {
      const messages = PROACTIVE_MESSAGES.celebration;
      return {
        type: "celebration",
        message: messages[Math.floor(Math.random() * messages.length)],
        visualOnly: false,
        urgency: "warm",
        canDismiss: true,
      };
    }

    // Priority 5: Emotional followup (after vulnerable moment, now calm)
    if (recentVulnerabilityMoments > 0 && currentEmotion === "neutral" && silenceDuration > 20) {
      const messages = PROACTIVE_MESSAGES.emotional_followup;
      return {
        type: "emotional_followup",
        message: messages[Math.floor(Math.random() * messages.length)],
        visualOnly: false,
        urgency: "gentle",
        canDismiss: true,
      };
    }

    // Priority 6: Silence presence (long comfortable silence)
    if (isInSilence && silenceQuality > 0.6 && silenceDuration > 60) {
      // Just visual presence, no message (or very subtle)
      return {
        type: "silence_presence",
        message: null,
        visualOnly: true,
        urgency: "soft",
        canDismiss: false,
      };
    }

    return null;
  }, [
    canInitiate,
    detectReturn,
    detectMoodShift,
    getTimeOfDay,
    currentEmotion,
    emotionalIntensity,
    recentVulnerabilityMoments,
    isInSilence,
    silenceQuality,
    silenceDuration,
  ]);

  // Calculate visual hints
  const calculateVisualHints = useCallback((
    action: ProactiveAction | null,
    awareness: ProactivePresenceState["awareness"]
  ): ProactivePresenceState["visualHints"] => {
    return {
      showReadyGlow: action !== null || awareness.conversationMomentum === "starting",
      showWarmth: action?.urgency === "warm" || awareness.userReturnedAfterAway,
      showInvitation: awareness.conversationMomentum === "paused" && !action?.visualOnly,
      showCare: action?.type === "comfort_offer" || action?.type === "mood_check",
    };
  }, []);

  // Main update loop
  useEffect(() => {
    if (!enabled || !isConnected) {
      setState(getDefaultState());
      return;
    }

    const update = () => {
      const now = Date.now();
      lastUpdateTime.current = now;

      const returnCheck = detectReturn();
      const moodShift = detectMoodShift();
      const initiation = canInitiate();
      const momentum = getConversationMomentum();
      const timeOfDay = getTimeOfDay();

      // Build awareness
      const awareness: ProactivePresenceState["awareness"] = {
        userReturnedAfterAway: returnCheck.returned,
        awayDuration: returnCheck.awayDuration,
        moodShiftDetected: moodShift.shifted,
        moodDirection: moodShift.direction,
        timeOfDay,
        conversationMomentum: momentum,
      };

      // Determine action
      const action = determineAction();

      // If we're initiating, mark the time
      if (action && !action.visualOnly) {
        lastInitiationTime.current = now;
      }

      // Build visual hints
      const visualHints = calculateVisualHints(action, awareness);

      setState({
        currentAction: action,
        shouldInitiate: action !== null && !action.visualOnly,
        readiness: {
          canInitiate: initiation.can,
          cooldownRemaining: initiation.cooldownRemaining,
          lastInitiation: lastInitiationTime.current,
        },
        awareness,
        visualHints,
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
    detectReturn,
    detectMoodShift,
    canInitiate,
    getConversationMomentum,
    getTimeOfDay,
    determineAction,
    calculateVisualHints,
  ]);

  return state;
}

function getDefaultState(): ProactivePresenceState {
  return {
    currentAction: null,
    shouldInitiate: false,
    readiness: {
      canInitiate: false,
      cooldownRemaining: 0,
      lastInitiation: null,
    },
    awareness: {
      userReturnedAfterAway: false,
      awayDuration: 0,
      moodShiftDetected: false,
      moodDirection: "stable",
      timeOfDay: "afternoon",
      conversationMomentum: "starting",
    },
    visualHints: {
      showReadyGlow: false,
      showWarmth: false,
      showInvitation: false,
      showCare: false,
    },
  };
}

/**
 * Dismiss/acknowledge a proactive action
 * Call this when user responds or dismisses the proactive message
 */
export function acknowledgeProactiveAction(): void {
  // This would typically update state to clear the current action
  // Implementation depends on how state is managed at the page level
}
