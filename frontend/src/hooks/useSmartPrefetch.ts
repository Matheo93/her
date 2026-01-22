"use client";

/**
 * useSmartPrefetch - Intelligent Asset and Data Preloading
 *
 * Provides smart prefetching of assets and data based on user behavior,
 * network conditions, and device capabilities.
 *
 * Sprint 510: Avatar UX and mobile latency improvements
 *
 * Key features:
 * - Predictive prefetching based on user behavior
 * - Network-aware prefetch scheduling
 * - Priority-based resource loading
 * - Memory pressure awareness
 * - Intersection observer for viewport-based prefetching
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMobileDetect } from "./useMobileDetect";
import { useNetworkStatus } from "./useNetworkStatus";
import { useDeviceCapabilities } from "./useDeviceCapabilities";
import { useVisibility } from "./useVisibility";

// Resource types for prefetching
type ResourceType = "image" | "audio" | "video" | "script" | "style" | "font" | "data" | "document";

// Prefetch priority
type PrefetchPriority = "critical" | "high" | "medium" | "low" | "idle";

// Prefetch status
type PrefetchStatus = "pending" | "loading" | "loaded" | "failed" | "cancelled";

interface PrefetchResource {
  id: string;
  url: string;
  type: ResourceType;
  priority: PrefetchPriority;
  status: PrefetchStatus;
  size: number | null;
  loadedAt: number | null;
  error: string | null;
}

interface PrefetchMetrics {
  // Total resources tracked
  totalResources: number;

  // Resources by status
  pending: number;
  loading: number;
  loaded: number;
  failed: number;
  cancelled: number;

  // Total bytes loaded
  bytesLoaded: number;

  // Cache hit rate (if tracking)
  cacheHitRate: number;

  // Average load time (ms)
  averageLoadTime: number;

  // Prefetch efficiency (loaded / total)
  efficiency: number;
}

interface PrefetchConfig {
  // Maximum concurrent prefetches
  maxConcurrent: number;

  // Maximum queue size
  maxQueueSize: number;

  // Enable on slow connections
  enableOnSlowConnection: boolean;

  // Enable when battery is low
  enableOnLowBattery: boolean;

  // Minimum interval between prefetches (ms)
  minInterval: number;

  // Timeout for prefetch requests (ms)
  timeout: number;

  // Enable viewport-based prefetching
  enableViewportPrefetch: boolean;

  // Viewport prefetch margin (px)
  viewportMargin: number;

  // Enable idle-time prefetching
  enableIdlePrefetch: boolean;

  // Prefetch during idle callback
  useIdleCallback: boolean;
}

interface PrefetchControls {
  // Add resource to prefetch queue
  prefetch: (url: string, options?: {
    type?: ResourceType;
    priority?: PrefetchPriority;
    onLoad?: () => void;
    onError?: (error: string) => void;
  }) => string;

  // Prefetch multiple resources
  prefetchAll: (resources: Array<{
    url: string;
    type?: ResourceType;
    priority?: PrefetchPriority;
  }>) => string[];

  // Cancel a prefetch
  cancel: (id: string) => boolean;

  // Cancel all prefetches
  cancelAll: () => void;

  // Get resource status
  getStatus: (id: string) => PrefetchStatus | null;

  // Check if resource is loaded
  isLoaded: (urlOrId: string) => boolean;

  // Pause prefetching
  pause: () => void;

  // Resume prefetching
  resume: () => void;

  // Clear loaded resources from tracking
  clearLoaded: () => void;

  // Register element for viewport prefetching
  observeElement: (element: HTMLElement, resources: string[]) => () => void;
}

interface UseSmartPrefetchResult {
  // Whether prefetching is active
  isActive: boolean;

  // Whether prefetching is paused
  isPaused: boolean;

  // Current loading count
  loadingCount: number;

  // Metrics
  metrics: PrefetchMetrics;

  // Configuration
  config: PrefetchConfig;

  // Controls
  controls: PrefetchControls;
}

interface UseSmartPrefetchOptions {
  // Custom configuration
  config?: Partial<PrefetchConfig>;

  // Auto-start prefetching
  autoStart?: boolean;

  // Callback when all critical resources are loaded
  onCriticalLoaded?: () => void;

  // Callback on prefetch complete
  onComplete?: (id: string, success: boolean) => void;
}

const DEFAULT_CONFIG: PrefetchConfig = {
  maxConcurrent: 4,
  maxQueueSize: 50,
  enableOnSlowConnection: false,
  enableOnLowBattery: false,
  minInterval: 100,
  timeout: 30000,
  enableViewportPrefetch: true,
  viewportMargin: 200,
  enableIdlePrefetch: true,
  useIdleCallback: true,
};

// Priority weights for sorting
const PRIORITY_WEIGHTS: Record<PrefetchPriority, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  idle: 1,
};

function generateId(): string {
  return `prefetch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useSmartPrefetch(
  options: UseSmartPrefetchOptions = {}
): UseSmartPrefetchResult {
  const {
    config: userConfig,
    autoStart = true,
    onCriticalLoaded,
    onComplete,
  } = options;

  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...userConfig }), [userConfig]);

  // Core hooks
  const { isMobile } = useMobileDetect();
  const { isOnline, isSlowConnection, saveData } = useNetworkStatus();
  const deviceCapabilities = useDeviceCapabilities();
  const visibility = useVisibility();

  // State
  const [resources, setResources] = useState<Map<string, PrefetchResource>>(new Map());
  const [isPaused, setIsPaused] = useState(!autoStart);
  const [loadTimes, setLoadTimes] = useState<number[]>([]);

  // Refs
  const loadingCountRef = useRef(0);
  const lastPrefetchRef = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const idleCallbackRef = useRef<number | null>(null);
  const queueRef = useRef<string[]>([]);
  const urlToIdRef = useRef<Map<string, string>>(new Map());
  const callbacksRef = useRef<Map<string, { onLoad?: () => void; onError?: (error: string) => void }>>(new Map());

  // Check if prefetching should be active
  const isActive = useMemo(() => {
    if (isPaused) return false;
    if (!isOnline) return false;
    if (!visibility.isVisible) return false;
    if (saveData) return false;
    if (isSlowConnection && !config.enableOnSlowConnection) return false;
    if (deviceCapabilities.battery.isLowBattery && !config.enableOnLowBattery) return false;
    return true;
  }, [
    isPaused,
    isOnline,
    visibility.isVisible,
    saveData,
    isSlowConnection,
    config.enableOnSlowConnection,
    deviceCapabilities.battery.isLowBattery,
    config.enableOnLowBattery,
  ]);

  // Calculate metrics
  const metrics = useMemo((): PrefetchMetrics => {
    const resourceArray = Array.from(resources.values());

    const pending = resourceArray.filter((r) => r.status === "pending").length;
    const loading = resourceArray.filter((r) => r.status === "loading").length;
    const loaded = resourceArray.filter((r) => r.status === "loaded").length;
    const failed = resourceArray.filter((r) => r.status === "failed").length;
    const cancelled = resourceArray.filter((r) => r.status === "cancelled").length;

    const bytesLoaded = resourceArray
      .filter((r) => r.status === "loaded" && r.size)
      .reduce((sum, r) => sum + (r.size || 0), 0);

    const averageLoadTime = loadTimes.length > 0
      ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length
      : 0;

    const total = resourceArray.length;
    const efficiency = total > 0 ? loaded / total : 0;

    return {
      totalResources: total,
      pending,
      loading,
      loaded,
      failed,
      cancelled,
      bytesLoaded,
      cacheHitRate: 0, // Would need cache API integration
      averageLoadTime,
      efficiency,
    };
  }, [resources, loadTimes]);

  // Process queue
  const processQueue = useCallback(() => {
    if (!isActive) return;
    if (loadingCountRef.current >= config.maxConcurrent) return;
    if (queueRef.current.length === 0) return;

    const now = Date.now();
    if (now - lastPrefetchRef.current < config.minInterval) {
      setTimeout(processQueue, config.minInterval);
      return;
    }

    // Get next item by priority
    const sortedQueue = [...queueRef.current].sort((idA, idB) => {
      const resourceA = resources.get(idA);
      const resourceB = resources.get(idB);
      if (!resourceA || !resourceB) return 0;
      return PRIORITY_WEIGHTS[resourceB.priority] - PRIORITY_WEIGHTS[resourceA.priority];
    });

    const nextId = sortedQueue[0];
    if (!nextId) return;

    const resource = resources.get(nextId);
    if (!resource || resource.status !== "pending") {
      queueRef.current = queueRef.current.filter((id) => id !== nextId);
      processQueue();
      return;
    }

    // Start loading
    loadingCountRef.current++;
    lastPrefetchRef.current = now;
    queueRef.current = queueRef.current.filter((id) => id !== nextId);

    setResources((prev) => {
      const newMap = new Map(prev);
      newMap.set(nextId, { ...resource, status: "loading" });
      return newMap;
    });

    const loadStartTime = performance.now();

    // Load the resource
    loadResource(resource.url, resource.type, config.timeout)
      .then((size) => {
        const loadTime = performance.now() - loadStartTime;
        setLoadTimes((prev) => [...prev.slice(-19), loadTime]);

        setResources((prev) => {
          const newMap = new Map(prev);
          newMap.set(nextId, {
            ...resource,
            status: "loaded",
            size,
            loadedAt: Date.now(),
          });
          return newMap;
        });

        callbacksRef.current.get(nextId)?.onLoad?.();
        onComplete?.(nextId, true);
      })
      .catch((error) => {
        setResources((prev) => {
          const newMap = new Map(prev);
          newMap.set(nextId, {
            ...resource,
            status: "failed",
            error: error.message,
          });
          return newMap;
        });

        callbacksRef.current.get(nextId)?.onError?.(error.message);
        onComplete?.(nextId, false);
      })
      .finally(() => {
        loadingCountRef.current--;
        callbacksRef.current.delete(nextId);
        processQueue();
      });
  }, [isActive, config.maxConcurrent, config.minInterval, config.timeout, resources, onComplete]);

  // Load a resource
  const loadResource = useCallback(
    async (url: string, type: ResourceType, timeout: number): Promise<number> => {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("Timeout"));
        }, timeout);

        switch (type) {
          case "image": {
            const img = new Image();
            img.onload = () => {
              clearTimeout(timeoutId);
              resolve(0); // Size unknown for images
            };
            img.onerror = () => {
              clearTimeout(timeoutId);
              reject(new Error("Failed to load image"));
            };
            img.src = url;
            break;
          }

          case "audio":
          case "video": {
            const media = document.createElement(type);
            media.preload = "auto";
            media.onloadeddata = () => {
              clearTimeout(timeoutId);
              resolve(0);
            };
            media.onerror = () => {
              clearTimeout(timeoutId);
              reject(new Error(`Failed to load ${type}`));
            };
            media.src = url;
            break;
          }

          case "script": {
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.as = "script";
            link.href = url;
            link.onload = () => {
              clearTimeout(timeoutId);
              resolve(0);
            };
            link.onerror = () => {
              clearTimeout(timeoutId);
              reject(new Error("Failed to prefetch script"));
            };
            document.head.appendChild(link);
            break;
          }

          case "style": {
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.as = "style";
            link.href = url;
            link.onload = () => {
              clearTimeout(timeoutId);
              resolve(0);
            };
            link.onerror = () => {
              clearTimeout(timeoutId);
              reject(new Error("Failed to prefetch style"));
            };
            document.head.appendChild(link);
            break;
          }

          case "font": {
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.as = "font";
            link.href = url;
            link.crossOrigin = "anonymous";
            link.onload = () => {
              clearTimeout(timeoutId);
              resolve(0);
            };
            link.onerror = () => {
              clearTimeout(timeoutId);
              reject(new Error("Failed to prefetch font"));
            };
            document.head.appendChild(link);
            break;
          }

          case "data":
          case "document":
          default: {
            fetch(url, { method: "GET", cache: "force-cache" })
              .then((response) => {
                clearTimeout(timeoutId);
                if (response.ok) {
                  const contentLength = response.headers.get("content-length");
                  resolve(contentLength ? parseInt(contentLength, 10) : 0);
                } else {
                  reject(new Error(`HTTP ${response.status}`));
                }
              })
              .catch((error) => {
                clearTimeout(timeoutId);
                reject(error);
              });
            break;
          }
        }
      });
    },
    []
  );

  // Prefetch a resource
  const prefetch = useCallback(
    (
      url: string,
      prefetchOptions?: {
        type?: ResourceType;
        priority?: PrefetchPriority;
        onLoad?: () => void;
        onError?: (error: string) => void;
      }
    ): string => {
      // Check if already tracked
      const existingId = urlToIdRef.current.get(url);
      if (existingId) {
        return existingId;
      }

      // Check queue size
      if (resources.size >= config.maxQueueSize) {
        // Remove oldest low-priority pending resource
        const pending = Array.from(resources.entries())
          .filter(([, r]) => r.status === "pending")
          .sort((a, b) => PRIORITY_WEIGHTS[a[1].priority] - PRIORITY_WEIGHTS[b[1].priority]);

        if (pending.length > 0) {
          const [removeId] = pending[0];
          setResources((prev) => {
            const newMap = new Map(prev);
            newMap.delete(removeId);
            return newMap;
          });
          urlToIdRef.current.delete(resources.get(removeId)?.url || "");
        }
      }

      const id = generateId();
      const resource: PrefetchResource = {
        id,
        url,
        type: prefetchOptions?.type || "data",
        priority: prefetchOptions?.priority || "medium",
        status: "pending",
        size: null,
        loadedAt: null,
        error: null,
      };

      urlToIdRef.current.set(url, id);

      if (prefetchOptions?.onLoad || prefetchOptions?.onError) {
        callbacksRef.current.set(id, {
          onLoad: prefetchOptions.onLoad,
          onError: prefetchOptions.onError,
        });
      }

      setResources((prev) => {
        const newMap = new Map(prev);
        newMap.set(id, resource);
        return newMap;
      });

      queueRef.current.push(id);

      // Schedule processing
      if (config.useIdleCallback && "requestIdleCallback" in window) {
        if (idleCallbackRef.current) {
          cancelIdleCallback(idleCallbackRef.current);
        }
        idleCallbackRef.current = requestIdleCallback(() => processQueue());
      } else {
        setTimeout(processQueue, 0);
      }

      return id;
    },
    [resources.size, config.maxQueueSize, config.useIdleCallback, processQueue]
  );

  // Prefetch multiple resources
  const prefetchAll = useCallback(
    (
      resourceList: Array<{
        url: string;
        type?: ResourceType;
        priority?: PrefetchPriority;
      }>
    ): string[] => {
      return resourceList.map((r) =>
        prefetch(r.url, { type: r.type, priority: r.priority })
      );
    },
    [prefetch]
  );

  // Cancel a prefetch
  const cancel = useCallback((id: string): boolean => {
    const resource = resources.get(id);
    if (!resource || resource.status === "loaded" || resource.status === "failed") {
      return false;
    }

    setResources((prev) => {
      const newMap = new Map(prev);
      newMap.set(id, { ...resource, status: "cancelled" });
      return newMap;
    });

    queueRef.current = queueRef.current.filter((qId) => qId !== id);
    return true;
  }, [resources]);

  // Cancel all
  const cancelAll = useCallback(() => {
    setResources((prev) => {
      const newMap = new Map(prev);
      for (const [id, resource] of newMap) {
        if (resource.status === "pending" || resource.status === "loading") {
          newMap.set(id, { ...resource, status: "cancelled" });
        }
      }
      return newMap;
    });
    queueRef.current = [];
  }, []);

  // Get status
  const getStatus = useCallback(
    (id: string): PrefetchStatus | null => {
      return resources.get(id)?.status || null;
    },
    [resources]
  );

  // Check if loaded
  const isLoaded = useCallback(
    (urlOrId: string): boolean => {
      const id = urlToIdRef.current.get(urlOrId) || urlOrId;
      return resources.get(id)?.status === "loaded";
    },
    [resources]
  );

  // Pause
  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  // Resume
  const resume = useCallback(() => {
    setIsPaused(false);
    processQueue();
  }, [processQueue]);

  // Clear loaded
  const clearLoaded = useCallback(() => {
    setResources((prev) => {
      const newMap = new Map(prev);
      for (const [id, resource] of newMap) {
        if (resource.status === "loaded") {
          urlToIdRef.current.delete(resource.url);
          newMap.delete(id);
        }
      }
      return newMap;
    });
  }, []);

  // Observe element for viewport prefetching
  const observeElement = useCallback(
    (element: HTMLElement, resourceUrls: string[]): (() => void) => {
      if (!config.enableViewportPrefetch) {
        return () => {};
      }

      // Create observer if not exists
      if (!observerRef.current) {
        observerRef.current = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const urls = (entry.target as HTMLElement).dataset.prefetchUrls;
                if (urls) {
                  JSON.parse(urls).forEach((url: string) => {
                    prefetch(url, { priority: "low" });
                  });
                }
              }
            });
          },
          { rootMargin: `${config.viewportMargin}px` }
        );
      }

      // Store URLs on element
      element.dataset.prefetchUrls = JSON.stringify(resourceUrls);
      observerRef.current.observe(element);

      return () => {
        observerRef.current?.unobserve(element);
        delete element.dataset.prefetchUrls;
      };
    },
    [config.enableViewportPrefetch, config.viewportMargin, prefetch]
  );

  // Check for critical resources loaded
  useEffect(() => {
    const criticalResources = Array.from(resources.values()).filter(
      (r) => r.priority === "critical"
    );

    if (criticalResources.length > 0) {
      const allLoaded = criticalResources.every((r) => r.status === "loaded");
      if (allLoaded) {
        onCriticalLoaded?.();
      }
    }
  }, [resources, onCriticalLoaded]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (idleCallbackRef.current) {
        cancelIdleCallback(idleCallbackRef.current);
      }
    };
  }, []);

  const controls = useMemo(
    (): PrefetchControls => ({
      prefetch,
      prefetchAll,
      cancel,
      cancelAll,
      getStatus,
      isLoaded,
      pause,
      resume,
      clearLoaded,
      observeElement,
    }),
    [prefetch, prefetchAll, cancel, cancelAll, getStatus, isLoaded, pause, resume, clearLoaded, observeElement]
  );

  return {
    isActive,
    isPaused,
    loadingCount: loadingCountRef.current,
    metrics,
    config,
    controls,
  };
}

/**
 * Hook for prefetching images
 */
export function useImagePrefetch(): (urls: string[]) => void {
  const { controls } = useSmartPrefetch();

  return useCallback(
    (urls: string[]) => {
      urls.forEach((url) => controls.prefetch(url, { type: "image", priority: "medium" }));
    },
    [controls]
  );
}

/**
 * Hook for prefetching audio
 */
export function useAudioPrefetch(): (urls: string[]) => void {
  const { controls } = useSmartPrefetch();

  return useCallback(
    (urls: string[]) => {
      urls.forEach((url) => controls.prefetch(url, { type: "audio", priority: "high" }));
    },
    [controls]
  );
}

/**
 * Hook for critical resource prefetching
 */
export function useCriticalPrefetch(
  urls: string[],
  onReady?: () => void
): boolean {
  const { controls, metrics } = useSmartPrefetch({ onCriticalLoaded: onReady });
  const prefetchedRef = useRef(false);

  useEffect(() => {
    if (!prefetchedRef.current && urls.length > 0) {
      urls.forEach((url) => controls.prefetch(url, { priority: "critical" }));
      prefetchedRef.current = true;
    }
  }, [urls, controls]);

  const criticalLoaded = useMemo(() => {
    // All critical should be loaded
    return metrics.pending === 0 && metrics.loading === 0;
  }, [metrics.pending, metrics.loading]);

  return criticalLoaded;
}

// Export types
export type {
  ResourceType,
  PrefetchPriority,
  PrefetchStatus,
  PrefetchResource,
  PrefetchMetrics,
  PrefetchConfig,
  PrefetchControls,
  UseSmartPrefetchResult,
  UseSmartPrefetchOptions,
};
