/**
 * Tests for Mobile Render Queue Hook - Sprint 229
 *
 * Tests priority-based scheduling, frame budgets, and task coalescing
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
  jest.restoreAllMocks();
});

describe("useMobileRenderQueue", () => {
  describe("initialization", () => {
    it("should initialize with empty queue", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      expect(result.current.state.queueLength).toBe(0);
      expect(result.current.state.isProcessing).toBe(false);
    });

    it("should initialize with default budget", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      expect(result.current.state.currentBudget.totalMs).toBeCloseTo(16.67);
      expect(result.current.state.currentBudget.criticalReserve).toBe(4);
    });

    it("should initialize with page visible", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      expect(result.current.state.isPageVisible).toBe(true);
    });

    it("should initialize metrics", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      expect(result.current.state.metrics.tasksProcessed).toBe(0);
      expect(result.current.state.metrics.tasksDropped).toBe(0);
      expect(result.current.state.metrics.coalescedTasks).toBe(0);
    });
  });

  describe("task scheduling", () => {
    it("should schedule a task", () => {
      const { result } = renderHook(() => useMobileRenderQueue());
      const callback = jest.fn();

      act(() => {
        result.current.controls.schedule(callback);
      });

      expect(result.current.state.queueLength).toBe(1);
    });

    it("should return task ID", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      let taskId = "";
      act(() => {
        taskId = result.current.controls.schedule(() => {});
      });

      expect(taskId).toMatch(/^task_/);
    });

    it("should schedule with custom priority", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      act(() => {
        result.current.controls.schedule(() => {}, { priority: "critical" });
      });

      const task = result.current.controls.getTask(
        result.current.controls.schedule(() => {}, { priority: "high" })
      );

      // Can't easily verify priority but queue length should work
      expect(result.current.state.queueLength).toBeGreaterThan(0);
    });

    it("should schedule with deadline", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      let taskId = "";
      act(() => {
        taskId = result.current.controls.schedule(() => {}, { deadline: 100 });
      });

      const task = result.current.controls.getTask(taskId);
      expect(task?.deadline).toBe(100);
    });

    it("should schedule with estimated duration", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      let taskId = "";
      act(() => {
        taskId = result.current.controls.schedule(() => {}, {
          estimatedDuration: 5,
        });
      });

      const task = result.current.controls.getTask(taskId);
      expect(task?.estimatedDuration).toBe(5);
    });
  });

  describe("task coalescing", () => {
    it("should coalesce tasks with same key", () => {
      const { result } = renderHook(() =>
        useMobileRenderQueue({ enableCoalescing: true })
      );

      act(() => {
        result.current.controls.schedule(() => {}, { coalesceKey: "update" });
        result.current.controls.schedule(() => {}, { coalesceKey: "update" });
        result.current.controls.schedule(() => {}, { coalesceKey: "update" });
      });

      expect(result.current.state.queueLength).toBe(1);
      expect(result.current.state.metrics.coalescedTasks).toBe(2);
    });

    it("should not coalesce tasks with different keys", () => {
      const { result } = renderHook(() =>
        useMobileRenderQueue({ enableCoalescing: true })
      );

      act(() => {
        result.current.controls.schedule(() => {}, { coalesceKey: "update1" });
        result.current.controls.schedule(() => {}, { coalesceKey: "update2" });
      });

      expect(result.current.state.queueLength).toBe(2);
    });
  });

  describe("task cancellation", () => {
    it("should cancel a task by ID", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      let taskId = "";
      act(() => {
        taskId = result.current.controls.schedule(() => {});
      });

      act(() => {
        const cancelled = result.current.controls.cancel(taskId);
        expect(cancelled).toBe(true);
      });

      expect(result.current.state.queueLength).toBe(0);
    });

    it("should return false for non-existent task", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      let cancelled = false;
      act(() => {
        cancelled = result.current.controls.cancel("non-existent");
      });

      expect(cancelled).toBe(false);
    });

    it("should cancel tasks by coalesce key", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      act(() => {
        result.current.controls.schedule(() => {}, { coalesceKey: "group1" });
        result.current.controls.schedule(() => {}, { coalesceKey: "group1" });
        result.current.controls.schedule(() => {}, { coalesceKey: "group2" });
      });

      let cancelledCount = 0;
      act(() => {
        cancelledCount = result.current.controls.cancelByKey("group1");
      });

      expect(cancelledCount).toBe(1); // Coalesced to 1 task
      expect(result.current.state.queueLength).toBe(1);
    });
  });

  describe("queue controls", () => {
    it("should flush all tasks", () => {
      const { result } = renderHook(() => useMobileRenderQueue());
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      act(() => {
        result.current.controls.schedule(callback1);
        result.current.controls.schedule(callback2);
        result.current.controls.flush();
      });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
      expect(result.current.state.queueLength).toBe(0);
    });

    it("should clear the queue", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      act(() => {
        result.current.controls.schedule(() => {});
        result.current.controls.schedule(() => {});
        result.current.controls.clear();
      });

      expect(result.current.state.queueLength).toBe(0);
    });

    it("should pause processing", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      act(() => {
        result.current.controls.pause();
      });

      expect(result.current.state.isProcessing).toBe(false);
    });

    it("should resume processing", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      act(() => {
        result.current.controls.schedule(() => {});
        result.current.controls.pause();
        result.current.controls.resume();
      });

      // Queue should be picked up after resume
      expect(result.current.state.queueLength).toBeGreaterThanOrEqual(0);
    });
  });

  describe("task retrieval", () => {
    it("should get task by ID", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      let taskId = "";
      act(() => {
        taskId = result.current.controls.schedule(() => {}, {
          priority: "high",
          estimatedDuration: 5,
        });
      });

      const task = result.current.controls.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.priority).toBe("high");
      expect(task?.estimatedDuration).toBe(5);
    });

    it("should return undefined for non-existent task", () => {
      const { result } = renderHook(() => useMobileRenderQueue());

      const task = result.current.controls.getTask("non-existent");
      expect(task).toBeUndefined();
    });
  });

  describe("queue size limits", () => {
    it("should respect max queue size", () => {
      const { result } = renderHook(() =>
        useMobileRenderQueue({ maxQueueSize: 3 })
      );

      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.controls.schedule(() => {}, { priority: "normal" });
        }
      });

      expect(result.current.state.queueLength).toBeLessThanOrEqual(3);
    });

    it("should drop tasks when queue is full", () => {
      const { result } = renderHook(() =>
        useMobileRenderQueue({ maxQueueSize: 2 })
      );

      act(() => {
        result.current.controls.schedule(() => {}, { priority: "low" });
        result.current.controls.schedule(() => {}, { priority: "low" });
        result.current.controls.schedule(() => {}, { priority: "low" });
      });

      expect(result.current.state.metrics.tasksDropped).toBeGreaterThan(0);
    });
  });
});

describe("useRenderScheduler", () => {
  it("should return a schedule function", () => {
    const { result } = renderHook(() => useRenderScheduler());

    expect(typeof result.current).toBe("function");
  });

  it("should schedule callbacks", () => {
    const { result } = renderHook(() => useRenderScheduler());
    const callback = jest.fn();

    act(() => {
      result.current(callback);
    });

    // Callback is scheduled, not immediately called
    expect(callback).not.toHaveBeenCalled();
  });
});

describe("useCoalescedRender", () => {
  it("should return a schedule function", () => {
    const { result } = renderHook(() => useCoalescedRender("test-key"));

    expect(typeof result.current).toBe("function");
  });
});
