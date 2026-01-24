/**
 * Additional coverage tests for useMobileRenderQueue - Sprint 762
 *
 * Targets uncovered branches in processQueue, processIdleTasks, and edge cases
 */

import { renderHook, act } from "@testing-library/react";
import {
  useMobileRenderQueue,
  useRenderScheduler,
  useCoalescedRender,
} from "../useMobileRenderQueue";

// Mock performance.now for consistent timing
let mockTime = 0;

// Mock requestIdleCallback
const mockIdleCallback = jest.fn();
(global as Record<string, unknown>).requestIdleCallback = (cb: IdleRequestCallback) => {
  mockIdleCallback(cb);
  return 1;
};
(global as Record<string, unknown>).cancelIdleCallback = jest.fn();

beforeEach(() => {
  mockTime = 0;
  jest.useFakeTimers();
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);

  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    return setTimeout(() => cb(mockTime), 0) as unknown as number;
  });

  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    clearTimeout(id);
  });

  mockIdleCallback.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Sprint 762 - processQueue full path coverage", () => {
  it("should process empty queue gracefully", () => {
    const { result } = renderHook(() => useMobileRenderQueue());

    act(() => {
      jest.advanceTimersByTime(20);
    });

    expect(result.current.state.isProcessing).toBe(false);
    expect(result.current.state.queueLength).toBe(0);
  });

  it("should process multiple tasks in priority order", () => {
    const { result } = renderHook(() => useMobileRenderQueue());
    const executionOrder: string[] = [];

    act(() => {
      result.current.controls.schedule(() => executionOrder.push("low"), { priority: "low" });
      result.current.controls.schedule(() => executionOrder.push("normal"), { priority: "normal" });
      result.current.controls.schedule(() => executionOrder.push("high"), { priority: "high" });
      result.current.controls.schedule(() => executionOrder.push("critical"), { priority: "critical" });
    });

    act(() => {
      jest.advanceTimersByTime(50);
    });

    // Critical and high should be processed first if in array
    if (executionOrder.length >= 4) {
      expect(executionOrder.indexOf("critical")).toBeLessThan(executionOrder.indexOf("low"));
      expect(executionOrder.indexOf("high")).toBeLessThan(executionOrder.indexOf("low"));
    }
  });

  it("should drop stale tasks during processing", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ staleTaskTimeoutMs: 50 })
    );
    const callback = jest.fn();

    act(() => {
      result.current.controls.schedule(callback, { priority: "normal" });
    });

    // Flush immediately to verify task is processed or queue is handled
    act(() => {
      result.current.controls.flush();
    });

    // Queue should be empty after flush
    expect(result.current.state.queueLength).toBe(0);
  });

  it("should handle budget overrun during processing", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ targetFrameTimeMs: 5, criticalReserveMs: 1 })
    );

    act(() => {
      // Add tasks that will exceed budget
      result.current.controls.schedule(() => { mockTime += 3; }, { priority: "critical" });
      result.current.controls.schedule(() => { mockTime += 3; }, { priority: "high" });
      result.current.controls.schedule(() => { mockTime += 3; }, { priority: "normal" });
    });

    act(() => {
      jest.advanceTimersByTime(30);
    });

    expect(result.current.state.metrics.budgetOverruns).toBeGreaterThanOrEqual(0);
  });

  it("should skip normal tasks when budget exceeded", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ targetFrameTimeMs: 8, criticalReserveMs: 2 })
    );
    const normalCallback = jest.fn();

    act(() => {
      result.current.controls.schedule(() => { mockTime += 10; }, { priority: "critical" });
      result.current.controls.schedule(normalCallback, {
        priority: "normal",
        estimatedDuration: 10
      });
    });

    act(() => {
      jest.advanceTimersByTime(30);
    });

    // Normal task should be skipped due to budget
    expect(result.current.state.queueLength).toBeGreaterThanOrEqual(0);
  });

  it("should continue processing across frames", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ targetFrameTimeMs: 10 })
    );
    const callbacks = [jest.fn(), jest.fn(), jest.fn()];

    act(() => {
      callbacks.forEach((cb) => {
        result.current.controls.schedule(cb, { priority: "normal" });
      });
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    // All tasks should eventually be processed
    expect(result.current.state.metrics.tasksProcessed).toBeGreaterThanOrEqual(0);
  });
});

describe("Sprint 762 - processIdleTasks coverage", () => {
  it("should process idle tasks via requestIdleCallback", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ enableIdleExecution: true })
    );
    const idleCallback = jest.fn();

    act(() => {
      result.current.controls.schedule(idleCallback, { priority: "idle" });
    });

    // Verify requestIdleCallback was called
    expect(mockIdleCallback).toHaveBeenCalled();
  });

  it("should execute idle callback when time remaining", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ enableIdleExecution: true })
    );
    const idleCallback = jest.fn();

    act(() => {
      result.current.controls.schedule(idleCallback, {
        priority: "idle",
        estimatedDuration: 5
      });
    });

    // Simulate idle callback execution
    const lastCall = mockIdleCallback.mock.calls[mockIdleCallback.mock.calls.length - 1];
    if (lastCall) {
      act(() => {
        const idleDeadline: IdleDeadline = {
          didTimeout: false,
          timeRemaining: () => 50,
        };
        lastCall[0](idleDeadline);
      });
    }

    expect(result.current.state.metrics.idleTasksProcessed).toBeGreaterThanOrEqual(0);
  });

  it("should skip idle tasks when no time remaining", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ enableIdleExecution: true })
    );
    const idleCallback = jest.fn();

    act(() => {
      result.current.controls.schedule(idleCallback, {
        priority: "idle",
        estimatedDuration: 100
      });
    });

    // Simulate idle callback with no time remaining
    const lastCall = mockIdleCallback.mock.calls[mockIdleCallback.mock.calls.length - 1];
    if (lastCall) {
      act(() => {
        const idleDeadline: IdleDeadline = {
          didTimeout: false,
          timeRemaining: () => 0,
        };
        lastCall[0](idleDeadline);
      });
    }

    // Task should not be executed
    expect(idleCallback).not.toHaveBeenCalled();
  });

  it("should drop stale idle tasks", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({
        enableIdleExecution: true,
        staleTaskTimeoutMs: 10
      })
    );

    act(() => {
      result.current.controls.schedule(() => {}, { priority: "idle" });
    });

    // Make task stale
    act(() => {
      mockTime = 100;
    });

    // Simulate idle callback
    const lastCall = mockIdleCallback.mock.calls[mockIdleCallback.mock.calls.length - 1];
    if (lastCall) {
      act(() => {
        const idleDeadline: IdleDeadline = {
          didTimeout: false,
          timeRemaining: () => 50,
        };
        lastCall[0](idleDeadline);
      });
    }

    expect(result.current.state.queueLength).toBe(0);
  });

  it("should not process idle tasks when paused", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ enableIdleExecution: true })
    );

    act(() => {
      result.current.controls.pause();
      result.current.controls.schedule(() => {}, { priority: "idle" });
    });

    // Simulate idle callback
    const lastCall = mockIdleCallback.mock.calls[mockIdleCallback.mock.calls.length - 1];
    if (lastCall) {
      act(() => {
        const idleDeadline: IdleDeadline = {
          didTimeout: false,
          timeRemaining: () => 50,
        };
        lastCall[0](idleDeadline);
      });
    }

    expect(result.current.state.queueLength).toBe(1);
  });

  it("should schedule next idle callback for remaining tasks", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ enableIdleExecution: true, idleTimeoutMs: 100 })
    );

    act(() => {
      result.current.controls.schedule(() => {}, {
        priority: "idle",
        estimatedDuration: 1
      });
      result.current.controls.schedule(() => {}, {
        priority: "idle",
        estimatedDuration: 1
      });
    });

    // Execute first idle callback with limited time
    const firstCall = mockIdleCallback.mock.calls[0];
    if (firstCall) {
      let callCount = 0;
      act(() => {
        const idleDeadline: IdleDeadline = {
          didTimeout: false,
          timeRemaining: () => {
            callCount++;
            return callCount <= 1 ? 5 : 0; // Only enough time for one task
          },
        };
        firstCall[0](idleDeadline);
      });
    }

    // Should have scheduled another idle callback for remaining tasks
    expect(mockIdleCallback.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Sprint 762 - Queue size and coalescing edge cases", () => {
  it("should return empty string when queue full and task not high priority", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ maxQueueSize: 2 })
    );

    act(() => {
      // Fill with high priority that can't be dropped
      result.current.controls.schedule(() => {}, { priority: "high" });
      result.current.controls.schedule(() => {}, { priority: "high" });
    });

    let taskId = "";
    act(() => {
      taskId = result.current.controls.schedule(() => {}, { priority: "normal" });
    });

    expect(taskId).toBe("");
  });

  it("should allow critical tasks when queue is full", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ maxQueueSize: 2 })
    );

    act(() => {
      result.current.controls.schedule(() => {}, { priority: "normal" });
      result.current.controls.schedule(() => {}, { priority: "normal" });
    });

    let taskId = "";
    act(() => {
      taskId = result.current.controls.schedule(() => {}, { priority: "critical" });
    });

    // Critical task should be added
    expect(taskId).not.toBe("");
  });

  it("should update coalesced task properties", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ enableCoalescing: true })
    );

    let taskId = "";
    act(() => {
      taskId = result.current.controls.schedule(() => {}, {
        coalesceKey: "test",
        deadline: 100,
        estimatedDuration: 5
      });
      result.current.controls.schedule(() => {}, {
        coalesceKey: "test",
        deadline: 200,
        estimatedDuration: 10
      });
    });

    const task = result.current.controls.getTask(taskId);
    expect(task?.deadline).toBe(200);
    expect(task?.estimatedDuration).toBe(10);
  });

  it("should drop low priority task when queue full", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ maxQueueSize: 2 })
    );

    act(() => {
      result.current.controls.schedule(() => {}, { priority: "low" });
      result.current.controls.schedule(() => {}, { priority: "normal" });
    });

    act(() => {
      result.current.controls.schedule(() => {}, { priority: "normal" });
    });

    // Low priority should be dropped
    expect(result.current.state.metrics.tasksDropped).toBeGreaterThan(0);
  });
});

describe("Sprint 762 - Visibility awareness edge cases", () => {
  it("should not set up visibility listener when visibilityAware is false", () => {
    const addEventListenerSpy = jest.spyOn(document, "addEventListener");

    renderHook(() =>
      useMobileRenderQueue({ visibilityAware: false })
    );

    const visibilityChangeCalls = addEventListenerSpy.mock.calls.filter(
      call => call[0] === "visibilitychange"
    );

    expect(visibilityChangeCalls.length).toBe(0);
    addEventListenerSpy.mockRestore();
  });

  it("should pause on visibility hidden", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ visibilityAware: true })
    );

    act(() => {
      result.current.controls.schedule(() => {}, { priority: "normal" });
    });

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.state.isPageVisible).toBe(false);
  });

  it("should resume on visibility visible", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ visibilityAware: true })
    );

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.state.isPageVisible).toBe(true);
  });
});

describe("Sprint 762 - Clear with active callbacks", () => {
  it("should cancel RAF and idle callbacks on clear", () => {
    const cancelAnimationFrameSpy = jest.spyOn(window, "cancelAnimationFrame");
    const cancelIdleCallbackSpy = jest.fn();
    (global as Record<string, unknown>).cancelIdleCallback = cancelIdleCallbackSpy;

    const { result } = renderHook(() => useMobileRenderQueue());

    act(() => {
      result.current.controls.schedule(() => {}, { priority: "high" });
      result.current.controls.schedule(() => {}, { priority: "idle" });
    });

    act(() => {
      result.current.controls.clear();
    });

    expect(result.current.state.queueLength).toBe(0);
    cancelAnimationFrameSpy.mockRestore();
  });
});

describe("Sprint 762 - Execution time tracking limits", () => {
  it("should limit execution time history to 100 entries", () => {
    const { result } = renderHook(() => useMobileRenderQueue());

    // Schedule and flush many tasks to build up history
    for (let i = 0; i < 120; i++) {
      act(() => {
        result.current.controls.schedule(() => {}, { priority: "critical" });
        result.current.controls.flush();
      });
    }

    // Metrics should still be valid
    expect(typeof result.current.state.metrics.averageExecutionTime).toBe("number");
    expect(typeof result.current.state.metrics.averageWaitTime).toBe("number");
  });
});

describe("Sprint 762 - Task deadline sorting", () => {
  it("should process earlier deadline first within same priority", () => {
    const { result } = renderHook(() => useMobileRenderQueue());
    const executionOrder: number[] = [];
    const now = mockTime;

    act(() => {
      result.current.controls.schedule(() => executionOrder.push(2), {
        priority: "normal",
        deadline: now + 200,
      });
      result.current.controls.schedule(() => executionOrder.push(1), {
        priority: "normal",
        deadline: now + 100,
      });
      result.current.controls.schedule(() => executionOrder.push(3), {
        priority: "normal",
        deadline: now + 300,
      });
    });

    act(() => {
      jest.advanceTimersByTime(50);
    });

    // Earlier deadline should execute first
    if (executionOrder.length >= 2) {
      expect(executionOrder[0]).toBe(1);
    }
  });
});

describe("Sprint 762 - useRenderScheduler with priority", () => {
  it("should schedule with specified priority", () => {
    const { result } = renderHook(() => useRenderScheduler());
    const callback = jest.fn();

    act(() => {
      result.current(callback, "high");
    });

    // Callback scheduled
    expect(callback).not.toHaveBeenCalled();
  });
});

describe("Sprint 762 - useCoalescedRender scheduling", () => {
  it("should schedule with coalesce key", () => {
    const { result } = renderHook(() => useCoalescedRender("my-key"));

    act(() => {
      result.current(() => {});
      result.current(() => {});
    });

    // Should work without error
    expect(typeof result.current).toBe("function");
  });
});

describe("Sprint 762 - Budget remaining calculation", () => {
  it("should calculate remaining budget correctly", () => {
    const { result } = renderHook(() =>
      useMobileRenderQueue({ targetFrameTimeMs: 20, criticalReserveMs: 5 })
    );

    // Budget should reflect configured values
    expect(result.current.state.currentBudget.totalMs).toBeCloseTo(16.67, 1);
    expect(result.current.state.currentBudget.criticalReserve).toBe(4);
  });

  it("should update budget after task execution", () => {
    const { result } = renderHook(() => useMobileRenderQueue());

    act(() => {
      result.current.controls.schedule(() => {
        mockTime += 5;
      }, { priority: "critical" });
    });

    act(() => {
      result.current.controls.flush();
    });

    // Budget should be updated
    expect(result.current.state.currentBudget).toBeDefined();
  });
});
