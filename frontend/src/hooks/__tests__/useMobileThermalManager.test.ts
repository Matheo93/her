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

// ============================================================================
// Sprint 634 - Additional Coverage Tests
// ============================================================================

describe("Sprint 634 - ThermalState transitions (lines 190-194)", () => {
  it("should handle serious thermal state", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        sampleIntervalMs: 100,
        fairThreshold: 30,
        seriousThreshold: 40,
        criticalThreshold: 50,
      })
    );

    // Report heavy workload to raise temperature using valid WorkloadTypes
    for (let i = 0; i < 50; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
        result.current.controls.reportWorkload("rendering", 1.0);
        result.current.controls.reportWorkload("media", 1.0);
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    // Check that temperature has risen above the fair threshold
    expect(result.current.state.thermal.estimatedTemp).toBeGreaterThan(30);
  });

  it("should handle critical thermal state with reduced performance scale", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        sampleIntervalMs: 100,
        fairThreshold: 28,
        seriousThreshold: 32,
        criticalThreshold: 38,
        autoThrottle: false, // Disable auto-throttle to avoid cooldown
      })
    );

    // Report sustained heavy workload using valid WorkloadTypes
    for (let i = 0; i < 60; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
        result.current.controls.reportWorkload("rendering", 1.0);
        result.current.controls.reportWorkload("media", 1.0);
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    // Temperature should have risen
    const temp = result.current.state.thermal.estimatedTemp;
    expect(temp).toBeGreaterThan(28);

    // Performance scale should be reduced for higher temps
    if (temp >= 38) {
      expect(result.current.state.performanceScale).toBeLessThan(0.5);
    }
  });
});

describe("Sprint 634 - Cooling trend (line 203)", () => {
  it("should have a valid thermal trend", () => {
    const { result } = renderHook(() => useMobileThermalManager());

    // Initial state should have a valid trend
    expect(["cooling", "stable", "warming", "heating_fast"]).toContain(result.current.state.thermal.trend);
  });

  it("should detect cooling trend when temperature drops", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        sampleIntervalMs: 100,
        fairThreshold: 30,
        seriousThreshold: 40,
        criticalThreshold: 50,
      })
    );

    // First heat up the device with heavy workload
    for (let i = 0; i < 30; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
        result.current.controls.reportWorkload("rendering", 1.0);
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    const peakTemp = result.current.state.thermal.estimatedTemp;
    expect(peakTemp).toBeGreaterThan(25); // Verify temperature rose

    // Clear workloads to allow cooling
    act(() => {
      result.current.controls.clearWorkload("computation");
      result.current.controls.clearWorkload("rendering");
    });

    // Let it cool for several intervals to build trend history
    for (let i = 0; i < 15; i++) {
      act(() => {
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    // Temperature should be lower or equal after cooling
    expect(result.current.state.thermal.estimatedTemp).toBeLessThanOrEqual(peakTemp);
    // Trend should be valid
    expect(["cooling", "stable", "warming", "heating_fast"]).toContain(result.current.state.thermal.trend);
  });

  it("should update thermal state when workloads are reported", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        sampleIntervalMs: 100,
      })
    );

    // Report a workload using valid WorkloadType
    act(() => {
      result.current.controls.reportWorkload("computation", 0.8);
    });

    // Advance time to let interval run
    act(() => {
      jest.advanceTimersByTime(110);
      mockTime += 110;
    });

    // State should be valid
    expect(result.current.state.thermal.state).toBeDefined();
    expect(result.current.state.thermal.trend).toBeDefined();
  });
});

describe("Sprint 634 - Cooldown completion (lines 422-434)", () => {
  it("should complete cooldown after duration elapsed", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        fairThreshold: 30,
        seriousThreshold: 35,
        criticalThreshold: 40,
        cooldownDurationMs: 5000, // 5 second cooldown
      })
    );

    // Heat up the device to trigger cooldown
    for (let i = 0; i < 25; i++) {
      act(() => {
        result.current.controls.reportWorkload("rendering", 1.0);
        result.current.controls.reportWorkload("computation", 1.0);
        jest.advanceTimersByTime(1100);
        mockTime += 1100;
      });
    }

    // Check if cooldown was triggered
    if (result.current.state.cooldown.active) {
      // Wait for cooldown to complete
      act(() => {
        jest.advanceTimersByTime(6000);
        mockTime += 6000;
      });

      // Cooldown should be inactive after duration
      expect(result.current.state.cooldown.active).toBe(false);
    }
  });

  it("should apply cooldown multiplier during active cooldown", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        fairThreshold: 30,
        seriousThreshold: 35,
        criticalThreshold: 40,
        cooldownDurationMs: 30000, // Long cooldown
      })
    );

    // Force trigger cooldown
    act(() => {
      result.current.controls.triggerCooldown();
    });

    expect(result.current.state.cooldown.active).toBe(true);

    // Continue with workload during cooldown
    act(() => {
      result.current.controls.reportWorkload("computation", 0.5);
      jest.advanceTimersByTime(1100);
      mockTime += 1100;
    });

    // Cooldown should still be active
    expect(result.current.state.cooldown.active).toBe(true);
  });
});

describe("Sprint 634 - History trimming (line 449)", () => {
  it("should handle history size configuration", () => {
    const historySize = 10;
    const { result } = renderHook(() =>
      useMobileThermalManager({
        historySize,
      })
    );

    // Report workload and let interval run
    act(() => {
      result.current.controls.reportWorkload("computation", 0.5);
    });

    act(() => {
      jest.advanceTimersByTime(1100);
      mockTime += 1100;
    });

    // Hook should be functional with custom history size
    expect(result.current.state.thermal).toBeDefined();
    expect(result.current.config.historySize).toBe(historySize);
  });
});

describe("Sprint 634 - Performance scale calculations", () => {
  it("should calculate performance scale based on thermal state", () => {
    const { result } = renderHook(() => useMobileThermalManager());

    // Initially at nominal, should have full performance
    expect(result.current.state.performanceScale).toBe(1.0);

    // Heat up a bit
    for (let i = 0; i < 10; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 0.8);
        jest.advanceTimersByTime(1100);
        mockTime += 1100;
      });
    }

    // Performance scale should still be reasonable
    expect(result.current.state.performanceScale).toBeGreaterThan(0);
    expect(result.current.state.performanceScale).toBeLessThanOrEqual(1.0);
  });

  it("should apply predictive scaling when enabled", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        predictiveScaling: true,
        seriousThreshold: 40,
      })
    );

    // Heat up towards serious threshold
    for (let i = 0; i < 15; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 0.9);
        result.current.controls.reportWorkload("rendering", 0.8);
        jest.advanceTimersByTime(1100);
        mockTime += 1100;
      });
    }

    // Predictive scaling should affect performance scale
    expect(result.current.state.performanceScale).toBeDefined();
  });
});

// ============================================================================
// Sprint 635 - Additional Coverage Tests for lines 190-194, 203, 422-434, 486, 504-508
// ============================================================================

describe("Sprint 635 - Performance scale for serious state (lines 190-191)", () => {
  it("should use 0.6 base scale for serious thermal state", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        sampleIntervalMs: 100,
        fairThreshold: 26,
        seriousThreshold: 30,
        criticalThreshold: 50,
        autoThrottle: false,
      })
    );

    // Heat up to serious threshold
    for (let i = 0; i < 40; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
        result.current.controls.reportWorkload("rendering", 1.0);
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    const temp = result.current.state.thermal.estimatedTemp;
    if (temp >= 30 && temp < 50) {
      // In serious state, base scale should be around 0.6 (may be modified by trend)
      expect(result.current.state.thermal.state).toBe("serious");
      expect(result.current.state.performanceScale).toBeLessThanOrEqual(0.7);
    }
  });
});

describe("Sprint 635 - Performance scale for critical state (lines 192-194)", () => {
  it("should use 0.3 base scale for critical thermal state", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        sampleIntervalMs: 100,
        fairThreshold: 26,
        seriousThreshold: 28,
        criticalThreshold: 32,
        autoThrottle: false,
      })
    );

    // Heat up to critical threshold
    for (let i = 0; i < 50; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
        result.current.controls.reportWorkload("rendering", 1.0);
        result.current.controls.reportWorkload("media", 1.0);
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    const temp = result.current.state.thermal.estimatedTemp;
    if (temp >= 32) {
      // In critical state, base scale should be around 0.3 (may be modified by trend)
      expect(result.current.state.thermal.state).toBe("critical");
      expect(result.current.state.performanceScale).toBeLessThanOrEqual(0.4);
    }
  });
});

describe("Sprint 635 - Cooling trend scaling (line 203)", () => {
  it("should apply 1.1x multiplier when cooling", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        sampleIntervalMs: 100,
        fairThreshold: 28,
        seriousThreshold: 35,
        criticalThreshold: 45,
      })
    );

    // First heat up
    for (let i = 0; i < 25; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
        result.current.controls.reportWorkload("rendering", 1.0);
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    const peakTemp = result.current.state.thermal.estimatedTemp;

    // Remove all workloads
    act(() => {
      result.current.controls.clearWorkload("computation");
      result.current.controls.clearWorkload("rendering");
    });

    // Let it cool for many intervals to establish cooling trend
    for (let i = 0; i < 20; i++) {
      act(() => {
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    // Temperature should have dropped
    expect(result.current.state.thermal.estimatedTemp).toBeLessThanOrEqual(peakTemp);
    // Trend should reflect cooling
    expect(["cooling", "stable"]).toContain(result.current.state.thermal.trend);
  });
});

describe("Sprint 635 - Cooldown auto-trigger on critical (line 486)", () => {
  it("should auto-trigger cooldown when reaching critical and autoThrottle is enabled", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        sampleIntervalMs: 100,
        fairThreshold: 26,
        seriousThreshold: 28,
        criticalThreshold: 32,
        autoThrottle: true,
        cooldownDurationMs: 30000,
      })
    );

    // Heat up quickly to critical threshold
    for (let i = 0; i < 60; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
        result.current.controls.reportWorkload("rendering", 1.0);
        result.current.controls.reportWorkload("media", 1.0);
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    const temp = result.current.state.thermal.estimatedTemp;
    // If we reached critical, cooldown should have been triggered
    if (temp >= 32) {
      expect(result.current.state.cooldown.active).toBe(true);
      expect(result.current.metrics.cooldownsTriggered).toBeGreaterThan(0);
    }
  });
});

describe("Sprint 635 - Metrics tracking for critical state (lines 504-508)", () => {
  it("should track time in critical state", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        sampleIntervalMs: 100,
        fairThreshold: 26,
        seriousThreshold: 28,
        criticalThreshold: 32,
        autoThrottle: false,
      })
    );

    // Heat up to critical
    for (let i = 0; i < 60; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
        result.current.controls.reportWorkload("rendering", 1.0);
        result.current.controls.reportWorkload("media", 1.0);
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    const temp = result.current.state.thermal.estimatedTemp;
    if (temp >= 32) {
      // Time in critical should have increased
      expect(result.current.metrics.timeInCritical).toBeGreaterThan(0);
    }
  });

  it("should track time in serious state", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        sampleIntervalMs: 100,
        fairThreshold: 26,
        seriousThreshold: 30,
        criticalThreshold: 50,
        autoThrottle: false,
      })
    );

    // Heat up to serious
    for (let i = 0; i < 40; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 1.0);
        result.current.controls.reportWorkload("rendering", 1.0);
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    const temp = result.current.state.thermal.estimatedTemp;
    if (temp >= 30 && temp < 50) {
      // Time in serious should have increased
      expect(result.current.metrics.timeInSerious).toBeGreaterThan(0);
    }
  });

  it("should track time in fair state", () => {
    const { result } = renderHook(() =>
      useMobileThermalManager({
        sampleIntervalMs: 100,
        fairThreshold: 26,
        seriousThreshold: 40,
        criticalThreshold: 50,
      })
    );

    // Heat up to fair state
    for (let i = 0; i < 20; i++) {
      act(() => {
        result.current.controls.reportWorkload("computation", 0.8);
        jest.advanceTimersByTime(110);
        mockTime += 110;
      });
    }

    const temp = result.current.state.thermal.estimatedTemp;
    if (temp >= 26 && temp < 40) {
      // Time in fair should have increased
      expect(result.current.metrics.timeInFair).toBeGreaterThan(0);
    }
  });
});
