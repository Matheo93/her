/**
 * Tests for useTouchFeedbackOptimizer hook - Sprint 540
 *
 * Tests touch feedback optimization including:
 * - Haptic feedback patterns
 * - Visual ripple effects
 * - Battery-aware haptic intensity
 * - Touch area registration
 * - Metrics tracking
 */

import { renderHook, act } from "@testing-library/react";
import {
  useTouchFeedbackOptimizer,
  useHapticFeedback,
  useTouchRipple,
} from "../useTouchFeedbackOptimizer";

// Mock navigator.vibrate
const mockVibrate = jest.fn().mockReturnValue(true);
Object.defineProperty(navigator, "vibrate", {
  value: mockVibrate,
  writable: true,
  configurable: true,
});

// Mock Battery API
const mockBattery = {
  level: 0.8,
  charging: true,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

Object.defineProperty(navigator, "getBattery", {
  value: jest.fn().mockResolvedValue(mockBattery),
  writable: true,
  configurable: true,
});

describe("useTouchFeedbackOptimizer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Date, "now").mockReturnValue(1000);
    mockVibrate.mockClear();
    mockBattery.level = 0.8;
    mockBattery.charging = true;
    mockBattery.addEventListener.mockClear();
    mockBattery.removeEventListener.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      expect(result.current.config.enabled).toBe(true);
      expect(result.current.config.hapticEnabled).toBe(true);
      expect(result.current.config.visualEnabled).toBe(true);
      expect(result.current.config.hapticIntensity).toBe(0.7);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useTouchFeedbackOptimizer({
          hapticEnabled: false,
          hapticIntensity: 0.5,
        })
      );

      expect(result.current.config.hapticEnabled).toBe(false);
      expect(result.current.config.hapticIntensity).toBe(0.5);
    });

    it("should initialize with empty state", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.lastTouch).toBeNull();
      expect(result.current.state.activeRipples).toEqual([]);
      expect(result.current.state.currentPattern).toBeNull();
    });

    it("should initialize with zero metrics", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      expect(result.current.metrics.totalFeedbacks).toBe(0);
      expect(result.current.metrics.hapticCount).toBe(0);
      expect(result.current.metrics.visualCount).toBe(0);
      expect(result.current.metrics.missedFeedbacks).toBe(0);
    });

    it("should provide control functions", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      expect(typeof result.current.controls.trigger).toBe("function");
      expect(typeof result.current.controls.triggerRipple).toBe("function");
      expect(typeof result.current.controls.cancelRipple).toBe("function");
      expect(typeof result.current.controls.clearAllRipples).toBe("function");
      expect(typeof result.current.controls.setHapticIntensity).toBe("function");
      expect(typeof result.current.controls.registerTouchArea).toBe("function");
    });

    it("should detect haptic support", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      // navigator.vibrate is mocked, so should be supported
      expect(result.current.state.hapticSupported).toBe(true);
    });
  });

  // ============================================================================
  // Haptic Feedback Tests
  // ============================================================================

  describe("haptic feedback", () => {
    it("should trigger haptic feedback with pattern", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger("light_tap", undefined, "haptic");
      });

      expect(mockVibrate).toHaveBeenCalled();
      expect(result.current.metrics.hapticCount).toBe(1);
    });

    it("should trigger medium tap pattern", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger("medium_tap", undefined, "haptic");
      });

      expect(mockVibrate).toHaveBeenCalled();
    });

    it("should trigger heavy tap pattern", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger("heavy_tap", undefined, "haptic");
      });

      expect(mockVibrate).toHaveBeenCalled();
    });

    it("should trigger double tap pattern", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger("double_tap", undefined, "haptic");
      });

      expect(mockVibrate).toHaveBeenCalled();
    });

    it("should trigger success pattern", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger("success", undefined, "haptic");
      });

      expect(mockVibrate).toHaveBeenCalled();
    });

    it("should trigger error pattern", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger("error", undefined, "haptic");
      });

      expect(mockVibrate).toHaveBeenCalled();
    });

    it("should not trigger haptic when disabled", () => {
      const { result } = renderHook(() =>
        useTouchFeedbackOptimizer({ hapticEnabled: false })
      );

      act(() => {
        result.current.controls.trigger("medium_tap", undefined, "haptic");
      });

      expect(mockVibrate).not.toHaveBeenCalled();
    });

    it("should update current pattern on haptic trigger", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger("success", undefined, "haptic");
      });

      expect(result.current.state.currentPattern).toBe("success");
    });

    it("should set haptic intensity", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.setHapticIntensity(0.5);
      });

      expect(result.current.config.hapticIntensity).toBe(0.5);
    });

    it("should clamp haptic intensity between 0 and 1", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.setHapticIntensity(1.5);
      });
      expect(result.current.config.hapticIntensity).toBe(1);

      act(() => {
        result.current.controls.setHapticIntensity(-0.5);
      });
      expect(result.current.config.hapticIntensity).toBe(0);
    });

    it("should check haptic support", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      const isSupported = result.current.controls.checkHapticSupport();
      expect(isSupported).toBe(true);
    });
  });

  // ============================================================================
  // Visual Ripple Tests
  // ============================================================================

  describe("visual ripple", () => {
    it("should trigger ripple effect", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.triggerRipple(100, 200);
      });

      expect(result.current.state.activeRipples.length).toBe(1);
      expect(result.current.state.activeRipples[0].x).toBe(100);
      expect(result.current.state.activeRipples[0].y).toBe(200);
    });

    it("should not trigger ripple when visual disabled", () => {
      const { result } = renderHook(() =>
        useTouchFeedbackOptimizer({ visualEnabled: false })
      );

      act(() => {
        result.current.controls.triggerRipple(100, 200);
      });

      expect(result.current.state.activeRipples.length).toBe(0);
    });

    it("should auto-remove ripple after duration", () => {
      const { result } = renderHook(() =>
        useTouchFeedbackOptimizer({ rippleDuration: 400 })
      );

      act(() => {
        result.current.controls.triggerRipple(100, 200);
      });

      expect(result.current.state.activeRipples.length).toBe(1);

      // Advance past ripple duration
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current.state.activeRipples.length).toBe(0);
    });

    it("should cancel specific ripple", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.triggerRipple(100, 200);
      });

      const rippleId = result.current.state.activeRipples[0].id;

      act(() => {
        result.current.controls.cancelRipple(rippleId);
      });

      expect(result.current.state.activeRipples.length).toBe(0);
    });

    it("should clear all ripples", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.triggerRipple(100, 200);
        result.current.controls.triggerRipple(150, 250);
        result.current.controls.triggerRipple(200, 300);
      });

      expect(result.current.state.activeRipples.length).toBe(3);

      act(() => {
        result.current.controls.clearAllRipples();
      });

      expect(result.current.state.activeRipples.length).toBe(0);
    });

    it("should accept custom ripple options", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.triggerRipple(100, 200, {
          duration: 600,
          maxRadius: 200,
          color: "red",
          opacity: 0.8,
        });
      });

      expect(result.current.state.activeRipples[0].duration).toBe(600);
      expect(result.current.state.activeRipples[0].maxRadius).toBe(200);
      expect(result.current.state.activeRipples[0].color).toBe("red");
      expect(result.current.state.activeRipples[0].opacity).toBe(0.8);
    });

    it("should track visual count in metrics", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.triggerRipple(100, 200);
        result.current.controls.triggerRipple(150, 250);
      });

      expect(result.current.metrics.visualCount).toBe(2);
    });
  });

  // ============================================================================
  // Combined Feedback Tests
  // ============================================================================

  describe("combined feedback", () => {
    it("should trigger both haptic and visual with combined type", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger(
          "medium_tap",
          { x: 100, y: 200, timestamp: 1000 },
          "combined"
        );
      });

      expect(mockVibrate).toHaveBeenCalled();
      expect(result.current.state.activeRipples.length).toBe(1);
    });

    it("should default to combined feedback type", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger("medium_tap", {
          x: 100,
          y: 200,
          timestamp: 1000,
        });
      });

      expect(mockVibrate).toHaveBeenCalled();
      expect(result.current.state.activeRipples.length).toBe(1);
    });

    it("should track total feedbacks", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger("light_tap");
        result.current.controls.trigger("medium_tap");
        result.current.controls.trigger("heavy_tap");
      });

      expect(result.current.metrics.totalFeedbacks).toBe(3);
    });

    it("should not trigger when disabled", () => {
      const { result } = renderHook(() =>
        useTouchFeedbackOptimizer({ enabled: false })
      );

      act(() => {
        result.current.controls.trigger("medium_tap", {
          x: 100,
          y: 200,
          timestamp: 1000,
        });
      });

      expect(mockVibrate).not.toHaveBeenCalled();
      expect(result.current.state.activeRipples.length).toBe(0);
    });
  });

  // ============================================================================
  // Touch Point Tests
  // ============================================================================

  describe("touch point", () => {
    it("should update last touch on trigger", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      const touchPoint = {
        x: 150,
        y: 250,
        timestamp: 1000,
        force: 0.5,
      };

      act(() => {
        result.current.controls.trigger("medium_tap", touchPoint);
      });

      expect(result.current.state.lastTouch).toEqual(touchPoint);
    });

    it("should set active state on trigger", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger("medium_tap");
      });

      expect(result.current.state.isActive).toBe(true);

      // Should reset after timeout
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.state.isActive).toBe(false);
    });
  });

  // ============================================================================
  // Config Tests
  // ============================================================================

  describe("configuration", () => {
    it("should update config", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.updateConfig({
          hapticEnabled: false,
          rippleDuration: 600,
        });
      });

      expect(result.current.config.hapticEnabled).toBe(false);
      expect(result.current.config.rippleDuration).toBe(600);
    });

    it("should use default ripple color", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      expect(result.current.config.rippleColor).toBe("rgba(255, 255, 255, 0.3)");
    });

    it("should use custom ripple settings", () => {
      const { result } = renderHook(() =>
        useTouchFeedbackOptimizer({
          rippleColor: "rgba(0, 0, 255, 0.5)",
          rippleMaxRadius: 200,
          rippleOpacity: 0.8,
        })
      );

      expect(result.current.config.rippleColor).toBe("rgba(0, 0, 255, 0.5)");
      expect(result.current.config.rippleMaxRadius).toBe(200);
      expect(result.current.config.rippleOpacity).toBe(0.8);
    });
  });

  // ============================================================================
  // Metrics Tests
  // ============================================================================

  describe("metrics", () => {
    it("should track average latency", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      // Trigger with different timestamps
      (Date.now as jest.Mock).mockReturnValue(1000);
      act(() => {
        result.current.controls.trigger("medium_tap", {
          x: 100,
          y: 200,
          timestamp: 990,
        });
      });

      expect(result.current.metrics.averageLatency).toBeGreaterThanOrEqual(0);
    });

    it("should track missed feedbacks on error", () => {
      // Mock vibrate to throw
      mockVibrate.mockImplementationOnce(() => {
        throw new Error("Vibration failed");
      });

      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      act(() => {
        result.current.controls.trigger("medium_tap", undefined, "haptic");
      });

      expect(result.current.metrics.missedFeedbacks).toBe(1);
    });
  });

  // ============================================================================
  // Touch Area Registration Tests
  // ============================================================================

  describe("touch area registration", () => {
    it("should register touch area", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      const element = document.createElement("div");
      let unregister: (() => void) | undefined;

      act(() => {
        unregister = result.current.controls.registerTouchArea(
          element,
          "medium_tap"
        );
      });

      expect(typeof unregister).toBe("function");
    });

    it("should unregister touch area on cleanup", () => {
      const { result } = renderHook(() => useTouchFeedbackOptimizer());

      const element = document.createElement("div");
      const removeEventListenerSpy = jest.spyOn(element, "removeEventListener");

      let unregister: (() => void) | undefined;

      act(() => {
        unregister = result.current.controls.registerTouchArea(
          element,
          "medium_tap"
        );
      });

      act(() => {
        unregister?.();
      });

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "touchstart",
        expect.any(Function)
      );
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useTouchFeedbackOptimizer());
      unmount();
    });
  });
});

// ============================================================================
// Sub-Hooks Tests
// ============================================================================

describe("useHapticFeedback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockVibrate.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should provide simple haptic trigger", () => {
    const { result } = renderHook(() => useHapticFeedback());

    expect(typeof result.current.trigger).toBe("function");
    expect(typeof result.current.isSupported).toBe("boolean");
  });

  it("should trigger haptic only", () => {
    const { result } = renderHook(() => useHapticFeedback());

    act(() => {
      result.current.trigger("success");
    });

    expect(mockVibrate).toHaveBeenCalled();
  });

  it("should report haptic support", () => {
    const { result } = renderHook(() => useHapticFeedback());

    expect(result.current.isSupported).toBe(true);
  });
});

describe("useTouchRipple", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should provide ripple controls", () => {
    const { result } = renderHook(() => useTouchRipple());

    expect(Array.isArray(result.current.ripples)).toBe(true);
    expect(typeof result.current.trigger).toBe("function");
    expect(typeof result.current.clear).toBe("function");
  });

  it("should trigger ripple", () => {
    const { result } = renderHook(() => useTouchRipple());

    act(() => {
      result.current.trigger(100, 200);
    });

    expect(result.current.ripples.length).toBe(1);
  });

  it("should clear ripples", () => {
    const { result } = renderHook(() => useTouchRipple());

    act(() => {
      result.current.trigger(100, 200);
      result.current.trigger(150, 250);
    });

    expect(result.current.ripples.length).toBe(2);

    act(() => {
      result.current.clear();
    });

    expect(result.current.ripples.length).toBe(0);
  });
});
