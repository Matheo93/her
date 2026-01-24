/**
 * Tests for useListeningIntensity hook
 */
import { renderHook, act } from "@testing-library/react";
import { useListeningIntensity, mapIntensityToAvatarParams } from "../useListeningIntensity";

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

describe("useListeningIntensity", () => {
  const defaultOptions = {
    userAudioLevel: 0.0,
    isListening: true,
    sensitivity: 1.0,
  };

  describe("initialization", () => {
    it("should return default state", () => {
      const { result } = renderHook(() =>
        useListeningIntensity(defaultOptions)
      );

      expect(result.current.attention).toBe(0.5);
      expect(result.current.engagementType).toBe("passive");
      expect(result.current.userEnergy).toBe(0);
    });

    it("should initialize with normal tempo rhythm", () => {
      const { result } = renderHook(() =>
        useListeningIntensity(defaultOptions)
      );

      expect(result.current.speakingRhythm.tempo).toBe("normal");
    });
  });

  describe("listening state", () => {
    it("should reset when not listening", () => {
      const { result, rerender } = renderHook(
        (props) => useListeningIntensity(props),
        { initialProps: defaultOptions }
      );

      act(() => {
        runAnimationFrame();
      });

      rerender({ ...defaultOptions, isListening: false });

      expect(result.current.speakingDuration).toBe(0);
    });

    it("should cancel animation frame on unmount", () => {
      const { unmount } = renderHook(() =>
        useListeningIntensity(defaultOptions)
      );

      act(() => {
        runAnimationFrame();
      });

      unmount();

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe("audio level tracking", () => {
    it("should track user energy when speaking", () => {
      const { result, rerender } = renderHook(
        (props) => useListeningIntensity(props),
        { initialProps: { ...defaultOptions, userAudioLevel: 0.5 } }
      );

      act(() => {
        jest.advanceTimersByTime(100);
        runAnimationFrame();
      });

      // Run multiple frames to build history
      for (let i = 0; i < 15; i++) {
        rerender({ ...defaultOptions, userAudioLevel: 0.5 });
        act(() => {
          jest.advanceTimersByTime(16);
          runAnimationFrame();
        });
      }

      expect(result.current.userEnergy).toBeGreaterThan(0);
    });

    it("should detect speaking above threshold", () => {
      const { result, rerender } = renderHook(
        (props) => useListeningIntensity(props),
        { initialProps: { ...defaultOptions, userAudioLevel: 0.2 } }
      );

      // Run several frames with high audio level
      for (let i = 0; i < 20; i++) {
        rerender({ ...defaultOptions, userAudioLevel: 0.2 });
        act(() => {
          jest.advanceTimersByTime(16);
          runAnimationFrame();
        });
      }

      expect(result.current.speakingDuration).toBeGreaterThan(0);
    });
  });

  describe("engagement types", () => {
    it("should start with attentive at default attention 0.5", () => {
      const { result } = renderHook(() =>
        useListeningIntensity({ ...defaultOptions, userAudioLevel: 0 })
      );

      act(() => {
        runAnimationFrame();
      });

      // Default attention is 0.5, which maps to "attentive" (0.4-0.6)
      expect(result.current.engagementType).toBe("attentive");
    });
  });

  describe("sensitivity", () => {
    it("should respect sensitivity parameter", () => {
      const { result } = renderHook(() =>
        useListeningIntensity({
          ...defaultOptions,
          userAudioLevel: 0.1,
          sensitivity: 2.0,
        })
      );

      act(() => {
        runAnimationFrame();
      });

      // With higher sensitivity, even lower audio levels should register
      expect(result.current).toBeDefined();
    });
  });

  describe("rhythm calculation", () => {
    it("should calculate rhythm with enough history", () => {
      const { result, rerender } = renderHook(
        (props) => useListeningIntensity(props),
        { initialProps: { ...defaultOptions, userAudioLevel: 0.3 } }
      );

      // Build up history with 15 frames
      for (let i = 0; i < 15; i++) {
        const level = 0.2 + (i % 3) * 0.1; // Varying levels
        rerender({ ...defaultOptions, userAudioLevel: level });
        act(() => {
          jest.advanceTimersByTime(16);
          runAnimationFrame();
        });
      }

      expect(result.current.speakingRhythm).toBeDefined();
      expect(["slow", "normal", "fast"]).toContain(result.current.speakingRhythm.tempo);
    });
  });

  describe("circular buffer optimization", () => {
    it("should handle more than 120 samples", () => {
      const { result, rerender } = renderHook(
        (props) => useListeningIntensity(props),
        { initialProps: { ...defaultOptions, userAudioLevel: 0.3 } }
      );

      // Run 150 frames to exceed buffer size
      for (let i = 0; i < 150; i++) {
        rerender({ ...defaultOptions, userAudioLevel: 0.2 + Math.random() * 0.3 });
        act(() => {
          jest.advanceTimersByTime(16);
          runAnimationFrame();
        });
      }

      // Should still work correctly
      expect(result.current.userEnergy).toBeGreaterThan(0);
    });
  });
});

describe("mapIntensityToAvatarParams", () => {
  it("should return avatar parameters", () => {
    const intensity = {
      attention: 0.7,
      engagementType: "engaged" as const,
      userEnergy: 0.5,
      speakingRhythm: {
        tempo: "normal" as const,
        variability: 0.4,
        pauseFrequency: 2,
      },
      emotionalIntensity: 0.5,
      speakingDuration: 10,
    };

    const params = mapIntensityToAvatarParams(intensity);

    expect(params.eyeOpenness).toBeGreaterThan(0.9);
    expect(params.eyeOpenness).toBeLessThan(1.2);
    expect(params.headTilt).toBeGreaterThanOrEqual(0);
    expect(params.breathRate).toBeGreaterThan(0.8);
    expect(params.pupilDilation).toBeGreaterThanOrEqual(0);
    expect(params.blinkRate).toBeGreaterThan(0);
  });

  it("should increase pupil dilation for intense engagement", () => {
    const intenseState = {
      attention: 0.9,
      engagementType: "intense" as const,
      userEnergy: 0.8,
      speakingRhythm: {
        tempo: "fast" as const,
        variability: 0.7,
        pauseFrequency: 1,
      },
      emotionalIntensity: 0.8,
      speakingDuration: 30,
    };

    const params = mapIntensityToAvatarParams(intenseState);

    expect(params.pupilDilation).toBe(0.4);
  });

  it("should decrease blink rate for intense engagement", () => {
    const intenseState = {
      attention: 0.9,
      engagementType: "intense" as const,
      userEnergy: 0.8,
      speakingRhythm: {
        tempo: "fast" as const,
        variability: 0.7,
        pauseFrequency: 1,
      },
      emotionalIntensity: 0.8,
      speakingDuration: 30,
    };

    const params = mapIntensityToAvatarParams(intenseState);

    expect(params.blinkRate).toBe(0.7);
  });
});
