"use client";

/**
 * useAvatarGestures - Avatar Gesture Animation System
 *
 * Manages avatar body/hand gestures, head movements, and
 * conversational animations.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// Gesture types
export type GestureType =
  | "nod"           // Agreement nod
  | "shake"         // Disagreement shake
  | "tilt"          // Curious head tilt
  | "lean_forward"  // Engaged lean
  | "lean_back"     // Relaxed lean
  | "wave"          // Greeting wave
  | "point"         // Pointing gesture
  | "shrug"         // Uncertainty shrug
  | "thinking"      // Hand to chin
  | "emphasis"      // Emphatic hand movement
  | "calm"          // Calming hands down
  | "celebrate"     // Celebration gesture
  | "acknowledge"   // Small acknowledgment
  | "listen"        // Attentive posture
  | "idle";         // Return to idle

// Gesture animation data
export interface GestureAnimation {
  type: GestureType;
  duration: number;      // Total duration in ms
  keyframes: GestureKeyframe[];
  loop?: boolean;
  interruptible?: boolean;
}

export interface GestureKeyframe {
  time: number;         // Time offset in ms
  position: {
    x: number;          // Horizontal offset (-1 to 1)
    y: number;          // Vertical offset (-1 to 1)
    z: number;          // Depth offset (-1 to 1)
  };
  rotation: {
    pitch: number;      // Up/down rotation (degrees)
    yaw: number;        // Left/right rotation (degrees)
    roll: number;       // Tilt rotation (degrees)
  };
  scale?: number;       // Optional scale multiplier
  easing?: EasingType;  // Easing for this keyframe
}

export type EasingType =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "bounce"
  | "elastic";

// Predefined gesture animations
const GESTURE_ANIMATIONS: Record<GestureType, GestureAnimation> = {
  nod: {
    type: "nod",
    duration: 600,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 150, position: { x: 0, y: -0.05, z: 0.02 }, rotation: { pitch: 15, yaw: 0, roll: 0 }, easing: "easeOut" },
      { time: 300, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeInOut" },
      { time: 450, position: { x: 0, y: -0.03, z: 0.01 }, rotation: { pitch: 10, yaw: 0, roll: 0 }, easing: "easeOut" },
      { time: 600, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeOut" },
    ],
  },
  shake: {
    type: "shake",
    duration: 800,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 100, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: -15, roll: 0 }, easing: "easeOut" },
      { time: 200, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 15, roll: 0 }, easing: "easeInOut" },
      { time: 300, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: -12, roll: 0 }, easing: "easeInOut" },
      { time: 400, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 12, roll: 0 }, easing: "easeInOut" },
      { time: 500, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: -8, roll: 0 }, easing: "easeInOut" },
      { time: 600, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 8, roll: 0 }, easing: "easeInOut" },
      { time: 800, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeOut" },
    ],
  },
  tilt: {
    type: "tilt",
    duration: 1200,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 400, position: { x: 0.02, y: 0.02, z: 0 }, rotation: { pitch: -5, yaw: 5, roll: 15 }, easing: "easeOut" },
      { time: 800, position: { x: 0.02, y: 0.02, z: 0 }, rotation: { pitch: -5, yaw: 5, roll: 15 } },
      { time: 1200, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeInOut" },
    ],
  },
  lean_forward: {
    type: "lean_forward",
    duration: 800,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 400, position: { x: 0, y: -0.02, z: 0.1 }, rotation: { pitch: 5, yaw: 0, roll: 0 }, easing: "easeOut" },
      { time: 800, position: { x: 0, y: -0.02, z: 0.1 }, rotation: { pitch: 5, yaw: 0, roll: 0 } },
    ],
  },
  lean_back: {
    type: "lean_back",
    duration: 800,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 400, position: { x: 0, y: 0.02, z: -0.08 }, rotation: { pitch: -8, yaw: 0, roll: 0 }, easing: "easeOut" },
      { time: 800, position: { x: 0, y: 0.02, z: -0.08 }, rotation: { pitch: -8, yaw: 0, roll: 0 } },
    ],
  },
  wave: {
    type: "wave",
    duration: 1500,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 200, position: { x: 0.1, y: 0.05, z: 0 }, rotation: { pitch: 0, yaw: 10, roll: -5 }, easing: "easeOut" },
      { time: 400, position: { x: 0.12, y: 0.08, z: 0 }, rotation: { pitch: 0, yaw: 15, roll: 10 }, easing: "easeInOut" },
      { time: 600, position: { x: 0.1, y: 0.05, z: 0 }, rotation: { pitch: 0, yaw: 10, roll: -10 }, easing: "easeInOut" },
      { time: 800, position: { x: 0.12, y: 0.08, z: 0 }, rotation: { pitch: 0, yaw: 15, roll: 10 }, easing: "easeInOut" },
      { time: 1000, position: { x: 0.1, y: 0.05, z: 0 }, rotation: { pitch: 0, yaw: 10, roll: -10 }, easing: "easeInOut" },
      { time: 1500, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeInOut" },
    ],
  },
  point: {
    type: "point",
    duration: 1000,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 300, position: { x: 0.15, y: 0, z: 0.1 }, rotation: { pitch: 0, yaw: 20, roll: 0 }, easing: "easeOut" },
      { time: 700, position: { x: 0.15, y: 0, z: 0.1 }, rotation: { pitch: 0, yaw: 20, roll: 0 } },
      { time: 1000, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeInOut" },
    ],
  },
  shrug: {
    type: "shrug",
    duration: 1200,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 300, position: { x: 0, y: 0.1, z: 0 }, rotation: { pitch: -5, yaw: 0, roll: 0 }, easing: "easeOut" },
      { time: 600, position: { x: 0, y: 0.1, z: 0 }, rotation: { pitch: -5, yaw: 0, roll: 0 } },
      { time: 1200, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeInOut" },
    ],
  },
  thinking: {
    type: "thinking",
    duration: 2000,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 400, position: { x: 0.03, y: 0.02, z: 0 }, rotation: { pitch: 10, yaw: -10, roll: 5 }, easing: "easeOut" },
      { time: 1600, position: { x: 0.03, y: 0.02, z: 0 }, rotation: { pitch: 10, yaw: -10, roll: 5 } },
      { time: 2000, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeInOut" },
    ],
  },
  emphasis: {
    type: "emphasis",
    duration: 600,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 150, position: { x: 0, y: -0.03, z: 0.05 }, rotation: { pitch: 8, yaw: 0, roll: 0 }, easing: "easeOut" },
      { time: 300, position: { x: 0, y: 0.02, z: 0 }, rotation: { pitch: -3, yaw: 0, roll: 0 }, easing: "easeOut" },
      { time: 600, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeOut" },
    ],
  },
  calm: {
    type: "calm",
    duration: 1500,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 500, position: { x: 0, y: 0.05, z: -0.03 }, rotation: { pitch: -5, yaw: 0, roll: 0 }, easing: "easeOut" },
      { time: 1000, position: { x: 0, y: -0.02, z: 0 }, rotation: { pitch: 3, yaw: 0, roll: 0 }, easing: "easeInOut" },
      { time: 1500, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeOut" },
    ],
  },
  celebrate: {
    type: "celebrate",
    duration: 1200,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 200, position: { x: 0, y: 0.1, z: 0.05 }, rotation: { pitch: -10, yaw: 0, roll: -5 }, easing: "easeOut" },
      { time: 400, position: { x: 0, y: 0.08, z: 0.03 }, rotation: { pitch: -8, yaw: 0, roll: 5 }, easing: "easeInOut" },
      { time: 600, position: { x: 0, y: 0.1, z: 0.05 }, rotation: { pitch: -10, yaw: 0, roll: -5 }, easing: "easeInOut" },
      { time: 800, position: { x: 0, y: 0.08, z: 0.03 }, rotation: { pitch: -8, yaw: 0, roll: 5 }, easing: "easeInOut" },
      { time: 1200, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeInOut" },
    ],
  },
  acknowledge: {
    type: "acknowledge",
    duration: 400,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 150, position: { x: 0, y: -0.02, z: 0.01 }, rotation: { pitch: 8, yaw: 0, roll: 0 }, easing: "easeOut" },
      { time: 400, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeOut" },
    ],
  },
  listen: {
    type: "listen",
    duration: 800,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 400, position: { x: 0, y: -0.01, z: 0.05 }, rotation: { pitch: 5, yaw: 0, roll: 3 }, easing: "easeOut" },
      { time: 800, position: { x: 0, y: -0.01, z: 0.05 }, rotation: { pitch: 5, yaw: 0, roll: 3 } },
    ],
  },
  idle: {
    type: "idle",
    duration: 500,
    interruptible: true,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 500, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, easing: "easeOut" },
    ],
  },
};

// Easing functions
const EASING_FUNCTIONS: Record<EasingType, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 2),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  bounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  elastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

interface GestureState {
  // Current gesture being played
  currentGesture: GestureType | null;

  // Current transform values
  transform: {
    position: { x: number; y: number; z: number };
    rotation: { pitch: number; yaw: number; roll: number };
    scale: number;
  };

  // Whether a gesture is currently playing
  isPlaying: boolean;

  // Progress of current gesture (0-1)
  progress: number;

  // Gesture queue
  queueLength: number;
}

interface GestureControls {
  // Play a gesture
  play: (gesture: GestureType, options?: PlayOptions) => void;

  // Queue a gesture to play after current
  queue: (gesture: GestureType, options?: PlayOptions) => void;

  // Stop current gesture
  stop: () => void;

  // Clear gesture queue
  clearQueue: () => void;

  // Play custom animation
  playCustom: (animation: GestureAnimation) => void;

  // Get available gestures
  getAvailableGestures: () => GestureType[];
}

interface PlayOptions {
  speed?: number;         // Playback speed multiplier
  intensity?: number;     // Animation intensity (0-1)
  onComplete?: () => void; // Callback when complete
}

interface UseAvatarGesturesOptions {
  // Default playback speed
  defaultSpeed?: number;

  // Default intensity
  defaultIntensity?: number;

  // Whether to allow interrupting gestures
  allowInterrupt?: boolean;

  // Callback when gesture starts
  onGestureStart?: (gesture: GestureType) => void;

  // Callback when gesture ends
  onGestureEnd?: (gesture: GestureType) => void;
}

interface UseAvatarGesturesResult {
  state: GestureState;
  controls: GestureControls;
}

export function useAvatarGestures(
  options: UseAvatarGesturesOptions = {}
): UseAvatarGesturesResult {
  const {
    defaultSpeed = 1,
    defaultIntensity = 1,
    allowInterrupt = true,
    onGestureStart,
    onGestureEnd,
  } = options;

  // State
  const [currentGesture, setCurrentGesture] = useState<GestureType | null>(null);
  const [transform, setTransform] = useState({
    position: { x: 0, y: 0, z: 0 },
    rotation: { pitch: 0, yaw: 0, roll: 0 },
    scale: 1,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [queue, setQueue] = useState<Array<{ gesture: GestureType; options?: PlayOptions }>>([]);

  // Refs
  const animationFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const currentAnimationRef = useRef<GestureAnimation | null>(null);
  const optionsRef = useRef<PlayOptions>({});

  // Interpolate between keyframes
  const interpolate = useCallback(
    (animation: GestureAnimation, elapsed: number, intensity: number) => {
      const { keyframes, duration } = animation;

      // Find surrounding keyframes
      let prevKeyframe = keyframes[0];
      let nextKeyframe = keyframes[keyframes.length - 1];

      for (let i = 0; i < keyframes.length - 1; i++) {
        if (elapsed >= keyframes[i].time && elapsed < keyframes[i + 1].time) {
          prevKeyframe = keyframes[i];
          nextKeyframe = keyframes[i + 1];
          break;
        }
      }

      // Calculate local progress between keyframes
      const keyframeDuration = nextKeyframe.time - prevKeyframe.time;
      const localProgress = keyframeDuration > 0
        ? (elapsed - prevKeyframe.time) / keyframeDuration
        : 1;

      // Apply easing
      const easing = nextKeyframe.easing || "linear";
      const easedProgress = EASING_FUNCTIONS[easing](localProgress);

      // Interpolate values
      const lerp = (a: number, b: number) => a + (b - a) * easedProgress;

      return {
        position: {
          x: lerp(prevKeyframe.position.x, nextKeyframe.position.x) * intensity,
          y: lerp(prevKeyframe.position.y, nextKeyframe.position.y) * intensity,
          z: lerp(prevKeyframe.position.z, nextKeyframe.position.z) * intensity,
        },
        rotation: {
          pitch: lerp(prevKeyframe.rotation.pitch, nextKeyframe.rotation.pitch) * intensity,
          yaw: lerp(prevKeyframe.rotation.yaw, nextKeyframe.rotation.yaw) * intensity,
          roll: lerp(prevKeyframe.rotation.roll, nextKeyframe.rotation.roll) * intensity,
        },
        scale: lerp(prevKeyframe.scale ?? 1, nextKeyframe.scale ?? 1),
      };
    },
    []
  );

  // Animation loop
  const animate = useCallback(() => {
    if (!currentAnimationRef.current) return;

    const animation = currentAnimationRef.current;
    const speed = optionsRef.current.speed ?? defaultSpeed;
    const intensity = optionsRef.current.intensity ?? defaultIntensity;
    const elapsed = (performance.now() - startTimeRef.current) * speed;

    // Check if complete
    if (elapsed >= animation.duration) {
      if (animation.loop) {
        startTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsPlaying(false);
        setProgress(1);
        const gestureType = currentGesture;
        setCurrentGesture(null);
        currentAnimationRef.current = null;
        optionsRef.current.onComplete?.();
        if (gestureType) {
          onGestureEnd?.(gestureType);
        }

        // Play next in queue
        if (queue.length > 0) {
          const next = queue[0];
          setQueue((prev) => prev.slice(1));
          playGesture(next.gesture, next.options);
        }
        return;
      }
    }

    // Update transform
    const newTransform = interpolate(animation, elapsed, intensity);
    setTransform(newTransform);
    setProgress(elapsed / animation.duration);

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [currentGesture, defaultSpeed, defaultIntensity, interpolate, onGestureEnd, queue]);

  // Play a gesture
  const playGesture = useCallback(
    (gesture: GestureType, playOptions?: PlayOptions) => {
      const animation = GESTURE_ANIMATIONS[gesture];
      if (!animation) return;

      // Check if we can interrupt
      if (isPlaying && !allowInterrupt && currentAnimationRef.current?.interruptible === false) {
        return;
      }

      // Cancel current animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      currentAnimationRef.current = animation;
      optionsRef.current = playOptions || {};
      startTimeRef.current = performance.now();

      setCurrentGesture(gesture);
      setIsPlaying(true);
      setProgress(0);
      onGestureStart?.(gesture);

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [isPlaying, allowInterrupt, animate, onGestureStart]
  );

  // Queue a gesture
  const queueGesture = useCallback(
    (gesture: GestureType, playOptions?: PlayOptions) => {
      if (!isPlaying) {
        playGesture(gesture, playOptions);
      } else {
        setQueue((prev) => [...prev, { gesture, options: playOptions }]);
      }
    },
    [isPlaying, playGesture]
  );

  // Stop current gesture
  const stop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const gestureType = currentGesture;
    setIsPlaying(false);
    setCurrentGesture(null);
    currentAnimationRef.current = null;
    setTransform({
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: 0, roll: 0 },
      scale: 1,
    });
    setProgress(0);

    if (gestureType) {
      onGestureEnd?.(gestureType);
    }
  }, [currentGesture, onGestureEnd]);

  // Clear queue
  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  // Play custom animation
  const playCustom = useCallback(
    (animation: GestureAnimation) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      currentAnimationRef.current = animation;
      optionsRef.current = {};
      startTimeRef.current = performance.now();

      setCurrentGesture(animation.type);
      setIsPlaying(true);
      setProgress(0);
      onGestureStart?.(animation.type);

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [animate, onGestureStart]
  );

  // Get available gestures
  const getAvailableGestures = useCallback((): GestureType[] => {
    return Object.keys(GESTURE_ANIMATIONS) as GestureType[];
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const state = useMemo(
    (): GestureState => ({
      currentGesture,
      transform,
      isPlaying,
      progress,
      queueLength: queue.length,
    }),
    [currentGesture, transform, isPlaying, progress, queue.length]
  );

  const controls = useMemo(
    (): GestureControls => ({
      play: playGesture,
      queue: queueGesture,
      stop,
      clearQueue,
      playCustom,
      getAvailableGestures,
    }),
    [playGesture, queueGesture, stop, clearQueue, playCustom, getAvailableGestures]
  );

  return { state, controls };
}

/**
 * Hook for automatic conversational gestures
 */
export function useConversationalGestures(
  isSpeaking: boolean,
  options: {
    gestureFrequency?: number; // Average ms between gestures
    enabledGestures?: GestureType[];
  } = {}
): {
  transform: GestureState["transform"];
  currentGesture: GestureType | null;
} {
  const { gestureFrequency = 5000, enabledGestures = ["nod", "tilt", "emphasis", "acknowledge"] } =
    options;

  const { state, controls } = useAvatarGestures();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isSpeaking) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    const scheduleGesture = () => {
      // Random interval with some variation
      const delay = gestureFrequency * (0.5 + Math.random());

      timeoutRef.current = setTimeout(() => {
        // Pick random gesture
        const gesture = enabledGestures[Math.floor(Math.random() * enabledGestures.length)];
        controls.play(gesture, { intensity: 0.7 + Math.random() * 0.3 });
        scheduleGesture();
      }, delay);
    };

    // Initial gesture soon after starting
    timeoutRef.current = setTimeout(() => {
      const gesture = enabledGestures[Math.floor(Math.random() * enabledGestures.length)];
      controls.play(gesture);
      scheduleGesture();
    }, 1000 + Math.random() * 2000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isSpeaking, gestureFrequency, enabledGestures, controls]);

  return {
    transform: state.transform,
    currentGesture: state.currentGesture,
  };
}

// Export gesture definitions for external use
export { GESTURE_ANIMATIONS };
