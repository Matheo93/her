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
  VISEME_MAP,
} from "../useAvatarExpressions";

// Mock requestAnimationFrame
let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;

beforeAll(() => {
  jest.useFakeTimers();

  // Mock RAF
  jest.spyOn(global, "requestAnimationFrame").mockImplementation((cb) => {
    rafCallback = cb;
    return ++rafId;
  });
  jest.spyOn(global, "cancelAnimationFrame").mockImplementation(() => {});

  // Mock performance.now
  jest.spyOn(performance, "now").mockReturnValue(0);
});

afterAll(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

beforeEach(() => {
  jest.clearAllTimers();
  rafCallback = null;
  rafId = 0;
  (performance.now as jest.Mock).mockReturnValue(0);
});

describe("useAvatarExpressions", () => {
  describe("initialization", () => {
    it("should initialize with neutral expression by default", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      expect(result.current.state.currentPreset).toBe("neutral");
      expect(result.current.state.blendShapes).toEqual({});
      expect(result.current.state.isTransitioning).toBe(false);
      expect(result.current.state.activeLayers).toEqual([]);
    });

    it("should initialize with custom initial expression", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({
          initialExpression: "happy",
          enableMicroExpressions: false,
        })
      );

      expect(result.current.state.currentPreset).toBe("happy");
      expect(result.current.state.blendShapes).toEqual(EXPRESSION_PRESETS.happy);
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
      (performance.now as jest.Mock).mockReturnValue(150);
      act(() => {
        if (rafCallback) rafCallback(150);
      });

      expect(onComplete).toHaveBeenCalled();
      expect(result.current.state.isTransitioning).toBe(false);
    });

    it("should use easeIn easing", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      const easeIn = (t: number) => t * t;

      act(() => {
        result.current.controls.setExpression("happy", {
          duration: 100,
          easing: easeIn,
        });
      });

      expect(result.current.state.isTransitioning).toBe(true);
    });

    it("should use easeInOut easing", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      const easeInOut = (t: number) =>
        t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      act(() => {
        result.current.controls.setExpression("sad", {
          duration: 100,
          easing: easeInOut,
        });
      });

      // Advance to mid-animation (t = 0.5)
      (performance.now as jest.Mock).mockReturnValue(50);
      act(() => {
        if (rafCallback) rafCallback(50);
      });

      expect(result.current.state.isTransitioning).toBe(true);
    });

    it("should use easeOutBack easing", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      const c1 = 1.70158;
      const c3 = c1 + 1;
      const easeOutBack = (t: number) =>
        1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);

      act(() => {
        result.current.controls.setExpression("thinking", {
          duration: 100,
          easing: easeOutBack,
        });
      });

      expect(result.current.state.isTransitioning).toBe(true);
    });

    it("should cancel ongoing transition when starting new one", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.setExpression("happy", { duration: 200 });
      });

      act(() => {
        result.current.controls.setExpression("sad", { duration: 100 });
      });

      expect(cancelAnimationFrame).toHaveBeenCalled();
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

    it("should trigger twitch micro-expression", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.triggerMicroExpression("twitch");
      });

      expect(result.current.state.activeLayers).toContainEqual(
        expect.objectContaining({ id: "micro-expression" })
      );
    });

    it("should trigger smirk micro-expression", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.triggerMicroExpression("smirk");
      });

      expect(result.current.state.activeLayers).toContainEqual(
        expect.objectContaining({ id: "micro-expression" })
      );
    });

    it("should trigger eyebrow-raise micro-expression", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.triggerMicroExpression("eyebrow-raise");
      });

      expect(result.current.state.activeLayers).toContainEqual(
        expect.objectContaining({ id: "micro-expression" })
      );
    });

    it("should trigger squint micro-expression", () => {
      const { result } = renderHook(() =>
        useAvatarExpressions({ enableMicroExpressions: false })
      );

      act(() => {
        result.current.controls.triggerMicroExpression("squint");
      });

      expect(result.current.state.activeLayers).toContainEqual(
        expect.objectContaining({ id: "micro-expression" })
      );
    });

    it("should auto-trigger micro-expressions when enabled", () => {
      jest.spyOn(global.Math, "random").mockReturnValue(0.5);

      const { result, unmount } = renderHook(() =>
        useAvatarExpressions({
          enableMicroExpressions: true,
          microExpressionInterval: [100, 200],
        })
      );

      // Advance past the micro-expression interval
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // A micro-expression should have been triggered
      expect(result.current.state.activeLayers).toContainEqual(
        expect.objectContaining({ id: "micro-expression" })
      );

      unmount();

      // Restore Math.random
      jest.spyOn(global.Math, "random").mockRestore();
    });

    it("should cleanup micro-expression timeout on unmount", () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      const { unmount } = renderHook(() =>
        useAvatarExpressions({
          enableMicroExpressions: true,
          microExpressionInterval: [1000, 2000],
        })
      );

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
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

      expect(cancelAnimationFrame).toHaveBeenCalled();
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

  it("should handle PP viseme", () => {
    const { result } = renderHook(() => useLipSyncVisemes());

    act(() => {
      result.current.setViseme("PP");
    });

    expect(result.current.visemeBlendShapes.mouthClose).toBe(0.8);
  });

  it("should handle FF viseme", () => {
    const { result } = renderHook(() => useLipSyncVisemes());

    act(() => {
      result.current.setViseme("FF");
    });

    expect(result.current.visemeBlendShapes.mouthFunnel).toBe(0.4);
  });

  it("should handle TH viseme", () => {
    const { result } = renderHook(() => useLipSyncVisemes());

    act(() => {
      result.current.setViseme("TH");
    });

    expect(result.current.visemeBlendShapes.tongueOut).toBe(0.3);
  });

  it("should handle sil viseme", () => {
    const { result } = renderHook(() => useLipSyncVisemes());

    act(() => {
      result.current.setViseme("sil");
    });

    expect(result.current.visemeBlendShapes).toEqual({});
  });
});

describe("useExpressionGaze", () => {
  it("should return empty blend shapes when no target", () => {
    const { result } = renderHook(
      ({ target }) => useExpressionGaze(target),
      { initialProps: { target: null as { x: number; y: number } | null } }
    );

    expect(result.current).toEqual({});
  });

  it("should set gaze blend shapes for left look", () => {
    const { result } = renderHook(
      ({ target }) => useExpressionGaze(target),
      { initialProps: { target: { x: -0.5, y: 0 } } }
    );

    expect(result.current.eyeLookOutLeft).toBeCloseTo(0.5);
    expect(result.current.eyeLookInRight).toBeCloseTo(0.5);
  });

  it("should set gaze blend shapes for right look", () => {
    const { result } = renderHook(
      ({ target }) => useExpressionGaze(target),
      { initialProps: { target: { x: 0.5, y: 0 } } }
    );

    expect(result.current.eyeLookInLeft).toBeCloseTo(0.5);
    expect(result.current.eyeLookOutRight).toBeCloseTo(0.5);
  });

  it("should set gaze blend shapes for up look", () => {
    const { result } = renderHook(
      ({ target }) => useExpressionGaze(target),
      { initialProps: { target: { x: 0, y: 0.5 } } }
    );

    expect(result.current.eyeLookUpLeft).toBeCloseTo(0.5);
    expect(result.current.eyeLookUpRight).toBeCloseTo(0.5);
  });

  it("should set gaze blend shapes for down look", () => {
    const { result } = renderHook(
      ({ target }) => useExpressionGaze(target),
      { initialProps: { target: { x: 0, y: -0.5 } } }
    );

    expect(result.current.eyeLookDownLeft).toBeCloseTo(0.5);
    expect(result.current.eyeLookDownRight).toBeCloseTo(0.5);
  });

  it("should clamp gaze values to 1", () => {
    const { result } = renderHook(
      ({ target }) => useExpressionGaze(target),
      { initialProps: { target: { x: 2, y: 2 } } }
    );

    expect(result.current.eyeLookInLeft).toBe(1);
    expect(result.current.eyeLookUpLeft).toBe(1);
  });

  it("should handle diagonal gaze", () => {
    const { result } = renderHook(
      ({ target }) => useExpressionGaze(target),
      { initialProps: { target: { x: 0.3, y: 0.4 } } }
    );

    expect(result.current.eyeLookInLeft).toBeCloseTo(0.3);
    expect(result.current.eyeLookUpLeft).toBeCloseTo(0.4);
  });

  it("should update when target changes", () => {
    const { result, rerender } = renderHook(
      ({ target }) => useExpressionGaze(target),
      { initialProps: { target: { x: 0.5, y: 0 } } }
    );

    expect(result.current.eyeLookInLeft).toBeCloseTo(0.5);

    rerender({ target: { x: -0.5, y: 0 } });

    expect(result.current.eyeLookOutLeft).toBeCloseTo(0.5);
  });

  it("should clear gaze when target becomes null", () => {
    const { result, rerender } = renderHook(
      ({ target }) => useExpressionGaze(target),
      {
        initialProps: {
          target: { x: 0.5, y: 0 } as { x: number; y: number } | null,
        },
      }
    );

    expect(result.current.eyeLookInLeft).toBeCloseTo(0.5);

    rerender({ target: null });

    expect(result.current).toEqual({});
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
      expect(
        EXPRESSION_PRESETS[preset as keyof typeof EXPRESSION_PRESETS]
      ).toBeDefined();
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

describe("VISEME_MAP", () => {
  it("should export all viseme mappings", () => {
    const expectedVisemes = [
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
      "aa",
      "E",
      "ih",
      "oh",
      "ou",
    ];

    for (const viseme of expectedVisemes) {
      expect(VISEME_MAP[viseme]).toBeDefined();
    }
  });

  it("should have valid blend shape values in visemes", () => {
    for (const [, values] of Object.entries(VISEME_MAP)) {
      for (const [, value] of Object.entries(values)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("should have sil as empty object for silence", () => {
    expect(VISEME_MAP.sil).toEqual({});
  });
});
