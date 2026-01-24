/**
 * useMobileRenderPredictor - Sprint 226
 *
 * Predicts and pre-renders frames based on user interaction patterns
 * to minimize visible latency on mobile devices. Uses machine learning-inspired
 * pattern recognition to anticipate user actions.
 *
 * Features:
 * - Interaction pattern recognition
 * - Predictive frame pre-rendering
 * - Adaptive prediction confidence
 * - Frame cache with LRU eviction
 * - GPU-accelerated compositing hints
 * - Battery-aware prediction depth
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Types of user interactions that can be predicted
 */
export type InteractionType =
  | "tap"
  | "swipe_left"
  | "swipe_right"
  | "swipe_up"
  | "swipe_down"
  | "pinch_in"
  | "pinch_out"
  | "rotate"
  | "long_press"
  | "double_tap"
  | "scroll"
  | "idle";

/**
 * Recorded interaction event
 */
export interface InteractionEvent {
  type: InteractionType;
  timestamp: number;
  position: { x: number; y: number };
  velocity?: { x: number; y: number };
  pressure?: number;
  duration?: number;
}

/**
 * Pattern extracted from interaction history
 */
export interface InteractionPattern {
  /** Sequence of interaction types */
  sequence: InteractionType[];
  /** Probability of this pattern occurring */
  probability: number;
  /** Time windows between interactions (ms) */
  timingPattern: number[];
  /** Average velocity for movement patterns */
  averageVelocity?: { x: number; y: number };
}

/**
 * Predicted next interaction
 */
export interface PredictedInteraction {
  type: InteractionType;
  confidence: number;
  estimatedTime: number;
  expectedPosition?: { x: number; y: number };
  expectedVelocity?: { x: number; y: number };
}

/**
 * Frame to be pre-rendered
 */
export interface PreRenderFrame {
  id: string;
  interaction: InteractionType;
  state: Record<string, unknown>;
  priority: number;
  createdAt: number;
  expiresAt: number;
}

/**
 * Render cache entry
 */
export interface CacheEntry {
  frame: PreRenderFrame;
  rendered: boolean;
  useCount: number;
  lastUsed: number;
}

/**
 * Predictor configuration
 */
export interface PredictorConfig {
  /** Maximum history length (default: 50) */
  maxHistoryLength: number;
  /** Minimum confidence to trigger pre-render (default: 0.6) */
  minConfidenceThreshold: number;
  /** Maximum frames to cache (default: 10) */
  maxCacheSize: number;
  /** Frame TTL in ms (default: 2000) */
  frameTtlMs: number;
  /** Pattern detection window size (default: 5) */
  patternWindowSize: number;
  /** Enable GPU compositing hints (default: true) */
  enableGpuHints: boolean;
  /** Reduce prediction depth on low battery (default: true) */
  batteryAwarePrediction: boolean;
  /** Low battery threshold (default: 0.2) */
  lowBatteryThreshold: number;
  /** Prediction lookahead in ms (default: 100) */
  predictionLookaheadMs: number;
  /** Enable interaction timing analysis (default: true) */
  enableTimingAnalysis: boolean;
}

/**
 * Predictor metrics
 */
export interface PredictorMetrics {
  /** Total predictions made */
  totalPredictions: number;
  /** Successful predictions (used within TTL) */
  successfulPredictions: number;
  /** Prediction accuracy (0-1) */
  accuracy: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Average prediction lead time (ms) */
  averageLeadTime: number;
  /** Frames currently cached */
  cachedFrames: number;
  /** Total frame renders saved */
  framesSaved: number;
}

/**
 * Predictor state
 */
export interface PredictorState {
  isEnabled: boolean;
  currentPrediction: PredictedInteraction | null;
  detectedPatterns: InteractionPattern[];
  metrics: PredictorMetrics;
  batteryLevel: number | null;
  isLowPowerMode: boolean;
}

/**
 * Frame renderer function
 */
export type FrameRenderer = (
  interaction: InteractionType,
  state: Record<string, unknown>
) => PreRenderFrame;

/**
 * Predictor controls
 */
export interface PredictorControls {
  /** Record a new interaction */
  recordInteraction: (event: InteractionEvent) => void;
  /** Get cached frame for interaction */
  getCachedFrame: (interaction: InteractionType) => PreRenderFrame | null;
  /** Force prediction update */
  updatePrediction: () => void;
  /** Clear prediction cache */
  clearCache: () => void;
  /** Enable/disable predictor */
  setEnabled: (enabled: boolean) => void;
  /** Invalidate specific cached frames */
  invalidateFrames: (interactions: InteractionType[]) => void;
  /** Mark frame as used */
  markFrameUsed: (frameId: string) => void;
}

/**
 * Hook return type
 */
export interface UseMobileRenderPredictorResult {
  state: PredictorState;
  controls: PredictorControls;
  /** Pre-render queue for processing */
  preRenderQueue: PreRenderFrame[];
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONFIG: PredictorConfig = {
  maxHistoryLength: 50,
  minConfidenceThreshold: 0.6,
  maxCacheSize: 10,
  frameTtlMs: 2000,
  patternWindowSize: 5,
  enableGpuHints: true,
  batteryAwarePrediction: true,
  lowBatteryThreshold: 0.2,
  predictionLookaheadMs: 100,
  enableTimingAnalysis: true,
};

const DEFAULT_METRICS: PredictorMetrics = {
  totalPredictions: 0,
  successfulPredictions: 0,
  accuracy: 0,
  cacheHitRate: 0,
  averageLeadTime: 0,
  cachedFrames: 0,
  framesSaved: 0,
};

// ============================================================================
// Utility Functions
// ============================================================================

// Pre-computed interaction types for prediction fallback (module-level for performance)
const FALLBACK_INTERACTION_TYPES: readonly InteractionType[] = [
  "tap",
  "swipe_left",
  "swipe_right",
  "swipe_up",
  "swipe_down",
  "pinch_in",
  "pinch_out",
  "scroll",
  "idle",
] as const;

// Frame ID counter for uniqueness without Date.now() overhead
let frameIdCounter = 0;

/**
 * Generate unique frame ID (optimized: uses counter instead of Date.now())
 */
function generateFrameId(): string {
  return `frame_${++frameIdCounter}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Calculate interaction transition probability
 */
function calculateTransitionProbability(
  history: InteractionEvent[],
  from: InteractionType,
  to: InteractionType
): number {
  let transitions = 0;
  let fromCount = 0;

  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].type === from) {
      fromCount++;
      if (history[i + 1].type === to) {
        transitions++;
      }
    }
  }

  return fromCount > 0 ? transitions / fromCount : 0;
}

/**
 * Detect patterns in interaction history
 */
function detectPatterns(
  history: InteractionEvent[],
  windowSize: number
): InteractionPattern[] {
  if (history.length < windowSize) {
    return [];
  }

  const patterns: Map<string, InteractionPattern> = new Map();

  // Sliding window pattern detection
  for (let i = 0; i <= history.length - windowSize; i++) {
    const window = history.slice(i, i + windowSize);
    const sequence = window.map((e) => e.type);
    const key = sequence.join("-");

    if (patterns.has(key)) {
      const existing = patterns.get(key)!;
      existing.probability += 1;
    } else {
      // Calculate timing pattern
      const timingPattern: number[] = [];
      for (let j = 1; j < window.length; j++) {
        timingPattern.push(window[j].timestamp - window[j - 1].timestamp);
      }

      // Calculate average velocity for movement patterns
      const velocities = window
        .filter((e) => e.velocity)
        .map((e) => e.velocity!);
      const avgVelocity =
        velocities.length > 0
          ? {
              x: velocities.reduce((sum, v) => sum + v.x, 0) / velocities.length,
              y: velocities.reduce((sum, v) => sum + v.y, 0) / velocities.length,
            }
          : undefined;

      patterns.set(key, {
        sequence,
        probability: 1,
        timingPattern,
        averageVelocity: avgVelocity,
      });
    }
  }

  // Normalize probabilities
  const total = Array.from(patterns.values()).reduce(
    (sum, p) => sum + p.probability,
    0
  );

  return Array.from(patterns.values())
    .map((p) => ({
      ...p,
      probability: p.probability / total,
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5); // Top 5 patterns
}

/**
 * Predict next interaction based on history and patterns
 */
function predictNextInteraction(
  history: InteractionEvent[],
  patterns: InteractionPattern[],
  config: PredictorConfig
): PredictedInteraction | null {
  if (history.length < 2) {
    return null;
  }

  const lastInteraction = history[history.length - 1];
  const recentSequence = history
    .slice(-config.patternWindowSize + 1)
    .map((e) => e.type);

  // Find matching patterns
  const matchingPatterns = patterns.filter((p) => {
    const patternStart = p.sequence.slice(0, recentSequence.length);
    return patternStart.every((type, i) => type === recentSequence[i]);
  });

  if (matchingPatterns.length === 0) {
    // Fall back to transition probability (use pre-computed array)
    let bestPrediction: PredictedInteraction | null = null;
    let bestConfidence = 0;

    for (const type of FALLBACK_INTERACTION_TYPES) {
      const confidence = calculateTransitionProbability(
        history,
        lastInteraction.type,
        type
      );
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestPrediction = {
          type,
          confidence,
          estimatedTime: Date.now() + config.predictionLookaheadMs,
        };
      }
    }

    return bestPrediction;
  }

  // Use matching pattern
  const bestPattern = matchingPatterns[0];
  const nextIndex = recentSequence.length;

  if (nextIndex >= bestPattern.sequence.length) {
    return null;
  }

  const predictedType = bestPattern.sequence[nextIndex];
  const estimatedDelay =
    bestPattern.timingPattern.length > nextIndex - 1
      ? bestPattern.timingPattern[nextIndex - 1]
      : config.predictionLookaheadMs;

  // Calculate expected position based on velocity
  let expectedPosition: { x: number; y: number } | undefined;
  let expectedVelocity: { x: number; y: number } | undefined;

  if (bestPattern.averageVelocity && lastInteraction.position) {
    expectedVelocity = bestPattern.averageVelocity;
    expectedPosition = {
      x:
        lastInteraction.position.x +
        bestPattern.averageVelocity.x * (estimatedDelay / 1000),
      y:
        lastInteraction.position.y +
        bestPattern.averageVelocity.y * (estimatedDelay / 1000),
    };
  }

  return {
    type: predictedType,
    confidence: bestPattern.probability,
    estimatedTime: lastInteraction.timestamp + estimatedDelay,
    expectedPosition,
    expectedVelocity,
  };
}

/**
 * LRU cache eviction
 */
function evictLRU(cache: Map<string, CacheEntry>, maxSize: number): void {
  if (cache.size <= maxSize) {
    return;
  }

  // Sort by lastUsed ascending (oldest first)
  const sorted = Array.from(cache.entries()).sort(
    (a, b) => a[1].lastUsed - b[1].lastUsed
  );

  // Remove oldest entries
  const toRemove = sorted.slice(0, cache.size - maxSize);
  for (const [key] of toRemove) {
    cache.delete(key);
  }
}

/**
 * Clean expired frames from cache
 * @param cache - The cache map to clean
 * @param currentTime - Optional current timestamp (avoids Date.now() call)
 */
function cleanExpiredFrames(cache: Map<string, CacheEntry>, currentTime?: number): void {
  const now = currentTime ?? Date.now();

  for (const [key, entry] of cache.entries()) {
    if (entry.frame.expiresAt < now) {
      cache.delete(key);
    }
  }
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that predicts and pre-renders frames based on interaction patterns
 */
export function useMobileRenderPredictor(
  renderer: FrameRenderer,
  currentState: Record<string, unknown>,
  config: Partial<PredictorConfig> = {}
): UseMobileRenderPredictorResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isEnabled, setIsEnabled] = useState(true);
  const [currentPrediction, setCurrentPrediction] =
    useState<PredictedInteraction | null>(null);
  const [detectedPatterns, setDetectedPatterns] = useState<InteractionPattern[]>(
    []
  );
  const [metrics, setMetrics] = useState<PredictorMetrics>(DEFAULT_METRICS);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isLowPowerMode, setIsLowPowerMode] = useState(false);
  const [preRenderQueue, setPreRenderQueue] = useState<PreRenderFrame[]>([]);

  // Refs
  const historyRef = useRef<InteractionEvent[]>([]);
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const metricsRef = useRef({
    cacheHits: 0,
    cacheMisses: 0,
    leadTimes: [] as number[],
  });
  const lastPredictionRef = useRef<{
    prediction: PredictedInteraction;
    actualTime: number | null;
  } | null>(null);

  /**
   * Monitor battery level
   */
  useEffect(() => {
    if (!mergedConfig.batteryAwarePrediction) {
      return;
    }

    const updateBattery = (battery: {
      level: number;
      charging: boolean;
    }) => {
      setBatteryLevel(battery.level);
      setIsLowPowerMode(
        battery.level < mergedConfig.lowBatteryThreshold && !battery.charging
      );
    };

    // Check if Battery API is available
    if ("getBattery" in navigator) {
      (navigator as Navigator & { getBattery: () => Promise<{ level: number; charging: boolean; addEventListener: (event: string, handler: () => void) => void }> })
        .getBattery()
        .then((battery) => {
          updateBattery(battery);
          battery.addEventListener("levelchange", () => updateBattery(battery));
          battery.addEventListener("chargingchange", () =>
            updateBattery(battery)
          );
        })
        .catch(() => {
          // Battery API not available
        });
    }
  }, [mergedConfig.batteryAwarePrediction, mergedConfig.lowBatteryThreshold]);

  /**
   * Record new interaction and update predictions
   */
  const recordInteraction = useCallback(
    (event: InteractionEvent) => {
      if (!isEnabled) {
        return;
      }

      const history = historyRef.current;

      // Check if last prediction was accurate
      if (lastPredictionRef.current) {
        const { prediction, actualTime } = lastPredictionRef.current;
        if (
          prediction.type === event.type &&
          actualTime === null
        ) {
          // Successful prediction
          const leadTime = event.timestamp - prediction.estimatedTime;
          metricsRef.current.leadTimes.push(Math.abs(leadTime));

          setMetrics((prev) => ({
            ...prev,
            successfulPredictions: prev.successfulPredictions + 1,
            accuracy:
              (prev.successfulPredictions + 1) / (prev.totalPredictions || 1),
            averageLeadTime:
              metricsRef.current.leadTimes.reduce((a, b) => a + b, 0) /
              metricsRef.current.leadTimes.length,
            framesSaved: prev.framesSaved + 1,
          }));

          lastPredictionRef.current.actualTime = event.timestamp;
        }
      }

      // Add to history
      history.push(event);
      if (history.length > mergedConfig.maxHistoryLength) {
        history.shift();
      }

      // Detect patterns
      const patterns = detectPatterns(history, mergedConfig.patternWindowSize);
      setDetectedPatterns(patterns);

      // Make prediction
      const effectiveConfig = isLowPowerMode
        ? { ...mergedConfig, maxCacheSize: 3, predictionLookaheadMs: 50 }
        : mergedConfig;

      const prediction = predictNextInteraction(
        history,
        patterns,
        effectiveConfig
      );

      if (
        prediction &&
        prediction.confidence >= effectiveConfig.minConfidenceThreshold
      ) {
        setCurrentPrediction(prediction);
        lastPredictionRef.current = { prediction, actualTime: null };

        setMetrics((prev) => ({
          ...prev,
          totalPredictions: prev.totalPredictions + 1,
        }));

        // Pre-render frame for prediction (single timestamp for consistency)
        const now = Date.now();
        const frame = renderer(prediction.type, currentState);
        frame.expiresAt = now + effectiveConfig.frameTtlMs;
        frame.priority =
          prediction.confidence * (isLowPowerMode ? 0.5 : 1);

        // Add to cache (pass timestamp to avoid extra Date.now() calls)
        const cache = cacheRef.current;
        cleanExpiredFrames(cache, now);

        const cacheEntry: CacheEntry = {
          frame,
          rendered: false,
          useCount: 0,
          lastUsed: now,
        };

        cache.set(prediction.type, cacheEntry);
        evictLRU(cache, effectiveConfig.maxCacheSize);

        setMetrics((prev) => ({
          ...prev,
          cachedFrames: cache.size,
        }));

        // Add to pre-render queue
        setPreRenderQueue((prev) => {
          const filtered = prev.filter(
            (f) => f.interaction !== prediction.type
          );
          return [...filtered, frame].sort((a, b) => b.priority - a.priority);
        });
      } else {
        setCurrentPrediction(null);
      }
    },
    [isEnabled, isLowPowerMode, mergedConfig, renderer, currentState]
  );

  /**
   * Get cached frame for interaction
   */
  const getCachedFrame = useCallback(
    (interaction: InteractionType): PreRenderFrame | null => {
      const cache = cacheRef.current;
      const entry = cache.get(interaction);
      const now = Date.now(); // Single timestamp for consistency

      if (entry && entry.frame.expiresAt > now) {
        metricsRef.current.cacheHits++;
        entry.useCount++;
        entry.lastUsed = now;

        setMetrics((prev) => ({
          ...prev,
          cacheHitRate:
            metricsRef.current.cacheHits /
            (metricsRef.current.cacheHits + metricsRef.current.cacheMisses),
        }));

        return entry.frame;
      }

      metricsRef.current.cacheMisses++;
      setMetrics((prev) => ({
        ...prev,
        cacheHitRate:
          metricsRef.current.cacheHits /
          (metricsRef.current.cacheHits + metricsRef.current.cacheMisses || 1),
      }));

      return null;
    },
    []
  );

  /**
   * Force prediction update
   */
  const updatePrediction = useCallback(() => {
    const history = historyRef.current;
    const patterns = detectedPatterns;

    const prediction = predictNextInteraction(history, patterns, mergedConfig);

    if (
      prediction &&
      prediction.confidence >= mergedConfig.minConfidenceThreshold
    ) {
      setCurrentPrediction(prediction);
    } else {
      setCurrentPrediction(null);
    }
  }, [detectedPatterns, mergedConfig]);

  /**
   * Clear prediction cache
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
    setPreRenderQueue([]);
    setMetrics((prev) => ({
      ...prev,
      cachedFrames: 0,
    }));
  }, []);

  /**
   * Invalidate specific cached frames
   */
  const invalidateFrames = useCallback((interactions: InteractionType[]) => {
    const cache = cacheRef.current;

    for (const interaction of interactions) {
      cache.delete(interaction);
    }

    setPreRenderQueue((prev) =>
      prev.filter((f) => !interactions.includes(f.interaction))
    );

    setMetrics((prev) => ({
      ...prev,
      cachedFrames: cache.size,
    }));
  }, []);

  /**
   * Mark frame as used
   */
  const markFrameUsed = useCallback((frameId: string) => {
    const cache = cacheRef.current;
    const now = Date.now(); // Single timestamp

    for (const entry of cache.values()) {
      if (entry.frame.id === frameId) {
        entry.rendered = true;
        entry.useCount++;
        entry.lastUsed = now;
        break;
      }
    }
  }, []);

  /**
   * Clean up expired cache periodically
   */
  useEffect(() => {
    const interval = setInterval(() => {
      cleanExpiredFrames(cacheRef.current);
      setMetrics((prev) => ({
        ...prev,
        cachedFrames: cacheRef.current.size,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Build state object
  const state: PredictorState = useMemo(
    () => ({
      isEnabled,
      currentPrediction,
      detectedPatterns,
      metrics,
      batteryLevel,
      isLowPowerMode,
    }),
    [
      isEnabled,
      currentPrediction,
      detectedPatterns,
      metrics,
      batteryLevel,
      isLowPowerMode,
    ]
  );

  // Build controls object
  const controls: PredictorControls = useMemo(
    () => ({
      recordInteraction,
      getCachedFrame,
      updatePrediction,
      clearCache,
      setEnabled: setIsEnabled,
      invalidateFrames,
      markFrameUsed,
    }),
    [
      recordInteraction,
      getCachedFrame,
      updatePrediction,
      clearCache,
      invalidateFrames,
      markFrameUsed,
    ]
  );

  return {
    state,
    controls,
    preRenderQueue,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple interaction recorder that integrates with touch events
 */
export function useInteractionRecorder(
  onInteraction: (event: InteractionEvent) => void
): {
  handleTouchStart: (e: TouchEvent | React.TouchEvent) => void;
  handleTouchMove: (e: TouchEvent | React.TouchEvent) => void;
  handleTouchEnd: (e: TouchEvent | React.TouchEvent) => void;
} {
  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback(
    (e: TouchEvent | React.TouchEvent) => {
      const touch =
        "nativeEvent" in e ? e.nativeEvent.touches[0] : e.touches[0];
      if (!touch) return;

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
      lastPositionRef.current = { x: touch.clientX, y: touch.clientY };
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent | React.TouchEvent) => {
      const touch =
        "nativeEvent" in e ? e.nativeEvent.touches[0] : e.touches[0];
      if (!touch || !touchStartRef.current) return;

      lastPositionRef.current = { x: touch.clientX, y: touch.clientY };
    },
    []
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent | React.TouchEvent) => {
      const start = touchStartRef.current;
      const end = lastPositionRef.current;

      if (!start || !end) return;

      const duration = Date.now() - start.time;
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);
      const velocity = distance / (duration / 1000);

      let type: InteractionType = "tap";

      if (distance > 50) {
        // Swipe detection
        const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

        if (angle > -45 && angle <= 45) {
          type = "swipe_right";
        } else if (angle > 45 && angle <= 135) {
          type = "swipe_down";
        } else if (angle > 135 || angle <= -135) {
          type = "swipe_left";
        } else {
          type = "swipe_up";
        }
      } else if (duration > 500) {
        type = "long_press";
      }

      onInteraction({
        type,
        timestamp: Date.now(),
        position: end,
        velocity: { x: deltaX / (duration / 1000), y: deltaY / (duration / 1000) },
        duration,
      });

      touchStartRef.current = null;
      lastPositionRef.current = null;
    },
    [onInteraction]
  );

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

/**
 * Hook that provides GPU compositing hints for better performance
 */
export function useGpuCompositing(
  enabled: boolean = true
): React.CSSProperties {
  return useMemo(() => {
    if (!enabled) return {};

    return {
      willChange: "transform, opacity",
      transform: "translateZ(0)",
      backfaceVisibility: "hidden" as const,
    };
  }, [enabled]);
}

// ============================================================================
// Exports
// ============================================================================

export default useMobileRenderPredictor;
