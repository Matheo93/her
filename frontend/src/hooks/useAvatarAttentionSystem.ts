/**
 * useAvatarAttentionSystem Hook - Sprint 513
 *
 * Intelligent attention and focus management for natural avatar behavior.
 * Creates believable gaze patterns and attention shifts based on context.
 *
 * Features:
 * - Multi-target attention tracking (user, UI elements, environment)
 * - Natural attention shifting with saccades and fixations
 * - Context-aware focus priorities (speaking, listening, thinking)
 * - Distraction simulation for human-like behavior
 * - Attention decay and re-engagement patterns
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type AttentionTargetType =
  | "user_face"
  | "user_eyes"
  | "user_mouth"
  | "user_hands"
  | "ui_element"
  | "environment"
  | "thinking_zone"
  | "memory_recall"
  | "nothing";

export type AttentionPriority = "critical" | "high" | "medium" | "low" | "ambient";

export type GazePattern = "focused" | "scanning" | "thinking" | "listening" | "distracted" | "idle";

export interface AttentionTarget {
  id: string;
  type: AttentionTargetType;
  position: { x: number; y: number; z?: number };
  priority: AttentionPriority;
  weight: number; // 0-1
  sticky: boolean; // Resist attention shifts
  lastFocused: number;
  metadata?: Record<string, unknown>;
}

export interface GazeState {
  target: AttentionTarget | null;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  pupilDilation: number; // 0-1
  blinkPending: boolean;
  saccadeInProgress: boolean;
}

export interface AttentionMetrics {
  totalShifts: number;
  averageFocusDuration: number;
  targetDistribution: Record<AttentionTargetType, number>;
  distractionRate: number;
  engagementScore: number; // 0-100
}

export interface AttentionConfig {
  enabled: boolean;
  maxTargets: number;
  defaultFocusDuration: number; // ms
  saccadeDuration: number; // ms
  blinkInterval: { min: number; max: number }; // ms
  distractionChance: number; // 0-1
  naturalVariation: number; // 0-1
  contextAware: boolean;
}

export interface AttentionSystemState {
  currentTarget: AttentionTarget | null;
  targets: AttentionTarget[];
  gazeState: GazeState;
  pattern: GazePattern;
  isEngaged: boolean;
  focusStartTime: number;
}

export interface AttentionControls {
  addTarget: (target: Omit<AttentionTarget, "id" | "lastFocused">) => string;
  removeTarget: (id: string) => void;
  focusOn: (id: string) => void;
  setPattern: (pattern: GazePattern) => void;
  updateTargetPosition: (id: string, position: { x: number; y: number; z?: number }) => void;
  clearTargets: () => void;
  triggerBlink: () => void;
  triggerSaccade: (to: { x: number; y: number }) => void;
}

export interface UseAvatarAttentionSystemResult {
  state: AttentionSystemState;
  gazePosition: { x: number; y: number };
  eyeTransform: { left: { x: number; y: number }; right: { x: number; y: number } };
  pupilDilation: number;
  metrics: AttentionMetrics;
  controls: AttentionControls;
  isBlinking: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: AttentionConfig = {
  enabled: true,
  maxTargets: 10,
  defaultFocusDuration: 3000,
  saccadeDuration: 50,
  blinkInterval: { min: 2000, max: 6000 },
  distractionChance: 0.1,
  naturalVariation: 0.2,
  contextAware: true,
};

const PRIORITY_WEIGHTS: Record<AttentionPriority, number> = {
  critical: 1.0,
  high: 0.8,
  medium: 0.5,
  low: 0.3,
  ambient: 0.1,
};

const PATTERN_BEHAVIORS: Record<GazePattern, {
  focusDurationMultiplier: number;
  scanRange: number;
  distractionMultiplier: number;
  pupilDilation: number;
}> = {
  focused: { focusDurationMultiplier: 1.5, scanRange: 0.05, distractionMultiplier: 0.3, pupilDilation: 0.6 },
  scanning: { focusDurationMultiplier: 0.5, scanRange: 0.3, distractionMultiplier: 1.5, pupilDilation: 0.5 },
  thinking: { focusDurationMultiplier: 2.0, scanRange: 0.1, distractionMultiplier: 0.2, pupilDilation: 0.7 },
  listening: { focusDurationMultiplier: 1.2, scanRange: 0.08, distractionMultiplier: 0.5, pupilDilation: 0.55 },
  distracted: { focusDurationMultiplier: 0.3, scanRange: 0.5, distractionMultiplier: 2.0, pupilDilation: 0.4 },
  idle: { focusDurationMultiplier: 0.8, scanRange: 0.2, distractionMultiplier: 1.0, pupilDilation: 0.5 },
};

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `target_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculateGazePosition(
  target: AttentionTarget | null,
  pattern: GazePattern,
  variation: number
): { x: number; y: number } {
  if (!target) {
    return { x: 0, y: 0 };
  }

  const behavior = PATTERN_BEHAVIORS[pattern];
  const range = behavior.scanRange * variation;

  return {
    x: target.position.x + (Math.random() - 0.5) * range,
    y: target.position.y + (Math.random() - 0.5) * range,
  };
}

function selectNextTarget(
  targets: AttentionTarget[],
  currentTarget: AttentionTarget | null,
  pattern: GazePattern
): AttentionTarget | null {
  if (targets.length === 0) return null;

  const now = Date.now();
  const behavior = PATTERN_BEHAVIORS[pattern];

  // Calculate scores for each target
  const scored = targets.map((target) => {
    let score = PRIORITY_WEIGHTS[target.priority] * target.weight;

    // Recency penalty (favor targets not recently focused)
    const timeSinceFocus = now - target.lastFocused;
    const recencyBonus = Math.min(1, timeSinceFocus / 10000);
    score *= 0.5 + recencyBonus * 0.5;

    // Sticky bonus (harder to shift away from sticky targets)
    if (currentTarget?.id === target.id && target.sticky) {
      score *= 1.5;
    }

    // Pattern-specific adjustments
    if (pattern === "thinking" && target.type === "thinking_zone") {
      score *= 2;
    }
    if (pattern === "listening" && (target.type === "user_mouth" || target.type === "user_face")) {
      score *= 1.5;
    }

    return { target, score };
  });

  // Weighted random selection
  const totalScore = scored.reduce((sum, s) => sum + s.score, 0);
  if (totalScore === 0) return targets[0];

  let random = Math.random() * totalScore;
  for (const { target, score } of scored) {
    random -= score;
    if (random <= 0) return target;
  }

  return scored[scored.length - 1].target;
}

function interpolatePosition(
  from: { x: number; y: number },
  to: { x: number; y: number },
  progress: number
): { x: number; y: number } {
  // Ease-out cubic for natural saccade
  const t = 1 - Math.pow(1 - progress, 3);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function calculateEyeTransform(
  gazePosition: { x: number; y: number },
  eyeSeparation: number = 0.03
): { left: { x: number; y: number }; right: { x: number; y: number } } {
  // Slight convergence for close targets
  const convergence = Math.max(0, 1 - Math.sqrt(gazePosition.x ** 2 + gazePosition.y ** 2));

  return {
    left: {
      x: gazePosition.x + eyeSeparation * convergence,
      y: gazePosition.y,
    },
    right: {
      x: gazePosition.x - eyeSeparation * convergence,
      y: gazePosition.y,
    },
  };
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarAttentionSystem(
  config: Partial<AttentionConfig> = {}
): UseAvatarAttentionSystemResult {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [state, setState] = useState<AttentionSystemState>({
    currentTarget: null,
    targets: [],
    gazeState: {
      target: null,
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      pupilDilation: 0.5,
      blinkPending: false,
      saccadeInProgress: false,
    },
    pattern: "idle",
    isEngaged: false,
    focusStartTime: Date.now(),
  });

  const [isBlinking, setIsBlinking] = useState(false);

  // Metrics
  const metricsRef = useRef<AttentionMetrics>({
    totalShifts: 0,
    averageFocusDuration: 0,
    targetDistribution: {} as Record<AttentionTargetType, number>,
    distractionRate: 0,
    engagementScore: 50,
  });

  // Timers
  const blinkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const focusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const saccadeStartRef = useRef<{ from: { x: number; y: number }; to: { x: number; y: number }; startTime: number } | null>(null);

  // Schedule next blink
  const scheduleNextBlink = useCallback(() => {
    if (blinkTimerRef.current) {
      clearTimeout(blinkTimerRef.current);
    }

    const { min, max } = mergedConfig.blinkInterval;
    const delay = min + Math.random() * (max - min);

    blinkTimerRef.current = setTimeout(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
      scheduleNextBlink();
    }, delay);
  }, [mergedConfig.blinkInterval]);

  // Process attention shift
  const shiftAttention = useCallback(() => {
    setState((prev) => {
      const nextTarget = selectNextTarget(prev.targets, prev.currentTarget, prev.pattern);

      if (nextTarget && nextTarget.id !== prev.currentTarget?.id) {
        // Update metrics
        metricsRef.current.totalShifts++;
        if (nextTarget.type) {
          metricsRef.current.targetDistribution[nextTarget.type] =
            (metricsRef.current.targetDistribution[nextTarget.type] || 0) + 1;
        }

        // Start saccade
        const newPosition = calculateGazePosition(nextTarget, prev.pattern, mergedConfig.naturalVariation);
        saccadeStartRef.current = {
          from: prev.gazeState.position,
          to: newPosition,
          startTime: Date.now(),
        };

        return {
          ...prev,
          currentTarget: nextTarget,
          targets: prev.targets.map((t) =>
            t.id === nextTarget.id ? { ...t, lastFocused: Date.now() } : t
          ),
          gazeState: {
            ...prev.gazeState,
            target: nextTarget,
            saccadeInProgress: true,
          },
          focusStartTime: Date.now(),
        };
      }

      return prev;
    });
  }, [mergedConfig.naturalVariation]);

  // Schedule attention shifts
  useEffect(() => {
    if (!mergedConfig.enabled || state.targets.length === 0) return;

    const behavior = PATTERN_BEHAVIORS[state.pattern];
    const focusDuration = mergedConfig.defaultFocusDuration * behavior.focusDurationMultiplier;

    // Add natural variation
    const variation = 1 + (Math.random() - 0.5) * mergedConfig.naturalVariation;
    const actualDuration = focusDuration * variation;

    focusTimerRef.current = setTimeout(() => {
      // Check for distraction
      const distractionRoll = Math.random();
      const distractionThreshold = mergedConfig.distractionChance * behavior.distractionMultiplier;

      if (distractionRoll < distractionThreshold) {
        metricsRef.current.distractionRate =
          metricsRef.current.distractionRate * 0.9 + 0.1;
      }

      shiftAttention();
    }, actualDuration);

    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
    };
  }, [state.currentTarget?.id, state.pattern, state.targets.length, mergedConfig, shiftAttention]);

  // Animate saccades
  useEffect(() => {
    if (!state.gazeState.saccadeInProgress || !saccadeStartRef.current) return;

    const animate = () => {
      const saccade = saccadeStartRef.current;
      if (!saccade) return;

      const elapsed = Date.now() - saccade.startTime;
      const progress = Math.min(1, elapsed / mergedConfig.saccadeDuration);

      if (progress >= 1) {
        setState((prev) => ({
          ...prev,
          gazeState: {
            ...prev.gazeState,
            position: saccade.to,
            saccadeInProgress: false,
          },
        }));
        saccadeStartRef.current = null;
        return;
      }

      const newPosition = interpolatePosition(saccade.from, saccade.to, progress);

      setState((prev) => ({
        ...prev,
        gazeState: {
          ...prev.gazeState,
          position: newPosition,
        },
      }));

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.gazeState.saccadeInProgress, mergedConfig.saccadeDuration]);

  // Start blink timer
  useEffect(() => {
    if (mergedConfig.enabled) {
      scheduleNextBlink();
    }

    return () => {
      if (blinkTimerRef.current) {
        clearTimeout(blinkTimerRef.current);
      }
    };
  }, [mergedConfig.enabled, scheduleNextBlink]);

  // Calculate derived values
  const gazePosition = state.gazeState.position;
  const eyeTransform = useMemo(
    () => calculateEyeTransform(gazePosition),
    [gazePosition]
  );
  const pupilDilation = PATTERN_BEHAVIORS[state.pattern].pupilDilation;

  // Controls
  const addTarget = useCallback(
    (target: Omit<AttentionTarget, "id" | "lastFocused">): string => {
      const id = generateId();
      const newTarget: AttentionTarget = {
        ...target,
        id,
        lastFocused: 0,
      };

      setState((prev) => ({
        ...prev,
        targets: [...prev.targets.slice(-(mergedConfig.maxTargets - 1)), newTarget],
      }));

      return id;
    },
    [mergedConfig.maxTargets]
  );

  const removeTarget = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      targets: prev.targets.filter((t) => t.id !== id),
      currentTarget: prev.currentTarget?.id === id ? null : prev.currentTarget,
    }));
  }, []);

  const focusOn = useCallback((id: string) => {
    setState((prev) => {
      const target = prev.targets.find((t) => t.id === id);
      if (!target) return prev;

      const newPosition = calculateGazePosition(target, prev.pattern, mergedConfig.naturalVariation);
      saccadeStartRef.current = {
        from: prev.gazeState.position,
        to: newPosition,
        startTime: Date.now(),
      };

      return {
        ...prev,
        currentTarget: target,
        gazeState: {
          ...prev.gazeState,
          target,
          saccadeInProgress: true,
        },
        focusStartTime: Date.now(),
      };
    });
  }, [mergedConfig.naturalVariation]);

  const setPattern = useCallback((pattern: GazePattern) => {
    setState((prev) => ({ ...prev, pattern }));
  }, []);

  const updateTargetPosition = useCallback(
    (id: string, position: { x: number; y: number; z?: number }) => {
      setState((prev) => ({
        ...prev,
        targets: prev.targets.map((t) => (t.id === id ? { ...t, position } : t)),
      }));
    },
    []
  );

  const clearTargets = useCallback(() => {
    setState((prev) => ({
      ...prev,
      targets: [],
      currentTarget: null,
    }));
  }, []);

  const triggerBlink = useCallback(() => {
    setIsBlinking(true);
    setTimeout(() => setIsBlinking(false), 150);
  }, []);

  const triggerSaccade = useCallback((to: { x: number; y: number }) => {
    setState((prev) => {
      saccadeStartRef.current = {
        from: prev.gazeState.position,
        to,
        startTime: Date.now(),
      };

      return {
        ...prev,
        gazeState: {
          ...prev.gazeState,
          saccadeInProgress: true,
        },
      };
    });
  }, []);

  const controls: AttentionControls = useMemo(
    () => ({
      addTarget,
      removeTarget,
      focusOn,
      setPattern,
      updateTargetPosition,
      clearTargets,
      triggerBlink,
      triggerSaccade,
    }),
    [addTarget, removeTarget, focusOn, setPattern, updateTargetPosition, clearTargets, triggerBlink, triggerSaccade]
  );

  return {
    state,
    gazePosition,
    eyeTransform,
    pupilDilation,
    metrics: metricsRef.current,
    controls,
    isBlinking,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for tracking user face position as attention target
 */
export function useUserFaceAttention(
  facePosition: { x: number; y: number } | null,
  config?: Partial<AttentionConfig>
): { gazePosition: { x: number; y: number }; isLookingAtUser: boolean } {
  const { controls, gazePosition, state } = useAvatarAttentionSystem(config);
  const targetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (facePosition) {
      if (!targetIdRef.current) {
        targetIdRef.current = controls.addTarget({
          type: "user_face",
          position: facePosition,
          priority: "high",
          weight: 1,
          sticky: true,
        });
      } else {
        controls.updateTargetPosition(targetIdRef.current, facePosition);
      }
    } else if (targetIdRef.current) {
      controls.removeTarget(targetIdRef.current);
      targetIdRef.current = null;
    }
  }, [facePosition, controls]);

  const isLookingAtUser = state.currentTarget?.type === "user_face";

  return { gazePosition, isLookingAtUser };
}

/**
 * Hook for conversation-aware attention patterns
 */
export function useConversationAttention(
  isListening: boolean,
  isSpeaking: boolean,
  isThinking: boolean,
  config?: Partial<AttentionConfig>
): { gazePosition: { x: number; y: number }; pattern: GazePattern } {
  const { controls, gazePosition, state } = useAvatarAttentionSystem(config);

  useEffect(() => {
    if (isThinking) {
      controls.setPattern("thinking");
    } else if (isListening) {
      controls.setPattern("listening");
    } else if (isSpeaking) {
      controls.setPattern("focused");
    } else {
      controls.setPattern("idle");
    }
  }, [isListening, isSpeaking, isThinking, controls]);

  return { gazePosition, pattern: state.pattern };
}

export default useAvatarAttentionSystem;
