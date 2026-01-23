/**
 * useAvatarPerceivedLatencyReducer - Sprint 533
 *
 * Reduces perceived latency in avatar interactions through:
 * - Anticipatory animations that start before input completes
 * - Motion blur effects to mask frame drops
 * - Skeleton/placeholder states during loading
 * - Progressive enhancement of avatar details
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type LoadingPhase = "idle" | "skeleton" | "lowRes" | "mediumRes" | "highRes" | "complete";
export type InputType = "hover" | "tap" | "swipe" | "pinch";

export interface PerceivedLatencyConfig {
  enableMotionBlur: boolean;
  anticipationThresholdMs: number;
  progressiveLoadingSteps: number;
  motionBlurSpeedThreshold: number;
}

export interface PerceivedLatencyCallbacks {
  onAnticipationStart?: (inputType: InputType) => void;
  onLoadingPhaseChange?: (phase: LoadingPhase) => void;
  onLatencyMeasured?: (actual: number, perceived: number) => void;
}

export interface PerceivedLatencyState {
  isActive: boolean;
  loadingPhase: LoadingPhase;
  anticipationLevel: number;
  useMotionBlur: boolean;
  loadingProgress: number;
  showSkeleton: boolean;
}

export interface PerceivedLatencyMetrics {
  perceivedLatencyMs: number;
  actualLatencyMs: number;
  latencyReduction: number;
}

export interface AnticipationTransform {
  scale: number;
  opacity: number;
  translateY: number;
}

export interface MotionBlurStyles {
  filter: string;
  transform: string;
}

export interface SkeletonStyles {
  opacity: number;
  background: string;
}

export interface PerceivedLatencyControls {
  startAnticipation: (inputType: InputType) => void;
  updateAnticipation: () => void;
  completeAnticipation: () => void;
  getAnticipationTransform: () => AnticipationTransform;
  setMovementSpeed: (speed: number) => void;
  getMotionBlurStyles: () => MotionBlurStyles;
  startLoading: () => void;
  advanceLoading: () => void;
  completeLoading: () => void;
  getSkeletonStyles: () => SkeletonStyles;
  startLatencyMeasurement: () => void;
  endLatencyMeasurement: () => void;
  resetMetrics: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: PerceivedLatencyConfig = {
  enableMotionBlur: false,
  anticipationThresholdMs: 100,
  progressiveLoadingSteps: 4,
  motionBlurSpeedThreshold: 50,
};

const LOADING_PHASES: LoadingPhase[] = ["idle", "skeleton", "lowRes", "mediumRes", "highRes", "complete"];

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarPerceivedLatencyReducer(
  config: Partial<PerceivedLatencyConfig> = {},
  callbacks: PerceivedLatencyCallbacks = {}
): { state: PerceivedLatencyState; metrics: PerceivedLatencyMetrics; controls: PerceivedLatencyControls } {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("idle");
  const [anticipationLevel, setAnticipationLevel] = useState(0);
  const [useMotionBlur, setUseMotionBlur] = useState(mergedConfig.enableMotionBlur);
  const [movementSpeed, setMovementSpeedState] = useState(0);

  // Metrics state
  const [perceivedLatencyMs, setPerceivedLatencyMs] = useState(0);
  const [actualLatencyMs, setActualLatencyMs] = useState(0);
  const [latencyReduction, setLatencyReduction] = useState(0);

  // Refs
  const anticipationStartRef = useRef(0);
  const latencyStartRef = useRef(0);
  const currentInputTypeRef = useRef<InputType | null>(null);

  // Cleanup
  useEffect(() => {
    return () => {
      anticipationStartRef.current = 0;
      latencyStartRef.current = 0;
    };
  }, []);

  // Update motion blur state based on config
  useEffect(() => {
    setUseMotionBlur(mergedConfig.enableMotionBlur);
  }, [mergedConfig.enableMotionBlur]);

  // Anticipation controls
  const startAnticipation = useCallback((inputType: InputType) => {
    anticipationStartRef.current = performance.now();
    currentInputTypeRef.current = inputType;
    setAnticipationLevel(0.3); // Initial anticipation level
    callbacks.onAnticipationStart?.(inputType);
  }, [callbacks]);

  const updateAnticipation = useCallback(() => {
    if (anticipationStartRef.current === 0) return;

    const elapsed = performance.now() - anticipationStartRef.current;
    const newLevel = Math.min(1, 0.3 + (elapsed / mergedConfig.anticipationThresholdMs) * 0.7);
    setAnticipationLevel(newLevel);
  }, [mergedConfig.anticipationThresholdMs]);

  const completeAnticipation = useCallback(() => {
    setAnticipationLevel(0);
    anticipationStartRef.current = 0;
    currentInputTypeRef.current = null;
  }, []);

  const getAnticipationTransform = useCallback((): AnticipationTransform => {
    return {
      scale: 1 + anticipationLevel * 0.05,
      opacity: 1 - anticipationLevel * 0.1,
      translateY: -anticipationLevel * 2,
    };
  }, [anticipationLevel]);

  // Motion blur controls
  const setMovementSpeed = useCallback((speed: number) => {
    setMovementSpeedState(speed);
    if (mergedConfig.enableMotionBlur && speed >= mergedConfig.motionBlurSpeedThreshold) {
      setUseMotionBlur(true);
    }
  }, [mergedConfig.enableMotionBlur, mergedConfig.motionBlurSpeedThreshold]);

  const getMotionBlurStyles = useCallback((): MotionBlurStyles => {
    if (!mergedConfig.enableMotionBlur || movementSpeed < mergedConfig.motionBlurSpeedThreshold) {
      return { filter: "none", transform: "none" };
    }

    const blurAmount = Math.min(10, (movementSpeed - mergedConfig.motionBlurSpeedThreshold) / 20);
    return {
      filter: "blur(" + blurAmount + "px)",
      transform: "translateX(" + (blurAmount * 0.5) + "px)",
    };
  }, [mergedConfig.enableMotionBlur, mergedConfig.motionBlurSpeedThreshold, movementSpeed]);

  // Loading controls
  const startLoading = useCallback(() => {
    setLoadingPhase("skeleton");
    callbacks.onLoadingPhaseChange?.("skeleton");
  }, [callbacks]);

  const advanceLoading = useCallback(() => {
    setLoadingPhase(current => {
      const currentIndex = LOADING_PHASES.indexOf(current);
      if (currentIndex < LOADING_PHASES.length - 1) {
        const nextPhase = LOADING_PHASES[currentIndex + 1];
        callbacks.onLoadingPhaseChange?.(nextPhase);
        return nextPhase;
      }
      return current;
    });
  }, [callbacks]);

  const completeLoading = useCallback(() => {
    setLoadingPhase("complete");
    callbacks.onLoadingPhaseChange?.("complete");
  }, [callbacks]);

  const getSkeletonStyles = useCallback((): SkeletonStyles => {
    const isLoading = loadingPhase === "skeleton" || loadingPhase === "lowRes";
    return {
      opacity: isLoading ? 0.6 : 1,
      background: isLoading ? "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)" : "transparent",
    };
  }, [loadingPhase]);

  // Latency measurement
  const startLatencyMeasurement = useCallback(() => {
    latencyStartRef.current = performance.now();
  }, []);

  const endLatencyMeasurement = useCallback(() => {
    const now = performance.now();
    const actual = now - latencyStartRef.current;

    // Perceived latency is reduced by anticipation
    const anticipationReduction = anticipationLevel * actual * 0.3;
    const perceived = Math.max(0, actual - anticipationReduction);

    setActualLatencyMs(actual);
    setPerceivedLatencyMs(perceived);
    setLatencyReduction(actual > 0 ? ((actual - perceived) / actual) * 100 : 0);

    callbacks.onLatencyMeasured?.(actual, perceived);
  }, [anticipationLevel, callbacks]);

  const resetMetrics = useCallback(() => {
    setPerceivedLatencyMs(0);
    setActualLatencyMs(0);
    setLatencyReduction(0);
    latencyStartRef.current = 0;
  }, []);

  // Computed values
  const loadingProgress = useMemo(() => {
    const index = LOADING_PHASES.indexOf(loadingPhase);
    return index / (LOADING_PHASES.length - 1);
  }, [loadingPhase]);

  const showSkeleton = useMemo(() => {
    return loadingPhase === "skeleton" || loadingPhase === "lowRes";
  }, [loadingPhase]);

  // Return values
  const state: PerceivedLatencyState = useMemo(() => ({
    isActive: true,
    loadingPhase,
    anticipationLevel,
    useMotionBlur,
    loadingProgress,
    showSkeleton,
  }), [loadingPhase, anticipationLevel, useMotionBlur, loadingProgress, showSkeleton]);

  const metrics: PerceivedLatencyMetrics = useMemo(() => ({
    perceivedLatencyMs,
    actualLatencyMs,
    latencyReduction,
  }), [perceivedLatencyMs, actualLatencyMs, latencyReduction]);

  const controls: PerceivedLatencyControls = useMemo(() => ({
    startAnticipation,
    updateAnticipation,
    completeAnticipation,
    getAnticipationTransform,
    setMovementSpeed,
    getMotionBlurStyles,
    startLoading,
    advanceLoading,
    completeLoading,
    getSkeletonStyles,
    startLatencyMeasurement,
    endLatencyMeasurement,
    resetMetrics,
  }), [
    startAnticipation,
    updateAnticipation,
    completeAnticipation,
    getAnticipationTransform,
    setMovementSpeed,
    getMotionBlurStyles,
    startLoading,
    advanceLoading,
    completeLoading,
    getSkeletonStyles,
    startLatencyMeasurement,
    endLatencyMeasurement,
    resetMetrics,
  ]);

  return { state, metrics, controls };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useAnticipatoryAnimation(): {
  start: () => void;
  complete: () => void;
  isAnticipating: boolean;
  transform: AnticipationTransform;
} {
  const [isAnticipating, setIsAnticipating] = useState(false);
  const [level, setLevel] = useState(0);

  const start = useCallback(() => {
    setIsAnticipating(true);
    setLevel(0.5);
  }, []);

  const complete = useCallback(() => {
    setIsAnticipating(false);
    setLevel(0);
  }, []);

  const transform: AnticipationTransform = useMemo(() => ({
    scale: 1 + level * 0.05,
    opacity: 1 - level * 0.1,
    translateY: -level * 2,
  }), [level]);

  return { start, complete, isAnticipating, transform };
}

export function useProgressiveAvatarLoading(): {
  startLoad: () => void;
  completeLoad: () => void;
  phase: LoadingPhase;
  progress: number;
} {
  const [phase, setPhase] = useState<LoadingPhase>("idle");

  const startLoad = useCallback(() => {
    setPhase("skeleton");
  }, []);

  const completeLoad = useCallback(() => {
    setPhase("complete");
  }, []);

  const progress = useMemo(() => {
    const index = LOADING_PHASES.indexOf(phase);
    return index / (LOADING_PHASES.length - 1);
  }, [phase]);

  return { startLoad, completeLoad, phase, progress };
}

export default useAvatarPerceivedLatencyReducer;
