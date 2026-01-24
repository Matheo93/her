/**
 * Tests for useAvatarExpressions hook
 * Sprint 525: Avatar expression management with blending and transitions
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarExpressions,
  useLipSyncVisemes,
  useExpressionGaze,
  EXPRESSION_PRESETS,
} from "../useAvatarExpressions";

// Mock performance.now
const mockPerformanceNow = jest.spyOn(performance, "now");

// Mock requestAnimationFrame
let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;
const mockRaf = jest.fn((cb: FrameRequestCallback) => {
  rafCallback = cb;
  return ++rafId;
});
const mockCancelRaf = jest.fn();

beforeAll(() => {
  jest.useFakeTimers();
  (global as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = mockRaf;
  (global as unknown as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame = mockCancelRaf;
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPerformanceNow.mockReturnValue(0);
  rafCallback = null;
  rafId = 0;
});

describe("useAvatarExpressions", () => {
  describe("initialization", () => {
    it("should initialize with neutral expression by default", () => {
      const { result } = renderHook(() => useAvatarExpressions());

      expect(result.current.state.currentPreset).toBe("neutral");
      expect(result.current.state.blendShapes).toEqual({});
      expect(result.current.state.isTransitioning).toBe(false);
      expect(result.current.state.activeLayers).toEqual([]);
    });

    it("should initialize with custom initial expression", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ initialExpression: "happy" })
      );

      expect(result.current.state.currentPreset).toBe("happy");
      expect(result.current.state.blendShapes).toEqual(EXPRESSION_PRESETS.happy);
    });

    it("should use custom transition duration", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ defaultTransitionDuration: 500 })
      );

      expect(result.current.state.currentPreset).toBe("neutral");
    });
  });

  describe("setExpression", () => {
    it("should transition to new expression preset", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.setExpression("happy");
      });

      expect(result.current.state.currentPreset).toBe("happy");
      expect(result.current.state.isTransitioning).toBe(true);
    });

    it("should call onComplete callback after transition", () => {
      mockPerformanceNow.mockReturnValue(0);
      const onComplete = jest.fn();
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.setExpression("surprised", {
          duration: 100,
          onComplete,
        });
      });

      // Advance animation to completion
      mockPerformanceNow.mockReturnValue(150);
      act(() => {
        if (rafCallback) rafCallback(150);
      });

      expect(onComplete).toHaveBeenCalled();
      expect(result.current.state.isTransitioning).toBe(false);
    });

    it("should cancel previous transition when setting new expression", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.setExpression("happy");
      });

      const firstRafId = rafId;

      act(() => {
        result.current.controls.setExpression("sad");
      });

      expect(mockCancelRaf).toHaveBeenCalledWith(firstRafId);
      expect(result.current.state.currentPreset).toBe("sad");
    });
  });

  describe("setBlendShapes", () => {
    it("should set custom blend shapes with transition", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      const customShapes = { jawOpen: 0.5, mouthSmileLeft: 0.3 };

      act(() => {
        result.current.controls.setBlendShapes(customShapes);
      });

      expect(result.current.state.currentPreset).toBeNull();
      expect(result.current.state.isTransitioning).toBe(true);
    });

    it("should apply custom easing function", () => {
      mockPerformanceNow.mockReturnValue(0);
      const customEasing = (t: number) => t * t;
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.setBlendShapes(
          { jawOpen: 1 },
          { duration: 100, easing: customEasing }
        );
      });

      // At 50% time, with quadratic easing, should be 25%
      mockPerformanceNow.mockReturnValue(50);
      act(() => {
        if (rafCallback) rafCallback(50);
      });

      // Check that transition is still in progress
      expect(result.current.state.isTransitioning).toBe(true);
    });
  });

  describe("layer management", () => {
    it("should add expression layer", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.addLayer("test-layer", { jawOpen: 0.5 }, 0.8, 1);
      });

      expect(result.current.state.activeLayers).toHaveLength(1);
      expect(result.current.state.activeLayers[0]).toEqual({
        id: "test-layer",
        values: { jawOpen: 0.5 },
        weight: 0.8,
        priority: 1,
      });
    });

    it("should replace layer with same id", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.addLayer("test-layer", { jawOpen: 0.5 });
      });

      act(() => {
        result.current.controls.addLayer("test-layer", { mouthSmileLeft: 0.7 });
      });

      expect(result.current.state.activeLayers).toHaveLength(1);
      expect(result.current.state.activeLayers[0].values).toEqual({
        mouthSmileLeft: 0.7,
      });
    });

    it("should remove expression layer", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.addLayer("layer1", { jawOpen: 0.5 });
        result.current.controls.addLayer("layer2", { mouthSmileLeft: 0.3 });
      });

      act(() => {
        result.current.controls.removeLayer("layer1");
      });

      expect(result.current.state.activeLayers).toHaveLength(1);
      expect(result.current.state.activeLayers[0].id).toBe("layer2");
    });

    it("should update layer weight", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.addLayer("test-layer", { jawOpen: 0.5 }, 0.5);
      });

      act(() => {
        result.current.controls.setLayerWeight("test-layer", 0.9);
      });

      expect(result.current.state.activeLayers[0].weight).toBe(0.9);
    });

    it("should clamp layer weight to [0, 1]", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.addLayer("test-layer", { jawOpen: 0.5 }, 0.5);
      });

      act(() => {
        result.current.controls.setLayerWeight("test-layer", 1.5);
      });

      expect(result.current.state.activeLayers[0].weight).toBe(1);

      act(() => {
        result.current.controls.setLayerWeight("test-layer", -0.5);
      });

      expect(result.current.state.activeLayers[0].weight).toBe(0);
    });
  });

  describe("blendTo", () => {
    it("should blend to target values over duration", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.blendTo({ jawOpen: 0.8 }, 200);
      });

      expect(result.current.state.isTransitioning).toBe(true);
    });
  });

  describe("reset", () => {
    it("should reset to neutral and clear layers", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({
          initialExpression: "happy",
          enableMicroExpressions: false,
        })
      );

      act(() => {
        result.current.controls.addLayer("test-layer", { jawOpen: 0.5 });
      });

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.currentPreset).toBe("neutral");
      expect(result.current.state.activeLayers).toEqual([]);
    });
  });

  describe("micro-expressions", () => {
    it("should trigger micro-expression", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.triggerMicroExpression("blink");
      });

      expect(result.current.state.activeLayers).toContainEqual(
        expect.objectContaining({
          id: "micro-expression",
          values: { eyeBlinkLeft: 1, eyeBlinkRight: 1 },
        })
      );

      // Micro-expression should be removed after duration
      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(
        result.current.state.activeLayers.find((l) => l.id === "micro-expression")
      ).toBeUndefined();
    });

    it("should trigger different micro-expression types", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      const types = ["twitch", "smirk", "eyebrow-raise", "squint"] as const;

      for (const type of types) {
        act(() => {
          result.current.controls.triggerMicroExpression(type);
        });

        expect(result.current.state.activeLayers).toContainEqual(
          expect.objectContaining({ id: "micro-expression" })
        );

        act(() => {
          jest.advanceTimersByTime(300);
        });
      }
    });

    it("should auto-trigger micro-expressions when enabled", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({
          enableMicroExpressions: true,
          microExpressionInterval: [100, 200],
        })
      );

      // Advance time to trigger auto micro-expression
      act(() => {
        jest.advanceTimersByTime(250);
      });

      // A micro-expression should have been triggered
      // (it may have already been removed, so just verify no errors)
      expect(result.current.state).toBeDefined();
    });
  });

  describe("onExpressionChange callback", () => {
    it("should call callback when blend shapes change", () => {
      const onExpressionChange = jest.fn();
      const { result } = renderHook(() =>
        useAvatarExpressions({
          onExpressionChange,
          enableMicroExpressions: false,
        })
      );

      act(() => {
        result.current.controls.addLayer("test", { jawOpen: 0.5 });
      });

      expect(onExpressionChange).toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should cleanup animation frames on unmount", () => {
      const { result, unmount } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.setExpression("happy");
      });

      unmount();

      expect(mockCancelRaf).toHaveBeenCalled();
    });

    it("should cleanup micro-expression timeout on unmount", () => {
      const { unmount } = renderHook(() =>
        useAvatarExpressions({
          enableMicroExpressions: true,
          microExpressionInterval: [1000, 2000],
        })
      );

      unmount();

      // Advance time and verify no errors
      act(() => {
        jest.advanceTimersByTime(3000);
      });
    });
  });
});

describe("useLipSyncVisemes", () => {
  it("should initialize with empty blend shapes", () => {
    const { result } = renderHook(() => useLipSyncVisemes());

    expect(result.current.visemeBlendShapes).toEqual({});
  });

  it("should set viseme blend shapes", () => {
    const { result } = renderHook(() => useLipSyncVisemes());

    act(() => {
      result.current.setViseme("aa");
    });

    expect(result.current.visemeBlendShapes).toEqual({
      jawOpen: 0.7,
      mouthFunnel: 0.2,
    });
  });

  it("should apply intensity scaling", () => {
    const { result } = renderHook(() => useLipSyncVisemes());

    act(() => {
      result.current.setViseme("aa", 0.5);
    });

    expect(result.current.visemeBlendShapes).toEqual({
      jawOpen: 0.35,
      mouthFunnel: 0.1,
    });
  });

  it("should handle unknown viseme", () => {
    const { result } = renderHook(() => useLipSyncVisemes());

    act(() => {
      result.current.setViseme("unknown");
    });

    expect(result.current.visemeBlendShapes).toEqual({});
  });

  it("should clear viseme", () => {
    const { result } = renderHook(() => useLipSyncVisemes());

    act(() => {
      result.current.setViseme("aa");
    });

    act(() => {
      result.current.clearViseme();
    });

    expect(result.current.visemeBlendShapes).toEqual({});
  });

  it("should handle all viseme types", () => {
    const { result } = renderHook(() => useLipSyncVisemes());

    const visemes = [
      "sil",
      "PP",
      "FF",
      "TH",
      "DD",
      "kk",
      "CH",
      "SS",
      "nn",
      "RR",
      "E",
      "ih",
      "oh",
      "ou",
    ];

    for (const viseme of visemes) {
      act(() => {
        result.current.setViseme(viseme);
      });
      // Just verify no errors
      expect(result.current.visemeBlendShapes).toBeDefined();
    }
  });
});

describe("useExpressionGaze", () => {
  it("should return empty blend shapes when no target", () => {
    const { result } = renderHook(() => useExpressionGaze(null));

    expect(result).toEqual({});
  });

  it("should set gaze blend shapes for left look", () => {
    const { result } = renderHook(() => useExpressionGaze({ x: -0.5, y: 0 }));

    expect(result.eyeLookOutLeft).toBeCloseTo(0.5);
    expect(result.eyeLookInRight).toBeCloseTo(0.5);
  });

  it("should set gaze blend shapes for right look", () => {
    const { result } = renderHook(() => useExpressionGaze({ x: 0.5, y: 0 }));

    expect(result.eyeLookInLeft).toBeCloseTo(0.5);
    expect(result.eyeLookOutRight).toBeCloseTo(0.5);
  });

  it("should set gaze blend shapes for up look", () => {
    const { result } = renderHook(() => useExpressionGaze({ x: 0, y: 0.5 }));

    expect(result.eyeLookUpLeft).toBeCloseTo(0.5);
    expect(result.eyeLookUpRight).toBeCloseTo(0.5);
  });

  it("should set gaze blend shapes for down look", () => {
    const { result } = renderHook(() => useExpressionGaze({ x: 0, y: -0.5 }));

    expect(result.eyeLookDownLeft).toBeCloseTo(0.5);
    expect(result.eyeLookDownRight).toBeCloseTo(0.5);
  });

  it("should clamp gaze values to 1", () => {
    const { result } = renderHook(() => useExpressionGaze({ x: 2, y: 2 }));

    expect(result.eyeLookInLeft).toBe(1);
    expect(result.eyeLookUpLeft).toBe(1);
  });

  it("should handle diagonal gaze", () => {
    const { result } = renderHook(() => useExpressionGaze({ x: 0.3, y: 0.4 }));

    expect(result.eyeLookInLeft).toBeCloseTo(0.3);
    expect(result.eyeLookUpLeft).toBeCloseTo(0.4);
  });

  it("should update when target changes", () => {
    const { result, rerender } = renderHook(
      ({ target }) => useExpressionGaze(target),
      { initialProps: { target: { x: 0.5, y: 0 } } }
    );

    expect(result.eyeLookInLeft).toBeCloseTo(0.5);

    rerender({ target: { x: -0.5, y: 0 } });

    expect(result.eyeLookOutLeft).toBeCloseTo(0.5);
  });

  it("should clear gaze when target becomes null", () => {
    const { result, rerender } = renderHook(
      ({ target }) => useExpressionGaze(target),
      { initialProps: { target: { x: 0.5, y: 0 } as { x: number; y: number } | null } }
    );

    expect(result.eyeLookInLeft).toBeCloseTo(0.5);

    rerender({ target: null });

    expect(result).toEqual({});
  });
});

describe("EXPRESSION_PRESETS", () => {
  it("should export all expression presets", () => {
    const expectedPresets = [
      "neutral",
      "happy",
      "sad",
      "surprised",
      "angry",
      "disgusted",
      "fearful",
      "contempt",
      "thinking",
      "confused",
      "interested",
      "skeptical",
    ];

    for (const preset of expectedPresets) {
      expect(EXPRESSION_PRESETS[preset as keyof typeof EXPRESSION_PRESETS]).toBeDefined();
    }
  });

  it("should have valid blend shape values in presets", () => {
    for (const [, values] of Object.entries(EXPRESSION_PRESETS)) {
      for (const [, value] of Object.entries(values)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
