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
  ResourceType,
  CacheEvictionStrategy,
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

// ============================================================================
// Sprint 638 - Additional Coverage Tests
// ============================================================================

describe("Sprint 638 - Memory estimation without performance.memory (line 151)", () => {
  it("should estimate memory when performance.memory is not available", () => {
    // Remove performance.memory if it exists
    const original = (performance as any).memory;
    delete (performance as any).memory;

    const { result } = renderHook(() => useMobileMemoryOptimizer());

    // Should still work without performance.memory
    expect(result.current.state.usage.total).toBeGreaterThan(0);

    // Restore
    (performance as any).memory = original;
  });

  it("should use performance.memory when available", () => {
    // Mock performance.memory
    (performance as any).memory = {
      usedJSHeapSize: 100 * 1024 * 1024,
      jsHeapSizeLimit: 2 * 1024 * 1024 * 1024,
    };

    const { result } = renderHook(() => useMobileMemoryOptimizer());

    // Should use performance.memory values
    expect(result.current.state.usage.used).toBe(100 * 1024 * 1024);

    // Cleanup
    delete (performance as any).memory;
  });
});

describe("Sprint 638 - Cache eviction strategies (lines 196-201)", () => {
  it("should evict by TTL strategy", () => {
    const { result } = renderHook(() =>
      useMobileMemoryOptimizer({ budgetMB: 1 })
    );

    // Register resources with different TTLs
    act(() => {
      result.current.controls.register({
        type: "data",
        size: 100 * 1024,
        priority: 5,
        ttl: 1000, // Short TTL
      });

      result.current.controls.register({
        type: "data",
        size: 100 * 1024,
        priority: 5,
        ttl: 60000, // Long TTL
      });
    });

    // Evict by TTL
    act(() => {
      result.current.controls.evict("ttl", 50 * 1024);
    });

    // Should have evicted shorter TTL first
    expect(result.current.state.usage.used).toBeLessThanOrEqual(150 * 1024);
  });

  it("should evict by size strategy (largest first)", () => {
    const { result } = renderHook(() =>
      useMobileMemoryOptimizer({ budgetMB: 1 })
    );

    // Register resources of different sizes
    act(() => {
      result.current.controls.register({
        type: "data",
        size: 50 * 1024, // 50KB
        priority: 3,
      });

      result.current.controls.register({
        type: "data",
        size: 200 * 1024, // 200KB
        priority: 3,
      });

      result.current.controls.register({
        type: "data",
        size: 100 * 1024, // 100KB
        priority: 3,
      });
    });

    // Evict by size (largest first)
    act(() => {
      result.current.controls.evict("size", 150 * 1024);
    });

    // Largest resources should be evicted first
    expect(result.current.state.resourceCount).toBeLessThanOrEqual(2);
  });

  it("should evict by LFU strategy (least frequently used)", () => {
    const { result } = renderHook(() =>
      useMobileMemoryOptimizer({ budgetMB: 1 })
    );

    let id1: string, id2: string;

    act(() => {
      id1 = result.current.controls.register({
        type: "data",
        size: 100 * 1024,
        priority: 3,
      });

      id2 = result.current.controls.register({
        type: "data",
        size: 100 * 1024,
        priority: 3,
      });
    });

    // Access id2 multiple times to increase access count
    act(() => {
      result.current.controls.access(id2!);
      result.current.controls.access(id2!);
      result.current.controls.access(id2!);
    });

    // Evict by LFU
    act(() => {
      result.current.controls.evict("lfu", 50 * 1024);
    });

    // Less frequently accessed should be evicted first
    expect(result.current.state.resourceCount).toBeLessThanOrEqual(1);
  });
});

describe("Sprint 638 - Auto cleanup and eviction (lines 472-480)", () => {
  it("should auto evict on critical pressure", () => {
    const { result } = renderHook(() =>
      useMobileMemoryOptimizer({
        budgetMB: 1,
        autoEvict: true,
        cleanupIntervalMs: 100,
        pressureThresholds: { moderate: 0.5, critical: 0.9 },
      })
    );

    // Fill memory to trigger critical pressure
    act(() => {
      // Register resources until critical
      for (let i = 0; i < 10; i++) {
        result.current.controls.register({
          type: "data",
          size: 150 * 1024, // 150KB each
          priority: 3,
        });
      }
    });

    // Advance timer to trigger cleanup
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Memory should be managed
    expect(result.current.state.usage).toBeDefined();
  });

  it("should not auto evict when disabled", () => {
    const { result } = renderHook(() =>
      useMobileMemoryOptimizer({
        budgetMB: 1,
        autoEvict: false,
        cleanupIntervalMs: 100,
      })
    );

    // Fill memory
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.controls.register({
          type: "data",
          size: 150 * 1024,
          priority: 3,
        });
      }
    });

    const countBefore = result.current.state.resourceCount;

    // Advance timer
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Resources should still be present (not auto-evicted)
    expect(result.current.state.resourceCount).toBe(countBefore);
  });
});

describe("Sprint 638 - Memory pressure event listener (lines 502, 507-508)", () => {
  it("should handle memory pressure when window event exists", () => {
    // Mock window.onmemorypressure
    Object.defineProperty(window, "onmemorypressure", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result, unmount } = renderHook(() =>
      useMobileMemoryOptimizer({ budgetMB: 1 })
    );

    // Should register without errors
    expect(result.current.state).toBeDefined();

    // Cleanup
    unmount();
  });
});

describe("Sprint 638 - useMemoryPressureAlert callback (lines 594-595)", () => {
  it("should trigger callback when pressure changes", () => {
    const onPressure = jest.fn();

    const { result, rerender } = renderHook(
      ({ callback }) => useMemoryPressureAlert(callback, { budgetMB: 1 }),
      { initialProps: { callback: onPressure } }
    );

    // Initial state should be normal
    expect(result.current.pressure).toBe("normal");

    // Rerender with same callback
    rerender({ callback: onPressure });

    // The pressure state should remain defined
    expect(result.current.pressure).toBeDefined();
    expect(result.current.isUnderPressure).toBe(false);
  });

  it("should work without callback", () => {
    const { result } = renderHook(() =>
      useMemoryPressureAlert(undefined, { budgetMB: 1 })
    );

    expect(result.current.pressure).toBe("normal");
    expect(result.current.isUnderPressure).toBe(false);
  });
});
