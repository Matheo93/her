/**
 * useAvatarHeadTracking - Natural head movement for avatar interactions
 *
 * Sprint 1590 - Provides realistic head tracking and movement for avatar
 * based on attention targets, conversation flow, and natural micro-movements.
 *
 * Features:
 * - Multi-target attention tracking
 * - Natural head pose transitions
 * - Micro-movement simulation (idle sway)
 * - Conversation-aware head gestures
 * - Smooth interpolation and easing
 * - Device orientation integration
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Head pose axes
export interface HeadPose {
  pitch: number; // Up/down rotation (-45 to 45 degrees)
  yaw: number; // Left/right rotation (-60 to 60 degrees)
  roll: number; // Tilt (-15 to 15 degrees)
}

export type HeadGesture =
  | "nod" // Affirmative nod
  | "shake" // Negative shake
  | "tilt_curious" // Curious tilt
  | "tilt_confused" // Confused tilt
  | "look_away" // Brief look away
  | "look_up" // Thinking look up
  | "lean_in" // Interested lean
  | "lean_back"; // Surprised lean back

export type TrackingMode =
  | "user" // Track user position
  | "target" // Track specific target
  | "idle" // Natural idle movement
  | "gesture" // Playing a gesture
  | "locked"; // Fixed position

export interface AttentionTarget {
  id: string;
  position: { x: number; y: number; z: number };
  priority: number;
  duration?: number;
  timestamp: number;
}

export interface HeadTrackingState {
  pose: HeadPose;
  targetPose: HeadPose;
  mode: TrackingMode;
  currentTarget: AttentionTarget | null;
  isMoving: boolean;
  currentGesture: HeadGesture | null;
  gestureProgress: number;
}

export interface HeadTrackingMetrics {
  totalMovements: number;
  gesturesPerformed: number;
  averageMovementSpeed: number;
  idleTime: number;
  attentionSwitches: number;
}

export interface HeadTrackingConfig {
  enabled: boolean;
  smoothingFactor: number; // 0-1, higher = smoother
  maxSpeed: number; // Degrees per second
  idleMovementScale: number; // 0-2, idle sway intensity
  idleFrequency: number; // Idle movement frequency
  gestureIntensity: number; // 0-2
  lookAtDamping: number; // 0-1
  pitchLimit: number; // Max pitch degrees
  yawLimit: number; // Max yaw degrees
  rollLimit: number; // Max roll degrees
}

export interface HeadTrackingControls {
  setTarget: (position: { x: number; y: number; z: number }, priority?: number) => void;
  clearTarget: () => void;
  performGesture: (gesture: HeadGesture) => void;
  setPose: (pose: Partial<HeadPose>) => void;
  setMode: (mode: TrackingMode) => void;
  lookAt: (x: number, y: number) => void;
  resetToNeutral: () => void;
  updateConfig: (config: Partial<HeadTrackingConfig>) => void;
}

export interface UseAvatarHeadTrackingResult {
  state: HeadTrackingState;
  metrics: HeadTrackingMetrics;
  controls: HeadTrackingControls;
  config: HeadTrackingConfig;
}

// Gesture definitions
const GESTURE_ANIMATIONS: Record<HeadGesture, { keyframes: HeadPose[]; durationMs: number }> = {
  nod: {
    keyframes: [
      { pitch: 0, yaw: 0, roll: 0 },
      { pitch: 15, yaw: 0, roll: 0 },
      { pitch: -5, yaw: 0, roll: 0 },
      { pitch: 10, yaw: 0, roll: 0 },
      { pitch: 0, yaw: 0, roll: 0 },
    ],
    durationMs: 600,
  },
  shake: {
    keyframes: [
      { pitch: 0, yaw: 0, roll: 0 },
      { pitch: 0, yaw: 15, roll: 0 },
      { pitch: 0, yaw: -15, roll: 0 },
      { pitch: 0, yaw: 10, roll: 0 },
      { pitch: 0, yaw: -10, roll: 0 },
      { pitch: 0, yaw: 0, roll: 0 },
    ],
    durationMs: 700,
  },
  tilt_curious: {
    keyframes: [
      { pitch: 0, yaw: 0, roll: 0 },
      { pitch: 5, yaw: 5, roll: 12 },
      { pitch: 5, yaw: 5, roll: 12 },
      { pitch: 0, yaw: 0, roll: 0 },
    ],
    durationMs: 800,
  },
  tilt_confused: {
    keyframes: [
      { pitch: 0, yaw: 0, roll: 0 },
      { pitch: -5, yaw: -5, roll: -10 },
      { pitch: -5, yaw: -5, roll: -10 },
      { pitch: 0, yaw: 0, roll: 0 },
    ],
    durationMs: 900,
  },
  look_away: {
    keyframes: [
      { pitch: 0, yaw: 0, roll: 0 },
      { pitch: -10, yaw: 25, roll: 0 },
      { pitch: -10, yaw: 25, roll: 0 },
      { pitch: 0, yaw: 0, roll: 0 },
    ],
    durationMs: 1200,
  },
  look_up: {
    keyframes: [
      { pitch: 0, yaw: 0, roll: 0 },
      { pitch: -20, yaw: 5, roll: 0 },
      { pitch: -20, yaw: 5, roll: 0 },
      { pitch: 0, yaw: 0, roll: 0 },
    ],
    durationMs: 1000,
  },
  lean_in: {
    keyframes: [
      { pitch: 0, yaw: 0, roll: 0 },
      { pitch: 10, yaw: 0, roll: 0 },
      { pitch: 10, yaw: 0, roll: 0 },
      { pitch: 0, yaw: 0, roll: 0 },
    ],
    durationMs: 600,
  },
  lean_back: {
    keyframes: [
      { pitch: 0, yaw: 0, roll: 0 },
      { pitch: -15, yaw: 0, roll: 0 },
      { pitch: -15, yaw: 0, roll: 0 },
      { pitch: 0, yaw: 0, roll: 0 },
    ],
    durationMs: 500,
  },
};

const DEFAULT_CONFIG: HeadTrackingConfig = {
  enabled: true,
  smoothingFactor: 0.85,
  maxSpeed: 120, // degrees per second
  idleMovementScale: 0.5,
  idleFrequency: 0.3,
  gestureIntensity: 1.0,
  lookAtDamping: 0.1,
  pitchLimit: 45,
  yawLimit: 60,
  rollLimit: 15,
};

const NEUTRAL_POSE: HeadPose = { pitch: 0, yaw: 0, roll: 0 };

// Easing functions
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPose(a: HeadPose, b: HeadPose, t: number): HeadPose {
  return {
    pitch: lerp(a.pitch, b.pitch, t),
    yaw: lerp(a.yaw, b.yaw, t),
    roll: lerp(a.roll, b.roll, t),
  };
}

function clampPose(pose: HeadPose, config: HeadTrackingConfig): HeadPose {
  return {
    pitch: Math.max(-config.pitchLimit, Math.min(config.pitchLimit, pose.pitch)),
    yaw: Math.max(-config.yawLimit, Math.min(config.yawLimit, pose.yaw)),
    roll: Math.max(-config.rollLimit, Math.min(config.rollLimit, pose.roll)),
  };
}

export function useAvatarHeadTracking(
  initialConfig: Partial<HeadTrackingConfig> = {}
): UseAvatarHeadTrackingResult {
  const [config, setConfig] = useState<HeadTrackingConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [state, setState] = useState<HeadTrackingState>({
    pose: { ...NEUTRAL_POSE },
    targetPose: { ...NEUTRAL_POSE },
    mode: "idle",
    currentTarget: null,
    isMoving: false,
    currentGesture: null,
    gestureProgress: 0,
  });

  const [metrics, setMetrics] = useState<HeadTrackingMetrics>({
    totalMovements: 0,
    gesturesPerformed: 0,
    averageMovementSpeed: 0,
    idleTime: 0,
    attentionSwitches: 0,
  });

  // Refs
  const animationRef = useRef<number | null>(null);
  const gestureStartRef = useRef<number | null>(null);
  const currentGestureRef = useRef<HeadGesture | null>(null);
  const targetRef = useRef<AttentionTarget | null>(null);
  const lastPoseRef = useRef<HeadPose>({ ...NEUTRAL_POSE });
  const idlePhaseRef = useRef(0);
  const movementSpeedsRef = useRef<number[]>([]);

  // Calculate idle micro-movement
  const calculateIdleOffset = useCallback(
    (time: number): HeadPose => {
      const scale = config.idleMovementScale;
      const freq = config.idleFrequency;

      // Multi-frequency Perlin-like noise simulation
      const pitch =
        Math.sin(time * freq * 0.7) * 2 * scale +
        Math.sin(time * freq * 1.3) * 1 * scale;
      const yaw =
        Math.sin(time * freq * 0.5 + 1) * 3 * scale +
        Math.sin(time * freq * 1.1 + 2) * 1.5 * scale;
      const roll =
        Math.sin(time * freq * 0.8 + 0.5) * 1 * scale;

      return { pitch, yaw, roll };
    },
    [config.idleMovementScale, config.idleFrequency]
  );

  // Calculate target pose from 3D position
  const calculateTargetPose = useCallback(
    (position: { x: number; y: number; z: number }): HeadPose => {
      // Assume avatar is at origin looking forward (0, 0, 1)
      const dx = position.x;
      const dy = position.y;
      const dz = position.z;

      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance < 0.01) return { ...NEUTRAL_POSE };

      // Calculate angles
      const yaw = Math.atan2(dx, dz) * (180 / Math.PI);
      const pitch = Math.atan2(-dy, Math.sqrt(dx * dx + dz * dz)) * (180 / Math.PI);

      return clampPose({ pitch, yaw, roll: 0 }, config);
    },
    [config]
  );

  // Animation loop
  useEffect(() => {
    if (!config.enabled) return;

    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      idlePhaseRef.current += deltaTime;

      let targetPose = state.targetPose;
      let newMode = state.mode;

      // Handle gesture animation
      if (currentGestureRef.current && gestureStartRef.current) {
        const gesture = GESTURE_ANIMATIONS[currentGestureRef.current];
        const elapsed = currentTime - gestureStartRef.current;
        const progress = Math.min(1, elapsed / gesture.durationMs);

        if (progress >= 1) {
          // Gesture complete
          currentGestureRef.current = null;
          gestureStartRef.current = null;
          newMode = targetRef.current ? "target" : "idle";
        } else {
          // Interpolate between keyframes
          const numKeyframes = gesture.keyframes.length;
          const keyframeProgress = progress * (numKeyframes - 1);
          const keyframeIndex = Math.floor(keyframeProgress);
          const keyframeT = keyframeProgress - keyframeIndex;

          const from = gesture.keyframes[keyframeIndex];
          const to = gesture.keyframes[Math.min(keyframeIndex + 1, numKeyframes - 1)];

          targetPose = lerpPose(from, to, easeInOutQuad(keyframeT));
          targetPose = {
            pitch: targetPose.pitch * config.gestureIntensity,
            yaw: targetPose.yaw * config.gestureIntensity,
            roll: targetPose.roll * config.gestureIntensity,
          };

          setState((prev) => ({
            ...prev,
            gestureProgress: progress,
          }));
        }
      } else if (targetRef.current) {
        // Track target
        targetPose = calculateTargetPose(targetRef.current.position);
        newMode = "target";
      } else if (state.mode === "idle" || state.mode === "user") {
        // Add idle movement
        const idleOffset = calculateIdleOffset(idlePhaseRef.current);
        targetPose = {
          pitch: idleOffset.pitch,
          yaw: idleOffset.yaw,
          roll: idleOffset.roll,
        };

        setMetrics((prev) => ({
          ...prev,
          idleTime: prev.idleTime + deltaTime * 1000,
        }));
      }

      // Smooth interpolation to target
      const smoothing = config.smoothingFactor;
      const maxDelta = config.maxSpeed * deltaTime;

      const currentPose = state.pose;
      let newPose: HeadPose = {
        pitch: lerp(currentPose.pitch, targetPose.pitch, 1 - smoothing),
        yaw: lerp(currentPose.yaw, targetPose.yaw, 1 - smoothing),
        roll: lerp(currentPose.roll, targetPose.roll, 1 - smoothing),
      };

      // Clamp speed
      const pitchDelta = Math.abs(newPose.pitch - currentPose.pitch);
      const yawDelta = Math.abs(newPose.yaw - currentPose.yaw);
      const rollDelta = Math.abs(newPose.roll - currentPose.roll);

      if (pitchDelta > maxDelta) {
        newPose.pitch =
          currentPose.pitch +
          Math.sign(newPose.pitch - currentPose.pitch) * maxDelta;
      }
      if (yawDelta > maxDelta) {
        newPose.yaw =
          currentPose.yaw + Math.sign(newPose.yaw - currentPose.yaw) * maxDelta;
      }
      if (rollDelta > maxDelta * 0.5) {
        newPose.roll =
          currentPose.roll +
          Math.sign(newPose.roll - currentPose.roll) * maxDelta * 0.5;
      }

      newPose = clampPose(newPose, config);

      // Check if moving
      const totalDelta = Math.abs(pitchDelta) + Math.abs(yawDelta) + Math.abs(rollDelta);
      const isMoving = totalDelta > 0.1;

      if (isMoving) {
        const speed = totalDelta / deltaTime;
        movementSpeedsRef.current.push(speed);
        if (movementSpeedsRef.current.length > 30) {
          movementSpeedsRef.current.shift();
        }
      }

      // Track movements
      if (isMoving && !state.isMoving) {
        setMetrics((prev) => ({
          ...prev,
          totalMovements: prev.totalMovements + 1,
          averageMovementSpeed:
            movementSpeedsRef.current.reduce((a, b) => a + b, 0) /
            movementSpeedsRef.current.length,
        }));
      }

      lastPoseRef.current = newPose;

      setState((prev) => ({
        ...prev,
        pose: newPose,
        targetPose,
        mode: currentGestureRef.current ? "gesture" : newMode,
        isMoving,
        currentGesture: currentGestureRef.current,
      }));

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [
    config,
    state.pose,
    state.targetPose,
    state.mode,
    state.isMoving,
    calculateIdleOffset,
    calculateTargetPose,
  ]);

  // Controls
  const setTarget = useCallback(
    (position: { x: number; y: number; z: number }, priority: number = 1) => {
      const wasNull = targetRef.current === null;
      targetRef.current = {
        id: `target-${Date.now()}`,
        position,
        priority,
        timestamp: Date.now(),
      };

      if (wasNull) {
        setMetrics((prev) => ({
          ...prev,
          attentionSwitches: prev.attentionSwitches + 1,
        }));
      }

      setState((prev) => ({
        ...prev,
        currentTarget: targetRef.current,
        mode: "target",
      }));
    },
    []
  );

  const clearTarget = useCallback(() => {
    targetRef.current = null;
    setState((prev) => ({
      ...prev,
      currentTarget: null,
      mode: "idle",
    }));
  }, []);

  const performGesture = useCallback((gesture: HeadGesture) => {
    currentGestureRef.current = gesture;
    gestureStartRef.current = performance.now();

    setMetrics((prev) => ({
      ...prev,
      gesturesPerformed: prev.gesturesPerformed + 1,
    }));

    setState((prev) => ({
      ...prev,
      mode: "gesture",
      currentGesture: gesture,
      gestureProgress: 0,
    }));
  }, []);

  const setPose = useCallback(
    (pose: Partial<HeadPose>) => {
      setState((prev) => ({
        ...prev,
        targetPose: clampPose({ ...prev.targetPose, ...pose }, config),
        mode: "locked",
      }));
    },
    [config]
  );

  const setMode = useCallback((mode: TrackingMode) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const lookAt = useCallback(
    (x: number, y: number) => {
      // Convert screen coordinates to 3D position
      // Assume z = 1 for simplicity
      const position = {
        x: (x - 0.5) * 2,
        y: -(y - 0.5) * 2,
        z: 1,
      };
      setTarget(position, 2);
    },
    [setTarget]
  );

  const resetToNeutral = useCallback(() => {
    targetRef.current = null;
    currentGestureRef.current = null;
    gestureStartRef.current = null;

    setState((prev) => ({
      ...prev,
      targetPose: { ...NEUTRAL_POSE },
      mode: "idle",
      currentTarget: null,
      currentGesture: null,
    }));
  }, []);

  const updateConfig = useCallback((updates: Partial<HeadTrackingConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const controls: HeadTrackingControls = useMemo(
    () => ({
      setTarget,
      clearTarget,
      performGesture,
      setPose,
      setMode,
      lookAt,
      resetToNeutral,
      updateConfig,
    }),
    [
      setTarget,
      clearTarget,
      performGesture,
      setPose,
      setMode,
      lookAt,
      resetToNeutral,
      updateConfig,
    ]
  );

  return {
    state,
    metrics,
    controls,
    config,
  };
}

// Sub-hook: Simple head pose
export function useHeadPose(config?: Partial<HeadTrackingConfig>): HeadPose {
  const { state } = useAvatarHeadTracking(config);
  return state.pose;
}

// Sub-hook: Conversation-aware head tracking
export function useConversationHeadTracking(
  isSpeaking: boolean,
  isListening: boolean
): UseAvatarHeadTrackingResult {
  const result = useAvatarHeadTracking();

  useEffect(() => {
    if (isSpeaking) {
      // Occasional nod while speaking
      const interval = setInterval(() => {
        if (Math.random() < 0.3) {
          result.controls.performGesture("nod");
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isSpeaking, result.controls]);

  useEffect(() => {
    if (isListening) {
      result.controls.setMode("user");
    }
  }, [isListening, result.controls]);

  return result;
}

export default useAvatarHeadTracking;
