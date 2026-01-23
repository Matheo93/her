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
  type LatencyLevel,
  type UIHint,
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
