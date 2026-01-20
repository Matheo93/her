"use client";

/**
 * useEyeContact - Eye Contact Awareness System
 *
 * Creates the feeling that EVA is aware of your attention.
 * Based on research from Sesame's voice presence and Lepro Ami's eye tracking approach.
 *
 * Key behaviors:
 * - EVA maintains eye contact when you're engaged
 * - She looks away naturally when "thinking" (memory recall)
 * - Returns gaze when emotionally connecting
 * - Slight pupil dilation when making eye contact
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface EyeContactState {
  // Is the user "looking at" EVA? (mouse hover, screen focus)
  isUserWatching: boolean;

  // Is EVA making eye contact back?
  isEyeContactActive: boolean;

  // How long has mutual eye contact been held? (seconds)
  contactDuration: number;

  // Gaze target for avatar (normalized -1 to 1)
  gazeTarget: { x: number; y: number };

  // Pupil dilation amount (0-1, increases with emotional eye contact)
  pupilDilation: number;

  // Intimacy level (0-1, builds over sustained eye contact)
  intimacyLevel: number;
}

interface UseEyeContactOptions {
  // Is EVA currently speaking?
  isSpeaking: boolean;

  // Is EVA listening to user?
  isListening: boolean;

  // Current emotion for contextual gaze behavior
  emotion: string;

  // Container element to track mouse within
  containerRef: React.RefObject<HTMLElement | null>;

  // Is the app/tab focused?
  isAppFocused?: boolean;
}

export function useEyeContact({
  isSpeaking,
  isListening,
  emotion,
  containerRef,
  isAppFocused = true,
}: UseEyeContactOptions): EyeContactState {
  // Core state
  const [isUserWatching, setIsUserWatching] = useState(false);
  const [isEyeContactActive, setIsEyeContactActive] = useState(false);
  const [contactDuration, setContactDuration] = useState(0);
  const [gazeTarget, setGazeTarget] = useState({ x: 0, y: 0 });
  const [pupilDilation, setPupilDilation] = useState(0);
  const [intimacyLevel, setIntimacyLevel] = useState(0);

  // Refs for animation state
  const lastMousePos = useRef({ x: 0.5, y: 0.5 });
  const gazeBreakTimer = useRef<NodeJS.Timeout | null>(null);
  const contactStartTime = useRef<number | null>(null);
  const isLookingAway = useRef(false);
  const lookAwayTarget = useRef({ x: 0, y: 0 });
  const animationFrame = useRef<number | null>(null);

  // Natural gaze break - EVA occasionally looks away when thinking
  const scheduleGazeBreak = useCallback(() => {
    if (gazeBreakTimer.current) {
      clearTimeout(gazeBreakTimer.current);
    }

    // More frequent gaze breaks when thinking, less when listening intently
    const baseInterval = isListening ? 8000 : isSpeaking ? 5000 : 6000;
    const randomVariation = Math.random() * 4000 - 2000; // ±2 seconds
    const interval = baseInterval + randomVariation;

    gazeBreakTimer.current = setTimeout(() => {
      if (isUserWatching && !isLookingAway.current) {
        // Look away naturally - up-left for memory recall, up-right for visualization
        // This is a genuine human behavior during cognition
        const isMemoryRecall = Math.random() > 0.5;
        lookAwayTarget.current = {
          x: isMemoryRecall ? -0.3 : 0.3,
          y: 0.2 + Math.random() * 0.1, // Slightly upward
        };
        isLookingAway.current = true;

        // Return gaze after brief moment (0.5-1.5 seconds)
        const returnDelay = 500 + Math.random() * 1000;
        setTimeout(() => {
          isLookingAway.current = false;
        }, returnDelay);
      }

      // Schedule next break
      scheduleGazeBreak();
    }, interval);
  }, [isListening, isSpeaking, isUserWatching]);

  // Track if user is watching (mouse in container area)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseEnter = () => {
      setIsUserWatching(true);
      contactStartTime.current = Date.now();
    };

    const handleMouseLeave = () => {
      setIsUserWatching(false);
      contactStartTime.current = null;
      setContactDuration(0);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Normalize to 0-1 relative to container center
      const normX = (e.clientX - centerX) / (rect.width / 2);
      const normY = (centerY - e.clientY) / (rect.height / 2); // Inverted for natural feel

      lastMousePos.current = {
        x: Math.max(-1, Math.min(1, normX)),
        y: Math.max(-1, Math.min(1, normY)),
      };
    };

    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);
    container.addEventListener("mousemove", handleMouseMove);

    return () => {
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
      container.removeEventListener("mousemove", handleMouseMove);
    };
  }, [containerRef]);

  // Start gaze break scheduling when user watches
  useEffect(() => {
    if (isUserWatching) {
      scheduleGazeBreak();
    } else {
      if (gazeBreakTimer.current) {
        clearTimeout(gazeBreakTimer.current);
      }
    }

    return () => {
      if (gazeBreakTimer.current) {
        clearTimeout(gazeBreakTimer.current);
      }
    };
  }, [isUserWatching, scheduleGazeBreak]);

  // Animation loop for smooth gaze, pupil dilation, and intimacy
  useEffect(() => {
    const animate = () => {
      // Calculate target gaze position
      let targetX: number, targetY: number;

      if (isLookingAway.current) {
        // Looking away (thinking, recalling)
        targetX = lookAwayTarget.current.x;
        targetY = lookAwayTarget.current.y;
      } else if (isUserWatching && isAppFocused) {
        // Track user's mouse position with gentle damping
        // When listening, focus more on center (eye contact)
        const followStrength = isListening ? 0.3 : 0.6;
        targetX = lastMousePos.current.x * followStrength;
        targetY = lastMousePos.current.y * followStrength;
      } else {
        // Default idle gaze - slightly forward and down
        targetX = 0;
        targetY = -0.05;
      }

      // Smooth interpolation
      setGazeTarget((prev) => ({
        x: prev.x + (targetX - prev.x) * 0.1,
        y: prev.y + (targetY - prev.y) * 0.1,
      }));

      // Update eye contact state
      const makingEyeContact = isUserWatching && !isLookingAway.current && isAppFocused;
      setIsEyeContactActive(makingEyeContact);

      // Update contact duration
      if (makingEyeContact && contactStartTime.current) {
        const duration = (Date.now() - contactStartTime.current) / 1000;
        setContactDuration(duration);

        // Build intimacy over sustained eye contact (caps at 1.0)
        // Intimacy builds faster during emotional moments
        const emotionBoost = ["tenderness", "joy", "empathy"].includes(emotion) ? 1.5 : 1.0;
        const newIntimacy = Math.min(1, duration / 30 * emotionBoost); // ~30 seconds to full intimacy
        setIntimacyLevel(newIntimacy);
      } else {
        // Intimacy slowly decays when not making eye contact
        setIntimacyLevel((prev) => Math.max(0, prev - 0.002));
      }

      // Pupil dilation - dilates with eye contact and emotional connection
      // This is a real human response to attraction/interest
      const baseDialation = makingEyeContact ? 0.3 : 0.1;
      const emotionalDilation = ["tenderness", "joy", "excitement"].includes(emotion) ? 0.2 : 0;
      const intimacyDilation = intimacyLevel * 0.2;
      const targetDilation = Math.min(1, baseDialation + emotionalDilation + intimacyDilation);

      setPupilDilation((prev) => prev + (targetDilation - prev) * 0.05);

      animationFrame.current = requestAnimationFrame(animate);
    };

    animationFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [isUserWatching, isAppFocused, isListening, emotion, intimacyLevel]);

  return {
    isUserWatching,
    isEyeContactActive,
    contactDuration,
    gazeTarget,
    pupilDilation,
    intimacyLevel,
  };
}
