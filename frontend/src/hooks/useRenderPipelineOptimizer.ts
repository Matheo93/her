/**
 * useRenderPipelineOptimizer - GPU Render Pipeline Optimization Hook
 *
 * Sprint 521: Optimizes the rendering pipeline for mobile avatar UX:
 * - Frame budget management with dynamic adjustment
 * - GPU utilization monitoring
 * - Render pass batching and scheduling
 * - Occlusion culling hints
 * - LOD (Level of Detail) management
 *
 * @example
 * ```tsx
 * const { state, controls, metrics } = useRenderPipelineOptimizer({
 *   targetFps: 60,
 *   budgetMs: 16,
 *   enableOcclusion: true,
 * });
 *
 * // Check if within budget before expensive operation
 * if (controls.hasRemainingBudget(5)) {
 *   renderHighDetailAvatar();
 * } else {
 *   renderLowDetailAvatar();
 * }
 *
 * // Schedule work within frame budget
 * controls.scheduleRenderWork('avatar', () => updateAvatar(), 'high');
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Render pass priority
 */
export type RenderPriority = "critical" | "high" | "normal" | "low" | "deferred";

/**
 * LOD level
 */
export type LODLevel = "ultra" | "high" | "medium" | "low" | "minimal";

/**
 * GPU tier estimate
 */
export type GPUTier = "high" | "medium" | "low" | "unknown";

/**
 * Render pass info
 */
export interface RenderPass {
  id: string;
  name: string;
  priority: RenderPriority;
  estimatedMs: number;
  actualMs?: number;
  callback: () => void;
  scheduled: number;
  executed?: number;
  skipped: boolean;
}

/**
 * Frame budget state
 */
export interface FrameBudget {
  totalBudgetMs: number;
  usedMs: number;
  remainingMs: number;
  isOverBudget: boolean;
  utilizationPercent: number;
}

/**
 * GPU info
 */
export interface GPUInfo {
  tier: GPUTier;
  renderer: string;
  vendor: string;
  isWebGL2: boolean;
  maxTextureSize: number;
  maxVertexAttribs: number;
  estimatedVRAM: number;
}

/**
 * Occlusion hint
 */
export interface OcclusionHint {
  elementId: string;
  isVisible: boolean;
  visiblePercent: number;
  lastChecked: number;
}

/**
 * Pipeline metrics
 */
export interface PipelineMetrics {
  framesRendered: number;
  framesDropped: number;
  frameDropRate: number;
  avgFrameTimeMs: number;
  avgGPUTimeMs: number;
  avgJitterMs: number;
  p50FrameTimeMs: number;
  p95FrameTimeMs: number;
  p99FrameTimeMs: number;
  passExecutions: number;
  passSkips: number;
  lodChanges: number;
  budgetOverruns: number;
  currentLOD: LODLevel;
}

/**
 * Pipeline state
 */
export interface PipelineState {
  isActive: boolean;
  currentFps: number;
  targetFps: number;
  currentLOD: LODLevel;
  gpuInfo: GPUInfo | null;
  frameBudget: FrameBudget;
  queuedPasses: number;
  isThrottled: boolean;
}

/**
 * Pipeline config
 */
export interface PipelineConfig {
  /** Target frames per second */
  targetFps: number;
  /** Frame budget in milliseconds */
  budgetMs: number;
  /** Enable occlusion culling hints */
  enableOcclusion: boolean;
  /** Enable automatic LOD adjustment */
  enableAutoLOD: boolean;
  /** Budget buffer percentage for safety margin */
  budgetBufferPercent: number;
  /** Min LOD level to allow */
  minLOD: LODLevel;
  /** Sample window size for metrics */
  sampleWindow: number;
  /** Throttle threshold (consecutive overbudget frames) */
  throttleThreshold: number;
  /** Recovery threshold (consecutive under-budget frames) */
  recoveryThreshold: number;
}

/**
 * Pipeline controls
 */
export interface PipelineControls {
  /** Check if budget allows for additional work */
  hasRemainingBudget: (estimatedMs: number) => boolean;
  /** Schedule render work with priority */
  scheduleRenderWork: (
    id: string,
    callback: () => void,
    priority: RenderPriority,
    estimatedMs?: number
  ) => void;
  /** Cancel scheduled work */
  cancelRenderWork: (id: string) => void;
  /** Mark start of frame */
  beginFrame: () => void;
  /** Mark end of frame */
  endFrame: () => void;
  /** Request LOD change */
  requestLOD: (level: LODLevel) => void;
  /** Add occlusion hint */
  addOcclusionHint: (elementId: string, isVisible: boolean, visiblePercent?: number) => void;
  /** Remove occlusion hint */
  removeOcclusionHint: (elementId: string) => void;
  /** Check if element should render based on occlusion */
  shouldRender: (elementId: string) => boolean;
  /** Force flush all queued work */
  flushQueue: () => void;
  /** Reset metrics */
  resetMetrics: () => void;
  /** Start monitoring */
  start: () => void;
  /** Stop monitoring */
  stop: () => void;
}

/**
 * Hook result
 */
export interface UseRenderPipelineOptimizerResult {
  state: PipelineState;
  metrics: PipelineMetrics;
  controls: PipelineControls;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: PipelineConfig = {
  targetFps: 60,
  budgetMs: 16.67,
  enableOcclusion: true,
  enableAutoLOD: true,
  budgetBufferPercent: 10,
  minLOD: "minimal",
  sampleWindow: 60,
  throttleThreshold: 5,
  recoveryThreshold: 30,
};

const LOD_ORDER: LODLevel[] = ["ultra", "high", "medium", "low", "minimal"];

const PRIORITY_ORDER: RenderPriority[] = ["critical", "high", "normal", "low", "deferred"];

// ============================================================================
// Utility Functions
// ============================================================================

function detectGPU(): GPUInfo {
  const canvas = document.createElement("canvas");
  const gl =
    (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ||
    (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
    (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

  if (!gl) {
    return {
      tier: "unknown",
      renderer: "unknown",
      vendor: "unknown",
      isWebGL2: false,
      maxTextureSize: 0,
      maxVertexAttribs: 0,
      estimatedVRAM: 0,
    };
  }

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : "unknown";
  const vendor = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    : "unknown";

  const isWebGL2 = gl instanceof WebGL2RenderingContext;
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);

  // Estimate GPU tier based on capabilities
  let tier: GPUTier = "medium";
  if (maxTextureSize >= 16384 && isWebGL2) {
    tier = "high";
  } else if (maxTextureSize < 4096 || !isWebGL2) {
    tier = "low";
  }

  // Check for known high-end GPUs
  const rendererLower = renderer.toLowerCase();
  if (
    rendererLower.includes("rtx") ||
    rendererLower.includes("radeon rx 6") ||
    rendererLower.includes("radeon rx 7") ||
    rendererLower.includes("m1") ||
    rendererLower.includes("m2") ||
    rendererLower.includes("m3")
  ) {
    tier = "high";
  } else if (
    rendererLower.includes("intel") ||
    rendererLower.includes("mali-g5") ||
    rendererLower.includes("adreno 6")
  ) {
    tier = "medium";
  } else if (
    rendererLower.includes("mali-4") ||
    rendererLower.includes("adreno 3") ||
    rendererLower.includes("adreno 4")
  ) {
    tier = "low";
  }

  // Rough VRAM estimate
  let estimatedVRAM = 2048;
  if (tier === "high") estimatedVRAM = 8192;
  else if (tier === "medium") estimatedVRAM = 4096;
  else if (tier === "low") estimatedVRAM = 1024;

  return {
    tier,
    renderer,
    vendor,
    isWebGL2,
    maxTextureSize,
    maxVertexAttribs,
    estimatedVRAM,
  };
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function getLODIndex(lod: LODLevel): number {
  return LOD_ORDER.indexOf(lod);
}

function nextLowerLOD(current: LODLevel, min: LODLevel): LODLevel {
  const currentIndex = getLODIndex(current);
  const minIndex = getLODIndex(min);
  const nextIndex = Math.min(currentIndex + 1, minIndex);
  return LOD_ORDER[nextIndex];
}

function nextHigherLOD(current: LODLevel): LODLevel {
  const currentIndex = getLODIndex(current);
  const nextIndex = Math.max(currentIndex - 1, 0);
  return LOD_ORDER[nextIndex];
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * GPU render pipeline optimization hook
 */
export function useRenderPipelineOptimizer(
  config: Partial<PipelineConfig> = {},
  callbacks?: {
    onFrameDropped?: (droppedCount: number) => void;
    onLODChanged?: (from: LODLevel, to: LODLevel) => void;
    onBudgetOverrun?: (overrunMs: number) => void;
    onThrottleStateChanged?: (isThrottled: boolean) => void;
  }
): UseRenderPipelineOptimizerResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [isActive, setIsActive] = useState(false);
  const [currentFps, setCurrentFps] = useState(fullConfig.targetFps);
  const [currentLOD, setCurrentLOD] = useState<LODLevel>("high");
  const [gpuInfo, setGpuInfo] = useState<GPUInfo | null>(null);
  const [isThrottled, setIsThrottled] = useState(false);

  // Frame budget state
  const [frameBudget, setFrameBudget] = useState<FrameBudget>({
    totalBudgetMs: fullConfig.budgetMs,
    usedMs: 0,
    remainingMs: fullConfig.budgetMs,
    isOverBudget: false,
    utilizationPercent: 0,
  });

  // Metrics
  const [metrics, setMetrics] = useState<PipelineMetrics>({
    framesRendered: 0,
    framesDropped: 0,
    frameDropRate: 0,
    avgFrameTimeMs: 0,
    avgGPUTimeMs: 0,
    avgJitterMs: 0,
    p50FrameTimeMs: 0,
    p95FrameTimeMs: 0,
    p99FrameTimeMs: 0,
    passExecutions: 0,
    passSkips: 0,
    lodChanges: 0,
    budgetOverruns: 0,
    currentLOD: "high",
  });

  // Refs
  const renderQueueRef = useRef<Map<string, RenderPass>>(new Map());
  const occlusionHintsRef = useRef<Map<string, OcclusionHint>>(new Map());
  const frameStartTimeRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);
  const frameCountRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const overbudgetCountRef = useRef<number>(0);
  const underbudgetCountRef = useRef<number>(0);

  /**
   * Detect GPU on mount
   */
  useEffect(() => {
    const info = detectGPU();
    setGpuInfo(info);

    // Set initial LOD based on GPU tier
    if (info.tier === "low") {
      setCurrentLOD("low");
    } else if (info.tier === "medium") {
      setCurrentLOD("medium");
    } else {
      setCurrentLOD("high");
    }
  }, []);

  /**
   * Check if budget allows additional work
   */
  const hasRemainingBudget = useCallback(
    (estimatedMs: number): boolean => {
      const buffer = fullConfig.budgetMs * (fullConfig.budgetBufferPercent / 100);
      const available = frameBudget.remainingMs - buffer;
      return estimatedMs <= available;
    },
    [frameBudget.remainingMs, fullConfig.budgetMs, fullConfig.budgetBufferPercent]
  );

  /**
   * Schedule render work
   */
  const scheduleRenderWork = useCallback(
    (
      id: string,
      callback: () => void,
      priority: RenderPriority,
      estimatedMs: number = 1
    ): void => {
      const pass: RenderPass = {
        id,
        name: id,
        priority,
        estimatedMs,
        callback,
        scheduled: performance.now(),
        skipped: false,
      };

      renderQueueRef.current.set(id, pass);
    },
    []
  );

  /**
   * Cancel scheduled work
   */
  const cancelRenderWork = useCallback((id: string): void => {
    renderQueueRef.current.delete(id);
  }, []);

  /**
   * Begin frame
   */
  const beginFrame = useCallback((): void => {
    frameStartTimeRef.current = performance.now();
    setFrameBudget((prev) => ({
      ...prev,
      usedMs: 0,
      remainingMs: prev.totalBudgetMs,
      isOverBudget: false,
      utilizationPercent: 0,
    }));
  }, []);

  /**
   * End frame
   */
  const endFrame = useCallback((): void => {
    const now = performance.now();
    const frameTime = now - frameStartTimeRef.current;
    const budget = fullConfig.budgetMs;

    // Update frame budget
    setFrameBudget((prev) => ({
      ...prev,
      usedMs: frameTime,
      remainingMs: Math.max(0, budget - frameTime),
      isOverBudget: frameTime > budget,
      utilizationPercent: (frameTime / budget) * 100,
    }));

    // Track frame times
    frameTimesRef.current.push(frameTime);
    if (frameTimesRef.current.length > fullConfig.sampleWindow) {
      frameTimesRef.current.shift();
    }

    // Check for drops
    const lastDelta = lastFrameTimeRef.current > 0 ? now - lastFrameTimeRef.current : 0;
    const expectedDelta = 1000 / fullConfig.targetFps;
    const droppedFrames = Math.max(0, Math.floor(lastDelta / expectedDelta) - 1);

    // Update over/under budget tracking
    if (frameTime > budget) {
      overbudgetCountRef.current++;
      underbudgetCountRef.current = 0;
      callbacks?.onBudgetOverrun?.(frameTime - budget);

      // Check for throttle
      if (overbudgetCountRef.current >= fullConfig.throttleThreshold && !isThrottled) {
        setIsThrottled(true);
        callbacks?.onThrottleStateChanged?.(true);

        // Auto-adjust LOD if enabled
        if (fullConfig.enableAutoLOD) {
          const newLOD = nextLowerLOD(currentLOD, fullConfig.minLOD);
          if (newLOD !== currentLOD) {
            callbacks?.onLODChanged?.(currentLOD, newLOD);
            setCurrentLOD(newLOD);
            setMetrics((prev) => ({ ...prev, lodChanges: prev.lodChanges + 1 }));
          }
        }
      }
    } else {
      underbudgetCountRef.current++;
      overbudgetCountRef.current = 0;

      // Check for recovery
      if (underbudgetCountRef.current >= fullConfig.recoveryThreshold && isThrottled) {
        setIsThrottled(false);
        callbacks?.onThrottleStateChanged?.(false);

        // Try to increase LOD
        if (fullConfig.enableAutoLOD && frameTime < budget * 0.7) {
          const newLOD = nextHigherLOD(currentLOD);
          if (newLOD !== currentLOD) {
            callbacks?.onLODChanged?.(currentLOD, newLOD);
            setCurrentLOD(newLOD);
            setMetrics((prev) => ({ ...prev, lodChanges: prev.lodChanges + 1 }));
          }
        }
      }
    }

    // Update metrics
    frameCountRef.current++;
    const times = frameTimesRef.current;
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    setMetrics((prev) => ({
      ...prev,
      framesRendered: prev.framesRendered + 1,
      framesDropped: prev.framesDropped + droppedFrames,
      frameDropRate: (prev.framesDropped + droppedFrames) / (prev.framesRendered + 1),
      avgFrameTimeMs: avgTime,
      p50FrameTimeMs: calculatePercentile(times, 50),
      p95FrameTimeMs: calculatePercentile(times, 95),
      p99FrameTimeMs: calculatePercentile(times, 99),
      budgetOverruns: prev.budgetOverruns + (frameTime > budget ? 1 : 0),
      currentLOD,
    }));

    // Calculate jitter
    if (lastFrameTimeRef.current > 0) {
      const jitter = Math.abs(lastDelta - expectedDelta);
      setMetrics((prev) => ({
        ...prev,
        avgJitterMs: (prev.avgJitterMs * (frameCountRef.current - 1) + jitter) / frameCountRef.current,
      }));
    }

    // Report dropped frames
    if (droppedFrames > 0) {
      callbacks?.onFrameDropped?.(droppedFrames);
    }

    // Update FPS estimate
    if (times.length >= 10) {
      const estimatedFps = 1000 / avgTime;
      setCurrentFps(Math.round(estimatedFps));
    }

    lastFrameTimeRef.current = now;
  }, [fullConfig, isThrottled, currentLOD, callbacks]);

  /**
   * Request LOD change
   */
  const requestLOD = useCallback(
    (level: LODLevel): void => {
      const minIndex = getLODIndex(fullConfig.minLOD);
      const requestedIndex = getLODIndex(level);

      // Clamp to min LOD
      const finalLevel = requestedIndex > minIndex ? fullConfig.minLOD : level;

      if (finalLevel !== currentLOD) {
        callbacks?.onLODChanged?.(currentLOD, finalLevel);
        setCurrentLOD(finalLevel);
        setMetrics((prev) => ({ ...prev, lodChanges: prev.lodChanges + 1 }));
      }
    },
    [currentLOD, fullConfig.minLOD, callbacks]
  );

  /**
   * Add occlusion hint
   */
  const addOcclusionHint = useCallback(
    (elementId: string, isVisible: boolean, visiblePercent: number = 100): void => {
      if (!fullConfig.enableOcclusion) return;

      occlusionHintsRef.current.set(elementId, {
        elementId,
        isVisible,
        visiblePercent,
        lastChecked: Date.now(),
      });
    },
    [fullConfig.enableOcclusion]
  );

  /**
   * Remove occlusion hint
   */
  const removeOcclusionHint = useCallback((elementId: string): void => {
    occlusionHintsRef.current.delete(elementId);
  }, []);

  /**
   * Check if element should render
   */
  const shouldRender = useCallback(
    (elementId: string): boolean => {
      if (!fullConfig.enableOcclusion) return true;

      const hint = occlusionHintsRef.current.get(elementId);
      if (!hint) return true;

      // Check age of hint (stale after 500ms)
      if (Date.now() - hint.lastChecked > 500) return true;

      return hint.isVisible && hint.visiblePercent > 0;
    },
    [fullConfig.enableOcclusion]
  );

  /**
   * Flush render queue
   */
  const flushQueue = useCallback((): void => {
    const queue = renderQueueRef.current;
    if (queue.size === 0) return;

    // Sort by priority
    const sorted = Array.from(queue.values()).sort((a, b) => {
      return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    });

    // Execute in priority order
    for (const pass of sorted) {
      const remaining = fullConfig.budgetMs - frameBudget.usedMs;

      // Skip if over budget (unless critical)
      if (pass.priority !== "critical" && pass.estimatedMs > remaining) {
        pass.skipped = true;
        setMetrics((prev) => ({ ...prev, passSkips: prev.passSkips + 1 }));
        continue;
      }

      // Execute
      const start = performance.now();
      try {
        pass.callback();
      } catch {
        // Pass execution failed
      }
      pass.actualMs = performance.now() - start;
      pass.executed = performance.now();

      setMetrics((prev) => ({ ...prev, passExecutions: prev.passExecutions + 1 }));
    }

    // Clear queue
    queue.clear();
  }, [fullConfig.budgetMs, frameBudget.usedMs]);

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback((): void => {
    setMetrics({
      framesRendered: 0,
      framesDropped: 0,
      frameDropRate: 0,
      avgFrameTimeMs: 0,
      avgGPUTimeMs: 0,
      avgJitterMs: 0,
      p50FrameTimeMs: 0,
      p95FrameTimeMs: 0,
      p99FrameTimeMs: 0,
      passExecutions: 0,
      passSkips: 0,
      lodChanges: 0,
      budgetOverruns: 0,
      currentLOD,
    });
    frameTimesRef.current = [];
    frameCountRef.current = 0;
    overbudgetCountRef.current = 0;
    underbudgetCountRef.current = 0;
  }, [currentLOD]);

  /**
   * Start monitoring
   */
  const start = useCallback((): void => {
    if (isActive) return;

    setIsActive(true);
    lastFrameTimeRef.current = performance.now();

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [isActive]);

  /**
   * Stop monitoring
   */
  const stop = useCallback((): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  // Compile state
  const state: PipelineState = useMemo(
    () => ({
      isActive,
      currentFps,
      targetFps: fullConfig.targetFps,
      currentLOD,
      gpuInfo,
      frameBudget,
      queuedPasses: renderQueueRef.current.size,
      isThrottled,
    }),
    [isActive, currentFps, fullConfig.targetFps, currentLOD, gpuInfo, frameBudget, isThrottled]
  );

  // Compile controls
  const controls: PipelineControls = useMemo(
    () => ({
      hasRemainingBudget,
      scheduleRenderWork,
      cancelRenderWork,
      beginFrame,
      endFrame,
      requestLOD,
      addOcclusionHint,
      removeOcclusionHint,
      shouldRender,
      flushQueue,
      resetMetrics,
      start,
      stop,
    }),
    [
      hasRemainingBudget,
      scheduleRenderWork,
      cancelRenderWork,
      beginFrame,
      endFrame,
      requestLOD,
      addOcclusionHint,
      removeOcclusionHint,
      shouldRender,
      flushQueue,
      resetMetrics,
      start,
      stop,
    ]
  );

  return {
    state,
    metrics,
    controls,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple frame budget hook
 */
export function useFrameBudget(budgetMs: number = 16.67): {
  budget: FrameBudget;
  beginFrame: () => void;
  endFrame: () => void;
  hasRemaining: (ms: number) => boolean;
} {
  const { state, controls } = useRenderPipelineOptimizer({
    budgetMs,
    enableAutoLOD: false,
    enableOcclusion: false,
  });

  return {
    budget: state.frameBudget,
    beginFrame: controls.beginFrame,
    endFrame: controls.endFrame,
    hasRemaining: controls.hasRemainingBudget,
  };
}

/**
 * LOD management hook
 */
export function useLODManager(minLOD: LODLevel = "minimal"): {
  currentLOD: LODLevel;
  requestLOD: (level: LODLevel) => void;
  isThrottled: boolean;
} {
  const { state, controls } = useRenderPipelineOptimizer({
    enableAutoLOD: true,
    minLOD,
  });

  return {
    currentLOD: state.currentLOD,
    requestLOD: controls.requestLOD,
    isThrottled: state.isThrottled,
  };
}

/**
 * GPU info hook
 */
export function useGPUInfo(): GPUInfo | null {
  const { state } = useRenderPipelineOptimizer();
  return state.gpuInfo;
}

export default useRenderPipelineOptimizer;
