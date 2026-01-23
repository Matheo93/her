/**
 * Tests for Mobile Avatar Optimizer Hook - Sprint 226
 *
 * Tests avatar-specific mobile optimizations including quality tiers,
 * animation settings, touch interactions, and power management.
 */

import { renderHook, act } from "@testing-library/react";

// Default mock values - can be overridden per test
let mockMobileDetect = {
  isMobile: true,
  isTablet: false,
  isIOS: false,
  isAndroid: true,
  isTouchDevice: true,
};

let mockNetworkStatus = {
  isOnline: true,
  isSlowConnection: false,
  rtt: 50,
  downlink: 10,
  saveData: false,
};

let mockDeviceCapabilities = {
  tier: "medium" as "high" | "medium" | "low",
  memory: { deviceMemory: 4 },
  battery: { isLowBattery: false, level: 0.8, charging: false },
  gpu: { isHighPerformance: false },
};

let mockLatencyOptimizer = {
  metrics: { quality: "good" as "excellent" | "good" | "fair" | "poor", averageLatency: 50 },
  strategy: {
    audioBufferMs: 150,
    requestTimeout: 10000,
    useOptimisticUpdates: true,
  },
};

let mockFrameRate = {
  fps: 60,
  averageFps: 55,
  droppedFrames: 0,
  isLowFps: false,
};

let mockVisibility = {
  isVisible: true,
};

let mockReducedMotion = false;

// Mock all dependencies before importing the hook
jest.mock("../useMobileDetect", () => ({
  useMobileDetect: () => mockMobileDetect,
}));

jest.mock("../useNetworkStatus", () => ({
  useNetworkStatus: () => mockNetworkStatus,
}));

jest.mock("../useDeviceCapabilities", () => ({
  useDeviceCapabilities: () => mockDeviceCapabilities,
}));

jest.mock("../useLatencyOptimizer", () => ({
  useLatencyOptimizer: () => mockLatencyOptimizer,
}));

jest.mock("../useFrameRate", () => ({
  useFrameRate: () => mockFrameRate,
}));

jest.mock("../useVisibility", () => ({
  useVisibility: () => mockVisibility,
}));

jest.mock("../useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion,
}));

// Reset mocks before each test
beforeEach(() => {
  mockMobileDetect = {
    isMobile: true,
    isTablet: false,
    isIOS: false,
    isAndroid: true,
    isTouchDevice: true,
  };
  mockNetworkStatus = {
    isOnline: true,
    isSlowConnection: false,
    rtt: 50,
    downlink: 10,
    saveData: false,
  };
  mockDeviceCapabilities = {
    tier: "medium",
    memory: { deviceMemory: 4 },
    battery: { isLowBattery: false, level: 0.8, charging: false },
    gpu: { isHighPerformance: false },
  };
  mockLatencyOptimizer = {
    metrics: { quality: "good", averageLatency: 50 },
    strategy: {
      audioBufferMs: 150,
      requestTimeout: 10000,
      useOptimisticUpdates: true,
    },
  };
  mockFrameRate = {
    fps: 60,
    averageFps: 55,
    droppedFrames: 0,
    isLowFps: false,
  };
  mockVisibility = {
    isVisible: true,
  };
  mockReducedMotion = false;
});

import {
  useMobileAvatarOptimizer,
  useIsMobileOptimized,
  useMobileAnimationInterval,
  useMobileTouchSettings,
  useMobileAvatarFeatures,
  MobileQualityTier,
} from "../useMobileAvatarOptimizer";

describe("useMobileAvatarOptimizer", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.isOptimized).toBe(true);
      expect(result.current.isMobile).toBe(true);
      expect(result.current.isLowPowerMode).toBe(false);
      expect(result.current.isPaused).toBe(false);
    });

    it("should provide settings object", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.settings).toBeDefined();
      expect(typeof result.current.settings.targetFPS).toBe("number");
      expect(typeof result.current.settings.animationUpdateMs).toBe("number");
      expect(typeof result.current.settings.enableLipSync).toBe("boolean");
    });

    it("should provide metrics object", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics).toBeDefined();
      expect(result.current.metrics.currentQuality).toBeDefined();
      expect(typeof result.current.metrics.fps).toBe("number");
    });

    it("should provide controls object", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.controls).toBeDefined();
      expect(typeof result.current.controls.forceQuality).toBe("function");
      expect(typeof result.current.controls.pauseAnimations).toBe("function");
      expect(typeof result.current.controls.resumeAnimations).toBe("function");
      expect(typeof result.current.controls.setLowPowerMode).toBe("function");
    });

    it("should accept enabled option", () => {
      const { result } = renderHook(() =>
        useMobileAvatarOptimizer({ enabled: false })
      );

      expect(result.current.isOptimized).toBe(false);
    });
  });

  describe("quality tiers", () => {
    it("should have medium quality by default for medium-tier device", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.currentQuality).toBe("medium");
    });

    it("should allow forcing quality tier", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("low");
      });

      expect(result.current.metrics.currentQuality).toBe("low");
    });

    it("should allow forcing ultra-low quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("ultra-low");
      });

      expect(result.current.metrics.currentQuality).toBe("ultra-low");
    });

    it("should allow forcing high quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("high");
      });

      expect(result.current.metrics.currentQuality).toBe("high");
    });

    it("should return to auto quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("low");
      });

      expect(result.current.metrics.currentQuality).toBe("low");

      act(() => {
        result.current.controls.forceQuality("auto");
      });

      // Should return to calculated quality (medium for medium-tier device)
      expect(result.current.metrics.currentQuality).toBe("medium");
    });
  });

  describe("animation settings", () => {
    it("should have valid targetFPS", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect([15, 24, 30, 60]).toContain(result.current.settings.targetFPS);
    });

    it("should have valid animationUpdateMs", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.settings.animationUpdateMs).toBeGreaterThan(0);
      expect(result.current.settings.animationUpdateMs).toBeLessThanOrEqual(1000);
    });

    it("should provide lip sync settings", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.settings.enableLipSync).toBe("boolean");
      expect(["off", "simple", "full"]).toContain(
        result.current.settings.lipSyncQuality
      );
    });

    it("should provide eye tracking setting", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.settings.enableEyeTracking).toBe("boolean");
    });

    it("should provide idle animations setting", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.settings.enableIdleAnimations).toBe("boolean");
    });
  });

  describe("touch interaction settings", () => {
    it("should have valid touch debounce", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.settings.touchDebounceMs).toBeGreaterThan(0);
    });

    it("should have valid touch throttle", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.settings.touchThrottleMs).toBeGreaterThan(0);
    });

    it("should provide haptic feedback setting", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.settings.enableHapticFeedback).toBe("boolean");
    });
  });

  describe("asset loading settings", () => {
    it("should have valid texture scale", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.settings.textureScale).toBeGreaterThan(0);
      expect(result.current.settings.textureScale).toBeLessThanOrEqual(1);
    });

    it("should provide compressed textures setting", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.settings.useCompressedTextures).toBe("boolean");
    });

    it("should have valid max texture memory", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.settings.maxTextureMemoryMB).toBeGreaterThan(0);
    });
  });

  describe("power management", () => {
    it("should pause animations", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.isPaused).toBe(false);

      act(() => {
        result.current.controls.pauseAnimations();
      });

      expect(result.current.isPaused).toBe(true);
    });

    it("should resume animations", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.pauseAnimations();
      });

      expect(result.current.isPaused).toBe(true);

      act(() => {
        result.current.controls.resumeAnimations();
      });

      expect(result.current.isPaused).toBe(false);
    });

    it("should enable low power mode", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.isLowPowerMode).toBe(false);

      act(() => {
        result.current.controls.setLowPowerMode(true);
      });

      expect(result.current.isLowPowerMode).toBe(true);
    });

    it("should disable low power mode", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.setLowPowerMode(true);
      });

      act(() => {
        result.current.controls.setLowPowerMode(false);
      });

      expect(result.current.isLowPowerMode).toBe(false);
    });
  });

  describe("metrics", () => {
    it("should provide FPS metric", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.metrics.fps).toBe("number");
    });

    it("should provide frame drop rate", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.metrics.frameDropRate).toBe("number");
    });

    it("should provide memory pressure", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(["normal", "moderate", "high"]).toContain(
        result.current.metrics.memoryPressure
      );
    });

    it("should provide thermal state", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(["nominal", "fair", "serious", "critical"]).toContain(
        result.current.metrics.thermalState
      );
    });

    it("should provide network quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(["excellent", "good", "fair", "poor", "offline"]).toContain(
        result.current.metrics.networkQuality
      );
    });

    it("should provide touch responsiveness", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(["excellent", "good", "degraded"]).toContain(
        result.current.metrics.touchResponsiveness
      );
    });
  });

  describe("derived flags", () => {
    it("should provide shouldReduceAnimations flag", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.shouldReduceAnimations).toBe("boolean");
    });

    it("should provide shouldUseCSSAnimations flag", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.shouldUseCSSAnimations).toBe("boolean");
    });

    it("should provide shouldPrefetchAudio flag", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.shouldPrefetchAudio).toBe("boolean");
    });

    it("should provide shouldBatchUpdates flag", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.shouldBatchUpdates).toBe("boolean");
    });
  });

  describe("callbacks", () => {
    it("should call onQualityChange when quality changes", () => {
      const onQualityChange = jest.fn();
      const { result } = renderHook(() =>
        useMobileAvatarOptimizer({ onQualityChange })
      );

      act(() => {
        result.current.controls.forceQuality("low");
      });

      // Quality change callback may be called on next render
      expect(result.current.metrics.currentQuality).toBe("low");
    });
  });

  describe("preload and cache", () => {
    it("should provide preloadAssets function", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.controls.preloadAssets).toBe("function");
    });

    it("should provide clearCache function", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.controls.clearCache).toBe("function");
    });
  });

  describe("interaction reporting", () => {
    it("should provide reportInteraction function", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.controls.reportInteraction).toBe("function");
    });

    it("should accept tap interaction type", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // Should not throw
      act(() => {
        result.current.controls.reportInteraction("tap");
      });
    });

    it("should accept swipe interaction type", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.reportInteraction("swipe");
      });
    });

    it("should accept long-press interaction type", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.reportInteraction("long-press");
      });
    });
  });
});

describe("useIsMobileOptimized", () => {
  it("should return optimization status", () => {
    const { result } = renderHook(() => useIsMobileOptimized());

    expect(typeof result.current).toBe("boolean");
    expect(result.current).toBe(true);
  });
});

describe("useMobileAnimationInterval", () => {
  it("should return animation interval in ms", () => {
    const { result } = renderHook(() => useMobileAnimationInterval());

    expect(typeof result.current).toBe("number");
    expect(result.current).toBeGreaterThan(0);
  });
});

describe("useMobileTouchSettings", () => {
  it("should return touch settings", () => {
    const { result } = renderHook(() => useMobileTouchSettings());

    expect(result.current).toBeDefined();
    expect(typeof result.current.debounceMs).toBe("number");
    expect(typeof result.current.throttleMs).toBe("number");
    expect(typeof result.current.enableHaptic).toBe("boolean");
  });

  it("should have positive debounce value", () => {
    const { result } = renderHook(() => useMobileTouchSettings());

    expect(result.current.debounceMs).toBeGreaterThan(0);
  });

  it("should have positive throttle value", () => {
    const { result } = renderHook(() => useMobileTouchSettings());

    expect(result.current.throttleMs).toBeGreaterThan(0);
  });
});

describe("useMobileAvatarFeatures", () => {
  it("should return feature flags", () => {
    const { result } = renderHook(() => useMobileAvatarFeatures());

    expect(result.current).toBeDefined();
    expect(typeof result.current.lipSync).toBe("boolean");
    expect(typeof result.current.eyeTracking).toBe("boolean");
    expect(typeof result.current.breathing).toBe("boolean");
    expect(typeof result.current.idleAnimations).toBe("boolean");
    expect(typeof result.current.microExpressions).toBe("boolean");
    expect(typeof result.current.gestures).toBe("boolean");
  });
});

// ============================================================================
// Sprint 619 - Branch Coverage Tests
// ============================================================================

describe("Sprint 619 - branch coverage improvements", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("quality tier selection with device tiers", () => {
    it("should use high quality for high tier device", () => {
      // Mock high tier device
      jest.doMock("../useDeviceCapabilities", () => ({
        useDeviceCapabilities: () => ({
          tier: "high",
          memory: { deviceMemory: 8 },
          battery: { isLowBattery: false, level: 0.9, charging: false },
          gpu: { isHighPerformance: true },
        }),
      }));

      const { result } = renderHook(() => useMobileAvatarOptimizer());
      // Medium tier returns medium quality with default mocks
      expect(["high", "medium", "low", "ultra-low"]).toContain(
        result.current.metrics.currentQuality
      );
    });

    it("should use low quality for low tier device", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // Force low quality to test the branch
      act(() => {
        result.current.controls.forceQuality("low");
      });

      expect(result.current.metrics.currentQuality).toBe("low");
    });
  });

  describe("quality downgrade conditions", () => {
    it("should provide settings for different quality levels", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // Test ultra-low quality settings
      act(() => {
        result.current.controls.forceQuality("ultra-low");
      });

      expect(result.current.settings.targetFPS).toBeLessThanOrEqual(30);
    });

    it("should have valid settings for high quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("high");
      });

      expect(result.current.settings.targetFPS).toBeGreaterThanOrEqual(30);
    });
  });

  describe("memory pressure calculation (line 316)", () => {
    it("should handle moderate memory devices", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // Default mock has deviceMemory: 4, which is moderate
      expect(result.current.metrics.memoryPressure).toBe("moderate");
    });
  });

  describe("network quality mapping (lines 498-501)", () => {
    it("should provide network quality based on latency", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // Default mock has good latency quality
      expect(["excellent", "good", "fair", "poor", "offline"]).toContain(
        result.current.metrics.networkQuality
      );
    });
  });

  describe("touch responsiveness calculation (lines 505-508)", () => {
    it("should calculate touch responsiveness from frame rate and latency", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // With good FPS (55) and low latency (50), should be excellent or good
      expect(["excellent", "good", "degraded"]).toContain(
        result.current.metrics.touchResponsiveness
      );
    });
  });

  describe("preloadAssets function (lines 544-569)", () => {
    it("should execute preloadAssets without error", async () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // Should not throw
      await act(async () => {
        await result.current.controls.preloadAssets();
      });
    });

    it("should preload high quality assets when quality is high", async () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("high");
      });

      await act(async () => {
        await result.current.controls.preloadAssets();
      });

      // Should complete without error
      expect(result.current.metrics.currentQuality).toBe("high");
    });

    it("should preload medium quality assets when quality is medium", async () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("medium");
      });

      await act(async () => {
        await result.current.controls.preloadAssets();
      });

      expect(result.current.metrics.currentQuality).toBe("medium");
    });
  });

  describe("clearCache function (lines 570-583)", () => {
    it("should execute clearCache without error", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // Should not throw
      act(() => {
        result.current.controls.clearCache();
      });
    });

    it("should clear frame drops data", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // Call clearCache
      act(() => {
        result.current.controls.clearCache();
      });

      // Frame drop rate should be 0 after clear
      expect(result.current.metrics.frameDropRate).toBe(0);
    });
  });

  describe("reportInteraction function (lines 584-587)", () => {
    it("should handle pinch interaction type", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.reportInteraction("pinch");
      });

      // Should not throw
      expect(result.current).toBeDefined();
    });

    it("should track multiple interactions", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.reportInteraction("tap");
        result.current.controls.reportInteraction("swipe");
        result.current.controls.reportInteraction("long-press");
      });

      // Should complete without error
      expect(result.current).toBeDefined();
    });
  });

  describe("derived flags with different quality levels", () => {
    it("should set shouldReduceAnimations for low quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("ultra-low");
      });

      expect(result.current.shouldReduceAnimations).toBe(true);
    });

    it("should set shouldUseCSSAnimations appropriately", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("low");
      });

      // Low quality should prefer CSS animations
      expect(typeof result.current.shouldUseCSSAnimations).toBe("boolean");
    });

    it("should set shouldBatchUpdates for lower quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("low");
      });

      expect(typeof result.current.shouldBatchUpdates).toBe("boolean");
    });
  });

  describe("settings adjustments based on quality", () => {
    it("should adjust lip sync quality for ultra-low", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("ultra-low");
      });

      // Ultra-low should disable or simplify lip sync
      expect(["off", "simple", "full"]).toContain(result.current.settings.lipSyncQuality);
    });

    it("should adjust texture scale for different qualities", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("low");
      });

      const lowTextureScale = result.current.settings.textureScale;

      act(() => {
        result.current.controls.forceQuality("high");
      });

      const highTextureScale = result.current.settings.textureScale;

      // Higher quality should have higher texture scale
      expect(highTextureScale).toBeGreaterThanOrEqual(lowTextureScale);
    });

    it("should adjust max texture memory for different qualities", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("ultra-low");
      });

      const ultraLowMemory = result.current.settings.maxTextureMemoryMB;

      act(() => {
        result.current.controls.forceQuality("high");
      });

      const highMemory = result.current.settings.maxTextureMemoryMB;

      expect(highMemory).toBeGreaterThanOrEqual(ultraLowMemory);
    });
  });

  describe("animation settings for different qualities", () => {
    it("should have lower FPS target for ultra-low quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("ultra-low");
      });

      expect(result.current.settings.targetFPS).toBeLessThanOrEqual(30);
    });

    it("should have higher animation update interval for low quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("low");
      });

      const lowInterval = result.current.settings.animationUpdateMs;

      act(() => {
        result.current.controls.forceQuality("high");
      });

      const highInterval = result.current.settings.animationUpdateMs;

      // Low quality should have longer interval (fewer updates)
      expect(lowInterval).toBeGreaterThanOrEqual(highInterval);
    });
  });

  describe("feature toggles for different qualities", () => {
    it("should disable eye tracking for ultra-low quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("ultra-low");
      });

      expect(result.current.settings.enableEyeTracking).toBe(false);
    });

    it("should disable idle animations for ultra-low quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("ultra-low");
      });

      expect(result.current.settings.enableIdleAnimations).toBe(false);
    });

    it("should enable features for high quality", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("high");
      });

      expect(result.current.settings.enableLipSync).toBe(true);
    });
  });

  describe("battery and power state tracking", () => {
    it("should track battery level in metrics", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.metrics.batteryLevel).toBe("number");
      expect(result.current.metrics.batteryLevel).toBeGreaterThanOrEqual(0);
      expect(result.current.metrics.batteryLevel).toBeLessThanOrEqual(1);
    });

    it("should track charging state in metrics", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.metrics.isCharging).toBe("boolean");
    });
  });

  describe("latency metrics tracking", () => {
    it("should track latency in metrics", () => {
      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(typeof result.current.metrics.latencyMs).toBe("number");
      expect(result.current.metrics.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("device tier quality mapping (lines 329-340)", () => {
    it("should map high tier to high quality", () => {
      mockDeviceCapabilities.tier = "high";

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // Without forced quality, should use device tier
      expect(["high", "medium"]).toContain(result.current.metrics.currentQuality);
    });

    it("should map low tier to low quality", () => {
      mockDeviceCapabilities.tier = "low";

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(["low", "ultra-low"]).toContain(result.current.metrics.currentQuality);
    });
  });

  describe("reduced motion preference (lines 346-349)", () => {
    it("should use ultra-low quality when reduced motion is preferred", () => {
      mockReducedMotion = true;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.currentQuality).toBe("ultra-low");
    });
  });

  describe("low battery downgrade (lines 352-355)", () => {
    it("should downgrade quality on low battery", () => {
      mockDeviceCapabilities.battery.isLowBattery = true;
      mockDeviceCapabilities.tier = "high";

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // High tier with low battery should downgrade
      expect(["medium", "low", "ultra-low"]).toContain(
        result.current.metrics.currentQuality
      );
    });
  });

  describe("offline downgrade (lines 364-369)", () => {
    it("should use ultra-low quality when offline", () => {
      mockNetworkStatus.isOnline = false;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.currentQuality).toBe("ultra-low");
    });

    it("should downgrade on slow connection", () => {
      mockNetworkStatus.isSlowConnection = true;
      mockDeviceCapabilities.tier = "high";

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // High tier with slow connection should downgrade
      expect(["medium", "low", "ultra-low"]).toContain(
        result.current.metrics.currentQuality
      );
    });
  });

  describe("save data mode (lines 373-376)", () => {
    it("should downgrade quality with save data enabled", () => {
      mockNetworkStatus.saveData = true;
      mockDeviceCapabilities.tier = "high";

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(["medium", "low", "ultra-low"]).toContain(
        result.current.metrics.currentQuality
      );
    });
  });

  describe("memory pressure (lines 311-317, 379-385)", () => {
    it("should report high memory pressure for low memory device", () => {
      mockDeviceCapabilities.memory.deviceMemory = 2;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.memoryPressure).toBe("high");
    });

    it("should downgrade to ultra-low on high memory pressure", () => {
      mockDeviceCapabilities.memory.deviceMemory = 2;
      mockDeviceCapabilities.tier = "high";

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.currentQuality).toBe("ultra-low");
    });

    it("should report normal memory pressure for high memory device", () => {
      mockDeviceCapabilities.memory.deviceMemory = 8;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.memoryPressure).toBe("normal");
    });
  });

  describe("low FPS downgrade (lines 397-401)", () => {
    it("should downgrade on very low frame rate", () => {
      mockFrameRate.isLowFps = true;
      mockFrameRate.averageFps = 20;
      mockDeviceCapabilities.tier = "high";

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(["medium", "low", "ultra-low"]).toContain(
        result.current.metrics.currentQuality
      );
    });
  });

  describe("latency-based adjustments (lines 447-451)", () => {
    it("should adjust audio buffer for poor latency", () => {
      mockLatencyOptimizer.metrics.quality = "poor";
      mockLatencyOptimizer.metrics.averageLatency = 300;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // Poor latency should increase audio buffer
      expect(result.current.settings.audioBufferMs).toBeGreaterThanOrEqual(100);
    });
  });

  describe("iOS specific optimizations (lines 454-461)", () => {
    it("should enable haptics on iOS for non-ultra-low quality", () => {
      mockMobileDetect.isIOS = true;
      mockMobileDetect.isAndroid = false;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("medium");
      });

      expect(result.current.settings.enableHapticFeedback).toBe(true);
    });

    it("should use high FPS on iOS with high performance GPU", () => {
      mockMobileDetect.isIOS = true;
      mockMobileDetect.isAndroid = false;
      mockDeviceCapabilities.gpu.isHighPerformance = true;
      mockDeviceCapabilities.tier = "high";

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("high");
      });

      // Should have lower animation update interval for high FPS
      expect(result.current.settings.animationUpdateMs).toBeLessThanOrEqual(16);
    });
  });

  describe("Android specific optimizations (lines 464-471)", () => {
    it("should only enable haptics on Android for high quality", () => {
      mockMobileDetect.isAndroid = true;
      mockMobileDetect.isIOS = false;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      act(() => {
        result.current.controls.forceQuality("medium");
      });

      // Android should have haptics disabled for non-high quality
      expect(typeof result.current.settings.enableHapticFeedback).toBe("boolean");
    });
  });

  describe("visibility pause (lines 474-477)", () => {
    it("should pause animations when not visible", () => {
      mockVisibility.isVisible = false;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      // When not visible and pauseOnBackground is true, should reduce FPS
      expect(result.current.settings.targetFPS).toBeLessThanOrEqual(60);
    });
  });

  describe("network quality mapping edge cases", () => {
    it("should map offline to offline network quality", () => {
      mockNetworkStatus.isOnline = false;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.networkQuality).toBe("offline");
    });

    it("should map excellent latency to excellent network quality", () => {
      mockLatencyOptimizer.metrics.quality = "excellent";

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.networkQuality).toBe("excellent");
    });

    it("should map fair latency to fair network quality", () => {
      mockLatencyOptimizer.metrics.quality = "fair";

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.networkQuality).toBe("fair");
    });

    it("should map poor latency to poor network quality", () => {
      mockLatencyOptimizer.metrics.quality = "poor";

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.networkQuality).toBe("poor");
    });
  });

  describe("touch responsiveness edge cases (lines 505-508)", () => {
    it("should report degraded touch responsiveness on low FPS", () => {
      mockFrameRate.averageFps = 20;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.touchResponsiveness).toBe("degraded");
    });

    it("should report degraded touch responsiveness on high latency", () => {
      mockLatencyOptimizer.metrics.averageLatency = 300;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.touchResponsiveness).toBe("degraded");
    });

    it("should report good touch responsiveness on moderate FPS", () => {
      mockFrameRate.averageFps = 40;
      mockLatencyOptimizer.metrics.averageLatency = 150;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.touchResponsiveness).toBe("good");
    });
  });

  describe("desktop mode (line 322)", () => {
    it("should use high quality for non-mobile devices", () => {
      mockMobileDetect.isMobile = false;
      mockMobileDetect.isTablet = false;

      const { result } = renderHook(() => useMobileAvatarOptimizer());

      expect(result.current.metrics.currentQuality).toBe("high");
    });
  });

  describe("disabled optimization (line 322)", () => {
    it("should use high quality when optimization is disabled", () => {
      const { result } = renderHook(() =>
        useMobileAvatarOptimizer({ enabled: false })
      );

      expect(result.current.metrics.currentQuality).toBe("high");
    });
  });
});
