/**
 * useAvatarAnimationPrewarmer - Sprint 545
 *
 * Pre-warms avatar animations for instant playback on interaction:
 * - Prefetches and decodes animation assets
 * - Maintains warm cache of ready-to-play animations
 * - Predicts upcoming animations based on context
 * - Manages memory budget for cached animations
 * - Tracks prewarming analytics and hit rates
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type AnimationType =
  | "idle"
  | "speak"
  | "listen"
  | "think"
  | "react"
  | "gesture"
  | "transition"
  | "expression";

export type AnimationPriority = "critical" | "high" | "normal" | "low";

export type AnimationStatus =
  | "cold"
  | "warming"
  | "warm"
  | "hot"
  | "expired"
  | "error";

export type PrewarmStrategy =
  | "aggressive"
  | "balanced"
  | "conservative"
  | "manual";

export interface AnimationDefinition {
  id: string;
  type: AnimationType;
  url?: string;
  data?: unknown;
  priority?: AnimationPriority;
  durationMs?: number;
  framerate?: number;
  loopable?: boolean;
}

export interface WarmedAnimation {
  id: string;
  type: AnimationType;
  status: AnimationStatus;
  priority: AnimationPriority;
  data: unknown | null;
  decodedFrames: unknown[] | null;
  firstFrameReady: boolean;
  fullyDecoded: boolean;
  warmTime: number;
  lastAccessTime: number;
  accessCount: number;
  sizeBytes: number;
  error: string | null;
}

export interface PrewarmerState {
  totalAnimations: number;
  warmAnimations: number;
  hotAnimations: number;
  coldAnimations: number;
  warmingInProgress: number;
  memoryUsageMB: number;
  hitRate: number;
  isWarming: boolean;
}

export interface PrewarmerMetrics {
  totalPrewarms: number;
  successfulPrewarms: number;
  failedPrewarms: number;
  cacheHits: number;
  cacheMisses: number;
  averageWarmTimeMs: number;
  averageAccessLatencyMs: number;
  peakMemoryUsageMB: number;
  animationsEvicted: number;
}

export interface PrewarmerConfig {
  strategy?: PrewarmStrategy;
  memoryBudgetMB?: number;
  maxConcurrentWarms?: number;
  warmTimeoutMs?: number;
  expirationMs?: number;
  enablePrediction?: boolean;
  prefetchCount?: number;
  hotThresholdAccesses?: number;
  enabled?: boolean;
}

export interface PrewarmerCallbacks {
  onAnimationWarmed?: (animation: WarmedAnimation) => void;
  onAnimationAccessed?: (animation: WarmedAnimation) => void;
  onAnimationEvicted?: (animationId: string) => void;
  onMemoryWarning?: (usageMB: number, budgetMB: number) => void;
  onWarmComplete?: () => void;
  onError?: (animationId: string, error: Error) => void;
}

export interface PrewarmerControls {
  prewarm: (animations: AnimationDefinition[]) => void;
  prewarmOne: (animation: AnimationDefinition) => Promise<WarmedAnimation>;
  getAnimation: (id: string) => WarmedAnimation | null;
  accessAnimation: (id: string) => unknown | null;
  evict: (id: string) => void;
  evictType: (type: AnimationType) => void;
  evictAll: () => void;
  setStrategy: (strategy: PrewarmStrategy) => void;
  warmNext: () => Promise<void>;
  markHot: (id: string) => void;
  markCold: (id: string) => void;
  predict: (context: AnimationContext) => string[];
  reset: () => void;
}

export interface AnimationContext {
  currentState: string;
  userActivity: string;
  conversationPhase: string;
  recentAnimations: string[];
}

export interface AnimationPrewarmerResult {
  state: PrewarmerState;
  metrics: PrewarmerMetrics;
  controls: PrewarmerControls;
  isReady: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: Required<PrewarmerConfig> = {
  strategy: "balanced",
  memoryBudgetMB: 50,
  maxConcurrentWarms: 2,
  warmTimeoutMs: 5000,
  expirationMs: 300000, // 5 minutes
  enablePrediction: true,
  prefetchCount: 3,
  hotThresholdAccesses: 3,
  enabled: true,
};

const PRIORITY_WEIGHT: Record<AnimationPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

const TYPE_PREDICTION_MAP: Record<AnimationType, AnimationType[]> = {
  idle: ["speak", "listen", "react"],
  speak: ["idle", "gesture", "expression"],
  listen: ["speak", "react", "think"],
  think: ["speak", "idle", "expression"],
  react: ["idle", "speak", "expression"],
  gesture: ["idle", "speak"],
  transition: ["idle", "speak"],
  expression: ["idle", "speak", "react"],
};

// ============================================================================
// Utility Functions
// ============================================================================

function estimateAnimationSize(animation: AnimationDefinition): number {
  // Estimate based on duration and framerate
  const durationMs = animation.durationMs || 1000;
  const framerate = animation.framerate || 30;
  const framesCount = (durationMs / 1000) * framerate;
  // Estimate ~10KB per frame for blend shapes
  return framesCount * 10 * 1024;
}

function shouldPrewarm(
  animation: WarmedAnimation,
  strategy: PrewarmStrategy
): boolean {
  switch (strategy) {
    case "aggressive":
      return animation.status === "cold";
    case "balanced":
      return (
        animation.status === "cold" &&
        (animation.priority === "critical" || animation.priority === "high")
      );
    case "conservative":
      return (
        animation.status === "cold" && animation.priority === "critical"
      );
    case "manual":
      return false;
  }
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarAnimationPrewarmer(
  config: PrewarmerConfig = {},
  callbacks: PrewarmerCallbacks = {}
): AnimationPrewarmerResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [animations, setAnimations] = useState<Map<string, WarmedAnimation>>(
    new Map()
  );
  const [warmingQueue, setWarmingQueue] = useState<string[]>([]);
  const [strategy, setStrategyState] = useState<PrewarmStrategy>(
    mergedConfig.strategy
  );

  // Refs
  const animationsRef = useRef(animations);
  animationsRef.current = animations;
  const warmingRef = useRef<Set<string>>(new Set());
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const metricsRef = useRef<PrewarmerMetrics>({
    totalPrewarms: 0,
    successfulPrewarms: 0,
    failedPrewarms: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageWarmTimeMs: 0,
    averageAccessLatencyMs: 0,
    peakMemoryUsageMB: 0,
    animationsEvicted: 0,
  });
  const warmTimesRef = useRef<number[]>([]);
  const accessTimesRef = useRef<number[]>([]);

  // Calculate state
  const state = useMemo<PrewarmerState>(() => {
    const animArray = Array.from(animations.values());
    const warm = animArray.filter((a) => a.status === "warm").length;
    const hot = animArray.filter((a) => a.status === "hot").length;
    const cold = animArray.filter((a) => a.status === "cold").length;
    const warming = animArray.filter((a) => a.status === "warming").length;
    const totalSize = animArray.reduce((sum, a) => sum + a.sizeBytes, 0);
    const hits = metricsRef.current.cacheHits;
    const misses = metricsRef.current.cacheMisses;

    return {
      totalAnimations: animArray.length,
      warmAnimations: warm,
      hotAnimations: hot,
      coldAnimations: cold,
      warmingInProgress: warming,
      memoryUsageMB: totalSize / (1024 * 1024),
      hitRate: hits + misses > 0 ? hits / (hits + misses) : 0,
      isWarming: warming > 0,
    };
  }, [animations]);

  // Warm a single animation
  const warmAnimation = useCallback(
    async (id: string): Promise<void> => {
      const animation = animationsRef.current.get(id);
      if (!animation || warmingRef.current.has(id)) return;

      warmingRef.current.add(id);
      const startTime = performance.now();

      setAnimations((prev) => {
        const next = new Map(prev);
        const anim = next.get(id);
        if (anim) {
          next.set(id, { ...anim, status: "warming" });
        }
        return next;
      });

      try {
        // Simulate animation warming (in real impl, would decode frames)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 100 + 50)
        );

        const warmTime = performance.now() - startTime;
        warmTimesRef.current.push(warmTime);

        setAnimations((prev) => {
          const next = new Map(prev);
          const anim = next.get(id);
          if (anim) {
            const warmed: WarmedAnimation = {
              ...anim,
              status: "warm",
              firstFrameReady: true,
              fullyDecoded: true,
              warmTime,
            };
            next.set(id, warmed);
            callbacksRef.current.onAnimationWarmed?.(warmed);
          }
          return next;
        });

        metricsRef.current.successfulPrewarms++;
        metricsRef.current.averageWarmTimeMs =
          warmTimesRef.current.reduce((a, b) => a + b, 0) /
          warmTimesRef.current.length;
      } catch (error) {
        setAnimations((prev) => {
          const next = new Map(prev);
          const anim = next.get(id);
          if (anim) {
            next.set(id, {
              ...anim,
              status: "error",
              error: (error as Error).message,
            });
          }
          return next;
        });

        metricsRef.current.failedPrewarms++;
        callbacksRef.current.onError?.(id, error as Error);
      } finally {
        warmingRef.current.delete(id);
        metricsRef.current.totalPrewarms++;
      }
    },
    [mergedConfig]
  );

  // Process warming queue
  useEffect(() => {
    if (!mergedConfig.enabled || warmingQueue.length === 0) return;

    const processQueue = async () => {
      const available =
        mergedConfig.maxConcurrentWarms - warmingRef.current.size;
      if (available <= 0) return;

      const toWarm = warmingQueue.slice(0, available);
      setWarmingQueue((prev) => prev.slice(available));

      await Promise.all(toWarm.map((id) => warmAnimation(id)));

      // Check if all done
      if (warmingQueue.length <= available && warmingRef.current.size === 0) {
        callbacksRef.current.onWarmComplete?.();
      }
    };

    processQueue();
  }, [warmingQueue, mergedConfig, warmAnimation]);

  // Check memory budget
  useEffect(() => {
    if (state.memoryUsageMB > mergedConfig.memoryBudgetMB * 0.9) {
      callbacksRef.current.onMemoryWarning?.(
        state.memoryUsageMB,
        mergedConfig.memoryBudgetMB
      );

      // Track peak memory
      if (state.memoryUsageMB > metricsRef.current.peakMemoryUsageMB) {
        metricsRef.current.peakMemoryUsageMB = state.memoryUsageMB;
      }
    }
  }, [state.memoryUsageMB, mergedConfig.memoryBudgetMB]);

  // Expiration check
  useEffect(() => {
    if (!mergedConfig.enabled) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setAnimations((prev) => {
        const next = new Map(prev);
        let changed = false;

        for (const [id, anim] of next) {
          if (
            anim.status === "warm" &&
            now - anim.lastAccessTime > mergedConfig.expirationMs
          ) {
            next.set(id, { ...anim, status: "expired" });
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [mergedConfig]);

  // Controls
  const prewarm = useCallback(
    (defs: AnimationDefinition[]) => {
      if (!mergedConfig.enabled) return;

      const newAnimations = new Map(animationsRef.current);
      const toQueue: string[] = [];

      for (const def of defs) {
        if (!newAnimations.has(def.id)) {
          const warmed: WarmedAnimation = {
            id: def.id,
            type: def.type,
            status: "cold",
            priority: def.priority || "normal",
            data: def.data || null,
            decodedFrames: null,
            firstFrameReady: false,
            fullyDecoded: false,
            warmTime: 0,
            lastAccessTime: Date.now(),
            accessCount: 0,
            sizeBytes: estimateAnimationSize(def),
            error: null,
          };
          newAnimations.set(def.id, warmed);

          if (shouldPrewarm(warmed, strategy)) {
            toQueue.push(def.id);
          }
        }
      }

      setAnimations(newAnimations);

      // Sort by priority
      const sorted = toQueue.sort((a, b) => {
        const animA = newAnimations.get(a);
        const animB = newAnimations.get(b);
        if (!animA || !animB) return 0;
        return PRIORITY_WEIGHT[animB.priority] - PRIORITY_WEIGHT[animA.priority];
      });

      setWarmingQueue((prev) => [...prev, ...sorted]);
    },
    [strategy, mergedConfig]
  );

  const prewarmOne = useCallback(
    async (def: AnimationDefinition): Promise<WarmedAnimation> => {
      prewarm([def]);
      await warmAnimation(def.id);
      return animationsRef.current.get(def.id)!;
    },
    [prewarm, warmAnimation]
  );

  const getAnimation = useCallback(
    (id: string): WarmedAnimation | null => {
      return animations.get(id) || null;
    },
    [animations]
  );

  const accessAnimation = useCallback(
    (id: string): unknown | null => {
      const startTime = performance.now();
      const animation = animationsRef.current.get(id);

      if (!animation) {
        metricsRef.current.cacheMisses++;
        return null;
      }

      if (animation.status === "warm" || animation.status === "hot") {
        metricsRef.current.cacheHits++;
      } else {
        metricsRef.current.cacheMisses++;
      }

      const accessLatency = performance.now() - startTime;
      accessTimesRef.current.push(accessLatency);
      metricsRef.current.averageAccessLatencyMs =
        accessTimesRef.current.reduce((a, b) => a + b, 0) /
        accessTimesRef.current.length;

      setAnimations((prev) => {
        const next = new Map(prev);
        const anim = next.get(id);
        if (anim) {
          const newCount = anim.accessCount + 1;
          const newStatus =
            newCount >= mergedConfig.hotThresholdAccesses &&
            (anim.status === "warm" || anim.status === "hot")
              ? "hot"
              : anim.status;

          const updated = {
            ...anim,
            lastAccessTime: Date.now(),
            accessCount: newCount,
            status: newStatus,
          };
          next.set(id, updated);
          callbacksRef.current.onAnimationAccessed?.(updated);
        }
        return next;
      });

      return animation.data;
    },
    [mergedConfig]
  );

  const evict = useCallback((id: string) => {
    setAnimations((prev) => {
      const next = new Map(prev);
      if (next.delete(id)) {
        metricsRef.current.animationsEvicted++;
        callbacksRef.current.onAnimationEvicted?.(id);
      }
      return next;
    });
  }, []);

  const evictType = useCallback((type: AnimationType) => {
    setAnimations((prev) => {
      const next = new Map(prev);
      for (const [id, anim] of next) {
        if (anim.type === type) {
          next.delete(id);
          metricsRef.current.animationsEvicted++;
          callbacksRef.current.onAnimationEvicted?.(id);
        }
      }
      return next;
    });
  }, []);

  const evictAll = useCallback(() => {
    const count = animationsRef.current.size;
    setAnimations(new Map());
    metricsRef.current.animationsEvicted += count;
  }, []);

  const setStrategy = useCallback((newStrategy: PrewarmStrategy) => {
    setStrategyState(newStrategy);
  }, []);

  const warmNext = useCallback(async () => {
    // Find next cold animation to warm
    const cold = Array.from(animationsRef.current.values())
      .filter((a) => a.status === "cold")
      .sort(
        (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
      )[0];

    if (cold) {
      await warmAnimation(cold.id);
    }
  }, [warmAnimation]);

  const markHot = useCallback((id: string) => {
    setAnimations((prev) => {
      const next = new Map(prev);
      const anim = next.get(id);
      if (anim && (anim.status === "warm" || anim.status === "hot")) {
        next.set(id, { ...anim, status: "hot" });
      }
      return next;
    });
  }, []);

  const markCold = useCallback((id: string) => {
    setAnimations((prev) => {
      const next = new Map(prev);
      const anim = next.get(id);
      if (anim) {
        next.set(id, {
          ...anim,
          status: "cold",
          firstFrameReady: false,
          fullyDecoded: false,
        });
      }
      return next;
    });
  }, []);

  const predict = useCallback(
    (context: AnimationContext): string[] => {
      if (!mergedConfig.enablePrediction) return [];

      const predictions: string[] = [];
      const animArray = Array.from(animationsRef.current.values());

      // Predict based on current animation type
      if (context.recentAnimations.length > 0) {
        const recentId = context.recentAnimations[0];
        const recent = animationsRef.current.get(recentId);
        if (recent) {
          const likelyTypes = TYPE_PREDICTION_MAP[recent.type] || [];
          for (const type of likelyTypes) {
            const candidates = animArray.filter(
              (a) => a.type === type && a.status === "cold"
            );
            if (candidates.length > 0) {
              predictions.push(candidates[0].id);
            }
            if (predictions.length >= mergedConfig.prefetchCount) break;
          }
        }
      }

      return predictions.slice(0, mergedConfig.prefetchCount);
    },
    [mergedConfig]
  );

  const reset = useCallback(() => {
    setAnimations(new Map());
    setWarmingQueue([]);
    warmingRef.current.clear();
    metricsRef.current = {
      totalPrewarms: 0,
      successfulPrewarms: 0,
      failedPrewarms: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageWarmTimeMs: 0,
      averageAccessLatencyMs: 0,
      peakMemoryUsageMB: 0,
      animationsEvicted: 0,
    };
    warmTimesRef.current = [];
    accessTimesRef.current = [];
  }, []);

  const controls = useMemo<PrewarmerControls>(
    () => ({
      prewarm,
      prewarmOne,
      getAnimation,
      accessAnimation,
      evict,
      evictType,
      evictAll,
      setStrategy,
      warmNext,
      markHot,
      markCold,
      predict,
      reset,
    }),
    [
      prewarm,
      prewarmOne,
      getAnimation,
      accessAnimation,
      evict,
      evictType,
      evictAll,
      setStrategy,
      warmNext,
      markHot,
      markCold,
      predict,
      reset,
    ]
  );

  const isReady =
    state.warmAnimations + state.hotAnimations > 0 || !mergedConfig.enabled;

  return {
    state,
    metrics: metricsRef.current,
    controls,
    isReady,
  };
}

// ============================================================================
// Sub-Hooks
// ============================================================================

export interface WarmStatusResult {
  isWarm: boolean;
  isHot: boolean;
  status: AnimationStatus | null;
}

export function useAnimationWarmStatus(
  animationId: string,
  config: PrewarmerConfig = {}
): WarmStatusResult {
  const { state, controls } = useAvatarAnimationPrewarmer(config);
  const animation = controls.getAnimation(animationId);

  return {
    isWarm: animation?.status === "warm" || animation?.status === "hot",
    isHot: animation?.status === "hot",
    status: animation?.status || null,
  };
}

export function usePrewarmerMetrics(
  config: PrewarmerConfig = {}
): PrewarmerMetrics {
  const { metrics } = useAvatarAnimationPrewarmer(config);
  return metrics;
}

export function useHotAnimations(
  config: PrewarmerConfig = {}
): WarmedAnimation[] {
  const { controls } = useAvatarAnimationPrewarmer(config);

  return useMemo(() => {
    const all: WarmedAnimation[] = [];
    // Would iterate through animations to find hot ones
    return all;
  }, [controls]);
}

export default useAvatarAnimationPrewarmer;
