"use client";

/**
 * useAvatarState - Avatar Visual State Management
 *
 * Manages avatar visual state including speaking, listening, idle,
 * and transition states with smooth animations.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// Avatar activity states
export type AvatarActivity =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "transitioning";

// Avatar mood/emotion states
export type AvatarMood =
  | "neutral"
  | "happy"
  | "curious"
  | "concerned"
  | "excited"
  | "thoughtful"
  | "empathetic";

// Avatar attention states
export type AvatarAttention =
  | "focused"      // Looking at user
  | "glancing"     // Brief look away
  | "distracted"   // Looking away longer
  | "returning";   // Coming back to focus

interface AvatarStateData {
  // Current activity
  activity: AvatarActivity;

  // Current mood/emotion
  mood: AvatarMood;

  // Mood intensity (0-1)
  moodIntensity: number;

  // Attention state
  attention: AvatarAttention;

  // Speaking intensity (0-1, volume-based)
  speakingIntensity: number;

  // Listening intensity (0-1, engagement-based)
  listeningIntensity: number;

  // Whether avatar is in a transition
  isTransitioning: boolean;

  // Current transition progress (0-1)
  transitionProgress: number;

  // Time in current state (ms)
  stateTime: number;

  // Previous activity (for transitions)
  previousActivity: AvatarActivity | null;
}

interface AvatarStateControls {
  // Set activity state
  setActivity: (activity: AvatarActivity) => void;

  // Set mood with optional intensity
  setMood: (mood: AvatarMood, intensity?: number) => void;

  // Set attention state
  setAttention: (attention: AvatarAttention) => void;

  // Update speaking intensity (call continuously with audio level)
  updateSpeakingIntensity: (level: number) => void;

  // Update listening intensity
  updateListeningIntensity: (level: number) => void;

  // Start speaking
  startSpeaking: () => void;

  // Stop speaking
  stopSpeaking: () => void;

  // Start listening
  startListening: () => void;

  // Stop listening
  stopListening: () => void;

  // Start thinking
  startThinking: () => void;

  // Go idle
  goIdle: () => void;

  // Reset to initial state
  reset: () => void;
}

interface UseAvatarStateOptions {
  // Initial activity
  initialActivity?: AvatarActivity;

  // Initial mood
  initialMood?: AvatarMood;

  // Transition duration (ms)
  transitionDuration?: number;

  // Auto-idle timeout (ms) - go idle after no activity
  autoIdleTimeout?: number;

  // Callback when activity changes
  onActivityChange?: (activity: AvatarActivity, previous: AvatarActivity) => void;

  // Callback when mood changes
  onMoodChange?: (mood: AvatarMood) => void;
}

interface UseAvatarStateResult {
  state: AvatarStateData;
  controls: AvatarStateControls;
}

export function useAvatarState(
  options: UseAvatarStateOptions = {}
): UseAvatarStateResult {
  const {
    initialActivity = "idle",
    initialMood = "neutral",
    transitionDuration = 300,
    autoIdleTimeout = 30000,
    onActivityChange,
    onMoodChange,
  } = options;

  // Core state
  const [activity, setActivityState] = useState<AvatarActivity>(initialActivity);
  const [previousActivity, setPreviousActivity] = useState<AvatarActivity | null>(null);
  const [mood, setMoodState] = useState<AvatarMood>(initialMood);
  const [moodIntensity, setMoodIntensity] = useState(0.5);
  const [attention, setAttentionState] = useState<AvatarAttention>("focused");
  const [speakingIntensity, setSpeakingIntensity] = useState(0);
  const [listeningIntensity, setListeningIntensity] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(1);
  const [stateTime, setStateTime] = useState(0);

  // Refs for timing
  const stateStartTimeRef = useRef<number>(Date.now());
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateTimeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update state time
  useEffect(() => {
    stateStartTimeRef.current = Date.now();
    setStateTime(0);

    stateTimeIntervalRef.current = setInterval(() => {
      setStateTime(Date.now() - stateStartTimeRef.current);
    }, 100);

    return () => {
      if (stateTimeIntervalRef.current) {
        clearInterval(stateTimeIntervalRef.current);
      }
    };
  }, [activity]);

  // Set activity with transition
  const setActivity = useCallback(
    (newActivity: AvatarActivity) => {
      if (newActivity === activity) return;

      // Clear any pending transitions
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }

      // Start transition
      setPreviousActivity(activity);
      setIsTransitioning(true);
      setTransitionProgress(0);

      // Animate transition
      const startTime = Date.now();
      const animateTransition = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / transitionDuration, 1);
        setTransitionProgress(progress);

        if (progress < 1) {
          requestAnimationFrame(animateTransition);
        } else {
          setIsTransitioning(false);
          setActivityState(newActivity);
          onActivityChange?.(newActivity, activity);
        }
      };

      requestAnimationFrame(animateTransition);

      // Reset auto-idle timer
      if (autoIdleTimeoutRef.current) {
        clearTimeout(autoIdleTimeoutRef.current);
      }
      if (newActivity !== "idle" && autoIdleTimeout > 0) {
        autoIdleTimeoutRef.current = setTimeout(() => {
          setActivityState("idle");
        }, autoIdleTimeout);
      }
    },
    [activity, transitionDuration, autoIdleTimeout, onActivityChange]
  );

  // Set mood
  const setMood = useCallback(
    (newMood: AvatarMood, intensity: number = 0.5) => {
      if (newMood !== mood) {
        setMoodState(newMood);
        onMoodChange?.(newMood);
      }
      setMoodIntensity(Math.max(0, Math.min(1, intensity)));
    },
    [mood, onMoodChange]
  );

  // Set attention
  const setAttention = useCallback((newAttention: AvatarAttention) => {
    setAttentionState(newAttention);
  }, []);

  // Update speaking intensity (smoothed)
  const updateSpeakingIntensity = useCallback((level: number) => {
    setSpeakingIntensity((prev) => {
      const target = Math.max(0, Math.min(1, level));
      // Smooth transition
      return prev + (target - prev) * 0.3;
    });
  }, []);

  // Update listening intensity (smoothed)
  const updateListeningIntensity = useCallback((level: number) => {
    setListeningIntensity((prev) => {
      const target = Math.max(0, Math.min(1, level));
      return prev + (target - prev) * 0.3;
    });
  }, []);

  // Convenience methods
  const startSpeaking = useCallback(() => {
    setActivity("speaking");
    setSpeakingIntensity(0.5);
  }, [setActivity]);

  const stopSpeaking = useCallback(() => {
    setSpeakingIntensity(0);
    setActivity("idle");
  }, [setActivity]);

  const startListening = useCallback(() => {
    setActivity("listening");
    setListeningIntensity(0.5);
  }, [setActivity]);

  const stopListening = useCallback(() => {
    setListeningIntensity(0);
  }, []);

  const startThinking = useCallback(() => {
    setActivity("thinking");
  }, [setActivity]);

  const goIdle = useCallback(() => {
    setActivity("idle");
    setSpeakingIntensity(0);
    setListeningIntensity(0);
  }, [setActivity]);

  const reset = useCallback(() => {
    setActivityState(initialActivity);
    setPreviousActivity(null);
    setMoodState(initialMood);
    setMoodIntensity(0.5);
    setAttentionState("focused");
    setSpeakingIntensity(0);
    setListeningIntensity(0);
    setIsTransitioning(false);
    setTransitionProgress(1);
    stateStartTimeRef.current = Date.now();
    setStateTime(0);
  }, [initialActivity, initialMood]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      if (autoIdleTimeoutRef.current) {
        clearTimeout(autoIdleTimeoutRef.current);
      }
      if (stateTimeIntervalRef.current) {
        clearInterval(stateTimeIntervalRef.current);
      }
    };
  }, []);

  // Build state object
  const state = useMemo(
    (): AvatarStateData => ({
      activity,
      mood,
      moodIntensity,
      attention,
      speakingIntensity,
      listeningIntensity,
      isTransitioning,
      transitionProgress,
      stateTime,
      previousActivity,
    }),
    [
      activity,
      mood,
      moodIntensity,
      attention,
      speakingIntensity,
      listeningIntensity,
      isTransitioning,
      transitionProgress,
      stateTime,
      previousActivity,
    ]
  );

  // Build controls object
  const controls = useMemo(
    (): AvatarStateControls => ({
      setActivity,
      setMood,
      setAttention,
      updateSpeakingIntensity,
      updateListeningIntensity,
      startSpeaking,
      stopSpeaking,
      startListening,
      stopListening,
      startThinking,
      goIdle,
      reset,
    }),
    [
      setActivity,
      setMood,
      setAttention,
      updateSpeakingIntensity,
      updateListeningIntensity,
      startSpeaking,
      stopSpeaking,
      startListening,
      stopListening,
      startThinking,
      goIdle,
      reset,
    ]
  );

  return { state, controls };
}

/**
 * Hook for avatar speaking state driven by audio
 */
export function useAvatarSpeaking(audioLevel: number = 0): {
  isSpeaking: boolean;
  intensity: number;
} {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [intensity, setIntensity] = useState(0);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Update intensity smoothly
    setIntensity((prev) => prev + (audioLevel - prev) * 0.3);

    // Detect speaking
    if (audioLevel > 0.1) {
      setIsSpeaking(true);
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
    } else if (isSpeaking && !silenceTimeoutRef.current) {
      // Wait a bit before declaring silence
      silenceTimeoutRef.current = setTimeout(() => {
        setIsSpeaking(false);
        silenceTimeoutRef.current = null;
      }, 200);
    }

    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, [audioLevel, isSpeaking]);

  return { isSpeaking, intensity };
}

/**
 * Hook for avatar mood transitions
 */
export function useAvatarMoodTransition(
  targetMood: AvatarMood,
  transitionDuration: number = 500
): {
  currentMood: AvatarMood;
  blendFactor: number;
  isTransitioning: boolean;
} {
  const [currentMood, setCurrentMood] = useState(targetMood);
  const [previousMood, setPreviousMood] = useState(targetMood);
  const [blendFactor, setBlendFactor] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (targetMood === currentMood) return;

    setPreviousMood(currentMood);
    setIsTransitioning(true);
    setBlendFactor(0);

    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / transitionDuration, 1);

      // Ease out
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setBlendFactor(easedProgress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCurrentMood(targetMood);
        setIsTransitioning(false);
      }
    };

    requestAnimationFrame(animate);
  }, [targetMood, currentMood, transitionDuration]);

  return { currentMood, blendFactor, isTransitioning };
}

/**
 * Hook for avatar idle animations timing
 */
export function useAvatarIdleAnimations(
  isIdle: boolean,
  options: {
    blinkInterval?: [number, number]; // [min, max] ms
    glanceInterval?: [number, number];
    microMovementInterval?: [number, number];
  } = {}
): {
  shouldBlink: boolean;
  shouldGlance: boolean;
  shouldMicroMove: boolean;
} {
  const {
    blinkInterval = [2000, 6000],
    glanceInterval = [5000, 15000],
    microMovementInterval = [3000, 8000],
  } = options;

  const [shouldBlink, setShouldBlink] = useState(false);
  const [shouldGlance, setShouldGlance] = useState(false);
  const [shouldMicroMove, setShouldMicroMove] = useState(false);

  const blinkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const glanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const microMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Random interval helper
  const randomInterval = (range: [number, number]): number => {
    return range[0] + Math.random() * (range[1] - range[0]);
  };

  useEffect(() => {
    if (!isIdle) {
      setShouldBlink(false);
      setShouldGlance(false);
      setShouldMicroMove(false);
      return;
    }

    // Blink scheduling
    const scheduleBlink = () => {
      blinkTimeoutRef.current = setTimeout(() => {
        setShouldBlink(true);
        setTimeout(() => setShouldBlink(false), 150);
        scheduleBlink();
      }, randomInterval(blinkInterval));
    };

    // Glance scheduling
    const scheduleGlance = () => {
      glanceTimeoutRef.current = setTimeout(() => {
        setShouldGlance(true);
        setTimeout(() => setShouldGlance(false), 500);
        scheduleGlance();
      }, randomInterval(glanceInterval));
    };

    // Micro movement scheduling
    const scheduleMicroMove = () => {
      microMoveTimeoutRef.current = setTimeout(() => {
        setShouldMicroMove(true);
        setTimeout(() => setShouldMicroMove(false), 200);
        scheduleMicroMove();
      }, randomInterval(microMovementInterval));
    };

    scheduleBlink();
    scheduleGlance();
    scheduleMicroMove();

    return () => {
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
      if (glanceTimeoutRef.current) clearTimeout(glanceTimeoutRef.current);
      if (microMoveTimeoutRef.current) clearTimeout(microMoveTimeoutRef.current);
    };
  }, [isIdle, blinkInterval, glanceInterval, microMovementInterval]);

  return { shouldBlink, shouldGlance, shouldMicroMove };
}
