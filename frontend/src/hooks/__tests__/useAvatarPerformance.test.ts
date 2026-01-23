/**
 * Tests for useAvatarPerformance hook - Sprint 541
 *
 * Tests unified avatar performance management including:
 * - Render settings based on device capabilities
 * - Performance metrics tracking
 * - Quality adaptation
 * - Feature flag controls
 * - Visibility-based optimizations
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarPerformance,
  useAvatarRenderSettings,
  useAvatarAnimationLoop,
  useShouldRenderAvatar,
} from "../useAvatarPerformance";

// Mock dependencies
jest.mock("../useDeviceCapabilities", () => ({
  useDeviceCapabilities: () => ({
    tier: "high",
    settings: {
      targetFPS: 60,
      useWebGL: true,
      enableHardwareAcceleration: true,
      maxParticles: 1000,
      shadowQuality: "high",
      textureQuality: "high",
    },
    battery: {
      isLowBattery: false,
      level: 0.8,
      charging: true,
    },
  }),
}));

jest.mock("../useFrameRate", () => ({
  useFrameRate: ({ onLowFps }: { onLowFps?: (fps: number) => void }) => ({
    fps: 58,
    averageFps: 59,
    frameTime: 16.7,
    droppedFrames: 2,
    isPerformanceDegraded: false,
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  }),
  useAdaptiveQuality: () => ({
    quality: 0.9,
    adjustQuality: jest.fn(),
    resetQuality: jest.fn(),
  }),
}));

jest.mock("../useVisibility", () => ({
  useVisibility: () => ({
    isVisible: true,
    visibleTime: 10000,
    hiddenTime: 0,
  }),
}));

jest.mock("../useWakeLock", () => ({
  useCallWakeLock: () => ({
    isActive: true,
    request: jest.fn(),
    release: jest.fn(),
  }),
}));

jest.mock("../useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

jest.mock("../useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isOnline: true,
    isSlowConnection: false,
    effectiveType: "4g",
  }),
}));

describe("useAvatarPerformance", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should return settings, metrics, controls, and status", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.settings).toBeDefined();
      expect(result.current.metrics).toBeDefined();
      expect(result.current.controls).toBeDefined();
      expect(result.current.status).toBeDefined();
    });

    it("should initialize with default render settings", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      // When visible but not active, features are still enabled based on visibility
      expect(result.current.settings.lipSyncEnabled).toBe(true); // Visible
      expect(result.current.settings.renderMode).toBe("full"); // High tier + visible
    });

    it("should enable features when active", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      expect(result.current.settings.lipSyncEnabled).toBe(true);
      expect(result.current.settings.renderMode).toBe("full");
    });

    it("should provide control functions", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(typeof result.current.controls.forceQuality).toBe("function");
      expect(typeof result.current.controls.pauseAnimations).toBe("function");
      expect(typeof result.current.controls.resumeAnimations).toBe("function");
      expect(typeof result.current.controls.resetMetrics).toBe("function");
      expect(typeof result.current.controls.toggleFeature).toBe("function");
    });
  });

  // ============================================================================
  // Settings Tests
  // ============================================================================

  describe("settings", () => {
    it("should set render mode to full for high tier and active", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      expect(result.current.settings.renderMode).toBe("full");
    });

    it("should enable all features for high tier", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      expect(result.current.settings.lipSyncEnabled).toBe(true);
      expect(result.current.settings.eyeTrackingEnabled).toBe(true);
      expect(result.current.settings.microExpressionsEnabled).toBe(true);
      expect(result.current.settings.breathingAnimationEnabled).toBe(true);
      expect(result.current.settings.blinkAnimationEnabled).toBe(true);
    });

    it("should set lip sync quality based on tier", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      expect(result.current.settings.lipSyncQuality).toBe("high");
    });

    it("should set update interval based on target FPS", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true, targetFps: 60 })
      );

      // Base interval should be around 16.67ms for 60 FPS
      expect(result.current.settings.updateInterval).toBeCloseTo(16.67, 0);
    });
  });

  // ============================================================================
  // Metrics Tests
  // ============================================================================

  describe("metrics", () => {
    it("should track FPS metrics", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.metrics.fps).toBe(58);
      expect(result.current.metrics.averageFps).toBe(59);
      expect(result.current.metrics.frameTime).toBe(16.7);
    });

    it("should track dropped frames", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.metrics.droppedFrames).toBe(2);
    });

    it("should track quality level", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.metrics.qualityLevel).toBe(0.9);
    });

    it("should track visibility time", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.metrics.visibleTime).toBe(10000);
      expect(result.current.metrics.hiddenTime).toBe(0);
    });

    it("should report performance tier", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.metrics.tier).toBe("high");
    });
  });

  // ============================================================================
  // Status Tests
  // ============================================================================

  describe("status", () => {
    it("should report animation status", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      expect(result.current.status.isAnimating).toBe(true);
    });

    it("should report visibility status", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.status.isVisible).toBe(true);
    });

    it("should report wake lock status", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.status.isWakeLockActive).toBe(true);
    });

    it("should report performance degradation status", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.status.isPerformanceDegraded).toBe(false);
    });

    it("should report low power mode status", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.status.isLowPowerMode).toBe(false);
    });

    it("should report reduced motion preference", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.status.prefersReducedMotion).toBe(false);
    });

    it("should report connection quality", () => {
      const { result } = renderHook(() => useAvatarPerformance());

      expect(result.current.status.connectionQuality).toBe("good");
    });
  });

  // ============================================================================
  // Controls Tests
  // ============================================================================

  describe("controls", () => {
    it("should force quality level", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      act(() => {
        result.current.controls.forceQuality("low");
      });

      expect(result.current.metrics.tier).toBe("low");
    });

    it("should pause animations", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      expect(result.current.status.isAnimating).toBe(true);

      act(() => {
        result.current.controls.pauseAnimations();
      });

      expect(result.current.status.isAnimating).toBe(false);
    });

    it("should resume animations", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      act(() => {
        result.current.controls.pauseAnimations();
      });

      expect(result.current.status.isAnimating).toBe(false);

      act(() => {
        result.current.controls.resumeAnimations();
      });

      expect(result.current.status.isAnimating).toBe(true);
    });

    it("should toggle features", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      expect(result.current.settings.lipSyncEnabled).toBe(true);

      act(() => {
        result.current.controls.toggleFeature("lipSync", false);
      });

      expect(result.current.settings.lipSyncEnabled).toBe(false);
    });
  });

  // ============================================================================
  // Callback Tests
  // ============================================================================

  describe("callbacks", () => {
    it("should call onQualityChange when quality changes", () => {
      const onQualityChange = jest.fn();
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true, onQualityChange })
      );

      act(() => {
        result.current.controls.forceQuality("medium");
      });

      expect(onQualityChange).toHaveBeenCalledWith("medium");
    });
  });

  // ============================================================================
  // Render Mode Tests
  // ============================================================================

  describe("render mode", () => {
    it("should use full mode when visible (regardless of isActive)", () => {
      // isActive doesn't affect render mode, visibility does
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: false })
      );

      // Still full mode because visibility is true
      expect(result.current.settings.renderMode).toBe("full");
    });

    it("should use full mode when active and high tier", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      expect(result.current.settings.renderMode).toBe("full");
    });

    it("should use static mode when paused", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      act(() => {
        result.current.controls.pauseAnimations();
      });

      expect(result.current.settings.renderMode).toBe("static");
    });
  });

  // ============================================================================
  // CSS Animations Tests
  // ============================================================================

  describe("CSS animations", () => {
    it("should use CSS animations for low quality", () => {
      const { result } = renderHook(() =>
        useAvatarPerformance({ isActive: true })
      );

      act(() => {
        result.current.controls.forceQuality("low");
      });

      expect(result.current.settings.useCSSAnimations).toBe(true);
    });
  });
});

// ============================================================================
// Sub-Hooks Tests
// ============================================================================

describe("useAvatarRenderSettings", () => {
  it("should return render settings", () => {
    const { result } = renderHook(() => useAvatarRenderSettings(true));

    expect(result.current).toBeDefined();
    expect(result.current.lipSyncEnabled).toBe(true);
  });

  it("should return full settings when visible (regardless of isActive)", () => {
    // Render mode is based on visibility, not isActive
    const { result } = renderHook(() => useAvatarRenderSettings(false));

    // Still full because visibility is mocked as true
    expect(result.current.renderMode).toBe("full");
  });
});

describe("useAvatarAnimationLoop", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should provide isPaused and fps", () => {
    const callback = jest.fn();
    const { result } = renderHook(() =>
      useAvatarAnimationLoop(callback, { isActive: true })
    );

    expect(typeof result.current.isPaused).toBe("boolean");
    expect(typeof result.current.fps).toBe("number");
  });

  it("should start when active", () => {
    const callback = jest.fn();
    const { result } = renderHook(() =>
      useAvatarAnimationLoop(callback, { isActive: true })
    );

    expect(result.current.isPaused).toBe(false);
  });

  it("should be paused when not active", () => {
    const callback = jest.fn();
    const { result } = renderHook(() =>
      useAvatarAnimationLoop(callback, { isActive: false })
    );

    expect(result.current.isPaused).toBe(true);
  });
});

describe("useShouldRenderAvatar", () => {
  it("should return shouldRender and renderMode", () => {
    const { result } = renderHook(() => useShouldRenderAvatar(true));

    expect(typeof result.current.shouldRender).toBe("boolean");
    expect(result.current.renderMode).toBeDefined();
  });

  it("should render when active and visible", () => {
    const { result } = renderHook(() => useShouldRenderAvatar(true));

    expect(result.current.shouldRender).toBe(true);
    expect(result.current.renderMode).toBe("full");
  });

  it("should render when visible (regardless of isActive)", () => {
    // shouldRender is based on visibility and renderMode, not isActive
    const { result } = renderHook(() => useShouldRenderAvatar(false));

    // Still renders because visibility is mocked as true
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.renderMode).toBe("full");
  });
});
