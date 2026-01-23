/**
 * Tests for Mobile Thermal Manager Hook - Sprint 226
 *
 * Tests thermal state management, workload tracking, and cooldown periods
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useMobileThermalManager,
  useThermalState,
  useThermalAwareFeature,
  ThermalState,
  WorkloadType,
} from "../useMobileThermalManager";

// Mock timers
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.useFakeTimers();
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useMobileThermalManager", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      expect(result.current.state.thermal.state).toBe("nominal");
      expect(result.current.state.thermal.estimatedTemp).toBe(25);
      expect(result.current.state.performanceScale).toBe(1.0);
      expect(result.current.state.throttleLevel).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useMobileThermalManager({
          fairThreshold: 50,
          seriousThreshold: 75,
          criticalThreshold: 90,
        })
      );

      expect(result.current.config.fairThreshold).toBe(50);
      expect(result.current.config.seriousThreshold).toBe(75);
      expect(result.current.config.criticalThreshold).toBe(90);
    });

    it("should initialize metrics", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      expect(result.current.metrics.timeInNominal).toBe(0);
      expect(result.current.metrics.cooldownsTriggered).toBe(0);
      expect(result.current.metrics.peakTemp).toBe(25);
    });

    it("should not be in cooldown initially", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      expect(result.current.state.cooldown.active).toBe(false);
    });
  });

  describe("workload management", () => {
    it("should report workload", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.reportWorkload("rendering", 0.8);
      });

      // Let the interval run
      act(() => {
        jest.advanceTimersByTime(1100);
      });

      expect(result.current.state.workloads.length).toBeGreaterThan(0);
    });

    it("should clear workload", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.reportWorkload("rendering", 0.8);
      });

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      act(() => {
        result.current.controls.clearWorkload("rendering");
      });

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      const renderingWorkload = result.current.state.workloads.find(
        (w) => w.type === "rendering"
      );
      expect(renderingWorkload).toBeUndefined();
    });

    it("should clamp intensity to 0-1", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.reportWorkload("computation", 2.0); // Over 1
      });

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      const workload = result.current.state.workloads.find(
        (w) => w.type === "computation"
      );
      expect(workload?.intensity).toBeLessThanOrEqual(1.0);
    });
  });

  describe("budget management", () => {
    it("should allocate budget", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.allocateBudget("avatar", 0.5, 10);
      });

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      const budget = result.current.state.budgets.find(
        (b) => b.category === "avatar"
      );
      expect(budget).toBeDefined();
      expect(budget?.allocated).toBe(0.5);
      expect(budget?.priority).toBe(10);
    });

    it("should release budget", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.allocateBudget("avatar", 0.5, 10);
      });

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      act(() => {
        result.current.controls.releaseBudget("avatar");
      });

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      const budget = result.current.state.budgets.find(
        (b) => b.category === "avatar"
      );
      expect(budget).toBeUndefined();
    });
  });

  describe("cooldown management", () => {
    it("should trigger cooldown", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.triggerCooldown();
      });

      expect(result.current.state.cooldown.active).toBe(true);
      expect(result.current.state.cooldown.startTime).not.toBeNull();
      expect(result.current.metrics.cooldownsTriggered).toBe(1);
    });

    it("should trigger cooldown with custom duration", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.triggerCooldown(5000);
      });

      expect(result.current.state.cooldown.duration).toBe(5000);
    });

    it("should cancel cooldown", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.triggerCooldown();
      });

      expect(result.current.state.cooldown.active).toBe(true);

      act(() => {
        result.current.controls.cancelCooldown();
      });

      expect(result.current.state.cooldown.active).toBe(false);
    });

    it("should have restrictions during cooldown", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.triggerCooldown();
      });

      expect(result.current.state.cooldown.restrictions).toContain("rendering");
      expect(result.current.state.cooldown.restrictions).toContain("computation");
    });
  });

  describe("performance scale", () => {
    it("should allow manual performance scale", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.setPerformanceScale(0.5);
      });

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      expect(result.current.state.performanceScale).toBe(0.5);
    });

    it("should clamp performance scale to valid range", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.setPerformanceScale(2.0); // Over 1
      });

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      expect(result.current.state.performanceScale).toBeLessThanOrEqual(1.0);
    });

    it("should get recommended scale for workload type", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      const scale = result.current.controls.getRecommendedScale("rendering");

      expect(scale).toBeGreaterThan(0);
      expect(scale).toBeLessThanOrEqual(1.0);
    });
  });

  describe("config updates", () => {
    it("should update config", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      act(() => {
        result.current.controls.updateConfig({
          autoThrottle: false,
          predictiveScaling: false,
        });
      });

      expect(result.current.config.autoThrottle).toBe(false);
      expect(result.current.config.predictiveScaling).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset all state", () => {
      const { result } = renderHook(() => useMobileThermalManager());

      // Generate some state
      act(() => {
        result.current.controls.reportWorkload("rendering", 0.8);
        result.current.controls.allocateBudget("avatar", 0.5, 10);
        result.current.controls.triggerCooldown();
      });

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      // Reset
      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.thermal.state).toBe("nominal");
      expect(result.current.state.workloads).toHaveLength(0);
      expect(result.current.state.budgets).toHaveLength(0);
      expect(result.current.state.cooldown.active).toBe(false);
      expect(result.current.metrics.cooldownsTriggered).toBe(0);
    });
  });

  describe("thermal simulation", () => {
    it("should increase temperature with workload", () => {
      const { result } = renderHook(() =>
        useMobileThermalManager({ sampleIntervalMs: 100 })
      );

      const initialTemp = result.current.state.thermal.estimatedTemp;

      // Add heavy workload
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
        result.current.controls.reportWorkload("rendering", 1.0);
      });

      // Let simulation run
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.state.thermal.estimatedTemp).toBeGreaterThan(initialTemp);
    });

    it("should cool down with low workload", () => {
      const { result } = renderHook(() =>
        useMobileThermalManager({ sampleIntervalMs: 100 })
      );

      // Heat up first
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
      });

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      const heatedTemp = result.current.state.thermal.estimatedTemp;

      // Remove workload
      act(() => {
        result.current.controls.clearWorkload("computation");
      });

      // Let it cool
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(result.current.state.thermal.estimatedTemp).toBeLessThanOrEqual(heatedTemp);
    });

    it("should track thermal metrics", () => {
      const { result } = renderHook(() =>
        useMobileThermalManager({ sampleIntervalMs: 100 })
      );

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current.metrics.timeInNominal).toBeGreaterThan(0);
    });
  });

  describe("disabled mode", () => {
    it("should not run simulation when disabled", () => {
      const { result } = renderHook(() =>
        useMobileThermalManager({ enabled: false, sampleIntervalMs: 100 })
      );

      const initialTemp = result.current.state.thermal.estimatedTemp;

      // Add workload
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Temperature shouldn't change because simulation is disabled
      expect(result.current.state.thermal.estimatedTemp).toBe(initialTemp);
    });
  });
});

describe("useThermalState", () => {
  it("should provide simple thermal state", () => {
    const { result } = renderHook(() => useThermalState());

    expect(result.current.state).toBe("nominal");
    expect(result.current.temp).toBe(25);
    expect(result.current.trend).toBe("stable");
    expect(result.current.shouldThrottle).toBe(false);
  });
});

describe("useThermalAwareFeature", () => {
  it("should provide feature status", () => {
    const { result } = renderHook(() =>
      useThermalAwareFeature("avatar", "rendering")
    );

    expect(result.current.enabled).toBe(true);
    expect(result.current.intensity).toBe(1.0);
    expect(typeof result.current.reportActivity).toBe("function");
  });

  it("should report activity", () => {
    const { result } = renderHook(() =>
      useThermalAwareFeature("avatar", "rendering")
    );

    act(() => {
      result.current.reportActivity(true, 0.8);
    });

    // Intensity should be set
    expect(result.current.intensity).toBeLessThanOrEqual(0.8);
  });

  it("should clear activity", () => {
    const { result } = renderHook(() =>
      useThermalAwareFeature("avatar", "rendering")
    );

    act(() => {
      result.current.reportActivity(true, 0.8);
    });

    act(() => {
      result.current.reportActivity(false);
    });

    expect(result.current.intensity).toBe(0);
  });
});
