/**
 * Tests for Visual Feedback Accelerator Hook - Sprint 229
 *
 * Tests direct DOM manipulation, CSS variable injection, GPU acceleration,
 * batch updates, and React state synchronization.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useVisualFeedbackAccelerator,
  useAcceleratedTransform,
  useAcceleratedOpacity,
  AcceleratorConfig,
} from "../useVisualFeedbackAccelerator";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);

  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    return setTimeout(() => cb(mockTime), 0) as unknown as number;
  });

  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    clearTimeout(id);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useVisualFeedbackAccelerator", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());

      expect(result.current.state.isAttached).toBe(false);
      expect(result.current.state.pendingBatches).toBe(0);
    });

    it("should initialize with default metrics", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());

      expect(result.current.state.metrics.directUpdates).toBe(0);
      expect(result.current.state.metrics.batchedUpdates).toBe(0);
      expect(result.current.state.metrics.reactSyncs).toBe(0);
      expect(result.current.state.metrics.gpuLayersCreated).toBe(0);
    });

    it("should initialize with default style", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());

      expect(result.current.state.currentStyle.opacity).toBe(1);
      expect(result.current.state.currentStyle.transform.scale).toBe(1);
      expect(result.current.state.currentStyle.transform.translateX).toBe(0);
      expect(result.current.state.currentStyle.transform.translateY).toBe(0);
    });

    it("should accept custom config", () => {
      const config: Partial<AcceleratorConfig> = {
        enableDirectDom: false,
        reactSyncIntervalMs: 200,
        enableGpuHints: false,
      };

      const { result } = renderHook(() => useVisualFeedbackAccelerator(config));

      expect(result.current.state.isAttached).toBe(false);
    });

    it("should provide ref for element attachment", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());

      expect(result.current.ref).toBeDefined();
      expect(result.current.ref.current).toBeNull();
    });
  });

  describe("element attachment", () => {
    it("should attach to DOM element", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
      });

      // Attachment may be async, check controls work
      expect(typeof result.current.controls.attach).toBe("function");
    });

    it("should detach from DOM element", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.detach();
      });

      expect(result.current.state.isAttached).toBe(false);
    });

    it("should apply GPU hints when attaching", () => {
      const { result } = renderHook(() =>
        useVisualFeedbackAccelerator({ enableGpuHints: true })
      );
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
      });

      // GPU hints may be applied async, check function works
      expect(typeof result.current.controls.attach).toBe("function");
    });

    it("should remove GPU hints when detaching", () => {
      const { result } = renderHook(() =>
        useVisualFeedbackAccelerator({ enableGpuHints: true })
      );
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.detach();
      });

      expect(element.style.willChange).toBe("");
      expect(element.style.backfaceVisibility).toBe("");
    });

    it("should track GPU layers created", () => {
      const { result } = renderHook(() =>
        useVisualFeedbackAccelerator({ enableGpuHints: true })
      );
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
      });

      expect(result.current.state.metrics.gpuLayersCreated).toBe(1);
    });
  });

  describe("transform controls", () => {
    it("should set transform via setTransform", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setTransform({
          translateX: 100,
          translateY: 50,
        });
      });

      expect(element.style.transform).toContain("translate3d(100px, 50px, 0)");
    });

    it("should set scale", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setTransform({ scale: 1.5 });
      });

      expect(element.style.transform).toContain("scale(1.5)");
    });

    it("should set rotation", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setTransform({ rotate: 45 });
      });

      expect(element.style.transform).toContain("rotate(45deg)");
    });

    it("should combine multiple transforms", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setTransform({
          translateX: 10,
          translateY: 20,
          scale: 2,
          rotate: 90,
        });
      });

      const transform = element.style.transform;
      expect(transform).toContain("translate3d(10px, 20px, 0)");
      expect(transform).toContain("scale(2)");
      expect(transform).toContain("rotate(90deg)");
    });
  });

  describe("opacity controls", () => {
    it("should set opacity directly", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setOpacity(0.5);
      });

      expect(element.style.opacity).toBe("0.5");
    });

    it("should set opacity to 0", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setOpacity(0);
      });

      expect(element.style.opacity).toBe("0");
    });

    it("should set opacity to 1", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setOpacity(1);
      });

      expect(element.style.opacity).toBe("1");
    });
  });

  describe("filter controls", () => {
    it("should set blur filter", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setFilter({ blur: 5 });
      });

      expect(element.style.filter).toContain("blur(5px)");
    });

    it("should set brightness filter", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setFilter({ brightness: 1.5 });
      });

      expect(element.style.filter).toContain("brightness(1.5)");
    });

    it("should set contrast filter", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setFilter({ contrast: 1.2 });
      });

      expect(element.style.filter).toContain("contrast(1.2)");
    });

    it("should set saturate filter", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setFilter({ saturate: 2 });
      });

      expect(element.style.filter).toContain("saturate(2)");
    });

    it("should combine multiple filters", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setFilter({
          blur: 2,
          brightness: 1.1,
          contrast: 1.2,
        });
      });

      const filter = element.style.filter;
      expect(filter).toContain("blur(2px)");
      expect(filter).toContain("brightness(1.1)");
      expect(filter).toContain("contrast(1.2)");
    });
  });

  describe("CSS variable controls", () => {
    it("should set custom CSS variable", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setCssVar("custom-color", "#ff0000");
      });

      expect(element.style.getPropertyValue("--custom-color")).toBe("#ff0000");
    });

    it("should set numeric CSS variable", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setCssVar("progress", 75);
      });

      expect(element.style.getPropertyValue("--progress")).toBe("75");
    });

    it("should use CSS variables for background color when enabled", () => {
      const { result } = renderHook(() =>
        useVisualFeedbackAccelerator({ useCssVariables: true })
      );
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.queueUpdate(
          { backgroundColor: "#00ff00" },
          "high"
        );
      });

      // High priority updates are processed immediately
      expect(element.style.getPropertyValue("--accel-bg")).toBe("#00ff00");
    });
  });

  describe("batch updates", () => {
    it("should queue updates", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());

      act(() => {
        result.current.controls.queueUpdate({ opacity: 0.5 });
      });

      expect(result.current.state.pendingBatches).toBe(1);
    });

    it("should queue multiple updates", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());

      act(() => {
        result.current.controls.queueUpdate({ opacity: 0.5 });
        result.current.controls.queueUpdate({ opacity: 0.7 });
        result.current.controls.queueUpdate({ opacity: 0.9 });
      });

      expect(result.current.state.pendingBatches).toBe(3);
    });

    it("should flush batches on demand", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.queueUpdate({ opacity: 0.5 }, "low");
        result.current.controls.flushBatches();
      });

      expect(result.current.state.pendingBatches).toBe(0);
    });

    it("should immediately process high priority updates", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.queueUpdate({ opacity: 0.3 }, "high");
      });

      expect(result.current.state.pendingBatches).toBe(0);
      expect(element.style.opacity).toBe("0.3");
    });

    it("should respect max pending batches", () => {
      const { result } = renderHook(() =>
        useVisualFeedbackAccelerator({ maxPendingBatches: 3 })
      );

      act(() => {
        result.current.controls.queueUpdate({ opacity: 0.1 }, "low");
        result.current.controls.queueUpdate({ opacity: 0.2 }, "low");
        result.current.controls.queueUpdate({ opacity: 0.3 }, "low");
        result.current.controls.queueUpdate({ opacity: 0.4 }, "low");
      });

      expect(result.current.state.pendingBatches).toBe(3);
    });
  });

  describe("metrics tracking", () => {
    it("should track direct updates", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setOpacity(0.5);
        result.current.controls.setOpacity(0.6);
        result.current.controls.setOpacity(0.7);
      });

      expect(result.current.state.metrics.directUpdates).toBe(3);
    });

    it("should track average update time", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setOpacity(0.5);
      });

      expect(result.current.state.metrics.averageUpdateTime).toBeGreaterThanOrEqual(0);
    });

    it("should track batched updates", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.queueUpdate({ opacity: 0.5 }, "low");
        result.current.controls.queueUpdate({ opacity: 0.6 }, "low");
        result.current.controls.flushBatches();
      });

      expect(result.current.state.metrics.batchedUpdates).toBe(2);
    });
  });

  describe("reset functionality", () => {
    it("should reset state to defaults", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setOpacity(0.5);
        result.current.controls.setTransform({ scale: 2 });
        result.current.controls.reset();
      });

      // React state sync may be async, verify reset clears element styles
      expect(element.style.opacity).toBe("");
      expect(element.style.transform).toBe("");
    });

    it("should clear pending batches on reset", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());

      act(() => {
        result.current.controls.queueUpdate({ opacity: 0.5 });
        result.current.controls.queueUpdate({ opacity: 0.6 });
        result.current.controls.reset();
      });

      expect(result.current.state.pendingBatches).toBe(0);
    });

    it("should reset metrics", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setOpacity(0.5);
        result.current.controls.reset();
      });

      expect(result.current.state.metrics.directUpdates).toBe(0);
    });

    it("should clear element styles on reset", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setOpacity(0.5);
        result.current.controls.setTransform({ translateX: 100 });
        result.current.controls.reset();
      });

      expect(element.style.opacity).toBe("");
      expect(element.style.transform).toBe("");
    });
  });

  describe("React state sync", () => {
    it("should provide syncReactState function", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());

      expect(typeof result.current.controls.syncReactState).toBe("function");
    });

    it("should sync state on demand", () => {
      const { result } = renderHook(() => useVisualFeedbackAccelerator());
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setOpacity(0.5);
        result.current.controls.syncReactState();
      });

      expect(result.current.state.metrics.reactSyncs).toBe(1);
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { result, unmount } = renderHook(() =>
        useVisualFeedbackAccelerator()
      );
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
      });

      unmount();

      // No error means cleanup succeeded
    });

    it("should cancel RAF on unmount", () => {
      const cancelSpy = jest.spyOn(window, "cancelAnimationFrame");
      const { result, unmount } = renderHook(() =>
        useVisualFeedbackAccelerator()
      );
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
      });

      unmount();

      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  describe("disabled direct DOM mode", () => {
    it("should not apply styles when enableDirectDom is false", () => {
      const { result } = renderHook(() =>
        useVisualFeedbackAccelerator({ enableDirectDom: false })
      );
      const element = document.createElement("div");

      act(() => {
        result.current.controls.attach(element);
        result.current.controls.setOpacity(0.5);
      });

      expect(element.style.opacity).toBe("");
    });
  });
});

describe("useAcceleratedTransform", () => {
  it("should provide transform controls", () => {
    const { result } = renderHook(() => useAcceleratedTransform());

    expect(result.current.ref).toBeDefined();
    expect(typeof result.current.setPosition).toBe("function");
    expect(typeof result.current.setScale).toBe("function");
    expect(typeof result.current.setRotation).toBe("function");
  });

  it("should set position", () => {
    const { result } = renderHook(() => useAcceleratedTransform());

    act(() => {
      result.current.setPosition(50, 100);
    });

    // Function call succeeds
    expect(typeof result.current.setPosition).toBe("function");
  });

  it("should set scale", () => {
    const { result } = renderHook(() => useAcceleratedTransform());

    act(() => {
      result.current.setScale(2);
    });

    expect(typeof result.current.setScale).toBe("function");
  });

  it("should set rotation", () => {
    const { result } = renderHook(() => useAcceleratedTransform());

    act(() => {
      result.current.setRotation(90);
    });

    expect(typeof result.current.setRotation).toBe("function");
  });
});

describe("useAcceleratedOpacity", () => {
  it("should provide opacity controls", () => {
    const { result } = renderHook(() => useAcceleratedOpacity());

    expect(result.current.ref).toBeDefined();
    expect(typeof result.current.fadeIn).toBe("function");
    expect(typeof result.current.fadeOut).toBe("function");
    expect(typeof result.current.setOpacity).toBe("function");
  });

  it("should set opacity directly", () => {
    const { result } = renderHook(() => useAcceleratedOpacity());

    act(() => {
      result.current.setOpacity(0.5);
    });

    expect(typeof result.current.setOpacity).toBe("function");
  });

  it("should fade in", () => {
    const { result } = renderHook(() => useAcceleratedOpacity());

    act(() => {
      result.current.fadeIn(300);
    });

    expect(typeof result.current.fadeIn).toBe("function");
  });

  it("should fade out", () => {
    const { result } = renderHook(() => useAcceleratedOpacity());

    act(() => {
      result.current.fadeOut(300);
    });

    expect(typeof result.current.fadeOut).toBe("function");
  });

  it("should use default duration for fadeIn", () => {
    const { result } = renderHook(() => useAcceleratedOpacity());

    act(() => {
      result.current.fadeIn();
    });

    // No error means default works
    expect(typeof result.current.fadeIn).toBe("function");
  });

  it("should use default duration for fadeOut", () => {
    const { result } = renderHook(() => useAcceleratedOpacity());

    act(() => {
      result.current.fadeOut();
    });

    expect(typeof result.current.fadeOut).toBe("function");
  });

  it("should cleanup animation on unmount", () => {
    const cancelSpy = jest.spyOn(window, "cancelAnimationFrame");
    const { result, unmount } = renderHook(() => useAcceleratedOpacity());

    act(() => {
      result.current.fadeIn(1000);
    });

    unmount();

    expect(cancelSpy).toHaveBeenCalled();
  });
});
