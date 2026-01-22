"use client";

/**
 * useAvatarIdleVariation - Natural Idle Movement System
 *
 * Generates subtle, natural-looking idle movements to prevent
 * avatar from looking static. Includes weight shifts, micro-movements,
 * and occasional behaviors.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// Idle behavior types
export type IdleBehavior =
  | "weight_shift"     // Subtle weight redistribution
  | "head_micro"       // Tiny head movements
  | "shoulder_adjust"  // Shoulder position adjustment
  | "posture_shift"    // Larger posture change
  | "look_around"      // Brief gaze shifts
  | "settle"           // Settling into position
  | "fidget"           // Small restless movement
  | "stretch";         // Subtle stretch

interface IdleVariationState {
  // Current position offsets (normalized -1 to 1)
  position: {
    x: number;      // Horizontal sway
    y: number;      // Vertical bob
    z: number;      // Forward/back lean
  };

  // Current rotation offsets (degrees)
  rotation: {
    pitch: number;  // Forward/back tilt
    yaw: number;    // Left/right turn
    roll: number;   // Side tilt
  };

  // Current scale variations
  scale: {
    x: number;      // Width variation
    y: number;      // Height variation
  };

  // Active behavior (if any)
  activeBehavior: IdleBehavior | null;

  // Energy level (affects movement intensity)
  energyLevel: number;

  // Whether currently in a behavior transition
  isTransitioning: boolean;
}

interface IdleVariationControls {
  // Set energy level (0=calm, 1=alert)
  setEnergyLevel: (level: number) => void;

  // Trigger specific behavior
  triggerBehavior: (behavior: IdleBehavior) => void;

  // Pause all idle movements
  pause: () => void;

  // Resume idle movements
  resume: () => void;

  // Reset to neutral
  reset: () => void;

  // Set movement intensity multiplier
  setIntensity: (multiplier: number) => void;
}

interface UseAvatarIdleVariationOptions {
  // Whether to auto-start
  autoStart?: boolean;

  // Base movement intensity (0-1)
  intensity?: number;

  // Speed of movements (1 = normal)
  speed?: number;

  // Whether to include occasional behaviors
  includeBehaviors?: boolean;

  // Behavior frequency (average ms between behaviors)
  behaviorInterval?: number;

  // Which behaviors to enable
  enabledBehaviors?: IdleBehavior[];

  // Callback when behavior triggers
  onBehavior?: (behavior: IdleBehavior) => void;
}

interface UseAvatarIdleVariationResult {
  state: IdleVariationState;
  controls: IdleVariationControls;
  isActive: boolean;
}

// Perlin-like noise function for smooth random movement
function smoothNoise(t: number, seed: number = 0): number {
  const x = t + seed;
  return (
    Math.sin(x * 1.0) * 0.5 +
    Math.sin(x * 2.3 + 1.2) * 0.25 +
    Math.sin(x * 4.1 + 2.3) * 0.125 +
    Math.sin(x * 7.9 + 3.4) * 0.0625
  ) / 0.9375;
}

// Behavior animation definitions
interface BehaviorAnimation {
  duration: number;
  keyframes: Array<{
    time: number; // 0-1 progress
    position: { x: number; y: number; z: number };
    rotation: { pitch: number; yaw: number; roll: number };
  }>;
}

const BEHAVIOR_ANIMATIONS: Record<IdleBehavior, BehaviorAnimation> = {
  weight_shift: {
    duration: 2000,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 0.4, position: { x: 0.15, y: -0.02, z: 0 }, rotation: { pitch: 0, yaw: 2, roll: 2 } },
      { time: 0.6, position: { x: 0.15, y: -0.02, z: 0 }, rotation: { pitch: 0, yaw: 2, roll: 2 } },
      { time: 1, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
    ],
  },
  head_micro: {
    duration: 800,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 0.3, position: { x: 0, y: 0.01, z: 0 }, rotation: { pitch: 2, yaw: 3, roll: 0 } },
      { time: 0.7, position: { x: 0, y: 0.01, z: 0 }, rotation: { pitch: 2, yaw: 3, roll: 0 } },
      { time: 1, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
    ],
  },
  shoulder_adjust: {
    duration: 1500,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 0.3, position: { x: 0, y: 0.05, z: -0.02 }, rotation: { pitch: -2, yaw: 0, roll: 0 } },
      { time: 0.6, position: { x: 0, y: 0.03, z: -0.01 }, rotation: { pitch: -1, yaw: 0, roll: 0 } },
      { time: 1, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
    ],
  },
  posture_shift: {
    duration: 3000,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 0.3, position: { x: 0.05, y: 0.02, z: 0.05 }, rotation: { pitch: 3, yaw: 5, roll: 1 } },
      { time: 0.7, position: { x: 0.05, y: 0.02, z: 0.05 }, rotation: { pitch: 3, yaw: 5, roll: 1 } },
      { time: 1, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
    ],
  },
  look_around: {
    duration: 2500,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 0.2, position: { x: 0, y: 0.01, z: 0 }, rotation: { pitch: -3, yaw: 15, roll: 0 } },
      { time: 0.5, position: { x: 0, y: 0.01, z: 0 }, rotation: { pitch: 2, yaw: -10, roll: 0 } },
      { time: 0.8, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 5, roll: 0 } },
      { time: 1, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
    ],
  },
  settle: {
    duration: 1200,
    keyframes: [
      { time: 0, position: { x: 0, y: 0.03, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 0.4, position: { x: 0, y: -0.02, z: 0 }, rotation: { pitch: 1, yaw: 0, roll: 0 } },
      { time: 0.7, position: { x: 0, y: 0.01, z: 0 }, rotation: { pitch: -0.5, yaw: 0, roll: 0 } },
      { time: 1, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
    ],
  },
  fidget: {
    duration: 600,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 0.3, position: { x: -0.02, y: 0.01, z: 0 }, rotation: { pitch: 0, yaw: -2, roll: -1 } },
      { time: 0.6, position: { x: 0.02, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 2, roll: 1 } },
      { time: 1, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
    ],
  },
  stretch: {
    duration: 2500,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      { time: 0.3, position: { x: 0, y: 0.08, z: -0.03 }, rotation: { pitch: -8, yaw: 0, roll: 0 } },
      { time: 0.5, position: { x: 0, y: 0.1, z: -0.04 }, rotation: { pitch: -10, yaw: 0, roll: 0 } },
      { time: 0.8, position: { x: 0, y: 0.05, z: -0.02 }, rotation: { pitch: -5, yaw: 0, roll: 0 } },
      { time: 1, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } },
    ],
  },
};

export function useAvatarIdleVariation(
  options: UseAvatarIdleVariationOptions = {}
): UseAvatarIdleVariationResult {
  const {
    autoStart = true,
    intensity = 0.5,
    speed = 1,
    includeBehaviors = true,
    behaviorInterval = 8000,
    enabledBehaviors = ["weight_shift", "head_micro", "shoulder_adjust", "settle"],
    onBehavior,
  } = options;

  // State
  const [isActive, setIsActive] = useState(autoStart);
  const [intensityMultiplier, setIntensityMultiplier] = useState(1);
  const [energyLevel, setEnergyLevelState] = useState(0.5);
  const [activeBehavior, setActiveBehavior] = useState<IdleBehavior | null>(null);
  const [behaviorProgress, setBehaviorProgress] = useState(0);
  const [baseOffset, setBaseOffset] = useState({
    position: { x: 0, y: 0, z: 0 },
    rotation: { pitch: 0, yaw: 0, roll: 0 },
  });

  // Refs
  const animationFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const behaviorStartTimeRef = useRef<number>(0);
  const behaviorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seedsRef = useRef({
    posX: Math.random() * 1000,
    posY: Math.random() * 1000,
    posZ: Math.random() * 1000,
    rotPitch: Math.random() * 1000,
    rotYaw: Math.random() * 1000,
    rotRoll: Math.random() * 1000,
  });

  // Calculate effective intensity
  const effectiveIntensity = intensity * intensityMultiplier * (0.5 + energyLevel * 0.5);

  // Interpolate behavior keyframes
  const interpolateBehavior = useCallback(
    (animation: BehaviorAnimation, progress: number) => {
      const { keyframes } = animation;

      // Find surrounding keyframes
      let prevFrame = keyframes[0];
      let nextFrame = keyframes[keyframes.length - 1];

      for (let i = 0; i < keyframes.length - 1; i++) {
        if (progress >= keyframes[i].time && progress < keyframes[i + 1].time) {
          prevFrame = keyframes[i];
          nextFrame = keyframes[i + 1];
          break;
        }
      }

      // Interpolate
      const frameDuration = nextFrame.time - prevFrame.time;
      const frameProgress = frameDuration > 0 ? (progress - prevFrame.time) / frameDuration : 1;

      // Smooth easing
      const easedProgress = 1 - Math.pow(1 - frameProgress, 2);

      const lerp = (a: number, b: number) => a + (b - a) * easedProgress;

      return {
        position: {
          x: lerp(prevFrame.position.x, nextFrame.position.x),
          y: lerp(prevFrame.position.y, nextFrame.position.y),
          z: lerp(prevFrame.position.z, nextFrame.position.z),
        },
        rotation: {
          pitch: lerp(prevFrame.rotation.pitch, nextFrame.rotation.pitch),
          yaw: lerp(prevFrame.rotation.yaw, nextFrame.rotation.yaw),
          roll: lerp(prevFrame.rotation.roll, nextFrame.rotation.roll),
        },
      };
    },
    []
  );

  // Main animation loop
  const animate = useCallback(
    (timestamp: number) => {
      if (!isActive) return;

      if (startTimeRef.current === 0) {
        startTimeRef.current = timestamp;
      }

      const elapsed = (timestamp - startTimeRef.current) / 1000 * speed;
      const seeds = seedsRef.current;

      // Calculate continuous noise-based movement
      const noisePosition = {
        x: smoothNoise(elapsed * 0.3, seeds.posX) * 0.02 * effectiveIntensity,
        y: smoothNoise(elapsed * 0.4, seeds.posY) * 0.015 * effectiveIntensity,
        z: smoothNoise(elapsed * 0.25, seeds.posZ) * 0.01 * effectiveIntensity,
      };

      const noiseRotation = {
        pitch: smoothNoise(elapsed * 0.35, seeds.rotPitch) * 2 * effectiveIntensity,
        yaw: smoothNoise(elapsed * 0.2, seeds.rotYaw) * 3 * effectiveIntensity,
        roll: smoothNoise(elapsed * 0.15, seeds.rotRoll) * 1 * effectiveIntensity,
      };

      // Handle active behavior
      let behaviorOffset = {
        position: { x: 0, y: 0, z: 0 },
        rotation: { pitch: 0, yaw: 0, roll: 0 },
      };

      if (activeBehavior) {
        const animation = BEHAVIOR_ANIMATIONS[activeBehavior];
        const behaviorElapsed = timestamp - behaviorStartTimeRef.current;
        const progress = Math.min(behaviorElapsed / animation.duration, 1);

        setBehaviorProgress(progress);

        if (progress >= 1) {
          setActiveBehavior(null);
          setBehaviorProgress(0);
        } else {
          behaviorOffset = interpolateBehavior(animation, progress);
        }
      }

      // Combine noise and behavior
      setBaseOffset({
        position: {
          x: noisePosition.x + behaviorOffset.position.x * effectiveIntensity,
          y: noisePosition.y + behaviorOffset.position.y * effectiveIntensity,
          z: noisePosition.z + behaviorOffset.position.z * effectiveIntensity,
        },
        rotation: {
          pitch: noiseRotation.pitch + behaviorOffset.rotation.pitch * effectiveIntensity,
          yaw: noiseRotation.yaw + behaviorOffset.rotation.yaw * effectiveIntensity,
          roll: noiseRotation.roll + behaviorOffset.rotation.roll * effectiveIntensity,
        },
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [isActive, speed, effectiveIntensity, activeBehavior, interpolateBehavior]
  );

  // Start animation loop
  useEffect(() => {
    if (isActive) {
      startTimeRef.current = 0;
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, animate]);

  // Schedule random behaviors
  useEffect(() => {
    if (!includeBehaviors || !isActive || enabledBehaviors.length === 0) return;

    const scheduleBehavior = () => {
      const delay = behaviorInterval * (0.5 + Math.random());

      behaviorTimeoutRef.current = setTimeout(() => {
        // Don't interrupt active behavior
        if (!activeBehavior) {
          const behavior = enabledBehaviors[Math.floor(Math.random() * enabledBehaviors.length)];
          setActiveBehavior(behavior);
          behaviorStartTimeRef.current = performance.now();
          onBehavior?.(behavior);
        }
        scheduleBehavior();
      }, delay);
    };

    scheduleBehavior();

    return () => {
      if (behaviorTimeoutRef.current) {
        clearTimeout(behaviorTimeoutRef.current);
      }
    };
  }, [includeBehaviors, isActive, behaviorInterval, enabledBehaviors, activeBehavior, onBehavior]);

  // Build state
  const state = useMemo((): IdleVariationState => ({
    position: baseOffset.position,
    rotation: baseOffset.rotation,
    scale: {
      x: 1 + baseOffset.position.x * 0.01,
      y: 1 + baseOffset.position.y * 0.02,
    },
    activeBehavior,
    energyLevel,
    isTransitioning: activeBehavior !== null,
  }), [baseOffset, activeBehavior, energyLevel]);

  // Controls
  const setEnergyLevel = useCallback((level: number) => {
    setEnergyLevelState(Math.max(0, Math.min(1, level)));
  }, []);

  const triggerBehavior = useCallback((behavior: IdleBehavior) => {
    setActiveBehavior(behavior);
    behaviorStartTimeRef.current = performance.now();
    onBehavior?.(behavior);
  }, [onBehavior]);

  const pause = useCallback(() => {
    setIsActive(false);
  }, []);

  const resume = useCallback(() => {
    setIsActive(true);
    startTimeRef.current = 0;
  }, []);

  const reset = useCallback(() => {
    setIsActive(autoStart);
    setActiveBehavior(null);
    setBehaviorProgress(0);
    setEnergyLevelState(0.5);
    setIntensityMultiplier(1);
    setBaseOffset({
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: 0, roll: 0 },
    });
    startTimeRef.current = 0;
  }, [autoStart]);

  const setIntensity = useCallback((multiplier: number) => {
    setIntensityMultiplier(Math.max(0, Math.min(2, multiplier)));
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (behaviorTimeoutRef.current) {
        clearTimeout(behaviorTimeoutRef.current);
      }
    };
  }, []);

  const controls = useMemo(
    (): IdleVariationControls => ({
      setEnergyLevel,
      triggerBehavior,
      pause,
      resume,
      reset,
      setIntensity,
    }),
    [setEnergyLevel, triggerBehavior, pause, resume, reset, setIntensity]
  );

  return { state, controls, isActive };
}

/**
 * Hook for simple idle movement values
 */
export function useIdleMovement(intensity: number = 0.5): {
  x: number;
  y: number;
  rotation: number;
} {
  const { state } = useAvatarIdleVariation({ intensity });

  return {
    x: state.position.x,
    y: state.position.y,
    rotation: state.rotation.yaw,
  };
}

/**
 * Hook for idle variation CSS transform
 */
export function useIdleTransform(
  intensity: number = 0.5
): React.CSSProperties {
  const { state } = useAvatarIdleVariation({ intensity });

  return useMemo(
    () => ({
      transform: `
        translate(${state.position.x * 10}px, ${state.position.y * 10}px)
        rotateX(${state.rotation.pitch}deg)
        rotateY(${state.rotation.yaw}deg)
        rotateZ(${state.rotation.roll}deg)
      `.replace(/\s+/g, " ").trim(),
      transition: "transform 0.05s linear",
    }),
    [state.position, state.rotation]
  );
}

// Export behavior animations for external use
export { BEHAVIOR_ANIMATIONS };
