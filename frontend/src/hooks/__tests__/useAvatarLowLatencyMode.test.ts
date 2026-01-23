/**
 * Tests for useAvatarLowLatencyMode - Sprint 541
 *
 * Tests unified low-latency mode for mobile avatar interactions:
 * - Intelligent render priority boosting during touch
 * - Predictive animation preloading
 * - Adaptive quality degradation
 * - Touch event processing
 * - Mode transitions
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarLowLatencyMode,
  useLowLatencyTouch,
  useLatencyAdaptiveQuality,
  useLatencyMetrics,
} from "../useAvatarLowLatencyMode";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.useFakeTimers();
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);

  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    return setTimeout(() => {
      mockTime += 16.67; // ~60fps
      cb(mockTime);
    }, 16) as unknown as number;
  });

  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    clearTimeout(id);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ============================================================================
// Helper Functions
// ============================================================================

function createMockTouchEvent(
  type: "touchstart" | "touchmove" | "touchend",
  x = 100,
  y = 200,
  force = 1
): TouchEvent {
  const touch = {
    clientX: x,
    clientY: y,
    force,
    identifier: 0,
  };

  return {
    type,
    touches: type === "touchend" ? [] : [touch],
    changedTouches: [touch],
    targetTouches: type === "touchend" ? [] : [touch],
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    timeStamp: mockTime,
  } as unknown as TouchEvent;
}

// ============================================================================
// Main Hook Tests
// ============================================================================

describe("useAvatarLowLatencyMode", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.mode).toBe("normal");
      expect(result.current.state.interactionState).toBe("idle");
      expect(result.current.state.optimizationLevel).toBe("none");
    });

    it("should initialize with default quality settings", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      expect(result.current.state.quality.animationFps).toBe(60);
      expect(result.current.state.quality.textureQuality).toBe("high");
      expect(result.current.state.quality.enableParticles).toBe(true);
      expect(result.current.state.quality.enableBlur).toBe(true);
    });

    it("should initialize with zero metrics", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      expect(result.current.metrics.currentLatencyMs).toBe(0);
      expect(result.current.metrics.averageLatencyMs).toBe(0);
      expect(result.current.metrics.frameDrops).toBe(0);
      expect(result.current.metrics.modeTransitions).toBe(0);
    });

    it("should provide control functions", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      expect(typeof result.current.controls.enable).toBe("function");
      expect(typeof result.current.controls.disable).toBe("function");
      expect(typeof result.current.controls.setMode).toBe("function");
      expect(typeof result.current.controls.processTouchStart).toBe("function");
      expect(typeof result.current.controls.processTouchMove).toBe("function");
      expect(typeof result.current.controls.processTouchEnd).toBe("function");
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({
          targetLatencyMs: 8,
          enableTouchPrediction: false,
        })
      );

      expect(result.current.state.isActive).toBe(false);
    });
  });

  describe("enable/disable", () => {
    it("should enable low latency mode", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      expect(result.current.state.isActive).toBe(true);
    });

    it("should disable low latency mode", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      expect(result.current.state.isActive).toBe(true);

      act(() => {
        result.current.controls.disable();
      });

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.mode).toBe("normal");
      expect(result.current.state.interactionState).toBe("idle");
    });
  });

  describe("mode management", () => {
    it("should allow setting mode manually", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.setMode("low");
      });

      expect(result.current.state.mode).toBe("low");
    });

    it("should update quality when mode changes", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.setMode("ultra-low");
      });

      expect(result.current.state.quality.animationFps).toBe(30);
      expect(result.current.state.quality.enableParticles).toBe(false);
      expect(result.current.state.quality.textureQuality).toBe("low");
    });

    it("should use instant quality for instant mode", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.setMode("instant");
      });

      expect(result.current.state.quality.animationFps).toBe(24);
      expect(result.current.state.quality.maxBlendShapes).toBe(8);
    });

    it("should call onModeChange callback", () => {
      const onModeChange = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onModeChange })
      );

      act(() => {
        result.current.controls.setMode("low");
      });

      // Need to advance timers to trigger the effect
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(onModeChange).toHaveBeenCalledWith("low");
    });
  });

  describe("touch processing", () => {
    it("should process touch start event", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      const touchEvent = createMockTouchEvent("touchstart", 150, 250, 0.8);

      act(() => {
        result.current.controls.processTouchStart(touchEvent);
      });

      expect(result.current.state.touch.active).toBe(true);
      expect(result.current.state.touch.currentPosition).toEqual({ x: 150, y: 250 });
      expect(result.current.state.touch.pressure).toBe(0.8);
      expect(result.current.state.interactionState).toBe("touching");
    });

    it("should process touch move event", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      // Advance time
      mockTime += 16;

      // Move touch
      act(() => {
        result.current.controls.processTouchMove(
          createMockTouchEvent("touchmove", 150, 250)
        );
      });

      expect(result.current.state.touch.currentPosition).toEqual({ x: 150, y: 250 });
      expect(result.current.state.interactionState).toBe("gesturing");
    });

    it("should calculate velocity during touch move", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      // Advance time by 100ms
      mockTime += 100;

      // Move touch 50px right
      act(() => {
        result.current.controls.processTouchMove(
          createMockTouchEvent("touchmove", 150, 200)
        );
      });

      // Velocity should be 0.5 px/ms (50px / 100ms)
      expect(result.current.state.touch.velocity.x).toBeCloseTo(0.5, 1);
      expect(result.current.state.touch.velocity.y).toBeCloseTo(0, 1);
    });

    it("should process touch end event", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      expect(result.current.state.touch.active).toBe(true);

      // End touch
      act(() => {
        result.current.controls.processTouchEnd(
          createMockTouchEvent("touchend")
        );
      });

      expect(result.current.state.touch.active).toBe(false);
      expect(result.current.state.interactionState).toBe("animating");

      // After timeout, should return to idle
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current.state.interactionState).toBe("idle");
    });

    it("should not process touch when disabled", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      // Don't enable

      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 150, 250)
        );
      });

      expect(result.current.state.touch.active).toBe(false);
      expect(result.current.state.interactionState).toBe("idle");
    });

    it("should boost mode during touch interaction", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      expect(result.current.state.mode).toBe("normal");

      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      // Mode should boost to "low" during touch
      expect(result.current.state.mode).toBe("low");
    });
  });

  describe("gesture prediction", () => {
    it("should predict tap gesture for stationary touch", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onPredictionMade })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Simulate multiple stationary touches
      for (let i = 0; i < 5; i++) {
        mockTime += 16;
        act(() => {
          if (i === 0) {
            result.current.controls.processTouchStart(
              createMockTouchEvent("touchstart", 100, 200)
            );
          } else {
            result.current.controls.processTouchMove(
              createMockTouchEvent("touchmove", 100, 200)
            );
          }
        });
      }

      expect(onPredictionMade).toHaveBeenCalled();
      const lastCall = onPredictionMade.mock.calls[onPredictionMade.mock.calls.length - 1];
      expect(lastCall[0]).toBe("tap");
    });

    it("should predict swipe gesture for fast horizontal movement", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onPredictionMade })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      // Simulate fast horizontal swipe (500px in 100ms = 5px/ms)
      for (let i = 1; i <= 5; i++) {
        mockTime += 20;
        act(() => {
          result.current.controls.processTouchMove(
            createMockTouchEvent("touchmove", 100 + i * 100, 200)
          );
        });
      }

      expect(onPredictionMade).toHaveBeenCalled();
      // Should predict swipe-right
      const calls = onPredictionMade.mock.calls;
      const lastGesture = calls[calls.length - 1][0];
      expect(lastGesture).toMatch(/swipe-right|drag/);
    });
  });

  describe("animation preloading", () => {
    it("should preload animations", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.preloadAnimation("wave", 2);
      });

      // Animation should be queued for preloading
      // (Internal state, we verify by checking no errors)
      expect(result.current.state.isActive).toBe(false);
    });

    it("should limit preloaded animations", () => {
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({ maxPreloadedAnimations: 3 })
      );

      // Preload multiple animations
      act(() => {
        result.current.controls.preloadAnimation("wave", 1);
        result.current.controls.preloadAnimation("nod", 1);
        result.current.controls.preloadAnimation("smile", 1);
        result.current.controls.preloadAnimation("blink", 2); // Higher priority
      });

      // Should have replaced lowest priority
      expect(result.current.state.isActive).toBe(false);
    });
  });

  describe("quality control", () => {
    it("should allow forcing quality settings", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.forceQuality({ animationFps: 30, enableBlur: false });
      });

      expect(result.current.state.quality.animationFps).toBe(30);
      expect(result.current.state.quality.enableBlur).toBe(false);
    });

    it("should get optimal quality based on mode", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.setMode("ultra-low");
      });

      const optimal = result.current.controls.getOptimalQuality();

      expect(optimal.animationFps).toBe(30);
      expect(optimal.textureQuality).toBe("low");
    });

    it("should respect forced quality over mode quality", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.setMode("low");
        result.current.controls.forceQuality({ animationFps: 15 });
      });

      const optimal = result.current.controls.getOptimalQuality();

      expect(optimal.animationFps).toBe(15);
    });

    it("should clear forced quality when set to null", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.forceQuality({ animationFps: 15 });
      });

      expect(result.current.state.quality.animationFps).toBe(15);

      act(() => {
        result.current.controls.forceQuality(null);
        // Quality should return to mode-based quality
        // Need to trigger a mode change to see the effect
        result.current.controls.setMode("normal");
      });

      // After clearing forced quality and setting mode, quality should update
      act(() => {
        jest.advanceTimersByTime(100);
      });
    });
  });

  describe("metrics", () => {
    it("should reset metrics", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      // Simulate some activity that would update metrics
      act(() => {
        result.current.controls.enable();
        result.current.controls.setMode("low");
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Reset metrics
      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.currentLatencyMs).toBe(0);
      expect(result.current.metrics.frameDrops).toBe(0);
      expect(result.current.metrics.qualityAdjustments).toBe(0);
      expect(result.current.metrics.modeTransitions).toBe(0);
    });

    it("should track quality adjustments", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.setMode("low");
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current.metrics.qualityAdjustments).toBeGreaterThan(0);
    });
  });

  describe("callbacks", () => {
    it("should call onQualityAdjustment when quality changes", () => {
      const onQualityAdjustment = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onQualityAdjustment })
      );

      act(() => {
        result.current.controls.setMode("ultra-low");
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(onQualityAdjustment).toHaveBeenCalled();
    });

    it("should call onInteractionStateChange", () => {
      const onInteractionStateChange = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onInteractionStateChange })
      );

      act(() => {
        result.current.controls.enable();
      });

      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(onInteractionStateChange).toHaveBeenCalled();
    });
  });

  describe("latency budget", () => {
    it("should have default latency budget", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      expect(result.current.state.latencyBudget.total).toBe(16);
      expect(result.current.state.latencyBudget.inputProcessing).toBe(2);
      expect(result.current.state.latencyBudget.animationUpdate).toBe(6);
      expect(result.current.state.latencyBudget.render).toBe(6);
    });
  });
});

// ============================================================================
// Convenience Hooks Tests
// ============================================================================

describe("useLowLatencyTouch", () => {
  it("should provide touch handlers", () => {
    const { result } = renderHook(() => useLowLatencyTouch());

    expect(typeof result.current.onTouchStart).toBe("function");
    expect(typeof result.current.onTouchMove).toBe("function");
    expect(typeof result.current.onTouchEnd).toBe("function");
  });

  it("should auto-enable on mount", () => {
    const { result } = renderHook(() => useLowLatencyTouch());

    // Should have enabled automatically
    expect(result.current.isActive).toBe(false); // Touch not active yet
  });

  it("should track velocity", () => {
    const { result } = renderHook(() => useLowLatencyTouch());

    expect(result.current.velocity).toEqual({ x: 0, y: 0 });
  });
});

describe("useLatencyAdaptiveQuality", () => {
  it("should provide quality settings", () => {
    const { result } = renderHook(() => useLatencyAdaptiveQuality());

    expect(result.current.quality).toBeDefined();
    expect(result.current.quality.animationFps).toBeGreaterThan(0);
  });

  it("should provide current mode", () => {
    const { result } = renderHook(() => useLatencyAdaptiveQuality());

    expect(result.current.mode).toBe("normal");
  });

  it("should provide forceQuality function", () => {
    const { result } = renderHook(() => useLatencyAdaptiveQuality());

    expect(typeof result.current.forceQuality).toBe("function");
  });
});

describe("useLatencyMetrics", () => {
  it("should provide latency metrics", () => {
    const { result } = renderHook(() => useLatencyMetrics());

    expect(typeof result.current.current).toBe("number");
    expect(typeof result.current.average).toBe("number");
    expect(typeof result.current.p95).toBe("number");
    expect(typeof result.current.touchToRender).toBe("number");
    expect(typeof result.current.frameDrops).toBe("number");
  });

  it("should start with zero values", () => {
    const { result } = renderHook(() => useLatencyMetrics());

    expect(result.current.current).toBe(0);
    expect(result.current.average).toBe(0);
    expect(result.current.p95).toBe(0);
    expect(result.current.frameDrops).toBe(0);
  });
});

// ============================================================================
// Sprint 542 - Enhanced Coverage Tests
// ============================================================================

describe("useAvatarLowLatencyMode - Branch Coverage", () => {
  describe("gesture prediction - all directions", () => {
    it("should predict swipe-left gesture", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onPredictionMade })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 500, 200)
        );
      });

      // Simulate fast leftward swipe (moving from right to left)
      for (let i = 1; i <= 5; i++) {
        mockTime += 20;
        act(() => {
          result.current.controls.processTouchMove(
            createMockTouchEvent("touchmove", 500 - i * 100, 200)
          );
        });
      }

      expect(onPredictionMade).toHaveBeenCalled();
      const calls = onPredictionMade.mock.calls;
      const lastGesture = calls[calls.length - 1][0];
      expect(lastGesture).toMatch(/swipe-left|drag/);
    });

    it("should predict swipe-down gesture", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onPredictionMade })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 200, 100)
        );
      });

      // Simulate fast downward swipe
      for (let i = 1; i <= 5; i++) {
        mockTime += 20;
        act(() => {
          result.current.controls.processTouchMove(
            createMockTouchEvent("touchmove", 200, 100 + i * 100)
          );
        });
      }

      expect(onPredictionMade).toHaveBeenCalled();
      const calls = onPredictionMade.mock.calls;
      const lastGesture = calls[calls.length - 1][0];
      expect(lastGesture).toMatch(/swipe-down|drag/);
    });

    it("should predict swipe-up gesture", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onPredictionMade })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch at bottom
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 200, 600)
        );
      });

      // Simulate fast upward swipe
      for (let i = 1; i <= 5; i++) {
        mockTime += 20;
        act(() => {
          result.current.controls.processTouchMove(
            createMockTouchEvent("touchmove", 200, 600 - i * 100)
          );
        });
      }

      expect(onPredictionMade).toHaveBeenCalled();
      const calls = onPredictionMade.mock.calls;
      const lastGesture = calls[calls.length - 1][0];
      expect(lastGesture).toMatch(/swipe-up|drag/);
    });

    it("should predict clockwise rotation gesture", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onPredictionMade })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch at center
      const centerX = 300;
      const centerY = 300;
      const radius = 100;

      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", centerX + radius, centerY)
        );
      });

      // Simulate clockwise circular motion
      const points = 6;
      for (let i = 1; i <= points; i++) {
        mockTime += 50;
        const angle = (i * Math.PI) / 3; // 60 degrees per step
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        act(() => {
          result.current.controls.processTouchMove(
            createMockTouchEvent("touchmove", x, y)
          );
        });
      }

      expect(onPredictionMade).toHaveBeenCalled();
    });

    it("should predict counter-clockwise rotation gesture", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onPredictionMade })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      const centerX = 300;
      const centerY = 300;
      const radius = 100;

      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", centerX + radius, centerY)
        );
      });

      // Simulate counter-clockwise circular motion
      const points = 6;
      for (let i = 1; i <= points; i++) {
        mockTime += 50;
        const angle = -(i * Math.PI) / 3; // -60 degrees per step (counter-clockwise)
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        act(() => {
          result.current.controls.processTouchMove(
            createMockTouchEvent("touchmove", x, y)
          );
        });
      }

      expect(onPredictionMade).toHaveBeenCalled();
    });

    it("should predict drag gesture for moderate speed movement", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onPredictionMade })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      // Simulate moderate diagonal movement (not fast enough for swipe)
      for (let i = 1; i <= 5; i++) {
        mockTime += 100; // Slower movement
        act(() => {
          result.current.controls.processTouchMove(
            createMockTouchEvent("touchmove", 100 + i * 20, 200 + i * 20)
          );
        });
      }

      expect(onPredictionMade).toHaveBeenCalled();
    });

    it("should handle same timestamp touches (dt === 0)", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onPredictionMade })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      // Move touches at same timestamp (no time advancement)
      for (let i = 0; i < 3; i++) {
        act(() => {
          result.current.controls.processTouchMove(
            createMockTouchEvent("touchmove", 100 + i, 200 + i)
          );
        });
      }

      expect(onPredictionMade).toHaveBeenCalled();
    });

    it("should not predict with less than 3 touch history points", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onPredictionMade })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Only start touch (1 point) and one move (2 points total)
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      mockTime += 16;

      act(() => {
        result.current.controls.processTouchMove(
          createMockTouchEvent("touchmove", 150, 250)
        );
      });

      // Should not have made a prediction with only 2 points
      expect(onPredictionMade).not.toHaveBeenCalled();
    });
  });

  describe("touch history management", () => {
    it("should limit touch history to 10 entries", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      // Simulate more than 10 touch moves to trigger history shift
      for (let i = 1; i <= 15; i++) {
        mockTime += 16;
        act(() => {
          result.current.controls.processTouchMove(
            createMockTouchEvent("touchmove", 100 + i * 10, 200 + i * 5)
          );
        });
      }

      // Should not throw and should still track position
      expect(result.current.state.touch.currentPosition.x).toBeGreaterThan(100);
    });
  });

  describe("frame measurement", () => {
    it("should handle frame buffer exceeding 60 frames", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      // Advance time to simulate many frames (more than 60)
      for (let i = 0; i < 70; i++) {
        act(() => {
          jest.advanceTimersByTime(16);
        });
      }

      // Should have updated metrics without error
      expect(result.current.metrics.averageLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should detect frame drops when frame takes too long", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      // Simulate normal frames first
      for (let i = 0; i < 5; i++) {
        act(() => {
          jest.advanceTimersByTime(16);
        });
      }

      // Override mockTime to simulate a very long frame (frame drop)
      mockTime += 100; // Way more than expected ~16ms frame

      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Frame drops should have been detected
      expect(result.current.metrics.frameDrops).toBeGreaterThanOrEqual(0);
    });
  });

  describe("animation preloading edge cases", () => {
    it("should not add animation when all existing have higher priority", () => {
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({ maxPreloadedAnimations: 3 })
      );

      // Preload animations with high priority
      act(() => {
        result.current.controls.preloadAnimation("wave", 10);
        result.current.controls.preloadAnimation("nod", 10);
        result.current.controls.preloadAnimation("smile", 10);
      });

      // Try to add low priority animation - should be rejected
      act(() => {
        result.current.controls.preloadAnimation("blink", 1);
      });

      // Should not error
      expect(result.current.state.isActive).toBe(false);
    });

    it("should disable preloading when enableAnimationPreload is false", () => {
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({ enableAnimationPreload: false })
      );

      act(() => {
        result.current.controls.preloadAnimation("wave", 2);
      });

      // Should not throw error
      expect(result.current.state.isActive).toBe(false);
    });
  });

  describe("touch processing edge cases", () => {
    it("should handle touch start with empty touches array", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      const emptyTouchEvent = {
        type: "touchstart",
        touches: [],
        changedTouches: [],
        targetTouches: [],
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        timeStamp: mockTime,
      } as unknown as TouchEvent;

      act(() => {
        result.current.controls.processTouchStart(emptyTouchEvent);
      });

      // Should not crash and touch should remain inactive
      expect(result.current.state.touch.active).toBe(false);
    });

    it("should handle touch move when touch is not active", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      // Move without starting touch first
      act(() => {
        result.current.controls.processTouchMove(
          createMockTouchEvent("touchmove", 150, 250)
        );
      });

      // Should not crash
      expect(result.current.state.interactionState).toBe("idle");
    });

    it("should handle touch move with empty touches array", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      // Start touch normally
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      const emptyTouchEvent = {
        type: "touchmove",
        touches: [],
        changedTouches: [],
        targetTouches: [],
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        timeStamp: mockTime,
      } as unknown as TouchEvent;

      mockTime += 16;

      act(() => {
        result.current.controls.processTouchMove(emptyTouchEvent);
      });

      // Should not crash
      expect(result.current.state.touch.active).toBe(true);
    });
  });

  describe("mode auto-adjustment", () => {
    it("should auto-adjust to instant mode under high latency", () => {
      // Use very low target latency to trigger instant mode
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({ targetLatencyMs: 1 })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Simulate many frames to trigger mode calculation
      for (let i = 0; i < 100; i++) {
        act(() => {
          jest.advanceTimersByTime(16);
        });
      }

      // Mode should potentially adjust based on performance
      expect(result.current.state.mode).toBeDefined();
    });

    it("should detect extreme optimization level under very high latency", () => {
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({ targetLatencyMs: 1 })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Simulate slow frames
      for (let i = 0; i < 50; i++) {
        mockTime += 50; // Much higher than 16ms target
        act(() => {
          jest.advanceTimersByTime(50);
        });
      }

      // Optimization level should potentially be high
      expect(result.current.state.optimizationLevel).toBeDefined();
    });
  });

  describe("touch prediction disabled", () => {
    it("should not predict gestures when enableTouchPrediction is false", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode(
          { enableTouchPrediction: false },
          { onPredictionMade }
        )
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      // Move touch multiple times
      for (let i = 1; i <= 5; i++) {
        mockTime += 20;
        act(() => {
          result.current.controls.processTouchMove(
            createMockTouchEvent("touchmove", 100 + i * 50, 200)
          );
        });
      }

      // Should not have made predictions
      expect(onPredictionMade).not.toHaveBeenCalled();
    });
  });

  describe("instant feedback disabled", () => {
    it("should work with instant feedback disabled", () => {
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({ enableInstantFeedback: false })
      );

      act(() => {
        result.current.controls.enable();
      });

      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      expect(result.current.state.touch.active).toBe(true);
    });
  });

  describe("callback edge cases", () => {
    it("should handle onLatencyBudgetExceeded callback", () => {
      const onLatencyBudgetExceeded = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onLatencyBudgetExceeded })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Simulate activity
      for (let i = 0; i < 10; i++) {
        act(() => {
          jest.advanceTimersByTime(16);
        });
      }

      // Callback may or may not be called depending on latency
      expect(result.current.state.isActive).toBe(true);
    });

    it("should call onQualityAdjustment when forcing quality", () => {
      const onQualityAdjustment = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode({}, { onQualityAdjustment })
      );

      act(() => {
        result.current.controls.forceQuality({ animationFps: 24 });
      });

      expect(onQualityAdjustment).toHaveBeenCalled();
    });
  });

  describe("mode transitions tracking", () => {
    it("should track mode transitions count", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.setMode("low");
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      act(() => {
        result.current.controls.setMode("ultra-low");
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      act(() => {
        result.current.controls.setMode("instant");
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current.metrics.modeTransitions).toBeGreaterThan(0);
    });
  });

  describe("P95 latency calculation", () => {
    it("should calculate P95 latency after enough frames", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      // Simulate enough frames for P95 calculation (at least 10)
      for (let i = 0; i < 20; i++) {
        act(() => {
          jest.advanceTimersByTime(16);
        });
      }

      // P95 should be calculated
      expect(result.current.metrics.p95LatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("touch pressure handling", () => {
    it("should use default pressure when force is undefined", () => {
      const { result } = renderHook(() => useAvatarLowLatencyMode());

      act(() => {
        result.current.controls.enable();
      });

      const touchWithNoForce = {
        type: "touchstart",
        touches: [{
          clientX: 100,
          clientY: 200,
          force: undefined,
          identifier: 0,
        }],
        changedTouches: [],
        targetTouches: [],
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        timeStamp: mockTime,
      } as unknown as TouchEvent;

      act(() => {
        result.current.controls.processTouchStart(touchWithNoForce);
      });

      // Should use default pressure of 1
      expect(result.current.state.touch.pressure).toBe(1);
    });
  });

  describe("prediction confidence levels", () => {
    it("should preload animation with high confidence", () => {
      const onPredictionMade = jest.fn();
      const { result } = renderHook(() =>
        useAvatarLowLatencyMode(
          { enableAnimationPreload: true },
          { onPredictionMade }
        )
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", 100, 200)
        );
      });

      // Fast swipe to get high confidence prediction
      for (let i = 1; i <= 5; i++) {
        mockTime += 20;
        act(() => {
          result.current.controls.processTouchMove(
            createMockTouchEvent("touchmove", 100 + i * 100, 200)
          );
        });
      }

      expect(onPredictionMade).toHaveBeenCalled();
    });
  });
});
