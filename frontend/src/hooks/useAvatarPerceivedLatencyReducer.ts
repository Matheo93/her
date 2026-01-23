/**
 * useAvatarPerceivedLatencyReducer - Sprint 533
 *
 * Techniques to reduce perceived latency in avatar interactions:
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
export type AnticipationType = "hover" | "tap" | "drag" | "scroll";

export interface AnticipationTransform {
  scale: number;
  translateY: number;
  opacity: number;
}

export interface MotionBlurStyles {
  filter: string;
  transform: string;
}

export interface SkeletonStyles {
  opacity: number;
  background: string;
  animation: string;
}

export interface PerceivedLatencyConfig {
  enableMotionBlur: boolean;
  anticipationThresholdMs: number;
  progressiveLoadingSteps: number;
  motionBlurSpeedThreshold: number;
}

export interface PerceivedLatencyCallbacks {
  onAnticipationStart?: (type: AnticipationType) => void;
  onAnticipationComplete?: () => void;
  onLoadingPhaseChange?: (phase: LoadingPhase) => void;
}

export interface PerceivedLatencyState {
  isActive: boolean;
  loadingPhase: LoadingPhase;
  loadingProgress: number;
  anticipationLevel: number;
  useMotionBlur: boolean;
  showSkeleton: boolean;
}

export interface PerceivedLatencyMetrics {
  perceivedLatencyMs: number;
  actualLatencyMs: number;
  latencyReduction: number;
}

export interface PerceivedLatencyControls {
  startAnticipation: (type: AnticipationType) => void;
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
  const [movementSpeed, setMovementSpeed] = useState(0);
  const [perceivedLatencyMs, setPerceivedLatencyMs] = useState(0);
  const [actualLatencyMs, setActualLatencyMs] = useState(0);

  // Refs
  const anticipationStartTimeRef = useRef(0);
  const latencyMeasurementStartRef = useRef(0);
  const anticipationTypeRef = useRef<AnticipationType | null>(null);

  // Computed values
  const useMotionBlur = useMemo(
    () => mergedConfig.enableMotionBlur,
    [mergedConfig.enableMotionBlur]
  );

  const loadingProgress = useMemo(() => {
    const phaseIndex = LOADING_PHASES.indexOf(loadingPhase);
    if (phaseIndex <= 0) return 0;
    return phaseIndex / (LOADING_PHASES.length - 1);
  }, [loadingPhase]);

  const showSkeleton = useMemo(
    () => loadingPhase === "skeleton",
    [loadingPhase]
  );

  const latencyReduction = useMemo(() => {
    if (actualLatencyMs === 0) return 0;
    return Math.max(0, ((actualLatencyMs - perceivedLatencyMs) / actualLatencyMs) * 100);
  }, [actualLatencyMs, perceivedLatencyMs]);

  // Anticipation controls
  const startAnticipation = useCallback((type: AnticipationType) => {
    anticipationStartTimeRef.current = performance.now();
    anticipationTypeRef.current = type;

    // Initial anticipation level based on type
    const initialLevel = type === "tap" ? 0.3 : type === "hover" ? 0.1 : 0.2;
    setAnticipationLevel(initialLevel);

    callbacks.onAnticipationStart?.(type);
  }, [callbacks]);

  const updateAnticipation = useCallback(() => {
    if (anticipationStartTimeRef.current === 0) return;

    const elapsed = performance.now() - anticipationStartTimeRef.current;
    const progress = Math.min(1, elapsed / mergedConfig.anticipationThresholdMs);
    setAnticipationLevel(prev => Math.min(1, prev + progress * 0.1));
  }, [mergedConfig.anticipationThresholdMs]);

  const completeAnticipation = useCallback(() => {
    setAnticipationLevel(0);
    anticipationStartTimeRef.current = 0;
    anticipationTypeRef.current = null;
    callbacks.onAnticipationComplete?.();
  }, [callbacks]);

  const getAnticipationTransform = useCallback((): AnticipationTransform => {
    return {
      scale: 1 + anticipationLevel * 0.05,
      translateY: -anticipationLevel * 2,
      opacity: 1 - anticipationLevel * 0.1,
    };
  }, [anticipationLevel]);

  // Motion blur controls
  const setMovementSpeedFn = useCallback((speed: number) => {
    setMovementSpeed(speed);
  }, []);

  const getMotionBlurStyles = useCallback((): MotionBlurStyles => {
    if (!useMotionBlur || movementSpeed < mergedConfig.motionBlurSpeedThreshold) {
      return { filter: "none", transform: "none" };
    }

    const blurAmount = Math.min(10, (movementSpeed - mergedConfig.motionBlurSpeedThreshold) / 10);
    return {
      filter: "blur(" + blurAmount + "px)",
      transform: "translateX(" + (blurAmount * 0.5) + "px)",
    };
  }, [useMotionBlur, movementSpeed, mergedConfig.motionBlurSpeedThreshold]);

  // Loading controls
  const startLoading = useCallback(() => {
    setLoadingPhase("skeleton");
    callbacks.onLoadingPhaseChange?.("skeleton");
  }, [callbacks]);

  const advanceLoading = useCallback(() => {
    setLoadingPhase(prev => {
      const currentIndex = LOADING_PHASES.indexOf(prev);
      if (currentIndex < LOADING_PHASES.length - 1) {
        const nextPhase = LOADING_PHASES[currentIndex + 1];
        callbacks.onLoadingPhaseChange?.(nextPhase);
        return nextPhase;
      }
      return prev;
    });
  }, [callbacks]);

  const completeLoading = useCallback(() => {
    setLoadingPhase("complete");
    callbacks.onLoadingPhaseChange?.("complete");
  }, [callbacks]);

  const getSkeletonStyles = useCallback((): SkeletonStyles => {
    return {
      opacity: showSkeleton ? 1 : 0,
      background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
      animation: showSkeleton ? "skeleton-pulse 1.5s ease-in-out infinite" : "none",
    };
  }, [showSkeleton]);

  // Latency measurement
  const startLatencyMeasurement = useCallback(() => {
    latencyMeasurementStartRef.current = performance.now();
  }, []);

  const endLatencyMeasurement = useCallback(() => {
    const actual = performance.now() - latencyMeasurementStartRef.current;
    setActualLatencyMs(actual);

    // Perceived latency is reduced by anticipation time
    const anticipationTime = anticipationLevel > 0 ? mergedConfig.anticipationThresholdMs * anticipationLevel : 0;
    const perceived = Math.max(0, actual - anticipationTime);
    setPerceivedLatencyMs(perceived);
  }, [anticipationLevel, mergedConfig.anticipationThresholdMs]);

  const resetMetrics = useCallback(() => {
    setPerceivedLatencyMs(0);
    setActualLatencyMs(0);
    latencyMeasurementStartRef.current = 0;
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      anticipationStartTimeRef.current = 0;
      latencyMeasurementStartRef.current = 0;
    };
  }, []);

  const state: PerceivedLatencyState = useMemo(() => ({
    isActive: true,
    loadingPhase,
    loadingProgress,
    anticipationLevel,
    useMotionBlur,
    showSkeleton,
  }), [loadingPhase, loadingProgress, anticipationLevel, useMotionBlur, showSkeleton]);

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
    setMovementSpeed: setMovementSpeedFn,
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
    setMovementSpeedFn,
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
    setLevel(0.3);
  }, []);

  const complete = useCallback(() => {
    setIsAnticipating(false);
    setLevel(0);
  }, []);

  const transform: AnticipationTransform = useMemo(() => ({
    scale: 1 + level * 0.05,
    translateY: -level * 2,
    opacity: 1 - level * 0.1,
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

  const progress = useMemo(() => {
    const phaseIndex = LOADING_PHASES.indexOf(phase);
    if (phaseIndex <= 0) return 0;
    return phaseIndex / (LOADING_PHASES.length - 1);
  }, [phase]);

  const startLoad = useCallback(() => {
    setPhase("skeleton");
  }, []);

  const completeLoad = useCallback(() => {
    setPhase("complete");
  }, []);

  return { startLoad, completeLoad, phase, progress };
}

export default useAvatarPerceivedLatencyReducer;
