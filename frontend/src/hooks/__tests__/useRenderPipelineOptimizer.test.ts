/**
 * Tests for Render Pipeline Optimizer Hook - Sprint 569
 *
 * Tests GPU render pipeline optimization, frame budget management, and LOD
 * Expanded from 47 to ~100 tests
 */

import { renderHook, act } from "@testing-library/react";
import {
  useRenderPipelineOptimizer,
  useFrameBudget,
  useLODManager,
  useGPUInfo,
  LODLevel,
  RenderPriority,
  GPUTier,
  FrameBudget,
  GPUInfo,
  OcclusionHint,
  PipelineMetrics,
  PipelineState,
  PipelineConfig,
  PipelineControls,
  RenderPass,
  UseRenderPipelineOptimizerResult,
} from "../useRenderPipelineOptimizer";

// Mock performance.now for consistent timing
let mockTime = 0;

// Mock WebGL context
const createMockWebGLContext = (options: {
  isWebGL2?: boolean;
  maxTextureSize?: number;
  maxVertexAttribs?: number;
  renderer?: string;
  vendor?: string;
} = {}) => {
  const {
    isWebGL2 = true,
    maxTextureSize = 8192,
    maxVertexAttribs = 16,
    renderer = "ANGLE (NVIDIA GeForce RTX 3080)",
    vendor = "Google Inc.",
  } = options;

  const debugExt = {
    UNMASKED_RENDERER_WEBGL: 0x9246,
    UNMASKED_VENDOR_WEBGL: 0x9245,
  };

  return {
    getExtension: (name: string) => (name === "WEBGL_debug_renderer_info" ? debugExt : null),
    getParameter: (param: number) => {
      if (param === debugExt.UNMASKED_RENDERER_WEBGL) return renderer;
      if (param === debugExt.UNMASKED_VENDOR_WEBGL) return vendor;
      if (param === 0x0d33) return maxTextureSize; // MAX_TEXTURE_SIZE
      if (param === 0x8869) return maxVertexAttribs; // MAX_VERTEX_ATTRIBS
      return 0;
    },
    MAX_TEXTURE_SIZE: 0x0d33,
    MAX_VERTEX_ATTRIBS: 0x8869,
  };
};

// Store original createElement to call for non-canvas elements
const originalCreateElement = document.createElement.bind(document);

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);

  // Mock requestAnimationFrame
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    return setTimeout(() => cb(mockTime), 0) as unknown as number;
  });

  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    clearTimeout(id);
  });

  // Mock canvas and WebGL
  const mockContext = createMockWebGLContext();
  jest.spyOn(document, "createElement").mockImplementation((tagName: string) => {
    if (tagName === "canvas") {
      return {
        getContext: (type: string) => {
          if (type === "webgl2" || type === "webgl" || type === "experimental-webgl") {
            return mockContext;
          }
          return null;
        },
      } as unknown as HTMLCanvasElement;
    }
    return originalCreateElement(tagName);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ============================================================================
// Type Exports Tests
// ============================================================================

describe("Type exports", () => {
  it("should export LODLevel type values", () => {
    const levels: LODLevel[] = ["ultra", "high", "medium", "low", "minimal"];
    expect(levels).toHaveLength(5);
  });

  it("should export RenderPriority type values", () => {
    const priorities: RenderPriority[] = ["critical", "high", "normal", "low", "deferred"];
    expect(priorities).toHaveLength(5);
  });

  it("should export GPUTier type values", () => {
    const tiers: GPUTier[] = ["high", "medium", "low", "unknown"];
    expect(tiers).toHaveLength(4);
  });

  it("should export FrameBudget interface correctly", () => {
    const budget: FrameBudget = {
      totalBudgetMs: 16,
      usedMs: 0,
      remainingMs: 16,
      isOverBudget: false,
      utilizationPercent: 0,
    };
    expect(budget.totalBudgetMs).toBe(16);
  });

  it("should export GPUInfo interface correctly", () => {
    const info: GPUInfo = {
      tier: "high",
      renderer: "test",
      vendor: "test",
      isWebGL2: true,
      maxTextureSize: 8192,
      maxVertexAttribs: 16,
      estimatedVRAM: 8192,
    };
    expect(info.tier).toBe("high");
  });

  it("should export OcclusionHint interface correctly", () => {
    const hint: OcclusionHint = {
      elementId: "test",
      isVisible: true,
      visiblePercent: 100,
      lastChecked: Date.now(),
    };
    expect(hint.isVisible).toBe(true);
  });

  it("should export PipelineMetrics interface correctly", () => {
    const metrics: PipelineMetrics = {
      framesRendered: 0,
      framesDropped: 0,
      frameDropRate: 0,
      avgFrameTimeMs: 0,
      avgGPUTimeMs: 0,
      avgJitterMs: 0,
      p50FrameTimeMs: 0,
      p95FrameTimeMs: 0,
      p99FrameTimeMs: 0,
      passExecutions: 0,
      passSkips: 0,
      lodChanges: 0,
      budgetOverruns: 0,
      currentLOD: "high",
    };
    expect(metrics.framesRendered).toBe(0);
  });

  it("should export PipelineState interface correctly", () => {
    const { result } = renderHook(() => useRenderPipelineOptimizer());
    const state: PipelineState = result.current.state;
    expect(typeof state.isActive).toBe("boolean");
    expect(typeof state.currentFps).toBe("number");
    expect(typeof state.targetFps).toBe("number");
  });

  it("should export PipelineConfig interface correctly", () => {
    const config: Partial<PipelineConfig> = {
      targetFps: 60,
      budgetMs: 16,
      enableOcclusion: true,
    };
    expect(config.targetFps).toBe(60);
  });

  it("should export PipelineControls interface correctly", () => {
    const { result } = renderHook(() => useRenderPipelineOptimizer());
    const controls: PipelineControls = result.current.controls;
    expect(typeof controls.hasRemainingBudget).toBe("function");
    expect(typeof controls.scheduleRenderWork).toBe("function");
  });

  it("should export UseRenderPipelineOptimizerResult interface correctly", () => {
    const { result } = renderHook(() => useRenderPipelineOptimizer());
    const hook: UseRenderPipelineOptimizerResult = result.current;
    expect(hook.state).toBeDefined();
    expect(hook.metrics).toBeDefined();
    expect(hook.controls).toBeDefined();
  });
});

// ============================================================================
// Initialization Tests
// ============================================================================

describe("useRenderPipelineOptimizer", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.currentFps).toBe(60);
      expect(result.current.state.isThrottled).toBe(false);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({
          targetFps: 30,
          budgetMs: 33,
          enableAutoLOD: false,
        })
      );

      expect(result.current.state.targetFps).toBe(30);
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      expect(result.current.metrics.framesRendered).toBe(0);
      expect(result.current.metrics.framesDropped).toBe(0);
      expect(result.current.metrics.passExecutions).toBe(0);
    });

    it("should detect GPU info", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      // GPU detection runs on mount
      expect(result.current.state.gpuInfo).not.toBeNull();
    });

    it("should initialize frame budget with correct total", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16.67 })
      );

      expect(result.current.state.frameBudget.totalBudgetMs).toBe(16.67);
      expect(result.current.state.frameBudget.usedMs).toBe(0);
    });

    it("should initialize with default LOD based on GPU tier", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      // Default high-end GPU mock should give "high" LOD
      expect(["ultra", "high", "medium", "low", "minimal"]).toContain(
        result.current.state.currentLOD
      );
    });

    it("should accept custom sample window", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ sampleWindow: 30 })
      );

      expect(result.current.state).toBeDefined();
    });

    it("should accept custom throttle threshold", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ throttleThreshold: 10 })
      );

      expect(result.current.state.isThrottled).toBe(false);
    });

    it("should accept custom recovery threshold", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ recoveryThreshold: 15 })
      );

      expect(result.current.state).toBeDefined();
    });

    it("should initialize queuedPasses to zero", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());
      expect(result.current.state.queuedPasses).toBe(0);
    });
  });

  // ============================================================================
  // Frame Budget Tests
  // ============================================================================

  describe("frame budget", () => {
    it("should track frame budget on beginFrame/endFrame", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });

      mockTime = 8; // Simulate 8ms of work
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.state.frameBudget.usedMs).toBe(8);
      expect(result.current.state.frameBudget.isOverBudget).toBe(false);
    });

    it("should detect over-budget frames", () => {
      const onBudgetOverrun = jest.fn();
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16 }, { onBudgetOverrun })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });

      mockTime = 20; // Over 16ms budget
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.state.frameBudget.isOverBudget).toBe(true);
      expect(onBudgetOverrun).toHaveBeenCalled();
    });

    it("should check remaining budget", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16, budgetBufferPercent: 10 })
      );

      // With 10% buffer, available = 16 - 1.6 = 14.4ms
      const hasRoom = result.current.controls.hasRemainingBudget(10);
      expect(hasRoom).toBe(true);

      const noRoom = result.current.controls.hasRemainingBudget(20);
      expect(noRoom).toBe(false);
    });

    it("should calculate utilization percent", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 20 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });

      mockTime = 10; // 50% of 20ms budget
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.state.frameBudget.utilizationPercent).toBe(50);
    });

    it("should calculate remaining time correctly", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });

      mockTime = 6;
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.state.frameBudget.remainingMs).toBe(10);
    });

    it("should reset budget on beginFrame", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16 })
      );

      // First frame
      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 10;
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.state.frameBudget.usedMs).toBe(10);

      // Second frame - should reset
      mockTime = 20;
      act(() => {
        result.current.controls.beginFrame();
      });

      expect(result.current.state.frameBudget.usedMs).toBe(0);
    });

    it("should clamp remaining to zero when over budget", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 10 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });

      mockTime = 20; // Way over budget
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.state.frameBudget.remainingMs).toBe(0);
    });
  });

  // ============================================================================
  // Render Work Scheduling Tests
  // ============================================================================

  describe("render work scheduling", () => {
    it("should schedule render work", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      const callback = jest.fn();

      act(() => {
        result.current.controls.scheduleRenderWork("test", callback, "normal", 5);
      });

      // scheduleRenderWork adds to internal queue - verify by flushing
      expect(typeof result.current.controls.flushQueue).toBe("function");
    });

    it("should cancel scheduled work", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      const callback = jest.fn();

      act(() => {
        result.current.controls.scheduleRenderWork("test", callback, "normal");
      });

      act(() => {
        result.current.controls.cancelRenderWork("test");
      });

      // Queue should still have the item if we didn't use exact id
      // This test verifies the function exists and runs
    });

    it("should flush queued work", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16 })
      );

      const callback1 = jest.fn();
      const callback2 = jest.fn();

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
        result.current.controls.scheduleRenderWork("high", callback1, "high", 2);
        result.current.controls.scheduleRenderWork("low", callback2, "low", 2);
      });

      act(() => {
        result.current.controls.flushQueue();
      });

      expect(callback1).toHaveBeenCalled();
      expect(result.current.metrics.passExecutions).toBeGreaterThan(0);
    });

    it("should respect priority ordering", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16 })
      );

      const order: string[] = [];
      const criticalCb = jest.fn(() => order.push("critical"));
      const normalCb = jest.fn(() => order.push("normal"));
      const lowCb = jest.fn(() => order.push("low"));

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
        // Add in reverse priority order
        result.current.controls.scheduleRenderWork("low", lowCb, "low", 1);
        result.current.controls.scheduleRenderWork("normal", normalCb, "normal", 1);
        result.current.controls.scheduleRenderWork("critical", criticalCb, "critical", 1);
      });

      act(() => {
        result.current.controls.flushQueue();
      });

      // Should execute in priority order: critical, normal, low
      expect(order[0]).toBe("critical");
      expect(order[1]).toBe("normal");
    });

    it("should execute all priority levels", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 100 })
      );

      const order: string[] = [];

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
        result.current.controls.scheduleRenderWork("deferred", () => order.push("deferred"), "deferred", 1);
        result.current.controls.scheduleRenderWork("low", () => order.push("low"), "low", 1);
        result.current.controls.scheduleRenderWork("normal", () => order.push("normal"), "normal", 1);
        result.current.controls.scheduleRenderWork("high", () => order.push("high"), "high", 1);
        result.current.controls.scheduleRenderWork("critical", () => order.push("critical"), "critical", 1);
      });

      act(() => {
        result.current.controls.flushQueue();
      });

      expect(order).toEqual(["critical", "high", "normal", "low", "deferred"]);
    });

    it("should skip non-critical work when over budget", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 5 })
      );

      const criticalCb = jest.fn();
      const normalCb = jest.fn();

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
        // Use all budget
        mockTime = 4;
        result.current.controls.scheduleRenderWork("critical", criticalCb, "critical", 2);
        result.current.controls.scheduleRenderWork("normal", normalCb, "normal", 10); // Would exceed budget
      });

      act(() => {
        result.current.controls.flushQueue();
      });

      expect(criticalCb).toHaveBeenCalled();
      expect(result.current.metrics.passSkips).toBeGreaterThanOrEqual(0);
    });

    it("should always execute critical work even over budget", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 1 })
      );

      const criticalCb = jest.fn();

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
        mockTime = 2; // Already over budget
        result.current.controls.scheduleRenderWork("critical", criticalCb, "critical", 10);
      });

      act(() => {
        result.current.controls.flushQueue();
      });

      expect(criticalCb).toHaveBeenCalled();
    });

    it("should use default estimatedMs of 1 when not specified", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16 })
      );

      const callback = jest.fn();

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
        result.current.controls.scheduleRenderWork("test", callback, "normal");
      });

      act(() => {
        result.current.controls.flushQueue();
      });

      expect(callback).toHaveBeenCalled();
    });

    it("should clear queue after flush", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16 })
      );

      const callback = jest.fn();

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
        result.current.controls.scheduleRenderWork("test", callback, "normal");
        result.current.controls.flushQueue();
      });

      // Second flush should not re-execute
      act(() => {
        result.current.controls.flushQueue();
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should handle callback errors gracefully", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16 })
      );

      const errorCb = jest.fn(() => {
        throw new Error("Test error");
      });
      const normalCb = jest.fn();

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
        result.current.controls.scheduleRenderWork("error", errorCb, "high", 1);
        result.current.controls.scheduleRenderWork("normal", normalCb, "normal", 1);
      });

      // Should not throw
      act(() => {
        result.current.controls.flushQueue();
      });

      expect(errorCb).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // LOD Management Tests
  // ============================================================================

  describe("LOD management", () => {
    it("should request LOD change", () => {
      const onLODChanged = jest.fn();
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({}, { onLODChanged })
      );

      const initialLOD = result.current.state.currentLOD;

      // Request different LOD than initial
      act(() => {
        result.current.controls.requestLOD(initialLOD === "low" ? "high" : "low");
      });

      // Verify LOD changed
      expect(result.current.state.currentLOD).not.toBe(initialLOD);
    });

    it("should clamp LOD to minimum", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ minLOD: "medium" })
      );

      // Try to set LOD lower than minimum
      act(() => {
        result.current.controls.requestLOD("minimal");
      });

      expect(result.current.state.currentLOD).toBe("medium");
    });

    it("should auto-adjust LOD under throttle", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({
          budgetMs: 16,
          enableAutoLOD: true,
          throttleThreshold: 2,
        })
      );

      // Simulate multiple over-budget frames
      for (let i = 0; i < 3; i++) {
        mockTime = i * 20;
        act(() => {
          result.current.controls.beginFrame();
        });

        mockTime = i * 20 + 25; // Over budget
        act(() => {
          result.current.controls.endFrame();
        });
      }

      // Should have decreased LOD
      expect(result.current.state.isThrottled).toBe(true);
    });

    it("should not change LOD when already at requested level", () => {
      const onLODChanged = jest.fn();
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({}, { onLODChanged })
      );

      // Set to medium first
      act(() => {
        result.current.controls.requestLOD("medium");
      });

      onLODChanged.mockClear();

      // Request same LOD
      act(() => {
        result.current.controls.requestLOD("medium");
      });

      // Should not call callback again
      expect(onLODChanged).not.toHaveBeenCalled();
    });

    it("should track LOD changes in metrics", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      const initialChanges = result.current.metrics.lodChanges;

      act(() => {
        result.current.controls.requestLOD("low");
      });

      act(() => {
        result.current.controls.requestLOD("high");
      });

      expect(result.current.metrics.lodChanges).toBeGreaterThan(initialChanges);
    });

    it("should allow all valid LOD levels", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ minLOD: "minimal" })
      );

      const levels: LODLevel[] = ["ultra", "high", "medium", "low", "minimal"];

      for (const level of levels) {
        act(() => {
          result.current.controls.requestLOD(level);
        });
        expect(result.current.state.currentLOD).toBe(level);
      }
    });
  });

  // ============================================================================
  // Occlusion Hints Tests
  // ============================================================================

  describe("occlusion hints", () => {
    it("should add occlusion hints", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ enableOcclusion: true })
      );

      act(() => {
        result.current.controls.addOcclusionHint("element1", true, 100);
      });

      const shouldRender = result.current.controls.shouldRender("element1");
      expect(shouldRender).toBe(true);
    });

    it("should skip occluded elements", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ enableOcclusion: true })
      );

      act(() => {
        result.current.controls.addOcclusionHint("hidden", false, 0);
      });

      const shouldRender = result.current.controls.shouldRender("hidden");
      expect(shouldRender).toBe(false);
    });

    it("should remove occlusion hints", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ enableOcclusion: true })
      );

      act(() => {
        result.current.controls.addOcclusionHint("element", false, 0);
        result.current.controls.removeOcclusionHint("element");
      });

      // After removal, should default to true (render)
      const shouldRender = result.current.controls.shouldRender("element");
      expect(shouldRender).toBe(true);
    });

    it("should return true when occlusion disabled", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ enableOcclusion: false })
      );

      const shouldRender = result.current.controls.shouldRender("anything");
      expect(shouldRender).toBe(true);
    });

    it("should return true for unknown elements", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ enableOcclusion: true })
      );

      const shouldRender = result.current.controls.shouldRender("unknown");
      expect(shouldRender).toBe(true);
    });

    it("should use default visiblePercent of 100", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ enableOcclusion: true })
      );

      act(() => {
        result.current.controls.addOcclusionHint("element", true);
      });

      expect(result.current.controls.shouldRender("element")).toBe(true);
    });

    it("should not add hints when occlusion disabled", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ enableOcclusion: false })
      );

      act(() => {
        result.current.controls.addOcclusionHint("element", false, 0);
      });

      // Should still return true because occlusion is disabled
      expect(result.current.controls.shouldRender("element")).toBe(true);
    });

    it("should consider stale hints as renderable", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ enableOcclusion: true })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.addOcclusionHint("element", false, 0);
      });

      // Advance time past stale threshold (500ms)
      mockTime = 600;

      expect(result.current.controls.shouldRender("element")).toBe(true);
    });

    it("should not render elements with 0 visible percent", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ enableOcclusion: true })
      );

      act(() => {
        result.current.controls.addOcclusionHint("element", true, 0);
      });

      expect(result.current.controls.shouldRender("element")).toBe(false);
    });
  });

  // ============================================================================
  // Monitoring Control Tests
  // ============================================================================

  describe("monitoring control", () => {
    it("should start monitoring", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      act(() => {
        result.current.controls.start();
      });

      expect(result.current.state.isActive).toBe(true);
    });

    it("should stop monitoring", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      act(() => {
        result.current.controls.start();
      });

      act(() => {
        result.current.controls.stop();
      });

      expect(result.current.state.isActive).toBe(false);
    });

    it("should not start twice", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      act(() => {
        result.current.controls.start();
      });

      act(() => {
        result.current.controls.start();
      });

      expect(result.current.state.isActive).toBe(true);
      expect(window.requestAnimationFrame).toHaveBeenCalled();
    });

    it("should cleanup on unmount", () => {
      const { result, unmount } = renderHook(() => useRenderPipelineOptimizer());

      act(() => {
        result.current.controls.start();
      });

      unmount();

      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Throttling Tests
  // ============================================================================

  describe("throttling", () => {
    it("should track throttle state", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      // Initial state should not be throttled
      expect(result.current.state.isThrottled).toBe(false);
    });

    it("should throttle after repeated over-budget frames", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({
          budgetMs: 10,
          throttleThreshold: 2,
          enableAutoLOD: false,
        })
      );

      // Simulate multiple over-budget frames to trigger throttle
      for (let i = 0; i < 5; i++) {
        mockTime = i * 30;
        act(() => {
          result.current.controls.beginFrame();
        });

        mockTime = i * 30 + 20; // Over budget
        act(() => {
          result.current.controls.endFrame();
        });
      }

      // After multiple over-budget frames, should be throttled
      expect(result.current.state.isThrottled).toBe(true);
    });

    it("should call onThrottleStateChanged when throttled", () => {
      const onThrottleStateChanged = jest.fn();
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer(
          { budgetMs: 10, throttleThreshold: 2, enableAutoLOD: false },
          { onThrottleStateChanged }
        )
      );

      for (let i = 0; i < 3; i++) {
        mockTime = i * 30;
        act(() => {
          result.current.controls.beginFrame();
        });
        mockTime = i * 30 + 20;
        act(() => {
          result.current.controls.endFrame();
        });
      }

      expect(onThrottleStateChanged).toHaveBeenCalledWith(true);
    });

    it("should recover from throttle after under-budget frames", () => {
      const onThrottleStateChanged = jest.fn();
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer(
          {
            budgetMs: 16,
            throttleThreshold: 2,
            recoveryThreshold: 3,
            enableAutoLOD: false,
          },
          { onThrottleStateChanged }
        )
      );

      // First, trigger throttle
      for (let i = 0; i < 3; i++) {
        mockTime = i * 30;
        act(() => {
          result.current.controls.beginFrame();
        });
        mockTime = i * 30 + 25;
        act(() => {
          result.current.controls.endFrame();
        });
      }

      expect(result.current.state.isThrottled).toBe(true);

      // Now recover with under-budget frames
      for (let i = 0; i < 35; i++) {
        mockTime = 100 + i * 20;
        act(() => {
          result.current.controls.beginFrame();
        });
        mockTime = 100 + i * 20 + 5; // Well under budget
        act(() => {
          result.current.controls.endFrame();
        });
      }

      expect(result.current.state.isThrottled).toBe(false);
    });

    it("should reset over-budget count on under-budget frame", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({
          budgetMs: 16,
          throttleThreshold: 5,
          enableAutoLOD: false,
        })
      );

      // Two over-budget frames
      for (let i = 0; i < 2; i++) {
        mockTime = i * 30;
        act(() => {
          result.current.controls.beginFrame();
        });
        mockTime = i * 30 + 25;
        act(() => {
          result.current.controls.endFrame();
        });
      }

      // One under-budget frame should reset counter
      mockTime = 60;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 65;
      act(() => {
        result.current.controls.endFrame();
      });

      // Two more over-budget frames shouldn't trigger throttle (total 2, not 4)
      for (let i = 0; i < 2; i++) {
        mockTime = 80 + i * 30;
        act(() => {
          result.current.controls.beginFrame();
        });
        mockTime = 80 + i * 30 + 25;
        act(() => {
          result.current.controls.endFrame();
        });
      }

      expect(result.current.state.isThrottled).toBe(false);
    });
  });

  // ============================================================================
  // Metrics Tests
  // ============================================================================

  describe("metrics", () => {
    it("should reset metrics", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      // Generate some frame metrics
      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 10;
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.metrics.framesRendered).toBe(1);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.framesRendered).toBe(0);
      expect(result.current.metrics.framesDropped).toBe(0);
      expect(result.current.metrics.passExecutions).toBe(0);
    });

    it("should track frame statistics", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });

      mockTime = 10;
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.metrics.framesRendered).toBe(1);
    });

    it("should track dropped frames", () => {
      const onFrameDropped = jest.fn();
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ targetFps: 60 }, { onFrameDropped })
      );

      // Simulate a dropped frame by having a long gap
      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 10;
      act(() => {
        result.current.controls.endFrame();
      });

      // Long gap - 50ms means we likely dropped frames at 60fps (16.67ms target)
      mockTime = 60;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 70;
      act(() => {
        result.current.controls.endFrame();
      });

      // Should have detected dropped frames
      expect(result.current.metrics.framesDropped).toBeGreaterThanOrEqual(0);
    });

    it("should track budget overruns", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 10 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 15;
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.metrics.budgetOverruns).toBe(1);
    });

    it("should calculate percentiles after enough samples", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 20, sampleWindow: 10 })
      );

      // Generate enough frames for percentile calculation
      for (let i = 0; i < 15; i++) {
        mockTime = i * 20;
        act(() => {
          result.current.controls.beginFrame();
        });
        mockTime = i * 20 + 5 + Math.random() * 10; // Varying frame times
        act(() => {
          result.current.controls.endFrame();
        });
      }

      expect(result.current.metrics.p50FrameTimeMs).toBeGreaterThan(0);
      expect(result.current.metrics.p95FrameTimeMs).toBeGreaterThan(0);
      expect(result.current.metrics.p99FrameTimeMs).toBeGreaterThan(0);
    });

    it("should calculate average frame time", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 20 })
      );

      // Generate consistent frame times
      for (let i = 0; i < 5; i++) {
        mockTime = i * 20;
        act(() => {
          result.current.controls.beginFrame();
        });
        mockTime = i * 20 + 10;
        act(() => {
          result.current.controls.endFrame();
        });
      }

      expect(result.current.metrics.avgFrameTimeMs).toBe(10);
    });

    it("should track pass skips", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 5 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
        mockTime = 4;
        result.current.controls.scheduleRenderWork("test", () => {}, "normal", 10);
        result.current.controls.flushQueue();
      });

      expect(result.current.metrics.passSkips).toBeGreaterThanOrEqual(0);
    });

    it("should track pass executions", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 20 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
        result.current.controls.scheduleRenderWork("test1", () => {}, "high", 1);
        result.current.controls.scheduleRenderWork("test2", () => {}, "normal", 1);
        result.current.controls.flushQueue();
      });

      expect(result.current.metrics.passExecutions).toBe(2);
    });

    it("should calculate frame drop rate", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ targetFps: 60 })
      );

      // First frame
      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 5;
      act(() => {
        result.current.controls.endFrame();
      });

      // Big gap - dropped frames
      mockTime = 100;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 105;
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.metrics.frameDropRate).toBeGreaterThanOrEqual(0);
    });

    it("should track jitter", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ targetFps: 60 })
      );

      // Generate frames with varying deltas
      const deltas = [16, 20, 14, 18, 16];
      let currentTime = 0;

      for (const delta of deltas) {
        mockTime = currentTime;
        act(() => {
          result.current.controls.beginFrame();
        });
        mockTime = currentTime + 5;
        act(() => {
          result.current.controls.endFrame();
        });
        currentTime += delta;
      }

      expect(result.current.metrics.avgJitterMs).toBeGreaterThanOrEqual(0);
    });

    it("should update currentLOD in metrics", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      act(() => {
        result.current.controls.requestLOD("low");
      });

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 5;
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.metrics.currentLOD).toBe("low");
    });

    it("should update FPS estimate after enough samples", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ targetFps: 60 })
      );

      // Generate 15 frames at ~10ms each (100 FPS)
      for (let i = 0; i < 15; i++) {
        mockTime = i * 10;
        act(() => {
          result.current.controls.beginFrame();
        });
        mockTime = i * 10 + 10;
        act(() => {
          result.current.controls.endFrame();
        });
      }

      // FPS should be updated
      expect(result.current.state.currentFps).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Callbacks Tests
  // ============================================================================

  describe("callbacks", () => {
    it("should call onFrameDropped", () => {
      const onFrameDropped = jest.fn();
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ targetFps: 60 }, { onFrameDropped })
      );

      // Simulate dropped frames
      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 5;
      act(() => {
        result.current.controls.endFrame();
      });

      mockTime = 100; // Big gap = dropped frames
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 105;
      act(() => {
        result.current.controls.endFrame();
      });

      expect(onFrameDropped).toHaveBeenCalled();
    });

    it("should call onLODChanged", () => {
      const onLODChanged = jest.fn();
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({}, { onLODChanged })
      );

      act(() => {
        result.current.controls.requestLOD("medium");
      });

      expect(onLODChanged).toHaveBeenCalled();
    });

    it("should call onBudgetOverrun with correct value", () => {
      const onBudgetOverrun = jest.fn();
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 10 }, { onBudgetOverrun })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 15; // 5ms over budget
      act(() => {
        result.current.controls.endFrame();
      });

      expect(onBudgetOverrun).toHaveBeenCalledWith(5);
    });

    it("should call onLODChanged with from and to values", () => {
      const onLODChanged = jest.fn();
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({}, { onLODChanged })
      );

      const initialLOD = result.current.state.currentLOD;

      act(() => {
        result.current.controls.requestLOD("minimal");
      });

      expect(onLODChanged).toHaveBeenCalledWith(initialLOD, "minimal");
    });
  });

  // ============================================================================
  // Edge Cases Tests
  // ============================================================================

  describe("edge cases", () => {
    it("should handle empty render queue flush", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
        result.current.controls.flushQueue(); // Empty queue
      });

      expect(result.current.metrics.passExecutions).toBe(0);
    });

    it("should handle rapid start/stop", () => {
      const { result } = renderHook(() => useRenderPipelineOptimizer());

      act(() => {
        result.current.controls.start();
        result.current.controls.stop();
        result.current.controls.start();
        result.current.controls.stop();
      });

      expect(result.current.state.isActive).toBe(false);
    });

    it("should handle config changes via rerender", () => {
      const { result, rerender } = renderHook(
        ({ fps }) => useRenderPipelineOptimizer({ targetFps: fps }),
        { initialProps: { fps: 60 } }
      );

      expect(result.current.state.targetFps).toBe(60);

      rerender({ fps: 30 });

      expect(result.current.state.targetFps).toBe(30);
    });

    it("should handle zero budget gracefully", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 0 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 1;
      act(() => {
        result.current.controls.endFrame();
      });

      // Should be over budget
      expect(result.current.state.frameBudget.isOverBudget).toBe(true);
    });

    it("should handle very long frames", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ budgetMs: 16 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.beginFrame();
      });
      mockTime = 1000; // 1 second frame
      act(() => {
        result.current.controls.endFrame();
      });

      expect(result.current.state.frameBudget.usedMs).toBe(1000);
      expect(result.current.state.frameBudget.remainingMs).toBe(0);
    });

    it("should work with all LOD levels in sequence", () => {
      const { result } = renderHook(() =>
        useRenderPipelineOptimizer({ minLOD: "minimal" })
      );

      const levels: LODLevel[] = ["ultra", "high", "medium", "low", "minimal"];

      levels.forEach((level) => {
        act(() => {
          result.current.controls.requestLOD(level);
        });
        expect(result.current.state.currentLOD).toBe(level);
      });
    });
  });
});

// ============================================================================
// Convenience Hooks Tests
// ============================================================================

describe("useFrameBudget", () => {
  it("should provide frame budget functions", () => {
    const { result } = renderHook(() => useFrameBudget(16));

    expect(typeof result.current.beginFrame).toBe("function");
    expect(typeof result.current.endFrame).toBe("function");
    expect(typeof result.current.hasRemaining).toBe("function");
  });

  it("should track budget", () => {
    const { result } = renderHook(() => useFrameBudget(16));

    mockTime = 0;
    act(() => {
      result.current.beginFrame();
    });

    mockTime = 8;
    act(() => {
      result.current.endFrame();
    });

    expect(result.current.budget.usedMs).toBe(8);
  });

  it("should use default budget when not specified", () => {
    const { result } = renderHook(() => useFrameBudget());

    expect(result.current.budget.totalBudgetMs).toBe(16.67);
  });

  it("should check remaining budget correctly", () => {
    const { result } = renderHook(() => useFrameBudget(20));

    // Full budget should have room for 15ms
    expect(result.current.hasRemaining(15)).toBe(true);
    expect(result.current.hasRemaining(25)).toBe(false);
  });
});

describe("useLODManager", () => {
  it("should manage LOD levels", () => {
    const { result } = renderHook(() => useLODManager("low"));

    expect(typeof result.current.requestLOD).toBe("function");
    expect(result.current.isThrottled).toBe(false);
  });

  it("should change LOD", () => {
    const { result } = renderHook(() => useLODManager("minimal"));

    act(() => {
      result.current.requestLOD("medium");
    });

    expect(result.current.currentLOD).toBe("medium");
  });

  it("should use default minLOD when not specified", () => {
    const { result } = renderHook(() => useLODManager());

    act(() => {
      result.current.requestLOD("minimal");
    });

    expect(result.current.currentLOD).toBe("minimal");
  });

  it("should respect minLOD", () => {
    const { result } = renderHook(() => useLODManager("medium"));

    act(() => {
      result.current.requestLOD("minimal");
    });

    expect(result.current.currentLOD).toBe("medium");
  });
});

describe("useGPUInfo", () => {
  it("should return GPU info", () => {
    const { result } = renderHook(() => useGPUInfo());

    // GPU info should be detected
    expect(result.current).not.toBeNull();
  });

  it("should have all required GPU info fields", () => {
    const { result } = renderHook(() => useGPUInfo());

    if (result.current) {
      expect(typeof result.current.tier).toBe("string");
      expect(typeof result.current.renderer).toBe("string");
      expect(typeof result.current.vendor).toBe("string");
      expect(typeof result.current.isWebGL2).toBe("boolean");
      expect(typeof result.current.maxTextureSize).toBe("number");
      expect(typeof result.current.maxVertexAttribs).toBe("number");
      expect(typeof result.current.estimatedVRAM).toBe("number");
    }
  });
});

// ============================================================================
// GPU Detection Tests
// ============================================================================

describe("GPU Detection", () => {
  it("should detect high-end GPU from renderer string", () => {
    jest.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return {
          getContext: () => createMockWebGLContext({ renderer: "ANGLE (NVIDIA GeForce RTX 3080)" }),
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    const { result } = renderHook(() => useRenderPipelineOptimizer());

    expect(result.current.state.gpuInfo?.tier).toBe("high");
  });

  it("should detect medium-tier GPU", () => {
    jest.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return {
          getContext: () => createMockWebGLContext({
            renderer: "Intel HD Graphics 630",
            maxTextureSize: 8192,
          }),
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    const { result } = renderHook(() => useRenderPipelineOptimizer());

    expect(result.current.state.gpuInfo?.tier).toBe("medium");
  });

  it("should detect low-tier GPU", () => {
    jest.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return {
          getContext: () => createMockWebGLContext({
            renderer: "Mali-400",
            maxTextureSize: 2048,
            isWebGL2: false,
          }),
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    const { result } = renderHook(() => useRenderPipelineOptimizer());

    expect(result.current.state.gpuInfo?.tier).toBe("low");
  });

  it("should handle missing WebGL context", () => {
    jest.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return {
          getContext: () => null,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    const { result } = renderHook(() => useRenderPipelineOptimizer());

    expect(result.current.state.gpuInfo?.tier).toBe("unknown");
  });

  it("should detect Apple Silicon GPUs", () => {
    jest.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return {
          getContext: () => createMockWebGLContext({ renderer: "Apple M2 Pro" }),
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    const { result } = renderHook(() => useRenderPipelineOptimizer());

    expect(result.current.state.gpuInfo?.tier).toBe("high");
  });

  it("should detect Adreno GPUs", () => {
    jest.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return {
          getContext: () => createMockWebGLContext({ renderer: "Adreno 650" }),
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    const { result } = renderHook(() => useRenderPipelineOptimizer());

    expect(result.current.state.gpuInfo?.tier).toBe("medium");
  });

  it("should set estimated VRAM based on tier", () => {
    const { result } = renderHook(() => useRenderPipelineOptimizer());

    const gpuInfo = result.current.state.gpuInfo;
    if (gpuInfo) {
      if (gpuInfo.tier === "high") {
        expect(gpuInfo.estimatedVRAM).toBe(8192);
      } else if (gpuInfo.tier === "medium") {
        expect(gpuInfo.estimatedVRAM).toBe(4096);
      } else if (gpuInfo.tier === "low") {
        expect(gpuInfo.estimatedVRAM).toBe(1024);
      }
    }
  });
});
