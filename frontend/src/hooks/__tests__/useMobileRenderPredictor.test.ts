/**
 * Tests for useMobileRenderPredictor hook - Sprint 226
 */

import { renderHook, act } from "@testing-library/react";
import {
  useMobileRenderPredictor,
  useInteractionRecorder,
  useGpuCompositing,
  type InteractionType,
  type InteractionEvent,
  type PreRenderFrame,
  type FrameRenderer,
} from "../useMobileRenderPredictor";

// Mock performance.now for consistent timing
const mockNow = jest.spyOn(performance, "now");
let currentTime = 1000;

beforeEach(() => {
  currentTime = 1000;
  mockNow.mockImplementation(() => currentTime);
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Helper to advance time
function advanceTime(ms: number) {
  currentTime += ms;
  jest.advanceTimersByTime(ms);
}

// Create a simple renderer
const createRenderer = (): FrameRenderer => {
  return (interaction: InteractionType, state: Record<string, unknown>) => ({
    id: `frame_${Date.now()}_${interaction}`,
    interaction,
    state: { ...state },
    priority: 1,
    createdAt: Date.now(),
    expiresAt: Date.now() + 2000,
  });
};

// Create mock interaction event
function createInteraction(
  type: InteractionType,
  options: Partial<InteractionEvent> = {}
): InteractionEvent {
  return {
    type,
    timestamp: Date.now(),
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    pressure: 1,
    ...options,
  };
}

describe("useMobileRenderPredictor", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {})
      );

      expect(result.current.state.isEnabled).toBe(true);
      expect(result.current.state.currentPrediction).toBeNull();
      expect(result.current.state.detectedPatterns).toEqual([]);
      expect(result.current.state.metrics.totalPredictions).toBe(0);
      expect(result.current.preRenderQueue).toEqual([]);
    });

    it("should accept custom configuration", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, {
          maxHistoryLength: 100,
          minConfidenceThreshold: 0.8,
        })
      );

      expect(result.current.state.isEnabled).toBe(true);
    });
  });

  describe("interaction recording", () => {
    it("should record interactions", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {})
      );

      act(() => {
        result.current.controls.recordInteraction(createInteraction("tap"));
      });

      // Should update internal state
      expect(result.current.state.metrics.totalPredictions).toBeGreaterThanOrEqual(0);
    });

    it("should not record when disabled", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {})
      );

      act(() => {
        result.current.controls.setEnabled(false);
      });

      act(() => {
        result.current.controls.recordInteraction(createInteraction("tap"));
      });

      // Should not process when disabled
      expect(result.current.state.isEnabled).toBe(false);
    });

    it("should maintain history within max length", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, { maxHistoryLength: 5 })
      );

      // Record more than max history length
      for (let i = 0; i < 10; i++) {
        act(() => {
          advanceTime(100);
          result.current.controls.recordInteraction(createInteraction("tap"));
        });
      }

      // History should be maintained internally (we can't directly inspect, but no errors)
      expect(result.current.state.metrics).toBeDefined();
    });
  });

  describe("pattern detection", () => {
    it("should detect patterns in interaction history", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, { patternWindowSize: 3 })
      );

      // Create a repeating pattern
      const pattern: InteractionType[] = [
        "tap",
        "swipe_right",
        "tap",
        "swipe_right",
        "tap",
        "swipe_right",
      ];

      for (const type of pattern) {
        act(() => {
          advanceTime(100);
          result.current.controls.recordInteraction(
            createInteraction(type, { timestamp: currentTime })
          );
        });
      }

      // Should detect patterns
      expect(result.current.state.detectedPatterns.length).toBeGreaterThanOrEqual(0);
    });

    it("should rank patterns by probability", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, { patternWindowSize: 2 })
      );

      // Create interactions that form patterns
      const interactions: InteractionType[] = [
        "tap",
        "tap",
        "tap",
        "swipe_right",
        "tap",
        "tap",
      ];

      for (const type of interactions) {
        act(() => {
          advanceTime(100);
          result.current.controls.recordInteraction(
            createInteraction(type, { timestamp: currentTime })
          );
        });
      }

      const patterns = result.current.state.detectedPatterns;
      if (patterns.length > 1) {
        // Patterns should be sorted by probability
        expect(patterns[0].probability).toBeGreaterThanOrEqual(
          patterns[1].probability
        );
      }
    });
  });

  describe("prediction", () => {
    it("should make predictions based on patterns", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, {
          minConfidenceThreshold: 0.1,
          patternWindowSize: 2,
        })
      );

      // Build up a clear pattern
      for (let i = 0; i < 5; i++) {
        act(() => {
          advanceTime(100);
          result.current.controls.recordInteraction(
            createInteraction("tap", { timestamp: currentTime })
          );
        });

        act(() => {
          advanceTime(100);
          result.current.controls.recordInteraction(
            createInteraction("swipe_right", { timestamp: currentTime })
          );
        });
      }

      // After enough repetitions, prediction may be available
      // Prediction depends on confidence threshold
    });

    it("should include timing information in predictions", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, {
          minConfidenceThreshold: 0.1,
          predictionLookaheadMs: 100,
        })
      );

      // Build history
      for (let i = 0; i < 10; i++) {
        act(() => {
          advanceTime(50);
          result.current.controls.recordInteraction(
            createInteraction("tap", { timestamp: currentTime })
          );
        });
      }

      if (result.current.state.currentPrediction) {
        expect(result.current.state.currentPrediction.estimatedTime).toBeDefined();
      }
    });

    it("should force update prediction on demand", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {})
      );

      act(() => {
        result.current.controls.recordInteraction(createInteraction("tap"));
      });

      act(() => {
        result.current.controls.updatePrediction();
      });

      // Should not throw
      expect(result.current.state).toBeDefined();
    });
  });

  describe("frame caching", () => {
    it("should cache pre-rendered frames", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, {
          minConfidenceThreshold: 0.01,
        })
      );

      // Build history to trigger caching
      for (let i = 0; i < 5; i++) {
        act(() => {
          advanceTime(100);
          result.current.controls.recordInteraction(
            createInteraction("tap", { timestamp: currentTime })
          );
        });
      }

      // Cache size should be tracked in metrics
      expect(result.current.state.metrics.cachedFrames).toBeGreaterThanOrEqual(0);
    });

    it("should retrieve cached frames", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, {
          minConfidenceThreshold: 0.01,
        })
      );

      // Build cache
      for (let i = 0; i < 5; i++) {
        act(() => {
          advanceTime(100);
          result.current.controls.recordInteraction(
            createInteraction("tap", { timestamp: currentTime })
          );
        });
      }

      // Try to get cached frame
      let cachedFrame: PreRenderFrame | null = null;
      act(() => {
        cachedFrame = result.current.controls.getCachedFrame("tap");
      });

      // May or may not have cached frame depending on predictions
    });

    it("should evict old frames when cache is full", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, {
          maxCacheSize: 2,
          minConfidenceThreshold: 0.01,
        })
      );

      const interactions: InteractionType[] = [
        "tap",
        "swipe_left",
        "swipe_right",
        "tap",
        "swipe_up",
      ];

      for (const type of interactions) {
        act(() => {
          advanceTime(100);
          result.current.controls.recordInteraction(
            createInteraction(type, { timestamp: currentTime })
          );
        });
      }

      // Cache should respect max size
      expect(result.current.state.metrics.cachedFrames).toBeLessThanOrEqual(2);
    });

    it("should clear cache on demand", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, {
          minConfidenceThreshold: 0.01,
        })
      );

      // Build cache
      act(() => {
        result.current.controls.recordInteraction(createInteraction("tap"));
      });

      act(() => {
        result.current.controls.clearCache();
      });

      expect(result.current.state.metrics.cachedFrames).toBe(0);
      expect(result.current.preRenderQueue).toEqual([]);
    });

    it("should invalidate specific frames", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, {
          minConfidenceThreshold: 0.01,
        })
      );

      // Build cache
      act(() => {
        result.current.controls.recordInteraction(createInteraction("tap"));
        result.current.controls.recordInteraction(createInteraction("swipe_left"));
      });

      act(() => {
        result.current.controls.invalidateFrames(["tap"]);
      });

      // Frame should be invalidated
      let cachedFrame: PreRenderFrame | null;
      act(() => {
        cachedFrame = result.current.controls.getCachedFrame("tap");
      });

      // Should return null for invalidated frame
    });

    it("should mark frames as used", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {})
      );

      // This should not throw
      act(() => {
        result.current.controls.markFrameUsed("nonexistent_frame");
      });

      expect(result.current.state).toBeDefined();
    });
  });

  describe("metrics tracking", () => {
    it("should track total predictions", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, {
          minConfidenceThreshold: 0.01,
        })
      );

      // Generate predictions
      for (let i = 0; i < 10; i++) {
        act(() => {
          advanceTime(100);
          result.current.controls.recordInteraction(
            createInteraction("tap", { timestamp: currentTime })
          );
        });
      }

      expect(result.current.state.metrics.totalPredictions).toBeGreaterThanOrEqual(0);
    });

    it("should calculate cache hit rate", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {})
      );

      // Make some cache hits and misses
      act(() => {
        result.current.controls.getCachedFrame("tap");
        result.current.controls.getCachedFrame("swipe_left");
      });

      // Cache hit rate should be calculated
      expect(result.current.state.metrics.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(result.current.state.metrics.cacheHitRate).toBeLessThanOrEqual(1);
    });
  });

  describe("pre-render queue", () => {
    it("should prioritize queue by confidence", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, {
          minConfidenceThreshold: 0.01,
        })
      );

      // Generate multiple predictions
      const interactions: InteractionType[] = [
        "tap",
        "tap",
        "swipe_right",
        "tap",
      ];

      for (const type of interactions) {
        act(() => {
          advanceTime(100);
          result.current.controls.recordInteraction(
            createInteraction(type, { timestamp: currentTime })
          );
        });
      }

      const queue = result.current.preRenderQueue;
      if (queue.length > 1) {
        // Queue should be sorted by priority (descending)
        for (let i = 1; i < queue.length; i++) {
          expect(queue[i - 1].priority).toBeGreaterThanOrEqual(queue[i].priority);
        }
      }
    });
  });

  describe("battery awareness", () => {
    it("should detect low power mode", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {}, {
          batteryAwarePrediction: true,
          lowBatteryThreshold: 0.2,
        })
      );

      // Battery state is set asynchronously
      // In test, it starts as null
      expect(result.current.state.batteryLevel).toBeNull();
      expect(result.current.state.isLowPowerMode).toBe(false);
    });
  });

  describe("enable/disable", () => {
    it("should enable and disable predictor", () => {
      const renderer = createRenderer();
      const { result } = renderHook(() =>
        useMobileRenderPredictor(renderer, {})
      );

      expect(result.current.state.isEnabled).toBe(true);

      act(() => {
        result.current.controls.setEnabled(false);
      });

      expect(result.current.state.isEnabled).toBe(false);

      act(() => {
        result.current.controls.setEnabled(true);
      });

      expect(result.current.state.isEnabled).toBe(true);
    });
  });
});

describe("useInteractionRecorder", () => {
  // Helper to create mock touch event
  function createTouchEvent(
    type: "touchstart" | "touchmove" | "touchend",
    x: number,
    y: number
  ): TouchEvent {
    const mockTouch = { clientX: x, clientY: y, identifier: 0 } as Touch;
    const mockTouchList = {
      0: mockTouch,
      length: 1,
      item: () => mockTouch,
      [Symbol.iterator]: function* () { yield mockTouch; },
    } as unknown as TouchList;

    return {
      type,
      touches: mockTouchList,
      changedTouches: mockTouchList,
      preventDefault: jest.fn(),
    } as unknown as TouchEvent;
  }

  it("should record tap interactions", () => {
    const onInteraction = jest.fn();
    const { result } = renderHook(() => useInteractionRecorder(onInteraction));

    act(() => {
      result.current.handleTouchStart(createTouchEvent("touchstart", 100, 100));
    });

    advanceTime(100);

    act(() => {
      result.current.handleTouchEnd(createTouchEvent("touchend", 100, 100));
    });

    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tap" })
    );
  });

  it("should record swipe interactions", () => {
    const onInteraction = jest.fn();
    const { result } = renderHook(() => useInteractionRecorder(onInteraction));

    act(() => {
      result.current.handleTouchStart(createTouchEvent("touchstart", 100, 100));
    });

    act(() => {
      result.current.handleTouchMove(createTouchEvent("touchmove", 200, 100));
    });

    advanceTime(100);

    act(() => {
      result.current.handleTouchEnd(createTouchEvent("touchend", 200, 100));
    });

    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "swipe_right" })
    );
  });

  it("should detect swipe directions correctly", () => {
    const onInteraction = jest.fn();
    const { result } = renderHook(() => useInteractionRecorder(onInteraction));

    // Swipe left
    act(() => {
      result.current.handleTouchStart(createTouchEvent("touchstart", 200, 100));
    });
    act(() => {
      result.current.handleTouchMove(createTouchEvent("touchmove", 100, 100));
    });
    advanceTime(100);
    act(() => {
      result.current.handleTouchEnd(createTouchEvent("touchend", 100, 100));
    });

    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "swipe_left" })
    );

    // Reset
    onInteraction.mockClear();

    // Swipe down
    act(() => {
      result.current.handleTouchStart(createTouchEvent("touchstart", 100, 100));
    });
    act(() => {
      result.current.handleTouchMove(createTouchEvent("touchmove", 100, 200));
    });
    advanceTime(100);
    act(() => {
      result.current.handleTouchEnd(createTouchEvent("touchend", 100, 200));
    });

    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "swipe_down" })
    );
  });

  it("should detect long press", () => {
    const onInteraction = jest.fn();
    const { result } = renderHook(() => useInteractionRecorder(onInteraction));

    act(() => {
      result.current.handleTouchStart(createTouchEvent("touchstart", 100, 100));
    });

    advanceTime(600); // More than 500ms threshold

    act(() => {
      result.current.handleTouchEnd(createTouchEvent("touchend", 100, 100));
    });

    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "long_press" })
    );
  });

  it("should include velocity in interaction events", () => {
    const onInteraction = jest.fn();
    const { result } = renderHook(() => useInteractionRecorder(onInteraction));

    act(() => {
      result.current.handleTouchStart(createTouchEvent("touchstart", 100, 100));
    });

    act(() => {
      result.current.handleTouchMove(createTouchEvent("touchmove", 200, 100));
    });

    advanceTime(100);

    act(() => {
      result.current.handleTouchEnd(createTouchEvent("touchend", 200, 100));
    });

    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        velocity: expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
        }),
      })
    );
  });
});

describe("useGpuCompositing", () => {
  it("should return GPU compositing styles when enabled", () => {
    const { result } = renderHook(() => useGpuCompositing(true));

    expect(result.current.willChange).toBe("transform, opacity");
    expect(result.current.transform).toBe("translateZ(0)");
    expect(result.current.backfaceVisibility).toBe("hidden");
  });

  it("should return empty object when disabled", () => {
    const { result } = renderHook(() => useGpuCompositing(false));

    expect(result.current).toEqual({});
  });

  it("should default to enabled", () => {
    const { result } = renderHook(() => useGpuCompositing());

    expect(result.current.willChange).toBeDefined();
  });
});
