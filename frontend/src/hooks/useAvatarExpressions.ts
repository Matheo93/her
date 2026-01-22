"use client";

/**
 * useAvatarExpressions - Facial Expression Management
 *
 * Manages avatar facial expressions with blending, transitions,
 * and micro-expressions for natural-looking animations.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// Expression blend shape names (standard FACS-based)
export type ExpressionBlendShape =
  | "browInnerUp"
  | "browDownLeft"
  | "browDownRight"
  | "browOuterUpLeft"
  | "browOuterUpRight"
  | "eyeLookUpLeft"
  | "eyeLookUpRight"
  | "eyeLookDownLeft"
  | "eyeLookDownRight"
  | "eyeLookInLeft"
  | "eyeLookInRight"
  | "eyeLookOutLeft"
  | "eyeLookOutRight"
  | "eyeBlinkLeft"
  | "eyeBlinkRight"
  | "eyeSquintLeft"
  | "eyeSquintRight"
  | "eyeWideLeft"
  | "eyeWideRight"
  | "cheekPuff"
  | "cheekSquintLeft"
  | "cheekSquintRight"
  | "noseSneerLeft"
  | "noseSneerRight"
  | "jawOpen"
  | "jawForward"
  | "jawLeft"
  | "jawRight"
  | "mouthFunnel"
  | "mouthPucker"
  | "mouthLeft"
  | "mouthRight"
  | "mouthRollUpper"
  | "mouthRollLower"
  | "mouthShrugUpper"
  | "mouthShrugLower"
  | "mouthClose"
  | "mouthSmileLeft"
  | "mouthSmileRight"
  | "mouthFrownLeft"
  | "mouthFrownRight"
  | "mouthDimpleLeft"
  | "mouthDimpleRight"
  | "mouthUpperUpLeft"
  | "mouthUpperUpRight"
  | "mouthLowerDownLeft"
  | "mouthLowerDownRight"
  | "mouthPressLeft"
  | "mouthPressRight"
  | "mouthStretchLeft"
  | "mouthStretchRight"
  | "tongueOut";

// Partial type for blend shape values
export type BlendShapeValues = Partial<Record<ExpressionBlendShape, number>>;

// Predefined expression presets
export type ExpressionPreset =
  | "neutral"
  | "happy"
  | "sad"
  | "surprised"
  | "angry"
  | "disgusted"
  | "fearful"
  | "contempt"
  | "thinking"
  | "confused"
  | "interested"
  | "skeptical";

// Expression preset definitions
const EXPRESSION_PRESETS: Record<ExpressionPreset, BlendShapeValues> = {
  neutral: {},
  happy: {
    mouthSmileLeft: 0.7,
    mouthSmileRight: 0.7,
    cheekSquintLeft: 0.3,
    cheekSquintRight: 0.3,
    eyeSquintLeft: 0.2,
    eyeSquintRight: 0.2,
  },
  sad: {
    browInnerUp: 0.6,
    mouthFrownLeft: 0.5,
    mouthFrownRight: 0.5,
    eyeLookDownLeft: 0.3,
    eyeLookDownRight: 0.3,
  },
  surprised: {
    browInnerUp: 0.8,
    browOuterUpLeft: 0.6,
    browOuterUpRight: 0.6,
    eyeWideLeft: 0.7,
    eyeWideRight: 0.7,
    jawOpen: 0.4,
  },
  angry: {
    browDownLeft: 0.7,
    browDownRight: 0.7,
    eyeSquintLeft: 0.4,
    eyeSquintRight: 0.4,
    jawForward: 0.2,
    mouthPressLeft: 0.3,
    mouthPressRight: 0.3,
  },
  disgusted: {
    noseSneerLeft: 0.6,
    noseSneerRight: 0.6,
    browDownLeft: 0.3,
    browDownRight: 0.3,
    mouthUpperUpLeft: 0.4,
    mouthUpperUpRight: 0.4,
  },
  fearful: {
    browInnerUp: 0.7,
    browOuterUpLeft: 0.5,
    browOuterUpRight: 0.5,
    eyeWideLeft: 0.6,
    eyeWideRight: 0.6,
    mouthStretchLeft: 0.3,
    mouthStretchRight: 0.3,
  },
  contempt: {
    mouthSmileLeft: 0.4,
    browDownRight: 0.2,
    eyeSquintRight: 0.15,
  },
  thinking: {
    browInnerUp: 0.3,
    eyeLookUpLeft: 0.4,
    eyeLookUpRight: 0.4,
    mouthPucker: 0.15,
  },
  confused: {
    browInnerUp: 0.5,
    browDownLeft: 0.3,
    eyeSquintLeft: 0.2,
    mouthFrownLeft: 0.2,
    mouthFrownRight: 0.2,
  },
  interested: {
    browInnerUp: 0.3,
    browOuterUpLeft: 0.2,
    browOuterUpRight: 0.2,
    eyeWideLeft: 0.2,
    eyeWideRight: 0.2,
    mouthSmileLeft: 0.2,
    mouthSmileRight: 0.2,
  },
  skeptical: {
    browOuterUpLeft: 0.5,
    browDownRight: 0.3,
    mouthSmileLeft: 0.2,
    eyeSquintRight: 0.2,
  },
};

interface ExpressionState {
  // Current blended expression values
  blendShapes: BlendShapeValues;

  // Active expression layers (can blend multiple)
  activeLayers: ExpressionLayer[];

  // Whether transitioning
  isTransitioning: boolean;

  // Current preset (if any)
  currentPreset: ExpressionPreset | null;
}

interface ExpressionLayer {
  id: string;
  values: BlendShapeValues;
  weight: number;
  priority: number;
}

interface ExpressionControls {
  // Set expression from preset
  setExpression: (preset: ExpressionPreset, options?: TransitionOptions) => void;

  // Set custom blend shape values
  setBlendShapes: (values: BlendShapeValues, options?: TransitionOptions) => void;

  // Add an expression layer (for blending)
  addLayer: (id: string, values: BlendShapeValues, weight?: number, priority?: number) => void;

  // Remove an expression layer
  removeLayer: (id: string) => void;

  // Update layer weight
  setLayerWeight: (id: string, weight: number) => void;

  // Blend towards target values
  blendTo: (target: BlendShapeValues, duration: number) => void;

  // Reset to neutral
  reset: () => void;

  // Trigger a micro-expression
  triggerMicroExpression: (type: MicroExpressionType) => void;
}

interface TransitionOptions {
  duration?: number;
  easing?: EasingFunction;
  onComplete?: () => void;
}

type EasingFunction = (t: number) => number;
type MicroExpressionType = "blink" | "twitch" | "smirk" | "eyebrow-raise" | "squint";

// Easing functions
const EASINGS: Record<string, EasingFunction> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 2),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

interface UseAvatarExpressionsOptions {
  // Initial expression
  initialExpression?: ExpressionPreset;

  // Default transition duration (ms)
  defaultTransitionDuration?: number;

  // Enable automatic micro-expressions
  enableMicroExpressions?: boolean;

  // Micro-expression interval range [min, max] ms
  microExpressionInterval?: [number, number];

  // Callback when expression changes
  onExpressionChange?: (blendShapes: BlendShapeValues) => void;
}

interface UseAvatarExpressionsResult {
  state: ExpressionState;
  controls: ExpressionControls;
}

export function useAvatarExpressions(
  options: UseAvatarExpressionsOptions = {}
): UseAvatarExpressionsResult {
  const {
    initialExpression = "neutral",
    defaultTransitionDuration = 300,
    enableMicroExpressions = true,
    microExpressionInterval = [3000, 8000],
    onExpressionChange,
  } = options;

  // Current blend shape values
  const [blendShapes, setBlendShapes] = useState<BlendShapeValues>(
    EXPRESSION_PRESETS[initialExpression]
  );

  // Expression layers for blending
  const [layers, setLayers] = useState<ExpressionLayer[]>([]);

  // Transition state
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<ExpressionPreset | null>(
    initialExpression
  );

  // Animation refs
  const animationFrameRef = useRef<number>(0);
  const transitionStartRef = useRef<BlendShapeValues>({});
  const transitionTargetRef = useRef<BlendShapeValues>({});
  const transitionStartTimeRef = useRef<number>(0);
  const transitionDurationRef = useRef<number>(0);
  const transitionEasingRef = useRef<EasingFunction>(EASINGS.easeOut);
  const transitionCallbackRef = useRef<(() => void) | null>(null);

  // Micro-expression timeout
  const microExpressionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Notify on blend shape change
  useEffect(() => {
    onExpressionChange?.(blendShapes);
  }, [blendShapes, onExpressionChange]);

  // Blend function - combines all layers
  const calculateBlendedValues = useCallback(
    (base: BlendShapeValues, layerList: ExpressionLayer[]): BlendShapeValues => {
      const result = { ...base };

      // Sort layers by priority
      const sortedLayers = [...layerList].sort((a, b) => a.priority - b.priority);

      for (const layer of sortedLayers) {
        for (const [key, value] of Object.entries(layer.values)) {
          const blendKey = key as ExpressionBlendShape;
          const currentValue = result[blendKey] || 0;
          // Weighted blend
          result[blendKey] = currentValue + (value - currentValue) * layer.weight;
        }
      }

      return result;
    },
    []
  );

  // Animate transition
  const animateTransition = useCallback(() => {
    const now = performance.now();
    const elapsed = now - transitionStartTimeRef.current;
    const progress = Math.min(elapsed / transitionDurationRef.current, 1);
    const easedProgress = transitionEasingRef.current(progress);

    // Interpolate blend shapes
    const interpolated: BlendShapeValues = {};
    const allKeys = new Set([
      ...Object.keys(transitionStartRef.current),
      ...Object.keys(transitionTargetRef.current),
    ]) as Set<ExpressionBlendShape>;

    for (const key of allKeys) {
      const startValue = transitionStartRef.current[key] || 0;
      const targetValue = transitionTargetRef.current[key] || 0;
      interpolated[key] = startValue + (targetValue - startValue) * easedProgress;
    }

    // Apply layers
    const blended = calculateBlendedValues(interpolated, layers);
    setBlendShapes(blended);

    if (progress < 1) {
      animationFrameRef.current = requestAnimationFrame(animateTransition);
    } else {
      setIsTransitioning(false);
      transitionCallbackRef.current?.();
    }
  }, [layers, calculateBlendedValues]);

  // Set expression from preset
  const setExpression = useCallback(
    (preset: ExpressionPreset, options: TransitionOptions = {}) => {
      const {
        duration = defaultTransitionDuration,
        easing = EASINGS.easeOut,
        onComplete,
      } = options;

      // Cancel any ongoing transition
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      transitionStartRef.current = { ...blendShapes };
      transitionTargetRef.current = EXPRESSION_PRESETS[preset];
      transitionStartTimeRef.current = performance.now();
      transitionDurationRef.current = duration;
      transitionEasingRef.current = easing;
      transitionCallbackRef.current = onComplete || null;

      setCurrentPreset(preset);
      setIsTransitioning(true);

      animationFrameRef.current = requestAnimationFrame(animateTransition);
    },
    [blendShapes, defaultTransitionDuration, animateTransition]
  );

  // Set custom blend shapes
  const setCustomBlendShapes = useCallback(
    (values: BlendShapeValues, options: TransitionOptions = {}) => {
      const {
        duration = defaultTransitionDuration,
        easing = EASINGS.easeOut,
        onComplete,
      } = options;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      transitionStartRef.current = { ...blendShapes };
      transitionTargetRef.current = values;
      transitionStartTimeRef.current = performance.now();
      transitionDurationRef.current = duration;
      transitionEasingRef.current = easing;
      transitionCallbackRef.current = onComplete || null;

      setCurrentPreset(null);
      setIsTransitioning(true);

      animationFrameRef.current = requestAnimationFrame(animateTransition);
    },
    [blendShapes, defaultTransitionDuration, animateTransition]
  );

  // Add expression layer
  const addLayer = useCallback(
    (id: string, values: BlendShapeValues, weight: number = 1, priority: number = 0) => {
      setLayers((prev) => {
        const filtered = prev.filter((l) => l.id !== id);
        return [...filtered, { id, values, weight, priority }];
      });
    },
    []
  );

  // Remove expression layer
  const removeLayer = useCallback((id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // Set layer weight
  const setLayerWeight = useCallback((id: string, weight: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, weight: Math.max(0, Math.min(1, weight)) } : l))
    );
  }, []);

  // Blend to target
  const blendTo = useCallback(
    (target: BlendShapeValues, duration: number) => {
      setCustomBlendShapes(target, { duration });
    },
    [setCustomBlendShapes]
  );

  // Reset to neutral
  const reset = useCallback(() => {
    setExpression("neutral");
    setLayers([]);
  }, [setExpression]);

  // Trigger micro-expression
  const triggerMicroExpression = useCallback(
    (type: MicroExpressionType) => {
      const microExpressions: Record<MicroExpressionType, BlendShapeValues> = {
        blink: { eyeBlinkLeft: 1, eyeBlinkRight: 1 },
        twitch: { eyeSquintLeft: 0.3, cheekSquintLeft: 0.2 },
        smirk: { mouthSmileLeft: 0.4 },
        "eyebrow-raise": { browOuterUpLeft: 0.5, browOuterUpRight: 0.5 },
        squint: { eyeSquintLeft: 0.4, eyeSquintRight: 0.4 },
      };

      const microValues = microExpressions[type];
      const duration = type === "blink" ? 150 : 200;

      // Apply micro-expression as a layer
      addLayer("micro-expression", microValues, 1, 100);

      // Remove after duration
      setTimeout(() => {
        removeLayer("micro-expression");
      }, duration);
    },
    [addLayer, removeLayer]
  );

  // Auto micro-expressions
  useEffect(() => {
    if (!enableMicroExpressions) return;

    const scheduleMicroExpression = () => {
      const [min, max] = microExpressionInterval;
      const delay = min + Math.random() * (max - min);

      microExpressionTimeoutRef.current = setTimeout(() => {
        // Random micro-expression
        const types: MicroExpressionType[] = [
          "blink",
          "blink", // More frequent blinks
          "blink",
          "twitch",
          "smirk",
          "eyebrow-raise",
          "squint",
        ];
        const type = types[Math.floor(Math.random() * types.length)];
        triggerMicroExpression(type);
        scheduleMicroExpression();
      }, delay);
    };

    scheduleMicroExpression();

    return () => {
      if (microExpressionTimeoutRef.current) {
        clearTimeout(microExpressionTimeoutRef.current);
      }
    };
  }, [enableMicroExpressions, microExpressionInterval, triggerMicroExpression]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (microExpressionTimeoutRef.current) {
        clearTimeout(microExpressionTimeoutRef.current);
      }
    };
  }, []);

  // Recalculate blended values when layers change
  useEffect(() => {
    if (!isTransitioning) {
      const blended = calculateBlendedValues(
        currentPreset ? EXPRESSION_PRESETS[currentPreset] : blendShapes,
        layers
      );
      setBlendShapes(blended);
    }
  }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = useMemo(
    (): ExpressionState => ({
      blendShapes,
      activeLayers: layers,
      isTransitioning,
      currentPreset,
    }),
    [blendShapes, layers, isTransitioning, currentPreset]
  );

  const controls = useMemo(
    (): ExpressionControls => ({
      setExpression,
      setBlendShapes: setCustomBlendShapes,
      addLayer,
      removeLayer,
      setLayerWeight,
      blendTo,
      reset,
      triggerMicroExpression,
    }),
    [
      setExpression,
      setCustomBlendShapes,
      addLayer,
      removeLayer,
      setLayerWeight,
      blendTo,
      reset,
      triggerMicroExpression,
    ]
  );

  return { state, controls };
}

/**
 * Hook for lip sync viseme mapping
 */
export function useLipSyncVisemes(): {
  visemeBlendShapes: BlendShapeValues;
  setViseme: (viseme: string, intensity?: number) => void;
  clearViseme: () => void;
} {
  const [visemeBlendShapes, setVisemeBlendShapes] = useState<BlendShapeValues>({});

  // Viseme to blend shape mapping
  const visemeMap: Record<string, BlendShapeValues> = {
    // Silence
    sil: {},
    // Consonants
    PP: { mouthClose: 0.8, mouthPucker: 0.3 },
    FF: { mouthFunnel: 0.4, mouthUpperUpLeft: 0.2, mouthUpperUpRight: 0.2 },
    TH: { tongueOut: 0.3, jawOpen: 0.2 },
    DD: { jawOpen: 0.3, mouthClose: 0.2 },
    kk: { jawOpen: 0.3, mouthStretchLeft: 0.2, mouthStretchRight: 0.2 },
    CH: { mouthFunnel: 0.5, jawOpen: 0.3 },
    SS: { mouthStretchLeft: 0.4, mouthStretchRight: 0.4, jawOpen: 0.1 },
    nn: { jawOpen: 0.2, mouthClose: 0.3 },
    RR: { mouthPucker: 0.4, jawOpen: 0.2 },
    // Vowels
    aa: { jawOpen: 0.7, mouthFunnel: 0.2 },
    E: { jawOpen: 0.4, mouthStretchLeft: 0.5, mouthStretchRight: 0.5 },
    ih: { jawOpen: 0.3, mouthStretchLeft: 0.4, mouthStretchRight: 0.4 },
    oh: { jawOpen: 0.5, mouthFunnel: 0.5, mouthPucker: 0.3 },
    ou: { mouthPucker: 0.7, mouthFunnel: 0.3, jawOpen: 0.2 },
  };

  const setViseme = useCallback((viseme: string, intensity: number = 1) => {
    const shapes = visemeMap[viseme] || {};
    const scaled: BlendShapeValues = {};
    for (const [key, value] of Object.entries(shapes)) {
      scaled[key as ExpressionBlendShape] = value * intensity;
    }
    setVisemeBlendShapes(scaled);
  }, []);

  const clearViseme = useCallback(() => {
    setVisemeBlendShapes({});
  }, []);

  return { visemeBlendShapes, setViseme, clearViseme };
}

/**
 * Hook for expression-based eye gaze
 */
export function useExpressionGaze(
  lookAtTarget: { x: number; y: number } | null
): BlendShapeValues {
  const [gazeBlendShapes, setGazeBlendShapes] = useState<BlendShapeValues>({});

  useEffect(() => {
    if (!lookAtTarget) {
      setGazeBlendShapes({});
      return;
    }

    const { x, y } = lookAtTarget;
    const shapes: BlendShapeValues = {};

    // Horizontal gaze
    if (x < 0) {
      shapes.eyeLookOutLeft = Math.min(Math.abs(x), 1);
      shapes.eyeLookInRight = Math.min(Math.abs(x), 1);
    } else if (x > 0) {
      shapes.eyeLookInLeft = Math.min(x, 1);
      shapes.eyeLookOutRight = Math.min(x, 1);
    }

    // Vertical gaze
    if (y < 0) {
      shapes.eyeLookDownLeft = Math.min(Math.abs(y), 1);
      shapes.eyeLookDownRight = Math.min(Math.abs(y), 1);
    } else if (y > 0) {
      shapes.eyeLookUpLeft = Math.min(y, 1);
      shapes.eyeLookUpRight = Math.min(y, 1);
    }

    setGazeBlendShapes(shapes);
  }, [lookAtTarget]);

  return gazeBlendShapes;
}

// Export preset definitions for external use
export { EXPRESSION_PRESETS };
