/**
 * Tests for useAudioSmoothing hook - Sprint 555
 *
 * Tests:
 * - Initialization and default state
 * - Level smoothing with attack/release
 * - Peak hold and decay
 * - Reset functionality
 * - Minimum threshold
 * - Utility functions (toDecibels, fromDecibels, perceptualScale)
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAudioSmoothing,
  toDecibels,
  fromDecibels,
  perceptualScale,
} from "../useAudioSmoothing";

describe("useAudioSmoothing", () => {
  let rafCallbacks: FrameRequestCallback[] = [];
  let rafId = 0;
  let mockNow = 0;

  beforeEach(() => {
    jest.useFakeTimers();
    rafCallbacks = [];
    rafId = 0;
    mockNow = 1000;

    jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return ++rafId;
    });

    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    jest.spyOn(Date, "now").mockImplementation(() => mockNow);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // Helper to run animation frames
  const runAnimationFrames = (count: number, advanceMs: number = 16) => {
    for (let i = 0; i < count; i++) {
      mockNow += advanceMs;
      const callbacks = [...rafCallbacks];
      rafCallbacks = [];
      callbacks.forEach((cb) => cb(mockNow));
    }
  };

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with zero levels", () => {
      const { result } = renderHook(() => useAudioSmoothing());

      expect(result.current.smoothedLevel).toBe(0);
      expect(result.current.peakLevel).toBe(0);
      expect(result.current.isActive).toBe(false);
    });

    it("should provide updateLevel function", () => {
      const { result } = renderHook(() => useAudioSmoothing());

      expect(typeof result.current.updateLevel).toBe("function");
    });

    it("should provide reset function", () => {
      const { result } = renderHook(() => useAudioSmoothing());

      expect(typeof result.current.reset).toBe("function");
    });
  });

  // ============================================================================
  // Level Update Tests
  // ============================================================================

  describe("level updates", () => {
    it("should respond to level changes", () => {
      const { result } = renderHook(() => useAudioSmoothing());

      act(() => {
        result.current.updateLevel(0.5);
      });

      act(() => {
        runAnimationFrames(50);
      });

      expect(result.current.smoothedLevel).toBeGreaterThan(0);
    });

    it("should clamp level to 0-1 range", () => {
      const { result } = renderHook(() => useAudioSmoothing());

      act(() => {
        result.current.updateLevel(1.5); // Above 1
      });

      act(() => {
        runAnimationFrames(100);
      });

      expect(result.current.smoothedLevel).toBeLessThanOrEqual(1);

      act(() => {
        result.current.updateLevel(-0.5); // Below 0
      });

      act(() => {
        runAnimationFrames(200);
      });

      expect(result.current.smoothedLevel).toBeGreaterThanOrEqual(0);
    });

    it("should decay when level drops", () => {
      const { result } = renderHook(() => useAudioSmoothing());

      // Raise level
      act(() => {
        result.current.updateLevel(0.8);
      });

      act(() => {
        runAnimationFrames(50);
      });

      const highLevel = result.current.smoothedLevel;

      // Drop level
      act(() => {
        result.current.updateLevel(0);
      });

      act(() => {
        runAnimationFrames(100);
      });

      expect(result.current.smoothedLevel).toBeLessThan(highLevel);
    });
  });

  // ============================================================================
  // Peak Level Tests
  // ============================================================================

  describe("peak level", () => {
    it("should track peak level", () => {
      const { result } = renderHook(() => useAudioSmoothing());

      act(() => {
        result.current.updateLevel(0.8);
      });

      act(() => {
        runAnimationFrames(30);
      });

      expect(result.current.peakLevel).toBeGreaterThan(0);
    });

    it("should hold peak for configured time", () => {
      const { result } = renderHook(() =>
        useAudioSmoothing({ peakHoldTime: 500 })
      );

      // Create a peak
      act(() => {
        result.current.updateLevel(0.8);
      });

      act(() => {
        runAnimationFrames(30);
      });

      const peak = result.current.peakLevel;

      // Drop level
      act(() => {
        result.current.updateLevel(0.2);
      });

      // Peak should hold for a while
      act(() => {
        runAnimationFrames(10, 20);
      });

      expect(result.current.peakLevel).toBeGreaterThanOrEqual(peak * 0.8);
    });

    it("should decay peak after hold time", () => {
      const { result } = renderHook(() =>
        useAudioSmoothing({ peakHoldTime: 100, peakDecayTime: 200 })
      );

      // Create a peak
      act(() => {
        result.current.updateLevel(0.8);
      });

      act(() => {
        runAnimationFrames(20);
      });

      // Drop level
      act(() => {
        result.current.updateLevel(0);
      });

      // Wait for hold time plus decay
      act(() => {
        runAnimationFrames(100, 20);
      });

      // Peak should have decayed
      expect(result.current.peakLevel).toBeLessThan(0.5);
    });
  });

  // ============================================================================
  // Active State Tests
  // ============================================================================

  describe("active state", () => {
    it("should be active when level is above threshold", () => {
      const { result } = renderHook(() =>
        useAudioSmoothing({ minLevel: 0.01 })
      );

      act(() => {
        result.current.updateLevel(0.5);
      });

      act(() => {
        runAnimationFrames(50);
      });

      expect(result.current.isActive).toBe(true);
    });

    it("should be inactive when level is below threshold", () => {
      const { result } = renderHook(() =>
        useAudioSmoothing({ minLevel: 0.1 })
      );

      act(() => {
        result.current.updateLevel(0.05); // Below minLevel
      });

      act(() => {
        runAnimationFrames(100);
      });

      expect(result.current.isActive).toBe(false);
    });
  });

  // ============================================================================
  // Reset Tests
  // ============================================================================

  describe("reset", () => {
    it("should reset all levels to zero", () => {
      const { result } = renderHook(() => useAudioSmoothing());

      // Set some level
      act(() => {
        result.current.updateLevel(0.8);
      });

      act(() => {
        runAnimationFrames(50);
      });

      expect(result.current.smoothedLevel).toBeGreaterThan(0);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.smoothedLevel).toBe(0);
      expect(result.current.peakLevel).toBe(0);
      expect(result.current.isActive).toBe(false);
    });
  });

  // ============================================================================
  // Custom Config Tests
  // ============================================================================

  describe("custom config", () => {
    it("should respect custom attack time", () => {
      const fastAttack = renderHook(() => useAudioSmoothing({ attackTime: 5 }));
      const slowAttack = renderHook(() => useAudioSmoothing({ attackTime: 100 }));

      act(() => {
        fastAttack.result.current.updateLevel(1.0);
        slowAttack.result.current.updateLevel(1.0);
      });

      act(() => {
        runAnimationFrames(10);
      });

      // Fast attack should reach higher level
      expect(fastAttack.result.current.smoothedLevel).toBeGreaterThanOrEqual(
        slowAttack.result.current.smoothedLevel
      );
    });

    it("should respect custom release time", () => {
      const fastRelease = renderHook(() => useAudioSmoothing({ releaseTime: 50 }));
      const slowRelease = renderHook(() => useAudioSmoothing({ releaseTime: 500 }));

      // Raise levels
      act(() => {
        fastRelease.result.current.updateLevel(1.0);
        slowRelease.result.current.updateLevel(1.0);
      });

      act(() => {
        runAnimationFrames(30);
      });

      // Drop levels
      act(() => {
        fastRelease.result.current.updateLevel(0);
        slowRelease.result.current.updateLevel(0);
      });

      act(() => {
        runAnimationFrames(20);
      });

      // Slow release should have higher level
      expect(slowRelease.result.current.smoothedLevel).toBeGreaterThanOrEqual(
        fastRelease.result.current.smoothedLevel
      );
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const { unmount } = renderHook(() => useAudioSmoothing());

      act(() => {
        runAnimationFrames(5);
      });

      unmount();

      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("toDecibels", () => {
  it("should convert linear to decibels", () => {
    expect(toDecibels(1.0)).toBeCloseTo(0);
    expect(toDecibels(0.1)).toBeCloseTo(-20);
    expect(toDecibels(0.01)).toBeCloseTo(-40);
  });

  it("should return floor for zero input", () => {
    expect(toDecibels(0)).toBe(-60);
    expect(toDecibels(0, -80)).toBe(-80);
  });

  it("should respect custom floor", () => {
    expect(toDecibels(0.00001, -100)).toBeCloseTo(-100);
  });

  it("should return floor for negative input", () => {
    expect(toDecibels(-0.5)).toBe(-60);
  });
});

describe("fromDecibels", () => {
  it("should convert decibels to linear", () => {
    expect(fromDecibels(0)).toBeCloseTo(1.0);
    expect(fromDecibels(-20)).toBeCloseTo(0.1);
    expect(fromDecibels(-40)).toBeCloseTo(0.01);
  });

  it("should handle negative decibels", () => {
    expect(fromDecibels(-6)).toBeCloseTo(0.501, 1);
  });
});

describe("perceptualScale", () => {
  it("should apply gamma scaling", () => {
    // Default gamma = 0.5
    expect(perceptualScale(0.25)).toBeCloseTo(0.5);
    expect(perceptualScale(1.0)).toBeCloseTo(1.0);
    expect(perceptualScale(0)).toBeCloseTo(0);
  });

  it("should respect custom gamma", () => {
    // gamma = 1 should be linear
    expect(perceptualScale(0.5, 1)).toBeCloseTo(0.5);

    // gamma < 1 expands low values
    expect(perceptualScale(0.25, 0.5)).toBeCloseTo(0.5);

    // gamma > 1 compresses low values
    expect(perceptualScale(0.25, 2)).toBeCloseTo(0.0625);
  });

  it("should clamp input to 0-1", () => {
    expect(perceptualScale(1.5)).toBe(1);
    expect(perceptualScale(-0.5)).toBe(0);
  });
});
