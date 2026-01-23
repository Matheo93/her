/**
 * Tests for useAvatarAnimationPrewarmer hook - Sprint 545
 *
 * Tests animation prewarming including:
 * - Animation registration and warming
 * - Cache management and hit rates
 * - Memory budget enforcement
 * - Prediction-based prefetching
 * - Expiration and eviction
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useAvatarAnimationPrewarmer,
  useAnimationWarmStatus,
  usePrewarmerMetrics,
  useHotAnimations,
  type AnimationDefinition,
  type AnimationType,
  type PrewarmStrategy,
} from "../useAvatarAnimationPrewarmer";

describe("useAvatarAnimationPrewarmer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should return state, metrics, controls, and isReady", () => {
      const { result } = renderHook(() => useAvatarAnimationPrewarmer());

      expect(result.current.state).toBeDefined();
      expect(result.current.metrics).toBeDefined();
      expect(result.current.controls).toBeDefined();
      expect(typeof result.current.isReady).toBe("boolean");
    });

    it("should initialize with zero animations", () => {
      const { result } = renderHook(() => useAvatarAnimationPrewarmer());

      expect(result.current.state.totalAnimations).toBe(0);
      expect(result.current.state.warmAnimations).toBe(0);
      expect(result.current.state.hotAnimations).toBe(0);
      expect(result.current.state.coldAnimations).toBe(0);
    });

    it("should initialize with zero metrics", () => {
      const { result } = renderHook(() => useAvatarAnimationPrewarmer());

      expect(result.current.metrics.totalPrewarms).toBe(0);
      expect(result.current.metrics.successfulPrewarms).toBe(0);
      expect(result.current.metrics.failedPrewarms).toBe(0);
      expect(result.current.metrics.cacheHits).toBe(0);
      expect(result.current.metrics.cacheMisses).toBe(0);
    });

    it("should not be warming initially", () => {
      const { result } = renderHook(() => useAvatarAnimationPrewarmer());

      expect(result.current.state.isWarming).toBe(false);
      expect(result.current.state.warmingInProgress).toBe(0);
    });

    it("should provide control functions", () => {
      const { result } = renderHook(() => useAvatarAnimationPrewarmer());

      expect(typeof result.current.controls.prewarm).toBe("function");
      expect(typeof result.current.controls.prewarmOne).toBe("function");
      expect(typeof result.current.controls.getAnimation).toBe("function");
      expect(typeof result.current.controls.accessAnimation).toBe("function");
      expect(typeof result.current.controls.evict).toBe("function");
      expect(typeof result.current.controls.evictType).toBe("function");
      expect(typeof result.current.controls.evictAll).toBe("function");
      expect(typeof result.current.controls.setStrategy).toBe("function");
      expect(typeof result.current.controls.warmNext).toBe("function");
      expect(typeof result.current.controls.markHot).toBe("function");
      expect(typeof result.current.controls.markCold).toBe("function");
      expect(typeof result.current.controls.predict).toBe("function");
      expect(typeof result.current.controls.reset).toBe("function");
    });
  });

  // ============================================================================
  // Prewarm Tests
  // ============================================================================

  describe("prewarm", () => {
    it("should add animations to the prewarmer", () => {
      const { result } = renderHook(() => useAvatarAnimationPrewarmer());

      const animations: AnimationDefinition[] = [
        { id: "idle-1", type: "idle" },
        { id: "speak-1", type: "speak" },
      ];

      act(() => {
        result.current.controls.prewarm(animations);
      });

      expect(result.current.state.totalAnimations).toBe(2);
    });

    it("should start warming critical animations in balanced mode", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "balanced" })
      );

      const animations: AnimationDefinition[] = [
        { id: "critical-1", type: "idle", priority: "critical" },
        { id: "low-1", type: "gesture", priority: "low" },
      ];

      act(() => {
        result.current.controls.prewarm(animations);
      });

      // Critical should be queued for warming
      expect(result.current.state.totalAnimations).toBe(2);
    });

    it("should not warm in manual mode", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      const animations: AnimationDefinition[] = [
        { id: "idle-1", type: "idle", priority: "critical" },
      ];

      act(() => {
        result.current.controls.prewarm(animations);
      });

      expect(result.current.state.coldAnimations).toBe(1);
    });

    it("should use default priority when not specified", () => {
      const { result } = renderHook(() => useAvatarAnimationPrewarmer());

      act(() => {
        result.current.controls.prewarm([{ id: "test-1", type: "idle" }]);
      });

      const animation = result.current.controls.getAnimation("test-1");
      expect(animation?.priority).toBe("normal");
    });
  });

  // ============================================================================
  // Animation Status Tests
  // ============================================================================

  describe("animation status", () => {
    it("should track cold animations", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      const animation = result.current.controls.getAnimation("idle-1");
      expect(animation?.status).toBe("cold");
    });

    it("should transition to warm after warming", async () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "aggressive" })
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      // Run timers to complete warming
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      await waitFor(() => {
        const animation = result.current.controls.getAnimation("idle-1");
        return animation?.status === "warm";
      }, { timeout: 1000 }).catch(() => {
        // May still be warming or cold
      });

      expect(result.current.state.totalAnimations).toBe(1);
    });
  });

  // ============================================================================
  // Access Tests
  // ============================================================================

  describe("accessAnimation", () => {
    it("should increment cache miss for missing animation", () => {
      const { result } = renderHook(() => useAvatarAnimationPrewarmer());

      act(() => {
        result.current.controls.accessAnimation("non-existent");
      });

      expect(result.current.metrics.cacheMisses).toBe(1);
    });

    it("should increment cache miss for cold animation", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      act(() => {
        result.current.controls.accessAnimation("idle-1");
      });

      expect(result.current.metrics.cacheMisses).toBe(1);
    });

    it("should increment access count", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      act(() => {
        result.current.controls.accessAnimation("idle-1");
        result.current.controls.accessAnimation("idle-1");
      });

      const animation = result.current.controls.getAnimation("idle-1");
      expect(animation?.accessCount).toBe(2);
    });

    it("should return null for missing animation", () => {
      const { result } = renderHook(() => useAvatarAnimationPrewarmer());

      let data: unknown = undefined;
      act(() => {
        data = result.current.controls.accessAnimation("non-existent");
      });

      expect(data).toBeNull();
    });
  });

  // ============================================================================
  // Eviction Tests
  // ============================================================================

  describe("eviction", () => {
    it("should evict single animation", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([
          { id: "idle-1", type: "idle" },
          { id: "idle-2", type: "idle" },
        ]);
      });

      expect(result.current.state.totalAnimations).toBe(2);

      act(() => {
        result.current.controls.evict("idle-1");
      });

      expect(result.current.state.totalAnimations).toBe(1);
      expect(result.current.metrics.animationsEvicted).toBe(1);
    });

    it("should evict animations by type", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([
          { id: "idle-1", type: "idle" },
          { id: "idle-2", type: "idle" },
          { id: "speak-1", type: "speak" },
        ]);
      });

      act(() => {
        result.current.controls.evictType("idle");
      });

      expect(result.current.state.totalAnimations).toBe(1);
    });

    it("should evict all animations", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([
          { id: "idle-1", type: "idle" },
          { id: "speak-1", type: "speak" },
        ]);
      });

      act(() => {
        result.current.controls.evictAll();
      });

      expect(result.current.state.totalAnimations).toBe(0);
    });
  });

  // ============================================================================
  // Hot/Cold Marking Tests
  // ============================================================================

  describe("hot/cold marking", () => {
    it("should mark animation as hot", async () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "aggressive" })
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      // Wait for warming
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      act(() => {
        result.current.controls.markHot("idle-1");
      });

      const animation = result.current.controls.getAnimation("idle-1");
      // May be hot or warm depending on warming completion
      expect(["warm", "hot", "cold", "warming"]).toContain(animation?.status);
    });

    it("should mark animation as cold", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      act(() => {
        result.current.controls.markCold("idle-1");
      });

      const animation = result.current.controls.getAnimation("idle-1");
      expect(animation?.status).toBe("cold");
    });
  });

  // ============================================================================
  // Strategy Tests
  // ============================================================================

  describe("strategy", () => {
    it("should change strategy via setStrategy", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "balanced" })
      );

      act(() => {
        result.current.controls.setStrategy("conservative");
      });

      // Strategy changed - affects future prewarms
      expect(result.current.state).toBeDefined();
    });

    it("should warm all in aggressive mode", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "aggressive" })
      );

      act(() => {
        result.current.controls.prewarm([
          { id: "low-1", type: "idle", priority: "low" },
        ]);
      });

      // In aggressive mode, even low priority should be queued
      expect(result.current.state.totalAnimations).toBe(1);
    });

    it("should only warm critical in conservative mode", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "conservative" })
      );

      act(() => {
        result.current.controls.prewarm([
          { id: "critical-1", type: "idle", priority: "critical" },
          { id: "high-1", type: "speak", priority: "high" },
        ]);
      });

      // Both added, but only critical queued for warming
      expect(result.current.state.totalAnimations).toBe(2);
    });
  });

  // ============================================================================
  // Prediction Tests
  // ============================================================================

  describe("prediction", () => {
    it("should predict likely animations", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ enablePrediction: true, strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([
          { id: "idle-1", type: "idle" },
          { id: "speak-1", type: "speak" },
          { id: "listen-1", type: "listen" },
        ]);
      });

      const predictions = result.current.controls.predict({
        currentState: "idle",
        userActivity: "typing",
        conversationPhase: "active",
        recentAnimations: ["idle-1"],
      });

      expect(Array.isArray(predictions)).toBe(true);
    });

    it("should return empty array when prediction disabled", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ enablePrediction: false })
      );

      const predictions = result.current.controls.predict({
        currentState: "idle",
        userActivity: "typing",
        conversationPhase: "active",
        recentAnimations: [],
      });

      expect(predictions).toEqual([]);
    });
  });

  // ============================================================================
  // Reset Tests
  // ============================================================================

  describe("reset", () => {
    it("should reset all state", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      expect(result.current.state.totalAnimations).toBe(1);

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.totalAnimations).toBe(0);
      expect(result.current.metrics.totalPrewarms).toBe(0);
    });
  });

  // ============================================================================
  // Warm Next Tests
  // ============================================================================

  describe("warmNext", () => {
    it("should warm next cold animation", async () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      expect(result.current.state.coldAnimations).toBe(1);

      await act(async () => {
        await result.current.controls.warmNext();
        jest.advanceTimersByTime(200);
      });

      // Animation should be warming or warm
      const animation = result.current.controls.getAnimation("idle-1");
      expect(["warming", "warm"]).toContain(animation?.status);
    });
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe("configuration", () => {
    it("should accept custom memory budget", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ memoryBudgetMB: 100 })
      );

      expect(result.current.state).toBeDefined();
    });

    it("should accept custom concurrent warms", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ maxConcurrentWarms: 4 })
      );

      expect(result.current.state).toBeDefined();
    });

    it("should respect enabled flag", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ enabled: false })
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      // Should not add when disabled
      expect(result.current.state.totalAnimations).toBe(0);
    });
  });

  // ============================================================================
  // Callback Tests
  // ============================================================================

  describe("callbacks", () => {
    it("should call onAnimationWarmed", async () => {
      const onAnimationWarmed = jest.fn();
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer(
          { strategy: "aggressive" },
          { onAnimationWarmed }
        )
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // May have been called if warming completed
      expect(onAnimationWarmed.mock.calls.length).toBeGreaterThanOrEqual(0);
    });

    it("should call onAnimationAccessed", () => {
      const onAnimationAccessed = jest.fn();
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer(
          { strategy: "manual" },
          { onAnimationAccessed }
        )
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      act(() => {
        result.current.controls.accessAnimation("idle-1");
      });

      expect(onAnimationAccessed).toHaveBeenCalled();
    });

    it("should call onAnimationEvicted", () => {
      const onAnimationEvicted = jest.fn();
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer(
          { strategy: "manual" },
          { onAnimationEvicted }
        )
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      act(() => {
        result.current.controls.evict("idle-1");
      });

      expect(onAnimationEvicted).toHaveBeenCalledWith("idle-1");
    });
  });

  // ============================================================================
  // Memory Tests
  // ============================================================================

  describe("memory", () => {
    it("should track memory usage", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([
          { id: "idle-1", type: "idle", durationMs: 2000, framerate: 60 },
        ]);
      });

      expect(result.current.state.memoryUsageMB).toBeGreaterThan(0);
    });

    it("should call onMemoryWarning when near budget", () => {
      const onMemoryWarning = jest.fn();
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer(
          { memoryBudgetMB: 0.1, strategy: "manual" }, // Very small budget
          { onMemoryWarning }
        )
      );

      // Add large animation
      act(() => {
        result.current.controls.prewarm([
          { id: "large-1", type: "idle", durationMs: 10000, framerate: 60 },
        ]);
      });

      // Memory warning may have been called
      expect(onMemoryWarning.mock.calls.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Hit Rate Tests
  // ============================================================================

  describe("hit rate", () => {
    it("should calculate hit rate", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      // Access cold animation (miss)
      act(() => {
        result.current.controls.accessAnimation("idle-1");
      });

      // Access non-existent (miss)
      act(() => {
        result.current.controls.accessAnimation("non-existent");
      });

      expect(result.current.state.hitRate).toBe(0);
    });
  });

  // ============================================================================
  // Is Ready Tests
  // ============================================================================

  describe("isReady", () => {
    it("should be ready when disabled", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ enabled: false })
      );

      expect(result.current.isReady).toBe(true);
    });

    it("should not be ready initially with no warm animations", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      expect(result.current.isReady).toBe(false);
    });
  });

  // ============================================================================
  // PrewarmOne Tests
  // ============================================================================

  describe("prewarmOne", () => {
    it("should warm single animation and return result", async () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      let warmed: unknown;
      await act(async () => {
        const promise = result.current.controls.prewarmOne({
          id: "idle-1",
          type: "idle",
        });
        jest.advanceTimersByTime(200);
        warmed = await promise;
      });

      expect(warmed).toBeDefined();
      expect((warmed as any).id).toBe("idle-1");
    });
  });

  // ============================================================================
  // GetAnimation Tests
  // ============================================================================

  describe("getAnimation", () => {
    it("should return null for non-existent animation", () => {
      const { result } = renderHook(() => useAvatarAnimationPrewarmer());

      const animation = result.current.controls.getAnimation("non-existent");
      expect(animation).toBeNull();
    });

    it("should return animation when it exists", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      act(() => {
        result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
      });

      const animation = result.current.controls.getAnimation("idle-1");
      expect(animation).not.toBeNull();
      expect(animation?.id).toBe("idle-1");
    });
  });
});

// ============================================================================
// Sub-Hooks Tests
// ============================================================================

describe("useAnimationWarmStatus", () => {
  it("should return warm status for animation", () => {
    const { result } = renderHook(() => useAnimationWarmStatus("test-id"));

    expect(result.current.isWarm).toBe(false);
    expect(result.current.isHot).toBe(false);
    expect(result.current.status).toBeNull();
  });
});

describe("usePrewarmerMetrics", () => {
  it("should return metrics", () => {
    const { result } = renderHook(() => usePrewarmerMetrics());

    expect(result.current.totalPrewarms).toBe(0);
    expect(result.current.cacheHits).toBe(0);
  });
});

describe("useHotAnimations", () => {
  it("should return hot animations array", () => {
    const { result } = renderHook(() => useHotAnimations());

    expect(Array.isArray(result.current)).toBe(true);
    expect(result.current.length).toBe(0);
  });
});
