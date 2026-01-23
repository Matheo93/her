/**
 * useAvatarTouchAnimationSync - Sprint 533
 *
 * Synchronizes avatar animations with touch input timing for smooth,
 * responsive interactions. Handles frame alignment, interpolation,
 * and jitter reduction.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type SyncMode = "immediate" | "frameAligned" | "interpolated";
export type AnimationPriority = "high" | "normal" | "low";

export interface Position {
  x: number;
  y: number;
}

export interface ScheduledAnimation {
  id: string;
  type: string;
  duration: number;
  priority: AnimationPriority;
  scheduledAt: number;
  startedAt?: number;
}

export interface SyncConfig {
  syncMode: SyncMode;
  targetFps: number;
  maxPendingAnimations: number;
  smoothingFactor: number;
}

export interface SyncCallbacks {
  onTouchStarted?: (position: Position) => void;
  onAnimationStart?: (anim: ScheduledAnimation) => void;
  onAnimationComplete?: (anim: ScheduledAnimation) => void;
}

export interface SyncState {
  isActive: boolean;
  isTouching: boolean;
  pendingAnimations: number;
  syncMode: SyncMode;
  frameBudgetMs: number;
  touchPosition: Position | null;
  smoothedTouchPosition: Position | null;
}

export interface SyncMetrics {
  framesProcessed: number;
  touchEventsProcessed: number;
  averageSyncDelayMs: number;
  lastSyncDelayMs: number;
  droppedFrames: number;
  jitterSampleCount: number;
}

export interface SyncControls {
  onTouchStart: (position: Position) => void;
  onTouchMove: (position: Position) => void;
  onTouchEnd: () => void;
  scheduleAnimation: (anim: { type: string; duration: number; priority: AnimationPriority }) => string;
  cancelAnimation: (id: string) => void;
  getNextAnimation: () => ScheduledAnimation | null;
  processFrame: () => void;
  interpolateForTouch: (start: Position, end: Position, t: number) => Position;
  markAnimationStarted: () => void;
  completeAnimation: (id: string) => void;
  resetMetrics: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: SyncConfig = {
  syncMode: "immediate",
  targetFps: 60,
  maxPendingAnimations: 10,
  smoothingFactor: 0.3,
};

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarTouchAnimationSync(
  config: Partial<SyncConfig> = {},
  callbacks: SyncCallbacks = {}
): { state: SyncState; metrics: SyncMetrics; controls: SyncControls } {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  const [isTouching, setIsTouching] = useState(false);
  const [pendingAnimations, setPendingAnimations] = useState(0);
  const [touchPosition, setTouchPosition] = useState<Position | null>(null);
  const [smoothedTouchPosition, setSmoothedTouchPosition] = useState<Position | null>(null);
  
  const [framesProcessed, setFramesProcessed] = useState(0);
  const [touchEventsProcessed, setTouchEventsProcessed] = useState(0);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [jitterSampleCount, setJitterSampleCount] = useState(0);
  const [lastSyncDelayMs, setLastSyncDelayMs] = useState(0);

  const animQueueRef = useRef<ScheduledAnimation[]>([]);
  const lastFrameTimeRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const syncDelaysRef = useRef<number[]>([]);
  const previousPositionRef = useRef<Position | null>(null);

  const frameBudgetMs = useMemo(
    () => 1000 / mergedConfig.targetFps,
    [mergedConfig.targetFps]
  );

  useEffect(() => {
    return () => {
      animQueueRef.current = [];
    };
  }, []);

  const onTouchStart = useCallback((position: Position) => {
    setIsTouching(true);
    setTouchPosition(position);
    setSmoothedTouchPosition(position);
    setTouchEventsProcessed(prev => prev + 1);
    touchStartTimeRef.current = performance.now();
    previousPositionRef.current = position;
    callbacks.onTouchStarted?.(position);
  }, [callbacks]);

  const onTouchMove = useCallback((position: Position) => {
    setTouchPosition(position);
    setTouchEventsProcessed(prev => prev + 1);
    
    // Apply smoothing
    if (previousPositionRef.current) {
      const smoothed = {
        x: previousPositionRef.current.x + (position.x - previousPositionRef.current.x) * mergedConfig.smoothingFactor,
        y: previousPositionRef.current.y + (position.y - previousPositionRef.current.y) * mergedConfig.smoothingFactor,
      };
      setSmoothedTouchPosition(smoothed);
      setJitterSampleCount(prev => prev + 1);
    }
    previousPositionRef.current = position;
  }, [mergedConfig.smoothingFactor]);

  const onTouchEnd = useCallback(() => {
    setIsTouching(false);
    setTouchEventsProcessed(prev => prev + 1);
  }, []);

  const scheduleAnimation = useCallback((anim: { type: string; duration: number; priority: AnimationPriority }): string => {
    const id = "anim_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    const now = performance.now();

    const scheduled: ScheduledAnimation = {
      id,
      type: anim.type,
      duration: anim.duration,
      priority: anim.priority,
      scheduledAt: mergedConfig.syncMode === "frameAligned" 
        ? Math.ceil(now / frameBudgetMs) * frameBudgetMs 
        : now,
    };

    // Enforce max queue
    if (animQueueRef.current.length >= mergedConfig.maxPendingAnimations) {
      animQueueRef.current.sort((a, b) => {
        const order = { high: 0, normal: 1, low: 2 };
        return order[b.priority] - order[a.priority];
      });
      animQueueRef.current.pop();
    }

    animQueueRef.current.push(scheduled);
    setPendingAnimations(animQueueRef.current.length);

    return id;
  }, [mergedConfig.syncMode, mergedConfig.maxPendingAnimations, frameBudgetMs]);

  const cancelAnimation = useCallback((id: string) => {
    animQueueRef.current = animQueueRef.current.filter(a => a.id !== id);
    setPendingAnimations(animQueueRef.current.length);
  }, []);

  const getNextAnimation = useCallback((): ScheduledAnimation | null => {
    if (animQueueRef.current.length === 0) return null;
    
    // Sort by priority
    animQueueRef.current.sort((a, b) => {
      const order = { high: 0, normal: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });

    return animQueueRef.current[0];
  }, []);

  const processFrame = useCallback(() => {
    const now = performance.now();
    const delta = now - lastFrameTimeRef.current;

    if (lastFrameTimeRef.current > 0 && delta > frameBudgetMs * 1.5) {
      setDroppedFrames(prev => prev + Math.floor(delta / frameBudgetMs) - 1);
    }

    lastFrameTimeRef.current = now;
    setFramesProcessed(prev => prev + 1);

    // Process animations
    const next = getNextAnimation();
    if (next && next.scheduledAt <= now) {
      next.startedAt = now;
      callbacks.onAnimationStart?.(next);
    }
  }, [frameBudgetMs, getNextAnimation, callbacks]);

  const interpolateForTouch = useCallback((start: Position, end: Position, t: number): Position => {
    const clamped = Math.max(0, Math.min(1, t));
    return {
      x: start.x + (end.x - start.x) * clamped,
      y: start.y + (end.y - start.y) * clamped,
    };
  }, []);

  const markAnimationStarted = useCallback(() => {
    const now = performance.now();
    const delay = now - touchStartTimeRef.current;
    setLastSyncDelayMs(delay);
    syncDelaysRef.current.push(delay);
    if (syncDelaysRef.current.length > 20) {
      syncDelaysRef.current.shift();
    }
  }, []);

  const completeAnimation = useCallback((id: string) => {
    const anim = animQueueRef.current.find(a => a.id === id);
    if (anim) {
      callbacks.onAnimationComplete?.(anim);
      animQueueRef.current = animQueueRef.current.filter(a => a.id !== id);
      setPendingAnimations(animQueueRef.current.length);
    }
  }, [callbacks]);

  const resetMetrics = useCallback(() => {
    setFramesProcessed(0);
    setTouchEventsProcessed(0);
    setDroppedFrames(0);
    setJitterSampleCount(0);
    setLastSyncDelayMs(0);
    syncDelaysRef.current = [];
  }, []);

  const averageSyncDelayMs = useMemo(() => {
    if (syncDelaysRef.current.length === 0) return 0;
    return syncDelaysRef.current.reduce((a, b) => a + b, 0) / syncDelaysRef.current.length;
  }, [touchEventsProcessed]);

  const state: SyncState = useMemo(() => ({
    isActive: true,
    isTouching,
    pendingAnimations,
    syncMode: mergedConfig.syncMode,
    frameBudgetMs,
    touchPosition,
    smoothedTouchPosition,
  }), [isTouching, pendingAnimations, mergedConfig.syncMode, frameBudgetMs, touchPosition, smoothedTouchPosition]);

  const metrics: SyncMetrics = useMemo(() => ({
    framesProcessed,
    touchEventsProcessed,
    averageSyncDelayMs,
    lastSyncDelayMs,
    droppedFrames,
    jitterSampleCount,
  }), [framesProcessed, touchEventsProcessed, averageSyncDelayMs, lastSyncDelayMs, droppedFrames, jitterSampleCount]);

  const controls: SyncControls = useMemo(() => ({
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    scheduleAnimation,
    cancelAnimation,
    getNextAnimation,
    processFrame,
    interpolateForTouch,
    markAnimationStarted,
    completeAnimation,
    resetMetrics,
  }), [
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    scheduleAnimation,
    cancelAnimation,
    getNextAnimation,
    processFrame,
    interpolateForTouch,
    markAnimationStarted,
    completeAnimation,
    resetMetrics,
  ]);

  return { state, metrics, controls };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useTouchAlignedAnimation(): {
  start: () => void;
  stop: () => void;
  isRunning: boolean;
} {
  const [isRunning, setIsRunning] = useState(false);
  const rafRef = useRef<number | null>(null);

  const start = useCallback(() => {
    setIsRunning(true);
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { start, stop, isRunning };
}

export function useAnimationFrameSync(
  callback?: (time: number) => void
): {
  requestSync: () => void;
  cancelSync: () => void;
  isSynced: boolean;
} {
  const [isSynced, setIsSynced] = useState(false);
  const rafRef = useRef<number | null>(null);

  const requestSync = useCallback(() => {
    setIsSynced(true);
    rafRef.current = requestAnimationFrame((time) => {
      callback?.(time);
    });
  }, [callback]);

  const cancelSync = useCallback(() => {
    setIsSynced(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { requestSync, cancelSync, isSynced };
}

export default useAvatarTouchAnimationSync;
