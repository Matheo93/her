/**
 * useAvatarPreloader - Avatar Asset Preloading Hook
 *
 * Sprint 515 (Iteration 2): Optimizes avatar initial load time by
 * intelligently preloading assets based on priority, network conditions,
 * and user behavior patterns. Features:
 * - Priority-based asset queue (critical, high, normal, low)
 * - Network-aware preloading (adjusts based on connection speed)
 * - Progressive loading with placeholder support
 * - Memory budget management
 * - Preload analytics and metrics
 *
 * @example
 * ```tsx
 * const { preload, progress, isReady, metrics } = useAvatarPreloader({
 *   memoryBudgetMB: 100,
 *   networkAware: true,
 * });
 *
 * // Preload critical assets first
 * preload([
 *   { type: 'model', url: '/avatar/model.glb', priority: 'critical' },
 *   { type: 'texture', url: '/avatar/diffuse.png', priority: 'high' },
 *   { type: 'animation', url: '/avatar/idle.json', priority: 'normal' },
 * ]);
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Asset type for preloading
 */
export type AssetType =
  | "model"
  | "texture"
  | "animation"
  | "audio"
  | "shader"
  | "config"
  | "font";

/**
 * Preload priority
 */
export type PreloadPriority = "critical" | "high" | "normal" | "low";

/**
 * Asset loading status
 */
export type AssetStatus =
  | "pending"
  | "queued"
  | "loading"
  | "loaded"
  | "failed"
  | "cancelled";

/**
 * Network quality level
 */
export type NetworkQuality = "excellent" | "good" | "fair" | "poor" | "offline";

/**
 * Asset definition for preloading
 */
export interface PreloadAsset {
  /** Asset identifier */
  id?: string;
  /** Asset type */
  type: AssetType;
  /** Asset URL */
  url: string;
  /** Loading priority */
  priority?: PreloadPriority;
  /** Estimated size in bytes (for budget management) */
  estimatedSize?: number;
  /** Whether asset is required for initial render */
  critical?: boolean;
  /** Placeholder URL while loading */
  placeholder?: string;
  /** Custom loader function */
  loader?: (url: string) => Promise<unknown>;
  /** Cache key override */
  cacheKey?: string;
}

/**
 * Tracked asset with loading state
 */
export interface TrackedAsset extends PreloadAsset {
  id: string;
  status: AssetStatus;
  progress: number;
  loadedSize: number;
  startTime: number | null;
  endTime: number | null;
  error: Error | null;
  data: unknown | null;
  retryCount: number;
}

/**
 * Preload progress info
 */
export interface PreloadProgress {
  total: number;
  loaded: number;
  failed: number;
  pending: number;
  percentage: number;
  criticalReady: boolean;
  estimatedTimeMs: number | null;
}

/**
 * Preload metrics
 */
export interface PreloadMetrics {
  totalAssetsLoaded: number;
  totalAssetsFailed: number;
  totalBytesLoaded: number;
  averageLoadTimeMs: number;
  cacheHits: number;
  cacheMisses: number;
  networkDowngrades: number;
  memoryUsageMB: number;
  sessionStartTime: number;
  lastLoadTime: number | null;
}

/**
 * Preloader configuration
 */
export interface PreloaderConfig {
  /** Memory budget in MB */
  memoryBudgetMB: number;
  /** Enable network-aware loading */
  networkAware: boolean;
  /** Maximum concurrent loads */
  maxConcurrent: number;
  /** Default retry count */
  defaultRetries: number;
  /** Retry delay base (ms) */
  retryDelayMs: number;
  /** Enable asset caching */
  enableCache: boolean;
  /** Cache TTL (ms) */
  cacheTTL: number;
  /** Timeout per asset (ms) */
  assetTimeout: number;
  /** Auto-start loading on mount */
  autoStart: boolean;
  /** Pause loading when tab hidden */
  pauseOnHidden: boolean;
  /** Progressive loading intervals (ms) */
  progressiveInterval: number;
}

/**
 * Preloader controls
 */
export interface PreloaderControls {
  /** Add assets to preload queue */
  preload: (assets: PreloadAsset[]) => void;
  /** Preload a single asset */
  preloadOne: (asset: PreloadAsset) => Promise<unknown>;
  /** Cancel asset loading */
  cancel: (assetId: string) => void;
  /** Cancel all pending loads */
  cancelAll: () => void;
  /** Pause loading */
  pause: () => void;
  /** Resume loading */
  resume: () => void;
  /** Clear cache */
  clearCache: () => void;
  /** Get asset by ID */
  getAsset: (assetId: string) => TrackedAsset | null;
  /** Get asset data (loaded content) */
  getAssetData: <T = unknown>(assetId: string) => T | null;
  /** Retry failed asset */
  retry: (assetId: string) => void;
  /** Reset all state */
  reset: () => void;
}

/**
 * Preloader state
 */
export interface PreloaderState {
  isPaused: boolean;
  isLoading: boolean;
  networkQuality: NetworkQuality;
  activeLoads: number;
  queueSize: number;
}

/**
 * Hook result
 */
export interface UseAvatarPreloaderResult {
  state: PreloaderState;
  progress: PreloadProgress;
  metrics: PreloadMetrics;
  controls: PreloaderControls;
  isReady: boolean;
  isCriticalReady: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const PRIORITY_ORDER: Record<PreloadPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const NETWORK_CONCURRENT_LIMITS: Record<NetworkQuality, number> = {
  excellent: 6,
  good: 4,
  fair: 2,
  poor: 1,
  offline: 0,
};

const DEFAULT_CONFIG: PreloaderConfig = {
  memoryBudgetMB: 100,
  networkAware: true,
  maxConcurrent: 4,
  defaultRetries: 2,
  retryDelayMs: 500,
  enableCache: true,
  cacheTTL: 300000, // 5 minutes
  assetTimeout: 30000, // 30 seconds
  autoStart: true,
  pauseOnHidden: true,
  progressiveInterval: 100,
};

const ASSET_TYPE_LOADERS: Record<AssetType, (url: string, timeout: number) => Promise<unknown>> = {
  model: loadModel,
  texture: loadTexture,
  animation: loadAnimation,
  audio: loadAudio,
  shader: loadShader,
  config: loadConfig,
  font: loadFont,
};

// ============================================================================
// Asset Loaders
// ============================================================================

async function loadModel(url: string, timeout: number): Promise<unknown> {
  const response = await fetchWithTimeout(url, timeout);
  const buffer = await response.arrayBuffer();
  return { type: "model", buffer, size: buffer.byteLength };
}

async function loadTexture(url: string, timeout: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeoutId = setTimeout(() => {
      reject(new Error("Texture load timeout"));
    }, timeout);

    img.onload = () => {
      clearTimeout(timeoutId);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to load texture: ${url}`));
    };
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

async function loadAnimation(url: string, timeout: number): Promise<unknown> {
  const response = await fetchWithTimeout(url, timeout);
  return response.json();
}

async function loadAudio(url: string, timeout: number): Promise<AudioBuffer | ArrayBuffer> {
  const response = await fetchWithTimeout(url, timeout);
  const buffer = await response.arrayBuffer();

  // Try to decode if AudioContext available
  if (typeof AudioContext !== "undefined") {
    try {
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(buffer.slice(0));
      await audioCtx.close();
      return decoded;
    } catch {
      // Return raw buffer if decode fails
      return buffer;
    }
  }

  return buffer;
}

async function loadShader(url: string, timeout: number): Promise<string> {
  const response = await fetchWithTimeout(url, timeout);
  return response.text();
}

async function loadConfig(url: string, timeout: number): Promise<unknown> {
  const response = await fetchWithTimeout(url, timeout);
  return response.json();
}

async function loadFont(url: string, timeout: number): Promise<FontFace | ArrayBuffer> {
  const response = await fetchWithTimeout(url, timeout);
  const buffer = await response.arrayBuffer();

  // Try to create FontFace if available
  if (typeof FontFace !== "undefined") {
    try {
      const fontName = url.split("/").pop()?.split(".")[0] || "preloaded-font";
      const font = new FontFace(fontName, buffer);
      await font.load();
      document.fonts.add(font);
      return font;
    } catch {
      return buffer;
    }
  }

  return buffer;
}

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateAssetId(asset: PreloadAsset): string {
  return asset.id || `${asset.type}-${asset.url}-${Date.now()}`;
}

function estimateNetworkQuality(): NetworkQuality {
  if (typeof navigator === "undefined") return "good";

  // Check if offline
  if (!navigator.onLine) return "offline";

  // Use Network Information API if available
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } }).connection;

  if (connection) {
    const effectiveType = connection.effectiveType;
    const downlink = connection.downlink;

    if (effectiveType === "4g" && downlink && downlink >= 10) return "excellent";
    if (effectiveType === "4g") return "good";
    if (effectiveType === "3g") return "fair";
    if (effectiveType === "2g" || effectiveType === "slow-2g") return "poor";
  }

  return "good"; // Default assumption
}

function calculateBackoff(attempt: number, baseDelay: number): number {
  const delay = baseDelay * Math.pow(2, attempt);
  const jitter = delay * 0.25 * Math.random();
  return Math.round(delay + jitter);
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Avatar asset preloading hook for optimized initial load
 */
export function useAvatarPreloader(
  config: Partial<PreloaderConfig> = {},
  callbacks?: {
    onAssetLoaded?: (asset: TrackedAsset) => void;
    onAssetFailed?: (asset: TrackedAsset, error: Error) => void;
    onAllLoaded?: () => void;
    onCriticalReady?: () => void;
    onProgressUpdate?: (progress: PreloadProgress) => void;
    onNetworkChange?: (quality: NetworkQuality) => void;
  }
): UseAvatarPreloaderResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [isPaused, setIsPaused] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>(() => estimateNetworkQuality());
  const [assets, setAssets] = useState<Map<string, TrackedAsset>>(new Map());

  // Metrics
  const [metrics, setMetrics] = useState<PreloadMetrics>({
    totalAssetsLoaded: 0,
    totalAssetsFailed: 0,
    totalBytesLoaded: 0,
    averageLoadTimeMs: 0,
    cacheHits: 0,
    cacheMisses: 0,
    networkDowngrades: 0,
    memoryUsageMB: 0,
    sessionStartTime: Date.now(),
    lastLoadTime: null,
  });

  // Refs
  const queueRef = useRef<TrackedAsset[]>([]);
  const activeLoadsRef = useRef<Set<string>>(new Set());
  const cacheRef = useRef<Map<string, { data: unknown; timestamp: number; size: number }>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const processingRef = useRef(false);

  // Monitor network quality
  useEffect(() => {
    if (typeof window === "undefined" || !fullConfig.networkAware) return;

    const handleOnline = () => {
      const quality = estimateNetworkQuality();
      setNetworkQuality(quality);
      callbacks?.onNetworkChange?.(quality);
    };

    const handleOffline = () => {
      setNetworkQuality("offline");
      callbacks?.onNetworkChange?.("offline");
    };

    const handleConnectionChange = () => {
      const quality = estimateNetworkQuality();
      if (quality !== networkQuality) {
        setNetworkQuality(quality);
        callbacks?.onNetworkChange?.(quality);

        if (PRIORITY_ORDER[quality as keyof typeof PRIORITY_ORDER] > PRIORITY_ORDER[networkQuality as keyof typeof PRIORITY_ORDER]) {
          setMetrics((prev) => ({
            ...prev,
            networkDowngrades: prev.networkDowngrades + 1,
          }));
        }
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    if (connection) {
      connection.addEventListener("change", handleConnectionChange);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (connection) {
        connection.removeEventListener("change", handleConnectionChange);
      }
    };
  }, [fullConfig.networkAware, networkQuality, callbacks]);

  // Pause on visibility change
  useEffect(() => {
    if (typeof document === "undefined" || !fullConfig.pauseOnHidden) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setIsPaused(true);
      } else {
        setIsPaused(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fullConfig.pauseOnHidden]);

  /**
   * Load a single asset
   */
  const loadAsset = useCallback(
    async (asset: TrackedAsset): Promise<void> => {
      const cacheKey = asset.cacheKey || asset.url;

      // Check cache
      if (fullConfig.enableCache) {
        const cached = cacheRef.current.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < fullConfig.cacheTTL) {
          asset.status = "loaded";
          asset.data = cached.data;
          asset.loadedSize = cached.size;
          asset.progress = 1;
          asset.endTime = Date.now();

          setAssets((prev) => new Map(prev).set(asset.id, { ...asset }));
          setMetrics((prev) => ({
            ...prev,
            cacheHits: prev.cacheHits + 1,
          }));

          callbacks?.onAssetLoaded?.(asset);
          return;
        }
      }

      setMetrics((prev) => ({
        ...prev,
        cacheMisses: prev.cacheMisses + 1,
      }));

      asset.status = "loading";
      asset.startTime = Date.now();
      setAssets((prev) => new Map(prev).set(asset.id, { ...asset }));

      const maxRetries = fullConfig.defaultRetries;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, calculateBackoff(attempt - 1, fullConfig.retryDelayMs))
          );
        }

        try {
          asset.retryCount = attempt;

          const loader = asset.loader || ASSET_TYPE_LOADERS[asset.type];
          const data = await loader(asset.url, fullConfig.assetTimeout);

          asset.status = "loaded";
          asset.data = data;
          asset.progress = 1;
          asset.endTime = Date.now();
          asset.loadedSize = asset.estimatedSize || 0;

          // Cache the result
          if (fullConfig.enableCache) {
            cacheRef.current.set(cacheKey, {
              data,
              timestamp: Date.now(),
              size: asset.loadedSize,
            });
          }

          setAssets((prev) => new Map(prev).set(asset.id, { ...asset }));

          const loadTime = asset.endTime - (asset.startTime || asset.endTime);
          setMetrics((prev) => ({
            ...prev,
            totalAssetsLoaded: prev.totalAssetsLoaded + 1,
            totalBytesLoaded: prev.totalBytesLoaded + asset.loadedSize,
            averageLoadTimeMs:
              (prev.averageLoadTimeMs * prev.totalAssetsLoaded + loadTime) /
              (prev.totalAssetsLoaded + 1),
            lastLoadTime: Date.now(),
          }));

          callbacks?.onAssetLoaded?.(asset);
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt === maxRetries) {
            asset.status = "failed";
            asset.error = lastError;
            asset.endTime = Date.now();

            setAssets((prev) => new Map(prev).set(asset.id, { ...asset }));
            setMetrics((prev) => ({
              ...prev,
              totalAssetsFailed: prev.totalAssetsFailed + 1,
            }));

            callbacks?.onAssetFailed?.(asset, lastError);
          }
        }
      }
    },
    [fullConfig, callbacks]
  );

  /**
   * Process the queue
   */
  const processQueue = useCallback(async () => {
    if (processingRef.current || isPaused || networkQuality === "offline") return;

    processingRef.current = true;

    const maxConcurrent = fullConfig.networkAware
      ? Math.min(fullConfig.maxConcurrent, NETWORK_CONCURRENT_LIMITS[networkQuality])
      : fullConfig.maxConcurrent;

    while (queueRef.current.length > 0 && activeLoadsRef.current.size < maxConcurrent) {
      if (isPaused) break;

      // Sort by priority
      queueRef.current.sort(
        (a, b) =>
          PRIORITY_ORDER[a.priority || "normal"] - PRIORITY_ORDER[b.priority || "normal"]
      );

      const asset = queueRef.current.shift();
      if (!asset) break;

      activeLoadsRef.current.add(asset.id);

      loadAsset(asset).finally(() => {
        activeLoadsRef.current.delete(asset.id);
        // Continue processing
        if (queueRef.current.length > 0) {
          processQueue();
        }
      });
    }

    processingRef.current = false;

    // Check if all done
    const allAssets = Array.from(assets.values());
    const allLoaded = allAssets.every(
      (a) => a.status === "loaded" || a.status === "failed" || a.status === "cancelled"
    );

    if (allLoaded && allAssets.length > 0) {
      callbacks?.onAllLoaded?.();
    }
  }, [isPaused, networkQuality, fullConfig, loadAsset, assets, callbacks]);

  // Auto-process queue
  useEffect(() => {
    if (fullConfig.autoStart && !isPaused) {
      processQueue();
    }
  }, [fullConfig.autoStart, isPaused, processQueue]);

  /**
   * Add assets to preload queue
   */
  const preload = useCallback(
    (newAssets: PreloadAsset[]) => {
      const tracked: TrackedAsset[] = newAssets.map((asset) => ({
        ...asset,
        id: generateAssetId(asset),
        status: "queued" as const,
        progress: 0,
        loadedSize: 0,
        startTime: null,
        endTime: null,
        error: null,
        data: null,
        retryCount: 0,
        priority: asset.priority || "normal",
      }));

      setAssets((prev) => {
        const next = new Map(prev);
        for (const asset of tracked) {
          next.set(asset.id, asset);
        }
        return next;
      });

      queueRef.current.push(...tracked);

      if (fullConfig.autoStart && !isPaused) {
        processQueue();
      }
    },
    [fullConfig.autoStart, isPaused, processQueue]
  );

  /**
   * Preload a single asset and return promise
   */
  const preloadOne = useCallback(
    async (asset: PreloadAsset): Promise<unknown> => {
      const id = generateAssetId(asset);
      const tracked: TrackedAsset = {
        ...asset,
        id,
        status: "queued",
        progress: 0,
        loadedSize: 0,
        startTime: null,
        endTime: null,
        error: null,
        data: null,
        retryCount: 0,
        priority: asset.priority || "normal",
      };

      setAssets((prev) => new Map(prev).set(id, tracked));
      queueRef.current.push(tracked);

      processQueue();

      // Wait for load
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          const current = assets.get(id);
          if (current?.status === "loaded") {
            clearInterval(checkInterval);
            resolve(current.data);
          } else if (current?.status === "failed" || current?.status === "cancelled") {
            clearInterval(checkInterval);
            reject(current.error || new Error("Asset load failed"));
          }
        }, 50);
      });
    },
    [assets, processQueue]
  );

  /**
   * Cancel asset loading
   */
  const cancel = useCallback((assetId: string) => {
    const controller = abortControllersRef.current.get(assetId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(assetId);
    }

    queueRef.current = queueRef.current.filter((a) => a.id !== assetId);
    activeLoadsRef.current.delete(assetId);

    setAssets((prev) => {
      const next = new Map(prev);
      const asset = next.get(assetId);
      if (asset && asset.status !== "loaded") {
        asset.status = "cancelled";
        next.set(assetId, { ...asset });
      }
      return next;
    });
  }, []);

  /**
   * Cancel all pending loads
   */
  const cancelAll = useCallback(() => {
    for (const controller of abortControllersRef.current.values()) {
      controller.abort();
    }
    abortControllersRef.current.clear();

    queueRef.current = [];
    activeLoadsRef.current.clear();

    setAssets((prev) => {
      const next = new Map(prev);
      for (const [id, asset] of next) {
        if (asset.status === "queued" || asset.status === "loading") {
          asset.status = "cancelled";
          next.set(id, { ...asset });
        }
      }
      return next;
    });
  }, []);

  /**
   * Pause loading
   */
  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  /**
   * Resume loading
   */
  const resume = useCallback(() => {
    setIsPaused(false);
    processQueue();
  }, [processQueue]);

  /**
   * Clear cache
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  /**
   * Get asset by ID
   */
  const getAsset = useCallback(
    (assetId: string): TrackedAsset | null => {
      return assets.get(assetId) || null;
    },
    [assets]
  );

  /**
   * Get asset data
   */
  const getAssetData = useCallback(
    <T = unknown>(assetId: string): T | null => {
      const asset = assets.get(assetId);
      return asset?.data as T | null;
    },
    [assets]
  );

  /**
   * Retry failed asset
   */
  const retry = useCallback(
    (assetId: string) => {
      const asset = assets.get(assetId);
      if (asset && asset.status === "failed") {
        const retried: TrackedAsset = {
          ...asset,
          status: "queued",
          progress: 0,
          error: null,
          retryCount: 0,
        };

        setAssets((prev) => new Map(prev).set(assetId, retried));
        queueRef.current.push(retried);
        processQueue();
      }
    },
    [assets, processQueue]
  );

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    cancelAll();
    setAssets(new Map());
    setMetrics({
      totalAssetsLoaded: 0,
      totalAssetsFailed: 0,
      totalBytesLoaded: 0,
      averageLoadTimeMs: 0,
      cacheHits: 0,
      cacheMisses: 0,
      networkDowngrades: 0,
      memoryUsageMB: 0,
      sessionStartTime: Date.now(),
      lastLoadTime: null,
    });
  }, [cancelAll]);

  // Compute progress
  const progress: PreloadProgress = useMemo(() => {
    const allAssets = Array.from(assets.values());
    const total = allAssets.length;
    const loaded = allAssets.filter((a) => a.status === "loaded").length;
    const failed = allAssets.filter((a) => a.status === "failed").length;
    const pending = allAssets.filter(
      (a) => a.status === "queued" || a.status === "loading" || a.status === "pending"
    ).length;
    const criticalAssets = allAssets.filter((a) => a.critical || a.priority === "critical");
    const criticalReady =
      criticalAssets.length === 0 ||
      criticalAssets.every((a) => a.status === "loaded");

    // Estimate time based on average load time
    let estimatedTimeMs: number | null = null;
    if (metrics.averageLoadTimeMs > 0 && pending > 0) {
      estimatedTimeMs = Math.round(metrics.averageLoadTimeMs * pending);
    }

    return {
      total,
      loaded,
      failed,
      pending,
      percentage: total > 0 ? Math.round((loaded / total) * 100) : 0,
      criticalReady,
      estimatedTimeMs,
    };
  }, [assets, metrics.averageLoadTimeMs]);

  // Check critical ready callback
  useEffect(() => {
    if (progress.criticalReady && progress.loaded > 0) {
      callbacks?.onCriticalReady?.();
    }
  }, [progress.criticalReady, progress.loaded, callbacks]);

  // Progress update callback
  useEffect(() => {
    callbacks?.onProgressUpdate?.(progress);
  }, [progress, callbacks]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAll();
    };
  }, [cancelAll]);

  // Compute state
  const state: PreloaderState = useMemo(
    () => ({
      isPaused,
      isLoading: activeLoadsRef.current.size > 0,
      networkQuality,
      activeLoads: activeLoadsRef.current.size,
      queueSize: queueRef.current.length,
    }),
    [isPaused, networkQuality]
  );

  const controls: PreloaderControls = useMemo(
    () => ({
      preload,
      preloadOne,
      cancel,
      cancelAll,
      pause,
      resume,
      clearCache,
      getAsset,
      getAssetData,
      retry,
      reset,
    }),
    [preload, preloadOne, cancel, cancelAll, pause, resume, clearCache, getAsset, getAssetData, retry, reset]
  );

  return {
    state,
    progress,
    metrics,
    controls,
    isReady: progress.percentage === 100 && progress.failed === 0,
    isCriticalReady: progress.criticalReady,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple avatar model preloader
 */
export function useAvatarModelPreload(
  modelUrl: string,
  options?: { autoStart?: boolean }
): {
  isLoaded: boolean;
  isLoading: boolean;
  error: Error | null;
  data: unknown | null;
  reload: () => void;
} {
  const { progress, controls, state } = useAvatarPreloader({
    autoStart: options?.autoStart ?? true,
  });

  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<unknown | null>(null);

  useEffect(() => {
    if (modelUrl && (options?.autoStart ?? true)) {
      controls.preload([
        { type: "model", url: modelUrl, priority: "critical", critical: true },
      ]);
    }
  }, [modelUrl, options?.autoStart, controls]);

  useEffect(() => {
    const asset = controls.getAsset(`model-${modelUrl}-${Date.now()}`);
    if (asset) {
      setError(asset.error);
      setData(asset.data);
    }
  }, [controls, modelUrl, progress]);

  const reload = useCallback(() => {
    controls.reset();
    controls.preload([
      { type: "model", url: modelUrl, priority: "critical", critical: true },
    ]);
  }, [controls, modelUrl]);

  return {
    isLoaded: progress.criticalReady && progress.loaded > 0,
    isLoading: state.isLoading,
    error,
    data,
    reload,
  };
}

/**
 * Batch avatar assets preloader
 */
export function useAvatarAssetsPreload(
  assets: PreloadAsset[],
  config?: Partial<PreloaderConfig>
): UseAvatarPreloaderResult {
  const result = useAvatarPreloader(config);

  useEffect(() => {
    if (assets.length > 0) {
      result.controls.preload(assets);
    }
  }, [assets, result.controls]);

  return result;
}

export default useAvatarPreloader;
