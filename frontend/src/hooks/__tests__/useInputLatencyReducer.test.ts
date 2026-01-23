/**
 * Tests for useInputLatencyReducer hook - Sprint 529
 *
 * Tests:
 * - Initialization and default state
 * - setValue with optimistic updates
 * - Commit functionality
 * - Rollback functionality
 * - Prediction functionality
 * - Batching functionality
 * - Latency measurement and statistics
 * - Auto-rollback on timeout
 * - Convenience hooks (useOptimisticTextInput, useAutoSaveInput)
 */

import { renderHook, act } from "@testing-library/react";
import useInputLatencyReducer, {
  useOptimisticTextInput,
  useAutoSaveInput,
  InputLatencyConfig,
  PredictedInput,
} from "../useInputLatencyReducer";

describe("useInputLatencyReducer", () => {
  let mockTime: number;

  beforeEach(() => {
    mockTime = 1000;
    jest.useFakeTimers();
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);
    jest.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      expect(result.current.state.currentValue).toBe("initial");
      expect(result.current.state.optimisticValue).toBe("initial");
      expect(result.current.state.isOptimistic).toBe(false);
      expect(result.current.state.pendingUpdates).toEqual([]);
      expect(result.current.state.predictions).toEqual([]);
      expect(result.current.displayValue).toBe("initial");
      expect(result.current.isCommitting).toBe(false);
      expect(result.current.hasPendingChanges).toBe(false);
    });

    it("should initialize with default latency stats", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      expect(result.current.state.latencyStats).toEqual({
        current: 0,
        average: 0,
        p50: 0,
        p95: 0,
        samples: 0,
        trend: "stable",
      });
    });

    it("should initialize metrics", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      expect(result.current.metrics.optimisticUpdates).toBe(0);
      expect(result.current.metrics.successfulPredictions).toBe(0);
      expect(result.current.metrics.rollbacks).toBe(0);
      expect(result.current.metrics.batchesSent).toBe(0);
      expect(result.current.metrics.averageLatency).toBe(0);
      expect(result.current.metrics.perceivedLatency).toBe(0);
    });

    it("should work with custom config", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const config: Partial<InputLatencyConfig> = {
        enabled: false,
        optimisticEnabled: false,
        predictionEnabled: false,
      };
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, config)
      );

      expect(result.current.state.currentValue).toBe("initial");
    });

    it("should work with different value types", () => {
      const onCommit = jest.fn().mockResolvedValue({ name: "updated" });
      const { result } = renderHook(() =>
        useInputLatencyReducer<{ name: string }>({ name: "initial" }, onCommit)
      );

      expect(result.current.state.currentValue).toEqual({ name: "initial" });
    });
  });

  // ============================================================================
  // setValue Tests
  // ============================================================================

  describe("setValue", () => {
    it("should set value optimistically", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("updated");
      });

      expect(result.current.state.optimisticValue).toBe("updated");
      expect(result.current.state.isOptimistic).toBe(true);
      expect(result.current.displayValue).toBe("updated");
      expect(result.current.hasPendingChanges).toBe(true);
    });

    it("should track optimistic updates in metrics", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("updated1");
      });

      expect(result.current.metrics.optimisticUpdates).toBe(1);

      act(() => {
        result.current.controls.setValue("updated2");
      });

      expect(result.current.metrics.optimisticUpdates).toBe(2);
    });

    it("should add pending update", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("updated");
      });

      expect(result.current.state.pendingUpdates.length).toBe(1);
      expect(result.current.state.pendingUpdates[0].optimisticValue).toBe(
        "updated"
      );
      expect(result.current.state.pendingUpdates[0].status).toBe("pending");
      expect(result.current.state.pendingUpdates[0].rollbackValue).toBe(
        "initial"
      );
    });

    it("should not be optimistic when optimisticEnabled is false", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, { optimisticEnabled: false })
      );

      act(() => {
        result.current.controls.setValue("updated");
      });

      expect(result.current.state.isOptimistic).toBe(false);
      expect(result.current.state.currentValue).toBe("updated");
      expect(result.current.state.optimisticValue).toBe("updated");
    });

    it("should update directly when disabled", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, { enabled: false })
      );

      act(() => {
        result.current.controls.setValue("updated");
      });

      expect(result.current.state.currentValue).toBe("updated");
      expect(result.current.state.optimisticValue).toBe("updated");
      expect(result.current.state.isOptimistic).toBe(false);
    });

    it("should trigger batch when commit is true", async () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, { batchDelayMs: 100 })
      );

      act(() => {
        result.current.controls.setValue("updated", true);
      });

      expect(result.current.state.optimisticValue).toBe("updated");

      // Batch should be pending - advance timers
      await act(async () => {
        mockTime += 100;
        jest.advanceTimersByTime(100);
        // Let promises resolve
        await Promise.resolve();
      });

      expect(onCommit).toHaveBeenCalledWith("updated");
    });
  });

  // ============================================================================
  // Commit Tests
  // ============================================================================

  describe("commit", () => {
    it("should commit current optimistic value", async () => {
      const onCommit = jest.fn().mockImplementation(async () => {
        mockTime += 100;
        return "committed-result";
      });
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("to-commit");
      });

      let commitResult: string | undefined;
      await act(async () => {
        commitResult = await result.current.controls.commit();
      });

      expect(commitResult).toBe("committed-result");
      expect(result.current.state.currentValue).toBe("committed-result");
      expect(result.current.state.optimisticValue).toBe("committed-result");
      expect(result.current.state.isOptimistic).toBe(false);
    });

    it("should update pending updates status to confirmed", async () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("to-commit");
      });

      await act(async () => {
        mockTime += 50;
        await result.current.controls.commit();
      });

      expect(
        result.current.state.pendingUpdates.some((u) => u.status === "confirmed")
      ).toBe(true);
    });

    it("should rollback on commit failure", async () => {
      const onCommit = jest.fn().mockRejectedValue(new Error("Commit failed"));
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("to-commit");
      });

      await act(async () => {
        mockTime += 50;
        try {
          await result.current.controls.commit();
        } catch {
          // Expected error
        }
      });

      expect(result.current.state.optimisticValue).toBe("initial");
      expect(result.current.state.isOptimistic).toBe(false);
      expect(result.current.metrics.rollbacks).toBe(1);
    });

    it("should mark pending updates as failed on commit failure", async () => {
      const onCommit = jest.fn().mockRejectedValue(new Error("Commit failed"));
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("to-commit");
      });

      await act(async () => {
        mockTime += 50;
        try {
          await result.current.controls.commit();
        } catch {
          // Expected
        }
      });

      expect(
        result.current.state.pendingUpdates.some((u) => u.status === "failed")
      ).toBe(true);
    });

    it("should measure latency during commit", async () => {
      const onCommit = jest.fn().mockImplementation(async () => {
        mockTime += 150;
        return "committed";
      });

      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("to-commit");
      });

      await act(async () => {
        await result.current.controls.commit();
      });

      expect(result.current.state.latencyStats.current).toBe(150);
      expect(result.current.state.latencyStats.samples).toBe(1);
    });
  });

  // ============================================================================
  // Rollback Tests
  // ============================================================================

  describe("rollback", () => {
    it("should rollback to current value", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("updated");
      });

      expect(result.current.state.optimisticValue).toBe("updated");

      act(() => {
        result.current.controls.rollback();
      });

      expect(result.current.state.optimisticValue).toBe("initial");
      expect(result.current.state.isOptimistic).toBe(false);
    });

    it("should increment rollbacks metric", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("updated");
      });

      act(() => {
        result.current.controls.rollback();
      });

      expect(result.current.metrics.rollbacks).toBe(1);
    });

    it("should mark pending updates as rolled_back", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("updated");
      });

      act(() => {
        result.current.controls.rollback();
      });

      expect(
        result.current.state.pendingUpdates.some(
          (u) => u.status === "rolled_back"
        )
      ).toBe(true);
    });

    it("should auto-rollback after timeout", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, { rollbackDelayMs: 1000 })
      );

      act(() => {
        result.current.controls.setValue("updated");
      });

      expect(result.current.state.optimisticValue).toBe("updated");

      // Advance time past rollback delay
      act(() => {
        mockTime += 1000;
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.state.optimisticValue).toBe("initial");
      expect(result.current.state.isOptimistic).toBe(false);
    });

    it("should clear rollback timer on manual rollback", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, { rollbackDelayMs: 5000 })
      );

      act(() => {
        result.current.controls.setValue("updated");
      });

      // Manual rollback before auto-rollback
      act(() => {
        result.current.controls.rollback();
      });

      expect(result.current.metrics.rollbacks).toBe(1);

      // Advance time past original rollback delay
      act(() => {
        mockTime += 5000;
        jest.advanceTimersByTime(5000);
      });

      // Should still be only 1 rollback (auto-rollback was cancelled)
      expect(result.current.metrics.rollbacks).toBe(1);
    });
  });

  // ============================================================================
  // Prediction Tests
  // ============================================================================

  describe("prediction", () => {
    it("should return predictions for partial input", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("", onCommit)
      );

      let predictions: PredictedInput[] = [];
      act(() => {
        predictions = result.current.controls.predict("hel");
      });

      expect(predictions.length).toBeGreaterThan(0);
      expect(predictions.some((p) => p.value === "hello")).toBe(true);
      expect(predictions.some((p) => p.value === "help")).toBe(true);
    });

    it("should not return predictions for short input", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("", onCommit)
      );

      let predictions: PredictedInput[] = [];
      act(() => {
        predictions = result.current.controls.predict("h");
      });

      expect(predictions.length).toBe(0);
    });

    it("should not return predictions when disabled", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("", onCommit, { predictionEnabled: false })
      );

      let predictions: PredictedInput[] = [];
      act(() => {
        predictions = result.current.controls.predict("hel");
      });

      expect(predictions.length).toBe(0);
    });

    it("should update state.predictions", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("", onCommit)
      );

      act(() => {
        result.current.controls.predict("hel");
      });

      expect(result.current.state.predictions.length).toBeGreaterThan(0);
    });

    it("should sort predictions by confidence", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("", onCommit)
      );

      let predictions: PredictedInput[] = [];
      act(() => {
        predictions = result.current.controls.predict("hel");
      });

      for (let i = 1; i < predictions.length; i++) {
        expect(predictions[i - 1].confidence).toBeGreaterThanOrEqual(
          predictions[i].confidence
        );
      }
    });

    it("should return max 5 predictions", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("", onCommit)
      );

      let predictions: PredictedInput[] = [];
      act(() => {
        predictions = result.current.controls.predict("th");
      });

      expect(predictions.length).toBeLessThanOrEqual(5);
    });
  });

  // ============================================================================
  // Accept Prediction Tests
  // ============================================================================

  describe("acceptPrediction", () => {
    it("should accept prediction above confidence threshold", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("", onCommit, {
          predictionConfidenceThreshold: 0.5,
        })
      );

      const prediction: PredictedInput = {
        value: "hello",
        confidence: 0.8,
        source: "common",
      };

      act(() => {
        result.current.controls.acceptPrediction(prediction);
      });

      expect(result.current.state.optimisticValue).toBe("hello");
      expect(result.current.metrics.successfulPredictions).toBe(1);
    });

    it("should not accept prediction below confidence threshold", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, {
          predictionConfidenceThreshold: 0.8,
        })
      );

      const prediction: PredictedInput = {
        value: "hello",
        confidence: 0.5,
        source: "common",
      };

      act(() => {
        result.current.controls.acceptPrediction(prediction);
      });

      expect(result.current.state.optimisticValue).toBe("initial");
      expect(result.current.metrics.successfulPredictions).toBe(0);
    });
  });

  // ============================================================================
  // Batching Tests
  // ============================================================================

  describe("batching", () => {
    it("should batch multiple setValue calls with commit=true", async () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, {
          batchDelayMs: 100,
          batchingEnabled: true,
        })
      );

      act(() => {
        result.current.controls.setValue("update1", true);
        result.current.controls.setValue("update2", true);
        result.current.controls.setValue("update3", true);
      });

      // onCommit not called yet
      expect(onCommit).not.toHaveBeenCalled();

      // After batch delay, should call with last value
      await act(async () => {
        mockTime += 100;
        jest.advanceTimersByTime(100);
        await Promise.resolve();
      });

      expect(onCommit).toHaveBeenCalledWith("update3");
      expect(result.current.metrics.batchesSent).toBe(1);
    });

    it("should process batches sequentially when exceeding maxBatchSize", async () => {
      const onCommit = jest.fn().mockImplementation(async (value) => {
        mockTime += 10;
        return value;
      });

      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, {
          batchDelayMs: 50,
          maxBatchSize: 2,
          batchingEnabled: true,
        })
      );

      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.controls.setValue(`update${i}`, true);
        }
      });

      // First batch
      await act(async () => {
        mockTime += 50;
        jest.advanceTimersByTime(50);
        await Promise.resolve();
      });

      expect(result.current.metrics.batchesSent).toBe(1);

      // Process remaining batches
      await act(async () => {
        mockTime += 50;
        jest.advanceTimersByTime(50);
        await Promise.resolve();
      });

      expect(result.current.metrics.batchesSent).toBe(2);
    });

    it("should handle batch failure with rollback", async () => {
      const onCommit = jest.fn().mockRejectedValue(new Error("Batch failed"));

      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, {
          batchDelayMs: 50,
          batchingEnabled: true,
        })
      );

      act(() => {
        result.current.controls.setValue("to-fail", true);
      });

      await act(async () => {
        mockTime += 50;
        jest.advanceTimersByTime(50);
        await Promise.resolve();
      });

      expect(result.current.state.optimisticValue).toBe("initial");
      expect(result.current.state.isOptimistic).toBe(false);
      expect(result.current.metrics.rollbacks).toBe(1);
    });

    it("should not batch when batchingEnabled is false", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, {
          batchingEnabled: false,
        })
      );

      act(() => {
        result.current.controls.setValue("update", true);
      });

      // Should not trigger batch timer
      act(() => {
        mockTime += 100;
        jest.advanceTimersByTime(100);
      });

      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Latency Measurement Tests
  // ============================================================================

  describe("latency measurement", () => {
    it("should measure latency with measureLatency", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      const startTime = mockTime;
      mockTime += 200;

      act(() => {
        result.current.controls.measureLatency(startTime);
      });

      expect(result.current.state.latencyStats.current).toBe(200);
      expect(result.current.state.latencyStats.samples).toBe(1);
    });

    it("should calculate average latency", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      // Add multiple latency samples
      act(() => {
        const start1 = mockTime;
        mockTime += 100;
        result.current.controls.measureLatency(start1);
      });

      act(() => {
        const start2 = mockTime;
        mockTime += 200;
        result.current.controls.measureLatency(start2);
      });

      act(() => {
        const start3 = mockTime;
        mockTime += 300;
        result.current.controls.measureLatency(start3);
      });

      expect(result.current.state.latencyStats.average).toBe(200); // (100 + 200 + 300) / 3
      expect(result.current.state.latencyStats.samples).toBe(3);
    });

    it("should calculate p50 and p95 percentiles", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      // Add 10 samples
      const latencies = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

      for (const latency of latencies) {
        act(() => {
          const start = mockTime;
          mockTime += latency;
          result.current.controls.measureLatency(start);
        });
      }

      expect(result.current.state.latencyStats.p50).toBe(250);
      expect(result.current.state.latencyStats.p95).toBe(500);
    });

    it("should detect improving trend", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      // Add declining latencies (improving)
      const latencies = [500, 450, 400, 350, 300, 200, 150, 100, 50, 25];

      for (const latency of latencies) {
        act(() => {
          const start = mockTime;
          mockTime += latency;
          result.current.controls.measureLatency(start);
        });
      }

      expect(result.current.state.latencyStats.trend).toBe("improving");
    });

    it("should detect degrading trend", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      // Add increasing latencies (degrading)
      const latencies = [50, 75, 100, 150, 200, 300, 400, 500, 600, 700];

      for (const latency of latencies) {
        act(() => {
          const start = mockTime;
          mockTime += latency;
          result.current.controls.measureLatency(start);
        });
      }

      expect(result.current.state.latencyStats.trend).toBe("degrading");
    });

    it("should cap samples at 100", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      // Add 120 samples
      for (let i = 0; i < 120; i++) {
        act(() => {
          const start = mockTime;
          mockTime += 100;
          result.current.controls.measureLatency(start);
        });
      }

      expect(result.current.state.latencyStats.samples).toBe(100);
    });

    it("should set perceived latency to 0 when optimistic is enabled", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, { optimisticEnabled: true })
      );

      act(() => {
        const start = mockTime;
        mockTime += 200;
        result.current.controls.measureLatency(start);
      });

      expect(result.current.metrics.perceivedLatency).toBe(0);
    });

    it("should set perceived latency to average when optimistic is disabled", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, { optimisticEnabled: false })
      );

      act(() => {
        const start = mockTime;
        mockTime += 200;
        result.current.controls.measureLatency(start);
      });

      expect(result.current.metrics.perceivedLatency).toBe(200);
    });
  });

  // ============================================================================
  // Reset Tests
  // ============================================================================

  describe("reset", () => {
    it("should reset to initial state", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        result.current.controls.setValue("updated");
      });

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.currentValue).toBe("initial");
      expect(result.current.state.optimisticValue).toBe("initial");
      expect(result.current.state.isOptimistic).toBe(false);
      expect(result.current.state.pendingUpdates).toEqual([]);
      expect(result.current.state.predictions).toEqual([]);
    });

    it("should clear latency stats on reset", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit)
      );

      act(() => {
        const start = mockTime;
        mockTime += 200;
        result.current.controls.measureLatency(start);
      });

      expect(result.current.state.latencyStats.samples).toBe(1);

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.latencyStats.samples).toBe(0);
      expect(result.current.state.latencyStats.current).toBe(0);
      expect(result.current.state.latencyStats.average).toBe(0);
    });

    it("should clear pending batch queue on reset", async () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, { batchDelayMs: 1000 })
      );

      act(() => {
        result.current.controls.setValue("update", true);
      });

      act(() => {
        result.current.controls.reset();
      });

      // Advance past batch delay
      await act(async () => {
        mockTime += 1000;
        jest.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      // Should not have committed because queue was cleared
      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should clear timers on unmount", () => {
      const onCommit = jest.fn().mockResolvedValue("committed");
      const { result, unmount } = renderHook(() =>
        useInputLatencyReducer<string>("initial", onCommit, { rollbackDelayMs: 5000 })
      );

      act(() => {
        result.current.controls.setValue("updated");
      });

      unmount();

      // Advancing timers should not cause errors
      act(() => {
        mockTime += 5000;
        jest.advanceTimersByTime(5000);
      });
    });
  });
});

// ============================================================================
// Convenience Hooks Tests
// ============================================================================

describe("useOptimisticTextInput", () => {
  let mockTime: number;

  beforeEach(() => {
    mockTime = 1000;
    jest.useFakeTimers();
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);
    jest.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should initialize with initial value", () => {
    const onSubmit = jest.fn().mockResolvedValue("submitted");
    const { result } = renderHook(() =>
      useOptimisticTextInput("initial", onSubmit)
    );

    expect(result.current.value).toBe("initial");
    expect(result.current.isSubmitting).toBe(false);
  });

  it("should update value on setValue", () => {
    const onSubmit = jest.fn().mockResolvedValue("submitted");
    const { result } = renderHook(() =>
      useOptimisticTextInput("initial", onSubmit)
    );

    act(() => {
      result.current.setValue("updated");
    });

    expect(result.current.value).toBe("updated");
  });

  it("should submit and update value", async () => {
    const onSubmit = jest.fn().mockImplementation(async () => {
      mockTime += 100;
      return "submitted-result";
    });
    const { result } = renderHook(() =>
      useOptimisticTextInput("initial", onSubmit)
    );

    act(() => {
      result.current.setValue("to-submit");
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(onSubmit).toHaveBeenCalledWith("to-submit");
    expect(result.current.value).toBe("submitted-result");
  });

  it("should show predictions", () => {
    const onSubmit = jest.fn().mockResolvedValue("submitted");
    const { result } = renderHook(() =>
      useOptimisticTextInput("", onSubmit)
    );

    expect(result.current.predictions).toEqual([]);
  });
});

describe("useAutoSaveInput", () => {
  let mockTime: number;

  beforeEach(() => {
    mockTime = 1000;
    jest.useFakeTimers();
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);
    jest.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should initialize with initial value", () => {
    const onSave = jest.fn().mockResolvedValue("saved");
    const { result } = renderHook(() =>
      useAutoSaveInput<string>("initial", onSave)
    );

    expect(result.current.value).toBe("initial");
    expect(result.current.isSaving).toBe(false);
    expect(result.current.lastSaved).toBe("initial");
  });

  it("should auto-save after debounce delay", async () => {
    const onSave = jest.fn().mockResolvedValue("saved");
    const { result } = renderHook(() =>
      useAutoSaveInput<string>("initial", onSave, 500)
    );

    act(() => {
      result.current.setValue("updated");
    });

    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      mockTime += 500;
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith("updated");
  });

  it("should debounce multiple setValue calls", async () => {
    const onSave = jest.fn().mockResolvedValue("saved");
    const { result } = renderHook(() =>
      useAutoSaveInput<string>("initial", onSave, 500)
    );

    act(() => {
      result.current.setValue("update1");
    });

    act(() => {
      mockTime += 200;
      jest.advanceTimersByTime(200);
      result.current.setValue("update2");
    });

    act(() => {
      mockTime += 200;
      jest.advanceTimersByTime(200);
      result.current.setValue("update3");
    });

    // Still should not have saved
    expect(onSave).not.toHaveBeenCalled();

    // Wait for full debounce
    await act(async () => {
      mockTime += 500;
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith("update3");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("should work with object values", async () => {
    interface FormData {
      name: string;
      email: string;
    }

    const onSave = jest.fn().mockImplementation(async (data: FormData) => data);
    const { result } = renderHook(() =>
      useAutoSaveInput<FormData>(
        { name: "", email: "" },
        onSave,
        300
      )
    );

    act(() => {
      result.current.setValue({ name: "John", email: "john@example.com" });
    });

    await act(async () => {
      mockTime += 300;
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith({
      name: "John",
      email: "john@example.com",
    });
  });
});
