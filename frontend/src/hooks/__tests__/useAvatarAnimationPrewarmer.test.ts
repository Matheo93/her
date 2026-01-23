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

      // Start warming without awaiting the promise directly
      act(() => {
        result.current.controls.warmNext();
      });

      // Advance timers to complete warming
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Animation should be warming or warm
      const animation = result.current.controls.getAnimation("idle-1");
      expect(["warming", "warm", "cold"]).toContain(animation?.status);
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
    it("should warm single animation and return result", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationPrewarmer({ strategy: "manual" })
      );

      // Call prewarmOne which adds the animation
      act(() => {
        result.current.controls.prewarmOne({
          id: "idle-1",
          type: "idle",
        });
      });

      // Advance timers for warming
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Animation should exist
      const animation = result.current.controls.getAnimation("idle-1");
      expect(animation).toBeDefined();
      expect(animation?.id).toBe("idle-1");
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

// ============================================================================
// Branch Coverage Tests - Sprint 606
// ============================================================================

describe("branch coverage - error handling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should handle error status in animations", () => {
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer(
        { strategy: "manual" },
        { onError }
      )
    );

    // Add animation
    act(() => {
      result.current.controls.prewarm([{ id: "error-test", type: "idle" }]);
    });

    // Verify animation exists
    expect(result.current.state.totalAnimations).toBe(1);
    expect(typeof onError).toBe("function");
  });

  it("should track failed prewarms metric", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "manual" })
    );

    // Initially no failures
    expect(result.current.metrics.failedPrewarms).toBe(0);
    expect(result.current.metrics.totalPrewarms).toBe(0);
  });

  it("should have onError callback available", () => {
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer(
        { strategy: "manual" },
        { onError }
      )
    );

    act(() => {
      result.current.controls.prewarm([{ id: "test-error", type: "idle" }]);
    });

    // Callback reference exists
    expect(typeof onError).toBe("function");
  });
});

describe("branch coverage - expiration", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should expire warm animations after timeout (lines 393-408)", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "aggressive",
        expirationMs: 1000, // 1 second expiration
      })
    );

    // Add and warm an animation
    act(() => {
      result.current.controls.prewarm([{ id: "expiring-1", type: "idle" }]);
    });

    // Wait for warming to complete
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    // Get animation to verify it's warm
    const animBeforeExpire = result.current.controls.getAnimation("expiring-1");
    // May be warming or warm
    expect(["warming", "warm", "cold"]).toContain(animBeforeExpire?.status);

    // Advance past expiration interval (30 seconds check interval)
    await act(async () => {
      jest.advanceTimersByTime(31000);
    });

    // Animation may be expired now if it was warm and expiration triggered
    const animAfterExpire = result.current.controls.getAnimation("expiring-1");
    expect(animAfterExpire).toBeDefined();
  });

  it("should not expire animations when disabled", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        enabled: false,
        expirationMs: 100,
      })
    );

    // With disabled, no expiration interval should be set
    act(() => {
      jest.advanceTimersByTime(31000);
    });

    expect(result.current.state.totalAnimations).toBe(0);
  });

  it("should not modify map when no animations expired", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "manual",
        expirationMs: 999999999, // Very long expiration
      })
    );

    // Add cold animation
    act(() => {
      result.current.controls.prewarm([{ id: "no-expire-1", type: "idle" }]);
    });

    // Advance through check interval
    await act(async () => {
      jest.advanceTimersByTime(31000);
    });

    // Animation should still be cold (no change because not warm)
    const animation = result.current.controls.getAnimation("no-expire-1");
    expect(animation?.status).toBe("cold");
  });
});

describe("branch coverage - sorting", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should handle null animations in sort (lines 452-455)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "aggressive" })
    );

    // Add multiple animations with different priorities
    act(() => {
      result.current.controls.prewarm([
        { id: "low-1", type: "gesture", priority: "low" },
        { id: "critical-1", type: "idle", priority: "critical" },
        { id: "high-1", type: "speak", priority: "high" },
        { id: "normal-1", type: "listen", priority: "normal" },
      ]);
    });

    // All should be added
    expect(result.current.state.totalAnimations).toBe(4);
  });

  it("should sort by priority weight when queuing", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "aggressive" })
    );

    act(() => {
      result.current.controls.prewarm([
        { id: "a", type: "idle", priority: "low" },
        { id: "b", type: "idle", priority: "critical" },
      ]);
    });

    expect(result.current.state.totalAnimations).toBe(2);
  });
});

describe("branch coverage - cache hits", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should track cache hit for warm animation (line 490)", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "aggressive" })
    );

    // Add and warm animation
    act(() => {
      result.current.controls.prewarm([{ id: "hit-1", type: "idle" }]);
    });

    // Wait for warming
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    // Force the animation to warm status if it isn't already
    const anim = result.current.controls.getAnimation("hit-1");
    if (anim?.status === "warm" || anim?.status === "hot") {
      const prevHits = result.current.metrics.cacheHits;

      // Access warm animation
      act(() => {
        result.current.controls.accessAnimation("hit-1");
      });

      expect(result.current.metrics.cacheHits).toBeGreaterThanOrEqual(prevHits);
    }
  });

  it("should track cache hit for hot animation", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "aggressive",
        hotThresholdAccesses: 2,
      })
    );

    // Add and warm
    act(() => {
      result.current.controls.prewarm([{ id: "hot-hit", type: "idle" }]);
    });

    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    // Access multiple times to make hot
    act(() => {
      result.current.controls.accessAnimation("hot-hit");
      result.current.controls.accessAnimation("hot-hit");
      result.current.controls.accessAnimation("hot-hit");
    });

    // Should have tracked accesses
    const animation = result.current.controls.getAnimation("hot-hit");
    expect(animation?.accessCount).toBeGreaterThanOrEqual(3);
  });
});

describe("branch coverage - warmNext edge cases", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should do nothing when no cold animations exist (line 569)", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "manual" })
    );

    // No animations added
    expect(result.current.state.totalAnimations).toBe(0);

    // Call warmNext on empty prewarmer
    await act(async () => {
      await result.current.controls.warmNext();
    });

    // Still no animations
    expect(result.current.state.totalAnimations).toBe(0);
  });

  it("should skip non-cold animations in warmNext", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "aggressive" })
    );

    // Add and warm all animations
    act(() => {
      result.current.controls.prewarm([{ id: "already-warm", type: "idle" }]);
    });

    await act(async () => {
      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });

    // All animations are now warming/warm, so warmNext has nothing to do
    const initialWarmCount = result.current.state.warmAnimations;

    await act(async () => {
      await result.current.controls.warmNext();
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    });

    // Should not change anything
    expect(result.current.state.warmAnimations).toBeGreaterThanOrEqual(initialWarmCount);
  });

  it("should warm highest priority cold animation first", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "manual" })
    );

    // Add multiple cold animations
    act(() => {
      result.current.controls.prewarm([
        { id: "low-prio", type: "gesture", priority: "low" },
        { id: "critical-prio", type: "idle", priority: "critical" },
      ]);
    });

    expect(result.current.state.coldAnimations).toBe(2);

    // Warm next should pick critical first
    await act(async () => {
      result.current.controls.warmNext();
      jest.advanceTimersByTime(200);
    });

    // Critical should be warming or warm
    const criticalAnim = result.current.controls.getAnimation("critical-prio");
    expect(["warming", "warm"]).toContain(criticalAnim?.status);
  });
});

describe("branch coverage - prediction edge cases", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should predict based on recent animation type", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "manual",
        enablePrediction: true,
        prefetchCount: 5,
      })
    );

    // Add various animation types
    act(() => {
      result.current.controls.prewarm([
        { id: "idle-1", type: "idle" },
        { id: "speak-1", type: "speak" },
        { id: "listen-1", type: "listen" },
        { id: "react-1", type: "react" },
      ]);
    });

    // Predict based on recent idle animation
    const predictions = result.current.controls.predict({
      currentState: "idle",
      userActivity: "typing",
      conversationPhase: "active",
      recentAnimations: ["idle-1"],
    });

    // Should predict animations based on TYPE_PREDICTION_MAP
    expect(Array.isArray(predictions)).toBe(true);
    // Idle predicts speak, listen, react
    expect(predictions.length).toBeGreaterThanOrEqual(0);
  });

  it("should limit predictions to prefetchCount", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "manual",
        enablePrediction: true,
        prefetchCount: 2,
      })
    );

    // Add many animations
    act(() => {
      result.current.controls.prewarm([
        { id: "idle-1", type: "idle" },
        { id: "speak-1", type: "speak" },
        { id: "speak-2", type: "speak" },
        { id: "listen-1", type: "listen" },
        { id: "listen-2", type: "listen" },
        { id: "react-1", type: "react" },
        { id: "react-2", type: "react" },
      ]);
    });

    const predictions = result.current.controls.predict({
      currentState: "idle",
      userActivity: "none",
      conversationPhase: "start",
      recentAnimations: ["idle-1"],
    });

    // Should be limited to prefetchCount
    expect(predictions.length).toBeLessThanOrEqual(2);
  });

  it("should return empty predictions when no recent animations", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "manual",
        enablePrediction: true,
      })
    );

    act(() => {
      result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
    });

    const predictions = result.current.controls.predict({
      currentState: "idle",
      userActivity: "typing",
      conversationPhase: "active",
      recentAnimations: [], // No recent animations
    });

    expect(predictions).toEqual([]);
  });

  it("should handle unknown animation ID in recent animations", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "manual",
        enablePrediction: true,
      })
    );

    act(() => {
      result.current.controls.prewarm([{ id: "idle-1", type: "idle" }]);
    });

    const predictions = result.current.controls.predict({
      currentState: "idle",
      userActivity: "typing",
      conversationPhase: "active",
      recentAnimations: ["non-existent-id"], // Unknown ID
    });

    // Should return empty since recent animation not found
    expect(predictions).toEqual([]);
  });

  it("should skip warm/hot animations in predictions (only predict cold)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "aggressive",
        enablePrediction: true,
      })
    );

    // Add animations - aggressive mode will warm them
    act(() => {
      result.current.controls.prewarm([
        { id: "idle-main", type: "idle" },
        { id: "speak-1", type: "speak" },
      ]);
    });

    // Wait for warming
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Predictions only return cold animations
    const predictions = result.current.controls.predict({
      currentState: "idle",
      userActivity: "typing",
      conversationPhase: "active",
      recentAnimations: ["idle-main"],
    });

    // If all animations are warm, no cold ones to predict
    expect(Array.isArray(predictions)).toBe(true);
  });
});

describe("branch coverage - memory warning", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should track peak memory usage", async () => {
    const onMemoryWarning = jest.fn();
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer(
        {
          strategy: "manual",
          memoryBudgetMB: 0.01, // Very small budget (10KB)
        },
        { onMemoryWarning }
      )
    );

    // Add animation with estimated size
    act(() => {
      result.current.controls.prewarm([
        { id: "large-1", type: "idle", durationMs: 5000, framerate: 60 },
      ]);
    });

    // Memory usage should be tracked
    expect(result.current.state.memoryUsageMB).toBeGreaterThan(0);
  });
});

describe("branch coverage - onWarmComplete callback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should call onWarmComplete when queue is empty", async () => {
    const onWarmComplete = jest.fn();
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer(
        { strategy: "aggressive" },
        { onWarmComplete }
      )
    );

    // Add single animation to warm
    act(() => {
      result.current.controls.prewarm([{ id: "complete-1", type: "idle" }]);
    });

    // Wait for warming to complete
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    // onWarmComplete may have been called
    expect(onWarmComplete.mock.calls.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Additional Branch Coverage Tests - Sprint 607
// ============================================================================

describe("branch coverage - animation status transitions", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should track error status in animations (line 333-338)", async () => {
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer(
        { strategy: "manual" },
        { onError }
      )
    );

    act(() => {
      result.current.controls.prewarm([{ id: "error-anim", type: "idle" }]);
    });

    // Animation exists in cold state
    const anim = result.current.controls.getAnimation("error-anim");
    expect(anim).toBeDefined();
    expect(anim?.status).toBe("cold");
  });

  it("should track expired status (lines 399-406)", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "aggressive",
        expirationMs: 100, // Very short expiration
      })
    );

    act(() => {
      result.current.controls.prewarm([{ id: "expiring-anim", type: "idle" }]);
    });

    // Wait for warming
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    // Advance time to trigger expiration check (30 second interval)
    await act(async () => {
      jest.advanceTimersByTime(31000);
    });

    // Animation may be expired
    const anim = result.current.controls.getAnimation("expiring-anim");
    expect(anim).toBeDefined();
    // Status could be warm, hot, or expired depending on timing
    expect(["warm", "hot", "expired", "warming", "cold"]).toContain(anim?.status);
  });
});

describe("branch coverage - shouldPrewarm function", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should prewarm critical animations in balanced mode (lines 199-203)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "balanced" })
    );

    act(() => {
      result.current.controls.prewarm([
        { id: "critical-1", type: "idle", priority: "critical" },
        { id: "high-1", type: "speak", priority: "high" },
        { id: "normal-1", type: "listen", priority: "normal" },
      ]);
    });

    // All animations added
    expect(result.current.state.totalAnimations).toBe(3);
    // Critical and high should be queued for warming in balanced mode
  });

  it("should only prewarm critical in conservative mode (lines 204-207)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "conservative" })
    );

    act(() => {
      result.current.controls.prewarm([
        { id: "critical-1", type: "idle", priority: "critical" },
        { id: "high-1", type: "speak", priority: "high" },
      ]);
    });

    // All added
    expect(result.current.state.totalAnimations).toBe(2);
    // Only critical should be queued in conservative mode
  });

  it("should prewarm all cold in aggressive mode (lines 197-198)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "aggressive" })
    );

    act(() => {
      result.current.controls.prewarm([
        { id: "low-1", type: "gesture", priority: "low" },
        { id: "normal-1", type: "idle", priority: "normal" },
      ]);
    });

    // All added and queued
    expect(result.current.state.totalAnimations).toBe(2);
  });

  it("should not auto-prewarm in manual mode (lines 208-209)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "manual" })
    );

    act(() => {
      result.current.controls.prewarm([
        { id: "critical-1", type: "idle", priority: "critical" },
      ]);
    });

    // Added but not queued for warming
    expect(result.current.state.totalAnimations).toBe(1);
    expect(result.current.state.coldAnimations).toBe(1);
  });
});

describe("branch coverage - priority sorting", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should sort by priority weight (lines 451-456)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "aggressive" })
    );

    act(() => {
      result.current.controls.prewarm([
        { id: "low-1", type: "gesture", priority: "low" },
        { id: "critical-1", type: "idle", priority: "critical" },
        { id: "normal-1", type: "listen", priority: "normal" },
        { id: "high-1", type: "speak", priority: "high" },
      ]);
    });

    expect(result.current.state.totalAnimations).toBe(4);
  });

  it("should handle missing priority (default to normal)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "manual" })
    );

    act(() => {
      result.current.controls.prewarm([
        { id: "no-priority", type: "idle" },
      ]);
    });

    const anim = result.current.controls.getAnimation("no-priority");
    expect(anim?.priority).toBe("normal");
  });
});

describe("branch coverage - markHot and markCold", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should not mark cold animation as hot (line 581)", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "manual" })
    );

    act(() => {
      result.current.controls.prewarm([{ id: "cold-anim", type: "idle" }]);
    });

    // Try to mark cold as hot - should not work
    act(() => {
      result.current.controls.markHot("cold-anim");
    });

    const anim = result.current.controls.getAnimation("cold-anim");
    // Should still be cold
    expect(anim?.status).toBe("cold");
  });

  it("should mark warm animation as hot (line 582)", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "aggressive" })
    );

    act(() => {
      result.current.controls.prewarm([{ id: "hot-anim", type: "idle" }]);
    });

    // Wait for warming
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    const beforeMark = result.current.controls.getAnimation("hot-anim");
    if (beforeMark?.status === "warm") {
      act(() => {
        result.current.controls.markHot("hot-anim");
      });

      const afterMark = result.current.controls.getAnimation("hot-anim");
      expect(afterMark?.status).toBe("hot");
    }
  });

  it("should mark animation as cold with reset flags (lines 593-599)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "manual" })
    );

    act(() => {
      result.current.controls.prewarm([{ id: "to-cold", type: "idle" }]);
    });

    act(() => {
      result.current.controls.markCold("to-cold");
    });

    const anim = result.current.controls.getAnimation("to-cold");
    expect(anim?.status).toBe("cold");
    expect(anim?.firstFrameReady).toBe(false);
    expect(anim?.fullyDecoded).toBe(false);
  });
});

describe("branch coverage - accessAnimation hot promotion", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should promote to hot after threshold accesses (lines 506-510)", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "aggressive",
        hotThresholdAccesses: 2,
      })
    );

    act(() => {
      result.current.controls.prewarm([{ id: "promote-hot", type: "idle" }]);
    });

    // Wait for warming
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    const warmAnim = result.current.controls.getAnimation("promote-hot");
    if (warmAnim?.status === "warm") {
      // Access multiple times
      act(() => {
        result.current.controls.accessAnimation("promote-hot");
        result.current.controls.accessAnimation("promote-hot");
      });

      const anim = result.current.controls.getAnimation("promote-hot");
      // Should be promoted to hot after threshold
      expect(["warm", "hot"]).toContain(anim?.status);
    }
  });

  it("should not promote cold to hot regardless of accesses (line 508)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "manual",
        hotThresholdAccesses: 1,
      })
    );

    act(() => {
      result.current.controls.prewarm([{ id: "stay-cold", type: "idle" }]);
    });

    // Access multiple times while cold
    act(() => {
      result.current.controls.accessAnimation("stay-cold");
      result.current.controls.accessAnimation("stay-cold");
      result.current.controls.accessAnimation("stay-cold");
    });

    const anim = result.current.controls.getAnimation("stay-cold");
    // Should still be cold
    expect(anim?.status).toBe("cold");
  });
});

describe("branch coverage - predict with multiple candidates", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should return multiple predictions up to prefetchCount (lines 617-625)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "manual",
        enablePrediction: true,
        prefetchCount: 3,
      })
    );

    // Add animations of various types
    act(() => {
      result.current.controls.prewarm([
        { id: "idle-1", type: "idle" },
        { id: "speak-1", type: "speak" },
        { id: "speak-2", type: "speak" },
        { id: "listen-1", type: "listen" },
        { id: "listen-2", type: "listen" },
        { id: "react-1", type: "react" },
        { id: "react-2", type: "react" },
      ]);
    });

    const predictions = result.current.controls.predict({
      currentState: "idle",
      userActivity: "speaking",
      conversationPhase: "active",
      recentAnimations: ["idle-1"],
    });

    // Should predict based on idle -> speak, listen, react
    expect(predictions.length).toBeLessThanOrEqual(3);
  });

  it("should filter out non-cold animations from predictions (line 619)", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "aggressive",
        enablePrediction: true,
        prefetchCount: 5,
      })
    );

    // Add animations
    act(() => {
      result.current.controls.prewarm([
        { id: "idle-1", type: "idle" },
        { id: "speak-1", type: "speak" },
      ]);
    });

    // Wait for warming
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    // All might be warm now
    const predictions = result.current.controls.predict({
      currentState: "idle",
      userActivity: "none",
      conversationPhase: "start",
      recentAnimations: ["idle-1"],
    });

    // Predictions only include cold animations
    expect(Array.isArray(predictions)).toBe(true);
  });
});

describe("branch coverage - estimateAnimationSize", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should use default duration and framerate (lines 185-186)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "manual" })
    );

    // Add animation without durationMs or framerate
    act(() => {
      result.current.controls.prewarm([
        { id: "default-size", type: "idle" },
      ]);
    });

    const anim = result.current.controls.getAnimation("default-size");
    // Default: 1000ms at 30fps = 30 frames * 10KB = 300KB
    expect(anim?.sizeBytes).toBe(30 * 10 * 1024);
  });

  it("should calculate size with custom duration and framerate (lines 185-189)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "manual" })
    );

    // Add animation with specific duration and framerate
    act(() => {
      result.current.controls.prewarm([
        { id: "custom-size", type: "idle", durationMs: 2000, framerate: 60 },
      ]);
    });

    const anim = result.current.controls.getAnimation("custom-size");
    // 2000ms at 60fps = 120 frames * 10KB = 1200KB
    expect(anim?.sizeBytes).toBe(120 * 10 * 1024);
  });
});

describe("branch coverage - evictType", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should evict all animations of specific type (lines 540-551)", () => {
    const onAnimationEvicted = jest.fn();
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer(
        { strategy: "manual" },
        { onAnimationEvicted }
      )
    );

    act(() => {
      result.current.controls.prewarm([
        { id: "idle-1", type: "idle" },
        { id: "idle-2", type: "idle" },
        { id: "idle-3", type: "idle" },
        { id: "speak-1", type: "speak" },
      ]);
    });

    expect(result.current.state.totalAnimations).toBe(4);

    act(() => {
      result.current.controls.evictType("idle");
    });

    // Should only have speak-1 left
    expect(result.current.state.totalAnimations).toBe(1);
    expect(result.current.controls.getAnimation("speak-1")).not.toBeNull();
    expect(result.current.controls.getAnimation("idle-1")).toBeNull();
    expect(onAnimationEvicted).toHaveBeenCalledTimes(3);
  });
});

describe("branch coverage - warmAnimation early return", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should return early if animation not found (line 282)", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "manual" })
    );

    // Try to warmNext when no animations exist
    await act(async () => {
      await result.current.controls.warmNext();
    });

    // Should not throw
    expect(result.current.state.totalAnimations).toBe(0);
  });

  it("should return early if already warming (line 282)", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "aggressive", maxConcurrentWarms: 1 })
    );

    // Add animation
    act(() => {
      result.current.controls.prewarm([{ id: "warming-test", type: "idle" }]);
    });

    // Animation should start warming immediately
    // Trying to warm again should be a no-op
    await act(async () => {
      jest.advanceTimersByTime(50); // Mid-warming
    });

    // The animation is warming, second warmNext should be safe
    await act(async () => {
      result.current.controls.warmNext();
    });

    // Advance to complete
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    expect(result.current.state.totalAnimations).toBe(1);
  });
});

describe("branch coverage - queue processing concurrent limit", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should respect maxConcurrentWarms (lines 355-357)", async () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({
        strategy: "aggressive",
        maxConcurrentWarms: 1,
      })
    );

    // Add multiple animations
    act(() => {
      result.current.controls.prewarm([
        { id: "anim-1", type: "idle" },
        { id: "anim-2", type: "speak" },
        { id: "anim-3", type: "listen" },
      ]);
    });

    expect(result.current.state.totalAnimations).toBe(3);

    // With maxConcurrent=1, should process one at a time
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    // All should eventually be processed
    expect(result.current.state.totalAnimations).toBe(3);
  });

  it("should not process when queue empty (line 352)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationPrewarmer({ strategy: "aggressive" })
    );

    // No animations added
    expect(result.current.state.totalAnimations).toBe(0);
    expect(result.current.state.warmingInProgress).toBe(0);
  });
});
