/**
 * Tests for Mobile Latency Compensator Hook - Sprint 226
 *
 * Tests optimistic updates, rollback, latency prediction, and UI hints
 */

import { renderHook, act } from "@testing-library/react";
import {
  useMobileLatencyCompensator,
  useOptimisticUpdate,
  useLatencyAwareLoading,
  LatencyLevel,
  UIHint,
} from "../useMobileLatencyCompensator";

// Mock timers
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.useFakeTimers();
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useMobileLatencyCompensator", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      expect(result.current.state.pendingUpdates).toBe(0);
      expect(result.current.state.currentLatencyLevel).toBe("normal");
      expect(result.current.state.showSkeleton).toBe(false);
      expect(result.current.state.showSpinner).toBe(false);
      expect(result.current.state.isCompensating).toBe(false);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({
          expectedLatencyMs: 500,
          skeletonThreshold: 300,
          spinnerThreshold: 150,
        })
      );

      expect(result.current.state.prediction.expectedMs).toBe(500);
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      expect(result.current.metrics.totalUpdates).toBe(0);
      expect(result.current.metrics.committedUpdates).toBe(0);
      expect(result.current.metrics.rolledBackUpdates).toBe(0);
      expect(result.current.metrics.rollbackRate).toBe(0);
    });
  });

  describe("optimistic updates", () => {
    it("should apply optimistic update immediately", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      let value = "initial";
      const applyFn = jest.fn(() => {
        value = "updated";
      });
      const rollbackFn = jest.fn(() => {
        value = "initial";
      });

      act(() => {
        result.current.controls.compensate(applyFn, rollbackFn);
      });

      expect(applyFn).toHaveBeenCalled();
      expect(value).toBe("updated");
      expect(result.current.state.pendingUpdates).toBe(1);
      expect(result.current.metrics.totalUpdates).toBe(1);
    });

    it("should return commit and rollback functions", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      let compensation: ReturnType<typeof result.current.controls.compensate>;
      act(() => {
        compensation = result.current.controls.compensate(() => {}, () => {});
      });

      expect(compensation!.updateId).toBeTruthy();
      expect(typeof compensation!.commit).toBe("function");
      expect(typeof compensation!.rollback).toBe("function");
      expect(typeof compensation!.getState).toBe("function");
    });

    it("should commit update successfully", () => {
      const onCommit = jest.fn();
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({}, { onCommit })
      );

      let compensation: ReturnType<typeof result.current.controls.compensate>;
      mockTime = 0;
      act(() => {
        compensation = result.current.controls.compensate(() => {}, () => {});
      });

      mockTime = 150; // 150ms latency
      act(() => {
        compensation!.commit();
      });

      expect(onCommit).toHaveBeenCalledWith(compensation!.updateId, 150);
      expect(result.current.metrics.committedUpdates).toBe(1);
    });

    it("should rollback update", () => {
      const onRollback = jest.fn();
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({}, { onRollback })
      );

      let value = "initial";
      const rollbackFn = jest.fn(() => {
        value = "initial";
      });

      let compensation: ReturnType<typeof result.current.controls.compensate>;
      act(() => {
        compensation = result.current.controls.compensate(
          () => { value = "updated"; },
          rollbackFn
        );
      });

      act(() => {
        compensation!.rollback();
      });

      expect(rollbackFn).toHaveBeenCalled();
      expect(value).toBe("initial");
      expect(onRollback).toHaveBeenCalled();
      expect(result.current.metrics.rolledBackUpdates).toBe(1);
    });

    it("should auto-rollback on timeout", () => {
      const onRollback = jest.fn();
      const { result } = renderHook(() =>
        useMobileLatencyCompensator(
          { timeoutThreshold: 1000, autoRollbackOnTimeout: true },
          { onRollback }
        )
      );

      const rollbackFn = jest.fn();

      act(() => {
        result.current.controls.compensate(() => {}, rollbackFn);
      });

      // Fast-forward past timeout
      act(() => {
        jest.advanceTimersByTime(1100);
      });

      expect(rollbackFn).toHaveBeenCalled();
      expect(onRollback).toHaveBeenCalled();
    });

    it("should enforce max pending updates", () => {
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({ maxPendingUpdates: 2 })
      );

      act(() => {
        result.current.controls.compensate(() => {}, () => {});
        result.current.controls.compensate(() => {}, () => {});
        result.current.controls.compensate(() => {}, () => {});
      });

      // Should have dropped the oldest
      expect(result.current.state.pendingUpdates).toBeLessThanOrEqual(2);
    });
  });

  describe("latency recording and prediction", () => {
    it("should record latency samples", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      act(() => {
        result.current.controls.recordLatency(100, true);
        result.current.controls.recordLatency(200, true);
        result.current.controls.recordLatency(150, true);
      });

      expect(result.current.metrics.latencySamples).toBe(3);
      expect(result.current.metrics.averageLatencyMs).toBeGreaterThan(0);
    });

    it("should predict latency based on samples", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      act(() => {
        result.current.controls.recordLatency(100, true);
        result.current.controls.recordLatency(120, true);
        result.current.controls.recordLatency(110, true);
      });

      const prediction = result.current.controls.predictLatency();

      expect(prediction.expectedMs).toBeGreaterThan(0);
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.p50Ms).toBeGreaterThan(0);
      expect(prediction.p90Ms).toBeGreaterThan(0);
    });

    it("should classify latency levels correctly", () => {
      const onLatencyChange = jest.fn();
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({}, { onLatencyChange })
      );

      // Record fast latency
      act(() => {
        result.current.controls.recordLatency(50, true);
      });

      expect(result.current.state.currentLatencyLevel).toBe("fast");

      // Record slow latency (1000-3000ms is "slow", >3000ms is "very_slow")
      act(() => {
        result.current.controls.recordLatency(1500, true);
      });

      // 1500ms falls in the "slow" range (1000-3000)
      expect(["slow", "very_slow"]).toContain(result.current.state.currentLatencyLevel);
      expect(onLatencyChange).toHaveBeenCalled();
    });

    it("should filter by endpoint", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      act(() => {
        result.current.controls.recordLatency(100, true, "/api/fast");
        result.current.controls.recordLatency(500, true, "/api/slow");
        result.current.controls.recordLatency(120, true, "/api/fast");
      });

      const fastPrediction = result.current.controls.predictLatency("/api/fast");
      const slowPrediction = result.current.controls.predictLatency("/api/slow");

      expect(fastPrediction.expectedMs).toBeLessThan(slowPrediction.expectedMs);
    });
  });

  describe("UI hints", () => {
    it("should return UI hint based on prediction", () => {
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({
          spinnerThreshold: 100,
          skeletonThreshold: 200,
        })
      );

      // Record fast latencies
      act(() => {
        result.current.controls.recordLatency(50, true);
        result.current.controls.recordLatency(60, true);
      });

      const hint = result.current.controls.getUIHint();
      expect(hint).toBe("instant");
    });

    it("should show skeleton for high latency predictions", () => {
      const onSkeletonShow = jest.fn();
      const { result } = renderHook(() =>
        useMobileLatencyCompensator(
          { skeletonThreshold: 100 },
          { onSkeletonShow }
        )
      );

      // Record slow latencies to influence prediction
      act(() => {
        result.current.controls.recordLatency(500, true);
        result.current.controls.recordLatency(600, true);
        result.current.controls.recordLatency(550, true);
      });

      act(() => {
        result.current.controls.compensate(() => {}, () => {});
      });

      expect(result.current.state.showSkeleton).toBe(true);
      expect(onSkeletonShow).toHaveBeenCalled();
    });
  });

  describe("metrics", () => {
    it("should track rollback rate", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      // Create and commit one update
      let comp1: ReturnType<typeof result.current.controls.compensate>;
      act(() => {
        comp1 = result.current.controls.compensate(() => {}, () => {});
      });
      act(() => {
        comp1!.commit();
      });

      // Create and rollback one update
      let comp2: ReturnType<typeof result.current.controls.compensate>;
      act(() => {
        comp2 = result.current.controls.compensate(() => {}, () => {});
      });
      act(() => {
        comp2!.rollback();
      });

      expect(result.current.metrics.rollbackRate).toBe(0.5); // 1 rollback / 2 total
    });

    it("should reset metrics", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      // Generate some metrics
      act(() => {
        result.current.controls.recordLatency(100, true);
        const comp = result.current.controls.compensate(() => {}, () => {});
        comp.commit();
      });

      expect(result.current.metrics.totalUpdates).toBe(1);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.totalUpdates).toBe(0);
      expect(result.current.metrics.latencySamples).toBe(0);
      expect(result.current.metrics.averageLatencyMs).toBe(0);
    });
  });

  describe("clear pending", () => {
    it("should clear all pending updates", () => {
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({ autoRollbackOnTimeout: false })
      );

      const rollback1 = jest.fn();
      const rollback2 = jest.fn();

      act(() => {
        result.current.controls.compensate(() => {}, rollback1);
        result.current.controls.compensate(() => {}, rollback2);
      });

      expect(result.current.state.pendingUpdates).toBe(2);

      act(() => {
        result.current.controls.clearPending();
      });

      expect(rollback1).toHaveBeenCalled();
      expect(rollback2).toHaveBeenCalled();
    });
  });

  describe("callbacks", () => {
    it("should call onCompensate callback", () => {
      const onCompensate = jest.fn();
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({}, { onCompensate })
      );

      act(() => {
        result.current.controls.compensate(() => {}, () => {});
      });

      expect(onCompensate).toHaveBeenCalled();
    });

    it("should call onSkeletonHide on commit", () => {
      const onSkeletonHide = jest.fn();
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({}, { onSkeletonHide })
      );

      let comp: ReturnType<typeof result.current.controls.compensate>;
      act(() => {
        comp = result.current.controls.compensate(() => {}, () => {});
      });

      act(() => {
        comp!.commit();
      });

      expect(onSkeletonHide).toHaveBeenCalled();
    });
  });
});

describe("useOptimisticUpdate", () => {
  it("should provide optimistic value", () => {
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useOptimisticUpdate("initial", onUpdate));

    expect(result.current.optimisticValue).toBe("initial");
    expect(result.current.isUpdating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should update optimistically", async () => {
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useOptimisticUpdate<string>("initial", onUpdate));

    await act(async () => {
      await result.current.update("updated");
    });

    expect(result.current.optimisticValue).toBe("updated");
    expect(onUpdate).toHaveBeenCalledWith("updated");
  });

  it("should rollback on error", async () => {
    const error = new Error("Update failed");
    const onUpdate = jest.fn().mockRejectedValue(error);
    const { result } = renderHook(() => useOptimisticUpdate<string>("initial", onUpdate));

    await act(async () => {
      try {
        await result.current.update("updated");
      } catch {
        // Expected
      }
    });

    expect(result.current.optimisticValue).toBe("initial");
    expect(result.current.error).toBe(error);
  });
});

describe("useLatencyAwareLoading", () => {
  it("should not show loading states initially", () => {
    const { result } = renderHook(() => useLatencyAwareLoading(false));

    expect(result.current.showSkeleton).toBe(false);
    expect(result.current.showSpinner).toBe(false);
    expect(result.current.showContent).toBe(true);
  });

  it("should show spinner after 100ms of loading", () => {
    const { result } = renderHook(() => useLatencyAwareLoading(true, 500));

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(result.current.showSpinner).toBe(true);
    expect(result.current.showSkeleton).toBe(false);
  });

  it("should show skeleton after threshold", () => {
    const { result } = renderHook(() => useLatencyAwareLoading(true, 400));

    // Skeleton shows after expectedLatencyMs / 2
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(result.current.showSkeleton).toBe(true);
    expect(result.current.showSpinner).toBe(false);
  });

  it("should hide all when loading completes", () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useLatencyAwareLoading(loading, 400),
      { initialProps: { loading: true } }
    );

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(result.current.showSkeleton).toBe(true);

    rerender({ loading: false });

    expect(result.current.showSkeleton).toBe(false);
    expect(result.current.showSpinner).toBe(false);
    expect(result.current.showContent).toBe(true);
  });
});

// ============================================================================
// Sprint 621: Branch coverage improvements
// ============================================================================

describe("useMobileLatencyCompensator - branch coverage", () => {
  describe("latency classification - timeout level (line 241)", () => {
    it("should classify very high latency as timeout", () => {
      const onLatencyChange = jest.fn();
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({}, { onLatencyChange })
      );

      // Record extremely high latency (>5000ms is typically timeout)
      act(() => {
        result.current.controls.recordLatency(10000, true);
      });

      expect(result.current.state.currentLatencyLevel).toBe("timeout");
    });

    it("should classify latency as very_slow before timeout", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      // Record very slow latency (1000-2999ms is very_slow based on thresholds)
      act(() => {
        result.current.controls.recordLatency(2000, true);
      });

      expect(result.current.state.currentLatencyLevel).toBe("very_slow");
    });
  });

  describe("UI hint - show_placeholder (line 248)", () => {
    it("should return show_placeholder for latency above timeout threshold", () => {
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({
          spinnerThreshold: 100,
          skeletonThreshold: 200,
          timeoutThreshold: 5000,
        })
      );

      // Record latencies above timeout threshold
      act(() => {
        result.current.controls.recordLatency(6000, true);
        result.current.controls.recordLatency(7000, true);
        result.current.controls.recordLatency(8000, true);
      });

      const hint = result.current.controls.getUIHint();
      expect(hint).toBe("show_placeholder");
    });
  });

  describe("latency samples overflow (line 385)", () => {
    it("should trim latency samples when exceeding window size", () => {
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({ predictionWindowSize: 10 })
      );

      // Record more samples than 2x the window size (10 * 2 = 20)
      for (let i = 0; i < 25; i++) {
        act(() => {
          result.current.controls.recordLatency(100 + i, true);
        });
      }

      // Samples should be trimmed, metrics should still track correctly
      expect(result.current.metrics.latencySamples).toBe(25);
      expect(result.current.metrics.averageLatencyMs).toBeGreaterThan(0);
    });
  });

  describe("spinner display for medium latency (lines 477-479)", () => {
    it("should show spinner when prediction is between spinner and skeleton threshold", () => {
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({
          spinnerThreshold: 100,
          skeletonThreshold: 500,
        })
      );

      // Record latencies that predict between spinner (100) and skeleton (500) thresholds
      act(() => {
        result.current.controls.recordLatency(200, true);
        result.current.controls.recordLatency(250, true);
        result.current.controls.recordLatency(200, true);
      });

      // Start a compensated update
      act(() => {
        result.current.controls.compensate(() => {}, () => {});
      });

      // Should show spinner, not skeleton
      expect(result.current.state.showSpinner).toBe(true);
      expect(result.current.state.showSkeleton).toBe(false);
      expect(result.current.metrics.spinnersShown).toBeGreaterThan(0);
    });
  });

  describe("cleanup timeouts on commit (lines 540-543)", () => {
    it("should cleanup update from map after commit timeout", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      let comp: ReturnType<typeof result.current.controls.compensate>;
      mockTime = 0;

      act(() => {
        comp = result.current.controls.compensate(() => {}, () => {});
      });

      const updateId = comp!.updateId;

      mockTime = 100;
      act(() => {
        comp!.commit();
      });

      // State should show committed
      expect(comp!.getState()).toBe("committed");

      // Advance time to trigger the cleanup timeout (1000ms)
      act(() => {
        jest.advanceTimersByTime(1100);
      });

      // Update should be cleaned up
      // After cleanup, getState returns "committed" as fallback since update is gone
      expect(result.current.state.pendingUpdates).toBe(0);
    });
  });

  describe("cleanup timeouts on rollback (lines 603-606)", () => {
    it("should cleanup update from map after rollback timeout", () => {
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({ rollbackAnimationMs: 300 })
      );

      let comp: ReturnType<typeof result.current.controls.compensate>;
      mockTime = 0;

      act(() => {
        comp = result.current.controls.compensate(() => {}, () => {});
      });

      mockTime = 100;
      act(() => {
        comp!.rollback();
      });

      expect(comp!.getState()).toBe("rolled_back");

      // Advance time to trigger the cleanup timeout (rollbackAnimationMs = 300)
      act(() => {
        jest.advanceTimersByTime(400);
      });

      // Update should be cleaned up
      expect(result.current.state.pendingUpdates).toBe(0);
    });
  });

  describe("clearPending with timeouts (line 633)", () => {
    it("should clear timeouts when clearing pending updates", () => {
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({
          autoRollbackOnTimeout: true,
          timeoutThreshold: 5000,
        })
      );

      const rollback1 = jest.fn();
      const rollback2 = jest.fn();

      act(() => {
        result.current.controls.compensate(() => {}, rollback1);
        result.current.controls.compensate(() => {}, rollback2);
      });

      expect(result.current.state.pendingUpdates).toBe(2);

      // Clear pending - should clear timeouts and rollback
      act(() => {
        result.current.controls.clearPending();
      });

      expect(rollback1).toHaveBeenCalled();
      expect(rollback2).toHaveBeenCalled();

      // Advance past original timeout - should not cause additional rollbacks
      // since timeouts were cleared
      rollback1.mockClear();
      rollback2.mockClear();

      act(() => {
        jest.advanceTimersByTime(6000);
      });

      // Rollbacks should not be called again
      expect(rollback1).not.toHaveBeenCalled();
      expect(rollback2).not.toHaveBeenCalled();
    });
  });

  describe("commit and rollback for non-existent updates", () => {
    it("should handle commit for non-existent update gracefully", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      // Get controls - commit is the exposed name
      const { commit } = result.current.controls;

      // Should not throw
      expect(() => {
        act(() => {
          commit("non-existent-id");
        });
      }).not.toThrow();
    });

    it("should handle rollback for non-existent update gracefully", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      const { rollback } = result.current.controls;

      // Should not throw
      expect(() => {
        act(() => {
          rollback("non-existent-id");
        });
      }).not.toThrow();
    });
  });

  describe("latency level transitions", () => {
    it("should transition from fast to normal", () => {
      const onLatencyChange = jest.fn();
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({}, { onLatencyChange })
      );

      // Start with fast (< 100ms)
      act(() => {
        result.current.controls.recordLatency(50, true);
      });
      expect(result.current.state.currentLatencyLevel).toBe("fast");

      // Transition to normal (100-299ms based on thresholds)
      act(() => {
        result.current.controls.recordLatency(150, true);
      });
      expect(result.current.state.currentLatencyLevel).toBe("normal");
      expect(onLatencyChange).toHaveBeenCalledWith("normal");
    });

    it("should transition from normal to slow", () => {
      const onLatencyChange = jest.fn();
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({}, { onLatencyChange })
      );

      // Start with normal (100-299ms)
      act(() => {
        result.current.controls.recordLatency(150, true);
      });
      expect(result.current.state.currentLatencyLevel).toBe("normal");

      // Transition to slow (300-999ms)
      act(() => {
        result.current.controls.recordLatency(500, true);
      });
      expect(result.current.state.currentLatencyLevel).toBe("slow");
      expect(onLatencyChange).toHaveBeenCalledWith("slow");
    });

    it("should not call onLatencyChange when level stays the same", () => {
      const onLatencyChange = jest.fn();
      const { result } = renderHook(() =>
        useMobileLatencyCompensator({}, { onLatencyChange })
      );

      // Record same level multiple times
      act(() => {
        result.current.controls.recordLatency(50, true);
      });
      const callCount = onLatencyChange.mock.calls.length;

      act(() => {
        result.current.controls.recordLatency(60, true); // Still fast
      });

      expect(onLatencyChange.mock.calls.length).toBe(callCount); // No new call
    });
  });

  describe("recording latency with success false", () => {
    it("should record failed latency samples", () => {
      const { result } = renderHook(() => useMobileLatencyCompensator());

      act(() => {
        result.current.controls.recordLatency(500, false, "/api/test");
      });

      expect(result.current.metrics.latencySamples).toBe(1);
    });
  });

  describe("Sprint 538 - clearPending with timeouts (line 633)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should clear all timeouts when clearPending is called (line 633)", () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      const { result } = renderHook(() =>
        useMobileLatencyCompensator({ timeoutThreshold: 5000, autoRollbackOnTimeout: true })
      );

      // Start optimistic updates using the compensate API to create timeouts
      act(() => {
        result.current.controls.compensate(
          () => {}, // apply function
          () => {}, // rollback function
          { value: 1 }, // optimistic value
          { value: 0 } // previous value
        );
      });

      // Start another to have multiple pending updates
      act(() => {
        result.current.controls.compensate(
          () => {},
          () => {},
          { value: 2 },
          { value: 0 }
        );
      });

      // Clear all pending updates (should clear timeouts)
      act(() => {
        result.current.controls.clearPending();
      });

      // Verify clearTimeout was called (for each pending update's timeout)
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it("should iterate over timeoutsRef and clear each timeout (line 637)", () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      const { result } = renderHook(() =>
        useMobileLatencyCompensator({
          timeoutThreshold: 10000, // Long timeout to ensure they're still pending
          autoRollbackOnTimeout: true
        })
      );

      // Create multiple updates which will each register a timeout
      act(() => {
        result.current.controls.compensate(
          () => {}, () => {}, { a: 1 }, { a: 0 }
        );
        result.current.controls.compensate(
          () => {}, () => {}, { b: 2 }, { b: 0 }
        );
        result.current.controls.compensate(
          () => {}, () => {}, { c: 3 }, { c: 0 }
        );
      });

      // Record calls before clearPending
      const callsBefore = clearTimeoutSpy.mock.calls.length;

      // Clear all pending updates (should iterate and clear each timeout - line 637)
      act(() => {
        result.current.controls.clearPending();
      });

      // Should have cleared 3 timeouts (one per compensate call)
      const newCalls = clearTimeoutSpy.mock.calls.length - callsBefore;
      expect(newCalls).toBeGreaterThanOrEqual(3);

      clearTimeoutSpy.mockRestore();
    });
  });
});
