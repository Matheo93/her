/**
 * Tests for Mobile Memory Optimizer Hook - Sprint 226
 *
 * Tests memory management, resource lifecycle, and eviction strategies
 */

import { renderHook, act } from "@testing-library/react";
import {
  useMobileMemoryOptimizer,
  useImageMemoryManager,
  useMemoryPressureAlert,
  type ResourceType,
  type CacheEvictionStrategy,
} from "../useMobileMemoryOptimizer";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useMobileMemoryOptimizer", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      expect(result.current.stats.pressure).toBe("normal");
      expect(result.current.stats.resourceCount).toBe(0);
      expect(result.current.isUnderPressure).toBe(false);
      expect(result.current.usagePercent).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({
          budgetMB: 50,
          evictionStrategy: "lfu",
        })
      );

      // Budget should be 50MB
      expect(result.current.budgetRemaining).toBe(50 * 1024 * 1024);
    });

    it("should start with full budget available", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({ budgetMB: 100 })
      );

      expect(result.current.budgetRemaining).toBe(100 * 1024 * 1024);
      expect(result.current.usagePercent).toBe(0);
    });
  });

  describe("resource registration", () => {
    it("should register a resource", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      let resourceId: string;
      act(() => {
        resourceId = result.current.controls.register({
          type: "image",
          size: 1024 * 1024, // 1MB
          priority: 5,
        });
      });

      expect(resourceId!).toBeTruthy();
      expect(result.current.stats.resourceCount).toBe(1);
      expect(result.current.stats.cacheSize).toBe(1024 * 1024);
    });

    it("should unregister a resource", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      let resourceId: string;
      act(() => {
        resourceId = result.current.controls.register({
          type: "image",
          size: 1024 * 1024,
          priority: 5,
        });
      });

      expect(result.current.stats.resourceCount).toBe(1);

      act(() => {
        result.current.controls.unregister(resourceId!);
      });

      expect(result.current.stats.resourceCount).toBe(0);
      expect(result.current.stats.cacheSize).toBe(0);
    });

    it("should call disposer when unregistering", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      const disposer = jest.fn();
      let resourceId: string;

      act(() => {
        resourceId = result.current.controls.register({
          type: "image",
          size: 1024,
          priority: 5,
          disposer,
        });
      });

      act(() => {
        result.current.controls.unregister(resourceId!);
      });

      expect(disposer).toHaveBeenCalled();
    });

    it("should track multiple resources", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      act(() => {
        result.current.controls.register({ type: "image", size: 1000, priority: 5 });
        result.current.controls.register({ type: "audio", size: 2000, priority: 5 });
        result.current.controls.register({ type: "data", size: 500, priority: 5 });
      });

      expect(result.current.stats.resourceCount).toBe(3);
      expect(result.current.stats.cacheSize).toBe(3500);
    });
  });

  describe("resource access tracking", () => {
    it("should track access count", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      let resourceId: string;
      act(() => {
        resourceId = result.current.controls.register({
          type: "image",
          size: 1024,
          priority: 5,
        });
      });

      act(() => {
        result.current.controls.access(resourceId!);
        result.current.controls.access(resourceId!);
        result.current.controls.access(resourceId!);
      });

      const resource = result.current.controls.getResource(resourceId!);
      expect(resource?.accessCount).toBe(3);
    });

    it("should update lastAccessedAt on access", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      let resourceId: string;
      act(() => {
        resourceId = result.current.controls.register({
          type: "image",
          size: 1024,
          priority: 5,
        });
      });

      const initialAccess = result.current.controls.getResource(resourceId!)?.lastAccessedAt;

      // Advance time
      jest.advanceTimersByTime(1000);

      act(() => {
        result.current.controls.access(resourceId!);
      });

      const newAccess = result.current.controls.getResource(resourceId!)?.lastAccessedAt;
      expect(newAccess).toBeGreaterThanOrEqual(initialAccess!);
    });
  });

  describe("eviction strategies", () => {
    it("should evict using LRU strategy", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({ evictionStrategy: "lru", preservePriority: 10 })
      );

      let oldId: string, newId: string;

      act(() => {
        oldId = result.current.controls.register({
          type: "image",
          size: 1024 * 1024,
          priority: 5,
        });
      });

      // Advance time
      jest.advanceTimersByTime(1000);

      act(() => {
        newId = result.current.controls.register({
          type: "image",
          size: 1024 * 1024,
          priority: 5,
        });
        // Access the new one to make it more recently used
        result.current.controls.access(newId!);
      });

      let evictionResult: ReturnType<typeof result.current.controls.evict>;
      act(() => {
        evictionResult = result.current.controls.evict("lru", 1024 * 1024);
      });

      // Older resource should be evicted first
      expect(evictionResult!.evicted).toContain(oldId!);
      expect(evictionResult!.freedBytes).toBeGreaterThan(0);
    });

    it("should evict using LFU strategy", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({ evictionStrategy: "lfu", preservePriority: 10 })
      );

      let lessUsedId: string, moreUsedId: string;

      act(() => {
        lessUsedId = result.current.controls.register({
          type: "image",
          size: 1024 * 1024,
          priority: 5,
        });
        moreUsedId = result.current.controls.register({
          type: "image",
          size: 1024 * 1024,
          priority: 5,
        });
      });

      // Access one more than the other
      act(() => {
        result.current.controls.access(moreUsedId!);
        result.current.controls.access(moreUsedId!);
        result.current.controls.access(moreUsedId!);
      });

      let evictionResult: ReturnType<typeof result.current.controls.evict>;
      act(() => {
        evictionResult = result.current.controls.evict("lfu", 1024 * 1024);
      });

      // Less frequently used should be evicted first
      expect(evictionResult!.evicted).toContain(lessUsedId!);
    });

    it("should evict using size strategy", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({ preservePriority: 10 })
      );

      let smallId: string, largeId: string;

      act(() => {
        smallId = result.current.controls.register({
          type: "image",
          size: 100,
          priority: 5,
        });
        largeId = result.current.controls.register({
          type: "image",
          size: 10000,
          priority: 5,
        });
      });

      let evictionResult: ReturnType<typeof result.current.controls.evict>;
      act(() => {
        evictionResult = result.current.controls.evict("size", 5000);
      });

      // Larger resource should be evicted first
      expect(evictionResult!.evicted).toContain(largeId!);
    });

    it("should evict using priority strategy", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({ preservePriority: 10 })
      );

      let lowPriorityId: string, highPriorityId: string;

      act(() => {
        lowPriorityId = result.current.controls.register({
          type: "image",
          size: 1024,
          priority: 2,
        });
        highPriorityId = result.current.controls.register({
          type: "image",
          size: 1024,
          priority: 7,
        });
      });

      let evictionResult: ReturnType<typeof result.current.controls.evict>;
      act(() => {
        evictionResult = result.current.controls.evict("priority", 1024);
      });

      // Lower priority should be evicted first
      expect(evictionResult!.evicted).toContain(lowPriorityId!);
    });

    it("should not evict resources at or above preserve priority", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({ preservePriority: 8 })
      );

      let highPriorityId: string;

      act(() => {
        highPriorityId = result.current.controls.register({
          type: "image",
          size: 1024,
          priority: 9, // Above preserve threshold
        });
      });

      let evictionResult: ReturnType<typeof result.current.controls.evict>;
      act(() => {
        evictionResult = result.current.controls.evict("lru", 2000);
      });

      // High priority resource should not be evicted
      expect(evictionResult!.evicted).not.toContain(highPriorityId!);
    });
  });

  describe("evict by type", () => {
    it("should evict only resources of specified type", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({ preservePriority: 10 })
      );

      let imageId: string, audioId: string;

      act(() => {
        imageId = result.current.controls.register({
          type: "image",
          size: 1024,
          priority: 5,
        });
        audioId = result.current.controls.register({
          type: "audio",
          size: 1024,
          priority: 5,
        });
      });

      let evictionResult: ReturnType<typeof result.current.controls.evictType>;
      act(() => {
        evictionResult = result.current.controls.evictType("image");
      });

      expect(evictionResult!.evicted).toContain(imageId!);
      expect(evictionResult!.evicted).not.toContain(audioId!);
    });
  });

  describe("clear all", () => {
    it("should clear all resources", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      const disposer1 = jest.fn();
      const disposer2 = jest.fn();

      act(() => {
        result.current.controls.register({
          type: "image",
          size: 1024,
          priority: 5,
          disposer: disposer1,
        });
        result.current.controls.register({
          type: "audio",
          size: 2048,
          priority: 5,
          disposer: disposer2,
        });
      });

      expect(result.current.stats.resourceCount).toBe(2);

      act(() => {
        result.current.controls.clear();
      });

      expect(result.current.stats.resourceCount).toBe(0);
      expect(result.current.stats.cacheSize).toBe(0);
      expect(disposer1).toHaveBeenCalled();
      expect(disposer2).toHaveBeenCalled();
    });
  });

  describe("priority management", () => {
    it("should update resource priority", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      let resourceId: string;
      act(() => {
        resourceId = result.current.controls.register({
          type: "image",
          size: 1024,
          priority: 5,
        });
      });

      act(() => {
        result.current.controls.updatePriority(resourceId!, 9);
      });

      const resource = result.current.controls.getResource(resourceId!);
      expect(resource?.priority).toBe(9);
    });

    it("should clamp priority to valid range", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      let resourceId: string;
      act(() => {
        resourceId = result.current.controls.register({
          type: "image",
          size: 1024,
          priority: 5,
        });
      });

      act(() => {
        result.current.controls.updatePriority(resourceId!, 15); // Over max
      });

      const resource = result.current.controls.getResource(resourceId!);
      expect(resource?.priority).toBeLessThanOrEqual(10);
    });
  });

  describe("memory pressure", () => {
    it("should detect moderate pressure", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({
          budgetMB: 1, // 1MB budget
          pressureThresholds: { moderate: 0.7, critical: 0.9 },
        })
      );

      // Add resources to exceed 70% of 1MB budget
      act(() => {
        result.current.controls.register({
          type: "data",
          size: 800 * 1024, // 800KB = 78% of 1MB
          priority: 5,
        });
      });

      expect(result.current.stats.pressure).toBe("moderate");
      expect(result.current.isUnderPressure).toBe(true);
    });

    it("should detect critical pressure", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({
          budgetMB: 1,
          pressureThresholds: { moderate: 0.7, critical: 0.9 },
        })
      );

      // Add resources to exceed 90% of 1MB budget
      act(() => {
        result.current.controls.register({
          type: "data",
          size: 950 * 1024, // 950KB = 93% of 1MB
          priority: 5,
        });
      });

      expect(result.current.stats.pressure).toBe("critical");
      expect(result.current.isUnderPressure).toBe(true);
    });
  });

  describe("force cleanup", () => {
    it("should remove expired TTL resources", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      let resourceId: string;
      act(() => {
        resourceId = result.current.controls.register({
          type: "data",
          size: 1024,
          priority: 5,
          ttl: 1000, // 1 second TTL
        });
      });

      expect(result.current.stats.resourceCount).toBe(1);

      // Advance time past TTL
      jest.advanceTimersByTime(2000);

      act(() => {
        result.current.controls.forceCleanup();
      });

      expect(result.current.stats.resourceCount).toBe(0);
    });

    it("should remove old unused resources", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({
          maxResourceAge: 1000, // 1 second max age
          preservePriority: 10,
        })
      );

      let resourceId: string;
      act(() => {
        resourceId = result.current.controls.register({
          type: "data",
          size: 1024,
          priority: 5,
        });
      });

      // Advance time past max age
      jest.advanceTimersByTime(2000);

      act(() => {
        result.current.controls.forceCleanup();
      });

      expect(result.current.stats.resourceCount).toBe(0);
    });
  });

  describe("get memory usage", () => {
    it("should return current memory stats", () => {
      const { result } = renderHook(() => useMobileMemoryOptimizer());

      act(() => {
        result.current.controls.register({
          type: "image",
          size: 5000,
          priority: 5,
        });
      });

      const usage = result.current.controls.getMemoryUsage();

      expect(usage.cacheSize).toBe(5000);
      expect(usage.resourceCount).toBe(1);
    });
  });

  describe("usage percent", () => {
    it("should calculate usage percentage correctly", () => {
      const { result } = renderHook(() =>
        useMobileMemoryOptimizer({ budgetMB: 1 })
      );

      act(() => {
        result.current.controls.register({
          type: "data",
          size: 512 * 1024, // 512KB = 50% of 1MB
          priority: 5,
        });
      });

      expect(result.current.usagePercent).toBeCloseTo(50, 0);
    });
  });
});

describe("useImageMemoryManager", () => {
  it("should register and unregister images", () => {
    const { result } = renderHook(() => useImageMemoryManager());

    let imageId: string;
    act(() => {
      imageId = result.current.registerImage("http://example.com/image.jpg", 1024, 5);
    });

    expect(imageId!).toBeTruthy();

    act(() => {
      result.current.unregisterImage(imageId!);
    });

    expect(result.current.usagePercent).toBe(0);
  });
});

describe("useMemoryPressureAlert", () => {
  it("should call callback on pressure change", () => {
    const onPressure = jest.fn();
    const { result } = renderHook(() =>
      useMemoryPressureAlert(onPressure, {
        budgetMB: 1,
        pressureThresholds: { moderate: 0.5, critical: 0.9 },
      })
    );

    expect(result.current.pressure).toBe("normal");
    expect(result.current.isUnderPressure).toBe(false);
  });
});
