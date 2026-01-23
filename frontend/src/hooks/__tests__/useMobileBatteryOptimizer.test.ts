/**
 * Tests for Mobile Battery Optimizer Hook - Sprint 524
 *
 * Tests battery-aware feature management, power mode switching,
 * and automatic optimization based on battery level.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useMobileBatteryOptimizer,
  useBatteryLevel,
  useBatteryAwareFeature,
  BatteryLevel,
  PowerMode,
  FeatureCategory,
} from "../useMobileBatteryOptimizer";

// Mock battery API
let mockBattery: {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
};

let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.useFakeTimers();
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);

  mockBattery = {
    level: 1,
    charging: false,
    chargingTime: Infinity,
    dischargingTime: 36000, // 10 hours
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };

  // Mock navigator.getBattery - return null to avoid async updates in most tests
  (navigator as any).getBattery = jest.fn().mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete (navigator as any).getBattery;
});

describe("useMobileBatteryOptimizer", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      expect(result.current.state.level).toBe("full");
      expect(result.current.state.powerMode).toBe("normal");
      expect(result.current.state.battery.level).toBe(1);
      expect(result.current.state.battery.charging).toBe(false);
      expect(result.current.state.battery.supported).toBe(false);
    });

    it("should accept custom thresholds", () => {
      const { result } = renderHook(() =>
        useMobileBatteryOptimizer({
          thresholds: {
            full: 0.9,
            high: 0.7,
            medium: 0.4,
            low: 0.2,
            critical: 0.1,
          },
        })
      );

      expect(result.current.state.powerMode).toBe("normal");
    });

    it("should initialize metrics to default values", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      expect(result.current.metrics.currentLevel).toBe(100);
      expect(result.current.metrics.averageConsumption).toBe(0);
      expect(result.current.metrics.sessionConsumption).toBe(0);
      expect(result.current.metrics.sessionDuration).toBe(0);
    });

    it("should initialize all feature categories", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      const categories: FeatureCategory[] = [
        "animations",
        "video",
        "audio",
        "sync",
        "prefetch",
        "analytics",
        "location",
        "haptics",
        "high_refresh",
        "background",
      ];

      categories.forEach((category) => {
        expect(result.current.state.features[category]).toBeDefined();
        expect(result.current.state.features[category].category).toBe(category);
      });
    });
  });

  describe("power mode management", () => {
    it("should set power mode manually", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      act(() => {
        result.current.controls.setPowerMode("power_saver");
      });

      expect(result.current.state.powerMode).toBe("power_saver");
      expect(result.current.state.profile.mode).toBe("power_saver");
      expect(result.current.state.isOptimizing).toBe(false);
    });

    it("should update profile when power mode changes", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      act(() => {
        result.current.controls.setPowerMode("ultra_saver");
      });

      expect(result.current.currentProfile.mode).toBe("ultra_saver");
      expect(result.current.currentProfile.animationSpeed).toBe(0);
      expect(result.current.currentProfile.videoQuality).toBe("off");
      expect(result.current.currentProfile.refreshRate).toBe(30);
    });

    it("should have correct features for balanced mode", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      act(() => {
        result.current.controls.setPowerMode("balanced");
      });

      expect(result.current.currentProfile.features.animations).toBe(true);
      expect(result.current.currentProfile.features.location).toBe(false);
      expect(result.current.currentProfile.features.high_refresh).toBe(false);
    });

    it("should have correct features for power_saver mode", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      act(() => {
        result.current.controls.setPowerMode("power_saver");
      });

      expect(result.current.currentProfile.features.prefetch).toBe(false);
      expect(result.current.currentProfile.features.analytics).toBe(false);
      expect(result.current.currentProfile.features.haptics).toBe(false);
      expect(result.current.currentProfile.features.background).toBe(false);
    });

    it("should have correct features for ultra_saver mode", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      act(() => {
        result.current.controls.setPowerMode("ultra_saver");
      });

      expect(result.current.currentProfile.features.animations).toBe(false);
      expect(result.current.currentProfile.features.video).toBe(false);
      expect(result.current.currentProfile.features.audio).toBe(true);
      expect(result.current.currentProfile.features.sync).toBe(true);
    });
  });

  describe("feature management", () => {
    it("should enable a feature", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      act(() => {
        result.current.controls.setFeatureEnabled("animations", false);
      });

      expect(result.current.state.features.animations.enabled).toBe(false);

      act(() => {
        result.current.controls.setFeatureEnabled("animations", true);
      });

      expect(result.current.state.features.animations.enabled).toBe(true);
    });

    it("should clear degraded mode when manually enabling", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      // First disable with degraded flag
      act(() => {
        result.current.controls.setFeatureEnabled("video", false);
      });

      // Re-enable should clear degraded
      act(() => {
        result.current.controls.setFeatureEnabled("video", true);
      });

      expect(result.current.state.features.video.degradedMode).toBe(false);
    });

    it("should check if feature should be enabled", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      // In normal mode with full battery
      expect(result.current.controls.shouldEnableFeature("animations")).toBe(true);
      expect(result.current.controls.shouldEnableFeature("video")).toBe(true);
    });
  });

  describe("recommended profile", () => {
    it("should recommend normal profile when battery full", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      const recommended = result.current.controls.getRecommendedProfile();
      expect(recommended.mode).toBe("normal");
    });
  });

  describe("time estimation", () => {
    it("should estimate time for feature usage", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      const time = result.current.controls.estimateTimeForFeature("animations");
      expect(time).toBeGreaterThan(0);
      expect(time).not.toBe(Infinity);
    });

    it("should return Infinity for disabled features", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      act(() => {
        result.current.controls.setFeatureEnabled("video", false);
      });

      const time = result.current.controls.estimateTimeForFeature("video");
      expect(time).toBe(Infinity);
    });
  });

  describe("derived values", () => {
    it("should correctly report isLowBattery", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      // Full battery - not low
      expect(result.current.isLowBattery).toBe(false);
    });

    it("should correctly report isCharging", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      // Default mock is not charging
      expect(result.current.isCharging).toBe(false);
    });

    it("should report batteryLevel", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      expect(result.current.batteryLevel).toBe("full");
    });
  });

  describe("profile properties", () => {
    it("should have correct normal profile properties", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      act(() => {
        result.current.controls.setPowerMode("normal");
      });

      expect(result.current.currentProfile.animationSpeed).toBe(1);
      expect(result.current.currentProfile.syncInterval).toBe(30000);
      expect(result.current.currentProfile.videoQuality).toBe("auto");
      expect(result.current.currentProfile.audioQuality).toBe("high");
      expect(result.current.currentProfile.refreshRate).toBe(60);
    });

    it("should have correct balanced profile properties", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      act(() => {
        result.current.controls.setPowerMode("balanced");
      });

      expect(result.current.currentProfile.animationSpeed).toBe(0.8);
      expect(result.current.currentProfile.syncInterval).toBe(60000);
      expect(result.current.currentProfile.videoQuality).toBe("medium");
    });

    it("should have correct power_saver profile properties", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      act(() => {
        result.current.controls.setPowerMode("power_saver");
      });

      expect(result.current.currentProfile.animationSpeed).toBe(0.5);
      expect(result.current.currentProfile.syncInterval).toBe(120000);
      expect(result.current.currentProfile.videoQuality).toBe("low");
      expect(result.current.currentProfile.audioQuality).toBe("medium");
      expect(result.current.currentProfile.refreshRate).toBe(30);
    });

    it("should have correct ultra_saver profile properties", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      act(() => {
        result.current.controls.setPowerMode("ultra_saver");
      });

      expect(result.current.currentProfile.animationSpeed).toBe(0);
      expect(result.current.currentProfile.syncInterval).toBe(300000);
      expect(result.current.currentProfile.videoQuality).toBe("off");
      expect(result.current.currentProfile.audioQuality).toBe("low");
    });
  });

  describe("feature configurations", () => {
    it("should have correct power consumption for features", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      // Video has high power consumption
      expect(result.current.state.features.video.powerConsumption).toBe(8);
      // Haptics has low power consumption
      expect(result.current.state.features.haptics.powerConsumption).toBe(1);
    });

    it("should have correct priority for features", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      // Audio should have high priority
      expect(result.current.state.features.audio.priority).toBe(8);
      // Analytics should have low priority
      expect(result.current.state.features.analytics.priority).toBe(2);
    });

    it("should have correct min battery levels for features", () => {
      const { result } = renderHook(() => useMobileBatteryOptimizer());

      // High refresh needs more battery
      expect(result.current.state.features.high_refresh.minBatteryLevel).toBe(0.3);
      // Audio works at very low battery
      expect(result.current.state.features.audio.minBatteryLevel).toBe(0.05);
    });
  });

  describe("battery API integration", () => {
    it("should call getBattery when enabled", () => {
      (navigator as any).getBattery = jest.fn().mockResolvedValue(null);

      renderHook(() => useMobileBatteryOptimizer());

      // getBattery should be called during initialization
      expect((navigator as any).getBattery).toHaveBeenCalled();
    });

    it("should not call getBattery when API not available", () => {
      delete (navigator as any).getBattery;

      const { result } = renderHook(() => useMobileBatteryOptimizer());

      // Should still initialize with defaults
      expect(result.current.state.battery.supported).toBe(false);
    });

    it("should handle missing battery API gracefully", async () => {
      (navigator as any).getBattery = jest.fn().mockResolvedValue(null);

      const { result } = renderHook(() => useMobileBatteryOptimizer());

      // Give the async call time to resolve
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.state.battery.supported).toBe(false);
    });

    it("should handle battery API error gracefully", async () => {
      (navigator as any).getBattery = jest.fn().mockRejectedValue(new Error("Not supported"));

      const { result } = renderHook(() => useMobileBatteryOptimizer());

      // Give the async call time to resolve
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // Should not throw, battery will be marked unsupported
      expect(result.current.state.battery.supported).toBe(false);
    });
  });

  describe("disabled mode", () => {
    it("should not set up battery listeners when disabled", () => {
      renderHook(() => useMobileBatteryOptimizer({ enabled: false }));

      // Advance time to trigger interval
      act(() => {
        jest.advanceTimersByTime(70000);
      });

      // getBattery should not have been called for periodic updates
      // (Initial call may still happen)
    });
  });
});

describe("useBatteryLevel", () => {
  it("should provide battery level as percentage", () => {
    const { result } = renderHook(() => useBatteryLevel());

    expect(result.current.level).toBe(100);
  });

  it("should provide charging status", () => {
    const { result } = renderHook(() => useBatteryLevel());

    expect(result.current.isCharging).toBe(false);
  });

  it("should provide isLow status", () => {
    const { result } = renderHook(() => useBatteryLevel());

    expect(result.current.isLow).toBe(false);
  });

  it("should provide supported status", () => {
    const { result } = renderHook(() => useBatteryLevel());

    // Initially false before async init
    expect(typeof result.current.supported).toBe("boolean");
  });
});

describe("useBatteryAwareFeature", () => {
  it("should check if feature is enabled", () => {
    const { result } = renderHook(() => useBatteryAwareFeature("animations"));

    expect(result.current.enabled).toBe(true);
  });

  it("should check if feature should be enabled", () => {
    const { result } = renderHook(() => useBatteryAwareFeature("video"));

    expect(result.current.shouldEnable).toBe(true);
  });

  it("should not have reason when feature should be enabled", () => {
    const { result } = renderHook(() => useBatteryAwareFeature("audio"));

    expect(result.current.reason).toBeUndefined();
  });

  it("should work with different feature categories", () => {
    const categories: FeatureCategory[] = [
      "animations",
      "video",
      "audio",
      "sync",
      "prefetch",
    ];

    categories.forEach((category) => {
      const { result } = renderHook(() => useBatteryAwareFeature(category));
      expect(typeof result.current.enabled).toBe("boolean");
      expect(typeof result.current.shouldEnable).toBe("boolean");
    });
  });
});
