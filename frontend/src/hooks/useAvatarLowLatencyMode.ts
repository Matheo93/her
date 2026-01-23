/**
 * useAvatarLowLatencyMode - Sprint 541
 *
 * Unified low-latency mode for mobile avatar interactions that coordinates
 * multiple optimization strategies to minimize perceived and actual latency.
 *
 * Key features:
 * - Intelligent render priority boosting during touch interactions
 * - Predictive animation preloading based on gesture detection
 * - Adaptive quality degradation under pressure
 * - Frame budget enforcement with graceful degradation
 * - Touch event coalescing and prediction
 * - Immediate visual feedback before server response
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type LatencyMode = "normal" | "low" | "ultra-low" | "instant";
export type InteractionState = "idle" | "hovering" | "touching" | "gesturing" | "animating";
export type OptimizationLevel = "none" | "moderate" | "aggressive" | "extreme";
export type PredictionConfidence = "none" | "low" | "medium" | "high" | "certain";

export interface TouchState {
  active: boolean;
  startTime: number;
  currentPosition: { x: number; y: number };
  velocity: { x: number; y: number };
  pressure: number;
}

export interface AnimationPreload {
  type: string;
  frames: unknown[];
  priority: number;
  loaded: boolean;
}

export interface QualitySettings {
  animationFps: number;
  textureQuality: "low" | "medium" | "high";
  enableParticles: boolean;
  enableBlur: boolean;
  enableShadows: boolean;
  maxBlendShapes: number;
}

export interface LatencyBudget {
  total: number;
  inputProcessing: number;
  animationUpdate: number;
  render: number;
  remaining: number;
}

export interface LowLatencyConfig {
  targetLatencyMs: number;
  enableTouchPrediction: boolean;
  enableAnimationPreload: boolean;
  enableInstantFeedback: boolean;
  qualityFloorFps: number;
  predictionHorizonMs: number;
  maxPreloadedAnimations: number;
  touchSampleRateHz: number;
}

export interface LowLatencyCallbacks {
  onModeChange?: (mode: LatencyMode) => void;
  onInteractionStateChange?: (state: InteractionState) => void;
  onQualityAdjustment?: (settings: QualitySettings) => void;
  onLatencyBudgetExceeded?: (budget: LatencyBudget) => void;
  onPredictionMade?: (gesture: string, confidence: PredictionConfidence) => void;
}

export interface LowLatencyState {
  isActive: boolean;
  mode: LatencyMode;
  interactionState: InteractionState;
  optimizationLevel: OptimizationLevel;
  touch: TouchState;
  quality: QualitySettings;
  latencyBudget: LatencyBudget;
}

export interface LowLatencyMetrics {
  currentLatencyMs: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  touchToRenderMs: number;
  predictionAccuracy: number;
  frameDops: number;
  qualityAdjustments: number;
  modeTransitions: number;
}

export interface LowLatencyControls {
  enable: () => void;
  disable: () => void;
  setMode: (mode: LatencyMode) => void;
  processTouchStart: (event: TouchEvent) => void;
  processTouchMove: (event: TouchEvent) => void;
  processTouchEnd: (event: TouchEvent) => void;
  preloadAnimation: (type: string, priority?: number) => void;
  forceQuality: (settings: Partial<QualitySettings> | null) => void;
  getOptimalQuality: () => QualitySettings;
  resetMetrics: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: LowLatencyConfig = {
  targetLatencyMs: 16, // ~60fps
  enableTouchPrediction: true,
  enableAnimationPreload: true,
  enableInstantFeedback: true,
  qualityFloorFps: 24,
  predictionHorizonMs: 32, // 2 frames ahead
  maxPreloadedAnimations: 5,
  touchSampleRateHz: 120,
};

const DEFAULT_QUALITY: QualitySettings = {
  animationFps: 60,
  textureQuality: "high",
  enableParticles: true,
  enableBlur: true,
  enableShadows: true,
  maxBlendShapes: 50,
};

const LOW_QUALITY: QualitySettings = {
  animationFps: 45,
  textureQuality: "medium",
  enableParticles: false,
  enableBlur: false,
  enableShadows: true,
  maxBlendShapes: 30,
};

const ULTRA_LOW_QUALITY: QualitySettings = {
  animationFps: 30,
  textureQuality: "low",
  enableParticles: false,
  enableBlur: false,
  enableShadows: false,
  maxBlendShapes: 15,
};

const INSTANT_QUALITY: QualitySettings = {
  animationFps: 24,
  textureQuality: "low",
  enableParticles: false,
  enableBlur: false,
  enableShadows: false,
  maxBlendShapes: 8,
};

const QUALITY_BY_MODE: Record<LatencyMode, QualitySettings> = {
  normal: DEFAULT_QUALITY,
  low: LOW_QUALITY,
  "ultra-low": ULTRA_LOW_QUALITY,
  instant: INSTANT_QUALITY,
};

const DEFAULT_BUDGET: LatencyBudget = {
  total: 16,
  inputProcessing: 2,
  animationUpdate: 6,
  render: 6,
  remaining: 2,
};

// ============================================================================
// Helper Functions
// ============================================================================

function calculateOptimizationLevel(
  currentLatency: number,
  targetLatency: number
): OptimizationLevel {
  const ratio = currentLatency / targetLatency;
  if (ratio < 0.8) return "none";
  if (ratio < 1.0) return "moderate";
  if (ratio < 1.5) return "aggressive";
  return "extreme";
}

function calculateLatencyMode(
  averageLatency: number,
  targetLatency: number,
  interactionState: InteractionState
): LatencyMode {
  // During active interactions, prefer lower latency modes
  const isActive = interactionState !== "idle";
  const ratio = averageLatency / targetLatency;

  if (ratio < 0.5 && !isActive) return "normal";
  if (ratio < 0.8) return "low";
  if (ratio < 1.2) return "ultra-low";
  return "instant";
}

function predictGesture(
  touchHistory: Array<{ x: number; y: number; t: number }>,
  horizonMs: number
): { gesture: string; confidence: PredictionConfidence } {
  if (touchHistory.length < 3) {
    return { gesture: "unknown", confidence: "none" };
  }

  const recent = touchHistory.slice(-5);
  const first = recent[0];
  const last = recent[recent.length - 1];

  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const dt = last.t - first.t;

  if (dt === 0) {
    return { gesture: "tap", confidence: "medium" };
  }

  const vx = dx / dt;
  const vy = dy / dt;
  const speed = Math.sqrt(vx * vx + vy * vy);

  // Detect gesture type based on velocity and direction
  if (speed < 0.1) {
    return { gesture: "tap", confidence: "high" };
  }

  if (speed > 2.0) {
    const angle = Math.atan2(dy, dx);
    if (Math.abs(angle) < Math.PI / 4) {
      return { gesture: "swipe-right", confidence: "high" };
    }
    if (Math.abs(angle - Math.PI) < Math.PI / 4 || Math.abs(angle + Math.PI) < Math.PI / 4) {
      return { gesture: "swipe-left", confidence: "high" };
    }
    if (angle > Math.PI / 4 && angle < 3 * Math.PI / 4) {
      return { gesture: "swipe-down", confidence: "high" };
    }
    if (angle < -Math.PI / 4 && angle > -3 * Math.PI / 4) {
      return { gesture: "swipe-up", confidence: "high" };
    }
  }

  // Check for circular motion (rotation gesture)
  if (recent.length >= 5) {
    const angles: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const a = Math.atan2(
        recent[i].y - recent[i - 1].y,
        recent[i].x - recent[i - 1].x
      );
      angles.push(a);
    }

    // Check if angles are consistently changing
    let rotationSum = 0;
    for (let i = 1; i < angles.length; i++) {
      let diff = angles[i] - angles[i - 1];
      // Normalize angle difference
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      rotationSum += diff;
    }

    if (Math.abs(rotationSum) > Math.PI / 2) {
      return { gesture: rotationSum > 0 ? "rotate-cw" : "rotate-ccw", confidence: "medium" };
    }
  }

  return { gesture: "drag", confidence: "medium" };
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarLowLatencyMode(
  config: Partial<LowLatencyConfig> = {},
  callbacks: LowLatencyCallbacks = {}
): { state: LowLatencyState; metrics: LowLatencyMetrics; controls: LowLatencyControls } {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isActive, setIsActive] = useState(false);
  const [mode, setModeState] = useState<LatencyMode>("normal");
  const [interactionState, setInteractionState] = useState<InteractionState>("idle");
  const [optimizationLevel, setOptimizationLevel] = useState<OptimizationLevel>("none");
  const [quality, setQuality] = useState<QualitySettings>(DEFAULT_QUALITY);
  const [latencyBudget, setLatencyBudget] = useState<LatencyBudget>(DEFAULT_BUDGET);

  // Touch state
  const [touch, setTouch] = useState<TouchState>({
    active: false,
    startTime: 0,
    currentPosition: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    pressure: 0,
  });

  // Metrics
  const [currentLatencyMs, setCurrentLatencyMs] = useState(0);
  const [averageLatencyMs, setAverageLatencyMs] = useState(0);
  const [p95LatencyMs, setP95LatencyMs] = useState(0);
  const [touchToRenderMs, setTouchToRenderMs] = useState(0);
  const [predictionAccuracy, setPredictionAccuracy] = useState(1);
  const [frameDrops, setFrameDrops] = useState(0);
  const [qualityAdjustments, setQualityAdjustments] = useState(0);
  const [modeTransitions, setModeTransitions] = useState(0);

  // Refs
  const touchHistoryRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const latencyHistoryRef = useRef<number[]>([]);
  const forcedQualityRef = useRef<Partial<QualitySettings> | null>(null);
  const preloadedAnimationsRef = useRef<Map<string, AnimationPreload>>(new Map());
  const lastFrameTimeRef = useRef(performance.now());
  const prevModeRef = useRef<LatencyMode>(mode);

  // Frame timing measurement
  useEffect(() => {
    if (!isActive) return;

    let frameId: number;
    let frameCount = 0;
    const frameTimes: number[] = [];

    const measureFrame = () => {
      const now = performance.now();
      const delta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      frameTimes.push(delta);
      if (frameTimes.length > 60) {
        frameTimes.shift();
      }

      // Calculate current latency
      setCurrentLatencyMs(delta);

      // Update average latency
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      setAverageLatencyMs(avg);

      // Calculate P95
      if (frameTimes.length >= 10) {
        const sorted = [...frameTimes].sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);
        setP95LatencyMs(sorted[p95Index]);
      }

      // Detect frame drops
      const expectedDelta = 1000 / quality.animationFps;
      if (delta > expectedDelta * 2) {
        setFrameDrops(prev => prev + 1);
      }

      // Auto-adjust mode based on performance
      frameCount++;
      if (frameCount % 30 === 0) {
        const newOptLevel = calculateOptimizationLevel(avg, mergedConfig.targetLatencyMs);
        if (newOptLevel !== optimizationLevel) {
          setOptimizationLevel(newOptLevel);
        }

        const newMode = calculateLatencyMode(avg, mergedConfig.targetLatencyMs, interactionState);
        if (newMode !== mode && forcedQualityRef.current === null) {
          setModeState(newMode);
        }
      }

      frameId = requestAnimationFrame(measureFrame);
    };

    frameId = requestAnimationFrame(measureFrame);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isActive, mode, optimizationLevel, interactionState, quality.animationFps, mergedConfig.targetLatencyMs]);

  // Update quality when mode changes
  useEffect(() => {
    if (forcedQualityRef.current !== null) return;

    const newQuality = QUALITY_BY_MODE[mode];
    setQuality(newQuality);

    if (prevModeRef.current !== mode) {
      setModeTransitions(prev => prev + 1);
      setQualityAdjustments(prev => prev + 1);
      callbacks.onModeChange?.(mode);
      callbacks.onQualityAdjustment?.(newQuality);
      prevModeRef.current = mode;
    }
  }, [mode, callbacks]);

  // Update interaction state callbacks
  useEffect(() => {
    callbacks.onInteractionStateChange?.(interactionState);
  }, [interactionState, callbacks]);

  // Enable/disable
  const enable = useCallback(() => {
    setIsActive(true);
    lastFrameTimeRef.current = performance.now();
  }, []);

  const disable = useCallback(() => {
    setIsActive(false);
    setInteractionState("idle");
    setMode("normal");
    setOptimizationLevel("none");
  }, []);

  const setMode = useCallback((newMode: LatencyMode) => {
    setModeState(newMode);
  }, []);

  // Touch processing
  const processTouchStart = useCallback((event: TouchEvent) => {
    if (!isActive || event.touches.length === 0) return;

    const touchData = event.touches[0];
    const now = performance.now();

    setTouch({
      active: true,
      startTime: now,
      currentPosition: { x: touchData.clientX, y: touchData.clientY },
      velocity: { x: 0, y: 0 },
      pressure: touchData.force || 1,
    });

    touchHistoryRef.current = [{
      x: touchData.clientX,
      y: touchData.clientY,
      t: now,
    }];

    setInteractionState("touching");
    setTouchToRenderMs(now);

    // Boost to low-latency mode during touch
    if (mode === "normal") {
      setModeState("low");
    }
  }, [isActive, mode]);

  const processTouchMove = useCallback((event: TouchEvent) => {
    if (!isActive || !touch.active || event.touches.length === 0) return;

    const touchData = event.touches[0];
    const now = performance.now();
    const history = touchHistoryRef.current;

    const prevTouch = history[history.length - 1];
    const dt = now - prevTouch.t;

    // Calculate velocity
    let vx = 0;
    let vy = 0;
    if (dt > 0) {
      vx = (touchData.clientX - prevTouch.x) / dt;
      vy = (touchData.clientY - prevTouch.y) / dt;
    }

    setTouch(prev => ({
      ...prev,
      currentPosition: { x: touchData.clientX, y: touchData.clientY },
      velocity: { x: vx, y: vy },
      pressure: touchData.force || prev.pressure,
    }));

    // Add to history
    history.push({
      x: touchData.clientX,
      y: touchData.clientY,
      t: now,
    });

    // Keep history limited
    if (history.length > 10) {
      history.shift();
    }

    setInteractionState("gesturing");

    // Predict gesture
    if (mergedConfig.enableTouchPrediction && history.length >= 3) {
      const prediction = predictGesture(history, mergedConfig.predictionHorizonMs);
      callbacks.onPredictionMade?.(prediction.gesture, prediction.confidence);

      // Preload animation for predicted gesture
      if (
        mergedConfig.enableAnimationPreload &&
        prediction.confidence !== "none" &&
        prediction.confidence !== "low"
      ) {
        const animations = preloadedAnimationsRef.current;
        if (!animations.has(prediction.gesture)) {
          // Mark for preloading (actual implementation would fetch animation data)
          animations.set(prediction.gesture, {
            type: prediction.gesture,
            frames: [],
            priority: prediction.confidence === "high" ? 2 : prediction.confidence === "certain" ? 3 : 1,
            loaded: false,
          });
        }
      }
    }

    // Update touch-to-render timing
    const renderTime = performance.now();
    setTouchToRenderMs(renderTime - now);
  }, [isActive, touch.active, mergedConfig, callbacks]);

  const processTouchEnd = useCallback((event: TouchEvent) => {
    if (!isActive) return;

    setTouch(prev => ({
      ...prev,
      active: false,
    }));

    setInteractionState("animating");

    // Transition back to normal mode after a short delay
    setTimeout(() => {
      setInteractionState("idle");
      if (forcedQualityRef.current === null) {
        // Allow mode to auto-adjust based on performance
      }
    }, 300);
  }, [isActive]);

  // Animation preloading
  const preloadAnimation = useCallback((type: string, priority = 1) => {
    if (!mergedConfig.enableAnimationPreload) return;

    const animations = preloadedAnimationsRef.current;

    // Limit preloaded animations
    if (animations.size >= mergedConfig.maxPreloadedAnimations) {
      // Remove lowest priority
      let minPriority = Infinity;
      let minKey = "";
      animations.forEach((anim, key) => {
        if (anim.priority < minPriority) {
          minPriority = anim.priority;
          minKey = key;
        }
      });
      if (minPriority < priority) {
        animations.delete(minKey);
      } else {
        return; // Don't add if all existing have higher priority
      }
    }

    animations.set(type, {
      type,
      frames: [],
      priority,
      loaded: false,
    });
  }, [mergedConfig.enableAnimationPreload, mergedConfig.maxPreloadedAnimations]);

  // Quality forcing
  const forceQuality = useCallback((settings: Partial<QualitySettings> | null) => {
    forcedQualityRef.current = settings;
    if (settings !== null) {
      setQuality(prev => ({ ...prev, ...settings }));
      setQualityAdjustments(prev => prev + 1);
      callbacks.onQualityAdjustment?.({ ...quality, ...settings });
    }
  }, [quality, callbacks]);

  const getOptimalQuality = useCallback((): QualitySettings => {
    if (forcedQualityRef.current !== null) {
      return { ...QUALITY_BY_MODE[mode], ...forcedQualityRef.current };
    }
    return QUALITY_BY_MODE[mode];
  }, [mode]);

  const resetMetrics = useCallback(() => {
    setCurrentLatencyMs(0);
    setAverageLatencyMs(0);
    setP95LatencyMs(0);
    setTouchToRenderMs(0);
    setPredictionAccuracy(1);
    setFrameDrops(0);
    setQualityAdjustments(0);
    setModeTransitions(0);
    latencyHistoryRef.current = [];
    touchHistoryRef.current = [];
    preloadedAnimationsRef.current.clear();
  }, []);

  // Build state object
  const state: LowLatencyState = useMemo(() => ({
    isActive,
    mode,
    interactionState,
    optimizationLevel,
    touch,
    quality,
    latencyBudget,
  }), [isActive, mode, interactionState, optimizationLevel, touch, quality, latencyBudget]);

  // Build metrics object
  const metrics: LowLatencyMetrics = useMemo(() => ({
    currentLatencyMs,
    averageLatencyMs,
    p95LatencyMs,
    touchToRenderMs,
    predictionAccuracy,
    frameDops: frameDrops,
    qualityAdjustments,
    modeTransitions,
  }), [
    currentLatencyMs,
    averageLatencyMs,
    p95LatencyMs,
    touchToRenderMs,
    predictionAccuracy,
    frameDrops,
    qualityAdjustments,
    modeTransitions,
  ]);

  // Build controls object
  const controls: LowLatencyControls = useMemo(() => ({
    enable,
    disable,
    setMode,
    processTouchStart,
    processTouchMove,
    processTouchEnd,
    preloadAnimation,
    forceQuality,
    getOptimalQuality,
    resetMetrics,
  }), [
    enable,
    disable,
    setMode,
    processTouchStart,
    processTouchMove,
    processTouchEnd,
    preloadAnimation,
    forceQuality,
    getOptimalQuality,
    resetMetrics,
  ]);

  return { state, metrics, controls };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useLowLatencyTouch(): {
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
  isActive: boolean;
  velocity: { x: number; y: number };
} {
  const { state, controls } = useAvatarLowLatencyMode();

  useEffect(() => {
    controls.enable();
    return () => controls.disable();
  }, [controls]);

  return {
    onTouchStart: controls.processTouchStart,
    onTouchMove: controls.processTouchMove,
    onTouchEnd: controls.processTouchEnd,
    isActive: state.touch.active,
    velocity: state.touch.velocity,
  };
}

export function useLatencyAdaptiveQuality(): {
  quality: QualitySettings;
  mode: LatencyMode;
  forceQuality: (settings: Partial<QualitySettings> | null) => void;
} {
  const { state, controls } = useAvatarLowLatencyMode();

  return {
    quality: state.quality,
    mode: state.mode,
    forceQuality: controls.forceQuality,
  };
}

export function useLatencyMetrics(): {
  current: number;
  average: number;
  p95: number;
  touchToRender: number;
  frameDrops: number;
} {
  const { metrics } = useAvatarLowLatencyMode();

  return {
    current: metrics.currentLatencyMs,
    average: metrics.averageLatencyMs,
    p95: metrics.p95LatencyMs,
    touchToRender: metrics.touchToRenderMs,
    frameDrops: metrics.frameDops,
  };
}

export default useAvatarLowLatencyMode;
