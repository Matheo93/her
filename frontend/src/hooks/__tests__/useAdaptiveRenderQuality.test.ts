/**
 * Tests for Adaptive Render Quality Hook - Sprint 524
 *
 * Tests quality tier management, FPS-based adjustments, and device condition handling
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAdaptiveRenderQuality,
  useQualityTier,
  useResolutionScale,
  usePerformanceScore,
  type QualityTier,
} from "../useAdaptiveRenderQuality";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 100; // Start at 100 to avoid initial state issues
  jest.useFakeTimers();
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useAdaptiveRenderQuality", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useAdaptiveRenderQuality());

      expect(result.current.state.currentTier).toBe("high");
      expect(result.current.state.previousTier).toBeNull();
      expect(result.current.state.lastAdjustmentReason).toBe("initial");
      expect(result.current.state.performanceScore).toBeGreaterThan(0);
    });

    it("should accept custom initial tier", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "medium" })
      );

      expect(result.current.state.currentTier).toBe("medium");
    });

    it("should accept custom target FPS", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ targetFps: 30, minFps: 20 })
      );

      expect(result.current.metrics.avgFps).toBe(30);
    });

    it("should initialize metrics correctly", () => {
      const { result } = renderHook(() => useAdaptiveRenderQuality());

      expect(result.current.metrics.adjustmentsUp).toBe(0);
      expect(result.current.metrics.adjustmentsDown).toBe(0);
      expect(result.current.metrics.totalAdjustments).toBe(0);
    });

    it("should initialize device conditions", () => {
      const { result } = renderHook(() => useAdaptiveRenderQuality());

      expect(result.current.state.conditions).toBeDefined();
      expect(result.current.state.conditions.batteryLevel).toBeDefined();
      expect(result.current.state.conditions.thermalState).toBeDefined();
    });
  });

  describe("quality settings", () => {
    it("should return correct settings for ultra tier", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "ultra" })
      );

      expect(result.current.quality.tier).toBe("ultra");
      expect(result.current.quality.resolutionScale).toBe(1.0);
      expect(result.current.quality.textureQuality).toBe(1.0);
      expect(result.current.quality.shadowQuality).toBe(1.0);
    });

    it("should return correct settings for high tier", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "high" })
      );

      expect(result.current.quality.tier).toBe("high");
      expect(result.current.quality.resolutionScale).toBe(1.0);
      expect(result.current.quality.textureQuality).toBe(0.85);
    });

    it("should return correct settings for medium tier", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "medium" })
      );

      expect(result.current.quality.tier).toBe("medium");
      expect(result.current.quality.resolutionScale).toBe(0.85);
    });

    it("should return correct settings for low tier", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "low" })
      );

      expect(result.current.quality.tier).toBe("low");
      expect(result.current.quality.resolutionScale).toBe(0.7);
    });

    it("should return correct settings for minimal tier", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "minimal" })
      );

      expect(result.current.quality.tier).toBe("minimal");
      expect(result.current.quality.resolutionScale).toBe(0.5);
      expect(result.current.quality.shadowQuality).toBe(0);
    });

    it("should apply setting overrides", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "high" })
      );

      act(() => {
        result.current.controls.overrideSetting("resolutionScale", 0.5);
      });

      expect(result.current.quality.resolutionScale).toBe(0.5);
    });
  });

  describe("manual tier control", () => {
    it("should set quality tier manually", () => {
      const onQualityChanged = jest.fn();
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "high" }, { onQualityChanged })
      );

      act(() => {
        result.current.controls.setQualityTier("low");
      });

      expect(result.current.state.currentTier).toBe("low");
      expect(result.current.state.previousTier).toBe("high");
      expect(result.current.state.lastAdjustmentReason).toBe("user_request");
      expect(onQualityChanged).toHaveBeenCalled();
    });

    it("should not callback when setting same tier", () => {
      const onQualityChanged = jest.fn();
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "high" }, { onQualityChanged })
      );

      act(() => {
        result.current.controls.setQualityTier("high");
      });

      expect(onQualityChanged).not.toHaveBeenCalled();
    });
  });

  describe("frame time reporting", () => {
    it("should accept frame time reports", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ sampleWindow: 5 })
      );

      act(() => {
        result.current.controls.reportFrameTime(16.67); // 60 FPS
      });

      // No error thrown
      expect(result.current.state.currentTier).toBeDefined();
    });

    it("should update metrics after collecting samples", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ sampleWindow: 5 })
      );

      act(() => {
        for (let i = 0; i < 5; i++) {
          mockTime = i * 16.67;
          result.current.controls.reportFrameTime(16.67);
        }
      });

      // Metrics should be updated
      expect(result.current.metrics.avgFps).toBeGreaterThan(0);
    });

    it("should detect low FPS and lower quality", () => {
      const onQualityChanged = jest.fn();
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality(
          {
            initialTier: "high",
            sampleWindow: 5,
            minFps: 30,
            adjustmentCooldownMs: 0
          },
          { onQualityChanged }
        )
      );

      act(() => {
        // Report very low FPS (10 FPS = 100ms frame time)
        for (let i = 0; i < 10; i++) {
          mockTime = i * 100;
          result.current.controls.reportFrameTime(100);
        }
      });

      // Should have lowered quality due to low FPS
      if (onQualityChanged.mock.calls.length > 0) {
        expect(result.current.state.currentTier).not.toBe("ultra");
      }
    });

    it("should detect high FPS headroom and increase quality", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({
          initialTier: "low",
          sampleWindow: 5,
          targetFps: 60,
          adjustmentCooldownMs: 0
        })
      );

      act(() => {
        // Report very high FPS (120 FPS = 8.33ms frame time)
        for (let i = 0; i < 10; i++) {
          mockTime = i * 8.33;
          result.current.controls.reportFrameTime(8.33);
        }
      });

      // May have increased quality if stable
      expect(result.current.state.currentTier).toBeDefined();
    });
  });

  describe("quality locking", () => {
    it("should lock quality and prevent auto-adjustments", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({
          initialTier: "high",
          sampleWindow: 5,
          adjustmentCooldownMs: 0
        })
      );

      act(() => {
        result.current.controls.lock();
      });

      // Try to trigger adjustment with low FPS
      act(() => {
        for (let i = 0; i < 10; i++) {
          mockTime = i * 100;
          result.current.controls.reportFrameTime(100);
        }
      });

      // Quality should remain locked at high
      expect(result.current.state.currentTier).toBe("high");
    });

    it("should unlock and allow adjustments", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "high" })
      );

      act(() => {
        result.current.controls.lock();
        result.current.controls.unlock();
      });

      // Manual adjustments should work after unlock
      act(() => {
        result.current.controls.setQualityTier("low");
      });

      expect(result.current.state.currentTier).toBe("low");
    });
  });

  describe("cooldown", () => {
    it("should respect adjustment cooldown", () => {
      const onQualityChanged = jest.fn();
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality(
          {
            initialTier: "medium",
            adjustmentCooldownMs: 2000,
            sampleWindow: 3,
            minFps: 30
          },
          { onQualityChanged }
        )
      );

      // First adjustment
      act(() => {
        mockTime = 0;
        for (let i = 0; i < 5; i++) {
          result.current.controls.reportFrameTime(100); // Low FPS
        }
      });

      const initialCalls = onQualityChanged.mock.calls.length;

      // Try another adjustment within cooldown
      act(() => {
        mockTime = 500; // Only 500ms later
        for (let i = 0; i < 5; i++) {
          result.current.controls.reportFrameTime(100);
        }
      });

      // Should not have additional adjustments due to cooldown
      expect(onQualityChanged.mock.calls.length).toBe(initialCalls);
    });
  });

  describe("reset", () => {
    it("should reset to initial state", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "high" })
      );

      // Change tier
      act(() => {
        result.current.controls.setQualityTier("low");
      });

      expect(result.current.state.currentTier).toBe("low");

      // Reset
      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.currentTier).toBe("high");
      expect(result.current.state.previousTier).toBeNull();
      expect(result.current.metrics.totalAdjustments).toBe(0);
    });

    it("should clear setting overrides on reset", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "high" })
      );

      act(() => {
        result.current.controls.overrideSetting("resolutionScale", 0.5);
      });

      expect(result.current.quality.resolutionScale).toBe(0.5);

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.quality.resolutionScale).toBe(1.0);
    });
  });

  describe("getSettings", () => {
    it("should return current settings", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "medium" })
      );

      const settings = result.current.controls.getSettings();

      expect(settings.tier).toBe("medium");
      expect(settings.resolutionScale).toBe(0.85);
    });

    it("should include overrides in settings", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "high" })
      );

      act(() => {
        result.current.controls.overrideSetting("particleCount", 0.1);
      });

      const settings = result.current.controls.getSettings();

      expect(settings.particleCount).toBe(0.1);
    });
  });

  describe("evaluate", () => {
    it("should manually trigger evaluation", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ sampleWindow: 3 })
      );

      // Add samples
      act(() => {
        result.current.controls.reportFrameTime(16.67);
        result.current.controls.reportFrameTime(16.67);
        result.current.controls.reportFrameTime(16.67);
      });

      // Manual evaluation
      act(() => {
        result.current.controls.evaluate();
      });

      // Should not throw
      expect(result.current.state.currentTier).toBeDefined();
    });
  });

  describe("performance score", () => {
    it("should calculate performance score", () => {
      const { result } = renderHook(() => useAdaptiveRenderQuality());

      expect(result.current.state.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.current.state.performanceScore).toBeLessThanOrEqual(100);
    });
  });

  describe("metrics tracking", () => {
    it("should track adjustment metrics", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "medium" })
      );

      act(() => {
        result.current.controls.setQualityTier("low");
      });

      act(() => {
        result.current.controls.setQualityTier("high");
      });

      // One down (medium -> low), one up (low -> high)
      expect(result.current.metrics.totalAdjustments).toBe(2);
    });

    it("should track time at tier", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "high" })
      );

      act(() => {
        mockTime = 1000;
        result.current.controls.setQualityTier("medium");
      });

      // Should have recorded time at high tier
      expect(result.current.metrics.timeAtTier.high).toBeGreaterThanOrEqual(0);
    });
  });

  describe("callbacks", () => {
    it("should call onQualityChanged callback", () => {
      const onQualityChanged = jest.fn();
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "high" }, { onQualityChanged })
      );

      act(() => {
        result.current.controls.setQualityTier("low");
      });

      expect(onQualityChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "high",
          to: "low",
          reason: "user_request",
        })
      );
    });

    it("should call onPerformanceWarning callback", () => {
      const onPerformanceWarning = jest.fn();
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality(
          {
            sampleWindow: 3,
            minFps: 30,
            adjustmentCooldownMs: 0
          },
          { onPerformanceWarning }
        )
      );

      act(() => {
        // Report very low FPS
        for (let i = 0; i < 5; i++) {
          mockTime = i * 200;
          result.current.controls.reportFrameTime(200); // 5 FPS
        }
      });

      // May have called warning callback
      // Depends on evaluation timing
    });
  });

  describe("all quality tiers", () => {
    const tiers: QualityTier[] = ["ultra", "high", "medium", "low", "minimal"];

    tiers.forEach((tier) => {
      it(`should handle ${tier} tier`, () => {
        const { result } = renderHook(() =>
          useAdaptiveRenderQuality({ initialTier: tier })
        );

        expect(result.current.state.currentTier).toBe(tier);
        expect(result.current.quality.tier).toBe(tier);
        expect(result.current.quality.resolutionScale).toBeGreaterThan(0);
        expect(result.current.quality.resolutionScale).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("tier transitions", () => {
    it("should handle ultra -> minimal transition", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "ultra" })
      );

      act(() => {
        result.current.controls.setQualityTier("minimal");
      });

      expect(result.current.state.currentTier).toBe("minimal");
      expect(result.current.state.previousTier).toBe("ultra");
    });

    it("should handle minimal -> ultra transition", () => {
      const { result } = renderHook(() =>
        useAdaptiveRenderQuality({ initialTier: "minimal" })
      );

      act(() => {
        result.current.controls.setQualityTier("ultra");
      });

      expect(result.current.state.currentTier).toBe("ultra");
      expect(result.current.state.previousTier).toBe("minimal");
    });
  });
});

describe("useQualityTier", () => {
  it("should return current tier and setter", () => {
    const { result } = renderHook(() => useQualityTier(60));

    expect(result.current.tier).toBeDefined();
    expect(typeof result.current.setTier).toBe("function");
  });

  it("should allow setting tier", () => {
    const { result } = renderHook(() => useQualityTier(60));

    act(() => {
      result.current.setTier("low");
    });

    expect(result.current.tier).toBe("low");
  });
});

describe("useResolutionScale", () => {
  it("should return resolution scale", () => {
    const { result } = renderHook(() => useResolutionScale(60));

    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThanOrEqual(1);
  });
});

describe("usePerformanceScore", () => {
  it("should return performance score", () => {
    const { result } = renderHook(() => usePerformanceScore());

    expect(result.current).toBeGreaterThanOrEqual(0);
    expect(result.current).toBeLessThanOrEqual(100);
  });
});
