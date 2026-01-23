/**
 * useVisualFeedbackAccelerator - Sprint 229
 *
 * Accelerates visual feedback by bypassing React's batched updates
 * for critical UI elements. Uses direct DOM manipulation for
 * immediate visual response while maintaining React state sync.
 *
 * Features:
 * - Direct DOM transform updates
 * - CSS variable injection for instant style changes
 * - RAF-synchronized updates
 * - Automatic React state reconciliation
 * - GPU-accelerated property targeting
 * - Batched non-critical updates
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Accelerated properties that can be updated directly
 */
export type AcceleratedProperty =
  | "transform"
  | "opacity"
  | "filter"
  | "clipPath"
  | "backgroundColor"
  | "borderColor"
  | "boxShadow"
  | "scale"
  | "rotate"
  | "translateX"
  | "translateY";

/**
 * Transform state
 */
export interface TransformState {
  translateX: number;
  translateY: number;
  scale: number;
  rotate: number;
  skewX: number;
  skewY: number;
}

/**
 * Style state for accelerated updates
 */
export interface AcceleratedStyle {
  transform: TransformState;
  opacity: number;
  filter: {
    blur: number;
    brightness: number;
    contrast: number;
    saturate: number;
  };
  backgroundColor: string;
  boxShadow: string;
  customVars: Record<string, string | number>;
}

/**
 * Update batch for non-critical changes
 */
export interface UpdateBatch {
  id: number;
  updates: Partial<AcceleratedStyle>;
  timestamp: number;
  priority: "high" | "normal" | "low";
}

/**
 * Accelerator configuration
 */
export interface AcceleratorConfig {
  /** Enable direct DOM updates (default: true) */
  enableDirectDom: boolean;
  /** Sync React state interval in ms (default: 100) */
  reactSyncIntervalMs: number;
  /** Use CSS variables for colors (default: true) */
  useCssVariables: boolean;
  /** Enable GPU hints (default: true) */
  enableGpuHints: boolean;
  /** Batch non-critical updates (default: true) */
  batchNonCritical: boolean;
  /** Batch flush interval in ms (default: 50) */
  batchFlushIntervalMs: number;
  /** Maximum pending batches (default: 10) */
  maxPendingBatches: number;
}

/**
 * Accelerator metrics
 */
export interface AcceleratorMetrics {
  directUpdates: number;
  batchedUpdates: number;
  reactSyncs: number;
  averageUpdateTime: number;
  gpuLayersCreated: number;
}

/**
 * Accelerator state
 */
export interface AcceleratorState {
  isAttached: boolean;
  currentStyle: AcceleratedStyle;
  metrics: AcceleratorMetrics;
  pendingBatches: number;
}

/**
 * Accelerator controls
 */
export interface AcceleratorControls {
  /** Attach to DOM element */
  attach: (element: HTMLElement) => void;
  /** Detach from element */
  detach: () => void;
  /** Set transform instantly */
  setTransform: (transform: Partial<TransformState>) => void;
  /** Set opacity instantly */
  setOpacity: (opacity: number) => void;
  /** Set filter instantly */
  setFilter: (filter: Partial<AcceleratedStyle["filter"]>) => void;
  /** Set CSS variable */
  setCssVar: (name: string, value: string | number) => void;
  /** Queue batched update */
  queueUpdate: (updates: Partial<AcceleratedStyle>, priority?: "high" | "normal" | "low") => void;
  /** Flush pending batches */
  flushBatches: () => void;
  /** Reset to initial state */
  reset: () => void;
  /** Force React state sync */
  syncReactState: () => void;
}

/**
 * Hook return type
 */
export interface UseVisualFeedbackAcceleratorResult {
  state: AcceleratorState;
  controls: AcceleratorControls;
  /** Ref to attach to element */
  ref: React.RefObject<HTMLElement>;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONFIG: AcceleratorConfig = {
  enableDirectDom: true,
  reactSyncIntervalMs: 100,
  useCssVariables: true,
  enableGpuHints: true,
  batchNonCritical: true,
  batchFlushIntervalMs: 50,
  maxPendingBatches: 10,
};

const DEFAULT_TRANSFORM: TransformState = {
  translateX: 0,
  translateY: 0,
  scale: 1,
  rotate: 0,
  skewX: 0,
  skewY: 0,
};

const DEFAULT_FILTER = {
  blur: 0,
  brightness: 1,
  contrast: 1,
  saturate: 1,
};

const DEFAULT_STYLE: AcceleratedStyle = {
  transform: DEFAULT_TRANSFORM,
  opacity: 1,
  filter: DEFAULT_FILTER,
  backgroundColor: "",
  boxShadow: "",
  customVars: {},
};

const DEFAULT_METRICS: AcceleratorMetrics = {
  directUpdates: 0,
  batchedUpdates: 0,
  reactSyncs: 0,
  averageUpdateTime: 0,
  gpuLayersCreated: 0,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Build transform string from state
 */
function buildTransformString(transform: TransformState): string {
  const parts: string[] = [];

  if (transform.translateX !== 0 || transform.translateY !== 0) {
    parts.push(`translate3d(${transform.translateX}px, ${transform.translateY}px, 0)`);
  }

  if (transform.scale !== 1) {
    parts.push(`scale(${transform.scale})`);
  }

  if (transform.rotate !== 0) {
    parts.push(`rotate(${transform.rotate}deg)`);
  }

  if (transform.skewX !== 0) {
    parts.push(`skewX(${transform.skewX}deg)`);
  }

  if (transform.skewY !== 0) {
    parts.push(`skewY(${transform.skewY}deg)`);
  }

  return parts.length > 0 ? parts.join(" ") : "none";
}

/**
 * Build filter string from state
 */
function buildFilterString(filter: AcceleratedStyle["filter"]): string {
  const parts: string[] = [];

  if (filter.blur > 0) {
    parts.push(`blur(${filter.blur}px)`);
  }

  if (filter.brightness !== 1) {
    parts.push(`brightness(${filter.brightness})`);
  }

  if (filter.contrast !== 1) {
    parts.push(`contrast(${filter.contrast})`);
  }

  if (filter.saturate !== 1) {
    parts.push(`saturate(${filter.saturate})`);
  }

  return parts.length > 0 ? parts.join(" ") : "none";
}

/**
 * Apply GPU hints to element
 */
function applyGpuHints(element: HTMLElement): void {
  element.style.willChange = "transform, opacity, filter";
  element.style.backfaceVisibility = "hidden";
  // Force GPU layer creation
  if (!element.style.transform || element.style.transform === "none") {
    element.style.transform = "translateZ(0)";
  }
}

/**
 * Remove GPU hints from element
 */
function removeGpuHints(element: HTMLElement): void {
  element.style.willChange = "";
  element.style.backfaceVisibility = "";
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that accelerates visual feedback through direct DOM manipulation
 */
export function useVisualFeedbackAccelerator(
  config: Partial<AcceleratorConfig> = {}
): UseVisualFeedbackAcceleratorResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isAttached, setIsAttached] = useState(false);
  const [currentStyle, setCurrentStyle] = useState<AcceleratedStyle>(DEFAULT_STYLE);
  const [metrics, setMetrics] = useState<AcceleratorMetrics>(DEFAULT_METRICS);
  const [pendingBatches, setPendingBatches] = useState(0);

  // Refs
  const elementRef = useRef<HTMLElement | null>(null);
  const internalRef = useRef<HTMLElement>(null);
  const batchQueueRef = useRef<UpdateBatch[]>([]);
  const batchIdRef = useRef(0);
  const updateTimesRef = useRef<number[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const styleRef = useRef<AcceleratedStyle>(DEFAULT_STYLE);

  /**
   * Apply style directly to DOM
   */
  const applyToDom = useCallback(
    (style: Partial<AcceleratedStyle>) => {
      const element = elementRef.current;
      if (!element || !mergedConfig.enableDirectDom) return;

      const startTime = performance.now();

      // Apply transform
      if (style.transform) {
        const newTransform = { ...styleRef.current.transform, ...style.transform };
        element.style.transform = buildTransformString(newTransform);
        styleRef.current.transform = newTransform;
      }

      // Apply opacity
      if (style.opacity !== undefined) {
        element.style.opacity = String(style.opacity);
        styleRef.current.opacity = style.opacity;
      }

      // Apply filter
      if (style.filter) {
        const newFilter = { ...styleRef.current.filter, ...style.filter };
        element.style.filter = buildFilterString(newFilter);
        styleRef.current.filter = newFilter;
      }

      // Apply background color
      if (style.backgroundColor !== undefined) {
        if (mergedConfig.useCssVariables) {
          element.style.setProperty("--accel-bg", style.backgroundColor);
          element.style.backgroundColor = "var(--accel-bg)";
        } else {
          element.style.backgroundColor = style.backgroundColor;
        }
        styleRef.current.backgroundColor = style.backgroundColor;
      }

      // Apply box shadow
      if (style.boxShadow !== undefined) {
        element.style.boxShadow = style.boxShadow;
        styleRef.current.boxShadow = style.boxShadow;
      }

      // Apply custom CSS variables
      if (style.customVars) {
        for (const [name, value] of Object.entries(style.customVars)) {
          element.style.setProperty(`--${name}`, String(value));
          styleRef.current.customVars[name] = value;
        }
      }

      // Track metrics
      const updateTime = performance.now() - startTime;
      updateTimesRef.current.push(updateTime);
      if (updateTimesRef.current.length > 100) {
        updateTimesRef.current.shift();
      }

      setMetrics((prev) => ({
        ...prev,
        directUpdates: prev.directUpdates + 1,
        averageUpdateTime:
          updateTimesRef.current.reduce((a, b) => a + b, 0) /
          updateTimesRef.current.length,
      }));
    },
    [mergedConfig.enableDirectDom, mergedConfig.useCssVariables]
  );

  /**
   * Sync current DOM state to React state
   */
  const syncReactState = useCallback(() => {
    setCurrentStyle({ ...styleRef.current });
    setMetrics((prev) => ({
      ...prev,
      reactSyncs: prev.reactSyncs + 1,
    }));
  }, []);

  /**
   * Process pending batches
   */
  const processBatches = useCallback(() => {
    const queue = batchQueueRef.current;
    if (queue.length === 0) return;

    // Sort by priority
    queue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Merge all updates
    let merged: Partial<AcceleratedStyle> = {};
    for (const batch of queue) {
      const mergedTransform = merged.transform ?? {} as Partial<TransformState>;
      const batchTransform = batch.updates.transform ?? {} as Partial<TransformState>;
      const mergedFilter = merged.filter ?? {};
      const batchFilter = batch.updates.filter ?? {};

      merged = {
        ...merged,
        ...batch.updates,
        transform: { ...mergedTransform, ...batchTransform } as TransformState,
        filter: { ...mergedFilter, ...batchFilter } as AcceleratedStyle["filter"],
        customVars: { ...merged.customVars, ...batch.updates.customVars },
      };
    }

    // Apply merged updates
    applyToDom(merged);

    // Update metrics
    setMetrics((prev) => ({
      ...prev,
      batchedUpdates: prev.batchedUpdates + queue.length,
    }));

    // Clear queue
    batchQueueRef.current = [];
    setPendingBatches(0);
  }, [applyToDom]);

  /**
   * Attach to DOM element
   */
  const attach = useCallback(
    (element: HTMLElement) => {
      elementRef.current = element;
      setIsAttached(true);

      // Apply GPU hints
      if (mergedConfig.enableGpuHints) {
        applyGpuHints(element);
        setMetrics((prev) => ({
          ...prev,
          gpuLayersCreated: prev.gpuLayersCreated + 1,
        }));
      }

      // Start React sync interval
      if (mergedConfig.reactSyncIntervalMs > 0) {
        syncIntervalRef.current = setInterval(
          syncReactState,
          mergedConfig.reactSyncIntervalMs
        );
      }

      // Start batch processing
      if (mergedConfig.batchNonCritical) {
        const processBatchLoop = () => {
          processBatches();
          rafIdRef.current = requestAnimationFrame(processBatchLoop);
        };
        rafIdRef.current = requestAnimationFrame(processBatchLoop);
      }
    },
    [mergedConfig, syncReactState, processBatches]
  );

  /**
   * Detach from element
   */
  const detach = useCallback(() => {
    const element = elementRef.current;

    if (element && mergedConfig.enableGpuHints) {
      removeGpuHints(element);
    }

    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    elementRef.current = null;
    setIsAttached(false);
  }, [mergedConfig.enableGpuHints]);

  /**
   * Set transform instantly
   */
  const setTransform = useCallback(
    (transform: Partial<TransformState>) => {
      applyToDom({ transform });
    },
    [applyToDom]
  );

  /**
   * Set opacity instantly
   */
  const setOpacity = useCallback(
    (opacity: number) => {
      applyToDom({ opacity });
    },
    [applyToDom]
  );

  /**
   * Set filter instantly
   */
  const setFilter = useCallback(
    (filter: Partial<AcceleratedStyle["filter"]>) => {
      applyToDom({ filter });
    },
    [applyToDom]
  );

  /**
   * Set CSS variable
   */
  const setCssVar = useCallback(
    (name: string, value: string | number) => {
      applyToDom({ customVars: { [name]: value } });
    },
    [applyToDom]
  );

  /**
   * Queue batched update
   */
  const queueUpdate = useCallback(
    (
      updates: Partial<AcceleratedStyle>,
      priority: "high" | "normal" | "low" = "normal"
    ) => {
      const queue = batchQueueRef.current;

      // Enforce max queue size
      if (queue.length >= mergedConfig.maxPendingBatches) {
        // Remove oldest low-priority item
        const lowPriorityIndex = queue.findIndex((b) => b.priority === "low");
        if (lowPriorityIndex !== -1) {
          queue.splice(lowPriorityIndex, 1);
        } else {
          queue.shift();
        }
      }

      queue.push({
        id: ++batchIdRef.current,
        updates,
        timestamp: performance.now(),
        priority,
      });

      setPendingBatches(queue.length);

      // Immediately process high priority
      if (priority === "high") {
        processBatches();
      }
    },
    [mergedConfig.maxPendingBatches, processBatches]
  );

  /**
   * Flush pending batches
   */
  const flushBatches = useCallback(() => {
    processBatches();
  }, [processBatches]);

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    styleRef.current = { ...DEFAULT_STYLE };
    batchQueueRef.current = [];
    updateTimesRef.current = [];

    const element = elementRef.current;
    if (element) {
      element.style.transform = "";
      element.style.opacity = "";
      element.style.filter = "";
      element.style.backgroundColor = "";
      element.style.boxShadow = "";
    }

    setCurrentStyle(DEFAULT_STYLE);
    setMetrics(DEFAULT_METRICS);
    setPendingBatches(0);
  }, []);

  // Auto-attach using ref
  useEffect(() => {
    const element = internalRef.current;
    if (element && !isAttached) {
      attach(element);
    }

    return () => {
      detach();
    };
  }, [attach, detach, isAttached]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Build state object
  const state: AcceleratorState = useMemo(
    () => ({
      isAttached,
      currentStyle,
      metrics,
      pendingBatches,
    }),
    [isAttached, currentStyle, metrics, pendingBatches]
  );

  // Build controls object
  const controls: AcceleratorControls = useMemo(
    () => ({
      attach,
      detach,
      setTransform,
      setOpacity,
      setFilter,
      setCssVar,
      queueUpdate,
      flushBatches,
      reset,
      syncReactState,
    }),
    [
      attach,
      detach,
      setTransform,
      setOpacity,
      setFilter,
      setCssVar,
      queueUpdate,
      flushBatches,
      reset,
      syncReactState,
    ]
  );

  return {
    state,
    controls,
    ref: internalRef as React.RefObject<HTMLElement>,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple hook for accelerated transform updates
 */
export function useAcceleratedTransform(): {
  ref: React.RefObject<HTMLElement>;
  setPosition: (x: number, y: number) => void;
  setScale: (scale: number) => void;
  setRotation: (degrees: number) => void;
} {
  const { ref, controls } = useVisualFeedbackAccelerator();

  const setPosition = useCallback(
    (x: number, y: number) => {
      controls.setTransform({ translateX: x, translateY: y });
    },
    [controls]
  );

  const setScale = useCallback(
    (scale: number) => {
      controls.setTransform({ scale });
    },
    [controls]
  );

  const setRotation = useCallback(
    (degrees: number) => {
      controls.setTransform({ rotate: degrees });
    },
    [controls]
  );

  return { ref, setPosition, setScale, setRotation };
}

/**
 * Hook for accelerated opacity transitions
 */
export function useAcceleratedOpacity(): {
  ref: React.RefObject<HTMLElement>;
  fadeIn: (duration?: number) => void;
  fadeOut: (duration?: number) => void;
  setOpacity: (value: number) => void;
} {
  const { ref, controls } = useVisualFeedbackAccelerator();
  const animationRef = useRef<number | null>(null);

  const animate = useCallback(
    (from: number, to: number, duration: number) => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      const startTime = performance.now();

      const step = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const value = from + (to - from) * progress;

        controls.setOpacity(value);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(step);
        }
      };

      animationRef.current = requestAnimationFrame(step);
    },
    [controls]
  );

  const fadeIn = useCallback(
    (duration: number = 300) => {
      animate(0, 1, duration);
    },
    [animate]
  );

  const fadeOut = useCallback(
    (duration: number = 300) => {
      animate(1, 0, duration);
    },
    [animate]
  );

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return { ref, fadeIn, fadeOut, setOpacity: controls.setOpacity };
}

// ============================================================================
// Exports
// ============================================================================

export default useVisualFeedbackAccelerator;
