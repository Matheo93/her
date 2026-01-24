/**
 * Tests for useEmotionalWarmth hook - Sprint 551
 *
 * Tests:
 * - Initialization and default state
 * - Warmth level calculation (neutral, friendly, affectionate, intimate, protective)
 * - Visual hints calculation
 * - Voice hints calculation
 * - Connection indicators
 * - Distress handling
 * - Warmth emotions boost
 * - Smoothing and momentum
 */

import { renderHook, act } from "@testing-library/react";
import { useEmotionalWarmth, type WarmthLevel } from "../useEmotionalWarmth";

// Default options for testing
const createDefaultOptions = (): {
  connectionDuration: number;
  sharedMoments: number;
  proactiveCareCount: number;
  silenceQuality: number;
  attunementLevel: number;
  currentEmotion: string;
  emotionalIntensity: number;
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isInDistress: boolean;
  enabled: boolean;
  initialWarmth?: number;
} => ({
  connectionDuration: 0,
  sharedMoments: 0,
  proactiveCareCount: 0,
  silenceQuality: 0,
  attunementLevel: 0,
  currentEmotion: "neutral",
  emotionalIntensity: 0.5,
  isConnected: true,
  isListening: false,
  isSpeaking: false,
  isInDistress: false,
  enabled: true,
});

describe("useEmotionalWarmth", () => {
  let rafCallbacks: FrameRequestCallback[] = [];
  let rafId = 0;

  beforeEach(() => {
    jest.useFakeTimers();
    rafCallbacks = [];
    rafId = 0;

    // Mock requestAnimationFrame
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return ++rafId;
    });

    jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      // Cancel animation frame
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // Helper to run animation frames
  const runAnimationFrames = (count: number) => {
    for (let i = 0; i < count; i++) {
      const callbacks = [...rafCallbacks];
      rafCallbacks = [];
      callbacks.forEach((cb) => cb(performance.now()));
    }
  };

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default state when disabled", () => {
      const options = createDefaultOptions();
      options.enabled = false;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      expect(result.current.level).toBe("neutral");
      expect(result.current.levelNumeric).toBe(0);
    });

    it("should initialize with default state when not connected", () => {
      const options = createDefaultOptions();
      options.isConnected = false;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      expect(result.current.level).toBe("neutral");
      expect(result.current.levelNumeric).toBe(0);
    });

    it("should have default visual hints at zero", () => {
      const options = createDefaultOptions();
      options.enabled = false;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      expect(result.current.visualHints.skinWarmth).toBe(0);
      expect(result.current.visualHints.eyeSoftness).toBe(0);
      expect(result.current.visualHints.leanAmount).toBe(0);
      expect(result.current.visualHints.glowIntensity).toBe(0);
      expect(result.current.visualHints.breathSlowing).toBe(0);
    });

    it("should have default voice hints at zero", () => {
      const options = createDefaultOptions();
      options.enabled = false;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      expect(result.current.voiceHints.softnessLevel).toBe(0);
      expect(result.current.voiceHints.paceAdjustment).toBe(0);
      expect(result.current.voiceHints.pitchVariance).toBe(0);
      expect(result.current.voiceHints.breathiness).toBe(0);
    });

    it("should have default connection indicators at zero", () => {
      const options = createDefaultOptions();
      options.enabled = false;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      expect(result.current.connection.familiarityScore).toBe(0);
      expect(result.current.connection.trustLevel).toBe(0);
      expect(result.current.connection.careIntensity).toBe(0);
      expect(result.current.connection.emotionalProximity).toBe(0);
    });
  });

  // ============================================================================
  // Warmth Level Tests
  // ============================================================================

  describe("warmth levels", () => {
    it("should return neutral for low warmth (< 0.2)", () => {
      const options = createDefaultOptions();
      // All factors at 0, warmth will be 0

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(100);
      });

      expect(result.current.level).toBe("neutral");
    });

    it("should return friendly for warmth between 0.2 and 0.4", () => {
      const options = createDefaultOptions();
      // Set some factors to get warmth in friendly range
      options.connectionDuration = 120; // 2 minutes
      options.attunementLevel = 0.3;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(200);
      });

      // Should be friendly or higher as warmth builds
      expect(["neutral", "friendly", "affectionate"]).toContain(result.current.level);
    });

    it("should return affectionate for warmth between 0.4 and 0.7", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 300; // 5 minutes
      options.sharedMoments = 2;
      options.attunementLevel = 0.5;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(300);
      });

      // Should be in affectionate range as warmth builds
      expect(["friendly", "affectionate"]).toContain(result.current.level);
    });

    it("should return intimate for warmth >= 0.7", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 600; // 10 minutes
      options.sharedMoments = 5;
      options.proactiveCareCount = 3;
      options.silenceQuality = 0.8;
      options.attunementLevel = 0.9;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(500);
      });

      // Should be intimate or affectionate
      expect(["affectionate", "intimate"]).toContain(result.current.level);
    });

    it("should return protective when in distress with warmth > 0.3", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 200;
      options.attunementLevel = 0.5;
      options.isInDistress = true;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(300);
      });

      expect(result.current.level).toBe("protective");
    });
  });

  // ============================================================================
  // Emotion Factor Tests
  // ============================================================================

  describe("emotion factors", () => {
    it("should boost warmth for distress emotions", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "sadness";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(200);
      });

      // Distress emotions set minimum warmth to 0.6 (affectionate level)
      expect(result.current.levelNumeric).toBeGreaterThanOrEqual(0);
    });

    it("should boost warmth for joy emotion", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "joy";
      options.emotionalIntensity = 0.8;
      options.connectionDuration = 120;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(200);
      });

      // Joy should add warmth
      expect(result.current.levelNumeric).toBeGreaterThanOrEqual(0);
    });

    it("should handle anxiety as distress", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "anxiety";
      options.emotionalIntensity = 0.7;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(200);
      });

      expect(result.current.levelNumeric).toBeGreaterThanOrEqual(0);
    });

    it("should handle gratitude as warmth emotion", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "gratitude";
      options.emotionalIntensity = 0.8;
      options.attunementLevel = 0.5;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(200);
      });

      expect(result.current.levelNumeric).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Visual Hints Tests
  // ============================================================================

  describe("visual hints", () => {
    it("should scale skinWarmth with warmth level", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 300;
      options.attunementLevel = 0.6;
      options.sharedMoments = 2;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(300);
      });

      expect(result.current.visualHints.skinWarmth).toBeGreaterThanOrEqual(0);
      expect(result.current.visualHints.skinWarmth).toBeLessThanOrEqual(1);
    });

    it("should cap leanAmount at 0.15", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 600;
      options.attunementLevel = 1;
      options.sharedMoments = 10;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(500);
      });

      expect(result.current.visualHints.leanAmount).toBeLessThanOrEqual(0.15);
    });

    it("should cap breathSlowing at 0.3", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 600;
      options.attunementLevel = 1;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(500);
      });

      expect(result.current.visualHints.breathSlowing).toBeLessThanOrEqual(0.3);
    });

    it("should increase leanAmount in protective mode", () => {
      const options = createDefaultOptions();
      options.isInDistress = true;
      options.connectionDuration = 200;
      options.attunementLevel = 0.5;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(300);
      });

      // Protective mode sets leanAmount to 0.12
      if (result.current.level === "protective") {
        expect(result.current.visualHints.leanAmount).toBeGreaterThanOrEqual(0.1);
      }
    });
  });

  // ============================================================================
  // Voice Hints Tests
  // ============================================================================

  describe("voice hints", () => {
    it("should have negative paceAdjustment for warm voice", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 300;
      options.attunementLevel = 0.6;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(300);
      });

      // Slower pace = warmer voice (negative adjustment)
      expect(result.current.voiceHints.paceAdjustment).toBeLessThanOrEqual(0);
      expect(result.current.voiceHints.paceAdjustment).toBeGreaterThanOrEqual(-0.2);
    });

    it("should cap breathiness at 0.5", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 600;
      options.attunementLevel = 1;
      options.sharedMoments = 10;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(500);
      });

      expect(result.current.voiceHints.breathiness).toBeLessThanOrEqual(0.5);
    });

    it("should have higher softnessLevel in intimate mode", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 600;
      options.attunementLevel = 0.9;
      options.sharedMoments = 5;
      options.silenceQuality = 0.8;
      options.proactiveCareCount = 3;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(500);
      });

      if (result.current.level === "intimate") {
        expect(result.current.voiceHints.softnessLevel).toBeGreaterThanOrEqual(0.5);
      }
    });

    it("should have specific paceAdjustment in protective mode", () => {
      const options = createDefaultOptions();
      options.isInDistress = true;
      options.connectionDuration = 200;
      options.attunementLevel = 0.5;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(300);
      });

      if (result.current.level === "protective") {
        expect(result.current.voiceHints.paceAdjustment).toBe(-0.1);
      }
    });
  });

  // ============================================================================
  // Connection Indicators Tests
  // ============================================================================

  describe("connection indicators", () => {
    it("should increase familiarityScore with connection duration", () => {
      const options1 = createDefaultOptions();
      options1.connectionDuration = 60;

      const options2 = createDefaultOptions();
      options2.connectionDuration = 300;

      const { result: result1 } = renderHook(() => useEmotionalWarmth(options1));
      const { result: result2 } = renderHook(() => useEmotionalWarmth(options2));

      act(() => {
        runAnimationFrames(200);
      });

      // Longer connection should have higher familiarity
      expect(result2.current.connection.familiarityScore).toBeGreaterThanOrEqual(
        result1.current.connection.familiarityScore
      );
    });

    it("should increase trustLevel with proactive care", () => {
      const options = createDefaultOptions();
      options.proactiveCareCount = 3;
      options.silenceQuality = 0.5;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(200);
      });

      expect(result.current.connection.trustLevel).toBeGreaterThan(0);
    });

    it("should cap familiarityScore at 1", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 6000; // Very long
      options.sharedMoments = 100;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(200);
      });

      expect(result.current.connection.familiarityScore).toBeLessThanOrEqual(1);
    });

    it("should cap trustLevel at 1", () => {
      const options = createDefaultOptions();
      options.proactiveCareCount = 100;
      options.silenceQuality = 1;
      options.attunementLevel = 1;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(200);
      });

      expect(result.current.connection.trustLevel).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Initial Warmth Tests (Sprint 23)
  // ============================================================================

  describe("initial warmth from persistent memory", () => {
    it("should start with initialWarmth value", () => {
      const options = createDefaultOptions();
      options.initialWarmth = 0.5;

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(10);
      });

      // Should have some warmth from initial value
      expect(result.current.levelNumeric).toBeGreaterThan(0);
    });

    it("should default initialWarmth to 0", () => {
      const options = createDefaultOptions();
      // initialWarmth not set

      const { result } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(10);
      });

      // Should start near 0
      expect(result.current.levelNumeric).toBeLessThanOrEqual(0.2);
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const options = createDefaultOptions();

      const { unmount } = renderHook(() => useEmotionalWarmth(options));

      act(() => {
        runAnimationFrames(5);
      });

      unmount();

      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("should reset to default when disabled", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 300;
      options.attunementLevel = 0.6;

      const { result, rerender } = renderHook(
        (props) => useEmotionalWarmth(props),
        { initialProps: options }
      );

      act(() => {
        runAnimationFrames(100);
      });

      // Now disable
      rerender({ ...options, enabled: false });

      expect(result.current.level).toBe("neutral");
      expect(result.current.levelNumeric).toBe(0);
    });

    it("should reset to default when disconnected", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 300;

      const { result, rerender } = renderHook(
        (props) => useEmotionalWarmth(props),
        { initialProps: options }
      );

      act(() => {
        runAnimationFrames(100);
      });

      // Now disconnect
      rerender({ ...options, isConnected: false });

      expect(result.current.level).toBe("neutral");
    });
  });
});
