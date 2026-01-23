/**
 * useAvatarRenderTiming - Sprint 542
 *
 * Precise render timing control for mobile avatar animations.
 * Optimizes frame delivery to minimize visual latency and jank.
 *
 * Key features:
 * - Frame deadline enforcement with automatic quality scaling
 * - VSync alignment for tear-free rendering
 * - Input-to-render latency tracking and optimization
 * - Render pipeline timing metrics
 * - Dropped frame recovery strategies
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type RenderPhase = "idle" | "input" | "update" | "render" | "composite";
export type VSyncAlignment = "aligned" | "misaligned" | "unknown";
export type DeadlineStatus = "met" | "close" | "missed";
export type RecoveryStrategy = "skip" | "interpolate" | "extrapolate" | "reduce-quality";

export interface FrameDeadline {
  targetMs: number;
  actualMs: number;
  status: DeadlineStatus;
  missedBy: number;
}

export interface RenderPhaseTiming {
  input: number;
  update: number;
  render: number;
  composite: number;
  total: number;
}

export interface FrameStats {
  frameNumber: number;
  timestamp: number;
  deltaMs: number;
  deadline: FrameDeadline;
  phaseTiming: RenderPhaseTiming;
  vsyncAligned: boolean;
  wasRecovered: boolean;
}

export interface RenderTimingConfig {
  targetFps: number;
  deadlineBufferMs: number;
  vsyncEnabled: boolean;
  enableRecovery: boolean;
  recoveryStrategy: RecoveryStrategy;
  maxConsecutiveMisses: number;
  qualityScaleStep: number;
  minQualityScale: number;
}

export interface RenderTimingCallbacks {
  onDeadlineMet?: (stats: FrameStats) => void;
  onDeadlineMissed?: (stats: FrameStats, missCount: number) => void;
  onQualityScaleChange?: (scale: number, reason: string) => void;
  onRecovery?: (strategy: RecoveryStrategy, frameNumber: number) => void;
  onVSyncStatusChange?: (aligned: VSyncAlignment) => void;
}

export interface RenderTimingState {
  isActive: boolean;
  currentPhase: RenderPhase;
  frameNumber: number;
  currentFps: number;
  qualityScale: number;
  vsyncAlignment: VSyncAlignment;
  consecutiveMisses: number;
  isRecovering: boolean;
}

export interface RenderTimingMetrics {
  averageFrameTime: number;
  p95FrameTime: number;
  p99FrameTime: number;
  inputLatencyMs: number;
  renderLatencyMs: number;
  totalLatencyMs: number;
  deadlinesMet: number;
  deadlinesMissed: number;
  deadlineMetRate: number;
  framesRecovered: number;
  qualityScaleChanges: number;
}

export interface RenderTimingControls {
  start: () => void;
  stop: () => void;
  markPhaseStart: (phase: RenderPhase) => void;
  markPhaseEnd: (phase: RenderPhase) => void;
  requestFrame: (callback: (timestamp: number) => void) => number;
  cancelFrame: (id: number) => void;
  forceQualityScale: (scale: number | null) => void;
  setRecoveryStrategy: (strategy: RecoveryStrategy) => void;
  resetMetrics: () => void;
  getLastFrameStats: () => FrameStats | null;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: RenderTimingConfig = {
  targetFps: 60,
  deadlineBufferMs: 2, // 2ms buffer before deadline
  vsyncEnabled: true,
  enableRecovery: true,
  recoveryStrategy: "interpolate",
  maxConsecutiveMisses: 3,
  qualityScaleStep: 0.1,
  minQualityScale: 0.5,
};

// ============================================================================
// Helper Functions
// ============================================================================

function calculateDeadlineStatus(
  actualMs: number,
  targetMs: number,
  bufferMs: number
): DeadlineStatus {
  if (actualMs <= targetMs - bufferMs) return "met";
  if (actualMs <= targetMs) return "close";
  return "missed";
}

function calculateVSyncAlignment(
  frameTimes: number[],
  targetFrameMs: number
): VSyncAlignment {
  if (frameTimes.length < 10) return "unknown";

  // Check if frame times cluster around vsync intervals
  let alignedCount = 0;
  for (const time of frameTimes) {
    const remainder = time % targetFrameMs;
    const distanceFromVSync = Math.min(remainder, targetFrameMs - remainder);
    if (distanceFromVSync < 2) {
      alignedCount++;
    }
  }

  const alignmentRate = alignedCount / frameTimes.length;
  return alignmentRate > 0.8 ? "aligned" : "misaligned";
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarRenderTiming(
  config: Partial<RenderTimingConfig> = {},
  callbacks: RenderTimingCallbacks = {}
): { state: RenderTimingState; metrics: RenderTimingMetrics; controls: RenderTimingControls } {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  const targetFrameMs = useMemo(
    () => 1000 / mergedConfig.targetFps,
    [mergedConfig.targetFps]
  );

  // State
  const [isActive, setIsActive] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<RenderPhase>("idle");
  const [frameNumber, setFrameNumber] = useState(0);
  const [currentFps, setCurrentFps] = useState(mergedConfig.targetFps);
  const [qualityScale, setQualityScale] = useState(1);
  const [vsyncAlignment, setVSyncAlignment] = useState<VSyncAlignment>("unknown");
  const [consecutiveMisses, setConsecutiveMisses] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);

  // Metrics state
  const [averageFrameTime, setAverageFrameTime] = useState(targetFrameMs);
  const [p95FrameTime, setP95FrameTime] = useState(targetFrameMs);
  const [p99FrameTime, setP99FrameTime] = useState(targetFrameMs);
  const [inputLatencyMs, setInputLatencyMs] = useState(0);
  const [renderLatencyMs, setRenderLatencyMs] = useState(0);
  const [totalLatencyMs, setTotalLatencyMs] = useState(0);
  const [deadlinesMet, setDeadlinesMet] = useState(0);
  const [deadlinesMissed, setDeadlinesMissed] = useState(0);
  const [framesRecovered, setFramesRecovered] = useState(0);
  const [qualityScaleChanges, setQualityScaleChanges] = useState(0);

  // Refs
  const frameTimesRef = useRef<number[]>([]);
  const phaseStartTimesRef = useRef<Record<RenderPhase, number>>({
    idle: 0,
    input: 0,
    update: 0,
    render: 0,
    composite: 0,
  });
  const phaseTimingsRef = useRef<RenderPhaseTiming>({
    input: 0,
    update: 0,
    render: 0,
    composite: 0,
    total: 0,
  });
  const lastFrameTimeRef = useRef(performance.now());
  const lastFrameStatsRef = useRef<FrameStats | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const forcedQualityScaleRef = useRef<number | null>(null);
  const recoveryStrategyRef = useRef<RecoveryStrategy>(mergedConfig.recoveryStrategy);
  const prevVSyncAlignmentRef = useRef<VSyncAlignment>(vsyncAlignment);

  // Frame loop
  useEffect(() => {
    if (!isActive) return;

    const frameLoop = (timestamp: number) => {
      const now = performance.now();
      const deltaMs = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      // Track frame times
      frameTimesRef.current.push(deltaMs);
      if (frameTimesRef.current.length > 100) {
        frameTimesRef.current.shift();
      }

      // Calculate deadline status
      const deadlineStatus = calculateDeadlineStatus(
        deltaMs,
        targetFrameMs,
        mergedConfig.deadlineBufferMs
      );

      const deadline: FrameDeadline = {
        targetMs: targetFrameMs,
        actualMs: deltaMs,
        status: deadlineStatus,
        missedBy: deadlineStatus === "missed" ? deltaMs - targetFrameMs : 0,
      };

      // Track deadline performance
      if (deadlineStatus === "missed") {
        setDeadlinesMissed(prev => prev + 1);
        setConsecutiveMisses(prev => {
          const newCount = prev + 1;
          callbacks.onDeadlineMissed?.(lastFrameStatsRef.current!, newCount);

          // Handle recovery if enabled
          if (
            mergedConfig.enableRecovery &&
            newCount >= mergedConfig.maxConsecutiveMisses
          ) {
            setIsRecovering(true);

            // Apply recovery strategy
            if (recoveryStrategyRef.current === "reduce-quality") {
              const newScale = Math.max(
                mergedConfig.minQualityScale,
                (forcedQualityScaleRef.current ?? qualityScale) - mergedConfig.qualityScaleStep
              );
              setQualityScale(newScale);
              setQualityScaleChanges(c => c + 1);
              callbacks.onQualityScaleChange?.(newScale, "deadline-missed");
            }

            callbacks.onRecovery?.(recoveryStrategyRef.current, frameNumber);
            setFramesRecovered(prev => prev + 1);
          }

          return newCount;
        });
      } else {
        setDeadlinesMet(prev => prev + 1);
        setConsecutiveMisses(0);
        setIsRecovering(false);

        // Gradually restore quality if forced quality not set
        if (
          forcedQualityScaleRef.current === null &&
          qualityScale < 1 &&
          !isRecovering
        ) {
          const newScale = Math.min(1, qualityScale + mergedConfig.qualityScaleStep * 0.1);
          if (newScale !== qualityScale) {
            setQualityScale(newScale);
            setQualityScaleChanges(c => c + 1);
            callbacks.onQualityScaleChange?.(newScale, "recovery");
          }
        }

        callbacks.onDeadlineMet?.(lastFrameStatsRef.current!);
      }

      // Calculate VSync alignment
      const newVSyncAlignment = calculateVSyncAlignment(
        frameTimesRef.current,
        targetFrameMs
      );
      if (newVSyncAlignment !== prevVSyncAlignmentRef.current) {
        setVSyncAlignment(newVSyncAlignment);
        callbacks.onVSyncStatusChange?.(newVSyncAlignment);
        prevVSyncAlignmentRef.current = newVSyncAlignment;
      }

      // Update metrics
      const frameTimes = frameTimesRef.current;
      if (frameTimes.length > 0) {
        const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        setAverageFrameTime(avg);
        setCurrentFps(Math.round(1000 / avg));

        if (frameTimes.length >= 10) {
          const sorted = [...frameTimes].sort((a, b) => a - b);
          setP95FrameTime(sorted[Math.floor(sorted.length * 0.95)]);
          setP99FrameTime(sorted[Math.floor(sorted.length * 0.99)]);
        }
      }

      // Update total latency
      const phaseTiming = phaseTimingsRef.current;
      setTotalLatencyMs(phaseTiming.total);
      setInputLatencyMs(phaseTiming.input);
      setRenderLatencyMs(phaseTiming.render);

      // Build frame stats
      const frameStats: FrameStats = {
        frameNumber,
        timestamp: now,
        deltaMs,
        deadline,
        phaseTiming: { ...phaseTiming },
        vsyncAligned: newVSyncAlignment === "aligned",
        wasRecovered: isRecovering,
      };
      lastFrameStatsRef.current = frameStats;

      // Increment frame number
      setFrameNumber(prev => prev + 1);

      // Continue loop
      animationFrameRef.current = requestAnimationFrame(frameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(frameLoop);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [
    isActive,
    targetFrameMs,
    mergedConfig,
    qualityScale,
    isRecovering,
    frameNumber,
    callbacks,
  ]);

  // Start/stop controls
  const start = useCallback(() => {
    lastFrameTimeRef.current = performance.now();
    setIsActive(true);
  }, []);

  const stop = useCallback(() => {
    setIsActive(false);
    setCurrentPhase("idle");
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Phase tracking
  const markPhaseStart = useCallback((phase: RenderPhase) => {
    phaseStartTimesRef.current[phase] = performance.now();
    setCurrentPhase(phase);
  }, []);

  const markPhaseEnd = useCallback((phase: RenderPhase) => {
    const startTime = phaseStartTimesRef.current[phase];
    if (startTime > 0) {
      const duration = performance.now() - startTime;
      phaseTimingsRef.current[phase] = duration;

      // Update total
      const timings = phaseTimingsRef.current;
      timings.total = timings.input + timings.update + timings.render + timings.composite;
    }
    setCurrentPhase("idle");
  }, []);

  // Frame request management
  const requestFrame = useCallback((callback: (timestamp: number) => void): number => {
    return requestAnimationFrame(callback);
  }, []);

  const cancelFrame = useCallback((id: number) => {
    cancelAnimationFrame(id);
  }, []);

  // Quality control
  const forceQualityScale = useCallback((scale: number | null) => {
    forcedQualityScaleRef.current = scale;
    if (scale !== null) {
      setQualityScale(scale);
      setQualityScaleChanges(c => c + 1);
      callbacks.onQualityScaleChange?.(scale, "forced");
    }
  }, [callbacks]);

  const setRecoveryStrategy = useCallback((strategy: RecoveryStrategy) => {
    recoveryStrategyRef.current = strategy;
  }, []);

  const resetMetrics = useCallback(() => {
    frameTimesRef.current = [];
    setAverageFrameTime(targetFrameMs);
    setP95FrameTime(targetFrameMs);
    setP99FrameTime(targetFrameMs);
    setInputLatencyMs(0);
    setRenderLatencyMs(0);
    setTotalLatencyMs(0);
    setDeadlinesMet(0);
    setDeadlinesMissed(0);
    setFramesRecovered(0);
    setQualityScaleChanges(0);
    setConsecutiveMisses(0);
    setFrameNumber(0);
    lastFrameStatsRef.current = null;
  }, [targetFrameMs]);

  const getLastFrameStats = useCallback((): FrameStats | null => {
    return lastFrameStatsRef.current;
  }, []);

  // Compute deadline met rate
  const deadlineMetRate = useMemo(() => {
    const total = deadlinesMet + deadlinesMissed;
    return total > 0 ? deadlinesMet / total : 1;
  }, [deadlinesMet, deadlinesMissed]);

  // Build state object
  const state: RenderTimingState = useMemo(() => ({
    isActive,
    currentPhase,
    frameNumber,
    currentFps,
    qualityScale,
    vsyncAlignment,
    consecutiveMisses,
    isRecovering,
  }), [
    isActive,
    currentPhase,
    frameNumber,
    currentFps,
    qualityScale,
    vsyncAlignment,
    consecutiveMisses,
    isRecovering,
  ]);

  // Build metrics object
  const metrics: RenderTimingMetrics = useMemo(() => ({
    averageFrameTime,
    p95FrameTime,
    p99FrameTime,
    inputLatencyMs,
    renderLatencyMs,
    totalLatencyMs,
    deadlinesMet,
    deadlinesMissed,
    deadlineMetRate,
    framesRecovered,
    qualityScaleChanges,
  }), [
    averageFrameTime,
    p95FrameTime,
    p99FrameTime,
    inputLatencyMs,
    renderLatencyMs,
    totalLatencyMs,
    deadlinesMet,
    deadlinesMissed,
    deadlineMetRate,
    framesRecovered,
    qualityScaleChanges,
  ]);

  // Build controls object
  const controls: RenderTimingControls = useMemo(() => ({
    start,
    stop,
    markPhaseStart,
    markPhaseEnd,
    requestFrame,
    cancelFrame,
    forceQualityScale,
    setRecoveryStrategy,
    resetMetrics,
    getLastFrameStats,
  }), [
    start,
    stop,
    markPhaseStart,
    markPhaseEnd,
    requestFrame,
    cancelFrame,
    forceQualityScale,
    setRecoveryStrategy,
    resetMetrics,
    getLastFrameStats,
  ]);

  return { state, metrics, controls };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useFrameDeadline(): {
  isActive: boolean;
  deadlineMetRate: number;
  currentFps: number;
  start: () => void;
  stop: () => void;
} {
  const { state, metrics, controls } = useAvatarRenderTiming();

  return {
    isActive: state.isActive,
    deadlineMetRate: metrics.deadlineMetRate,
    currentFps: state.currentFps,
    start: controls.start,
    stop: controls.stop,
  };
}

export function useRenderPhaseTracker(): {
  currentPhase: RenderPhase;
  markStart: (phase: RenderPhase) => void;
  markEnd: (phase: RenderPhase) => void;
  phaseTiming: RenderPhaseTiming | null;
} {
  const { state, controls } = useAvatarRenderTiming();
  const lastStats = controls.getLastFrameStats();

  return {
    currentPhase: state.currentPhase,
    markStart: controls.markPhaseStart,
    markEnd: controls.markPhaseEnd,
    phaseTiming: lastStats?.phaseTiming ?? null,
  };
}

export function useRenderQualityScale(): {
  scale: number;
  forceScale: (scale: number | null) => void;
  isRecovering: boolean;
} {
  const { state, controls } = useAvatarRenderTiming();

  return {
    scale: state.qualityScale,
    forceScale: controls.forceQualityScale,
    isRecovering: state.isRecovering,
  };
}

export function useVSyncStatus(): {
  alignment: VSyncAlignment;
  isAligned: boolean;
} {
  const { state } = useAvatarRenderTiming();

  return {
    alignment: state.vsyncAlignment,
    isAligned: state.vsyncAlignment === "aligned",
  };
}

export default useAvatarRenderTiming;
