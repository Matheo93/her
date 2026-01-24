/**
 * Tests for useAvatarEyebrowController hook
 * Sprint 551: Eyebrow animation and expression control
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarEyebrowController,
  EyebrowExpression,
} from "../useAvatarEyebrowController";

// Mock requestAnimationFrame
let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;

beforeAll(() => {
  jest.useFakeTimers();

  jest.spyOn(global, "requestAnimationFrame").mockImplementation((cb) => {
    rafCallback = cb;
    return ++rafId;
  });
  jest.spyOn(global, "cancelAnimationFrame").mockImplementation(() => {});
  jest.spyOn(performance, "now").mockReturnValue(0);
});

afterAll(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useAvatarEyebrowController", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      expect(result.current.state.currentExpression).toBe("neutral");
      expect(result.current.state.targetExpression).toBe("neutral");
      expect(result.current.state.isAnimating).toBe(false);
      expect(result.current.state.activeAnimation).toBeNull();
    });

    it("should initialize with custom config", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          transitionDuration: 500,
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      expect(result.current.config.transitionDuration).toBe(500);
    });

    it("should initialize with neutral pose", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      expect(result.current.state.currentPose.leftInner).toBe(0);
      expect(result.current.state.currentPose.rightInner).toBe(0);
      expect(result.current.state.currentPose.furrow).toBe(0);
    });

    it("should initialize metrics at zero", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      expect(result.current.metrics.totalExpressions).toBe(0);
      expect(result.current.metrics.microExpressionsTriggered).toBe(0);
      expect(result.current.metrics.emphasisEvents).toBe(0);
    });
  });

  describe("setExpression", () => {
    it("should set expression to raised", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
          asymmetryEnabled: false,
        })
      );

      act(() => {
        result.current.controls.setExpression("raised");
      });

      expect(result.current.state.targetExpression).toBe("raised");
      expect(result.current.state.isAnimating).toBe(true);
    });

    it("should update metrics when setting expression", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      act(() => {
        result.current.controls.setExpression("lowered");
      });

      expect(result.current.metrics.totalExpressions).toBe(1);
      expect(result.current.metrics.expressionCounts.lowered).toBe(1);
    });

    it("should set expression for left side only", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      act(() => {
        result.current.controls.setExpression("raised", "left");
      });

      expect(result.current.state.targetExpression).toBe("raised");
    });

    it("should set expression for right side only", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      act(() => {
        result.current.controls.setExpression("arched", "right");
      });

      expect(result.current.state.targetExpression).toBe("arched");
    });

    it("should add asymmetry when enabled", () => {
      jest.spyOn(global.Math, "random").mockReturnValue(0.7);

      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
          asymmetryEnabled: true,
        })
      );

      act(() => {
        result.current.controls.setExpression("raised", "both");
      });

      expect(result.current.state.targetExpression).toBe("raised");

      jest.spyOn(global.Math, "random").mockRestore();
    });
  });

  describe("all expression types", () => {
    const expressions: EyebrowExpression[] = [
      "neutral",
      "raised",
      "lowered",
      "furrowed",
      "arched",
      "skeptical",
      "worried",
      "confused",
      "interested",
      "sad",
      "disgusted",
      "flirty",
    ];

    expressions.forEach((expression) => {
      it(`should set expression to ${expression}`, () => {
        const { result } = renderHook(() =>
          useAvatarEyebrowController({
            microExpressionEnabled: false,
            idleVariationEnabled: false,
          })
        );

        act(() => {
          result.current.controls.setExpression(expression);
        });

        expect(result.current.state.targetExpression).toBe(expression);
      });
    });
  });

  describe("playAnimation", () => {
    it("should set active animation", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      const animation = {
        id: "test-animation",
        expression: "raised" as EyebrowExpression,
        keyframes: [
          {
            pose: { leftInner: 0.5, leftOuter: 0.5, rightInner: 0.5, rightOuter: 0.5, furrow: 0 },
            duration: 100,
            easing: "ease-in-out" as const,
          },
        ],
        loop: false,
        startTime: Date.now(),
      };

      act(() => {
        result.current.controls.playAnimation(animation);
      });

      expect(result.current.state.activeAnimation).toBe(animation);
      expect(result.current.state.isAnimating).toBe(true);
    });
  });

  describe("stopAnimation", () => {
    it("should clear active animation", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      const animation = {
        id: "test",
        expression: "raised" as EyebrowExpression,
        keyframes: [],
        loop: false,
        startTime: Date.now(),
      };

      act(() => {
        result.current.controls.playAnimation(animation);
      });

      act(() => {
        result.current.controls.stopAnimation();
      });

      expect(result.current.state.activeAnimation).toBeNull();
    });
  });

  describe("triggerMicroExpression", () => {
    it("should trigger micro-expression when enabled", () => {
      jest.spyOn(global.Math, "random").mockReturnValue(0.5);

      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: true,
          idleVariationEnabled: false,
        })
      );

      act(() => {
        result.current.controls.triggerMicroExpression();
      });

      expect(result.current.metrics.microExpressionsTriggered).toBe(1);

      jest.spyOn(global.Math, "random").mockRestore();
    });

    it("should not trigger when disabled", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      act(() => {
        result.current.controls.triggerMicroExpression();
      });

      expect(result.current.metrics.microExpressionsTriggered).toBe(0);
    });
  });

  describe("triggerEmphasis", () => {
    it("should trigger emphasis when enabled", () => {
      jest.spyOn(global.Math, "random").mockReturnValue(0.5);

      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
          speechEmphasisEnabled: true,
        })
      );

      act(() => {
        result.current.controls.triggerEmphasis();
      });

      expect(result.current.metrics.emphasisEvents).toBe(1);

      jest.spyOn(global.Math, "random").mockRestore();
    });

    it("should not trigger when disabled", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
          speechEmphasisEnabled: false,
        })
      );

      act(() => {
        result.current.controls.triggerEmphasis();
      });

      expect(result.current.metrics.emphasisEvents).toBe(0);
    });
  });

  describe("syncWithEmotion", () => {
    it("should sync with happy emotion", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
          emotionSyncEnabled: true,
        })
      );

      act(() => {
        result.current.controls.syncWithEmotion("happy", 0.8);
      });

      expect(result.current.state.targetExpression).toBe("raised");
    });

    it("should sync with sad emotion", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
          emotionSyncEnabled: true,
        })
      );

      act(() => {
        result.current.controls.syncWithEmotion("sad", 0.5);
      });

      expect(result.current.state.targetExpression).toBe("sad");
    });

    it("should default to neutral for unknown emotion", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
          emotionSyncEnabled: true,
        })
      );

      act(() => {
        result.current.controls.syncWithEmotion("unknown", 0.5);
      });

      expect(result.current.state.targetExpression).toBe("neutral");
    });

    it("should not sync when disabled", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
          emotionSyncEnabled: false,
        })
      );

      act(() => {
        result.current.controls.syncWithEmotion("angry", 1.0);
      });

      expect(result.current.state.targetExpression).toBe("neutral");
    });
  });

  describe("reset", () => {
    it("should reset to neutral", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      act(() => {
        result.current.controls.setExpression("raised");
      });

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.targetExpression).toBe("neutral");
      expect(result.current.state.currentExpression).toBe("neutral");
    });
  });

  describe("updateConfig", () => {
    it("should update config partially", () => {
      const { result } = renderHook(() =>
        useAvatarEyebrowController({
          transitionDuration: 200,
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      act(() => {
        result.current.controls.updateConfig({ transitionDuration: 500 });
      });

      expect(result.current.config.transitionDuration).toBe(500);
      expect(result.current.config.microExpressionEnabled).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const { unmount } = renderHook(() =>
        useAvatarEyebrowController({
          microExpressionEnabled: false,
          idleVariationEnabled: false,
        })
      );

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});
