/**
 * useAvatarReactiveAnimations Hook - Sprint 1586
 *
 * Reactive animations that respond to conversation flow and user interactions.
 * Creates fluid, context-aware animations for natural avatar behavior.
 *
 * Features:
 * - Conversation-driven animation triggers
 * - Reactive head nods, tilts, and gestures
 * - Speech rhythm synchronization
 * - Emotion-reactive body language
 * - Anticipatory animations (preparing to respond)
 * - Interruptible animation chains
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type ReactiveAnimationType =
  | "head_nod"
  | "head_tilt"
  | "head_shake"
  | "lean_forward"
  | "lean_back"
  | "shrug"
  | "thinking_pose"
  | "listening_pose"
  | "speaking_gesture"
  | "emphasis_gesture"
  | "acknowledgment"
  | "surprise_reaction"
  | "empathy_lean"
  | "excitement_bounce";

export type AnimationTrigger =
  | "user_speaking"
  | "user_paused"
  | "user_finished"
  | "ai_thinking"
  | "ai_speaking"
  | "ai_finished"
  | "question_detected"
  | "emotion_detected"
  | "emphasis_word"
  | "agreement"
  | "disagreement"
  | "curiosity"
  | "manual";

export type AnimationPhase = "idle" | "anticipating" | "playing" | "blending" | "recovering";

export interface AnimationKeyframe {
  time: number; // 0-1 normalized
  transforms: {
    headRotation?: { x: number; y: number; z: number };
    bodyLean?: { x: number; y: number };
    shoulderOffset?: { left: number; right: number };
    handPosition?: { left: { x: number; y: number; z: number }; right: { x: number; y: number; z: number } };
  };
  blendShapes?: Record<string, number>;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "spring";
}

export interface ReactiveAnimation {
  id: string;
  type: ReactiveAnimationType;
  trigger: AnimationTrigger;
  keyframes: AnimationKeyframe[];
  duration: number; // ms
  priority: number; // 0-10
  interruptible: boolean;
  loopable: boolean;
  blendIn: number; // ms
  blendOut: number; // ms
}

export interface AnimationState {
  current: ReactiveAnimation | null;
  phase: AnimationPhase;
  progress: number; // 0-1
  queue: ReactiveAnimation[];
  blendWeight: number; // 0-1
  transforms: AnimationKeyframe["transforms"];
  blendShapes: Record<string, number>;
}

export interface AnimationMetrics {
  totalPlayed: number;
  byType: Record<ReactiveAnimationType, number>;
  averageDuration: number;
  interruptionRate: number;
  queueDepth: number;
}

export interface ReactiveAnimationConfig {
  enabled: boolean;
  maxQueueSize: number;
  defaultBlendTime: number; // ms
  naturalVariation: number; // 0-1
  responsiveness: number; // 0-1, how quickly to react
  subtlety: number; // 0-1, animation intensity scale
  enableAnticipation: boolean;
  anticipationTime: number; // ms before AI speaks
}

export interface ReactiveAnimationControls {
  play: (type: ReactiveAnimationType, trigger?: AnimationTrigger) => void;
  queue: (type: ReactiveAnimationType, trigger?: AnimationTrigger) => void;
  interrupt: () => void;
  pause: () => void;
  resume: () => void;
  clearQueue: () => void;
  setSubtlety: (value: number) => void;
  anticipate: (trigger: AnimationTrigger) => void;
}

export interface UseAvatarReactiveAnimationsResult {
  state: AnimationState;
  metrics: AnimationMetrics;
  controls: ReactiveAnimationControls;
  currentTransforms: AnimationKeyframe["transforms"];
  currentBlendShapes: Record<string, number>;
  isAnimating: boolean;
  isAnticipating: boolean;
}

// ============================================================================
// Animation Library
// ============================================================================

const ANIMATION_LIBRARY: Record<ReactiveAnimationType, Omit<ReactiveAnimation, "id" | "trigger">> = {
  head_nod: {
    type: "head_nod",
    keyframes: [
      { time: 0, transforms: { headRotation: { x: 0, y: 0, z: 0 } } },
      { time: 0.3, transforms: { headRotation: { x: -8, y: 0, z: 0 } }, easing: "ease-out" },
      { time: 0.6, transforms: { headRotation: { x: 3, y: 0, z: 0 } }, easing: "ease-in-out" },
      { time: 1, transforms: { headRotation: { x: 0, y: 0, z: 0 } }, easing: "ease-out" },
    ],
    duration: 400,
    priority: 5,
    interruptible: true,
    loopable: false,
    blendIn: 50,
    blendOut: 100,
  },
  head_tilt: {
    type: "head_tilt",
    keyframes: [
      { time: 0, transforms: { headRotation: { x: 0, y: 0, z: 0 } } },
      { time: 0.4, transforms: { headRotation: { x: 3, y: 5, z: 8 } }, easing: "ease-out" },
      { time: 0.8, transforms: { headRotation: { x: 2, y: 3, z: 6 } }, easing: "ease-in-out" },
      { time: 1, transforms: { headRotation: { x: 0, y: 0, z: 0 } }, easing: "ease-out" },
    ],
    duration: 600,
    priority: 4,
    interruptible: true,
    loopable: false,
    blendIn: 100,
    blendOut: 150,
  },
  head_shake: {
    type: "head_shake",
    keyframes: [
      { time: 0, transforms: { headRotation: { x: 0, y: 0, z: 0 } } },
      { time: 0.2, transforms: { headRotation: { x: 0, y: -10, z: 0 } }, easing: "ease-out" },
      { time: 0.4, transforms: { headRotation: { x: 0, y: 10, z: 0 } }, easing: "ease-in-out" },
      { time: 0.6, transforms: { headRotation: { x: 0, y: -6, z: 0 } }, easing: "ease-in-out" },
      { time: 0.8, transforms: { headRotation: { x: 0, y: 4, z: 0 } }, easing: "ease-in-out" },
      { time: 1, transforms: { headRotation: { x: 0, y: 0, z: 0 } }, easing: "ease-out" },
    ],
    duration: 500,
    priority: 5,
    interruptible: true,
    loopable: false,
    blendIn: 50,
    blendOut: 100,
  },
  lean_forward: {
    type: "lean_forward",
    keyframes: [
      { time: 0, transforms: { bodyLean: { x: 0, y: 0 } } },
      { time: 0.4, transforms: { bodyLean: { x: 5, y: 0 } }, easing: "ease-out" },
      { time: 0.7, transforms: { bodyLean: { x: 4, y: 0 } }, easing: "ease-in-out" },
      { time: 1, transforms: { bodyLean: { x: 0, y: 0 } }, easing: "ease-out" },
    ],
    duration: 800,
    priority: 3,
    interruptible: true,
    loopable: false,
    blendIn: 150,
    blendOut: 200,
  },
  lean_back: {
    type: "lean_back",
    keyframes: [
      { time: 0, transforms: { bodyLean: { x: 0, y: 0 } } },
      { time: 0.3, transforms: { bodyLean: { x: -4, y: 0 } }, easing: "ease-out" },
      { time: 0.6, transforms: { bodyLean: { x: -3, y: 0 } }, easing: "ease-in-out" },
      { time: 1, transforms: { bodyLean: { x: 0, y: 0 } }, easing: "ease-out" },
    ],
    duration: 600,
    priority: 3,
    interruptible: true,
    loopable: false,
    blendIn: 100,
    blendOut: 150,
  },
  shrug: {
    type: "shrug",
    keyframes: [
      { time: 0, transforms: { shoulderOffset: { left: 0, right: 0 }, headRotation: { x: 0, y: 0, z: 0 } } },
      { time: 0.3, transforms: { shoulderOffset: { left: 15, right: 15 }, headRotation: { x: 0, y: 0, z: 5 } }, easing: "ease-out" },
      { time: 0.6, transforms: { shoulderOffset: { left: 12, right: 12 }, headRotation: { x: 0, y: 0, z: 3 } }, easing: "ease-in-out" },
      { time: 1, transforms: { shoulderOffset: { left: 0, right: 0 }, headRotation: { x: 0, y: 0, z: 0 } }, easing: "ease-out" },
    ],
    duration: 700,
    priority: 4,
    interruptible: true,
    loopable: false,
    blendIn: 100,
    blendOut: 150,
  },
  thinking_pose: {
    type: "thinking_pose",
    keyframes: [
      { time: 0, transforms: { headRotation: { x: 0, y: 0, z: 0 } }, blendShapes: { eyeLookUpL: 0, eyeLookUpR: 0 } },
      { time: 0.3, transforms: { headRotation: { x: -5, y: 10, z: 3 } }, blendShapes: { eyeLookUpL: 0.3, eyeLookUpR: 0.3 }, easing: "ease-out" },
      { time: 0.7, transforms: { headRotation: { x: -4, y: 8, z: 2 } }, blendShapes: { eyeLookUpL: 0.25, eyeLookUpR: 0.25 }, easing: "ease-in-out" },
      { time: 1, transforms: { headRotation: { x: 0, y: 0, z: 0 } }, blendShapes: { eyeLookUpL: 0, eyeLookUpR: 0 }, easing: "ease-out" },
    ],
    duration: 1200,
    priority: 6,
    interruptible: true,
    loopable: false,
    blendIn: 200,
    blendOut: 300,
  },
  listening_pose: {
    type: "listening_pose",
    keyframes: [
      { time: 0, transforms: { headRotation: { x: 0, y: 0, z: 0 }, bodyLean: { x: 0, y: 0 } } },
      { time: 0.4, transforms: { headRotation: { x: 5, y: -3, z: 5 }, bodyLean: { x: 3, y: 0 } }, easing: "ease-out" },
      { time: 1, transforms: { headRotation: { x: 4, y: -2, z: 4 }, bodyLean: { x: 2, y: 0 } }, easing: "ease-in-out" },
    ],
    duration: 600,
    priority: 5,
    interruptible: true,
    loopable: true,
    blendIn: 150,
    blendOut: 200,
  },
  speaking_gesture: {
    type: "speaking_gesture",
    keyframes: [
      { time: 0, transforms: { headRotation: { x: 0, y: 0, z: 0 } } },
      { time: 0.2, transforms: { headRotation: { x: 2, y: -5, z: 0 } }, easing: "ease-out" },
      { time: 0.5, transforms: { headRotation: { x: 0, y: 3, z: 2 } }, easing: "ease-in-out" },
      { time: 0.8, transforms: { headRotation: { x: -2, y: -2, z: -1 } }, easing: "ease-in-out" },
      { time: 1, transforms: { headRotation: { x: 0, y: 0, z: 0 } }, easing: "ease-out" },
    ],
    duration: 800,
    priority: 4,
    interruptible: true,
    loopable: true,
    blendIn: 100,
    blendOut: 150,
  },
  emphasis_gesture: {
    type: "emphasis_gesture",
    keyframes: [
      { time: 0, transforms: { headRotation: { x: 0, y: 0, z: 0 }, bodyLean: { x: 0, y: 0 } } },
      { time: 0.3, transforms: { headRotation: { x: -5, y: 0, z: 0 }, bodyLean: { x: 4, y: 0 } }, easing: "ease-out" },
      { time: 0.5, transforms: { headRotation: { x: -3, y: 0, z: 0 }, bodyLean: { x: 2, y: 0 } }, easing: "spring" },
      { time: 1, transforms: { headRotation: { x: 0, y: 0, z: 0 }, bodyLean: { x: 0, y: 0 } }, easing: "ease-out" },
    ],
    duration: 500,
    priority: 6,
    interruptible: false,
    loopable: false,
    blendIn: 50,
    blendOut: 100,
  },
  acknowledgment: {
    type: "acknowledgment",
    keyframes: [
      { time: 0, transforms: { headRotation: { x: 0, y: 0, z: 0 } }, blendShapes: { mouthSmileL: 0, mouthSmileR: 0 } },
      { time: 0.3, transforms: { headRotation: { x: -6, y: 0, z: 0 } }, blendShapes: { mouthSmileL: 0.2, mouthSmileR: 0.2 }, easing: "ease-out" },
      { time: 0.6, transforms: { headRotation: { x: 2, y: 0, z: 0 } }, blendShapes: { mouthSmileL: 0.15, mouthSmileR: 0.15 }, easing: "ease-in-out" },
      { time: 1, transforms: { headRotation: { x: 0, y: 0, z: 0 } }, blendShapes: { mouthSmileL: 0, mouthSmileR: 0 }, easing: "ease-out" },
    ],
    duration: 450,
    priority: 5,
    interruptible: true,
    loopable: false,
    blendIn: 50,
    blendOut: 100,
  },
  surprise_reaction: {
    type: "surprise_reaction",
    keyframes: [
      { time: 0, transforms: { headRotation: { x: 0, y: 0, z: 0 }, bodyLean: { x: 0, y: 0 } }, blendShapes: { eyeWideL: 0, eyeWideR: 0, browInnerUp: 0 } },
      { time: 0.15, transforms: { headRotation: { x: 5, y: 0, z: 0 }, bodyLean: { x: -3, y: 0 } }, blendShapes: { eyeWideL: 0.5, eyeWideR: 0.5, browInnerUp: 0.6 }, easing: "ease-out" },
      { time: 0.4, transforms: { headRotation: { x: 3, y: 0, z: 0 }, bodyLean: { x: -1, y: 0 } }, blendShapes: { eyeWideL: 0.3, eyeWideR: 0.3, browInnerUp: 0.4 }, easing: "ease-in-out" },
      { time: 1, transforms: { headRotation: { x: 0, y: 0, z: 0 }, bodyLean: { x: 0, y: 0 } }, blendShapes: { eyeWideL: 0, eyeWideR: 0, browInnerUp: 0 }, easing: "ease-out" },
    ],
    duration: 600,
    priority: 7,
    interruptible: false,
    loopable: false,
    blendIn: 30,
    blendOut: 150,
  },
  empathy_lean: {
    type: "empathy_lean",
    keyframes: [
      { time: 0, transforms: { headRotation: { x: 0, y: 0, z: 0 }, bodyLean: { x: 0, y: 0 } }, blendShapes: { browInnerUp: 0, eyeSquintL: 0, eyeSquintR: 0 } },
      { time: 0.4, transforms: { headRotation: { x: 5, y: -5, z: 8 }, bodyLean: { x: 4, y: 0 } }, blendShapes: { browInnerUp: 0.3, eyeSquintL: 0.1, eyeSquintR: 0.1 }, easing: "ease-out" },
      { time: 0.7, transforms: { headRotation: { x: 4, y: -4, z: 6 }, bodyLean: { x: 3, y: 0 } }, blendShapes: { browInnerUp: 0.25, eyeSquintL: 0.08, eyeSquintR: 0.08 }, easing: "ease-in-out" },
      { time: 1, transforms: { headRotation: { x: 0, y: 0, z: 0 }, bodyLean: { x: 0, y: 0 } }, blendShapes: { browInnerUp: 0, eyeSquintL: 0, eyeSquintR: 0 }, easing: "ease-out" },
    ],
    duration: 900,
    priority: 5,
    interruptible: true,
    loopable: false,
    blendIn: 150,
    blendOut: 200,
  },
  excitement_bounce: {
    type: "excitement_bounce",
    keyframes: [
      { time: 0, transforms: { bodyLean: { x: 0, y: 0 } }, blendShapes: { mouthSmileL: 0, mouthSmileR: 0, eyeWideL: 0, eyeWideR: 0 } },
      { time: 0.15, transforms: { bodyLean: { x: 3, y: 5 } }, blendShapes: { mouthSmileL: 0.4, mouthSmileR: 0.4, eyeWideL: 0.2, eyeWideR: 0.2 }, easing: "ease-out" },
      { time: 0.35, transforms: { bodyLean: { x: 0, y: -2 } }, blendShapes: { mouthSmileL: 0.5, mouthSmileR: 0.5, eyeWideL: 0.15, eyeWideR: 0.15 }, easing: "spring" },
      { time: 0.55, transforms: { bodyLean: { x: 2, y: 3 } }, blendShapes: { mouthSmileL: 0.4, mouthSmileR: 0.4, eyeWideL: 0.1, eyeWideR: 0.1 }, easing: "spring" },
      { time: 1, transforms: { bodyLean: { x: 0, y: 0 } }, blendShapes: { mouthSmileL: 0, mouthSmileR: 0, eyeWideL: 0, eyeWideR: 0 }, easing: "ease-out" },
    ],
    duration: 700,
    priority: 6,
    interruptible: true,
    loopable: false,
    blendIn: 50,
    blendOut: 150,
  },
};

const DEFAULT_CONFIG: ReactiveAnimationConfig = {
  enabled: true,
  maxQueueSize: 5,
  defaultBlendTime: 100,
  naturalVariation: 0.15,
  responsiveness: 0.8,
  subtlety: 0.7,
  enableAnticipation: true,
  anticipationTime: 200,
};

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `anim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function applyEasing(t: number, easing: AnimationKeyframe["easing"]): number {
  switch (easing) {
    case "ease-in":
      return t * t * t;
    case "ease-out":
      return 1 - Math.pow(1 - t, 3);
    case "ease-in-out":
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case "spring":
      const c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    default:
      return t;
  }
}

function interpolateKeyframes(
  keyframes: AnimationKeyframe[],
  progress: number,
  subtlety: number
): { transforms: AnimationKeyframe["transforms"]; blendShapes: Record<string, number> } {
  // Find surrounding keyframes
  let prevFrame = keyframes[0];
  let nextFrame = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (progress >= keyframes[i].time && progress <= keyframes[i + 1].time) {
      prevFrame = keyframes[i];
      nextFrame = keyframes[i + 1];
      break;
    }
  }

  // Calculate local progress
  const localProgress = nextFrame.time === prevFrame.time
    ? 1
    : (progress - prevFrame.time) / (nextFrame.time - prevFrame.time);

  const easedProgress = applyEasing(localProgress, nextFrame.easing || "linear");

  // Interpolate transforms
  const transforms: AnimationKeyframe["transforms"] = {};

  if (prevFrame.transforms?.headRotation && nextFrame.transforms?.headRotation) {
    transforms.headRotation = {
      x: (prevFrame.transforms.headRotation.x + (nextFrame.transforms.headRotation.x - prevFrame.transforms.headRotation.x) * easedProgress) * subtlety,
      y: (prevFrame.transforms.headRotation.y + (nextFrame.transforms.headRotation.y - prevFrame.transforms.headRotation.y) * easedProgress) * subtlety,
      z: (prevFrame.transforms.headRotation.z + (nextFrame.transforms.headRotation.z - prevFrame.transforms.headRotation.z) * easedProgress) * subtlety,
    };
  }

  if (prevFrame.transforms?.bodyLean && nextFrame.transforms?.bodyLean) {
    transforms.bodyLean = {
      x: (prevFrame.transforms.bodyLean.x + (nextFrame.transforms.bodyLean.x - prevFrame.transforms.bodyLean.x) * easedProgress) * subtlety,
      y: (prevFrame.transforms.bodyLean.y + (nextFrame.transforms.bodyLean.y - prevFrame.transforms.bodyLean.y) * easedProgress) * subtlety,
    };
  }

  if (prevFrame.transforms?.shoulderOffset && nextFrame.transforms?.shoulderOffset) {
    transforms.shoulderOffset = {
      left: (prevFrame.transforms.shoulderOffset.left + (nextFrame.transforms.shoulderOffset.left - prevFrame.transforms.shoulderOffset.left) * easedProgress) * subtlety,
      right: (prevFrame.transforms.shoulderOffset.right + (nextFrame.transforms.shoulderOffset.right - prevFrame.transforms.shoulderOffset.right) * easedProgress) * subtlety,
    };
  }

  // Interpolate blend shapes
  const blendShapes: Record<string, number> = {};
  const allKeys = new Set([
    ...Object.keys(prevFrame.blendShapes || {}),
    ...Object.keys(nextFrame.blendShapes || {}),
  ]);

  allKeys.forEach((key) => {
    const prevVal = prevFrame.blendShapes?.[key] || 0;
    const nextVal = nextFrame.blendShapes?.[key] || 0;
    blendShapes[key] = (prevVal + (nextVal - prevVal) * easedProgress) * subtlety;
  });

  return { transforms, blendShapes };
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarReactiveAnimations(
  config: Partial<ReactiveAnimationConfig> = {}
): UseAvatarReactiveAnimationsResult {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [state, setState] = useState<AnimationState>({
    current: null,
    phase: "idle",
    progress: 0,
    queue: [],
    blendWeight: 0,
    transforms: {},
    blendShapes: {},
  });

  const [subtlety, setSubtletyState] = useState(mergedConfig.subtlety);
  const [isAnticipating, setIsAnticipating] = useState(false);

  // Metrics
  const metricsRef = useRef<AnimationMetrics>({
    totalPlayed: 0,
    byType: {} as Record<ReactiveAnimationType, number>,
    averageDuration: 0,
    interruptionRate: 0,
    queueDepth: 0,
  });

  // Animation frame
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const isPausedRef = useRef(false);

  // Process animation frame
  const processFrame = useCallback(() => {
    if (isPausedRef.current || !state.current) return;

    const elapsed = Date.now() - startTimeRef.current;
    const duration = state.current.duration;
    let progress = Math.min(elapsed / duration, 1);

    // Handle blending phases
    let phase: AnimationPhase = "playing";
    let blendWeight = 1;

    if (elapsed < state.current.blendIn) {
      phase = "blending";
      blendWeight = elapsed / state.current.blendIn;
    } else if (elapsed > duration - state.current.blendOut) {
      phase = "recovering";
      blendWeight = (duration - elapsed) / state.current.blendOut;
    }

    // Interpolate animation
    const { transforms, blendShapes } = interpolateKeyframes(
      state.current.keyframes,
      progress,
      subtlety
    );

    // Apply blend weight
    const blendedTransforms: AnimationKeyframe["transforms"] = {};
    if (transforms.headRotation) {
      blendedTransforms.headRotation = {
        x: transforms.headRotation.x * blendWeight,
        y: transforms.headRotation.y * blendWeight,
        z: transforms.headRotation.z * blendWeight,
      };
    }
    if (transforms.bodyLean) {
      blendedTransforms.bodyLean = {
        x: transforms.bodyLean.x * blendWeight,
        y: transforms.bodyLean.y * blendWeight,
      };
    }
    if (transforms.shoulderOffset) {
      blendedTransforms.shoulderOffset = {
        left: transforms.shoulderOffset.left * blendWeight,
        right: transforms.shoulderOffset.right * blendWeight,
      };
    }

    const blendedBlendShapes: Record<string, number> = {};
    Object.entries(blendShapes).forEach(([key, value]) => {
      blendedBlendShapes[key] = value * blendWeight;
    });

    setState((prev) => ({
      ...prev,
      phase,
      progress,
      blendWeight,
      transforms: blendedTransforms,
      blendShapes: blendedBlendShapes,
    }));

    // Check if animation complete
    if (progress >= 1) {
      // Handle looping
      if (state.current.loopable) {
        startTimeRef.current = Date.now();
        animationFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      // Play next in queue
      setState((prev) => {
        const next = prev.queue[0];
        if (next) {
          startTimeRef.current = Date.now();
          return {
            ...prev,
            current: next,
            queue: prev.queue.slice(1),
            phase: "blending",
            progress: 0,
          };
        }
        return {
          ...prev,
          current: null,
          phase: "idle",
          progress: 0,
          blendWeight: 0,
          transforms: {},
          blendShapes: {},
        };
      });

      if (state.queue.length > 0) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
      }
      return;
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [state.current, state.queue, subtlety]);

  // Start animation loop when current changes
  useEffect(() => {
    if (state.current && state.phase !== "idle") {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.current?.id, processFrame]);

  // Controls
  const play = useCallback(
    (type: ReactiveAnimationType, trigger: AnimationTrigger = "manual") => {
      if (!mergedConfig.enabled) return;

      const template = ANIMATION_LIBRARY[type];
      if (!template) return;

      const animation: ReactiveAnimation = {
        ...template,
        id: generateId(),
        trigger,
      };

      // Check if we should interrupt current
      if (state.current && !state.current.interruptible && animation.priority <= state.current.priority) {
        return;
      }

      metricsRef.current.totalPlayed++;
      metricsRef.current.byType[type] = (metricsRef.current.byType[type] || 0) + 1;

      startTimeRef.current = Date.now();
      setState((prev) => ({
        ...prev,
        current: animation,
        phase: "blending",
        progress: 0,
      }));
    },
    [mergedConfig.enabled, state.current]
  );

  const queue = useCallback(
    (type: ReactiveAnimationType, trigger: AnimationTrigger = "manual") => {
      if (!mergedConfig.enabled) return;

      const template = ANIMATION_LIBRARY[type];
      if (!template) return;

      setState((prev) => {
        if (prev.queue.length >= mergedConfig.maxQueueSize) {
          return prev;
        }

        const animation: ReactiveAnimation = {
          ...template,
          id: generateId(),
          trigger,
        };

        return {
          ...prev,
          queue: [...prev.queue, animation],
        };
      });
    },
    [mergedConfig.enabled, mergedConfig.maxQueueSize]
  );

  const interrupt = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setState((prev) => ({
      ...prev,
      current: null,
      phase: "idle",
      progress: 0,
      blendWeight: 0,
      transforms: {},
      blendShapes: {},
    }));
  }, []);

  const pause = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    if (state.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }
  }, [state.current, processFrame]);

  const clearQueue = useCallback(() => {
    setState((prev) => ({ ...prev, queue: [] }));
  }, []);

  const setSubtlety = useCallback((value: number) => {
    setSubtletyState(Math.max(0, Math.min(1, value)));
  }, []);

  const anticipate = useCallback(
    (trigger: AnimationTrigger) => {
      if (!mergedConfig.enableAnticipation) return;

      setIsAnticipating(true);

      // Play subtle anticipation animation
      if (trigger === "ai_speaking") {
        play("thinking_pose", "ai_thinking");
      } else if (trigger === "user_speaking") {
        play("listening_pose", "user_speaking");
      }

      setTimeout(() => setIsAnticipating(false), mergedConfig.anticipationTime);
    },
    [mergedConfig.enableAnticipation, mergedConfig.anticipationTime, play]
  );

  const controls: ReactiveAnimationControls = useMemo(
    () => ({
      play,
      queue,
      interrupt,
      pause,
      resume,
      clearQueue,
      setSubtlety,
      anticipate,
    }),
    [play, queue, interrupt, pause, resume, clearQueue, setSubtlety, anticipate]
  );

  return {
    state,
    metrics: metricsRef.current,
    controls,
    currentTransforms: state.transforms,
    currentBlendShapes: state.blendShapes,
    isAnimating: state.phase !== "idle",
    isAnticipating,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for conversation-driven animations
 */
export function useConversationAnimations(
  isUserSpeaking: boolean,
  isAISpeaking: boolean,
  isAIThinking: boolean,
  config?: Partial<ReactiveAnimationConfig>
): { transforms: AnimationKeyframe["transforms"]; blendShapes: Record<string, number> } {
  const { controls, currentTransforms, currentBlendShapes } = useAvatarReactiveAnimations(config);
  const prevStateRef = useRef({ isUserSpeaking, isAISpeaking, isAIThinking });

  useEffect(() => {
    const prev = prevStateRef.current;

    // User started speaking
    if (isUserSpeaking && !prev.isUserSpeaking) {
      controls.play("listening_pose", "user_speaking");
    }

    // User stopped speaking
    if (!isUserSpeaking && prev.isUserSpeaking) {
      controls.play("acknowledgment", "user_finished");
    }

    // AI started thinking
    if (isAIThinking && !prev.isAIThinking) {
      controls.play("thinking_pose", "ai_thinking");
    }

    // AI started speaking
    if (isAISpeaking && !prev.isAISpeaking) {
      controls.play("speaking_gesture", "ai_speaking");
    }

    prevStateRef.current = { isUserSpeaking, isAISpeaking, isAIThinking };
  }, [isUserSpeaking, isAISpeaking, isAIThinking, controls]);

  return { transforms: currentTransforms, blendShapes: currentBlendShapes };
}

export default useAvatarReactiveAnimations;
