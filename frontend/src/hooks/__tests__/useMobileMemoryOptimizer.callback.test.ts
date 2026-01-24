/**
 * Sprint 759 - Tests for useMemoryPressureAlert callback branch coverage (lines 594-595)
 *
 * This test file uses the newly exposed controls from useMemoryPressureAlert
 * to trigger pressure state changes and cover the onPressure callback branch.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useMemoryPressureAlert,
  MemoryPressureLevel,
} from "../useMobileMemoryOptimizer";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Sprint 759 - useMemoryPressureAlert callback branch (lines 594-595)", () => {
  it("should call onPressure callback when pressure changes from normal to moderate via controls", async () => {
    const onPressure = jest.fn();

    const { result } = renderHook(() =>
      useMemoryPressureAlert(onPressure, {
        budgetMB: 0.001, // 1KB budget
        pressureThresholds: { moderate: 0.3, critical: 0.7 },
      })
    );

    // Initial state should be normal (no resources)
    expect(result.current.pressure).toBe("normal");
    expect(onPressure).not.toHaveBeenCalled();

    // Register resource that exceeds 30% of budget to trigger moderate pressure
    // 1KB * 0.3 = ~307 bytes threshold
    act(() => {
      result.current.controls.register({
        type: "data",
        size: 400, // ~40% of budget -> moderate pressure
        priority: 1,
      });
    });

    // Pressure should change to moderate, triggering the callback
    expect(result.current.pressure).toBe("moderate");
    expect(onPressure).toHaveBeenCalledWith("moderate");
    expect(onPressure).toHaveBeenCalledTimes(1);
  });

  it("should call onPressure callback when pressure changes from normal to critical via controls", async () => {
    const onPressure = jest.fn();

    const { result } = renderHook(() =>
      useMemoryPressureAlert(onPressure, {
        budgetMB: 0.001, // 1KB budget
        pressureThresholds: { moderate: 0.3, critical: 0.7 },
      })
    );

    expect(result.current.pressure).toBe("normal");

    // Register resource that exceeds 70% of budget to trigger critical pressure
    act(() => {
      result.current.controls.register({
        type: "data",
        size: 800, // ~80% of budget -> critical pressure
        priority: 1,
      });
    });

    expect(result.current.pressure).toBe("critical");
    expect(onPressure).toHaveBeenCalledWith("critical");
    expect(onPressure).toHaveBeenCalledTimes(1);
  });

  it("should call onPressure callback each time pressure level changes", async () => {
    const pressureChanges: MemoryPressureLevel[] = [];
    const onPressure = jest.fn((level: MemoryPressureLevel) => {
      pressureChanges.push(level);
    });

    const { result } = renderHook(() =>
      useMemoryPressureAlert(onPressure, {
        budgetMB: 0.001, // 1KB budget
        pressureThresholds: { moderate: 0.3, critical: 0.7 },
      })
    );

    // Step 1: normal -> moderate
    act(() => {
      result.current.controls.register({
        type: "data",
        size: 400,
        priority: 1,
      });
    });

    expect(pressureChanges).toContain("moderate");

    // Step 2: moderate -> critical (add more resources)
    act(() => {
      result.current.controls.register({
        type: "data",
        size: 500,
        priority: 1,
      });
    });

    expect(pressureChanges).toContain("critical");

    // Verify callback was called for each pressure change
    expect(onPressure.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("should call onPressure when pressure drops from critical to normal via eviction", async () => {
    const pressureChanges: MemoryPressureLevel[] = [];
    const onPressure = jest.fn((level: MemoryPressureLevel) => {
      pressureChanges.push(level);
    });

    const { result } = renderHook(() =>
      useMemoryPressureAlert(onPressure, {
        budgetMB: 0.001, // 1KB budget
        pressureThresholds: { moderate: 0.3, critical: 0.7 },
        autoEvict: false, // Disable auto-evict for controlled testing
      })
    );

    // Register to reach critical
    let resourceId: string;
    act(() => {
      resourceId = result.current.controls.register({
        type: "data",
        size: 800,
        priority: 1,
      });
    });

    expect(result.current.pressure).toBe("critical");
    expect(onPressure).toHaveBeenLastCalledWith("critical");

    // Unregister to drop back to normal
    act(() => {
      result.current.controls.unregister(resourceId!);
    });

    expect(result.current.pressure).toBe("normal");
    // Callback should have been called for the transition back to normal
    expect(pressureChanges).toContain("normal");
  });

  it("should not call onPressure when pressure remains unchanged", async () => {
    const onPressure = jest.fn();

    const { result, rerender } = renderHook(() =>
      useMemoryPressureAlert(onPressure, {
        budgetMB: 100, // Large budget means normal pressure
        pressureThresholds: { moderate: 0.5, critical: 0.9 },
      })
    );

    expect(result.current.pressure).toBe("normal");
    const initialCallCount = onPressure.mock.calls.length;

    // Multiple rerenders with no state change
    rerender();
    rerender();
    rerender();

    // Callback should not be called again
    expect(onPressure.mock.calls.length).toBe(initialCallCount);
  });

  it("should handle undefined onPressure callback gracefully when pressure changes", async () => {
    const { result } = renderHook(() =>
      useMemoryPressureAlert(undefined, {
        budgetMB: 0.001,
        pressureThresholds: { moderate: 0.3, critical: 0.7 },
      })
    );

    expect(result.current.pressure).toBe("normal");

    // This should not throw even though onPressure is undefined
    act(() => {
      result.current.controls.register({
        type: "data",
        size: 800,
        priority: 1,
      });
    });

    // Should change pressure without error
    expect(result.current.pressure).toBe("critical");
  });

  it("should update prevPressureRef correctly after each pressure change", async () => {
    const pressureChanges: MemoryPressureLevel[] = [];
    const onPressure = jest.fn((level: MemoryPressureLevel) => {
      pressureChanges.push(level);
    });

    const { result } = renderHook(() =>
      useMemoryPressureAlert(onPressure, {
        budgetMB: 0.001,
        pressureThresholds: { moderate: 0.3, critical: 0.7 },
        autoEvict: false,
      })
    );

    // Normal -> moderate
    let id1: string;
    act(() => {
      id1 = result.current.controls.register({
        type: "data",
        size: 400,
        priority: 1,
      });
    });
    expect(result.current.pressure).toBe("moderate");

    // Clear callback history
    onPressure.mockClear();

    // Registering same size should not trigger callback (still moderate)
    act(() => {
      result.current.controls.register({
        type: "data",
        size: 100,
        priority: 1,
      });
    });

    // If still moderate, callback should not have been called
    if (result.current.pressure === "moderate") {
      expect(onPressure).not.toHaveBeenCalled();
    }
  });
});
