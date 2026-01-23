/**
 * useAvatarFrameBudget - Sprint 537
 *
 * Frame budget management for smooth avatar animations.
 * Features:
 * - Frame time budget allocation
 * - Work scheduling within budget
 * - Budget overflow detection and handling
 * - Adaptive quality reduction when budget exceeded
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export interface WorkItem {
  id: string;
  callback: () => void;
  estimatedMs: number;
  scheduledAt: number;
}

export interface QualitySuggestion {
  shouldReduce: boolean;
  factor: number;
  reason: string;
}

export interface BudgetConfig {
  targetFps: number;
  budgetAllocation: number;
  minQualityFactor: number;
}

export interface BudgetCallbacks {
  onBudgetExceeded?: (usedMs: number, budgetMs: number) => void;
  onQualityAdjusted?: (factor: number) => void;
}

export interface BudgetState {
  isActive: boolean;
  currentBudgetMs: number;
  usedBudgetMs: number;
  isOverBudget: boolean;
  qualityFactor: number;
}

export interface BudgetMetrics {
  framesRecorded: number;
  overflowCount: number;
  averageFrameTime: number;
  peakFrameTime: number;
}

export interface BudgetControls {
  startWork: (id: string) => void;
  endWork: (id: string) => void;
  resetFrame: () => void;
  getRemainingBudget: () => number;
  canFitWork: (estimatedMs: number) => boolean;
  getQualitySuggestion: () => QualitySuggestion;
  recordFrameComplete: () => void;
  resetMetrics: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: BudgetConfig = {
  targetFps: 60,
  budgetAllocation: 1.0,
  minQualityFactor: 0.3,
};

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarFrameBudget(
  config: Partial<BudgetConfig> = {},
  callbacks: BudgetCallbacks = {}
): { state: BudgetState; metrics: BudgetMetrics; controls: BudgetControls } {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // Calculate frame budget
  const frameBudgetMs = useMemo(() => {
    const fullBudget = 1000 / mergedConfig.targetFps;
    return fullBudget * mergedConfig.budgetAllocation;
  }, [mergedConfig.targetFps, mergedConfig.budgetAllocation]);

  // State
  const [usedBudgetMs, setUsedBudgetMs] = useState(0);
  const [isOverBudget, setIsOverBudget] = useState(false);
  const [qualityFactor, setQualityFactor] = useState(1);

  // Metrics
  const [framesRecorded, setFramesRecorded] = useState(0);
  const [overflowCount, setOverflowCount] = useState(0);
  const [totalFrameTime, setTotalFrameTime] = useState(0);
  const [peakFrameTime, setPeakFrameTime] = useState(0);

  // Refs for tracking work
  const workStartTimesRef = useRef<Map<string, number>>(new Map());

  // Cleanup
  useEffect(() => {
    return () => {
      workStartTimesRef.current.clear();
    };
  }, []);

  // Start work tracking
  const startWork = useCallback((id: string) => {
    workStartTimesRef.current.set(id, performance.now());
  }, []);

  // End work tracking
  const endWork = useCallback((id: string) => {
    const startTime = workStartTimesRef.current.get(id);
    if (startTime === undefined) return;

    const elapsed = performance.now() - startTime;
    workStartTimesRef.current.delete(id);

    setUsedBudgetMs(prev => {
      const newUsed = prev + elapsed;
      const overBudget = newUsed > frameBudgetMs;

      if (overBudget && !isOverBudget) {
        setIsOverBudget(true);
        callbacks.onBudgetExceeded?.(newUsed, frameBudgetMs);
      }

      return newUsed;
    });
  }, [frameBudgetMs, isOverBudget, callbacks]);

  // Reset frame
  const resetFrame = useCallback(() => {
    setUsedBudgetMs(0);
    setIsOverBudget(false);
    workStartTimesRef.current.clear();
  }, []);

  // Get remaining budget
  const getRemainingBudget = useCallback((): number => {
    return Math.max(0, frameBudgetMs - usedBudgetMs);
  }, [frameBudgetMs, usedBudgetMs]);

  // Check if work can fit
  const canFitWork = useCallback((estimatedMs: number): boolean => {
    return getRemainingBudget() >= estimatedMs;
  }, [getRemainingBudget]);

  // Get quality suggestion
  const getQualitySuggestion = useCallback((): QualitySuggestion => {
    if (!isOverBudget) {
      return {
        shouldReduce: false,
        factor: 1,
        reason: "Within budget",
      };
    }

    // Calculate suggested reduction factor
    const overageRatio = usedBudgetMs / frameBudgetMs;
    const suggestedFactor = Math.max(
      mergedConfig.minQualityFactor,
      1 / overageRatio
    );

    return {
      shouldReduce: true,
      factor: suggestedFactor,
      reason: "Budget exceeded by " + Math.round((overageRatio - 1) * 100) + "%",
    };
  }, [isOverBudget, usedBudgetMs, frameBudgetMs, mergedConfig.minQualityFactor]);

  // Record frame complete
  const recordFrameComplete = useCallback(() => {
    // Capture current values before reset
    const frameTime = usedBudgetMs;
    const wasOverBudget = isOverBudget;

    setFramesRecorded(prev => prev + 1);
    setTotalFrameTime(prev => prev + frameTime);
    setPeakFrameTime(prev => Math.max(prev, frameTime));

    if (wasOverBudget) {
      setOverflowCount(prev => prev + 1);

      // Auto-adjust quality
      const suggestion = getQualitySuggestion();
      setQualityFactor(suggestion.factor);
      callbacks.onQualityAdjusted?.(suggestion.factor);
    }

    // Reset for next frame
    resetFrame();
  }, [usedBudgetMs, isOverBudget, getQualitySuggestion, resetFrame, callbacks]);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    setFramesRecorded(0);
    setOverflowCount(0);
    setTotalFrameTime(0);
    setPeakFrameTime(0);
    setQualityFactor(1);
  }, []);

  // Calculate average frame time
  const averageFrameTime = useMemo(() => {
    if (framesRecorded === 0) return 0;
    return totalFrameTime / framesRecorded;
  }, [totalFrameTime, framesRecorded]);

  // Return values
  const state: BudgetState = useMemo(() => ({
    isActive: true,
    currentBudgetMs: frameBudgetMs,
    usedBudgetMs,
    isOverBudget,
    qualityFactor,
  }), [frameBudgetMs, usedBudgetMs, isOverBudget, qualityFactor]);

  const metrics: BudgetMetrics = useMemo(() => ({
    framesRecorded,
    overflowCount,
    averageFrameTime,
    peakFrameTime,
  }), [framesRecorded, overflowCount, averageFrameTime, peakFrameTime]);

  const controls: BudgetControls = useMemo(() => ({
    startWork,
    endWork,
    resetFrame,
    getRemainingBudget,
    canFitWork,
    getQualitySuggestion,
    recordFrameComplete,
    resetMetrics,
  }), [
    startWork,
    endWork,
    resetFrame,
    getRemainingBudget,
    canFitWork,
    getQualitySuggestion,
    recordFrameComplete,
    resetMetrics,
  ]);

  return { state, metrics, controls };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useWorkScheduler(): {
  scheduleWork: (id: string, callback: () => void, estimatedMs: number) => void;
  cancelWork: (id: string) => void;
  executeNext: () => WorkItem | null;
  pendingCount: number;
} {
  const [pendingCount, setPendingCount] = useState(0);
  const workQueueRef = useRef<Map<string, WorkItem>>(new Map());

  const scheduleWork = useCallback((id: string, callback: () => void, estimatedMs: number) => {
    workQueueRef.current.set(id, {
      id,
      callback,
      estimatedMs,
      scheduledAt: performance.now(),
    });
    setPendingCount(workQueueRef.current.size);
  }, []);

  const cancelWork = useCallback((id: string) => {
    workQueueRef.current.delete(id);
    setPendingCount(workQueueRef.current.size);
  }, []);

  const executeNext = useCallback((): WorkItem | null => {
    const entries = Array.from(workQueueRef.current.entries());
    if (entries.length === 0) return null;

    const [id, item] = entries[0];
    workQueueRef.current.delete(id);
    setPendingCount(workQueueRef.current.size);

    return item;
  }, []);

  return { scheduleWork, cancelWork, executeNext, pendingCount };
}

export function useBudgetMonitor(budgetMs: number): {
  startTracking: () => void;
  stopTracking: () => void;
  reset: () => void;
  isOverBudget: boolean;
  usedMs: number;
  remainingMs: number;
} {
  const [usedMs, setUsedMs] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  const isOverBudget = useMemo(() => usedMs > budgetMs, [usedMs, budgetMs]);
  const remainingMs = useMemo(() => Math.max(0, budgetMs - usedMs), [budgetMs, usedMs]);

  const startTracking = useCallback(() => {
    startTimeRef.current = performance.now();
  }, []);

  const stopTracking = useCallback(() => {
    if (startTimeRef.current === null) return;

    const elapsed = performance.now() - startTimeRef.current;
    setUsedMs(prev => prev + elapsed);
    startTimeRef.current = null;
  }, []);

  const reset = useCallback(() => {
    setUsedMs(0);
    startTimeRef.current = null;
  }, []);

  return { startTracking, stopTracking, reset, isOverBudget, usedMs, remainingMs };
}

export default useAvatarFrameBudget;
