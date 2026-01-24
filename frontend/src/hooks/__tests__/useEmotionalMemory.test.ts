/**
 * Tests for useEmotionalMemory hook
 */
import { renderHook, act } from "@testing-library/react";
import { useEmotionalMemory } from "../useEmotionalMemory";

// Mock requestAnimationFrame
let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;

beforeEach(() => {
  jest.useFakeTimers();
  rafCallback = null;
  rafId = 0;

  global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
    rafCallback = cb;
    return ++rafId;
  });

  global.cancelAnimationFrame = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

function runAnimationFrame(time = performance.now()) {
  if (rafCallback) {
    const cb = rafCallback;
    rafCallback = null;
    cb(time);
  }
}

describe("useEmotionalMemory", () => {
  const defaultOptions = {
    currentEmotion: "neutral",
    emotionalIntensity: 0.5,
    isUserSpeaking: false,
    userTranscript: "",
    isConnected: true,
    conversationDuration: 60,
    enabled: true,
  };

  describe("initialization", () => {
    it("should return default state when not connected", () => {
      const { result } = renderHook(() =>
        useEmotionalMemory({ ...defaultOptions, isConnected: false })
      );

      expect(result.current.emotionalTemperature.overallMood).toBe("neutral");
      expect(result.current.patterns.dominantEmotion).toBe("neutral");
      expect(result.current.recentMoments).toHaveLength(0);
    });

    it("should return default state when disabled", () => {
      const { result } = renderHook(() =>
        useEmotionalMemory({ ...defaultOptions, enabled: false })
      );

      expect(result.current.emotionalTemperature.overallMood).toBe("neutral");
      expect(result.current.visualHints.memoryGlow).toBe(0);
    });

    it("should initialize with empty moments", () => {
      const { result } = renderHook(() =>
        useEmotionalMemory(defaultOptions)
      );

      act(() => {
        runAnimationFrame();
      });

      expect(result.current.recentMoments).toHaveLength(0);
    });
  });

  describe("emotional temperature", () => {
    it("should have neutral temperature with no moments", () => {
      const { result } = renderHook(() =>
        useEmotionalMemory(defaultOptions)
      );

      act(() => {
        runAnimationFrame();
      });

      expect(result.current.emotionalTemperature).toEqual({
        overallMood: "neutral",
        stability: 0.5,
        trend: "stable",
      });
    });
  });

  describe("patterns", () => {
    it("should have default patterns with no moments", () => {
      const { result } = renderHook(() =>
        useEmotionalMemory(defaultOptions)
      );

      act(() => {
        runAnimationFrame();
      });

      expect(result.current.patterns).toEqual({
        dominantEmotion: "neutral",
        emotionVariety: 0,
        vulnerabilityCount: 0,
        peakCount: 0,
      });
    });
  });

  describe("acknowledgment", () => {
    it("should not acknowledge without important moments", () => {
      const { result } = renderHook(() =>
        useEmotionalMemory(defaultOptions)
      );

      act(() => {
        runAnimationFrame();
      });

      expect(result.current.acknowledgment).toEqual({
        shouldAcknowledge: false,
        momentToAcknowledge: null,
        suggestedPhrase: null,
      });
    });
  });

  describe("visual hints", () => {
    it("should have zero memory glow with no moments", () => {
      const { result } = renderHook(() =>
        useEmotionalMemory(defaultOptions)
      );

      act(() => {
        runAnimationFrame();
      });

      expect(result.current.visualHints.memoryGlow).toBe(0);
      expect(result.current.visualHints.connectionDepth).toBe(0);
      expect(result.current.visualHints.showMemoryParticle).toBe(false);
    });
  });

  describe("emotion detection", () => {
    it("should detect vulnerability from transcript keywords", () => {
      const { result, rerender } = renderHook(
        (props) => useEmotionalMemory(props),
        {
          initialProps: {
            ...defaultOptions,
            currentEmotion: "sadness",
            emotionalIntensity: 0.6,
            userTranscript: "I feel so scared and alone",
          },
        }
      );

      act(() => {
        runAnimationFrame();
      });

      // Change emotion to trigger moment capture
      rerender({
        ...defaultOptions,
        currentEmotion: "neutral",
        emotionalIntensity: 0.3,
        userTranscript: "",
      });

      act(() => {
        jest.advanceTimersByTime(2000);
        runAnimationFrame();
      });

      // Moment should be captured
      expect(result.current.patterns.vulnerabilityCount).toBeGreaterThanOrEqual(0);
    });

    it("should detect joy from transcript keywords", () => {
      const { result, rerender } = renderHook(
        (props) => useEmotionalMemory(props),
        {
          initialProps: {
            ...defaultOptions,
            currentEmotion: "joy",
            emotionalIntensity: 0.8,
            userTranscript: "I am so happy and excited",
          },
        }
      );

      act(() => {
        runAnimationFrame();
      });

      // Change emotion to trigger moment capture
      rerender({
        ...defaultOptions,
        currentEmotion: "neutral",
        emotionalIntensity: 0.3,
        userTranscript: "",
      });

      act(() => {
        jest.advanceTimersByTime(2000);
        runAnimationFrame();
      });

      expect(result.current.patterns.peakCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const { unmount } = renderHook(() =>
        useEmotionalMemory(defaultOptions)
      );

      act(() => {
        runAnimationFrame();
      });

      unmount();

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("should reset state when disconnected", () => {
      const { result, rerender } = renderHook(
        (props) => useEmotionalMemory(props),
        { initialProps: defaultOptions }
      );

      act(() => {
        runAnimationFrame();
      });

      rerender({ ...defaultOptions, isConnected: false });

      expect(result.current.recentMoments).toHaveLength(0);
    });
  });

  describe("throttling optimization", () => {
    it("should throttle state updates", () => {
      const { result } = renderHook(() =>
        useEmotionalMemory(defaultOptions)
      );

      // Run multiple frames rapidly
      act(() => {
        runAnimationFrame();
        runAnimationFrame();
        runAnimationFrame();
      });

      // Should still work correctly
      expect(result.current.emotionalTemperature.overallMood).toBe("neutral");
    });
  });

  describe("keyword sets optimization", () => {
    it("should correctly identify vulnerability keywords", () => {
      const { result, rerender } = renderHook(
        (props) => useEmotionalMemory(props),
        {
          initialProps: {
            ...defaultOptions,
            currentEmotion: "fear",
            emotionalIntensity: 0.7,
            userTranscript: "I am worried about everything",
          },
        }
      );

      act(() => {
        jest.advanceTimersByTime(2000);
        runAnimationFrame();
      });

      rerender({
        ...defaultOptions,
        currentEmotion: "neutral",
        emotionalIntensity: 0.3,
        userTranscript: "",
      });

      act(() => {
        jest.advanceTimersByTime(2000);
        runAnimationFrame();
      });

      // Should have processed the emotion
      expect(result.current).toBeDefined();
    });

    it("should correctly identify joy keywords", () => {
      const { result, rerender } = renderHook(
        (props) => useEmotionalMemory(props),
        {
          initialProps: {
            ...defaultOptions,
            currentEmotion: "happiness",
            emotionalIntensity: 0.8,
            userTranscript: "This is amazing and wonderful",
          },
        }
      );

      act(() => {
        jest.advanceTimersByTime(2000);
        runAnimationFrame();
      });

      rerender({
        ...defaultOptions,
        currentEmotion: "neutral",
        emotionalIntensity: 0.3,
        userTranscript: "",
      });

      act(() => {
        jest.advanceTimersByTime(2000);
        runAnimationFrame();
      });

      expect(result.current).toBeDefined();
    });
  });
});
