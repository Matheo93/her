"use client";

/**
 * useAvatarEyeTracking - Eye Gaze Following System
 *
 * Tracks cursor/touch position and generates natural eye gaze animations.
 * Includes saccades, smooth pursuit, and natural gaze behaviors.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// Gaze target types
export type GazeTarget =
  | "user"         // Look at user/camera
  | "cursor"       // Follow cursor/touch
  | "point"        // Look at specific point
  | "random"       // Random gaze points
  | "away"         // Look away
  | "down"         // Look down (thinking)
  | "up";          // Look up

interface GazeState {
  // Eye rotation values (normalized -1 to 1)
  eyeRotation: {
    horizontal: number;  // Left/right (-1 = left, 1 = right)
    vertical: number;    // Up/down (-1 = down, 1 = up)
  };

  // Head rotation to follow gaze (subtle)
  headRotation: {
    yaw: number;        // Left/right (degrees)
    pitch: number;      // Up/down (degrees)
  };

  // Current gaze target type
  targetType: GazeTarget;

  // Whether eyes are currently moving
  isMoving: boolean;

  // Time since last major gaze shift
  timeSinceShift: number;

  // Pupil dilation (0-1, affected by interest/light)
  pupilDilation: number;

  // Eyelid position (0=closed, 1=open, can go >1 for wide)
  eyelidOpen: number;
}

interface GazeControls {
  // Look at specific point (normalized 0-1 screen coords)
  lookAt: (x: number, y: number) => void;

  // Look at user/camera
  lookAtUser: () => void;

  // Start following cursor
  followCursor: (enabled: boolean) => void;

  // Look away (with optional direction)
  lookAway: (direction?: "left" | "right" | "up" | "down") => void;

  // Set gaze target type
  setTarget: (target: GazeTarget) => void;

  // Trigger a blink
  blink: () => void;

  // Trigger double blink
  doubleBlink: () => void;

  // Set pupil dilation
  setPupilDilation: (value: number) => void;

  // Reset to default
  reset: () => void;
}

interface UseAvatarEyeTrackingOptions {
  // Initial gaze target
  initialTarget?: GazeTarget;

  // Eye movement speed (degrees per second)
  eyeSpeed?: number;

  // Head follow amount (0-1, how much head follows eyes)
  headFollowAmount?: number;

  // Whether to add natural micro-movements
  addMicroMovements?: boolean;

  // Whether to auto-blink
  autoBlink?: boolean;

  // Blink interval range [min, max] ms
  blinkInterval?: [number, number];

  // Container element for cursor tracking (null for window)
  containerRef?: React.RefObject<HTMLElement>;

  // Callback when gaze shifts
  onGazeShift?: (target: GazeTarget) => void;
}

interface UseAvatarEyeTrackingResult {
  state: GazeState;
  controls: GazeControls;
}

export function useAvatarEyeTracking(
  options: UseAvatarEyeTrackingOptions = {}
): UseAvatarEyeTrackingResult {
  const {
    initialTarget = "user",
    eyeSpeed = 300,
    headFollowAmount = 0.3,
    addMicroMovements = true,
    autoBlink = true,
    blinkInterval = [2500, 6000],
    containerRef,
    onGazeShift,
  } = options;

  // State
  const [targetType, setTargetType] = useState<GazeTarget>(initialTarget);
  const [targetPosition, setTargetPosition] = useState({ x: 0.5, y: 0.5 });
  const [currentPosition, setCurrentPosition] = useState({ x: 0.5, y: 0.5 });
  const [isFollowingCursor, setIsFollowingCursor] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [pupilDilation, setPupilDilationState] = useState(0.5);
  const [eyelidOpen, setEyelidOpen] = useState(1);
  const [lastShiftTime, setLastShiftTime] = useState(Date.now());

  // Refs
  const animationFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const blinkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const microMovementRef = useRef({ x: 0, y: 0 });

  // Convert position to eye/head rotation
  const positionToRotation = useCallback(
    (pos: { x: number; y: number }) => {
      // Eye rotation: map 0-1 to -1 to 1
      const eyeHorizontal = (pos.x - 0.5) * 2;
      const eyeVertical = -(pos.y - 0.5) * 2; // Invert Y

      // Clamp to realistic eye movement range
      const clampedEyeH = Math.max(-0.8, Math.min(0.8, eyeHorizontal));
      const clampedEyeV = Math.max(-0.6, Math.min(0.6, eyeVertical));

      // Head rotation follows eyes with reduced amount
      const headYaw = clampedEyeH * 15 * headFollowAmount;
      const headPitch = clampedEyeV * 10 * headFollowAmount;

      return {
        eyeRotation: { horizontal: clampedEyeH, vertical: clampedEyeV },
        headRotation: { yaw: headYaw, pitch: headPitch },
      };
    },
    [headFollowAmount]
  );

  // Smooth movement animation
  const animate = useCallback(
    (timestamp: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      }

      const deltaTime = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      // Calculate movement speed (normalized per second)
      const speedFactor = eyeSpeed / 100 * deltaTime;

      setCurrentPosition((prev) => {
        const dx = targetPosition.x - prev.x;
        const dy = targetPosition.y - prev.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if we've arrived
        if (distance < 0.01) {
          setIsMoving(false);
          return targetPosition;
        }

        setIsMoving(true);

        // Smooth interpolation with easing
        const step = Math.min(speedFactor, distance);
        const ratio = step / distance;

        let newX = prev.x + dx * ratio;
        let newY = prev.y + dy * ratio;

        // Add micro-movements for natural feel
        if (addMicroMovements && !isMoving) {
          microMovementRef.current = {
            x: (Math.random() - 0.5) * 0.01,
            y: (Math.random() - 0.5) * 0.01,
          };
        }

        newX += microMovementRef.current.x;
        newY += microMovementRef.current.y;

        return { x: newX, y: newY };
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [targetPosition, eyeSpeed, addMicroMovements, isMoving]
  );

  // Start animation loop
  useEffect(() => {
    lastTimeRef.current = 0;
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animate]);

  // Cursor tracking
  useEffect(() => {
    if (!isFollowingCursor) return;

    const handleMove = (clientX: number, clientY: number) => {
      let x: number, y: number;

      if (containerRef?.current) {
        const rect = containerRef.current.getBoundingClientRect();
        x = (clientX - rect.left) / rect.width;
        y = (clientY - rect.top) / rect.height;
      } else {
        x = clientX / window.innerWidth;
        y = clientY / window.innerHeight;
      }

      setTargetPosition({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [isFollowingCursor, containerRef]);

  // Auto-blink
  useEffect(() => {
    if (!autoBlink) return;

    const scheduleBlink = () => {
      const delay = blinkInterval[0] + Math.random() * (blinkInterval[1] - blinkInterval[0]);

      blinkTimeoutRef.current = setTimeout(() => {
        // Quick blink
        setEyelidOpen(0);
        setTimeout(() => setEyelidOpen(1), 150);

        // Occasionally double-blink
        if (Math.random() < 0.2) {
          setTimeout(() => {
            setEyelidOpen(0);
            setTimeout(() => setEyelidOpen(1), 150);
          }, 200);
        }

        scheduleBlink();
      }, delay);
    };

    scheduleBlink();

    return () => {
      if (blinkTimeoutRef.current) {
        clearTimeout(blinkTimeoutRef.current);
      }
    };
  }, [autoBlink, blinkInterval]);

  // Random gaze target
  useEffect(() => {
    if (targetType !== "random") return;

    const changeGaze = () => {
      setTargetPosition({
        x: 0.2 + Math.random() * 0.6,
        y: 0.3 + Math.random() * 0.4,
      });
    };

    changeGaze();
    const interval = setInterval(changeGaze, 2000 + Math.random() * 3000);

    return () => clearInterval(interval);
  }, [targetType]);

  // Preset gaze positions
  useEffect(() => {
    switch (targetType) {
      case "user":
        setTargetPosition({ x: 0.5, y: 0.45 });
        break;
      case "away":
        setTargetPosition({ x: Math.random() < 0.5 ? 0.1 : 0.9, y: 0.5 });
        break;
      case "down":
        setTargetPosition({ x: 0.5, y: 0.8 });
        break;
      case "up":
        setTargetPosition({ x: 0.5, y: 0.2 });
        break;
      case "cursor":
        setIsFollowingCursor(true);
        break;
      default:
        break;
    }

    if (targetType !== "cursor") {
      setIsFollowingCursor(false);
    }

    setLastShiftTime(Date.now());
    onGazeShift?.(targetType);
  }, [targetType, onGazeShift]);

  // Calculate current state
  const state = useMemo((): GazeState => {
    const { eyeRotation, headRotation } = positionToRotation(currentPosition);

    return {
      eyeRotation,
      headRotation,
      targetType,
      isMoving,
      timeSinceShift: Date.now() - lastShiftTime,
      pupilDilation,
      eyelidOpen,
    };
  }, [currentPosition, positionToRotation, targetType, isMoving, lastShiftTime, pupilDilation, eyelidOpen]);

  // Controls
  const lookAt = useCallback((x: number, y: number) => {
    setTargetType("point");
    setTargetPosition({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
    setIsFollowingCursor(false);
  }, []);

  const lookAtUser = useCallback(() => {
    setTargetType("user");
  }, []);

  const followCursor = useCallback((enabled: boolean) => {
    if (enabled) {
      setTargetType("cursor");
    } else {
      setTargetType("user");
    }
  }, []);

  const lookAway = useCallback((direction?: "left" | "right" | "up" | "down") => {
    setTargetType("away");
    switch (direction) {
      case "left":
        setTargetPosition({ x: 0.1, y: 0.5 });
        break;
      case "right":
        setTargetPosition({ x: 0.9, y: 0.5 });
        break;
      case "up":
        setTargetPosition({ x: 0.5, y: 0.2 });
        break;
      case "down":
        setTargetPosition({ x: 0.5, y: 0.8 });
        break;
      default:
        setTargetPosition({ x: Math.random() < 0.5 ? 0.1 : 0.9, y: 0.4 + Math.random() * 0.2 });
    }
    setIsFollowingCursor(false);
  }, []);

  const setTarget = useCallback((target: GazeTarget) => {
    setTargetType(target);
  }, []);

  const blink = useCallback(() => {
    setEyelidOpen(0);
    setTimeout(() => setEyelidOpen(1), 150);
  }, []);

  const doubleBlink = useCallback(() => {
    setEyelidOpen(0);
    setTimeout(() => {
      setEyelidOpen(1);
      setTimeout(() => {
        setEyelidOpen(0);
        setTimeout(() => setEyelidOpen(1), 150);
      }, 200);
    }, 150);
  }, []);

  const setPupilDilation = useCallback((value: number) => {
    setPupilDilationState(Math.max(0, Math.min(1, value)));
  }, []);

  const reset = useCallback(() => {
    setTargetType(initialTarget);
    setTargetPosition({ x: 0.5, y: 0.5 });
    setCurrentPosition({ x: 0.5, y: 0.5 });
    setIsFollowingCursor(false);
    setPupilDilationState(0.5);
    setEyelidOpen(1);
  }, [initialTarget]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (blinkTimeoutRef.current) {
        clearTimeout(blinkTimeoutRef.current);
      }
    };
  }, []);

  const controls = useMemo(
    (): GazeControls => ({
      lookAt,
      lookAtUser,
      followCursor,
      lookAway,
      setTarget,
      blink,
      doubleBlink,
      setPupilDilation,
      reset,
    }),
    [lookAt, lookAtUser, followCursor, lookAway, setTarget, blink, doubleBlink, setPupilDilation, reset]
  );

  return { state, controls };
}

/**
 * Hook for simple cursor-following eyes
 */
export function useCursorFollowingEyes(
  containerRef?: React.RefObject<HTMLElement>
): {
  horizontal: number;
  vertical: number;
} {
  const { state } = useAvatarEyeTracking({
    initialTarget: "cursor",
    containerRef,
  });

  return {
    horizontal: state.eyeRotation.horizontal,
    vertical: state.eyeRotation.vertical,
  };
}

/**
 * Hook for conversation-appropriate gaze
 */
export function useConversationGaze(
  isSpeaking: boolean,
  isListening: boolean
): GazeState {
  const { state, controls } = useAvatarEyeTracking({
    initialTarget: "user",
    autoBlink: true,
  });

  useEffect(() => {
    if (isSpeaking) {
      // Occasionally look away while speaking (natural behavior)
      const lookAwayChance = () => {
        if (Math.random() < 0.3) {
          controls.lookAway();
          setTimeout(() => controls.lookAtUser(), 500 + Math.random() * 1000);
        }
      };

      const interval = setInterval(lookAwayChance, 3000 + Math.random() * 2000);
      return () => clearInterval(interval);
    } else if (isListening) {
      // More sustained eye contact while listening
      controls.lookAtUser();
    }
  }, [isSpeaking, isListening, controls]);

  return state;
}

/**
 * Hook for eye gaze CSS transform values
 */
export function useEyeGazeTransform(): {
  leftEye: React.CSSProperties;
  rightEye: React.CSSProperties;
  head: React.CSSProperties;
} {
  const { state } = useAvatarEyeTracking({ initialTarget: "cursor" });

  return useMemo(() => {
    const eyeTranslateX = state.eyeRotation.horizontal * 3;
    const eyeTranslateY = -state.eyeRotation.vertical * 2;

    return {
      leftEye: {
        transform: `translate(${eyeTranslateX}px, ${eyeTranslateY}px)`,
      },
      rightEye: {
        transform: `translate(${eyeTranslateX}px, ${eyeTranslateY}px)`,
      },
      head: {
        transform: `rotateY(${state.headRotation.yaw}deg) rotateX(${state.headRotation.pitch}deg)`,
      },
    };
  }, [state.eyeRotation, state.headRotation]);
}
