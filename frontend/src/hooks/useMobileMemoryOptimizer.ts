/**
 * useMobileMemoryOptimizer Hook - Sprint 513
 *
 * Memory management and optimization for mobile devices.
 * Prevents memory leaks and manages resource lifecycle.
 *
 * Features:
 * - Memory pressure detection and response
 * - Resource lifecycle management (create, use, dispose)
 * - Automatic cleanup of unused resources
 * - Memory budget tracking
 * - Cache eviction strategies (LRU, LFU, TTL)
 * - Weak reference management for large objects
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type MemoryPressureLevel = "normal" | "moderate" | "critical";

export type CacheEvictionStrategy = "lru" | "lfu" | "ttl" | "size" | "priority";

export type ResourceType = "image" | "audio" | "video" | "data" | "blob" | "canvas" | "webgl" | "other";

export interface ManagedResource {
  id: string;
  type: ResourceType;
  size: number; // bytes
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  priority: number; // 0-10, higher = more important
  ttl?: number; // ms, optional time-to-live
  disposer?: () => void; // cleanup function
  metadata?: Record<string, unknown>;
}

export interface MemoryStats {
  used: number; // bytes (estimated)
  available: number; // bytes (estimated)
  total: number; // bytes (estimated)
  pressure: MemoryPressureLevel;
  resourceCount: number;
  cacheSize: number;
}

export interface MemoryBudget {
  total: number; // bytes
  images: number;
  audio: number;
  video: number;
  data: number;
  other: number;
}

export interface EvictionResult {
  evicted: string[];
  freedBytes: number;
  remainingResources: number;
}

export interface MemoryOptimizerConfig {
  enabled: boolean;
  budgetMB: number;
  evictionStrategy: CacheEvictionStrategy;
  cleanupIntervalMs: number;
  pressureThresholds: { moderate: number; critical: number }; // 0-1
  autoEvict: boolean;
  preservePriority: number; // Resources at or above this priority won't be auto-evicted
  enableWeakRefs: boolean;
  maxResourceAge: number; // ms
}

export interface MemoryOptimizerState {
  stats: MemoryStats;
  resources: Map<string, ManagedResource>;
  pressure: MemoryPressureLevel;
  lastCleanup: number;
  evictionHistory: Array<{ timestamp: number; freed: number; reason: string }>;
}

export interface MemoryOptimizerControls {
  register: (resource: Omit<ManagedResource, "id" | "createdAt" | "lastAccessedAt" | "accessCount">) => string;
  unregister: (id: string) => void;
  access: (id: string) => void;
  evict: (strategy?: CacheEvictionStrategy, targetBytes?: number) => EvictionResult;
  evictType: (type: ResourceType) => EvictionResult;
  clear: () => void;
  getResource: (id: string) => ManagedResource | undefined;
  updatePriority: (id: string, priority: number) => void;
  forceCleanup: () => void;
  getMemoryUsage: () => MemoryStats;
}

export interface UseMobileMemoryOptimizerResult {
  state: MemoryOptimizerState;
  stats: MemoryStats;
  controls: MemoryOptimizerControls;
  isUnderPressure: boolean;
  budgetRemaining: number;
  usagePercent: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: MemoryOptimizerConfig = {
  enabled: true,
  budgetMB: 100, // 100MB default budget
  evictionStrategy: "lru",
  cleanupIntervalMs: 30000, // 30 seconds
  pressureThresholds: { moderate: 0.7, critical: 0.9 },
  autoEvict: true,
  preservePriority: 8,
  enableWeakRefs: true,
  maxResourceAge: 5 * 60 * 1000, // 5 minutes
};

const TYPE_BUDGETS: Record<ResourceType, number> = {
  image: 0.4, // 40% of budget
  audio: 0.2,
  video: 0.2,
  data: 0.1,
  blob: 0.05,
  canvas: 0.03,
  webgl: 0.01,
  other: 0.01,
};

// Module-level counter for resource IDs (avoids Date.now() overhead)
let resourceIdCounter = 0;

// Pre-computed initial eviction history max size
const EVICTION_HISTORY_SIZE = 50;

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `res_${++resourceIdCounter}_${Math.random().toString(36).substr(2, 9)}`;
}

function estimateMemoryUsage(): { used: number; total: number } {
  // Try to get device memory
  const deviceMemory = (navigator as any).deviceMemory;
  const totalGB = deviceMemory || 4; // Default 4GB
  const total = totalGB * 1024 * 1024 * 1024;

  // Try performance.memory (Chrome only)
  const perfMemory = (performance as any).memory;
  if (perfMemory) {
    return {
      used: perfMemory.usedJSHeapSize,
      total: Math.min(total, perfMemory.jsHeapSizeLimit),
    };
  }

  // Fallback estimation
  return {
    used: total * 0.3, // Assume 30% used
    total,
  };
}

function calculatePressureLevel(
  usedRatio: number,
  thresholds: { moderate: number; critical: number }
): MemoryPressureLevel {
  if (usedRatio >= thresholds.critical) return "critical";
  if (usedRatio >= thresholds.moderate) return "moderate";
  return "normal";
}

function selectEvictionCandidates(
  resources: Map<string, ManagedResource>,
  strategy: CacheEvictionStrategy,
  targetBytes: number,
  preservePriority: number
): string[] {
  const candidates: ManagedResource[] = [];

  resources.forEach((resource) => {
    if (resource.priority < preservePriority) {
      candidates.push(resource);
    }
  });

  // Sort based on strategy
  switch (strategy) {
    case "lru":
      candidates.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
      break;
    case "lfu":
      candidates.sort((a, b) => a.accessCount - b.accessCount);
      break;
    case "ttl":
      candidates.sort((a, b) => {
        const aTTL = a.ttl ? a.createdAt + a.ttl : Infinity;
        const bTTL = b.ttl ? b.createdAt + b.ttl : Infinity;
        return aTTL - bTTL;
      });
      break;
    case "size":
      candidates.sort((a, b) => b.size - a.size); // Largest first
      break;
    case "priority":
      candidates.sort((a, b) => a.priority - b.priority);
      break;
  }

  // Select candidates until we reach target
  const selected: string[] = [];
  let freedBytes = 0;

  for (const candidate of candidates) {
    if (freedBytes >= targetBytes) break;
    selected.push(candidate.id);
    freedBytes += candidate.size;
  }

  return selected;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useMobileMemoryOptimizer(
  config: Partial<MemoryOptimizerConfig> = {}
): UseMobileMemoryOptimizerResult {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  const budgetBytes = mergedConfig.budgetMB * 1024 * 1024;

  // Resources map
  const resourcesRef = useRef<Map<string, ManagedResource>>(new Map());

  // Weak refs for large objects (when supported)
  const weakRefsRef = useRef<Map<string, WeakRef<object>>>(new Map());

  // State
  const [state, setState] = useState<MemoryOptimizerState>(() => {
    const memoryEstimate = estimateMemoryUsage();
    return {
      stats: {
        used: 0,
        available: budgetBytes,
        total: budgetBytes,
        pressure: "normal",
        resourceCount: 0,
        cacheSize: 0,
      },
      resources: new Map(),
      pressure: "normal",
      lastCleanup: Date.now(),
      evictionHistory: [],
    };
  });

  // Calculate current usage
  const calculateUsage = useCallback((): MemoryStats => {
    let cacheSize = 0;
    resourcesRef.current.forEach((resource) => {
      cacheSize += resource.size;
    });

    const memoryEstimate = estimateMemoryUsage();
    const usedRatio = cacheSize / budgetBytes;
    const pressure = calculatePressureLevel(usedRatio, mergedConfig.pressureThresholds);

    return {
      used: cacheSize,
      available: Math.max(0, budgetBytes - cacheSize),
      total: budgetBytes,
      pressure,
      resourceCount: resourcesRef.current.size,
      cacheSize,
    };
  }, [budgetBytes, mergedConfig.pressureThresholds]);

  // Update stats
  const updateStats = useCallback(() => {
    const stats = calculateUsage();
    setState((prev) => ({
      ...prev,
      stats,
      pressure: stats.pressure,
      resources: new Map(resourcesRef.current),
    }));
  }, [calculateUsage]);

  // Register resource
  const register = useCallback(
    (
      resource: Omit<ManagedResource, "id" | "createdAt" | "lastAccessedAt" | "accessCount">
    ): string => {
      const id = generateId();
      const now = Date.now();

      const managedResource: ManagedResource = {
        ...resource,
        id,
        createdAt: now,
        lastAccessedAt: now,
        accessCount: 0,
      };

      resourcesRef.current.set(id, managedResource);
      updateStats();

      return id;
    },
    [updateStats]
  );

  // Unregister resource
  const unregister = useCallback(
    (id: string) => {
      const resource = resourcesRef.current.get(id);
      if (resource) {
        // Call disposer if provided
        resource.disposer?.();
        resourcesRef.current.delete(id);
        weakRefsRef.current.delete(id);
        updateStats();
      }
    },
    [updateStats]
  );

  // Access resource (updates LRU/LFU tracking)
  const access = useCallback((id: string) => {
    const resource = resourcesRef.current.get(id);
    if (resource) {
      resource.lastAccessedAt = Date.now();
      resource.accessCount++;
    }
  }, []);

  // Evict resources
  const evict = useCallback(
    (
      strategy: CacheEvictionStrategy = mergedConfig.evictionStrategy,
      targetBytes: number = budgetBytes * 0.2
    ): EvictionResult => {
      const candidates = selectEvictionCandidates(
        resourcesRef.current,
        strategy,
        targetBytes,
        mergedConfig.preservePriority
      );

      let freedBytes = 0;
      const evicted: string[] = [];

      for (const id of candidates) {
        const resource = resourcesRef.current.get(id);
        if (resource) {
          freedBytes += resource.size;
          resource.disposer?.();
          resourcesRef.current.delete(id);
          weakRefsRef.current.delete(id);
          evicted.push(id);
        }
      }

      setState((prev) => ({
        ...prev,
        evictionHistory: [
          ...prev.evictionHistory.slice(-(EVICTION_HISTORY_SIZE - 1)),
          { timestamp: Date.now(), freed: freedBytes, reason: strategy },
        ],
      }));

      updateStats();

      return {
        evicted,
        freedBytes,
        remainingResources: resourcesRef.current.size,
      };
    },
    [mergedConfig.evictionStrategy, mergedConfig.preservePriority, budgetBytes, updateStats]
  );

  // Evict by type
  const evictType = useCallback(
    (type: ResourceType): EvictionResult => {
      let freedBytes = 0;
      const evicted: string[] = [];

      resourcesRef.current.forEach((resource, id) => {
        if (resource.type === type && resource.priority < mergedConfig.preservePriority) {
          freedBytes += resource.size;
          resource.disposer?.();
          resourcesRef.current.delete(id);
          weakRefsRef.current.delete(id);
          evicted.push(id);
        }
      });

      updateStats();

      return {
        evicted,
        freedBytes,
        remainingResources: resourcesRef.current.size,
      };
    },
    [mergedConfig.preservePriority, updateStats]
  );

  // Clear all resources
  const clear = useCallback(() => {
    resourcesRef.current.forEach((resource) => {
      resource.disposer?.();
    });
    resourcesRef.current.clear();
    weakRefsRef.current.clear();
    updateStats();
  }, [updateStats]);

  // Get resource
  const getResource = useCallback((id: string): ManagedResource | undefined => {
    return resourcesRef.current.get(id);
  }, []);

  // Update priority
  const updatePriority = useCallback((id: string, priority: number) => {
    const resource = resourcesRef.current.get(id);
    if (resource) {
      resource.priority = Math.max(0, Math.min(10, priority));
    }
  }, []);

  // Force cleanup
  const forceCleanup = useCallback(() => {
    const now = Date.now();

    // Remove expired TTL resources
    resourcesRef.current.forEach((resource, id) => {
      if (resource.ttl && now - resource.createdAt > resource.ttl) {
        resource.disposer?.();
        resourcesRef.current.delete(id);
      }
    });

    // Remove old resources
    resourcesRef.current.forEach((resource, id) => {
      if (
        now - resource.lastAccessedAt > mergedConfig.maxResourceAge &&
        resource.priority < mergedConfig.preservePriority
      ) {
        resource.disposer?.();
        resourcesRef.current.delete(id);
      }
    });

    setState((prev) => ({ ...prev, lastCleanup: now }));
    updateStats();
  }, [mergedConfig.maxResourceAge, mergedConfig.preservePriority, updateStats]);

  // Get memory usage
  const getMemoryUsage = useCallback((): MemoryStats => {
    return calculateUsage();
  }, [calculateUsage]);

  // Auto cleanup interval
  useEffect(() => {
    if (!mergedConfig.enabled) return;

    const interval = setInterval(() => {
      forceCleanup();

      // Auto evict if under pressure
      if (mergedConfig.autoEvict) {
        const stats = calculateUsage();
        if (stats.pressure === "critical") {
          evict(mergedConfig.evictionStrategy, budgetBytes * 0.3);
        } else if (stats.pressure === "moderate") {
          evict(mergedConfig.evictionStrategy, budgetBytes * 0.1);
        }
      }
    }, mergedConfig.cleanupIntervalMs);

    return () => clearInterval(interval);
  }, [
    mergedConfig.enabled,
    mergedConfig.cleanupIntervalMs,
    mergedConfig.autoEvict,
    mergedConfig.evictionStrategy,
    budgetBytes,
    forceCleanup,
    calculateUsage,
    evict,
  ]);

  // Listen for memory pressure events
  useEffect(() => {
    if (!mergedConfig.enabled) return;

    const handleMemoryPressure = () => {
      evict("lru", budgetBytes * 0.5);
    };

    // Chrome memory pressure (experimental)
    if ("onmemorypressure" in window) {
      window.addEventListener("memorypressure", handleMemoryPressure);
      return () => window.removeEventListener("memorypressure", handleMemoryPressure);
    }
  }, [mergedConfig.enabled, budgetBytes, evict]);

  // Controls
  const controls: MemoryOptimizerControls = useMemo(
    () => ({
      register,
      unregister,
      access,
      evict,
      evictType,
      clear,
      getResource,
      updatePriority,
      forceCleanup,
      getMemoryUsage,
    }),
    [register, unregister, access, evict, evictType, clear, getResource, updatePriority, forceCleanup, getMemoryUsage]
  );

  // Derived values
  const isUnderPressure = state.pressure !== "normal";
  const budgetRemaining = Math.max(0, budgetBytes - state.stats.cacheSize);
  const usagePercent = (state.stats.cacheSize / budgetBytes) * 100;

  return {
    state,
    stats: state.stats,
    controls,
    isUnderPressure,
    budgetRemaining,
    usagePercent,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for tracking image resources
 */
export function useImageMemoryManager(
  config?: Partial<MemoryOptimizerConfig>
): {
  registerImage: (url: string, sizeBytes: number, priority?: number) => string;
  unregisterImage: (id: string) => void;
  usagePercent: number;
} {
  const { controls, usagePercent } = useMobileMemoryOptimizer(config);

  const registerImage = useCallback(
    (url: string, sizeBytes: number, priority: number = 5): string => {
      return controls.register({
        type: "image",
        size: sizeBytes,
        priority,
        metadata: { url },
      });
    },
    [controls]
  );

  const unregisterImage = useCallback(
    (id: string) => {
      controls.unregister(id);
    },
    [controls]
  );

  return { registerImage, unregisterImage, usagePercent };
}

/**
 * Hook for memory pressure alerts
 */
export function useMemoryPressureAlert(
  onPressure?: (level: MemoryPressureLevel) => void,
  config?: Partial<MemoryOptimizerConfig>
): {
  pressure: MemoryPressureLevel;
  isUnderPressure: boolean;
  controls: MemoryOptimizerControls;
} {
  const { state, isUnderPressure, controls } = useMobileMemoryOptimizer(config);
  const prevPressureRef = useRef<MemoryPressureLevel>("normal");

  useEffect(() => {
    if (state.pressure !== prevPressureRef.current) {
      onPressure?.(state.pressure);
      prevPressureRef.current = state.pressure;
    }
  }, [state.pressure, onPressure]);

  return { pressure: state.pressure, isUnderPressure, controls };
}

export default useMobileMemoryOptimizer;
