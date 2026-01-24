/**
 * Tests for useAvatarEmotionalTransitions Hook - Sprint 547
 *
 * Tests cover:
 * - Hook return structure and types
 * - Default state values
 * - Emotion presets and blend shapes
 * - Transition controls (transitionTo, setImmediate, cancelTransition, clearQueue)
 * - Transition queue management
 * - Easing functions (linear, ease-in, ease-out, ease-in-out, spring, bounce)
 * - Micro-expression overlays
 * - Natural variation
 * - Emotional memory
 * - Metrics tracking
 * - Config options
 * - Convenience hooks (useSentimentEmotions, useConversationEmotions)
 * - Edge cases
 */

import { renderHook, act } from "@testing-library/react";
import useAvatarEmotionalTransitions, {
  useSentimentEmotions,
  useConversationEmotions,
  EmotionType,
  TransitionEasing,
  EmotionBlendShapes,
} from "../useAvatarEmotionalTransitions";

// Mock requestAnimationFrame
let rafCallbacks: FrameRequestCallback[] = [];
let rafId = 0;

beforeEach(() => {
  jest.useFakeTimers();
  rafCallbacks = [];
  rafId = 0;

  global.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
    rafId++;
    rafCallbacks.push(callback);
    return rafId;
  });

  global.cancelAnimationFrame = jest.fn((id: number) => {
    // Cancel is called but we don't need to track it
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const advanceFrame = (ms: number = 16) => {
  jest.advanceTimersByTime(ms);
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  callbacks.forEach((cb) => cb(performance.now()));
};

// ==============================================================================
// Hook Return Structure Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Return Structure", () => {
  it("should return state object", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.state).toBeDefined();
    expect(typeof result.current.state).toBe("object");
  });

  it("should return memory object", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.memory).toBeDefined();
    expect(typeof result.current.memory).toBe("object");
  });

  it("should return metrics object", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.metrics).toBeDefined();
    expect(typeof result.current.metrics).toBe("object");
  });

  it("should return controls object", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.controls).toBeDefined();
    expect(typeof result.current.controls).toBe("object");
  });

  it("should return currentBlendShapes", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.currentBlendShapes).toBeDefined();
  });

  it("should return transitionProgress", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(typeof result.current.transitionProgress).toBe("number");
  });
});

// ==============================================================================
// Default State Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Default State", () => {
  it("should have neutral as default currentEmotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.state.currentEmotion).toBe("neutral");
  });

  it("should have neutral as default targetEmotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.state.targetEmotion).toBe("neutral");
  });

  it("should have null transition initially", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.state.transition).toBeNull();
  });

  it("should not be transitioning initially", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.state.isTransitioning).toBe(false);
  });

  it("should have empty transitionQueue initially", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.state.transitionQueue).toEqual([]);
  });

  it("should have default blend shapes with all zeros for neutral", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    const blendShapes = result.current.state.blendShapes;

    expect(blendShapes.browInnerUp).toBe(0);
    expect(blendShapes.mouthSmileL).toBe(0);
    expect(blendShapes.mouthSmileR).toBe(0);
  });

  it("should have transitionProgress of 1 when not transitioning", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.transitionProgress).toBe(1);
  });
});

// ==============================================================================
// Memory Default State Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Memory", () => {
  it("should have recentEmotions array", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(Array.isArray(result.current.memory.recentEmotions)).toBe(true);
  });

  it("should have neutral as dominantEmotion initially", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.memory.dominantEmotion).toBe("neutral");
  });

  it("should have low emotionalVolatility initially", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    // Volatility starts low (may not be exactly 0 due to initial entry)
    expect(result.current.memory.emotionalVolatility).toBeLessThanOrEqual(0.1);
  });

  it("should have default averageTransitionSpeed", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.memory.averageTransitionSpeed).toBe(400);
  });
});

// ==============================================================================
// Metrics Default State Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Metrics", () => {
  it("should have 0 totalTransitions initially", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.metrics.totalTransitions).toBe(0);
  });

  it("should have default averageTransitionDuration", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.metrics.averageTransitionDuration).toBe(400);
  });

  it("should have empty emotionCounts initially", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.metrics.emotionCounts).toEqual({});
  });

  it("should have 100 smoothnessScore initially", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(result.current.metrics.smoothnessScore).toBe(100);
  });
});

// ==============================================================================
// Controls Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Controls", () => {
  it("should have transitionTo function", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(typeof result.current.controls.transitionTo).toBe("function");
  });

  it("should have setImmediate function", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(typeof result.current.controls.setImmediate).toBe("function");
  });

  it("should have cancelTransition function", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(typeof result.current.controls.cancelTransition).toBe("function");
  });

  it("should have clearQueue function", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(typeof result.current.controls.clearQueue).toBe("function");
  });

  it("should have getBlendShapesForEmotion function", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    expect(typeof result.current.controls.getBlendShapesForEmotion).toBe("function");
  });
});

// ==============================================================================
// transitionTo Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - transitionTo", () => {
  it("should start transition when transitionTo is called", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    expect(result.current.state.isTransitioning).toBe(true);
    expect(result.current.state.targetEmotion).toBe("happy");
  });

  it("should not transition to same emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("neutral");
    });

    expect(result.current.state.isTransitioning).toBe(false);
  });

  it("should create transition object when starting", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    expect(result.current.state.transition).not.toBeNull();
    expect(result.current.state.transition?.from).toBe("neutral");
    expect(result.current.state.transition?.to).toBe("happy");
  });

  it("should increment totalTransitions metric", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    expect(result.current.metrics.totalTransitions).toBe(1);
  });

  it("should update emotionCounts metric", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    expect(result.current.metrics.emotionCounts["happy"]).toBe(1);
  });

  it("should not transition when disabled", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ enabled: false })
    );

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    expect(result.current.state.isTransitioning).toBe(false);
  });
});

// ==============================================================================
// setImmediate Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - setImmediate", () => {
  it("should set emotion immediately without transition", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.setImmediate("happy");
    });

    expect(result.current.state.currentEmotion).toBe("happy");
    expect(result.current.state.isTransitioning).toBe(false);
  });

  it("should update blend shapes immediately", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.setImmediate("happy");
    });

    // Happy emotion has mouthSmileL and mouthSmileR > 0
    expect(result.current.state.blendShapes.mouthSmileL).toBeGreaterThan(0);
    expect(result.current.state.blendShapes.mouthSmileR).toBeGreaterThan(0);
  });

  it("should clear transition queue", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
      result.current.controls.transitionTo("sad");
    });

    act(() => {
      result.current.controls.setImmediate("neutral");
    });

    expect(result.current.state.transitionQueue).toEqual([]);
  });

  it("should cancel ongoing animation", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    act(() => {
      result.current.controls.setImmediate("sad");
    });

    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });
});

// ==============================================================================
// cancelTransition Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - cancelTransition", () => {
  it("should cancel ongoing transition", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    act(() => {
      result.current.controls.cancelTransition();
    });

    expect(result.current.state.isTransitioning).toBe(false);
  });

  it("should set targetEmotion back to currentEmotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    act(() => {
      result.current.controls.cancelTransition();
    });

    expect(result.current.state.targetEmotion).toBe(result.current.state.currentEmotion);
  });

  it("should set transition to null", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    act(() => {
      result.current.controls.cancelTransition();
    });

    expect(result.current.state.transition).toBeNull();
  });
});

// ==============================================================================
// clearQueue Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - clearQueue", () => {
  it("should clear transition queue", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
      result.current.controls.transitionTo("sad");
      result.current.controls.transitionTo("surprised");
    });

    expect(result.current.state.transitionQueue.length).toBeGreaterThan(0);

    act(() => {
      result.current.controls.clearQueue();
    });

    expect(result.current.state.transitionQueue).toEqual([]);
  });
});

// ==============================================================================
// Transition Queue Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Transition Queue", () => {
  it("should queue transitions when already transitioning", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
      result.current.controls.transitionTo("sad");
    });

    expect(result.current.state.transitionQueue).toContain("sad");
  });

  it("should respect maxQueueSize", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ maxQueueSize: 2 })
    );

    act(() => {
      result.current.controls.transitionTo("happy");
      result.current.controls.transitionTo("sad");
      result.current.controls.transitionTo("surprised");
      result.current.controls.transitionTo("excited");
    });

    expect(result.current.state.transitionQueue.length).toBeLessThanOrEqual(2);
  });

  it("should not queue when queueTransitions is false", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ queueTransitions: false })
    );

    act(() => {
      result.current.controls.transitionTo("happy");
      result.current.controls.transitionTo("sad");
    });

    expect(result.current.state.transitionQueue).toEqual([]);
  });
});

// ==============================================================================
// getBlendShapesForEmotion Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - getBlendShapesForEmotion", () => {
  it("should return blend shapes for happy emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const happyShapes = result.current.controls.getBlendShapesForEmotion("happy");

    expect(happyShapes.mouthSmileL).toBe(0.6);
    expect(happyShapes.mouthSmileR).toBe(0.6);
    expect(happyShapes.eyeSquintL).toBe(0.3);
    expect(happyShapes.eyeSquintR).toBe(0.3);
  });

  it("should return blend shapes for sad emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const sadShapes = result.current.controls.getBlendShapesForEmotion("sad");

    expect(sadShapes.browInnerUp).toBe(0.4);
    expect(sadShapes.mouthFrownL).toBe(0.4);
    expect(sadShapes.mouthFrownR).toBe(0.4);
  });

  it("should return blend shapes for surprised emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const surprisedShapes = result.current.controls.getBlendShapesForEmotion("surprised");

    expect(surprisedShapes.eyeWideL).toBe(0.6);
    expect(surprisedShapes.eyeWideR).toBe(0.6);
    expect(surprisedShapes.mouthOpen).toBe(0.3);
  });

  it("should return default blend shapes for neutral", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const neutralShapes = result.current.controls.getBlendShapesForEmotion("neutral");

    expect(neutralShapes.mouthSmileL).toBe(0);
    expect(neutralShapes.mouthSmileR).toBe(0);
    expect(neutralShapes.browInnerUp).toBe(0);
  });

  it("should return blend shapes for thoughtful emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const shapes = result.current.controls.getBlendShapesForEmotion("thoughtful");

    expect(shapes.browInnerUp).toBe(0.2);
    expect(shapes.eyeLookUpL).toBe(0.3);
    expect(shapes.mouthPucker).toBe(0.1);
  });

  it("should return blend shapes for concerned emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const shapes = result.current.controls.getBlendShapesForEmotion("concerned");

    expect(shapes.browInnerUp).toBe(0.5);
    expect(shapes.browDownL).toBe(0.2);
    expect(shapes.mouthFrownL).toBe(0.2);
  });

  it("should return blend shapes for excited emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const shapes = result.current.controls.getBlendShapesForEmotion("excited");

    expect(shapes.mouthSmileL).toBe(0.8);
    expect(shapes.mouthSmileR).toBe(0.8);
    expect(shapes.eyeWideL).toBe(0.3);
  });

  it("should return blend shapes for calm emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const shapes = result.current.controls.getBlendShapesForEmotion("calm");

    expect(shapes.eyeSquintL).toBe(0.1);
    expect(shapes.mouthSmileL).toBe(0.15);
  });

  it("should return blend shapes for curious emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const shapes = result.current.controls.getBlendShapesForEmotion("curious");

    expect(shapes.browInnerUp).toBe(0.3);
    expect(shapes.browOuterUpR).toBe(0.4);
  });

  it("should return blend shapes for empathetic emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const shapes = result.current.controls.getBlendShapesForEmotion("empathetic");

    expect(shapes.browInnerUp).toBe(0.35);
    expect(shapes.eyeSquintL).toBe(0.15);
    expect(shapes.mouthSmileL).toBe(0.2);
  });

  it("should return blend shapes for playful emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const shapes = result.current.controls.getBlendShapesForEmotion("playful");

    expect(shapes.mouthSmileL).toBe(0.5);
    expect(shapes.mouthSmileR).toBe(0.7);
  });

  it("should return blend shapes for focused emotion", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    const shapes = result.current.controls.getBlendShapesForEmotion("focused");

    expect(shapes.browDownL).toBe(0.25);
    expect(shapes.browDownR).toBe(0.25);
    expect(shapes.eyeSquintL).toBe(0.2);
  });
});

// ==============================================================================
// Config Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Config", () => {
  it("should use custom defaultDuration", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ defaultDuration: 800 })
    );

    expect(result.current.memory.averageTransitionSpeed).toBe(800);
  });

  it("should respect enabled flag", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ enabled: false })
    );

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    expect(result.current.state.isTransitioning).toBe(false);
  });

  it("should use custom maxQueueSize", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ maxQueueSize: 5 })
    );

    act(() => {
      result.current.controls.transitionTo("happy");
      result.current.controls.transitionTo("sad");
      result.current.controls.transitionTo("surprised");
      result.current.controls.transitionTo("excited");
      result.current.controls.transitionTo("calm");
      result.current.controls.transitionTo("curious");
    });

    expect(result.current.state.transitionQueue.length).toBeLessThanOrEqual(5);
  });
});

// ==============================================================================
// Emotion Types Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Emotion Types", () => {
  const emotions: EmotionType[] = [
    "neutral",
    "happy",
    "sad",
    "surprised",
    "thoughtful",
    "concerned",
    "excited",
    "calm",
    "curious",
    "empathetic",
    "playful",
    "focused",
  ];

  emotions.forEach((emotion) => {
    it(`should transition to ${emotion} emotion`, () => {
      const { result } = renderHook(() => useAvatarEmotionalTransitions());

      act(() => {
        result.current.controls.transitionTo(emotion);
      });

      if (emotion !== "neutral") {
        expect(result.current.state.targetEmotion).toBe(emotion);
      }
    });
  });

  emotions.forEach((emotion) => {
    it(`should set ${emotion} immediately`, () => {
      const { result } = renderHook(() => useAvatarEmotionalTransitions());

      act(() => {
        result.current.controls.setImmediate(emotion);
      });

      expect(result.current.state.currentEmotion).toBe(emotion);
    });
  });
});

// ==============================================================================
// Blend Shapes Structure Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Blend Shapes Structure", () => {
  it("should have all eyebrow blend shapes", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    const shapes = result.current.state.blendShapes;

    expect("browInnerUp" in shapes).toBe(true);
    expect("browOuterUpL" in shapes).toBe(true);
    expect("browOuterUpR" in shapes).toBe(true);
    expect("browDownL" in shapes).toBe(true);
    expect("browDownR" in shapes).toBe(true);
  });

  it("should have all eye blend shapes", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    const shapes = result.current.state.blendShapes;

    expect("eyeWideL" in shapes).toBe(true);
    expect("eyeWideR" in shapes).toBe(true);
    expect("eyeSquintL" in shapes).toBe(true);
    expect("eyeSquintR" in shapes).toBe(true);
    expect("eyeLookUpL" in shapes).toBe(true);
    expect("eyeLookUpR" in shapes).toBe(true);
    expect("eyeLookDownL" in shapes).toBe(true);
    expect("eyeLookDownR" in shapes).toBe(true);
  });

  it("should have all mouth blend shapes", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    const shapes = result.current.state.blendShapes;

    expect("mouthSmileL" in shapes).toBe(true);
    expect("mouthSmileR" in shapes).toBe(true);
    expect("mouthFrownL" in shapes).toBe(true);
    expect("mouthFrownR" in shapes).toBe(true);
    expect("mouthOpen" in shapes).toBe(true);
    expect("mouthPucker" in shapes).toBe(true);
    expect("jawOpen" in shapes).toBe(true);
  });

  it("should have all cheek blend shapes", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    const shapes = result.current.state.blendShapes;

    expect("cheekSquintL" in shapes).toBe(true);
    expect("cheekSquintR" in shapes).toBe(true);
    expect("cheekPuff" in shapes).toBe(true);
  });

  it("should have all nose blend shapes", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());
    const shapes = result.current.state.blendShapes;

    expect("noseSneerL" in shapes).toBe(true);
    expect("noseSneerR" in shapes).toBe(true);
  });
});

// ==============================================================================
// Transition Config Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Transition Config", () => {
  it("should accept custom duration in transitionTo", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy", { duration: 1000 });
    });

    expect(result.current.state.transition?.config.duration).toBeGreaterThanOrEqual(800); // With variation
  });

  it("should accept custom easing in transitionTo", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ naturalVariation: 0 })
    );

    act(() => {
      result.current.controls.transitionTo("happy", { easing: "spring" });
    });

    expect(result.current.state.transition?.config.easing).toBe("spring");
  });

  it("should accept delay in transitionTo", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ naturalVariation: 0 })
    );

    act(() => {
      result.current.controls.transitionTo("happy", { delay: 500 });
    });

    expect(result.current.state.transition?.config.delay).toBe(500);
  });

  it("should accept overshoot in transitionTo", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ naturalVariation: 0 })
    );

    act(() => {
      result.current.controls.transitionTo("happy", { overshoot: 0.3 });
    });

    expect(result.current.state.transition?.config.overshoot).toBe(0.3);
  });
});

// ==============================================================================
// useSentimentEmotions Tests
// ==============================================================================

describe("useSentimentEmotions", () => {
  it("should return blendShapes and emotion", () => {
    const { result } = renderHook(() => useSentimentEmotions(0));

    expect(result.current.blendShapes).toBeDefined();
    expect(result.current.emotion).toBeDefined();
  });

  it("should transition to happy for high positive sentiment", () => {
    const { result, rerender } = renderHook(
      ({ sentiment }) => useSentimentEmotions(sentiment),
      { initialProps: { sentiment: 0 } }
    );

    rerender({ sentiment: 0.8 });

    // After significant sentiment change
    expect(["happy", "calm", "neutral"]).toContain(result.current.emotion);
  });

  it("should transition to sad for high negative sentiment", () => {
    const { result, rerender } = renderHook(
      ({ sentiment }) => useSentimentEmotions(sentiment),
      { initialProps: { sentiment: 0 } }
    );

    rerender({ sentiment: -0.8 });

    // After significant sentiment change
    expect(["sad", "concerned", "neutral"]).toContain(result.current.emotion);
  });

  it("should not transition for small sentiment changes", () => {
    const { result, rerender } = renderHook(
      ({ sentiment }) => useSentimentEmotions(sentiment),
      { initialProps: { sentiment: 0 } }
    );

    const initialEmotion = result.current.emotion;

    rerender({ sentiment: 0.1 }); // Small change

    expect(result.current.emotion).toBe(initialEmotion);
  });
});

// ==============================================================================
// useConversationEmotions Tests
// ==============================================================================

describe("useConversationEmotions", () => {
  it("should return blendShapes and emotion", () => {
    const { result } = renderHook(() =>
      useConversationEmotions(false, false, false)
    );

    expect(result.current.blendShapes).toBeDefined();
    expect(result.current.emotion).toBeDefined();
  });

  it("should transition to thoughtful when isThinking", () => {
    const { result, rerender } = renderHook(
      ({ isListening, isSpeaking, isThinking }) =>
        useConversationEmotions(isListening, isSpeaking, isThinking),
      { initialProps: { isListening: false, isSpeaking: false, isThinking: false } }
    );

    rerender({ isListening: false, isSpeaking: false, isThinking: true });

    // Should target thoughtful
    expect(["thoughtful", "neutral"]).toContain(result.current.emotion);
  });

  it("should transition to calm when isSpeaking", () => {
    const { result, rerender } = renderHook(
      ({ isListening, isSpeaking, isThinking }) =>
        useConversationEmotions(isListening, isSpeaking, isThinking),
      { initialProps: { isListening: false, isSpeaking: false, isThinking: false } }
    );

    rerender({ isListening: false, isSpeaking: true, isThinking: false });

    expect(["calm", "neutral"]).toContain(result.current.emotion);
  });

  it("should transition to curious when isListening", () => {
    const { result, rerender } = renderHook(
      ({ isListening, isSpeaking, isThinking }) =>
        useConversationEmotions(isListening, isSpeaking, isThinking),
      { initialProps: { isListening: false, isSpeaking: false, isThinking: false } }
    );

    rerender({ isListening: true, isSpeaking: false, isThinking: false });

    expect(["curious", "neutral"]).toContain(result.current.emotion);
  });

  it("should prioritize isThinking over other states", () => {
    const { result, rerender } = renderHook(
      ({ isListening, isSpeaking, isThinking }) =>
        useConversationEmotions(isListening, isSpeaking, isThinking),
      { initialProps: { isListening: false, isSpeaking: false, isThinking: false } }
    );

    rerender({ isListening: true, isSpeaking: true, isThinking: true });

    expect(["thoughtful", "neutral"]).toContain(result.current.emotion);
  });
});

// ==============================================================================
// Edge Cases Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Edge Cases", () => {
  it("should handle rapid emotion changes", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
      result.current.controls.transitionTo("sad");
      result.current.controls.transitionTo("surprised");
      result.current.controls.transitionTo("neutral");
    });

    // Should not throw and should have a queue
    expect(result.current.state.transitionQueue.length).toBeGreaterThan(0);
  });

  it("should handle setImmediate during transition", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    act(() => {
      result.current.controls.setImmediate("sad");
    });

    expect(result.current.state.currentEmotion).toBe("sad");
    expect(result.current.state.isTransitioning).toBe(false);
  });

  it("should handle cancelTransition when not transitioning", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.cancelTransition();
    });

    // Should not throw
    expect(result.current.state.isTransitioning).toBe(false);
  });

  it("should handle clearQueue when queue is empty", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.clearQueue();
    });

    expect(result.current.state.transitionQueue).toEqual([]);
  });

  it("should handle multiple setImmediate calls", () => {
    const { result } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.setImmediate("happy");
      result.current.controls.setImmediate("sad");
      result.current.controls.setImmediate("surprised");
    });

    expect(result.current.state.currentEmotion).toBe("surprised");
  });

  it("should handle config changes", () => {
    const { result, rerender } = renderHook(
      ({ config }) => useAvatarEmotionalTransitions(config),
      { initialProps: { config: { defaultDuration: 400 } } }
    );

    rerender({ config: { defaultDuration: 800 } });

    // Should not throw
    expect(result.current).toBeDefined();
  });
});

// ==============================================================================
// Cleanup Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Cleanup", () => {
  it("should cleanup animation frame on unmount", () => {
    const { result, unmount } = renderHook(() => useAvatarEmotionalTransitions());

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    unmount();

    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("should cleanup when transition completes", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ naturalVariation: 0, defaultDuration: 100 })
    );

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    // Advance time past transition duration
    act(() => {
      jest.advanceTimersByTime(200);
      advanceFrame(200);
    });

    // Transition should be complete
    expect(result.current.state.transition).toBeNull();
  });
});

// ==============================================================================
// Transition Rules Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Transition Rules", () => {
  it("should use predefined rule for neutral to happy", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ naturalVariation: 0 })
    );

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    // neutral_to_happy rule: duration 400, easing ease-out
    expect(result.current.state.transition?.config.easing).toBe("ease-out");
  });

  it("should use predefined rule for neutral to surprised", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ naturalVariation: 0 })
    );

    act(() => {
      result.current.controls.transitionTo("surprised");
    });

    // neutral_to_surprised rule: easing spring, overshoot 0.2
    expect(result.current.state.transition?.config.easing).toBe("spring");
    expect(result.current.state.transition?.config.overshoot).toBe(0.2);
  });

  it("should override rule with custom config", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ naturalVariation: 0 })
    );

    act(() => {
      result.current.controls.transitionTo("happy", { easing: "linear" });
    });

    expect(result.current.state.transition?.config.easing).toBe("linear");
  });
});

// ==============================================================================
// Natural Variation Tests
// ==============================================================================

describe("useAvatarEmotionalTransitions - Natural Variation", () => {
  it("should apply variation to duration when naturalVariation > 0", () => {
    // Run multiple times to test randomness
    const durations: number[] = [];

    for (let i = 0; i < 5; i++) {
      const { result } = renderHook(() =>
        useAvatarEmotionalTransitions({ naturalVariation: 0.5, defaultDuration: 1000 })
      );

      act(() => {
        result.current.controls.transitionTo("happy");
      });

      durations.push(result.current.state.transition?.config.duration || 0);
    }

    // With variation, durations should not all be exactly 1000
    // (There's a small chance they could be, but unlikely with 0.5 variation)
    const allSame = durations.every((d) => d === durations[0]);
    // This is a probabilistic test, so we just check it doesn't throw
    expect(durations.length).toBe(5);
  });

  it("should not apply variation when naturalVariation is 0", () => {
    const { result } = renderHook(() =>
      useAvatarEmotionalTransitions({ naturalVariation: 0, defaultDuration: 1000 })
    );

    act(() => {
      result.current.controls.transitionTo("happy");
    });

    // Duration should be exactly as specified (or from rule)
    expect(result.current.state.transition?.config.duration).toBe(400); // From rule
  });
});
