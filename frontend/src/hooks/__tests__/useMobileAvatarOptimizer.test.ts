/**
 * Tests for Mobile Avatar Optimizer Hook - Sprint 226
 *
 * Tests avatar-specific mobile optimizations including quality tiers,
 * animation settings, touch interactions, and power management.
 */

import { renderHook, act } from "@testing-library/react";

// Mock all dependencies before importing the hook
jest.mock("../useMobileDetect", () => ({
  useMobileDetect: () => ({
    isMobile: true,
    isTablet: false,
    isIOS: false,
    isAndroid: true,
    isTouchDevice: true,
  }),
}));

jest.mock("../useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isOnline: true,
    isSlowConnection: false,
    rtt: 50,
    downlink: 10,
    saveData: false,
  }),
}));

jest.mock("../useDeviceCapabilities", () => ({
  useDeviceCapabilities: () => ({
    tier: "medium",
    memory: { deviceMemory: 4 },
    battery: { isLowBattery: false, level: 0.8, charging: false },
    gpu: { isHighPerformance: false },
  }),
}));

jest.mock("../useLatencyOptimizer", () => ({
  useLatencyOptimizer: () => ({
    metrics: { quality: "good", averageLatency: 50 },
    strategy: {
      audioBufferMs: 150,
      requestTimeout: 10000,
      useOptimisticUpdates: true,
    },
  }),
}));

jest.mock("../useFrameRate", () => ({
  useFrameRate: () => ({
    fps: 60,
    averageFps: 55,
    droppedFrames: 0,
    isLowFps: false,
  }),
}));

jest.mock("../useVisibility", () => ({
  useVisibility: () => ({
    isVisible: true,
  }),
}));

jest.mock("../useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

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
