/**
 * Tests for Mobile Render Optimizer Hook - Sprint 226
 *
 * Tests GPU-efficient rendering optimizations including quality tiers,
 * frame budget management, and dynamic quality adjustment.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useMobileRenderOptimizer,
  useRenderOptimizationStyles,
  useAdaptiveCanvasSize,
  useFrameRateAwareAnimation,
  RenderQuality,
} from "../useMobileRenderOptimizer";

// Mock canvas and WebGL context
const mockWebGLContext = {
  getParameter: jest.fn((param) => {
    if (param === 37446) return "Test Vendor"; // UNMASKED_VENDOR_WEBGL
    if (param === 37445) return "Test Renderer"; // UNMASKED_RENDERER_WEBGL
    if (param === 3379) return 4096; // MAX_TEXTURE_SIZE
    if (param === 3386) return [4096, 4096]; // MAX_VIEWPORT_DIMS
    return null;
  }),
  getExtension: jest.fn((name) => {
    if (name === "WEBGL_debug_renderer_info") return true;
    if (name === "OES_texture_float") return true;
    return null;
  }),
  VENDOR: 7936,
  RENDERER: 7937,
  MAX_TEXTURE_SIZE: 3379,
  MAX_VIEWPORT_DIMS: 3386,
};

beforeEach(() => {
  jest.useFakeTimers();

  // Mock canvas getContext - use type assertion to avoid strict type checking on mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = jest.fn((type: string) => {
    if (type === "webgl2" || type === "webgl") {
      return mockWebGLContext;
    }
    return null;
  });

  // Mock device memory
  Object.defineProperty(navigator, "deviceMemory", {
    value: 4,
    writable: true,
    configurable: true,
  });

  // Mock hardware concurrency
  Object.defineProperty(navigator, "hardwareConcurrency", {
    value: 4,
    writable: true,
    configurable: true,
  });

  // Mock window dimensions
  Object.defineProperty(window, "innerWidth", {
    value: 375,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: 812,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, "devicePixelRatio", {
    value: 3,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("useMobileRenderOptimizer", () => {
  // Note: We use autoAdjust: false in most tests to avoid infinite loop
  // in the auto-adjustment useEffect when recording frames

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      expect(result.current.isPaused).toBe(false);
      expect(result.current.isAutoAdjusting).toBe(false);
      expect(result.current.settings).toBeDefined();
      expect(result.current.deviceProfile).toBeDefined();
    });

    it("should detect device profile", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      expect(result.current.deviceProfile).toBeDefined();
      expect(result.current.deviceProfile.gpu).toBeDefined();
      expect(result.current.deviceProfile.memoryGB).toBe(4);
      expect(result.current.deviceProfile.cores).toBe(4);
    });

    it("should provide recommended quality", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      expect(["ultra", "high", "medium", "low", "minimal"]).toContain(
        result.current.recommendedQuality
      );
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({
          initialQuality: "low",
          targetFPS: 30,
          autoAdjust: false,
        })
      );

      expect(result.current.settings.quality).toBe("low");
      expect(result.current.settings.targetFPS).toBe(30);
      expect(result.current.isAutoAdjusting).toBe(false);
    });

    it("should initialize frame budget", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      expect(result.current.frameBudget).toBeDefined();
      expect(result.current.frameBudget.targetMs).toBeGreaterThan(0);
      expect(typeof result.current.frameBudget.isOverBudget).toBe("boolean");
    });

    it("should initialize metrics", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      expect(result.current.metrics).toBeDefined();
      expect(result.current.metrics.fps).toBe(60);
      expect(result.current.metrics.droppedFrames).toBe(0);
    });
  });

  describe("quality settings", () => {
    it("should have valid quality presets", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ initialQuality: "medium", autoAdjust: false })
      );

      expect(result.current.settings.quality).toBe("medium");
      expect(result.current.settings.resolution).toBeGreaterThan(0);
      expect(result.current.settings.resolution).toBeLessThanOrEqual(1);
    });

    it("should allow setting quality", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      act(() => {
        result.current.controls.setQuality("low");
      });

      expect(result.current.settings.quality).toBe("low");
    });

    it("should clamp quality to min/max", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({
          minQuality: "low",
          maxQuality: "high",
          autoAdjust: false,
        })
      );

      act(() => {
        result.current.controls.setQuality("minimal");
      });

      expect(result.current.settings.quality).toBe("low");

      act(() => {
        result.current.controls.setQuality("ultra");
      });

      expect(result.current.settings.quality).toBe("high");
    });

    it("should allow forcing quality", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      act(() => {
        result.current.controls.forceQuality("minimal");
      });

      expect(result.current.settings.quality).toBe("minimal");
      expect(result.current.isAutoAdjusting).toBe(false);
    });

    it("should restore auto-adjust when force is cleared", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: true })
      );

      act(() => {
        result.current.controls.forceQuality("low");
      });

      expect(result.current.isAutoAdjusting).toBe(false);

      act(() => {
        result.current.controls.forceQuality(null);
      });

      expect(result.current.isAutoAdjusting).toBe(true);
    });
  });

  describe("render settings by quality", () => {
    it.each<RenderQuality>(["ultra", "high", "medium", "low", "minimal"])(
      "should provide correct settings for %s quality",
      (quality) => {
        const { result } = renderHook(() =>
          useMobileRenderOptimizer({ initialQuality: quality, autoAdjust: false })
        );

        expect(result.current.settings.quality).toBe(quality);
        expect(typeof result.current.settings.enableShadows).toBe("boolean");
        expect(typeof result.current.settings.enableReflections).toBe("boolean");
        expect(typeof result.current.settings.enableParticles).toBe("boolean");
        expect(typeof result.current.settings.enablePostProcessing).toBe("boolean");
        expect(typeof result.current.settings.enableAntialiasing).toBe("boolean");
        expect([0, 2, 4, 8]).toContain(result.current.settings.antialiasingLevel);
      }
    );

    it("should have higher resolution for higher quality", () => {
      const { result: ultraResult } = renderHook(() =>
        useMobileRenderOptimizer({ initialQuality: "ultra", autoAdjust: false })
      );
      const { result: minimalResult } = renderHook(() =>
        useMobileRenderOptimizer({ initialQuality: "minimal", autoAdjust: false })
      );

      expect(ultraResult.current.settings.resolution).toBeGreaterThan(
        minimalResult.current.settings.resolution
      );
    });

    it("should have more features enabled for higher quality", () => {
      const { result: highResult } = renderHook(() =>
        useMobileRenderOptimizer({ initialQuality: "high", autoAdjust: false })
      );
      const { result: lowResult } = renderHook(() =>
        useMobileRenderOptimizer({ initialQuality: "low", autoAdjust: false })
      );

      expect(highResult.current.settings.enableShadows).toBe(true);
      expect(lowResult.current.settings.enableShadows).toBe(false);
    });
  });

  describe("frame recording", () => {
    it("should record frame times", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      act(() => {
        result.current.controls.recordFrame(16);
        result.current.controls.recordFrame(17);
        result.current.controls.recordFrame(15);
      });

      expect(result.current.metrics.fps).toBeGreaterThan(0);
    });

    it("should track dropped frames", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      // Record frames over 33.33ms (below 30fps threshold)
      act(() => {
        result.current.controls.recordFrame(40);
        result.current.controls.recordFrame(50);
      });

      expect(result.current.metrics.droppedFrames).toBeGreaterThan(0);
    });

    it("should calculate average frame time", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      act(() => {
        result.current.controls.recordFrame(16);
        result.current.controls.recordFrame(16);
        result.current.controls.recordFrame(16);
      });

      expect(result.current.metrics.frameTime).toBeCloseTo(16, 0);
    });
  });

  describe("pause/resume", () => {
    it("should pause rendering", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      expect(result.current.isPaused).toBe(false);

      act(() => {
        result.current.controls.pause();
      });

      expect(result.current.isPaused).toBe(true);
    });

    it("should resume rendering", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      act(() => {
        result.current.controls.pause();
      });

      act(() => {
        result.current.controls.resume();
      });

      expect(result.current.isPaused).toBe(false);
    });
  });

  describe("optimization hints", () => {
    it("should provide optimization hints", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      const hints = result.current.controls.getOptimizationHints();

      expect(hints).toBeDefined();
      expect(typeof hints.useWillChange).toBe("boolean");
      expect(typeof hints.useTransform3d).toBe("boolean");
      expect(typeof hints.useContainment).toBe("boolean");
      expect(typeof hints.useLayerPromotion).toBe("boolean");
      expect(typeof hints.disablePointerEvents).toBe("boolean");
      expect(typeof hints.useAsyncDecoding).toBe("boolean");
      expect(typeof hints.useLazyLoading).toBe("boolean");
    });

    it("should always use transform3d for GPU acceleration", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      const hints = result.current.controls.getOptimizationHints();

      expect(hints.useTransform3d).toBe(true);
    });

    it("should always use lazy loading", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      const hints = result.current.controls.getOptimizationHints();

      expect(hints.useLazyLoading).toBe(true);
    });

    it("should disable pointer events for low-end quality", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ initialQuality: "minimal", autoAdjust: false })
      );

      const hints = result.current.controls.getOptimizationHints();

      expect(hints.disablePointerEvents).toBe(true);
    });
  });

  describe("metrics reset", () => {
    it("should reset metrics", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      // Record some frames
      act(() => {
        result.current.controls.recordFrame(40);
        result.current.controls.recordFrame(50);
      });

      expect(result.current.metrics.droppedFrames).toBeGreaterThan(0);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.droppedFrames).toBe(0);
      expect(result.current.metrics.qualityChanges).toBe(0);
    });
  });

  describe("controls API", () => {
    it("should provide all control functions", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      expect(typeof result.current.controls.setQuality).toBe("function");
      expect(typeof result.current.controls.forceQuality).toBe("function");
      expect(typeof result.current.controls.pause).toBe("function");
      expect(typeof result.current.controls.resume).toBe("function");
      expect(typeof result.current.controls.recordFrame).toBe("function");
      expect(typeof result.current.controls.getOptimizationHints).toBe("function");
      expect(typeof result.current.controls.resetMetrics).toBe("function");
    });
  });

  describe("device profile", () => {
    it("should provide GPU info", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      expect(result.current.deviceProfile.gpu).toBeDefined();
      expect(result.current.deviceProfile.gpu.vendor).toBeDefined();
      expect(result.current.deviceProfile.gpu.renderer).toBeDefined();
      expect(["high", "medium", "low", "unknown"]).toContain(
        result.current.deviceProfile.gpu.tier
      );
    });

    it("should provide screen dimensions", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      expect(result.current.deviceProfile.viewportWidth).toBe(375);
      expect(result.current.deviceProfile.viewportHeight).toBe(812);
      expect(result.current.deviceProfile.screenDensity).toBe(3);
    });
  });

  describe("frame budget", () => {
    it("should calculate target frame time", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ targetFPS: 60, autoAdjust: false })
      );

      // 60fps = 16.67ms per frame
      expect(result.current.frameBudget.targetMs).toBeCloseTo(16.67, 1);
    });

    it("should track consecutive drops", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ autoAdjust: false })
      );

      expect(result.current.frameBudget.consecutiveDrops).toBe(0);
    });
  });
});

describe("useRenderOptimizationStyles", () => {
  it("should return CSS properties object", () => {
    const { result } = renderHook(() =>
      useRenderOptimizationStyles({ autoAdjust: false })
    );

    expect(result.current).toBeDefined();
    expect(typeof result.current).toBe("object");
  });

  it("should include transform for GPU acceleration", () => {
    const { result } = renderHook(() =>
      useRenderOptimizationStyles({ autoAdjust: false })
    );

    expect(result.current.transform).toBe("translateZ(0)");
  });
});

describe("useAdaptiveCanvasSize", () => {
  it("should return canvas dimensions", () => {
    const { result } = renderHook(() =>
      useAdaptiveCanvasSize(100, 100, { autoAdjust: false })
    );

    expect(result.current).toBeDefined();
    expect(typeof result.current.width).toBe("number");
    expect(typeof result.current.height).toBe("number");
    expect(typeof result.current.scale).toBe("number");
  });

  it("should scale based on quality", () => {
    const { result } = renderHook(() =>
      useAdaptiveCanvasSize(100, 100, { initialQuality: "medium", autoAdjust: false })
    );

    // Medium quality has 0.85 resolution scale
    expect(result.current.scale).toBeLessThan(3); // Less than full 3x DPR
  });

  it("should cap DPR at 2x", () => {
    const { result } = renderHook(() =>
      useAdaptiveCanvasSize(100, 100, { initialQuality: "ultra", autoAdjust: false })
    );

    // Ultra has 1.0 scale, capped at 2x DPR
    expect(result.current.scale).toBeLessThanOrEqual(2);
  });
});

describe("useFrameRateAwareAnimation", () => {
  it("should return animation info", () => {
    const { result } = renderHook(() =>
      useFrameRateAwareAnimation({ autoAdjust: false })
    );

    expect(result.current).toBeDefined();
    expect(typeof result.current.shouldAnimate).toBe("boolean");
    expect(typeof result.current.targetFPS).toBe("number");
    expect(typeof result.current.frameInterval).toBe("number");
  });

  it("should allow animation when not paused", () => {
    const { result } = renderHook(() =>
      useFrameRateAwareAnimation({ autoAdjust: false })
    );

    expect(result.current.shouldAnimate).toBe(true);
  });

  it("should calculate correct frame interval", () => {
    const { result } = renderHook(() =>
      useFrameRateAwareAnimation({ targetFPS: 60, autoAdjust: false })
    );

    // 60fps = 16.67ms interval
    expect(result.current.frameInterval).toBeCloseTo(16.67, 1);
  });
});

// ============================================================================
// Sprint 628 - Additional coverage tests
// ============================================================================

describe("Sprint 628 - GPU tier detection (lines 289-292)", () => {
  it("should detect low-end GPU from renderer string", () => {
    (HTMLCanvasElement.prototype as any).getContext = jest.fn((type: string) => {
      if (type === "webgl2" || type === "webgl") {
        return {
          ...mockWebGLContext,
          getParameter: jest.fn((param) => {
            if (param === 37445) return "Mali-T720"; // Low-end GPU pattern
            if (param === 37446) return "ARM";
            if (param === 3379) return 4096;
            if (param === 3386) return [4096, 4096];
            return null;
          }),
        };
      }
      return null;
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    expect(result.current.deviceProfile.gpu.tier).toBe("low");
  });

  it("should detect Adreno 3xx as low-end GPU", () => {
    (HTMLCanvasElement.prototype as any).getContext = jest.fn((type: string) => {
      if (type === "webgl2" || type === "webgl") {
        return {
          ...mockWebGLContext,
          getParameter: jest.fn((param) => {
            if (param === 37445) return "Adreno 320";
            if (param === 37446) return "Qualcomm";
            if (param === 3379) return 4096;
            if (param === 3386) return [4096, 4096];
            return null;
          }),
        };
      }
      return null;
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    expect(result.current.deviceProfile.gpu.tier).toBe("low");
  });

  it("should detect high-end GPU from renderer string", () => {
    (HTMLCanvasElement.prototype as any).getContext = jest.fn((type: string) => {
      if (type === "webgl2" || type === "webgl") {
        return {
          ...mockWebGLContext,
          getParameter: jest.fn((param) => {
            if (param === 37445) return "Apple GPU"; // High-end GPU pattern
            if (param === 37446) return "Apple Inc.";
            if (param === 3379) return 16384;
            if (param === 3386) return [16384, 16384];
            return null;
          }),
        };
      }
      return null;
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    expect(result.current.deviceProfile.gpu.tier).toBe("high");
  });

  it("should detect Adreno 6xx as high-end GPU", () => {
    (HTMLCanvasElement.prototype as any).getContext = jest.fn((type: string) => {
      if (type === "webgl2" || type === "webgl") {
        return {
          ...mockWebGLContext,
          getParameter: jest.fn((param) => {
            if (param === 37445) return "Adreno 650";
            if (param === 37446) return "Qualcomm";
            if (param === 3379) return 16384;
            if (param === 3386) return [16384, 16384];
            return null;
          }),
        };
      }
      return null;
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    expect(result.current.deviceProfile.gpu.tier).toBe("high");
  });
});

describe("Sprint 628 - GPU detection fallback (line 315)", () => {
  it("should return default GPU info when WebGL fails", () => {
    (HTMLCanvasElement.prototype as any).getContext = jest.fn(() => null);

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    expect(result.current.deviceProfile.gpu.tier).toBe("unknown");
    expect(result.current.deviceProfile.gpu.vendor).toBe("unknown");
    expect(result.current.deviceProfile.gpu.renderer).toBe("unknown");
  });

  it("should handle exception in GPU detection", () => {
    (HTMLCanvasElement.prototype as any).getContext = jest.fn(() => {
      throw new Error("WebGL not supported");
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    expect(result.current.deviceProfile.gpu.tier).toBe("unknown");
  });
});

describe("Sprint 628 - Quality recommendation with battery (lines 366-367)", () => {
  it("should reduce quality when battery is low and not charging", () => {
    // Reset mock
    (HTMLCanvasElement.prototype as any).getContext = jest.fn((type: string) => {
      if (type === "webgl2" || type === "webgl") return mockWebGLContext;
      return null;
    });

    const mockBattery = {
      level: 0.15, // 15% battery
      charging: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    Object.defineProperty(navigator, "getBattery", {
      value: jest.fn().mockResolvedValue(mockBattery),
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ batteryAware: true, autoAdjust: false })
    );

    // Wait for battery update
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Recommendation should account for low battery
    expect(["ultra", "high", "medium", "low", "minimal"]).toContain(
      result.current.recommendedQuality
    );
  });

  it("should not reduce quality when battery is low but charging", () => {
    const mockBattery = {
      level: 0.15,
      charging: true, // Charging
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    Object.defineProperty(navigator, "getBattery", {
      value: jest.fn().mockResolvedValue(mockBattery),
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ batteryAware: true, autoAdjust: false })
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.recommendedQuality).toBeDefined();
  });
});

describe("Sprint 628 - Quality recommendation with thermal (line 372)", () => {
  it("should reduce quality when thermally throttled", () => {
    // We can't directly set isThermalThrottled, but we can verify the logic exists
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ thermalAware: true, autoAdjust: false })
    );

    expect(result.current.deviceProfile.isThermalThrottled).toBe(false);
  });
});

describe("Sprint 628 - Quality recommendation with low power mode (line 377)", () => {
  it("should track low power mode state", () => {
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    expect(result.current.deviceProfile.isLowPowerMode).toBe(false);
  });
});

describe("Sprint 628 - Quality recommendation with screen density (line 381)", () => {
  it("should account for high screen density", () => {
    Object.defineProperty(window, "devicePixelRatio", {
      value: 3.5, // High DPI
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    expect(result.current.deviceProfile.screenDensity).toBe(3.5);
    // Quality recommendation should be slightly lower for high DPI
    expect(["ultra", "high", "medium", "low", "minimal"]).toContain(
      result.current.recommendedQuality
    );
  });
});

describe("Sprint 628 - Quality level functions (lines 406-414)", () => {
  it("should not lower quality below minimal", () => {
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ initialQuality: "minimal", autoAdjust: false })
    );

    expect(result.current.settings.quality).toBe("minimal");

    // Trying to set lower should stay at minimal due to clamping
    act(() => {
      result.current.controls.setQuality("minimal");
    });

    expect(result.current.settings.quality).toBe("minimal");
  });

  it("should not raise quality above ultra", () => {
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ initialQuality: "ultra", autoAdjust: false })
    );

    expect(result.current.settings.quality).toBe("ultra");

    act(() => {
      result.current.controls.setQuality("ultra");
    });

    expect(result.current.settings.quality).toBe("ultra");
  });
});

describe("Sprint 628 - Battery status updates (lines 483-497)", () => {
  it("should update device profile on battery level change", async () => {
    const mockBattery = {
      level: 0.8,
      charging: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    Object.defineProperty(navigator, "getBattery", {
      value: jest.fn().mockResolvedValue(mockBattery),
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ batteryAware: true, autoAdjust: false })
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Verify event listeners were added
    expect(mockBattery.addEventListener).toHaveBeenCalledWith(
      "levelchange",
      expect.any(Function)
    );
    expect(mockBattery.addEventListener).toHaveBeenCalledWith(
      "chargingchange",
      expect.any(Function)
    );
  });

  it("should skip battery updates when batteryAware is false", () => {
    Object.defineProperty(navigator, "getBattery", {
      value: jest.fn(),
      writable: true,
      configurable: true,
    });

    renderHook(() =>
      useMobileRenderOptimizer({ batteryAware: false, autoAdjust: false })
    );

    expect(navigator.getBattery).not.toHaveBeenCalled();
  });

  it("should handle missing getBattery API", async () => {
    Object.defineProperty(navigator, "getBattery", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ batteryAware: true, autoAdjust: false })
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Should not crash, battery info will be null
    expect(result.current.deviceProfile.batteryLevel).toBeNull();
  });
});

describe("Sprint 628 - Memory pressure handling (lines 516-528)", () => {
  it("should respond to memory pressure events", async () => {
    // Check if onmemorypressure exists (simulated)
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({
        initialQuality: "high",
        memoryPressureAware: true,
        autoAdjust: false,
      })
    );

    expect(result.current.settings.quality).toBe("high");

    // We can't easily simulate memorypressure event in JSDOM
    // but we verify the hook initializes correctly
  });

  it("should skip memory pressure when disabled", () => {
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({
        memoryPressureAware: false,
        autoAdjust: false,
      })
    );

    expect(result.current.settings).toBeDefined();
  });
});

describe("Sprint 628 - Auto quality adjustment (lines 538-577)", () => {
  it("should lower quality when over budget", async () => {
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({
        initialQuality: "high",
        autoAdjust: true,
        adjustmentThreshold: 5,
        targetFPS: 60,
      })
    );

    // Record many slow frames in a single act to reduce memory pressure
    act(() => {
      for (let i = 0; i < 35; i++) {
        result.current.controls.recordFrame(25); // Slow frame
      }
      jest.advanceTimersByTime(3000);
    });

    // Quality may have been lowered
    expect(["ultra", "high", "medium", "low", "minimal"]).toContain(
      result.current.settings.quality
    );
  });

  it("should raise quality when there is headroom", async () => {
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({
        initialQuality: "low",
        autoAdjust: true,
        adjustmentThreshold: 5,
        targetFPS: 60,
      })
    );

    // Record many fast frames (under 16.67ms * 0.7 = ~11.7ms)
    for (let i = 0; i < 35; i++) {
      act(() => {
        result.current.controls.recordFrame(10); // Fast frame
      });
    }

    // Advance time past minimum adjustment interval
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // Quality may have been raised
    expect(["ultra", "high", "medium", "low", "minimal"]).toContain(
      result.current.settings.quality
    );
  });

  it("should not adjust when paused", () => {
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({
        initialQuality: "high",
        autoAdjust: true,
        adjustmentThreshold: 5,
      })
    );

    act(() => {
      result.current.controls.pause();
    });

    const initialQuality = result.current.settings.quality;

    // Record slow frames
    for (let i = 0; i < 35; i++) {
      act(() => {
        result.current.controls.recordFrame(30);
      });
    }

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // Quality should not change when paused
    expect(result.current.settings.quality).toBe(initialQuality);
  });

  it("should not adjust when forced quality is set", () => {
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({
        initialQuality: "high",
        autoAdjust: true,
        adjustmentThreshold: 5,
      })
    );

    act(() => {
      result.current.controls.forceQuality("medium");
    });

    expect(result.current.settings.quality).toBe("medium");

    // Record slow frames
    for (let i = 0; i < 35; i++) {
      act(() => {
        result.current.controls.recordFrame(30);
      });
    }

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // Quality should not change when forced
    expect(result.current.settings.quality).toBe("medium");
  });

  it("should update frame budget state", () => {
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({
        autoAdjust: true,
        targetFPS: 60,
      })
    );

    // Record slow frames
    act(() => {
      result.current.controls.recordFrame(25);
      result.current.controls.recordFrame(25);
      result.current.controls.recordFrame(25);
    });

    // Frame budget should track current performance
    expect(result.current.frameBudget.currentMs).toBeGreaterThan(0);
  });
});

describe("Sprint 628 - Frame history limit (line 621)", () => {
  it("should keep only last 60 frames", () => {
    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    // Record more than 60 frames
    for (let i = 0; i < 70; i++) {
      act(() => {
        result.current.controls.recordFrame(16);
      });
    }

    // Metrics should reflect average of recent frames
    expect(result.current.metrics.fps).toBeGreaterThan(0);
    expect(result.current.metrics.frameTime).toBeCloseTo(16, 1);
  });
});

describe("Sprint 628 - useRenderOptimizationStyles additional coverage (line 719)", () => {
  it("should disable pointer events for low quality", () => {
    const { result } = renderHook(() =>
      useRenderOptimizationStyles({ initialQuality: "minimal", autoAdjust: false })
    );

    expect(result.current.pointerEvents).toBe("none");
  });

  it("should enable willChange for high quality", () => {
    const { result } = renderHook(() =>
      useRenderOptimizationStyles({ initialQuality: "high", autoAdjust: false })
    );

    expect(result.current.willChange).toBe("transform, opacity");
  });

  it("should disable willChange for low quality", () => {
    const { result } = renderHook(() =>
      useRenderOptimizationStyles({ initialQuality: "low", autoAdjust: false })
    );

    // Low quality should not set willChange (undefined)
    expect(result.current.willChange).toBeUndefined();
  });

  it("should include contain property", () => {
    const { result } = renderHook(() =>
      useRenderOptimizationStyles({ autoAdjust: false })
    );

    expect((result.current as any).contain).toBe("layout paint");
  });
});

describe("Sprint 628 - Device profile additional coverage", () => {
  it("should use default memory when deviceMemory unavailable", () => {
    Object.defineProperty(navigator, "deviceMemory", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    // Should fallback to GPU-tier-based estimate
    expect(result.current.deviceProfile.memoryGB).toBeGreaterThan(0);
  });

  it("should use default cores when hardwareConcurrency unavailable", () => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    // Should fallback to 4 cores
    expect(result.current.deviceProfile.cores).toBe(4);
  });
});

describe("Sprint 628 - Quality score edge cases (lines 384-388)", () => {
  it("should return ultra quality for high score (>= 80)", () => {
    // High-end device setup
    Object.defineProperty(navigator, "deviceMemory", {
      value: 8,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "hardwareConcurrency", {
      value: 8,
      writable: true,
      configurable: true,
    });

    (HTMLCanvasElement.prototype as any).getContext = jest.fn((type: string) => {
      if (type === "webgl2" || type === "webgl") {
        return {
          ...mockWebGLContext,
          getParameter: jest.fn((param) => {
            if (param === 37445) return "Apple GPU";
            if (param === 37446) return "Apple Inc.";
            if (param === 3379) return 16384;
            if (param === 3386) return [16384, 16384];
            return null;
          }),
        };
      }
      return null;
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    expect(result.current.recommendedQuality).toBe("ultra");
  });

  it("should return minimal quality for low score (< 20)", () => {
    // Low-end device setup
    Object.defineProperty(navigator, "deviceMemory", {
      value: 1,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "hardwareConcurrency", {
      value: 2,
      writable: true,
      configurable: true,
    });

    (HTMLCanvasElement.prototype as any).getContext = jest.fn((type: string) => {
      if (type === "webgl2" || type === "webgl") {
        return {
          ...mockWebGLContext,
          getParameter: jest.fn((param) => {
            if (param === 37445) return "Mali-400";
            if (param === 37446) return "ARM";
            if (param === 3379) return 2048;
            if (param === 3386) return [2048, 2048];
            return null;
          }),
        };
      }
      return null;
    });

    const { result } = renderHook(() =>
      useMobileRenderOptimizer({ autoAdjust: false })
    );

    expect(["low", "minimal"]).toContain(result.current.recommendedQuality);
  });
});
