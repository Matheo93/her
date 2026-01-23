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
          useMobileRenderOptimizer({ initialQuality: quality })
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
        useMobileRenderOptimizer({ initialQuality: "ultra" })
      );
      const { result: minimalResult } = renderHook(() =>
        useMobileRenderOptimizer({ initialQuality: "minimal" })
      );

      expect(ultraResult.current.settings.resolution).toBeGreaterThan(
        minimalResult.current.settings.resolution
      );
    });

    it("should have more features enabled for higher quality", () => {
      const { result: highResult } = renderHook(() =>
        useMobileRenderOptimizer({ initialQuality: "high" })
      );
      const { result: lowResult } = renderHook(() =>
        useMobileRenderOptimizer({ initialQuality: "low" })
      );

      expect(highResult.current.settings.enableShadows).toBe(true);
      expect(lowResult.current.settings.enableShadows).toBe(false);
    });
  });

  describe("frame recording", () => {
    it("should record frame times", () => {
      const { result } = renderHook(() => useMobileRenderOptimizer());

      act(() => {
        result.current.controls.recordFrame(16);
        result.current.controls.recordFrame(17);
        result.current.controls.recordFrame(15);
      });

      expect(result.current.metrics.fps).toBeGreaterThan(0);
    });

    it("should track dropped frames", () => {
      const { result } = renderHook(() => useMobileRenderOptimizer());

      // Record frames over 33.33ms (below 30fps threshold)
      act(() => {
        result.current.controls.recordFrame(40);
        result.current.controls.recordFrame(50);
      });

      expect(result.current.metrics.droppedFrames).toBeGreaterThan(0);
    });

    it("should calculate average frame time", () => {
      const { result } = renderHook(() => useMobileRenderOptimizer());

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
      const { result } = renderHook(() => useMobileRenderOptimizer());

      expect(result.current.isPaused).toBe(false);

      act(() => {
        result.current.controls.pause();
      });

      expect(result.current.isPaused).toBe(true);
    });

    it("should resume rendering", () => {
      const { result } = renderHook(() => useMobileRenderOptimizer());

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
      const { result } = renderHook(() => useMobileRenderOptimizer());

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
      const { result } = renderHook(() => useMobileRenderOptimizer());

      const hints = result.current.controls.getOptimizationHints();

      expect(hints.useTransform3d).toBe(true);
    });

    it("should always use lazy loading", () => {
      const { result } = renderHook(() => useMobileRenderOptimizer());

      const hints = result.current.controls.getOptimizationHints();

      expect(hints.useLazyLoading).toBe(true);
    });

    it("should disable pointer events for low-end quality", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ initialQuality: "minimal" })
      );

      const hints = result.current.controls.getOptimizationHints();

      expect(hints.disablePointerEvents).toBe(true);
    });
  });

  describe("metrics reset", () => {
    it("should reset metrics", () => {
      const { result } = renderHook(() => useMobileRenderOptimizer());

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
      const { result } = renderHook(() => useMobileRenderOptimizer());

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
      const { result } = renderHook(() => useMobileRenderOptimizer());

      expect(result.current.deviceProfile.gpu).toBeDefined();
      expect(result.current.deviceProfile.gpu.vendor).toBeDefined();
      expect(result.current.deviceProfile.gpu.renderer).toBeDefined();
      expect(["high", "medium", "low", "unknown"]).toContain(
        result.current.deviceProfile.gpu.tier
      );
    });

    it("should provide screen dimensions", () => {
      const { result } = renderHook(() => useMobileRenderOptimizer());

      expect(result.current.deviceProfile.viewportWidth).toBe(375);
      expect(result.current.deviceProfile.viewportHeight).toBe(812);
      expect(result.current.deviceProfile.screenDensity).toBe(3);
    });
  });

  describe("frame budget", () => {
    it("should calculate target frame time", () => {
      const { result } = renderHook(() =>
        useMobileRenderOptimizer({ targetFPS: 60 })
      );

      // 60fps = 16.67ms per frame
      expect(result.current.frameBudget.targetMs).toBeCloseTo(16.67, 1);
    });

    it("should track consecutive drops", () => {
      const { result } = renderHook(() => useMobileRenderOptimizer());

      expect(result.current.frameBudget.consecutiveDrops).toBe(0);
    });
  });
});

describe("useRenderOptimizationStyles", () => {
  it("should return CSS properties object", () => {
    const { result } = renderHook(() => useRenderOptimizationStyles());

    expect(result.current).toBeDefined();
    expect(typeof result.current).toBe("object");
  });

  it("should include transform for GPU acceleration", () => {
    const { result } = renderHook(() => useRenderOptimizationStyles());

    expect(result.current.transform).toBe("translateZ(0)");
  });
});

describe("useAdaptiveCanvasSize", () => {
  it("should return canvas dimensions", () => {
    const { result } = renderHook(() => useAdaptiveCanvasSize(100, 100));

    expect(result.current).toBeDefined();
    expect(typeof result.current.width).toBe("number");
    expect(typeof result.current.height).toBe("number");
    expect(typeof result.current.scale).toBe("number");
  });

  it("should scale based on quality", () => {
    const { result } = renderHook(() =>
      useAdaptiveCanvasSize(100, 100, { initialQuality: "medium" })
    );

    // Medium quality has 0.85 resolution scale
    expect(result.current.scale).toBeLessThan(3); // Less than full 3x DPR
  });

  it("should cap DPR at 2x", () => {
    const { result } = renderHook(() =>
      useAdaptiveCanvasSize(100, 100, { initialQuality: "ultra" })
    );

    // Ultra has 1.0 scale, capped at 2x DPR
    expect(result.current.scale).toBeLessThanOrEqual(2);
  });
});

describe("useFrameRateAwareAnimation", () => {
  it("should return animation info", () => {
    const { result } = renderHook(() => useFrameRateAwareAnimation());

    expect(result.current).toBeDefined();
    expect(typeof result.current.shouldAnimate).toBe("boolean");
    expect(typeof result.current.targetFPS).toBe("number");
    expect(typeof result.current.frameInterval).toBe("number");
  });

  it("should allow animation when not paused", () => {
    const { result } = renderHook(() => useFrameRateAwareAnimation());

    expect(result.current.shouldAnimate).toBe(true);
  });

  it("should calculate correct frame interval", () => {
    const { result } = renderHook(() =>
      useFrameRateAwareAnimation({ targetFPS: 60 })
    );

    // 60fps = 16.67ms interval
    expect(result.current.frameInterval).toBeCloseTo(16.67, 1);
  });
});
